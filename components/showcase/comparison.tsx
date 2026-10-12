"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";
import {
  type RunLite,
  type ShowcaseData,
} from "@/lib/shared/showcase.ts";
import { Phone } from "./phone.tsx";

import { type Protection } from "./studio-shared.ts";

export function Comparison({
  data,
  live,
  current,
}: {
  data: ShowcaseData;
  live: ShowcaseData | null;
  current: Protection;
}) {
  const src = live?.source ?? data.source;
  const attempt =
    (live?.repair ?? data.repair)?.attempts.find((a) => a.run)?.run ?? null;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 420px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const last = (run: RunLite | null | undefined, j: string) =>
    run?.frames.find((f) => f.last && f.journey === j) ?? null;
  const cols = [
    {
      key: "off" as const,
      title: "Without NeverBreak",
      run: src,
      frames: [last(src, "scheduled-checkout"), last(src, "regular-checkout")],
      facts: [
        {
          ok: Boolean(last(src, "scheduled-checkout")?.ok),
          text: "New feature added",
        },
        {
          ok: last(src, "regular-checkout")?.ok !== false,
          text:
            last(src, "regular-checkout")?.ok === false
              ? "Old checkout broken"
              : "Old checkout works",
        },
      ],
    },
    {
      key: "on" as const,
      title: "With NeverBreak",
      run: attempt,
      frames: [
        last(attempt, "scheduled-checkout"),
        last(attempt, "regular-checkout"),
      ],
      facts: attempt
        ? [
            {
              ok: Boolean(last(attempt, "scheduled-checkout")?.ok),
              text: "New feature added",
            },
            {
              ok: Boolean(last(attempt, "regular-checkout")?.ok),
              text: "Old checkout protected",
            },
            { ok: attempt.verdict === "passed", text: "Verified repair" },
          ]
        : [],
    },
  ];
  return (
    <section aria-labelledby="compare-heading" className="mt-6">
      <h3 id="compare-heading" className="sr-only">
        Without and with NeverBreak, side by side
      </h3>
      <div className="grid gap-5 md:grid-cols-2">
        {cols.map((c) => (
          <div
            key={c.key}
            className={`min-w-0 rounded-[28px] border p-4 sm:p-6 ${c.key === current ? (c.key === "on" ? "border-pass/35 bg-surface/80" : "border-fail/35 bg-surface/80") : "border-line bg-surface/50"}`}
          >
            <p className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {c.key === "on" ? (
                  <ShieldCheck className="size-4 text-accent" aria-hidden />
                ) : (
                  <ShieldOff className="size-4 text-ink-3" aria-hidden />
                )}{" "}
                {c.title}
              </span>
              {c.key === current ? (
                <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] font-medium text-ink-2">
                  You just saw this
                </span>
              ) : null}
            </p>
            {c.run ? (
              <>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {c.facts.map((f) => (
                    <li
                      key={f.text}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${f.ok ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail"}`}
                    >
                      {f.ok ? (
                        <Check
                          className="size-3.5"
                          strokeWidth={3}
                          aria-hidden
                        />
                      ) : (
                        <X className="size-3.5" strokeWidth={3} aria-hidden />
                      )}{" "}
                      {f.text}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex justify-center gap-3 sm:gap-4">
                  {c.frames.map((f, i) =>
                    f ? (
                      <figure key={f.id} className="text-center">
                        <Phone
                          content={{
                            kind: "frame",
                            frame: f,
                            runId: c.run!.id,
                            total: 1,
                            index: 0,
                          }}
                          width={narrow ? 128 : 150}
                          badge={false}
                          highlight={c.key === "off" && i === 1}
                        />
                        <figcaption
                          className={`mt-2 text-[11px] ${f.ok ? "text-pass" : "text-fail"}`}
                        >
                          {i === 0 ? "Scheduled" : "Regular"}: “
                          {f.ok ? f.expected : f.actual}”
                        </figcaption>
                      </figure>
                    ) : null,
                  )}
                </div>
                <p className="mt-4 text-center text-[11px] text-ink-3">
                  Recorded in a real browser
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-ink-3">
                Run the same request with NeverBreak ON to see this outcome.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

