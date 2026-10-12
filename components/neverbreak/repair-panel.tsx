"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Wrench, X } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import type { RepairAttemptView } from "@/lib/server/repair.ts";
import { formatDuration, shortSha } from "@/lib/ui/format.ts";

const STRATEGY: Record<RepairAttemptView["strategy"], { title: string; body: string }> = {
  "prepared-fix": { title: "Apply the prepared targeted fix", body: "A candidate patch written in advance for this demo, applied in isolation." },
  "restore-source": { title: "Restore the code the change touched", body: "Keeps the change's other edits, including its tests." },
  "roll-back": { title: "Roll back the whole change", body: "Every touched file goes back to the last passing version." },
};

/**
 * Safe repair: at most two attempts, each a real commit on its own
 * neverbreak/* branch, verified like any other change. Nothing here edits
 * the project's own branches.
 */
export function RepairPanel({ detail, onStarted, compact = false }: { detail: RunDetail; onStarted?: () => void; compact?: boolean }) {
  const router = useRouter();
  const nb = detail.neverbreak;
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  if (!nb || detail.run.isRepair) return null;
  const repair = nb.repair;

  async function start() {
    setState("busy");
    try {
      const res = await fetch(`/api/runs/${detail.run.id}/repair`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "The repair couldn't start.");
      setState("idle");
      onStarted?.();
      router.refresh();
    } catch (e) {
      setState((e as Error).message);
    }
  }

  if (!repair) {
    if (detail.run.status !== "completed" || detail.run.verdict !== "failed") return null;
    return (
      <div className={`rounded-2xl border border-line bg-surface ${compact ? "p-4" : "p-5"}`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wrench className="size-4 text-accent" aria-hidden /> Safe repair
        </p>
        {detail.access === "public" ? (
          <p className="mt-1 text-sm text-ink-3">No repair was attempted for this change. Repairs are started by the operator; this demo shows recorded runs only.</p>
        ) : nb.availability.ok ? (
          <>
            <p className="mt-1 text-sm text-ink-2">Try up to two careful fixes, each checked again before anything is called fixed. Your branch is never touched.</p>
            <button
              type="button"
              onClick={start}
              disabled={state === "busy"}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-semibold text-on-accent shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {state === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wrench className="size-4" aria-hidden />}
              {state === "busy" ? "Starting…" : "Attempt safe repair"}
            </button>
            <p className="mt-2 text-xs text-ink-3">Rule-based, not AI: restores code from the last passing version {nb.baseline ? shortSha(nb.baseline.commitSha) : ""}.</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-3">Not available here. {nb.availability.reason}</p>
        )}
        {state !== "idle" && state !== "busy" ? (
          <p role="alert" className="mt-2 text-xs text-fail">
            {state}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-surface ${repair.status === "succeeded" ? "border-pass/30" : repair.status === "failed" ? "border-fail/25" : "border-line"} ${compact ? "p-4" : "p-5"}`}>
      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
        <span className="flex items-center gap-2">
          <Wrench className="size-4 text-accent" aria-hidden /> Safe repair{repair.trigger === "automatic" ? " · automatic" : ""}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${repair.status === "succeeded" ? (repair.outcome === "repaired" ? "bg-pass-soft text-pass" : "bg-warn-soft text-warn") : repair.status === "running" ? "bg-accent-soft text-accent-ink" : "bg-fail-soft text-fail"}`}>
          {repair.status === "succeeded" ? (repair.outcome === "repaired" ? "Repaired" : "Rolled back") : repair.status === "running" ? "In progress" : repair.status === "failed" ? "Not fixed" : "Stopped"}
        </span>
      </p>
      <ol className="mt-3 space-y-2.5">
        {repair.attempts.map((a) => (
          <Attempt key={a.n} a={a} />
        ))}
        {repair.status === "running" && repair.attempts.length < 2 && repair.attempts.every((a) => a.outcome === "failed") ? (
          <li className="text-xs text-ink-3">Preparing the next attempt…</li>
        ) : null}
      </ol>
      {repair.summary ? <p className="mt-3 text-sm leading-relaxed text-ink-2">{repair.summary}</p> : null}
      {repair.status === "succeeded" ? (
        <p className="mt-2 text-xs text-ink-3">Nothing was merged. The {repair.outcome === "repaired" ? "repaired" : "rolled-back"} version lives on its own branch for you to review.</p>
      ) : null}
    </div>
  );
}

function Attempt({ a }: { a: RepairAttemptView }) {
  const live = !a.run || a.run.status !== "completed";
  const ok = a.outcome === "passed";
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${live ? "bg-accent-soft text-accent-ink" : ok ? "bg-pass text-surface" : "bg-fail text-surface"}`}>
        {live ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : ok ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <X className="size-3.5" strokeWidth={3} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Attempt {a.n}: {STRATEGY[a.strategy].title}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {STRATEGY[a.strategy].body} <span className="font-mono">{a.files.join(", ")}</span>
        </p>
        <p className="mt-1 text-xs text-ink-2">
          {live ? (a.run?.status === "running" ? "Verifying now…" : "Queued for verification") : ok ? "Verified: every protected flow passed" : a.outcome === "failed" ? "Verified: still broken" : `Couldn't be verified (${a.outcome})`}
          {a.run?.durationMs ? ` · ${formatDuration(a.run.durationMs)}` : ""}
        </p>
      </div>
      {a.runId ? (
        <Link href={`/runs/${a.runId}`} className="inline-flex min-h-7 shrink-0 items-center gap-0.5 text-xs font-medium text-accent-ink hover:underline">
          Proof <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}
