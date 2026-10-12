import { config } from "./config.ts";
import type { DatabaseSync } from "node:sqlite";
import { getDb, newId } from "./db.ts";
import { getArtifacts, getChecks, getEvidence, lastPassedRun, type ProjectRecord } from "./store.ts";
import { providerFor, type CommitDiff } from "./providers.ts";
import { isTestPath, journeyOutcomes, passingTests, testBody, type ProtectedFlow } from "../shared/flows.ts";
import { projectMeta } from "../projects-meta.ts";
import type { RunRecord } from "../shared/types.ts";

// NeverBreak storage: protected flows, the auto-repair setting, and the
// facts about a change (files, edited tests) that the views need.

type Row = Record<string, unknown>;

function mapFlow(r: Row): ProtectedFlow {
  return {
    id: String(r.id),
    key: String(r.key),
    name: String(r.name),
    why: String(r.why),
    kind: r.kind as ProtectedFlow["kind"],
    testName: r.test_name === null ? null : String(r.test_name),
    journeyId: r.journey_id === null || r.journey_id === undefined ? null : String(r.journey_id),
    learnedFromRunId: r.learned_from_run_id === null ? null : String(r.learned_from_run_id),
    learnedCommitSha: String(r.learned_commit_sha),
    position: Number(r.position),
  };
}

export function listFlows(projectId: string, db: DatabaseSync = getDb()): ProtectedFlow[] {
  return (db.prepare("SELECT * FROM protected_flows WHERE project_id = ? ORDER BY position, created_at").all(projectId) as Row[]).map(mapFlow);
}

function sentence(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * Learn protected flows from a passing run: every leaf test the runner
 * reported as passing, plus the built page opening in Chromium if it did.
 * Adds what is missing and never removes a flow.
 */
export function learnFlows(project: ProjectRecord, run: RunRecord, db: DatabaseSync = getDb()): { added: number } {
  if (run.verdict !== "passed" || run.isRepair) return { added: 0 };
  const meta = projectMeta(project.slug);
  const checks = getChecks(run.id, db);
  const evidence = getEvidence(run.id, db);
  const test = checks.find((c) => c.key === "test");
  const snap = checks.find((c) => c.key === "snapshot");
  const names = test ? passingTests(evidence.find((e) => e.checkId === test.id)?.content ?? "") : [];
  const journeys = journeyOutcomes(getArtifacts(run.id, db)).filter((j) => j.ok);
  const existing = new Set(listFlows(project.id, db).map((f) => f.key));
  let position = existing.size;
  let added = 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO protected_flows (id, project_id, key, name, why, kind, test_name, journey_id, learned_from_run_id, learned_commit_sha, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  type Candidate = { key: string; name: string; why: string; kind: "test" | "page" | "journey"; testName: string | null; journeyId: string | null; order: number };
  const candidates: Candidate[] = [];
  if (snap?.status === "passed") {
    candidates.push({ key: "page:/", name: meta.pageFlow?.name ?? "The app's home page opens", why: meta.pageFlow?.why ?? "Built and opened in a real browser.", kind: "page", testName: null, journeyId: null, order: -1 });
  }
  const copyOrder = Object.keys(meta.flowCopy ?? {});
  const linked = new Set<string>();
  for (const t of names) {
    const copy = meta.flowCopy?.[t];
    const i = copyOrder.indexOf(t);
    // A browser journey that passed in the same run also guards this flow.
    const journeyId = copy?.journey && journeys.some((j) => j.id === copy.journey) ? copy.journey : null;
    if (journeyId) linked.add(journeyId);
    candidates.push({ key: `test:${t}`, name: copy?.name ?? sentence(t), why: copy?.why ?? `Covered by the test “${t}”.`, kind: "test", testName: t, journeyId, order: i < 0 ? 100 + candidates.length : i });
  }
  for (const j of journeys) {
    if (linked.has(j.id)) continue;
    candidates.push({ key: `journey:${j.id}`, name: `${j.name} in the browser`, why: `Reached “${j.expected}” in Chromium.`, kind: "journey", testName: null, journeyId: j.id, order: 200 });
  }
  candidates.sort((a, b) => a.order - b.order);
  for (const c of candidates) {
    if (existing.has(c.key)) continue;
    insert.run(newId("flow"), project.id, c.key, c.name, c.why, c.kind, c.testName, c.journeyId, run.id, run.commitSha, position++);
    added++;
  }
  return { added };
}

/** Flows for a project, learned from the last passing run the first time they are needed. */
export function ensureFlows(userId: string, project: ProjectRecord): ProtectedFlow[] {
  const flows = listFlows(project.id);
  if (flows.length || config.publicDemo) return flows; // the public demo's snapshot is read-only and already holds its flows
  const passed = lastPassedRun(userId, project.id);
  if (passed) learnFlows(project, passed);
  return listFlows(project.id);
}

export function relearnFlows(userId: string, project: ProjectRecord): { added: number; fromRunId: string | null } {
  const passed = lastPassedRun(userId, project.id);
  if (!passed) return { added: 0, fromRunId: null };
  return { ...learnFlows(project, passed), fromRunId: passed.id };
}

export function getAutoRepair(projectId: string, db: DatabaseSync = getDb()): boolean {
  const r = db.prepare("SELECT auto_repair FROM project_settings WHERE project_id = ?").get(projectId) as Row | undefined;
  return Number(r?.auto_repair ?? 0) === 1;
}

export function setAutoRepair(projectId: string, on: boolean, db: DatabaseSync = getDb()): void {
  db.prepare(
    "INSERT INTO project_settings (project_id, auto_repair) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET auto_repair = excluded.auto_repair",
  ).run(projectId, on ? 1 : 0);
}

// ------------------------------------------------------- change facts

const diffCache = new Map<string, { at: number; value: CommitDiff }>();

/** Files changed between two commits, cached briefly so polling stays cheap. */
export async function changeBetween(project: ProjectRecord, base: string, head: string): Promise<CommitDiff | null> {
  if (base === head) return { base, head, files: [], truncated: false };
  const key = `${project.id}:${base}:${head}`;
  const hit = diffCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  try {
    const value = await providerFor(project).diff(base, head);
    diffCache.set(key, { at: Date.now(), value });
    if (diffCache.size > 200) diffCache.delete(diffCache.keys().next().value!);
    return value;
  } catch {
    return null;
  }
}

/** Names of protected tests whose body changed between two commits. */
export async function editedProtectedTests(project: ProjectRecord, flows: ProtectedFlow[], diff: CommitDiff): Promise<string[]> {
  const names = flows.filter((f) => f.kind === "test" && f.testName).map((f) => f.testName!);
  const testFiles = diff.files.filter((f) => isTestPath(f.path)).map((f) => f.path);
  if (!names.length || !testFiles.length) return [];
  const provider = providerFor(project);
  const edited: string[] = [];
  for (const file of testFiles) {
    const [before, after] = await Promise.all([provider.readFile(diff.base, file), provider.readFile(diff.head, file)]);
    for (const n of names) {
      const a = before ? testBody(before, n) : null;
      const b = after ? testBody(after, n) : null;
      if (a !== null && b !== null && a !== b && !edited.includes(n)) edited.push(n);
    }
  }
  return edited;
}
