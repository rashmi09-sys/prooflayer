"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  History,
  Loader2,
  Radio,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ShowcaseData,
} from "@/lib/shared/showcase.ts";
import {
  SUPPORTED_EXAMPLE,
  UNSUPPORTED_MESSAGE,
} from "@/lib/shared/intent.ts";
import { Phone, type PhoneContent } from "./phone.tsx";

import { formatDay, type Protection } from "./studio-shared.ts";

/** The opening screen: the original app, the protection toggle and the prompt. */
export function Home({
  data,
  protection,
  setProtection,
  draft,
  setDraft,
  onSubmit,
  notice,
  error,
  busy,
  liveAvailable,
  inputRef,
}: {
  data: ShowcaseData;
  protection: Protection;
  setProtection: (p: Protection) => void;
  draft: string;
  setDraft: (t: string) => void;
  onSubmit: () => void;
  notice: string | null;
  error: string | null;
  busy: boolean;
  liveAvailable: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const original = data.baseline;
  const app: PhoneContent = original?.preview
    ? {
        kind: "build",
        url: original.preview,
        sha: original.sha,
        runId: original.id,
        label: "Original DashDish",
      }
    : {
        kind: "empty",
        title: "No verified build here yet",
        text: "Run npm run demo:init to import the recorded demonstration.",
      };
  const journeys = original?.flows.length ?? 0;
  const on = protection === "on";
  return (
    <div className="grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-16">
      <section aria-labelledby="ask-heading" className="min-w-0">
        <h1
          id="ask-heading"
          className="max-w-[14ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-[3.5rem]"
        >
          What would you like to change?
        </h1>
        <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-ink-2">
          Ask for a change to DashDish, then see what happens to the app with
          and without NeverBreak.
        </p>

        {/* The protection toggle: it decides what happens to the change. */}
        <div className="mt-8 max-w-[680px]">
          <div
            role="radiogroup"
            aria-label="NeverBreak protection"
            className="flex flex-wrap items-center gap-3"
          >
            <span className="text-sm font-medium text-ink">
              NeverBreak protection
            </span>
            <div className="relative inline-flex rounded-full border border-line-strong bg-surface p-1">
              {(["off", "on"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={protection === p}
                  tabIndex={protection === p ? 0 : -1}
                  data-protection={p}
                  onClick={() => setProtection(p)}
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const next = p === "off" ? "on" : "off";
                    setProtection(next);
                    (
                      e.currentTarget.parentElement?.querySelector(
                        `[data-protection="${next}"]`,
                      ) as HTMLElement | null
                    )?.focus();
                  }}
                  className={`relative z-10 inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${protection === p ? (p === "on" ? "text-white" : "text-ink") : "text-ink-3 hover:text-ink"}`}
                >
                  {protection === p ? (
                    <motion.span
                      layoutId="protection-pill"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 38,
                      }}
                      className={`absolute inset-0 -z-10 rounded-full ${p === "on" ? "bg-gradient-to-r from-accent to-accent-2 shadow-[0_8px_24px_-10px_rgba(117,92,255,0.9)]" : "bg-surface-3"}`}
                    />
                  ) : null}
                  {p === "on" ? (
                    <ShieldCheck className="size-4" aria-hidden />
                  ) : (
                    <ShieldOff className="size-4" aria-hidden />
                  )}
                  {p === "on" ? "ON" : "OFF"}
                </button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={protection}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-2.5 text-sm text-ink-3"
            >
              {on
                ? `Before the change goes live, NeverBreak rechecks the ${journeys} things customers already do, and applies a prepared repair if one breaks.`
                : "The change goes live as is: nothing is checked and nothing is repaired."}
            </motion.p>
          </AnimatePresence>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="mt-5 max-w-[680px]"
        >
          <div
            className={`relative rounded-[26px] p-px transition-[background,box-shadow] duration-500 ${on ? "bg-gradient-to-br from-accent/60 via-line-strong to-accent-2/40 shadow-[0_30px_80px_-40px_rgba(117,92,255,0.75)]" : "bg-gradient-to-br from-line-strong via-line to-coral/30 shadow-[0_30px_80px_-50px_rgba(255,112,72,0.4)]"}`}
          >
            <div className="rounded-[25px] bg-surface/95 p-2 backdrop-blur">
              <label htmlFor="ask" className="sr-only">
                Describe a change to DashDish
              </label>
              <textarea
                id="ask"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                rows={2}
                maxLength={400}
                placeholder={SUPPORTED_EXAMPLE}
                aria-describedby="ask-help ask-notice"
                className="block w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[19px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(SUPPORTED_EXAMPLE);
                    inputRef.current?.focus();
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg/60 px-3.5 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  <Sparkles className="size-3.5 text-coral" aria-hidden />{" "}
                  {SUPPORTED_EXAMPLE.replace(/\.$/, "")}
                </button>
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className={`inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition-[transform,opacity,background] hover:-translate-y-px disabled:translate-y-0 disabled:opacity-40 ${on ? "bg-gradient-to-r from-accent to-accent-2 text-white shadow-[0_12px_30px_-12px_rgba(117,92,255,0.9)]" : "bg-ink text-bg"}`}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ArrowUp className="size-4" aria-hidden />
                  )}
                  {busy
                    ? "Starting…"
                    : on
                      ? "Apply with NeverBreak"
                      : "Apply change"}
                </button>
              </div>
            </div>
          </div>
          <div id="ask-notice" aria-live="polite" className="min-h-[1.5rem]">
            {notice || error ? (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 text-sm text-ink"
              >
                <X className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>
                  {notice ?? error}
                  {notice === UNSUPPORTED_MESSAGE ? (
                    <>
                      {" "}
                      Try{" "}
                      <button
                        type="button"
                        className="font-medium text-accent-ink underline-offset-2 hover:underline"
                        onClick={() => setDraft(SUPPORTED_EXAMPLE)}
                      >
                        “{SUPPORTED_EXAMPLE.replace(/\.$/, "")}”
                      </button>
                      .
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
          </div>
          <p
            id="ask-help"
            className="mt-2 flex max-w-[62ch] items-start gap-2 text-[13px] leading-relaxed text-ink-3"
          >
            {liveAvailable ? (
              <Radio
                className="mt-0.5 size-3.5 shrink-0 text-accent"
                aria-hidden
              />
            ) : (
              <History
                className="mt-0.5 size-3.5 shrink-0 text-warn"
                aria-hidden
              />
            )}
            <span>
              <span
                className={`font-medium ${liveAvailable ? "text-accent-ink" : "text-warn"}`}
              >
                {liveAvailable
                  ? "Live verification."
                  : "Recorded demonstration."}
              </span>{" "}
              {liveAvailable
                ? "The checks run now, on this machine. The change and the repair were prepared in advance."
                : `The change and the repair were prepared in advance. The checks ran for real${data.recorded ? ` on ${formatDay(data.recorded.recordedAt)}` : " earlier"} and are replayed here.`}
            </span>
          </p>
        </form>
      </section>

      <section
        aria-label="The original DashDish"
        className="flex flex-col items-center"
      >
        <Phone content={app} width={320} />
        <p className="mt-3 max-w-[320px] text-center text-xs text-ink-3">
          DashDish today, with no scheduled delivery yet. It&apos;s the real
          app, so tap through it.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ run */

