"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown, ChevronRight, CircleStop, GitCompareArrows, Loader2, Minus, X } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { flowCounts } from "@/lib/shared/flows.ts";
import { headline } from "@/lib/ui/neverbreak.ts";
import { CHECK_STATUS_LABEL, formatDuration, formatTimestamp, shortSha } from "@/lib/ui/format.ts";
import { Notice } from "../ui.tsx";
import { useNow } from "../run/use-now.ts";
import { FlowIcon, FlowList } from "./flow-list.tsx";
import { VisualProof } from "./visual-proof.tsx";
import { RepairPanel } from "./repair-panel.tsx";
import { BehindTheScenes } from "./behind-scenes.tsx";
import { OutcomeBanner } from "./outcome-banner.tsx";

const EASE = [0.3, 0.7, 0.2, 1] as const;

/**
 * One run, told as a story: the AI change, what NeverBreak protected, what
 * broke, whether it was repaired, and the proof. The technical detail is in
 * "Behind the scenes" below, closed until asked for.
 */
export function RunStory({ initial, readOnly = false, basePath }: { initial: RunDetail; readOnly?: boolean; basePath: string }) {
  const [detail, setDetail] = useState(initial);
  const [pollError, setPollError] = useState(false);
  const [cancelState, setCancelState] = useState<"idle" | "sending" | "error">("idle");
  const [background, setBackground] = useState(false);
  const [reveal, setReveal] = useState(false);
  const seen = useRef(initial.run.status);
  const reduced = useReducedMotion();
  const nbv = detail.neverbreak;
  // Automatic repair starts just after the run finishes; keep listening briefly so it appears.
  const awaitingAuto =
    !!nbv?.autoRepair && !nbv.repair && nbv.availability.ok && detail.run.verdict === "failed" && !!detail.run.finishedAt && Date.now() - new Date(detail.run.finishedAt).getTime() < 60_000;
  const repairActive = nbv?.repair?.status === "running" || awaitingAuto;
  const live = detail.run.status !== "completed";
  const now = useNow(live || repairActive);

  // Reading is allowed for everyone; only the controls below depend on readOnly.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${detail.run.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as RunDetail;
      if (seen.current !== "completed" && next.run.status === "completed") setReveal(true);
      seen.current = next.run.status;
      setDetail(next);
      setPollError(false);
    } catch {
      setPollError(true);
    }
  }, [detail.run.id]);

  useEffect(() => {
    if (window.location.hash === "#background") setBackground(true);
  }, []);

  useEffect(() => {
    if (!live && !repairActive) return;
    const t = setInterval(refresh, live ? 1000 : 2000);
    return () => clearInterval(t);
  }, [live, repairActive, refresh]);

  async function cancel() {
    setCancelState("sending");
    const res = await fetch(`/api/runs/${detail.run.id}/cancel`, { method: "POST" }).catch(() => null);
    setCancelState(res && (res.ok || res.status === 409) ? "idle" : "error");
    refresh();
  }

  const { run } = detail;
  const nb = detail.neverbreak ?? null;
  const h = headline(detail);
  const play = reveal && !reduced;
  const lp = detail.lastPassed && detail.lastPassed.id !== run.id ? detail.lastPassed : null;
  const compareHref = nb?.baseline ? `/p/${run.projectSlug}/compare?base=${nb.baseline.runId}&head=${nb.attemptOf ? nb.attemptOf.source.id : run.id}` : null;

  return (
    <MotionConfig reducedMotion="user">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-ink-3">
        <Link href={basePath} className="inline-flex min-h-6 items-center hover:text-ink hover:underline">
          {run.projectName}
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link href={`${basePath}/runs`} className="inline-flex min-h-6 items-center hover:text-ink hover:underline">
          Runs
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-mono text-ink-2" aria-current="page">
          {run.id}
        </span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">
            {nb?.attemptOf ? `NeverBreak repair · attempt ${nb.attemptOf.n} of 2` : "AI change"}
          </p>
          <h1 className="mt-1.5 max-w-[44ch] text-[1.65rem] leading-[1.15] tracking-[-0.025em] text-ink sm:text-[2.1rem]">
            {run.commitMessage ? <>“{run.commitMessage}”</> : `Commit ${shortSha(run.commitSha)}`}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
            <code className="font-mono text-ink-2">{shortSha(run.commitSha)}</code>
            {run.commitAuthor ? <span>by {run.commitAuthor}</span> : null}
            {nb?.changedFiles ? <span>{nb.changedFiles.length} {nb.changedFiles.length === 1 ? "file" : "files"} changed since the last passing version</span> : null}
            {nb?.attemptOf ? (
              <Link href={`/runs/${nb.attemptOf.source.id}`} className="font-medium text-accent-ink hover:underline">
                Repairing {shortSha(nb.attemptOf.source.commitSha)}
              </Link>
            ) : null}
          </p>
        </div>
        {live && !readOnly ? (
          <button
            type="button"
            onClick={cancel}
            disabled={run.cancelRequested || cancelState === "sending"}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-fail/30 px-3 text-sm font-medium text-fail hover:bg-fail-soft disabled:opacity-60 lg:self-auto"
          >
            <CircleStop className="size-3.5" aria-hidden /> {run.cancelRequested ? "Cancelling…" : "Cancel"}
          </button>
        ) : detail.recordedImport ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-warn/35 bg-warn-soft px-3 text-sm font-medium text-warn lg:self-auto" title={`Imported from a recorded demonstration package. ${detail.recordedImport.recordedIn}.`}>
            Recorded demonstration{run.finishedAt ? ` · ${new Date(run.finishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}
          </span>
        ) : readOnly ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink-2 lg:self-auto" title="Public demo: this page shows a recorded run and can't start anything">
            {live ? "Running now · view only" : `Recorded run${run.finishedAt ? ` · ${new Date(run.finishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}`}
          </span>
        ) : null}
      </header>

      <div className="mt-4 space-y-3 empty:hidden">
        {live && !readOnly && !detail.health.worker.online ? <Notice tone="warn" title="No worker is running. This check waits in the queue until it starts." /> : null}
        {pollError ? <Notice tone="warn" title="Lost connection. Retrying." /> : null}
        {cancelState === "error" ? <Notice tone="fail" title="The cancellation didn't go through. Try again." /> : null}
      </div>

      <OutcomeBanner tone={h.tone} title={h.title} sub={h.sub} play={play} />
      <p className="sr-only" role="status">
        {live ? "" : `Finished. ${h.title}`}
      </p>

      {!live ? (
        <motion.div className="mt-6" initial={play ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: play ? 0.25 : 0 }}>
          <VisualProof detail={detail} animate={play} />
        </motion.div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="story-heading" className="min-w-0">
          <h2 id="story-heading" className="text-base font-semibold text-ink">
            What happened
          </h2>
          <Story detail={detail} now={now} onOpenBackground={() => setBackground(true)} />
        </section>
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="flows-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="flows-heading" className="text-base font-semibold text-ink">
                Protected flows
              </h2>
              <Link href={`/p/${run.projectSlug}/flows`} className="text-sm font-medium text-accent-ink hover:underline">
                {readOnly ? "View all" : "Manage"}
              </Link>
            </div>
            <div className="mt-3">
              {nb ? <FlowList results={nb.flows} dense /> : <p className="text-sm text-ink-3">No protected flows for this run.</p>}
            </div>
          </section>
          <RepairPanel detail={detail} onStarted={refresh} />
          {compareHref && run.status === "completed" ? (
            <Link href={compareHref} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong">
              <span className="flex items-center gap-3">
                <GitCompareArrows className="size-5 text-accent" aria-hidden />
                <span>
                  <span className="block text-[15px] font-medium text-ink">Compare before and after</span>
                  <span className="block text-sm text-ink-3">Last passing version {shortSha(nb!.baseline!.commitSha)} vs this change{nb?.repair ? " vs the repair" : ""}</span>
                </span>
              </span>
              <ArrowRight className="size-4 text-ink-3" aria-hidden />
            </Link>
          ) : lp && readOnly ? null : null}
        </div>
      </div>

      {live ? (
        <div className="mt-8">
          <VisualProof detail={detail} />
        </div>
      ) : null}

      <div className="mt-10">
        <BehindTheScenes detail={detail} now={now} readOnly={readOnly} open={background} onOpenChange={setBackground} onRefresh={refresh} />
      </div>
    </MotionConfig>
  );
}

