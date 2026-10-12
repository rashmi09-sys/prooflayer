import type { CheckRecord, CheckStatus, StageKey } from "../shared/types.ts";

// Groups the worker's recorded stages into the steps a person follows.
// Wording follows the recorded state: future while pending, present while
// running, past only once the worker has confirmed the result.

export type StepState = "pending" | "running" | "passed" | "failed" | "error" | "skipped" | "cancelled";

export interface InvestigationStep {
  id: string;
  keys: StageKey[];
  state: StepState;
  label: string;
  detail: string | null;
  durationMs: number | null;
  startedAt: string | null;
  checks: CheckRecord[];
}

const DEFS: Array<{ id: string; keys: StageKey[]; pending: string; running: string; done: string; failed: string; skipped?: string }> = [
  { id: "prepare", keys: ["prepare"], pending: "Prepare repository", running: "Preparing repository", done: "Repository prepared", failed: "Repository couldn't be prepared" },
  { id: "install", keys: ["install"], pending: "Install dependencies", running: "Installing dependencies", done: "Dependencies installed", failed: "Dependencies didn't install" },
  { id: "analyze", keys: ["lint", "typecheck"], pending: "Analyze code", running: "Analyzing code", done: "Code analyzed", failed: "Code analysis found problems" },
  { id: "test", keys: ["test"], pending: "Run tests", running: "Running tests", done: "Tests executed", failed: "Tests failed" },
  { id: "build", keys: ["build"], pending: "Build the app", running: "Building the app", done: "App built", failed: "Build failed" },
  { id: "browser", keys: ["snapshot"], pending: "Open in a browser", running: "Opening the app in Chromium", done: "Browser opened", failed: "Browser check couldn't finish", skipped: "Browser not opened" },
  { id: "evidence", keys: ["collect"], pending: "Collect evidence", running: "Collecting evidence", done: "Evidence collected", failed: "Evidence couldn't be collected" },
  { id: "verdict", keys: ["summarize"], pending: "Produce verdict", running: "Producing verdict", done: "Verdict produced", failed: "Verdict couldn't be produced" },
];

function aggregate(statuses: CheckStatus[]): StepState {
  if (statuses.length === 0) return "pending";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("error")) return "error";
  if (statuses.includes("cancelled")) return "cancelled";
  if (statuses.every((s) => s === "passed")) return "passed";
  if (statuses.every((s) => s === "skipped")) return "skipped";
  if (statuses.every((s) => s === "passed" || s === "skipped")) return "passed";
  return "pending";
}

export function investigationSteps(checks: CheckRecord[]): InvestigationStep[] {
  return DEFS.map((d) => {
    const cs = d.keys.map((k) => checks.find((c) => c.key === k)).filter((c): c is CheckRecord => Boolean(c));
    const state = aggregate(cs.map((c) => c.status));
    const label =
      state === "running" ? d.running : state === "passed" ? d.done : state === "failed" || state === "error" ? d.failed : state === "skipped" ? (d.skipped ?? `${d.pending} (not run)`) : state === "cancelled" ? `${d.pending} (cancelled)` : d.pending;
    const dur = cs.every((c) => c.durationMs === null) ? null : cs.reduce((n, c) => n + (c.durationMs ?? 0), 0);
    const started = cs.map((c) => c.startedAt).filter(Boolean).sort()[0] ?? null;
    return { id: d.id, keys: d.keys, state, label, detail: detailFor(d.id, cs, state), durationMs: dur, startedAt: started, checks: cs };
  });
}

function detailFor(id: string, cs: CheckRecord[], state: StepState): string | null {
  if (id === "analyze" && cs.some((c) => c.status !== "pending")) {
    const parts = cs.map((c) => `${c.key === "lint" ? "Lint" : "Types"} ${c.status === "passed" ? "clean" : c.status === "running" ? "running" : c.status === "pending" ? "waiting" : c.status === "skipped" ? "not run" : "failed"}`);
    return parts.join(" · ");
  }
  if (state === "pending") return null;
  const failing = cs.find((c) => c.status === "failed" || c.status === "error");
  if (id === "test") {
    const c = cs[0];
    const m = /(\d+) failing, (\d+) passing/.exec(c?.summary ?? "");
    if (m) return `${Number(m[1]) + Number(m[2])} tests ran · ${m[1]} failed`;
    const p = /(\d+) tests passed/.exec(c?.summary ?? "");
    if (p) return `${p[1]} tests ran · all passed`;
  }
  if (failing) return failing.summary;
  const c = cs[0];
  if (!c) return null;
  if (id === "browser" && c.status === "passed") {
    const m = /Captured (\S+) in Chromium \((\d+×\d+)\)/.exec(c.summary ?? "");
    return m ? `Screenshot of ${m[1]} · ${m[2]}` : c.summary;
  }
  if (c.summary && c.summary !== "Exited with code 0.") return c.summary;
  return c.exitCode === 0 ? "Exit code 0" : null;
}

/** The step the worker is executing now, if any. */
export function activeStep(steps: InvestigationStep[]): InvestigationStep | null {
  return steps.find((s) => s.state === "running") ?? null;
}
