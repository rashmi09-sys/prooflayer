import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CheckRecord, RunRecord } from "@/lib/shared/types.ts";
import { compareRuns, COMPARISON_ORDER, type ComparisonKind } from "@/lib/shared/compare.ts";
import { CHECK_STATUS_LABEL, formatTimestamp } from "@/lib/ui/format.ts";
import { CheckMarker, VerdictBadge } from "./status.tsx";

const GROUP: Record<ComparisonKind, { title: string; hint: string; tone: string }> = {
  newly_failing: { title: "Started failing", hint: "Passed (or did not fail) before, failed now.", tone: "border-l-fail" },
  now_passing: { title: "Now passing", hint: "Failed before, passes now.", tone: "border-l-pass" },
  unchanged_fail: { title: "Still failing", hint: "Failed in both runs.", tone: "border-l-fail/50" },
  changed_other: { title: "Could not compare cleanly", hint: "At least one side did not run or did not finish.", tone: "border-l-warn" },
  added: { title: "New checks", hint: "Only in the newer run.", tone: "border-l-accent" },
  removed: { title: "Removed checks", hint: "Only in the baseline run.", tone: "border-l-line-strong" },
  unchanged_pass: { title: "Unchanged, passing", hint: "Passed in both runs.", tone: "border-l-pass/40" },
};

export function CompareView({
  base,
  head,
  baseChecks,
  headChecks,
  runBase = "/runs",
  hideCards = false,
}: {
  base: RunRecord;
  head: RunRecord;
  baseChecks: CheckRecord[];
  headChecks: CheckRecord[];
  runBase?: string;
  /** The page already shows both runs. */
  hideCards?: boolean;
}) {
  const rows = compareRuns(baseChecks, headChecks);
  const count = (k: ComparisonKind) => rows.filter((r) => r.kind === k).length;
  const parts = [
    count("newly_failing") && `${count("newly_failing")} started failing`,
    count("now_passing") && `${count("now_passing")} now passing`,
    count("unchanged_fail") && `${count("unchanged_fail")} still failing`,
    count("changed_other") && `${count("changed_other")} not comparable`,
    count("unchanged_pass") && `${count("unchanged_pass")} unchanged and passing`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div hidden={hideCards} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <RunCard label="Baseline" run={base} runBase={runBase} />
        <div className="hidden items-center justify-center md:flex" aria-hidden>
          <ArrowRight className="size-5 text-ink-3" />
        </div>
        <RunCard label="Compared with" run={head} runBase={runBase} />
      </div>

      <p hidden={hideCards} className="text-xl font-semibold tracking-[-0.015em] text-ink" aria-live="polite">
        {parts.length ? `${parts.join(", ")}.` : "No required checks to compare."}
        {base.commitSha === head.commitSha ? " Both runs verified the same commit." : ""}
      </p>

      <div className="space-y-3">
        {COMPARISON_ORDER.filter((k) => count(k) > 0).map((k) => (
          <section key={k} aria-labelledby={`grp-${k}`} className={`rounded-lg border border-line border-l-[3px] bg-surface shadow-sm ${GROUP[k].tone}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-5 py-3">
              <h2 id={`grp-${k}`} className="text-sm font-semibold text-ink">
                {GROUP[k].title} <span className="font-normal text-ink-3">({count(k)})</span>
              </h2>
              <p className="text-xs text-ink-3">{GROUP[k].hint}</p>
            </div>
            <ul className="divide-y divide-line">
              {rows
                .filter((r) => r.kind === k)
                .map((r) => (
                  <li key={r.key} className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[160px_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
                    <p className="text-sm font-medium text-ink">{r.name}</p>
                    <Side check={r.before} />
                    <ArrowRight className="hidden size-4 text-ink-3 sm:block" aria-hidden />
                    <Side check={r.after} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Side({ check }: { check: CheckRecord | null }) {
  if (!check) return <p className="text-xs text-ink-3">Not present</p>;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <CheckMarker status={check.status} size={18} />
      <div className="min-w-0 text-xs">
        <p className="text-ink">
          {CHECK_STATUS_LABEL[check.status]}
          {check.exitCode !== null ? <span className="font-mono text-ink-3"> · exit {check.exitCode}</span> : null}
        </p>
        <p className="line-clamp-2 text-ink-3" title={check.summary ?? ""}>
          {check.summary}
        </p>
      </div>
    </div>
  );
}

function RunCard({ label, run, runBase }: { label: string; run: RunRecord; runBase: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{label}</p>
        <Link href={`${runBase}/${run.id}`} className="inline-flex min-h-6 items-center font-mono text-2xs text-accent-ink hover:underline">
          {run.id}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {run.verdict ? <VerdictBadge verdict={run.verdict} /> : null}
        <code className="font-mono text-sm text-ink" title={run.commitSha}>
          {run.commitSha.slice(0, 7)}
        </code>
      </div>
      <p className="mt-2 truncate text-sm text-ink-2" title={run.commitMessage ?? ""}>
        {run.commitMessage}
      </p>
      <p className="mt-1 text-xs text-ink-3">Finished {formatTimestamp(run.finishedAt)}</p>
    </div>
  );
}
