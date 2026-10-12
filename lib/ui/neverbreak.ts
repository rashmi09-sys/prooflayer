import type { RunDetail } from "../server/run-detail.ts";
import type { FlowResult } from "../shared/flows.ts";
import { flowCounts } from "../shared/flows.ts";

// Product copy for NeverBreak, derived only from recorded state.

export type Tone = "pass" | "fail" | "warn" | "live" | "neutral";

export interface Headline {
  tone: Tone;
  title: string;
  sub: string;
}

export function headline(d: RunDetail): Headline {
  const nb = d.neverbreak;
  const { run } = d;
  const c = nb ? flowCounts(nb.flows) : null;
  const repair = nb?.repair ?? null;

  if (run.status !== "completed") {
    return { tone: "live", title: run.status === "queued" ? "Waiting to check this change." : `Checking ${c?.total ?? "the"} protected flows…`, sub: run.isRepair ? "Verifying a repair attempt like any other change." : "Every flow that already worked is being checked again." };
  }
  if (run.isRepair && nb?.attemptOf) {
    const n = nb.attemptOf.n;
    return run.verdict === "passed"
      ? { tone: "pass", title: `Repair attempt ${n} works.`, sub: "Every protected flow passed on the repaired version." }
      : { tone: "fail", title: `Repair attempt ${n} didn't fix it.`, sub: c && c.failed ? `${c.failed} protected ${c.failed === 1 ? "flow is" : "flows are"} still broken.` : "A check still fails." };
  }
  if (repair?.status === "succeeded") {
    const won = repair.attempts.find((a) => a.outcome === "passed");
    if (repair.outcome === "repaired") {
      return {
        tone: "pass",
        title: "NeverBreak caught a regression and repaired it.",
        sub: `${won?.strategy === "prepared-fix" ? "The prepared targeted fix" : "A targeted repair"}${won ? ` (attempt ${won.n})` : ""} kept the new feature and passed every protected flow on its own branch. Review before merging.`,
      };
    }
    return {
      tone: "warn",
      title: "Rolled back. Previous working version preserved.",
      sub: `${won?.strategy === "roll-back" ? "Rolling back the change" : "Restoring the code the change touched"}${won ? ` (attempt ${won.n})` : ""} made every protected flow pass on its own branch, but the change's new feature is not included.`,
    };
  }
  if (repair?.status === "running") return { tone: "live", title: "NeverBreak caught a regression. Repairing…", sub: "Each attempt is verified before anything is called fixed." };
  if (repair?.status === "failed") return { tone: "fail", title: "NeverBreak caught a regression. Repair didn't fix it.", sub: repair.summary ?? "Stopped after the allowed attempts." };
  if (repair?.status === "stopped") return { tone: "warn", title: "NeverBreak caught a regression. Repair stopped.", sub: repair.summary ?? "" };
  if (run.verdict === "passed") return { tone: "pass", title: c?.total ? "Everything that worked still works." : "All checks passed.", sub: c?.total ? `All ${c.total} protected flows passed on this change.` : "Every required check exited 0." };
  if (run.verdict === "failed") {
    if (c && c.failed) return { tone: "fail", title: "NeverBreak caught a regression before release.", sub: `This change broke ${c.failed} of ${c.total} protected ${c.total === 1 ? "flow" : "flows"}.` };
    return { tone: "fail", title: "This change fails a health check.", sub: "Protected flows still work, but a required check failed." };
  }
  if (run.verdict === "incomplete") return { tone: "warn", title: "This change couldn't be checked.", sub: "The verification environment failed, so nothing was judged." };
  return { tone: "neutral", title: "The check was cancelled.", sub: "Nothing was judged." };
}

/** The flow that best shows what broke: a failed flow with recorded values first. */
export function primaryFailure(flows: FlowResult[]): FlowResult | null {
  return flows.find((f) => f.state === "failed" && f.expected) ?? flows.find((f) => f.state === "failed" || f.state === "missing") ?? null;
}

export function shortSha(sha: string) {
  return sha.slice(0, 7);
}
