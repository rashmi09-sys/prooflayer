import { workerOnline } from "./health.ts";
import type { DatabaseSync } from "node:sqlite";
import { getDb, newId, now } from "./db.ts";
import { addEvent, createRun, getArtifacts, getChecks, getEvidence, getProjectById, getRunInternal, getRunRequest, REPAIR_BRANCH_PREFIX, type ProjectRecord } from "./store.ts";
import { providerFor } from "./providers.ts";
import { changeBetween, getAutoRepair, listFlows } from "./neverbreak.ts";
import { isTestPath, newChecks } from "../shared/flows.ts";
import type { RunRecord, Verdict } from "../shared/types.ts";

// NeverBreak safe repair.
//
// Narrow on purpose. When a change breaks a protected flow, NeverBreak may
// try at most two repairs, each a real commit on its own neverbreak/* branch
// that is verified by a normal run:
//
//   1a. prepared-fix   A targeted candidate patch prepared in advance for this
//                      exact commit (a prepared-fixes/* branch on top of it).
//                      Labelled as prepared everywhere; never as generated.
//   1b. restore-source Otherwise: put back the application code the change
//                      touched, as it was in the last passing version.
//   2.  roll-back      Put back every file the change touched, so the code
//                      matches the last passing version again.
//
// A passing attempt is only called "repaired" if the change's own new checks
// (its feature) still pass too; otherwise it is a roll-back, and says so.
// It stops at the first passing attempt, after two attempts, or as soon as an
// attempt can't be verified. It never edits the project's own branches,
// never pushes anywhere, and never uses a language model.

export type RepairStrategy = "prepared-fix" | "restore-source" | "roll-back";
export type RepairStatus = "running" | "succeeded" | "failed" | "stopped";

export const MAX_ATTEMPTS = 2;

export const STRATEGY_COPY: Record<RepairStrategy, { title: string; short: string }> = {
  "prepared-fix": { title: "Apply the prepared targeted fix", short: "A candidate patch written in advance for this change. NeverBreak applies it in isolation and verifies it." },
  "restore-source": { title: "Restore the code the change touched", short: "Keep the change's other edits; put the app code back as it was when every flow passed." },
  "roll-back": { title: "Roll back the whole change", short: "Put every file the change touched back to the last passing version." },
};

export interface RepairAttemptView {
  n: number;
  strategy: RepairStrategy;
  files: string[];
  /** prepared-fix: where the candidate patch came from. */
  sourceRef: string | null;
  branch: string;
  commitSha: string;
  runId: string | null;
  run: Pick<RunRecord, "id" | "status" | "verdict" | "startedAt" | "finishedAt" | "durationMs"> | null;
  outcome: Verdict | null;
}

export interface RepairView {
  id: string;
  sourceRunId: string;
  baseRunId: string;
  baseCommitSha: string;
  trigger: "manual" | "automatic";
  status: RepairStatus;
  /** How a successful repair got there. */
  outcome: "repaired" | "rolled-back" | null;
  summary: string | null;
  createdAt: string;
  finishedAt: string | null;
  attempts: RepairAttemptView[];
}

type Row = Record<string, unknown>;

export interface AttemptPlan {
  strategy: RepairStrategy;
  files: string[];
  /** prepared-fix: restore these files from this commit instead of the baseline. */
  from?: { ref: string; sha: string; message: string };
}

/** The plan for each attempt, from the files a change touched. Pure, so it can be tested. */
export function planAttempts(changed: string[], prepared?: { ref: string; sha: string; message: string; files: string[] } | null): AttemptPlan[] {
  const all = [...new Set(changed)].sort();
  const source = all.filter((p) => !isTestPath(p));
  const plans: AttemptPlan[] = [];
  if (prepared) plans.push({ strategy: "prepared-fix", files: [...prepared.files].sort(), from: { ref: prepared.ref, sha: prepared.sha, message: prepared.message } });
  else if (source.length) plans.push({ strategy: "restore-source", files: source });
  if (all.length && (prepared || all.length !== source.length)) plans.push({ strategy: "roll-back", files: all });
  return plans.slice(0, MAX_ATTEMPTS);
}

