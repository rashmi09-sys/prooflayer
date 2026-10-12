import type { CheckRecord, Verdict } from "./types.ts";

export interface VerdictDecision {
  verdict: Verdict;
  /** A factual sentence built only from recorded check outcomes. */
  reason: string;
}

type VerdictInput = Pick<CheckRecord, "name" | "required" | "status" | "failureClass" | "exitCode">;

/**
 * Decide a run's verdict from recorded check outcomes.
 *
 * - cancelled:  the user cancelled the run.
 * - failed:     at least one required check executed and failed because of the code.
 * - incomplete: no code failure, but a required check could not run or finish
 *               (infrastructure error, timeout, resource limit, skipped).
 * - passed:     every required check executed and exited 0.
 *
 * This function is the only place verdicts are decided. AI explanations
 * never feed into it.
 */
export function decideVerdict(checks: VerdictInput[], cancelled: boolean): VerdictDecision {
  const required = checks.filter((c) => c.required);

  if (cancelled) {
    const done = required.filter((c) => c.status === "passed" || c.status === "failed").length;
    const alreadyFailed = required.filter((c) => c.status === "failed" && c.failureClass === "code").map((c) => c.name);
    return {
      verdict: "cancelled",
      reason:
        `Cancelled by the user after ${done} of ${required.length} required checks finished.` +
        (alreadyFailed.length ? ` ${listNames(alreadyFailed)} had already failed.` : ""),
    };
  }

  if (required.length === 0) {
    return { verdict: "incomplete", reason: "No required checks are configured for this project." };
  }

  const codeFailures = required.filter((c) => c.status === "failed" && c.failureClass === "code");
  const couldNotRun = required.filter(
    (c) => !(c.status === "passed" || (c.status === "failed" && c.failureClass === "code")),
  );

  if (codeFailures.length > 0) {
    const names = listNames(codeFailures.map((c) => c.name));
    const exit = codeFailures.length === 1 && codeFailures[0].exitCode !== null
      ? ` with exit code ${codeFailures[0].exitCode}`
      : "";
    const extra = couldNotRun.length > 0
      ? ` ${couldNotRun.length} other required ${couldNotRun.length === 1 ? "check" : "checks"} could not run.`
      : "";
    return { verdict: "failed", reason: `${names} failed${exit}.${extra}` };
  }

  if (couldNotRun.length > 0) {
    const first = couldNotRun[0];
    const why =
      first.failureClass === "timeout"
        ? "exceeded its time limit"
        : first.failureClass === "resource_limit"
          ? "hit a sandbox resource limit"
          : first.failureClass === "infrastructure"
            ? "hit an execution environment error"
            : first.status === "skipped"
              ? "was skipped because an earlier step could not complete"
              : "did not finish";
    const more = couldNotRun.length > 1 ? ` (${couldNotRun.length} required checks affected)` : "";
    return {
      verdict: "incomplete",
      reason: `${first.name} ${why}${more}. This is not evidence that the code is broken.`,
    };
  }

  return {
    verdict: "passed",
    reason: `All ${required.length} required checks ran and exited with code 0.`,
  };
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
