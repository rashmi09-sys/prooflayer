"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ArrowRight, Camera, Check, ChevronRight, Minus, Sparkles, X } from "lucide-react";
import type { FlowState } from "@/lib/shared/flows.ts";

// The customer journey as a map. Every status on it comes from a recorded run;
// stages with nothing checking them say so.

export interface MapFrame {
  url: string;
  label: string;
  journeyName: string;
  ok: boolean | null;
}

export interface MapItem {
  id: string;
  name: string;
  why: string | null;
  /** How it is checked, in plain words. */
  how: string;
  /** Protected (learned from a passing run) or new in the latest change. */
  origin: "protected" | "new";
  now: FlowState;
  detail: string | null;
  lastOk: { runId: string; sha: string; when: string } | null;
}

export interface MapStage {
  id: string;
  label: string;
  frame: MapFrame | null;
  items: MapItem[];
}

export interface MapData {
  stages: MapStage[];
  latest: { runId: string; sha: string; message: string | null } | null;
  learned: { runId: string | null; sha: string } | null;
}

type StageTone = "pass" | "fail" | "new" | "untested" | "pending";

function stageTone(s: MapStage): StageTone {
  if (!s.items.length) return "untested";
  if (s.items.some((i) => i.now === "failed" || i.now === "missing")) return "fail";
  if (s.items.some((i) => i.now === "pending")) return "pending";
  if (s.items.every((i) => i.origin === "new")) return "new";
  if (s.items.filter((i) => i.origin === "protected").every((i) => i.now === "passed")) return "pass";
  return "pending";
}

const TONE: Record<StageTone, { ring: string; dot: string; label: string; text: string }> = {
  pass: { ring: "border-pass/35", dot: "bg-pass text-[#06140d]", label: "Passing now", text: "text-pass" },
  fail: { ring: "border-fail/50 shadow-[0_0_0_4px_rgba(255,107,94,0.10)]", dot: "bg-fail text-[#1b0807]", label: "Broken now", text: "text-fail" },
  new: { ring: "border-coral/40", dot: "bg-coral-soft text-coral", label: "New, not protected yet", text: "text-coral" },
  untested: { ring: "border-dashed border-line-strong", dot: "border border-dashed border-line-strong text-ink-3", label: "Untested", text: "text-ink-3" },
  pending: { ring: "border-accent/40", dot: "bg-accent-soft text-accent-ink", label: "Not checked", text: "text-ink-3" },
};

