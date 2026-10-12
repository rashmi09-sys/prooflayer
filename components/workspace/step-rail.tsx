"use client";

import { AnimatePresence, motion } from "motion/react";
import { AppWindow, Ban, Check, FileStack, FlaskConical, FolderGit2, Hammer, Minus, Package, Scale, ScanSearch, TriangleAlert, X } from "lucide-react";
import type { InvestigationStep, StepState } from "@/lib/ui/investigation.ts";
import { formatDuration } from "@/lib/ui/format.ts";

const ICON: Record<string, typeof Check> = {
  prepare: FolderGit2,
  install: Package,
  analyze: ScanSearch,
  test: FlaskConical,
  build: Hammer,
  browser: AppWindow,
  evidence: FileStack,
  verdict: Scale,
};

const SHORT: Record<string, string> = {
  prepare: "Repository",
  install: "Install",
  analyze: "Analyze",
  test: "Tests",
  build: "Build",
  browser: "Browser",
  evidence: "Evidence",
  verdict: "Verdict",
};

const SR_STATE: Record<StepState, string> = {
  pending: "not started",
  running: "in progress",
  passed: "done",
  failed: "failed",
  error: "environment error",
  skipped: "skipped",
  cancelled: "cancelled",
};

/**
 * The investigation timeline. A step changes only when the worker records
 * a change; the transition is the only animation, and it is skipped when
 * the visitor prefers reduced motion (MotionConfig in the workspace).
 */
export function StepRail({ steps, now, onSelect, selected }: { steps: InvestigationStep[]; now: number; onSelect?: (id: string) => void; selected?: string | null }) {
  return (
    <nav aria-label="Verification steps">
      {/* Wide screens: vertical rail */}
      <ol className="hidden xl:block">
        {steps.map((s, i) => {
          const running = s.state === "running";
          const elapsed = running && s.startedAt ? now - new Date(s.startedAt).getTime() : s.durationMs;
          const clickable = Boolean(onSelect) && s.checks.length > 0 && s.state !== "pending";
          const Row = clickable ? "button" : "div";
          return (
            <li key={s.id} className="relative">
              {i < steps.length - 1 ? <Connector state={s.state} /> : null}
              <Row
                {...(clickable ? { type: "button" as const, onClick: () => onSelect?.(s.id) } : {})}
                aria-current={running ? "step" : undefined}
                className={`relative flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-200 ${clickable ? "hover:bg-surface-2" : ""} ${selected === s.id ? "bg-surface-2" : ""}`}
              >
                <StepIcon step={s} />
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`min-w-0 text-[13px] leading-snug ${s.state === "pending" ? "text-ink-3" : running ? "font-semibold text-ink" : "font-medium text-ink"}`}>
                      {s.label}
                      <span className="sr-only">, {SR_STATE[s.state]}</span>
                    </span>
                    {elapsed !== null && s.state !== "pending" && s.state !== "skipped" ? (
                      <span className="tabular shrink-0 font-mono text-[10.5px] text-ink-3">{formatDuration(elapsed)}</span>
                    ) : null}
                  </span>
                  <AnimatePresence initial={false}>
                    {s.detail ? (
                      <motion.span
                        key={s.detail}
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22 }}
                        className={`mt-0.5 line-clamp-2 text-xs leading-snug ${s.state === "failed" ? "text-fail" : "text-ink-3"}`}
                        title={s.detail}
                      >
                        {s.detail}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
              </Row>
            </li>
          );
        })}
      </ol>

      {/* Narrower screens: one compact row */}
      <ol className="pl-scroll relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 xl:hidden">
        {steps.map((s) => (
          <li key={s.id} className="shrink-0" aria-current={s.state === "running" ? "step" : undefined}>
            <span className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs ${s.state === "running" ? "border-accent/40 bg-accent-soft text-accent-ink" : s.state === "failed" ? "border-fail/30 bg-surface text-fail" : "border-line bg-surface text-ink-2"}`}>
              <StepIcon step={s} small />
              {SHORT[s.id]}
              <span className="sr-only">: {s.label}</span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Connector({ state }: { state: StepState }) {
  const done = state === "passed" || state === "failed" || state === "skipped" || state === "error";
  return (
    <span aria-hidden className="absolute left-[23px] top-[38px] h-[calc(100%-26px)] w-px bg-line">
      <motion.span
        className={`absolute inset-x-0 top-0 ${state === "failed" ? "bg-fail/50" : "bg-pass/50"}`}
        initial={false}
        animate={{ height: done ? "100%" : "0%" }}
        transition={{ duration: 0.3, ease: [0.3, 0.7, 0.2, 1] }}
      />
    </span>
  );
}

function StepIcon({ step, small }: { step: InvestigationStep; small?: boolean }) {
  const Base = ICON[step.id] ?? Check;
  const size = small ? "size-5" : "size-[30px]";
  const glyph = small ? "size-3" : "size-3.5";
  const look: Record<StepState, { cls: string; Icon: typeof Check }> = {
    pending: { cls: "border border-line-strong bg-surface text-ink-3", Icon: Base },
    running: { cls: "border border-accent bg-accent-soft text-accent-ink", Icon: Base },
    passed: { cls: "bg-pass text-surface", Icon: Check },
    failed: { cls: "bg-fail text-surface", Icon: X },
    error: { cls: "bg-warn text-surface", Icon: TriangleAlert },
    skipped: { cls: "border border-dashed border-line-strong bg-surface text-ink-3", Icon: Minus },
    cancelled: { cls: "border border-line-strong bg-surface-2 text-ink-3", Icon: Ban },
  };
  const { cls, Icon } = look[step.state];
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full ${size} ${cls} transition-colors duration-300`}>
      {step.state === "running" && !small ? <span aria-hidden className="pl-step-pulse absolute inset-0 rounded-full border border-accent" /> : null}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={step.state}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.3, 0.7, 0.2, 1] }}
          className="grid place-items-center"
        >
          <Icon className={glyph} strokeWidth={step.state === "passed" || step.state === "failed" ? 2.8 : 2} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