async function plansFor(project: ProjectRecord, base: RunRecord, source: RunRecord): Promise<AttemptPlan[]> {
  const diff = await changeBetween(project, base.commitSha, source.commitSha);
  const provider = providerFor(project);
  const prepared = provider.preparedFixes ? ((await provider.preparedFixes(source.commitSha).catch(() => []))[0] ?? null) : null;
  return planAttempts(diff?.files.map((f) => f.path) ?? [], prepared);
}

/** The last passing (non-repair) run recorded before this one. */
export function baselineFor(run: RunRecord, db: DatabaseSync = getDb()): RunRecord | null {
  const r = db
    .prepare(
      `SELECT id FROM verification_runs WHERE project_id = ? AND verdict = 'passed' AND branch NOT LIKE 'neverbreak/%'
         AND created_at < ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(run.projectId, run.createdAt) as Row | undefined;
  return r ? getRunInternal(String(r.id), db) : null;
}

export interface Availability {
  ok: boolean;
  reason: string;
}

export function repairAvailability(run: RunRecord, project: ProjectRecord | null, db: DatabaseSync = getDb()): Availability {
  if (run.sample) return { ok: false, reason: "Sample runs can't be repaired." };
  if (run.isRepair) return { ok: false, reason: "This run is itself a repair attempt." };
  if (run.status !== "completed") return { ok: false, reason: "Waiting for the verdict." };
  if (run.verdict !== "failed") return { ok: false, reason: run.verdict === "passed" ? "Nothing to repair." : "The run didn't finish, so the code wasn't judged." };
  if (getRunRequest(run.id, db)?.protection === "off") return { ok: false, reason: "This change was requested with NeverBreak protection off, so no repair is attempted." };
  if (!project || project.connection.provider !== "local") return { ok: false, reason: "Repair needs a repository NeverBreak can write a branch to. Only the demo repository supports this today." };
  if (!baselineFor(run, db)) return { ok: false, reason: "There's no earlier passing version to repair towards." };
  if (!workerOnline()) return { ok: false, reason: "The verification worker isn't running, so a repair couldn't be verified." };
  return { ok: true, reason: "Up to two attempts, each verified like any other change." };
}

export function getRepairForSource(sourceRunId: string, db: DatabaseSync = getDb()): RepairView | null {
  const r = db.prepare("SELECT * FROM repairs WHERE source_run_id = ?").get(sourceRunId) as Row | undefined;
  return r ? viewOf(r, db) : null;
}

export function getAttemptForRun(runId: string, db: DatabaseSync = getDb()): { repair: RepairView; n: number } | null {
  const a = db.prepare("SELECT repair_id, n FROM repair_attempts WHERE run_id = ?").get(runId) as Row | undefined;
  if (!a) return null;
  const r = db.prepare("SELECT * FROM repairs WHERE id = ?").get(String(a.repair_id)) as Row | undefined;
  return r ? { repair: viewOf(r, db), n: Number(a.n) } : null;
}

function viewOf(r: Row, db: DatabaseSync): RepairView {
  const base = getRunInternal(String(r.base_run_id), db);
  const attempts = (db.prepare("SELECT * FROM repair_attempts WHERE repair_id = ? ORDER BY n").all(String(r.id)) as Row[]).map((a): RepairAttemptView => {
    const run = a.run_id ? getRunInternal(String(a.run_id), db) : null;
    return {
      n: Number(a.n),
      strategy: a.strategy as RepairStrategy,
      files: JSON.parse(String(a.files)) as string[],
      sourceRef: a.source_ref ? String(a.source_ref) : null,
      branch: String(a.branch),
      commitSha: String(a.commit_sha),
      runId: a.run_id ? String(a.run_id) : null,
      run: run ? { id: run.id, status: run.status, verdict: run.verdict, startedAt: run.startedAt, finishedAt: run.finishedAt, durationMs: run.durationMs } : null,
      outcome: (a.outcome as Verdict | null) ?? null,
    };
  });
  return {
    id: String(r.id),
    sourceRunId: String(r.source_run_id),
    baseRunId: String(r.base_run_id),
    baseCommitSha: base?.commitSha ?? "",
    trigger: r.trigger as RepairView["trigger"],
    status: r.status as RepairStatus,
    outcome: (r.outcome as RepairView["outcome"]) ?? null,
    summary: r.summary === null ? null : String(r.summary),
    createdAt: String(r.created_at),
    finishedAt: r.finished_at === null ? null : String(r.finished_at),
    attempts,
  };
}

/** Start a repair for a failed run. Returns the existing repair if there is one. */
export async function startRepair(sourceRunId: string, trigger: "manual" | "automatic", db: DatabaseSync = getDb()): Promise<{ ok: true; repairId: string } | { ok: false; reason: string }> {
  const existing = getRepairForSource(sourceRunId, db);
  if (existing) return { ok: true, repairId: existing.id };
  const run = getRunInternal(sourceRunId, db);
  if (!run) return { ok: false, reason: "Run not found." };
  const project = getProjectById(run.projectId, db);
  const avail = repairAvailability(run, project, db);
  if (!avail.ok || !project) return { ok: false, reason: avail.reason };
  const base = baselineFor(run, db)!;
  const plans = await plansFor(project, base, run);
  if (!plans.length) return { ok: false, reason: "The change has no file differences to repair." };

  const id = newId("rep");
  try {
    db.prepare("INSERT INTO repairs (id, project_id, source_run_id, base_run_id, trigger, status) VALUES (?, ?, ?, ?, ?, 'running')").run(id, project.id, run.id, base.id, trigger);
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      const again = getRepairForSource(sourceRunId, db);
      if (again) return { ok: true, repairId: again.id };
    }
    throw e;
  }
  addEvent(run.id, "info", `NeverBreak repair started (${trigger}). Baseline: last passing version ${base.commitSha.slice(0, 7)}.`, db);
  await queueAttempt(id, 1, plans[0], run, base, project, db);
  return { ok: true, repairId: id };
}

async function queueAttempt(
  repairId: string,
  n: number,
  plan: AttemptPlan,
  source: RunRecord,
  base: RunRecord,
  project: ProjectRecord,
  db: DatabaseSync,
) {
  const branch = `${REPAIR_BRANCH_PREFIX}repair-${repairId.replace(/^rep_/, "")}-${n}`;
  const from = plan.from?.sha ?? base.commitSha;
  const message =
    plan.strategy === "prepared-fix"
      ? `NeverBreak repair ${n} of ${MAX_ATTEMPTS}: prepared targeted fix for ${plan.files.join(", ")}\n\nApplies “${plan.from!.message}” from ${plan.from!.ref} (${plan.from!.sha.slice(0, 7)}). Written in advance for this demo, not generated.`
      : `NeverBreak repair ${n} of ${MAX_ATTEMPTS}: ${STRATEGY_COPY[plan.strategy].title.toLowerCase()} (${plan.files.join(", ")}) from ${base.commitSha.slice(0, 7)}`;
  const provider = providerFor(project);
  if (!provider.createRestoreCommit) throw new Error("This repository can't take repair commits.");
  const sha = await provider.createRestoreCommit({ head: source.commitSha, base: from, paths: plan.files, message, branch });
  const attemptId = newId("att");
  db.prepare("INSERT INTO repair_attempts (id, repair_id, n, strategy, files, source_ref, branch, commit_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    attemptId,
    repairId,
    n,
    plan.strategy,
    JSON.stringify(plan.files),
    plan.from ? `${plan.from.ref}@${plan.from.sha.slice(0, 7)}` : null,
    branch,
    sha,
  );
  const created = createRun(
    {
      userId: project.ownerId,
      project,
      branch,
      commitSha: sha,
      commitMessage: message.split("\n")[0],
      commitAuthor: "NeverBreak",
      commitDate: now(),
    },
    db,
  );
  db.prepare("UPDATE repair_attempts SET run_id = ? WHERE id = ?").run(created.runId, attemptId);
  addEvent(source.id, "info", `Repair attempt ${n}: ${STRATEGY_COPY[plan.strategy].title.toLowerCase()}. Commit ${sha.slice(0, 7)} on ${branch}, verifying as ${created.runId}.`, db);
}

function finish(repairId: string, status: RepairStatus, summary: string, sourceRunId: string, db: DatabaseSync, outcome: "repaired" | "rolled-back" | null = null) {
  db.prepare("UPDATE repairs SET status = ?, outcome = ?, summary = ?, finished_at = ? WHERE id = ? AND status = 'running'").run(status, outcome, summary, now(), repairId);
  addEvent(sourceRunId, status === "succeeded" ? "info" : "warn", `NeverBreak repair ${status}: ${summary}`, db);
}

/**
 * Called by the worker after every run. Advances a repair whose attempt just
 * finished, or starts one when automatic repair is on.
 */
export async function afterRunFinished(runId: string, db: DatabaseSync = getDb()): Promise<void> {
  const run = getRunInternal(runId, db);
  if (!run || run.status !== "completed") return;
  const att = getAttemptForRun(runId, db);
  if (att) {
    db.prepare("UPDATE repair_attempts SET outcome = ? WHERE run_id = ?").run(run.verdict, runId);
    const { repair, n } = att;
    if (repair.status !== "running") return;
    const source = getRunInternal(repair.sourceRunId, db);
    const base = getRunInternal(repair.baseRunId, db);
    const project = source ? getProjectById(source.projectId, db) : null;
    if (!source || !base || !project) return finish(repair.id, "stopped", "The original run or its baseline is gone.", repair.sourceRunId, db);
    if (run.verdict === "passed") {
      const a = repair.attempts.find((x) => x.n === n)!;
      // Did the change's own feature survive? Compare its new checks in both runs.
      const flows = listFlows(project.id, db);
      const before = newChecks(flows, getEvidence(source.id, db), getChecks(source.id, db), getArtifacts(source.id, db));
      const after = newChecks(flows, getEvidence(run.id, db), getChecks(run.id, db), getArtifacts(run.id, db));
      const lost = before.filter((c) => c.ok && !after.some((x) => x.key === c.key && x.ok));
      const kept = a.strategy !== "roll-back" && lost.length === 0;
      return finish(
        repair.id,
        "succeeded",
        kept
          ? a.strategy === "prepared-fix"
            ? `Attempt ${n} passed with the prepared targeted fix. Every protected flow works, and the change's ${before.length} new ${before.length === 1 ? "check passes" : "checks pass"} too.`
            : `Attempt ${n} passed by restoring ${a.files.join(", ")}. Every protected flow works${before.length ? ", and the change's new checks still pass" : ""}.`
          : a.strategy === "roll-back"
            ? `Attempt ${n} passed by rolling back the change. The previous working version is preserved; the change itself is not included.`
            : `Attempt ${n} passed, but ${lost.length} of the change's new checks no longer pass, so this is a roll-back of the feature, not a repair.`,
        source.id,
        db,
        kept ? "repaired" : "rolled-back",
      );
    }
    if (run.verdict !== "failed") return finish(repair.id, "stopped", `Attempt ${n} couldn't be verified (${run.verdict}). Stopped without retrying.`, source.id, db);
    const plans = await plansFor(project, base, source);
    if (n >= MAX_ATTEMPTS || !plans[n]) {
      return finish(repair.id, "failed", `Still failing after ${n} ${n === 1 ? "attempt" : "attempts"}. Stopped; the evidence from each attempt is kept.`, source.id, db);
    }
    await queueAttempt(repair.id, n + 1, plans[n], source, base, project, db);
    return;
  }
  if (run.verdict === "failed" && !run.isRepair && getAutoRepair(run.projectId, db)) {
    await startRepair(run.id, "automatic", db);
  }
}