// ------------------------------------------------------------- the story

type StepStatus = "done" | "failed" | "running" | "pending" | "skipped";

interface StoryStep {
  id: string;
  title: string;
  status: StepStatus;
  summary: ReactNode;
  duration: number | null;
  detail?: ReactNode;
}

function buildStory(d: RunDetail, now: number): StoryStep[] {
  const { run, checks } = d;
  const nb = d.neverbreak ?? null;
  const done = run.status === "completed";
  const required = checks.filter((c) => c.required);
  const snap = checks.find((c) => c.key === "snapshot");
  const counted = [...required, ...(snap ? [snap] : [])];
  const running = checks.find((c) => c.status === "running");
  const finishedChecks = counted.filter((c) => !["pending", "running"].includes(c.status));
  const c = nb ? flowCounts(nb.flows) : null;
  const broken = nb?.flows.filter((f) => f.state === "failed" || f.state === "missing") ?? [];
  const repair = nb?.repair ?? null;
  const prepare = checks.find((x) => x.key === "prepare");
  const checksDuration = counted.reduce((n, x) => n + (x.status === "running" && x.startedAt ? now - new Date(x.startedAt).getTime() : (x.durationMs ?? 0)), 0);

  const steps: StoryStep[] = [
    {
      id: "change",
      title: nb?.attemptOf ? "Repair commit received" : "AI change received",
      status: "done",
      duration: null,
      summary: run.commitMessage ? `“${run.commitMessage}”` : shortSha(run.commitSha),
      detail: (
        <div className="space-y-2">
          <p>
            Commit <code className="font-mono">{shortSha(run.commitSha)}</code> on {run.branch}
            {run.commitAuthor ? `, by ${run.commitAuthor}` : ""}
            {run.commitDate ? `, ${formatTimestamp(run.commitDate)}` : ""}.
          </p>
          {nb?.changedFiles?.length ? (
            <ul className="space-y-1">
              {nb.changedFiles.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-3 font-mono text-xs">
                  <span className="truncate text-ink">{f.path}</span>
                  <span className="shrink-0">
                    <span className="text-pass">+{f.additions}</span> <span className="text-fail">−{f.deletions}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : nb?.changedFiles ? (
            <p>Same files as the last passing version.</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "flows",
      title: "Protected flows selected",
      status: nb && nb.flows.length ? "done" : "skipped",
      duration: null,
      summary: nb && nb.flows.length ? `${nb.flows.length} flows that already worked${nb.learned ? `, remembered from ${shortSha(nb.learned.commitSha)}` : ""}` : "None yet: they're learned from the first passing run",
      detail: nb?.flows.length ? (
        <ul className="space-y-1">
          {nb.flows.map((f) => (
            <li key={f.flow.id}>
              {f.flow.name} <span className="text-ink-3">· {f.flow.kind === "page" ? "opened in Chromium" : <>test “{f.flow.testName}”</>}</span>
            </li>
          ))}
        </ul>
      ) : undefined,
    },
    {
      id: "start",
      title: "Verification started",
      status: run.startedAt ? "done" : run.status === "queued" ? "running" : "pending",
      duration: prepare?.durationMs ?? null,
      summary: run.startedAt ? `In an isolated sandbox with no network, ${formatTimestamp(run.startedAt)}` : "Waiting for the worker",
    },
    {
      id: "checks",
      title: "Checks run",
      status: !run.startedAt ? "pending" : done && finishedChecks.length ? (required.some((x) => x.status === "failed" || x.status === "error") ? "failed" : "done") : running ? "running" : done ? "skipped" : "running",
      duration: checksDuration || null,
      summary: running ? `Now: ${running.name}` : done ? `${required.filter((x) => x.status === "passed").length} of ${required.length} checks passed${snap ? `; the browser ${snap.status === "passed" ? "captured the page" : "did not open the page"}` : ""}` : `${finishedChecks.length} of ${counted.length} done`,
      detail: (
        <ul className="space-y-1.5">
          {counted.map((x) => (
            <li key={x.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <MiniStatus s={x.status} /> {x.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-3">
                {CHECK_STATUS_LABEL[x.status]}
                {x.exitCode !== null ? ` · exit ${x.exitCode}` : ""}
                {x.durationMs ? ` · ${formatDuration(x.durationMs)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "regression",
      title: !done ? "Looking for regressions" : broken.length ? "Regression detected" : run.verdict === "passed" ? "No regressions" : "Result",
      status: !done ? "pending" : broken.length || run.verdict === "failed" ? "failed" : run.verdict === "passed" ? "done" : "skipped",
      duration: null,
      summary: !done
        ? "After every check has finished"
        : broken.length
          ? `${broken.length} of ${c!.total} protected ${c!.total === 1 ? "flow" : "flows"} broke: ${broken.map((b) => b.flow.name).join(", ")}`
          : run.verdict === "passed"
            ? `All ${c?.total ?? 0} protected flows still work`
            : (run.verdictReason ?? "No verdict on the code"),
      detail: broken.length ? (
        <ul className="space-y-1.5">
          {broken.map((b) => (
            <li key={b.flow.id}>
              <span className="font-medium text-ink">{b.flow.name}.</span> {b.detail}
            </li>
          ))}
        </ul>
      ) : undefined,
    },
  ];

  if (!nb?.attemptOf) {
    const atts = repair?.attempts ?? [];
    steps.push({
      id: "repair",
      title: repair ? "Repair attempted" : "Repair",
      status: repair ? (repair.status === "running" ? "running" : "done") : !done ? "pending" : run.verdict === "failed" ? "pending" : "skipped",
      duration: null,
      summary: repair
        ? `${atts.length} ${atts.length === 1 ? "attempt" : "attempts"} so far, none AI-written, on separate branches`
        : !done
          ? "Only if something breaks"
          : run.verdict === "passed"
            ? "Not needed"
            : nb?.availability.ok
              ? "Not attempted yet. Start it from Safe repair."
              : `Not available: ${nb?.availability.reason ?? "no protected flows"}`,
      detail: repair ? (
        <ul className="space-y-1">
          {atts.map((a) => (
            <li key={a.n}>
              Attempt {a.n}: {a.strategy === "roll-back" ? "roll back the whole change" : a.strategy === "prepared-fix" ? "apply the prepared targeted fix (written in advance, not generated)" : "restore the code the change touched"} <span className="font-mono text-xs text-ink-3">({a.files.join(", ")}, commit {shortSha(a.commitSha)} on {a.branch})</span>
            </li>
          ))}
        </ul>
      ) : undefined,
    });
    steps.push({
      id: "reverify",
      title: "Verified again",
      status: !repair ? (run.verdict === "passed" ? "skipped" : "pending") : atts.some((a) => a.outcome === "passed") ? "done" : atts.some((a) => !a.outcome) ? "running" : "failed",
      duration: atts.reduce((n, a) => n + (a.run?.durationMs ?? 0), 0) || null,
      summary: !repair
        ? run.verdict === "passed"
          ? "Not needed"
          : "After a repair"
        : atts.map((a) => `Attempt ${a.n}: ${!a.outcome ? "verifying…" : a.outcome === "passed" ? "every flow passed" : a.outcome === "failed" ? "still broken" : a.outcome}`).join(" · "),
      detail: repair ? (
        <ul className="space-y-1">
          {atts.map((a) =>
            a.runId ? (
              <li key={a.n}>
                <Link href={`/runs/${a.runId}`} className="font-medium text-accent-ink hover:underline">
                  Attempt {a.n} proof ({a.runId})
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      ) : undefined,
    });
  }

  const final = headline(d);
  steps.push({
    id: "outcome",
    title: "Final outcome",
    status: !done || repair?.status === "running" ? "pending" : final.tone === "pass" ? "done" : final.tone === "fail" ? "failed" : "skipped",
    duration: null,
    summary: !done ? "Decided from recorded exit codes once everything has run" : final.title,
  });
  return steps;
}

function Story({ detail, now, onOpenBackground }: { detail: RunDetail; now: number; onOpenBackground: () => void }) {
  const steps = buildStory(detail, now);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ol className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        {steps.map((s, i) => {
          const expanded = open === s.id;
          return (
            <li key={s.id} className={i ? "border-t border-line" : ""}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : s.id)}
                disabled={!s.detail}
                aria-expanded={s.detail ? expanded : undefined}
                className="flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors enabled:hover:bg-surface-2"
              >
                <StepMark status={s.status} n={i + 1} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-medium ${s.status === "pending" ? "text-ink-3" : "text-ink"}`}>{s.title}</span>
                  <span className={`mt-0.5 block text-sm ${s.status === "failed" ? "text-fail" : "text-ink-3"}`}>{s.summary}</span>
                </span>
                {s.duration ? <span className="tabular shrink-0 pt-0.5 font-mono text-xs text-ink-3">{formatDuration(s.duration)}</span> : null}
                {s.detail ? <ChevronDown className={`mt-0.5 size-4 shrink-0 text-ink-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden /> : <span className="w-4 shrink-0" />}
              </button>
              <AnimatePresence initial={false}>
                {expanded && s.detail ? (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="pb-4 pl-[68px] pr-5 text-sm leading-relaxed text-ink-2">{s.detail}</div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => { onOpenBackground(); setTimeout(() => document.getElementById("background")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} className="mt-3 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
        See what happened behind the scenes <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </>
  );
}

function StepMark({ status, n }: { status: StepStatus; n: number }) {
  const cls = {
    done: "bg-pass text-surface",
    failed: "bg-fail text-surface",
    running: "bg-accent-soft text-accent-ink ring-1 ring-accent/40",
    pending: "border border-line-strong bg-surface text-ink-3",
    skipped: "border border-dashed border-line-strong bg-surface text-ink-3",
  }[status];
  return (
    <span className={`relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${cls}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={status} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.2 }} className="grid place-items-center">
          {status === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : status === "failed" ? <X className="size-3.5" strokeWidth={3} aria-hidden /> : status === "running" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : status === "skipped" ? <Minus className="size-3.5" aria-hidden /> : n}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{status}</span>
    </span>
  );
}

function MiniStatus({ s }: { s: RunDetail["checks"][number]["status"] }) {
  const state = s === "passed" ? "passed" : s === "failed" || s === "error" ? "failed" : s === "running" || s === "pending" ? "pending" : "not-checked";
  return <FlowIcon state={state} size="sm" />;
}
