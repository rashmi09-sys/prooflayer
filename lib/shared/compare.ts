import type { CheckRecord, StageKey } from "./types.ts";

export type ComparisonKind =
  | "newly_failing"
  | "now_passing"
  | "unchanged_pass"
  | "unchanged_fail"
  | "changed_other"
  | "added"
  | "removed";

export interface CheckComparison {
  key: StageKey;
  name: string;
  kind: ComparisonKind;
  before: CheckRecord | null;
  after: CheckRecord | null;
}

type Outcome = "pass" | "fail" | "other";

function outcome(c: CheckRecord): Outcome {
  if (c.status === "passed") return "pass";
  if (c.status === "failed" && c.failureClass === "code") return "fail";
  return "other";
}

/**
 * Compare the required checks of two recorded runs. `before` is the older
 * (baseline) run and `after` the newer one. Only checks that decide the
 * verdict are compared; pipeline stages are ignored.
 */
export function compareRuns(before: CheckRecord[], after: CheckRecord[]): CheckComparison[] {
  const b = new Map(before.filter((c) => c.required).map((c) => [c.key, c]));
  const a = new Map(after.filter((c) => c.required).map((c) => [c.key, c]));
  const keys: StageKey[] = [];
  for (const c of [...before, ...after]) {
    if (c.required && !keys.includes(c.key)) keys.push(c.key);
  }

  return keys.map((key) => {
    const prev = b.get(key) ?? null;
    const next = a.get(key) ?? null;
    const name = (next ?? prev)!.name;
    if (!prev) return { key, name, kind: "added" as const, before: null, after: next };
    if (!next) return { key, name, kind: "removed" as const, before: prev, after: null };
    const p = outcome(prev);
    const n = outcome(next);
    let kind: ComparisonKind;
    if (p !== "fail" && n === "fail") kind = "newly_failing";
    else if (p === "fail" && n === "pass") kind = "now_passing";
    else if (p === "pass" && n === "pass") kind = "unchanged_pass";
    else if (p === "fail" && n === "fail") kind = "unchanged_fail";
    else kind = "changed_other";
    return { key, name, kind, before: prev, after: next };
  });
}

export const COMPARISON_ORDER: ComparisonKind[] = [
  "newly_failing",
  "now_passing",
  "unchanged_fail",
  "changed_other",
  "added",
  "removed",
  "unchanged_pass",
];
