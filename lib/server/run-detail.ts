import { getDb } from "./db.ts";
import {
  getChecks,
  getEvents,
  getEvidence,
  getArtifacts,
  getExcerpts,
  getExplanations,
  getProjectById,
  getRunForUser,
  lastPassedRun,
} from "./store.ts";
import { systemHealth, type SystemHealth } from "./health.ts";
import { providerFor } from "./providers.ts";
import { extractFacts, type SourceLocation } from "../shared/facts.ts";
import type { AiExplanation, CheckRecord, EvidenceRecord, RunArtifact, RunEvent, RunRecord } from "../shared/types.ts";
import { buildProofs, type Proof, type SourceExcerpt } from "../shared/proof.ts";
import { compareRuns, type ComparisonKind } from "../shared/compare.ts";
import type { NeverBreakView } from "./neverbreak-view.ts";

export interface RunDetail {
  run: RunRecord;
  checks: CheckRecord[];
  evidence: EvidenceRecord[];
  events: RunEvent[];
  explanations: AiExplanation[];
  /** Parsed source locations per check id, with links when the repo is browsable. */
  locations: Record<string, Array<SourceLocation & { url: string | null }>>;
  /** Most recent Passed run on this project, from recorded evidence only. */
  lastPassed: Pick<RunRecord, "id" | "commitSha" | "commitMessage" | "finishedAt" | "branch"> | null;
  /** The completed run immediately before this one, for one-click comparison. */
  previousRunId: string | null;
  health: SystemHealth;
  /** Structured failures parsed from recorded output, primary first. */
  proofs: Proof[];
  /** Source lines from the commit at each parsed failure location. */
  excerpts: SourceExcerpt[];
  /** Screenshots captured by the optional browser snapshot step. */
  artifacts: RunArtifact[];
  /** Required checks whose outcome changed since the last passing run on record. */
  sinceLastPassed: Array<{ name: string; kind: ComparisonKind }>;
  /** NeverBreak's reading: protected flows, the change, and any repair. */
  neverbreak?: NeverBreakView | null;
  /** "public": the read-only demo. Raw logs are withheld and nothing can be started. */
  access?: "operator" | "public";
  /** Set when this run was imported from a recorded demonstration package. */
  recordedImport?: { recordedIn: string; exportedAt: string; importedAt: string } | null;
}

export function loadRunDetail(userId: string, runId: string): RunDetail | null {
  const run = getRunForUser(userId, runId);
  if (!run) return null;
  const checks = getChecks(runId);
  const evidence = getEvidence(runId);
  const project = getProjectById(run.projectId);

  const locations: RunDetail["locations"] = {};
  let provider: ReturnType<typeof providerFor> | null = null;
  try {
    provider = project ? providerFor(project) : null;
  } catch {
    provider = null;
  }
  for (const c of checks) {
    if (c.status !== "failed") continue;
    const ev = evidence.find((e) => e.checkId === c.id);
    if (!ev) continue;
    locations[c.id] = extractFacts(c.key, ev.content, c.exitCode)
      .locations.slice(0, 20)
      .map((l) => ({ ...l, url: provider?.fileUrl(run.commitSha, l.file, l.line) ?? null }));
  }

  const passed = lastPassedRun(userId, run.projectId);
  const prev = getDb()
    .prepare(
      `SELECT id FROM verification_runs WHERE project_id = ? AND status = 'completed' AND created_at < ?
         AND branch NOT LIKE 'neverbreak/%'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(run.projectId, run.createdAt) as { id: string } | undefined;

  return {
    run,
    checks,
    evidence,
    events: getEvents(runId),
    explanations: getExplanations(runId),
    locations,
    lastPassed: passed
      ? { id: passed.id, commitSha: passed.commitSha, commitMessage: passed.commitMessage, finishedAt: passed.finishedAt, branch: passed.branch }
      : null,
    previousRunId: prev?.id ?? null,
    health: systemHealth(),
    proofs: buildProofs(checks, evidence),
    excerpts: getExcerpts(runId),
    artifacts: getArtifacts(runId),
    sinceLastPassed:
      passed && passed.id !== run.id && run.status === "completed"
        ? compareRuns(getChecks(passed.id), checks)
            .filter((c) => c.kind !== "unchanged_pass")
            .map((c) => ({ name: c.name, kind: c.kind }))
        : [],
  };
}

/** Run detail plus NeverBreak's reading of it, for pages and the polling API. */
export async function loadRunView(userId: string, runId: string): Promise<RunDetail | null> {
  const detail = loadRunDetail(userId, runId);
  if (!detail) return null;
  const { loadNeverBreak } = await import("./neverbreak-view.ts");
  return { ...detail, neverbreak: await loadNeverBreak(userId, detail) };
}

/**
 * The run as a viewer may see it. Public visitors get the recorded result,
 * proofs, frames and summaries, but never raw execution logs or server
 * configuration, and the payload says so.
 */
export async function loadRunViewFor(v: import("./viewer.ts").Viewer, runId: string): Promise<RunDetail | null> {
  const { viewerRun } = await import("./viewer.ts");
  if (!viewerRun(v, runId)) return null;
  const loaded = await loadRunView(v.userId, runId);
  if (!loaded) return null;
  const { getRecordedImport } = await import("./store.ts");
  const imp = getRecordedImport(runId);
  const detail: RunDetail = { ...loaded, recordedImport: imp ? { recordedIn: imp.recordedIn, exportedAt: imp.exportedAt, importedAt: imp.importedAt } : null };
  if (v.operator) return { ...detail, access: "operator" };
  return redactForPublic(detail);
}

export const PRIVATE_LOG = "Execution logs are private in the public demo. Step summaries, exit codes and proofs above are from this recorded run.";

/**
 * What a public visitor may see of a run. Raw output never leaves the server:
 * evidence content is replaced, the fallback "last lines of output" proof is
 * replaced, and AI explanations (which may quote output) are omitted. Parsed
 * proofs (test assertions, compiler and linter findings) remain: they are the
 * sanitized evidence the demo is built on.
 */
export function redactForPublic(detail: RunDetail): RunDetail {
  return {
    ...detail,
    access: "public",
    evidence: detail.evidence.map((e) => ({ ...e, content: PRIVATE_LOG })),
    proofs: detail.proofs.map((p) => (p.kind === "output" ? { ...p, tail: [PRIVATE_LOG] } : p)),
    explanations: [],
    health: {
      worker: { online: false, lastSeen: null, currentRun: null, sandboxImage: null },
      ai: { configured: false, model: "" },
      github: { repository: null, authenticated: false },
    },
  };
}
