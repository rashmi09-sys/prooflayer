"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitCompareArrows } from "lucide-react";
import type { CheckRecord, RunRecord } from "@/lib/shared/types.ts";
import { CHECK_STATUS_LABEL, formatDuration, relativeTime, formatTimestamp } from "@/lib/ui/format.ts";
import { CheckMarker, RunningBadge, VerdictBadge } from "./status.tsx";
import { Button } from "./ui.tsx";

type RunRow = RunRecord & { checks: CheckRecord[] };

export function HistoryTable({ runs, compareHref, runBase = "/runs" }: { runs: RunRow[]; compareHref: string; runBase?: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  function compare() {
    // Older run is the baseline.
    const [a, b] = picked.map((id) => runs.find((r) => r.id === id)!).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    router.push(`${compareHref}?base=${a.id}&head=${b.id}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-xs text-ink-3" aria-live="polite">
          {picked.length === 0
            ? "Tick two finished runs to compare."
            : picked.length === 1
              ? "Select one more run."
              : "Ready. The older run is the baseline."}
        </p>
        <Button size="sm" variant={picked.length === 2 ? "primary" : "secondary"} disabled={picked.length !== 2} onClick={compare}>
          <GitCompareArrows className="size-3.5" aria-hidden /> Compare selected
        </Button>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Verification runs, newest first</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th scope="col" className="w-12 py-2.5 pl-3 font-normal">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="py-2.5 pr-4 font-normal">Verdict</th>
              <th scope="col" className="py-2.5 pr-4 font-normal">Commit</th>
              <th scope="col" className="py-2.5 pr-4 font-normal">Checks</th>
              <th scope="col" className="py-2.5 pr-4 text-right font-normal">Duration</th>
              <th scope="col" className="py-2.5 pr-4 font-normal">Started</th>
              <th scope="col" className="py-2.5 pr-5 font-normal">Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => {
              const required = r.checks.filter((c) => c.required);
              const checked = picked.includes(r.id);
              return (
                <tr key={r.id} className={`align-middle ${checked ? "bg-accent-soft/50" : "hover:bg-surface-2/60"}`}>
                  <td className="py-1 pl-3">
                    <label className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={r.status !== "completed"}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select run ${r.id} for comparison`}
                        className="size-4 accent-[var(--accent)]"
                      />
                    </label>
                  </td>
                  <td className="py-3 pr-4">
                    {r.verdict ? <VerdictBadge verdict={r.verdict} /> : <RunningBadge queued={r.status === "queued"} />}
                  </td>
                  <td className="max-w-[320px] py-3 pr-4">
                    <p className="truncate text-ink" title={r.commitMessage ?? ""}>
                      {r.isRepair ? <span className="mr-1.5 rounded-full bg-accent-soft px-2 py-px text-[11px] font-semibold text-accent-ink">Repair attempt</span> : null}
                      {r.commitMessage}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      <code className="font-mono text-ink-2" title={r.commitSha}>{r.commitSha.slice(0, 7)}</code> on {r.branch}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <ul className="flex items-center gap-1" aria-label="Required check outcomes">
                      {required.map((c) => (
                        <li key={c.key} title={`${c.name}: ${CHECK_STATUS_LABEL[c.status]}`}>
                          <span className="sr-only">{c.name}: </span>
                          <CheckMarker status={c.status} size={18} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="tabular py-3 pr-4 text-right text-ink-2">{formatDuration(r.durationMs)}</td>
                  <td className="py-3 pr-4 text-ink-2">
                    <time dateTime={r.createdAt} title={formatTimestamp(r.createdAt)}>
                      {relativeTime(r.createdAt)}
                    </time>
                  </td>
                  <td className="py-3 pr-5">
                    <Link href={`${runBase}/${r.id}`} className="font-mono text-xs text-accent-ink hover:underline">
                      {r.id}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
