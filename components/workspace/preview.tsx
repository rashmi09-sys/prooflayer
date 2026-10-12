"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppWindow, ArrowUpRight, Check, Clock3, EyeOff, Hourglass, Maximize2, Minimize2, Radio, ScanEye, X } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { primaryShot } from "@/lib/shared/flows.ts";
import type { InvestigationStep } from "@/lib/ui/investigation.ts";
import { formatDuration, formatTimestamp, shortSha } from "@/lib/ui/format.ts";
import { RenderedPage } from "../proof-stage.tsx";

const EASE = [0.3, 0.7, 0.2, 1] as const;

/**
 * The centre of the workspace: the app itself. Before Chromium opens it,
 * this is an honest empty frame plus what the worker is doing right now;
 * after, it is the real screenshot, unaltered, with any highlight drawn
 * as a separate, switchable layer.
 */
export function Preview({
  detail,
  steps,
  now,
  reveal,
}: {
  detail: RunDetail;
  steps: InvestigationStep[];
  now: number;
  /** True only when this result was observed arriving live. */
  reveal: boolean;
}) {
  const { run, checks } = detail;
  const live = run.status !== "completed";
  const shot = primaryShot(detail.artifacts);
  const snap = checks.find((c) => c.key === "snapshot");
  const browserStep = steps.find((s) => s.id === "browser");
  const [highlights, setHighlights] = useState(true);
  const [full, setFull] = useState(false);
  const found = (shot?.annotations?.matches ?? []).filter((m) => m.found);
  const searched = (shot?.annotations?.matches ?? []).length > 0;

  return (
    <section aria-labelledby="preview-heading" className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="preview-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AppWindow className="size-4 text-ink-3" aria-hidden /> The app, as Chromium rendered it
        </h2>
        {shot ? (
          <div className="flex items-center gap-1" role="group" aria-label="Screenshot view">
            {found.length ? (
              <Toggle pressed={highlights} onClick={() => setHighlights((v) => !v)} icon={ScanEye} label={highlights ? "Highlights on" : "Highlights off"} />
            ) : null}
            <Toggle pressed={full} onClick={() => setFull((v) => !v)} icon={full ? Minimize2 : Maximize2} label={full ? "Full capture" : "Focused"} />
          </div>
        ) : null}
      </div>

      <motion.div
        className="rounded-2xl border border-line bg-surface-3 p-3 sm:p-5"
        initial={reveal && shot ? { opacity: 0.6 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: reveal ? 0.9 : 0 }}
      >
        {shot ? (
          <motion.div initial={reveal ? { opacity: 0, y: 10, scale: 0.985 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.34, ease: EASE, delay: reveal ? 1.0 : 0 }}>
            <RenderedPage
              artifact={shot}
              runId={run.id}
              commitSha={run.commitSha}
              caption={false}
              annotate={highlights}
              crop={!full}
              tone="light"
              animate={reveal}
              ringDelayMs={reveal ? 1350 : 0}
            />
          </motion.div>
        ) : live ? (
          <EmptyFrame step={browserStep} snapshotLog={detail.evidence.find((e) => e.checkId === snap?.id)?.content ?? ""} />
        ) : (
          <Unavailable title="No screenshot for this run" detail={snap?.summary ?? "It was recorded before browser snapshots existed."} />
        )}
      </motion.div>

      {shot ? (
        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 text-xs text-ink-3">
          <p className="max-w-[70ch]">
            Headless Chromium · {shot.width}×{shot.height} · {formatTimestamp(shot.capturedAt)} · commit <code className="font-mono text-ink-2">{shortSha(run.commitSha)}</code>.{" "}
            {found.length
              ? "Highlights mark where the test's value was found in the page text. They're drawn on top; the image is unaltered."
              : searched
                ? "The test's value wasn't found in the page text, so nothing is highlighted."
                : "Evidence of what rendered, not a test result."}
          </p>
          <a href={`/api/runs/${run.id}/artifacts/${shot.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-0.5 font-medium text-accent-ink hover:underline">
            Original PNG <ArrowUpRight className="size-3" aria-hidden />
          </a>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {live ? (
          <motion.div key="live" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <LiveActivity detail={detail} steps={steps} now={now} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Toggle({ pressed, onClick, icon: Icon, label }: { pressed: boolean; onClick: () => void; icon: typeof Check; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-200 ${pressed ? "border-accent/35 bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2"}`}
    >
      <Icon className="size-3.5" aria-hidden /> {label}
    </button>
  );
}

/** The browser frame before a screenshot exists. Never shows a page that wasn't captured. */
function EmptyFrame({ step, snapshotLog }: { step: InvestigationStep | undefined; snapshotLog: string }) {
  const opening = step?.state === "running";
  const last = snapshotLog.trim().split("\n").filter(Boolean).slice(-4);
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[0_1px_2px_rgba(24,20,31,0.05)]">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2">
        <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
        <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
        <span aria-hidden className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-3">{opening ? "Opening the built app…" : "Not opened"}</span>
      </div>
      <div className="flex aspect-[16/7] min-h-56 flex-col items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait" initial={false}>
          {opening ? (
            <motion.div key="opening" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="w-full max-w-md">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink">
                <span aria-hidden className="pl-live-dot size-2 rounded-full bg-accent" />{" "}
                {/browser opened/.test(snapshotLog) ? "Chromium opened the page and is capturing it" : "Starting the built app so Chromium can open it"}
              </p>
              {last.length ? (
                <ul className="mt-3 space-y-1 text-left font-mono text-[11px] leading-relaxed text-ink-3" aria-label="Browser step, latest lines">
                  {last.map((l, i) => (
                    <li key={`${i}-${l}`} className="truncate">
                      {l}
                    </li>
                  ))}
                </ul>
              ) : null}
            </motion.div>
          ) : (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Hourglass className="mx-auto size-6 text-ink-3" aria-hidden />
              <p className="mt-3 text-sm font-medium text-ink">{step?.state === "skipped" ? "The browser won't open for this run" : "The browser hasn't opened yet"}</p>
              <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-ink-3">
                {step?.state === "skipped" ? (step.detail ?? "There was no passing build to serve.") : "ProofLayer opens the app in Chromium only after it builds. The screenshot appears here then."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex aspect-[16/7] min-h-48 w-full flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 text-center">
      <EyeOff className="size-6 text-ink-3" aria-hidden />
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[44ch] text-xs leading-relaxed text-ink-3">{detail}</p>
    </div>
  );
}

/** What the worker is doing right now, from recorded state only. */
function LiveActivity({ detail, steps, now }: { detail: RunDetail; steps: InvestigationStep[]; now: number }) {
  const { run, checks } = detail;
  const running = checks.find((c) => c.status === "running") ?? null;
  const content = running ? (detail.evidence.find((e) => e.checkId === running.id)?.content ?? "") : "";
  const lines = content.trimEnd().split("\n").filter((l) => l.trim()).slice(-14);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [content]);
  const step = steps.find((s) => s.state === "running") ?? null;
  const done = checks.filter((c) => c.required && !["pending", "running"].includes(c.status));
  const elapsed = running?.startedAt ? now - new Date(running.startedAt).getTime() : null;
  const total = run.startedAt ? now - new Date(run.startedAt).getTime() : null;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-accent-ink">
            <Radio className="size-3.5" aria-hidden /> {run.status === "queued" ? "Queued" : "Now"}
          </p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink" aria-live="polite">
            {run.status === "queued" ? "Waiting for the worker to pick this up" : (step?.label ?? "Between steps")}
          </p>
        </div>
        <dl className="flex items-center gap-4 text-xs text-ink-3">
          {elapsed !== null ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">This step</dt>
              <Clock3 className="size-3.5" aria-hidden />
              <dd className="tabular font-mono text-ink-2">{formatDuration(elapsed)}</dd>
            </div>
          ) : null}
          {total !== null ? (
            <div>
              <dt className="inline">Total </dt>
              <dd className="tabular inline font-mono text-ink-2">{formatDuration(total)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {running ? (
        <div className="px-4 pt-3 sm:px-5">
          <p className="text-xs text-ink-3">
            {running.name}
            {running.command ? (
              <>
                {" · "}
                <code className="font-mono text-ink-2">{running.command}</code>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="p-4 pt-2.5 sm:px-5">
        <pre ref={ref} className="pl-scroll h-40 overflow-auto rounded-xl bg-log-bg px-4 py-3 font-mono text-[11.5px] leading-relaxed text-log-ink" aria-label={running ? `Latest output from ${running.name}` : "Output"} tabIndex={0}>
          {lines.length ? (
            lines.join("\n")
          ) : (
            <span className="text-log-dim">
              {run.status === "queued" ? "Nothing is running yet." : running ? `No output yet. ${running.name} prints when it has something to say.` : "Waiting for the next step to start."}
            </span>
          )}
        </pre>
      </div>

      {done.length ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3 sm:px-5" aria-label="Finished checks">
          <AnimatePresence initial={false}>
            {done.map((c) => (
              <motion.li
                key={c.key}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22 }}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${c.status === "passed" ? "bg-pass-soft text-pass" : c.status === "failed" ? "bg-fail-soft text-fail" : "bg-surface-2 text-ink-2"}`}
              >
                {c.status === "passed" ? <Check className="size-3" strokeWidth={3} aria-hidden /> : c.status === "failed" ? <X className="size-3" strokeWidth={3} aria-hidden /> : null}
                {c.name}
                {c.durationMs !== null ? <span className="font-mono text-[10.5px] opacity-70">{formatDuration(c.durationMs)}</span> : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
