"use client";

import { motion } from "motion/react";
import { Loader2, Minus, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { Tone } from "@/lib/ui/neverbreak.ts";

const EASE = [0.3, 0.7, 0.2, 1] as const;

/** NeverBreak's verdict in one sentence, with a supporting line. */
export function OutcomeBanner({ tone, title, sub, play = false, className = "mt-6" }: { tone: Tone; title: string; sub: string; play?: boolean; className?: string }) {
  const look = {
    pass: { Icon: ShieldCheck, ring: "border-pass/25 bg-pass-soft", icon: "bg-pass text-surface" },
    fail: { Icon: ShieldAlert, ring: "border-fail/25 bg-fail-soft", icon: "bg-fail text-surface" },
    warn: { Icon: ShieldQuestion, ring: "border-warn/30 bg-warn-soft", icon: "bg-warn text-surface" },
    live: { Icon: Loader2, ring: "border-accent/25 bg-accent-soft", icon: "bg-accent text-on-accent" },
    neutral: { Icon: Minus, ring: "border-line bg-surface-2", icon: "bg-ink-3 text-surface" },
  }[tone];
  return (
    <motion.div
      initial={play ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`${className} flex items-center gap-4 rounded-[20px] border px-5 py-4 sm:px-6 sm:py-5 ${look.ring}`}
      aria-live="polite"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${look.icon}`}>
        <look.Icon className={`size-5 ${tone === "live" ? "animate-spin" : ""}`} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[1.3rem] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[1.55rem]">{title}</p>
        <p className="mt-0.5 text-[15px] text-ink-2">{sub}</p>
      </div>
    </motion.div>
  );
}

