import type { ReplayPace } from "@/lib/shared/showcase.ts";

// Types and constants shared by the Studio (the prompt-first demo) and its parts.

export type Protection = "off" | "on";
export type Exec = "recorded" | "live";
export type View =
  | { kind: "home" }
  | { kind: "run"; protection: Protection; exec: Exec; prompt: string };
export type StepStatus = "pending" | "active" | "done" | "fail";

export const EASE = [0.3, 0.7, 0.2, 1] as const;
/** NeverBreak ON replay pacing: faster than the recorded runs, with short pauses on key moments. */
export const ON_PACE: ReplayPace = { speed: 8, intro: 2.5, pause: 3 };
/** NeverBreak OFF timeline, in seconds: Request → Change → Shipped → Checkout broke → result. */
export const OFF_STEPS = [2, 6.5, 12.5, 19] as const;

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMoment(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

