"use client";

import { useRef } from "react";
import { ChevronDown, FileCode2, ArrowUpRight } from "lucide-react";
import type { CheckRecord, EvidenceRecord } from "@/lib/shared/types.ts";
import type { SourceLocation } from "@/lib/shared/facts.ts";
import { STAGES } from "@/lib/shared/stages.ts";
import { CHECK_STATUS_LABEL, FAILURE_CLASS_LABEL, formatDuration, formatTimestamp } from "@/lib/ui/format.ts";
import { CheckMarker } from "../status.tsx";
import { LogViewer } from "./evidence-panel.tsx";
import { useNow } from "./use-now.ts";

const CONNECTOR: Record<CheckRecord["status"], string> = {
  passed: "bg-pass/70",
  failed: "bg-fail/70",
  error: "bg-warn/70",
  running: "bg-accent/40",
  pending: "bg-line-strong",
  skipped: "bg-line-strong",
  cancelled: "bg-line-strong",
};

/**
 * Execution timeline. The track shows every stage at a glance; each stage
 * row expands to its command, recorded facts and captured output. A stage
 * is drawn as running only when the worker has recorded that it started.
 */
export function Timeline({
  checks,
  evidence,
  locations,
  expanded,
  onToggle,
}: {
  checks: CheckRecord[];
  evidence: EvidenceRecord[];
  locations: Record<string, Array<SourceLocation & { url: string | null }>>;
  expanded: Set<string>;
  onToggle: (key: string, open?: boolean) => void;
}) {
  const now = useNow(checks.some((c) => c.status === "running"));
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const elapsed = (c: CheckRecord) => (c.status === "running" && c.startedAt ? Math.max(0, now - new Date(c.startedAt).getTime()) : c.durationMs);

  const jump = (key: string) => {
    onToggle(key, true);
    requestAnimationFrame(() => rowRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <section aria-labelledby="timeline-heading" className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5 sm:px-6">
        <div>
          <h2 id="timeline-heading" className="text-lg font-semibold tracking-[-0.01em] text-ink">
            Execution
          </h2>
          <p className="mt-0.5 text-sm text-ink-3">Open any step for its command and full log.</p>
        </div>
      </div>

      {/* Track */}
      <div className="pl-scroll relative overflow-x-auto px-5 pb-2 pt-6 sm:px-6">
        <ol className="flex min-w-[680px] items-start" aria-label="Execution timeline">
          {checks.map((c, i) => {
            const stage = STAGES.find((s) => s.key === c.key);
            const last = i === checks.length - 1;
            const optional = !c.required && c.key === "snapshot";
            return (
              <li key={c.key} className="relative flex flex-1 flex-col items-center">
                {!last ? (
                  <span aria-hidden className="absolute left-1/2 right-[-50%] top-[13px] h-[2px] overflow-hidden rounded-full bg-line-strong">
                    <span className={`block h-full transition-all duration-500 ${CONNECTOR[c.status]} ${c.status === "running" ? "pl-progress-bar w-2/5" : c.status === "passed" || c.status === "failed" || c.status === "error" ? "w-full" : "w-0"}`} />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => jump(c.key)}
                  className="group relative z-10 flex flex-col items-center gap-1.5 rounded-md px-1 pb-1 text-center"
                  aria-label={`${c.name}: ${CHECK_STATUS_LABEL[c.status]}${c.durationMs ? `, ${formatDuration(c.durationMs)}` : ""}. Show details.`}
                >
                  <span className="rounded-full bg-surface p-0.5">
                    <span key={c.status} className={c.status !== "pending" ? "pl-settle block" : "block"}>
                      <CheckMarker status={c.status} size={24} />
                    </span>
                  </span>
                  <span className={`text-xs font-medium ${c.status === "pending" || c.status === "skipped" ? "text-ink-3" : "text-ink"} group-hover:text-accent-ink`}>
                    {stage?.short ?? c.name}
                    {optional ? <span className="text-ink-3">*</span> : null}
                  </span>
                  <span className="tabular h-4 font-mono text-[11px] text-ink-3">
                    {c.status === "pending" ? "" : c.status === "skipped" ? "not run" : formatDuration(elapsed(c))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {checks.some((c) => c.key === "snapshot") ? (
          <p className="mt-1 text-[11px] text-ink-3">* Optional browser snapshot. Never part of the verdict.</p>
        ) : null}
      </div>

      {/* Stage rows */}
      <ul className="mt-3 border-t border-line">
        {checks.map((c) => {
          const open = expanded.has(c.key);
          const ev = evidence.find((e) => e.checkId === c.id);
          const panelId = `stage-${c.key}-panel`;
          return (
            <li key={c.key} ref={(el) => { rowRefs.current[c.key] = el; }} className="scroll-mt-24 border-b border-line last:border-b-0">
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => onToggle(c.key)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2 sm:px-6"
                >
                  <CheckMarker status={c.status} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-sm font-medium ${c.status === "pending" || c.status === "skipped" ? "text-ink-3" : "text-ink"}`}>{c.name}</span>
                      {!c.required ? <span className="text-[11px] text-ink-3">not part of the verdict</span> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">
                      <span className="sr-only">{CHECK_STATUS_LABEL[c.status]}. </span>
                      {c.status === "pending" ? STAGES.find((s) => s.key === c.key)?.description : (c.summary ?? CHECK_STATUS_LABEL[c.status])}
                    </span>
                  </span>
                  {c.exitCode !== null ? (
                    <span className={`hidden rounded border px-1.5 font-mono text-[11px] sm:inline ${c.exitCode === 0 ? "border-pass/30 text-pass" : c.failureClass === "code" ? "border-fail/35 text-fail" : "border-warn/35 text-warn"}`}>
                      exit {c.exitCode}
                    </span>
                  ) : null}
                  <span className="tabular w-14 shrink-0 text-right font-mono text-[11px] text-ink-3">{c.status === "pending" ? "" : formatDuration(elapsed(c))}</span>
                  <ChevronDown className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
              </h3>
              {open ? (
                <div id={panelId} className="pl-enter bg-surface-2/40 px-5 pb-5 pt-1 sm:px-6">
                  <StageDetail check={c} evidence={ev} locations={locations[c.id] ?? []} running={c.status === "running"} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StageDetail({
  check,
  evidence,
  locations,
  running,
}: {
  check: CheckRecord;
  evidence: EvidenceRecord | undefined;
  locations: Array<SourceLocation & { url: string | null }>;
  running: boolean;
}) {
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pb-3 pt-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-3">Status</dt>
          <dd className="mt-0.5 text-ink">
            {CHECK_STATUS_LABEL[check.status]}
            {check.failureClass && check.status !== "passed" ? ` · ${FAILURE_CLASS_LABEL[check.failureClass]}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Exit code</dt>
          <dd className="mt-0.5 font-mono text-ink">{check.exitCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Started</dt>
          <dd className="mt-0.5 text-ink">{formatTimestamp(check.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Finished</dt>
          <dd className="mt-0.5 text-ink">{formatTimestamp(check.finishedAt)}</dd>
        </div>
      </dl>
      {check.command ? (
        <p className="pl-scroll overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-2">
          <span className="select-none text-ink-3">$ </span>
          {check.command}
        </p>
      ) : null}
      {locations.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-label="Source locations parsed from the output">
          {locations.slice(0, 6).map((l, i) => (
            <li key={i} className="flex min-w-0 gap-2 text-xs">
              <FileCode2 className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
              {l.url ? (
                <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 font-mono text-accent-ink hover:underline">
                  {l.file}:{l.line}
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
              ) : (
                <span className="shrink-0 font-mono text-ink">
                  {l.file}:{l.line}
                </span>
              )}
              <span className="min-w-0 text-ink-3">{l.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="-mx-3 sm:-mx-4">
        <LogViewer evidence={evidence} live={running} pending={check.status === "pending"} skipped={check.status === "skipped" || check.status === "cancelled"} />
      </div>
    </div>
  );
}
