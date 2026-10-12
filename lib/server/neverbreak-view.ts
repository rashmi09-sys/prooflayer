import type { RunDetail } from "./run-detail.ts";
import { getProjectById, getRunInternal } from "./store.ts";
import { changeBetween, editedProtectedTests, ensureFlows, getAutoRepair } from "./neverbreak.ts";
import { baselineFor, getAttemptForRun, getRepairForSource, repairAvailability, type Availability, type RepairView } from "./repair.ts";
import { flowResults, type FlowResult } from "../shared/flows.ts";

export interface NeverBreakView {
  flows: FlowResult[];
  /** The passing run the flows were learned from. */
  learned: { runId: string | null; commitSha: string } | null;
  /** The last passing version before this run: what "already worked". */
  baseline: { runId: string; commitSha: string; commitMessage: string | null } | null;
  changedFiles: Array<{ path: string; additions: number; deletions: number }> | null;
  repair: RepairView | null;
  attemptOf: { repair: RepairView; n: number; source: { id: string; commitSha: string; commitMessage: string | null } } | null;
  availability: Availability;
  autoRepair: boolean;
}

/** NeverBreak's reading of a run. Everything here comes from recorded runs and git. */
export async function loadNeverBreak(userId: string, detail: RunDetail): Promise<NeverBreakView | null> {
  const { run } = detail;
  const project = getProjectById(run.projectId);
  if (!project || project.ownerId !== userId) return null;
  const flows = ensureFlows(userId, project);

  const attempt = run.isRepair ? getAttemptForRun(run.id) : null;
  const sourceRun = attempt ? getRunInternal(attempt.repair.sourceRunId) : run;
  const base = sourceRun ? baselineFor(sourceRun) : null;
  const diff = base ? await changeBetween(project, base.commitSha, run.commitSha) : null;
  const edited = diff ? await editedProtectedTests(project, flows, diff).catch(() => []) : [];

  return {
    flows: flowResults(flows, detail.checks, detail.evidence, detail.proofs, detail.artifacts, edited),
    learned: flows[0] ? { runId: flows[0].learnedFromRunId, commitSha: flows[0].learnedCommitSha } : null,
    baseline: base ? { runId: base.id, commitSha: base.commitSha, commitMessage: base.commitMessage } : null,
    changedFiles: diff ? diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })) : null,
    repair: run.isRepair ? null : getRepairForSource(run.id),
    attemptOf:
      attempt && sourceRun
        ? { repair: attempt.repair, n: attempt.n, source: { id: sourceRun.id, commitSha: sourceRun.commitSha, commitMessage: sourceRun.commitMessage } }
        : null,
    availability: repairAvailability(run, project),
    autoRepair: getAutoRepair(project.id),
  };
}