export function JourneyMap({ data }: { data: MapData }) {
  const firstBroken = data.stages.find((s) => stageTone(s) === "fail")?.id ?? data.stages[0]?.id ?? null;
  const [sel, setSel] = useState<string | null>(firstBroken);
  const stage = data.stages.find((s) => s.id === sel) ?? null;

  return (
    <MotionConfig reducedMotion="user">
      <Legend />
      <div className="pl-scroll -mx-4 mt-2 overflow-x-auto px-4 pb-2 pt-2">
        <ol className="grid min-w-[860px] gap-6" style={{ gridTemplateColumns: `repeat(${data.stages.length}, minmax(0, 1fr))` }} aria-label="Customer journey">
          {data.stages.map((s, i) => {
            const tone = stageTone(s);
            const t = TONE[tone];
            const on = s.id === sel;
            return (
              <li key={s.id} className="relative flex min-w-0">
                <button
                  type="button"
                  onClick={() => setSel(s.id)}
                  aria-pressed={on}
                  aria-label={`${s.label}: ${t.label}. Show proof`}
                  className={`group relative flex w-full min-w-0 flex-col rounded-[22px] border bg-surface p-3 text-left transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${t.ring} ${on ? "bg-surface-2 ring-2 ring-accent/70" : ""}`}
                >
                  <div className="relative overflow-hidden rounded-[16px] border border-line bg-[#111216]" style={{ aspectRatio: "390 / 520" }}>
                    {s.frame ? (
                      <img src={s.frame.url} alt={`Recorded Chromium frame: ${s.frame.journeyName}, ${s.frame.label}`} className="block w-full object-cover object-top" draggable={false} />
                    ) : (
                      <span className="grid h-full place-items-center px-4 text-center text-xs text-ink-3">No recorded frame for this step</span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111216] to-transparent" aria-hidden />
                  </div>
                  <span className="mt-3 flex items-center gap-2">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full ${t.dot}`} aria-hidden>
                      {tone === "pass" ? <Check className="size-3" strokeWidth={3} /> : tone === "fail" ? <X className="size-3" strokeWidth={3} /> : tone === "new" ? <Sparkles className="size-3" /> : <Minus className="size-3" />}
                    </span>
                    <span className="truncate text-[15px] font-semibold text-ink">{s.label}</span>
                  </span>
                  <span className={`mt-0.5 pl-7 text-xs font-medium ${t.text}`}>{t.label}</span>
                  <span className="mt-1 pl-7 text-xs text-ink-3">
                    {s.items.length ? `${s.items.filter((x) => x.origin === "protected").length} protected${s.items.some((x) => x.origin === "new") ? ` · ${s.items.filter((x) => x.origin === "new").length} new` : ""}` : "Nothing checks this step"}
                  </span>
                </button>
                {i < data.stages.length - 1 ? <ChevronRight className="absolute -right-5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {stage ? (
          <motion.section
            key={stage.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            aria-labelledby="stage-proof"
            className="mt-5 grid gap-6 rounded-[28px] border border-line bg-surface/80 p-5 sm:p-6 md:grid-cols-[220px_minmax(0,1fr)]"
          >
            <figure className="mx-auto w-full max-w-[220px]">
              {stage.frame ? (
                <>
                  <img src={stage.frame.url} alt={`Recorded Chromium frame: ${stage.frame.journeyName}, ${stage.frame.label}`} className="block w-full rounded-[22px] border border-line" />
                  <figcaption className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
                    <Camera className="mt-px size-3.5 shrink-0" aria-hidden />
                    Recorded in Chromium · {stage.frame.journeyName} · {stage.frame.label}
                    {data.latest ? ` · ${data.latest.sha.slice(0, 7)}` : ""}
                  </figcaption>
                </>
              ) : (
                <div className="grid aspect-[390/844] place-items-center rounded-[22px] border border-dashed border-line-strong text-xs text-ink-3">No frame recorded</div>
              )}
            </figure>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">Proof for this step</p>
              <h2 id="stage-proof" className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">
                {stage.label}
              </h2>
              {data.latest ? (
                <p className="mt-1 text-sm text-ink-3">
                  From the latest check of <code className="font-mono text-ink-2">{data.latest.sha.slice(0, 7)}</code>
                  {data.latest.message ? ` · ${data.latest.message}` : ""}
                </p>
              ) : null}
              {stage.items.length ? (
                <ul className="mt-5 space-y-3">
                  {stage.items.map((it) => (
                    <Item key={it.id} it={it} />
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-3">
                  Untested. No test or browser journey checks this step yet, so NeverBreak can&apos;t promise it keeps working.
                </p>
              )}
              {data.latest ? (
                <Link href={`/runs/${data.latest.runId}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline">
                  Open the full evidence for this run <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}

function Item({ it }: { it: MapItem }) {
  const broken = it.now === "failed" || it.now === "missing";
  const nowText = it.now === "passed" ? "Passing now" : broken ? "Broken now" : it.now === "pending" ? "Checking" : "Not checked";
  return (
    <li className={`rounded-2xl border p-4 ${broken ? "border-fail/35 bg-fail-soft" : "border-line bg-surface-2/60"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={`text-[15px] font-semibold ${broken ? "text-fail" : "text-ink"}`}>{it.name}</p>
        {it.origin === "new" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[11px] font-semibold text-coral">
            <Sparkles className="size-3" aria-hidden /> New in this change
          </span>
        ) : (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Protected</span>
        )}
      </div>
      {it.why ? <p className="mt-1 text-sm text-ink-2">{it.why}</p> : null}
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-3">Now</dt>
          <dd className={`font-medium ${it.now === "passed" ? "text-pass" : broken ? "text-fail" : "text-ink-3"}`}>{nowText}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Previously verified</dt>
          <dd className="text-ink-2">
            {it.lastOk ? (
              <Link href={`/runs/${it.lastOk.runId}`} className="font-medium text-accent-ink hover:underline">
                {it.lastOk.sha.slice(0, 7)} · {it.lastOk.when}
              </Link>
            ) : it.origin === "new" ? (
              "Not yet, it's new"
            ) : (
              "Not in recent runs"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Checked by</dt>
          <dd className="text-ink-2">{it.how}</dd>
        </div>
      </dl>
      {it.detail && it.now !== "passed" ? <p className={`mt-3 text-sm ${broken ? "text-ink" : "text-ink-3"}`}>{it.detail}</p> : null}
    </li>
  );
}

function Legend() {
  const items: { tone: StageTone; text: string }[] = [
    { tone: "pass", text: "Passing now" },
    { tone: "fail", text: "Broken now" },
    { tone: "new", text: "New, not protected yet" },
    { tone: "untested", text: "Untested" },
  ];
  return (
    <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-3" aria-label="Legend">
      {items.map((i) => (
        <li key={i.tone} className="flex items-center gap-1.5">
          {i.tone === "new" ? (
            <Sparkles className="size-3 text-coral" aria-hidden />
          ) : (
            <span className={`size-2.5 rounded-full ${i.tone === "untested" ? "border border-dashed border-ink-3" : TONE[i.tone].dot.split(" ")[0]}`} aria-hidden />
          )}
          {i.text}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent-ink">Protected</span> discovered from a passing run
      </li>
    </ul>
  );
}
