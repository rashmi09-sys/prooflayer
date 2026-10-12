"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CircleCheckBig, PanelBottomOpen } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { relativeTime, shortSha } from "@/lib/ui/format.ts";
import { Source } from "../provenance.tsx";
import { Timeline } from "../run/timeline.tsx";
import { Activity, CommitCard, facts } from "../run/diagnosis-panel.tsx";
import { AiPanel } from "../run/ai-panel.tsx";

export type InspectorTab = "logs" | "commit" | "diagnostics";
const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "logs", label: "Logs" },
  { id: "commit", label: "Commit" },
  { id: "diagnostics", label: "Diagnostics" },
];

/** Logs, commit metadata and diagnostics, out of the way until asked for. */
export function Inspector({
  detail,
  readOnly,
  open,
  tab,
  expanded,
  onOpenChange,
  onTab,
  onToggleStep,
  onRefresh,
}: {
  detail: RunDetail;
  readOnly?: boolean;
  open: boolean;
  tab: InspectorTab;
  expanded: Set<string>;
  onOpenChange: (open: boolean) => void;
  onTab: (t: InspectorTab) => void;
  onToggleStep: (key: string, open?: boolean) => void;
  onRefresh: () => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { run, lastPassed } = detail;
  const failed = detail.checks.filter((c) => c.required && (c.status === "failed" || c.status === "error"));

  function onKey(e: KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    onTab(TABS[n].id);
    tabRefs.current[n]?.focus();
  }

  return (
    <section id="inspector" aria-labelledby="inspector-heading" className="min-w-0 rounded-2xl border border-line bg-surface shadow-sm">
      <h2 id="inspector-heading">
        <button type="button" aria-expanded={open} aria-controls="inspector-body" onClick={() => onOpenChange(!open)} className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left sm:px-5">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PanelBottomOpen className="size-4 text-ink-3" aria-hidden /> Inspector
            <span className="font-normal text-ink-3">Logs, commit and diagnostics</span>
          </span>
          <ChevronDown className={`size-4 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div id="inspector-body" key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.3, 0.7, 0.2, 1] }} className="overflow-hidden">
            <div className="border-t border-line px-4 pb-4 sm:px-5">
              <div role="tablist" aria-label="Inspector sections" className="-mb-px flex gap-1 pt-2">
                {TABS.map((t, i) => (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    id={`insp-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls={`insp-panel-${t.id}`}
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => onTab(t.id)}
                    onKeyDown={(e) => onKey(e, i)}
                    className={`relative h-9 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                  >
                    {t.label}
                    {tab === t.id ? <motion.span layoutId="insp-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" transition={{ duration: 0.22 }} /> : null}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`insp-panel-${tab}`} aria-labelledby={`insp-tab-${tab}`} className="mt-3 border-t border-line pt-4">
                {tab === "logs" ? (
                  <Timeline checks={detail.checks} evidence={detail.evidence} locations={detail.locations} expanded={expanded} onToggle={onToggleStep} />
                ) : tab === "commit" ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <CommitCard detail={detail} />
                    <section aria-labelledby="lkg-heading" className="rounded-xl border border-line bg-surface p-4">
                      <h3 id="lkg-heading" className="text-sm font-semibold text-ink">
                        Last verified revision
                      </h3>
                      {lastPassed && lastPassed.id !== run.id ? (
                        <div className="mt-2.5">
                          <p className="flex items-center gap-2 text-sm">
                            <CircleCheckBig className="size-4 text-pass" aria-hidden />
                            <code className="font-mono text-ink">{shortSha(lastPassed.commitSha)}</code>
                            <span className="text-ink-3">passed {relativeTime(lastPassed.finishedAt)}</span>
                          </p>
                          <p className="mt-1 truncate text-xs text-ink-3">{lastPassed.commitMessage}</p>
                          <Link href={`/runs/${lastPassed.id}`} className="mt-2 inline-flex min-h-6 items-center text-xs font-medium text-accent-ink hover:underline">
                            Open its run
                          </Link>
                          <p className="mt-2 text-[11px] text-ink-3">Passed the checks that ran on it, nothing more. ProofLayer never rolls back.</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-ink-2">{lastPassed ? "This run is the most recent pass on record." : "No run on this project has passed yet."}</p>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ul className="space-y-3">
                      {facts(detail).map((f, i) => (
                        <li key={i} className="text-sm leading-snug text-ink">
                          <Source kind={f.source} className="mb-1" />
                          <p>{f.text}</p>
                        </li>
                      ))}
                    </ul>
                    {run.status === "completed" && failed.length ? (
                      <AiPanel runId={run.id} failed={failed} explanations={detail.explanations} aiConfigured={detail.health.ai.configured} model={detail.health.ai.model} readOnly={readOnly} onGenerated={onRefresh} />
                    ) : null}
                    <Activity detail={detail} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
