import type { Proof } from "./proof.ts";
import type { CheckRecord, RunArtifact, Verdict } from "./types.ts";

// A plain-language outcome built only from recorded evidence. Each result
// names its basis so the interface can say where the sentence came from.

export interface Outcome {
  headline: string;
  basis: "page-text" | "test-runner" | "compiler" | "linter" | "exit-codes";
}

export function describeOutcome(
  verdict: Verdict | null,
  proofs: Proof[],
  artifacts: RunArtifact[],
  checks: CheckRecord[],
): Outcome | null {
  if (!verdict) return null;
  const required = checks.filter((c) => c.required);
  if (verdict === "passed") return { headline: `All ${required.length} checks passed on this commit.`, basis: "exit-codes" };
  if (verdict === "incomplete") return { headline: "Verification couldn't finish, so the code wasn't judged.", basis: "exit-codes" };
  if (verdict === "cancelled") return { headline: "The run was cancelled before it finished.", basis: "exit-codes" };

  const p = proofs[0];
  if (p?.kind === "assertion") {
    const a = p.items[0];
    const onPage = artifacts.flatMap((x) => x.annotations?.matches ?? []).find((m) => m.role === "received" && m.found && m.text);
    if (onPage?.text && a.actual) {
      const label = labelFor(onPage.text, a.actual);
      if (label) return { headline: `The ${label} is wrong.`, basis: "page-text" };
      return { headline: `The page shows ${a.actual}, but the test expected ${a.expected}.`, basis: "page-text" };
    }
    return { headline: `“${a.name}” gives the wrong result.`, basis: "test-runner" };
  }
  if (p?.kind === "type") {
    const t = p.items[0];
    if (t.receivedType && t.expectedType) return { headline: `The code passes a ${t.receivedType} where a ${t.expectedType} is required.`, basis: "compiler" };
    return { headline: "The code doesn't type-check.", basis: "compiler" };
  }
  if (p?.kind === "lint") {
    const n = p.items.length;
    return { headline: `The code breaks ${n} lint ${n === 1 ? "rule" : "rules"}.`, basis: "linter" };
  }
  const failed = required.find((c) => c.status === "failed");
  return { headline: failed ? `${failed.name} failed.` : "Verification failed.", basis: "exit-codes" };
}

/**
 * The words that label a value in rendered text, e.g. "Total due" from
 * "Total due: $1.08". Returns null when the text has no usable label.
 */
export function labelFor(text: string, value: string): string | null {
  const i = text.indexOf(value);
  if (i < 0) return null;
  const before = text.slice(0, i).replace(/[\s:=–—-]+$/u, "").trim();
  if (!before || before.length > 40 || /[\n.!?]/.test(before)) return null;
  if (!/^[\p{L}][\p{L}\s'’]*$/u.test(before)) return null;
  return before.toLowerCase();
}
