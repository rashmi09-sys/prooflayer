"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Minus, ShieldCheck, Sparkles, X } from "lucide-react";
import type { FeedItem, NodeStatus, StoryNode, StoryState } from "@/lib/shared/showcase.ts";
import { EvidenceNetwork } from "./network.tsx";

const EASE = [0.3, 0.7, 0.2, 1] as const;

/** NeverBreak's side of the story: what it protects, and what it is doing, in plain words. */
export function Intelligence({ state, mode }: { state: StoryState; mode: "overview" | "replay" | "live" }) {
  const headline =
    state.phase === "intro"
      ? state.scene === 1
        ? "Reading the change"
        : "Remembering what works"
      : state.phase === "checking"
        ? "Checking existing journeys"
        : state.phase === "regression"
          ? "Regression caught"
          : state.phase === "repairing"
            ? "Preparing a repair"
            : state.phase === "verifying"
              ? "Verifying the repair"
              : state.phase === "done"
                ? (state.final?.tone === "pass" ? "Verified" : state.final?.tone === "warn" ? "Rolled back" : "Stopped safely")
                : "Watching DashDish";
  const busy = state.phase === "checking" || state.phase === "repairing" || state.phase === "verifying";
  return (
    <section aria-labelledby="nb-heading" className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-line bg-surface/80 backdrop-blur">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(117,92,255,0.22),transparent)]" aria-hidden />
      <header className="relative flex items-center gap-3 px-5 pt-5">
        <span className={`relative grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white ${busy ? "nb-breathe" : ""}`}>
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="nb-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            NeverBreak
          </h2>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={headline} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-sm text-ink-3" aria-live="polite">
              {headline}
            </motion.p>
          </AnimatePresence>
        </div>
        {mode !== "overview" ? (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${mode === "live" ? "bg-accent-soft text-accent-ink" : "bg-surface-3 text-ink-2"}`}>{mode === "live" ? "Live" : "Replay"}</span>
        ) : null}
      </header>

      <div className="relative px-4 pt-3">
        <EvidenceNetwork state={state} />
      </div>

      <div className="relative px-5 pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Journeys</p>
        <ol className="relative mt-2.5 space-y-1.5">
          <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-line-strong" />
          <AnimatePresence initial={false}>
            {state.nodes.map((n, i) => (
              <motion.li key={n.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}>
                <Node n={n} />
              </motion.li>
            ))}
          </AnimatePresence>
          {!state.nodes.length ? <li className="py-6 text-center text-sm text-ink-3">Waiting for the change…</li> : null}
        </ol>
      </div>

      <div className="relative mt-4 flex min-h-[140px] flex-1 flex-col border-t border-line px-5 pt-3.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Activity</p>
        <ol className="pl-scroll mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-5" aria-live="polite" aria-label="NeverBreak activity" tabIndex={0}>
          <AnimatePresence initial={false}>
            {[...state.feed].reverse().map((f, i) => (
              <motion.li key={f.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: i === 0 ? 1 : 0.62, y: 0 }} transition={{ duration: 0.25 }}>
                <Feed f={f} />
              </motion.li>
            ))}
          </AnimatePresence>
          {!state.feed.length ? <li className="text-sm text-ink-3">{state.phase === "intro" ? "NeverBreak is getting ready." : "Nothing has run yet."}</li> : null}
        </ol>
      </div>
    </section>
  );
}

function Node({ n }: { n: StoryNode }) {
  const look: Record<NodeStatus, string> = {
    idle: "border-line-strong bg-surface text-ink-3",
    checking: "border-accent bg-accent-soft text-accent-ink",
    pass: "border-pass bg-pass text-[#06140d]",
    fail: "border-fail bg-fail text-[#1b0807]",
    unchecked: "border-dashed border-line-strong bg-surface text-ink-3",
  };
  return (
    <div className={`relative flex items-center gap-3 rounded-2xl border px-2.5 py-1.5 transition-colors duration-300 ${n.status === "fail" ? "border-fail/40 bg-fail-soft" : n.status === "checking" ? "border-accent/40 bg-accent-soft/40" : "border-line bg-surface-2/70"}`}>
      <span className={`relative grid size-[26px] shrink-0 place-items-center rounded-full border transition-colors duration-300 ${look[n.status]}`}>
        {n.status === "checking" ? <span aria-hidden className="pl-step-pulse absolute inset-0 rounded-full border border-accent" /> : null}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={n.status} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.22 }}>
            {n.status === "pass" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : n.status === "fail" ? <X className="size-4" strokeWidth={3} aria-hidden /> : n.status === "checking" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${n.status === "fail" ? "text-fail" : "text-ink"}`}>{n.name}</span>
        <span className="block text-[11px] text-ink-3">{n.origin === "protected" ? "Verified before this change" : "New in this change"}</span>
      </span>
      {n.origin === "new" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10.5px] font-semibold text-coral">
          <Sparkles className="size-3" aria-hidden /> New
        </span>
      ) : null}
      <span className="sr-only">{n.status}</span>
    </div>
  );
}

function Feed({ f }: { f: FeedItem }) {
  const dot = { info: "bg-ink-3", live: "bg-accent", pass: "bg-pass", fail: "bg-fail", warn: "bg-warn" }[f.tone];
  return (
    <p className="flex gap-2.5 text-sm leading-snug text-ink">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
      <span>{f.text}</span>
    </p>
  );
}
