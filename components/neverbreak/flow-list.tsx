import { Check, CircleDashed, Minus, PencilLine, ShieldCheck, X } from "lucide-react";
import type { FlowResult, FlowState } from "@/lib/shared/flows.ts";

const LOOK: Record<FlowState, { Icon: typeof Check; cls: string; label: string }> = {
  passed: { Icon: Check, cls: "bg-pass text-surface", label: "Works" },
  failed: { Icon: X, cls: "bg-fail text-surface", label: "Broken" },
  missing: { Icon: X, cls: "bg-fail text-surface", label: "Test removed" },
  pending: { Icon: CircleDashed, cls: "border border-line-strong bg-surface text-ink-3", label: "Checking" },
  "not-checked": { Icon: Minus, cls: "border border-dashed border-line-strong bg-surface text-ink-3", label: "Not checked" },
};

export function FlowIcon({ state, size = "md" }: { state: FlowState; size?: "sm" | "md" }) {
  const l = LOOK[state];
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${size === "sm" ? "size-5" : "size-7"} ${l.cls}`}>
      <l.Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={state === "passed" || state === "failed" || state === "missing" ? 3 : 2} aria-hidden />
      <span className="sr-only">{l.label}</span>
    </span>
  );
}

export function flowLabel(state: FlowState) {
  return LOOK[state].label;
}

/** Protected flows and how each one did. */
export function FlowList({ results, showWhy = false, dense = false }: { results: FlowResult[]; showWhy?: boolean; dense?: boolean }) {
  if (!results.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm text-ink-3">
        <ShieldCheck className="size-4" aria-hidden /> No protected flows yet. They're learned from the first passing run.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {results.map((r) => (
        <li key={r.flow.id} className={`flex items-start gap-3.5 ${dense ? "px-4 py-3" : "px-5 py-4"}`}>
          <FlowIcon state={r.state} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium leading-snug text-ink">
              {r.flow.name}
              {r.testEdited ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-px text-[11px] font-semibold text-warn" title="The change edited the test that protects this flow.">
                  <PencilLine className="size-3" aria-hidden /> Its test was edited
                </span>
              ) : null}
            </p>
            {showWhy ? <p className="mt-0.5 text-sm text-ink-3">{r.flow.why}</p> : null}
            <p className={`mt-0.5 text-[13px] ${r.state === "failed" || r.state === "missing" ? "text-fail" : "text-ink-3"}`}>{r.detail}</p>
          </div>
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              r.state === "passed" ? "bg-pass-soft text-pass" : r.state === "failed" || r.state === "missing" ? "bg-fail-soft text-fail" : "bg-surface-2 text-ink-3"
            }`}
          >
            {LOOK[r.state].label}
          </span>
        </li>
      ))}
    </ul>
  );
}
