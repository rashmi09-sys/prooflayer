"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  History,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  SkipForward,
  X,
} from "lucide-react";
import {
  type FrameLite,
  type RunLite,
  type ShowcaseData,
  type StoryState,
} from "@/lib/shared/showcase.ts";
import { Phone, type PhoneContent } from "./phone.tsx";
import { Intelligence } from "./intelligence.tsx";

import { EASE, OFF_STEPS, type StepStatus, type View } from "./studio-shared.ts";
import { Comparison } from "./comparison.tsx";

export function Run({
  data,
  initial,
  story,
  view,
  v,
  total,
  playing,
  setPlaying,
  restart,
  skip,
  liveActive,
  liveRun,
  error,
  onReset,
  onOther,
  busy,
}: {
  data: ShowcaseData;
  initial: ShowcaseData;
  story: StoryState;
  view: Extract<View, { kind: "run" }>;
  v: number;
  total: number;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  restart: () => void;
  skip: () => void;
  liveActive: boolean;
  liveRun: string | null;
  error: string | null;
  onReset: () => void;
  onOther: () => void;
  busy: boolean;
}) {
  const on = view.protection === "on";
  const live = view.exec === "live";
  const change = data.source; // the run that checked (ON) or independently evaluated (OFF) the prepared change
  const attempt = data.repair?.attempts.find((a) => a.run)?.run ?? null;
  const frameOf = (
    run: RunLite | null | undefined,
    journey: string,
    label?: string,
  ) =>
    run?.frames.find(
      (f) => f.journey === journey && (label ? f.label === label : f.last),
    ) ?? null;

  // Where the story is.
  let steps: Array<{ label: string; status: StepStatus; detail?: string }>;
  let done: boolean;
  let phone: PhoneContent;
  const appOf = (
    run: RunLite | null | undefined,
    label: string,
  ): PhoneContent | null =>
    run?.preview
      ? { kind: "build", url: run.preview, sha: run.sha, runId: run.id, label }
      : null;
  const shot = (
    f: FrameLite | null,
    run: RunLite | null | undefined,
    tag?: string,
  ): PhoneContent | null =>
    f && run
      ? { kind: "frame", frame: f, runId: run.id, total: 1, index: 0, tag }
      : null;
  const original = appOf(
    initial.baseline,
    "Original DashDish",
  );
  const regularBroken = frameOf(change, "regular-checkout");
  const scheduledOk = frameOf(change, "scheduled-checkout");

  if (!on) {
    // OFF: recorded steps through the evidence; live follows the independent evaluation run.
    const t = live ? null : v;
    const evaluated = change?.status === "completed";
    const stage = live
      ? !evaluated
        ? 2
        : 4
      : t! < OFF_STEPS[0]
        ? 0
        : t! < OFF_STEPS[1]
          ? 1
          : t! < OFF_STEPS[2]
            ? 2
            : t! < OFF_STEPS[3]
              ? 3
              : 4;
    const st = (i: number): StepStatus =>
      stage > i
        ? i === 3 && regularBroken?.ok === false
          ? "fail"
          : "done"
        : stage === i
          ? i === 3 && regularBroken?.ok === false
            ? "fail"
            : "active"
          : "pending";
    steps = [
      { label: "Request", status: st(0), detail: `“${view.prompt}”` },
      {
        label: "Change",
        status: st(1),
        detail: "The prepared change is applied",
      },
      {
        label: "Shipped without checks",
        status: st(2),
        detail: "Nothing is checked before release",
      },
      {
        label:
          regularBroken?.ok === false
            ? "Regular checkout broke"
            : "Regular checkout",
        status: st(3),
        detail:
          live && !evaluated
            ? "Recording what customers see"
            : regularBroken?.actual
              ? `Customers see “${regularBroken.actual}”`
              : undefined,
      },
    ];
    done = stage >= 4;
    const changed = appOf(
      change,
      "With the change",
    );
    phone =
      stage <= 0
        ? (original ?? { kind: "empty", title: "", text: "" })
        : stage === 1
          ? (changed ??
            original ?? {
              kind: "empty",
              title: "Applying the change",
              text: "",
            })
          : stage === 2
            ? (shot(
                frameOf(change, "scheduled-checkout", "Cart, scheduled"),
                change,
                "scheduled delivery, after the change",
              ) ??
              changed ?? {
                kind: "empty",
                title: "Shipping the change",
                text: "The app is recorded in a real browser.",
              })
            : stage === 3
              ? (shot(
                  regularBroken,
                  change,
                  "regular checkout, after the change",
                ) ?? {
                  kind: "empty",
                  title: "Evaluating regular checkout",
                  text: "",
                })
              : (changed ??
                shot(regularBroken, change) ?? {
                  kind: "empty",
                  title: "",
                  text: "",
                });
  } else {
    const sc = story.phase === "done" ? 8 : story.scene;
    const regression =
      Boolean(story.regression) || (sc > 4 && change?.verdict === "failed");
    const st = (from: number, to = from): StepStatus =>
      sc > to ? "done" : sc >= from ? "active" : "pending";
    steps = [
      { label: "Request", status: st(1), detail: `“${view.prompt}”` },
      {
        label: "Change",
        status: st(2),
        detail: "The prepared change",
      },
      {
        label: "Check",
        status: st(3),
        detail: `${data.baseline?.flows.length ?? 0} existing journeys, rechecked`,
      },
      {
        label: "Regression",
        status: regression ? "fail" : st(4),
        detail: regression ? "Regular checkout caught" : undefined,
      },
      {
        label: "Repair",
        status: st(5),
        detail: data.repair ? "Prepared repair, on a separate copy" : undefined,
      },
      {
        label: "Verified",
        status:
          story.phase === "done" && attempt?.verdict === "passed"
            ? "done"
            : st(6, 7),
        detail: attempt
          ? `${attempt.flows.filter((f) => f.state === "passed").length} journeys + ${attempt.newChecks.filter((c) => c.ok).length} new checks`
          : undefined,
      },
    ];
    done = story.phase === "done" && (!live || !liveActive);
    const repaired = appOf(
      attempt,
      "Repaired",
    );
    const baselineFrame =
      data.baseline?.frames.find(
        (f) => f.last && f.ok && f.journey === "regular-checkout",
      ) ?? null;
    phone = done
      ? (repaired ?? { kind: "empty", title: "", text: "" })
      : story.frame && story.focusRun
        ? {
            kind: "frame",
            frame: story.frame,
            runId: story.focusRun.id,
            total: 1,
            index: 0,
            tag:
              attempt && story.attempt?.run?.frames.includes(story.frame)
                ? `${story.frame.journeyName}, after the repair`
                : undefined,
          }
        : sc <= 2
          ? (shot(
              baselineFrame,
              data.baseline,
              "before the change",
            ) ??
            original ?? { kind: "empty", title: "", text: "" })
          : {
              kind: "empty",
              title:
                story.phase === "repairing"
                  ? "Applying the repair"
                  : story.phase === "verifying"
                    ? "Building the repaired version"
                    : "Building the change",
              text: "The app appears here once it's ready.",
            };
  }

  const progress = live
    ? on
      ? story.progress
      : change?.status === "completed"
        ? 1
        : 0.5
    : v / Math.max(1, total);
  const finalLine = on
    ? "Scheduled delivery works. Regular checkout still works."
    : "Scheduled delivery was added, but regular checkout broke.";
  const provenOn = Boolean(
    attempt &&
    attempt.verdict === "passed" &&
    data.repair?.outcome === "repaired" &&
    frameOf(attempt, "regular-checkout")?.ok &&
    frameOf(attempt, "scheduled-checkout")?.ok,
  );
  const provenOff = Boolean(scheduledOk?.ok && regularBroken?.ok === false);
  const proven = on ? provenOn : provenOff;

  return (
    <div>
      <button
        type="button"
        onClick={onReset}
        className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-xl pl-2 pr-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
      {/* The request and how it was handled. */}
      <section
        aria-label="Your request"
        className="relative overflow-hidden rounded-[26px] border border-line bg-surface/80 p-5 backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-3">You asked</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ${on ? "bg-accent-soft text-accent-ink" : "bg-surface-3 text-ink-2"}`}
              >
                {on ? (
                  <ShieldCheck className="size-3" aria-hidden />
                ) : (
                  <ShieldOff className="size-3" aria-hidden />
                )}{" "}
                NeverBreak {on ? "ON" : "OFF"}
              </span>
              {live ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 px-2.5 py-0.5 font-semibold text-accent-ink">
                  <span
                    className="pl-live-dot size-1.5 rounded-full bg-accent"
                    aria-hidden
                  />{" "}
                  Live verification
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/35 bg-warn-soft px-2.5 py-0.5 font-semibold text-warn">
                  <History className="size-3" aria-hidden /> Recorded
                  demonstration
                </span>
              )}
            </p>
            <p className="mt-2 text-[1.45rem] font-semibold leading-snug tracking-[-0.02em] text-ink sm:text-[1.7rem]">
              “{view.prompt}”
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!live ? (
              <>
                <IconButton
                  label={playing ? "Pause" : "Play"}
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? (
                    <Pause className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4" aria-hidden />
                  )}
                </IconButton>
                <IconButton label="Skip to the result" onClick={skip}>
                  <SkipForward className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Replay from the start" onClick={restart}>
                  <RotateCcw className="size-4" aria-hidden />
                </IconButton>
              </>
            ) : null}
            <button
              type="button"
              onClick={onReset}
              className="h-10 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-3"
            >
              Reset to the original app
            </button>
          </div>
        </div>

        {/* Request → Change → Check → Regression → Repair → Verified (OFF: no protection or repair stages). */}
        <ol
          aria-label="Progress"
          className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2"
        >
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={`mx-1 h-px w-5 sm:w-8 ${s.status === "pending" ? "bg-line" : s.status === "fail" ? "bg-fail/60" : "bg-gradient-to-r from-accent/70 to-accent-2/70"}`}
                />
              ) : null}
              <span
                title={s.detail}
                className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors duration-300 ${s.status === "fail" ? "border-fail/40 bg-fail-soft text-fail" : s.status === "active" ? "border-accent/50 bg-accent-soft/60 text-ink" : s.status === "done" ? "border-line bg-surface-2 text-ink" : "border-dashed border-line text-ink-3"}`}
              >
                <Dot status={s.status} />
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
          <motion.div
            className={`h-full ${on ? "bg-gradient-to-r from-accent to-accent-2" : "bg-gradient-to-r from-ink-3 to-coral"}`}
            initial={false}
            animate={{ width: `${Math.min(1, progress) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </section>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-fail">
          {error}
        </p>
      ) : null}

      {/* The app, and NeverBreak beside it. */}
      <section
        aria-label="What happens to the app"
        className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="flex min-w-0 flex-col items-center">
          <Phone content={phone} width={330} />
          <p
            className="mt-3 max-w-[420px] text-center text-xs text-ink-3"
            aria-live="polite"
          >
            {done
              ? on
                ? "The repaired app, verified. Try regular and scheduled checkout yourself."
                : `The app as shipped. Try a regular order: it stops at “${regularBroken?.actual ?? "Choose a delivery time"}”.`
              : (steps.find((s) => s.status === "active" || s.status === "fail")
                  ?.detail ?? "")}
          </p>
        </div>
        <div className={`min-w-0 ${on ? "min-h-[480px] lg:h-[760px]" : ""}`}>
          {on ? (
            <Intelligence state={story} mode={live ? "live" : "replay"} />
          ) : (
            <section
              aria-label="NeverBreak is off"
              className="flex flex-col rounded-[28px] border border-dashed border-line-strong bg-surface/50 p-6"
            >
              <p className="flex items-center gap-3 text-[15px] font-semibold text-ink-2">
                <span className="grid size-10 place-items-center rounded-2xl bg-surface-3 text-ink-3">
                  <ShieldOff className="size-5" aria-hidden />
                </span>
                NeverBreak is off
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-3">
                {[
                  "Existing journeys weren't rechecked",
                  "Nothing stopped the release",
                  "Nothing was repaired",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="grid size-5 place-items-center rounded-full border border-dashed border-line-strong">
                      <X className="size-3" aria-hidden />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
                The broken checkout comes from a separate{" "}
                {live ? "test running now" : "recorded test"} of this change,
                not from NeverBreak.
              </p>
            </section>
          )}
        </div>
      </section>

      {/* Result and the side-by-side comparison. */}
      <AnimatePresence initial={false}>
        {done ? (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            aria-labelledby="result-heading"
            className="mt-8"
          >
            <div
              className={`rounded-[28px] border p-6 sm:p-8 ${!proven ? "border-line bg-surface/80" : on ? "border-pass/30 bg-[linear-gradient(135deg,rgba(63,208,138,0.14),rgba(25,27,35,0.92)_55%)]" : "border-fail/30 bg-[linear-gradient(135deg,rgba(255,107,94,0.14),rgba(25,27,35,0.92)_55%)]"}`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
                {live ? "Live result" : "Recorded result"} · NeverBreak{" "}
                {on ? "ON" : "OFF"}
              </p>
              <h2
                id="result-heading"
                className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[2.4rem]"
              >
                {proven
                  ? finalLine
                  : on
                    ? "The repair couldn't be verified."
                    : "The evaluation didn't show the regression."}
              </h2>
              <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-ink-2">
                {on
                  ? proven
                    ? "NeverBreak checked the change before release, caught regular checkout breaking, applied a prepared repair on a separate copy and checked everything again. Regular orders reach “Order confirmed” and scheduled orders reach “Order scheduled”."
                    : "See Behind the scenes for the recorded checks."
                  : proven
                    ? `The change went live without checks. Scheduled orders reach “Order scheduled”, but a regular order now stops at “${regularBroken?.actual}”.`
                    : "See Behind the scenes for the recorded checks."}{" "}
                {live
                  ? "Checked just now. The change and the repair were prepared in advance."
                  : "Recorded in a real browser. The change and the repair were prepared in advance."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOther}
                  disabled={busy}
                  className={`inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold disabled:opacity-50 ${on ? "bg-ink text-bg" : "bg-gradient-to-r from-accent to-accent-2 text-white shadow-[0_12px_30px_-12px_rgba(117,92,255,0.9)]"}`}
                >
                  {on ? (
                    <ShieldOff className="size-4" aria-hidden />
                  ) : (
                    <ShieldCheck className="size-4" aria-hidden />
                  )}{" "}
                  Same request with NeverBreak {on ? "OFF" : "ON"}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex h-11 items-center rounded-2xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-3"
                >
                  Reset to the original app
                </button>
              </div>
            </div>
            <Comparison
              data={initial.repair ? initial : data}
              live={live ? data : null}
              current={view.protection}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>
      {live && liveRun && !done ? (
        <p className="mt-4 text-center text-xs text-ink-3">
          Following {liveRun} on this machine&apos;s worker.
        </p>
      ) : null}
    </div>
  );
}

/** Without and with NeverBreak, side by side, from genuine Chromium frames. */

function Dot({ status }: { status: StepStatus }) {
  return (
    <span
      className={`relative grid size-6 shrink-0 place-items-center rounded-full ${status === "fail" ? "bg-fail text-[#1b0807]" : status === "done" ? "bg-pass text-[#06140d]" : status === "active" ? "bg-accent text-white" : "border border-dashed border-line-strong"}`}
    >
      {status === "active" ? (
        <span
          aria-hidden
          className="pl-step-pulse absolute inset-0 rounded-full border border-accent"
        />
      ) : null}
      {status === "fail" ? (
        <X className="size-3.5" strokeWidth={3} aria-hidden />
      ) : status === "done" ? (
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      ) : status === "active" ? (
        <Loader2
          className="size-3 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      <span className="sr-only">{status === "fail" ? "failed" : status}</span>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-xl bg-surface-3 text-ink hover:bg-line-strong"
    >
      {children}
    </button>
  );
}

