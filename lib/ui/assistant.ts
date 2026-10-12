import type { RunDetail } from "../server/run-detail.ts";
import type { CommitDiff } from "../server/providers.ts";
import { primaryShot } from "../shared/flows.ts";

// The investigation assistant. Every answer is assembled from recorded
// evidence or from fixed rules written in this file; nothing is generated.
// Each answer says which, so it can never be mistaken for a model's reply.

export type PromptId = "what-failed" | "evidence" | "which-check" | "what-changed" | "inspect-next";

export const PROMPTS: Array<{ id: PromptId; label: string }> = [
  { id: "what-failed", label: "What failed?" },
  { id: "evidence", label: "Show me the evidence" },
  { id: "which-check", label: "Which check caught this?" },
  { id: "what-changed", label: "What changed since the last passing run?" },
  { id: "inspect-next", label: "What should I inspect next?" },
];

export type AnswerBasis = "recorded" | "rule" | "git";

export interface AnswerLine {
  text: string;
  /** Rendered in a monospace face: values, paths, commands. */
  code?: string;
}

export interface Answer {
  id: PromptId;
  basis: AnswerBasis;
  lines: AnswerLine[];
  /** A follow-up the interface can perform for the reader. */
  action?: { kind: "focus-preview" | "open-log" | "compare"; label: string; key?: string };
}

type Detail = Pick<RunDetail, "run" | "checks" | "proofs" | "artifacts" | "excerpts" | "locations" | "lastPassed" | "sinceLastPassed" | "evidence">;

function failing(d: Detail) {
  return d.checks.filter((c) => c.required && (c.status === "failed" || c.status === "error"));
}

function pageMatch(d: Detail) {
  return d.artifacts.flatMap((a) => a.annotations?.matches ?? []).find((m) => m.role === "received" && m.found) ?? null;
}

export function answer(id: PromptId, d: Detail, diff?: CommitDiff | null): Answer {
  switch (id) {
    case "what-failed":
      return whatFailed(d);
    case "evidence":
      return evidence(d);
    case "which-check":
      return whichCheck(d);
    case "what-changed":
      return whatChanged(d, diff ?? null);
    case "inspect-next":
      return inspectNext(d, diff ?? null);
  }
}

function whatFailed(d: Detail): Answer {
  const { run } = d;
  if (run.status !== "completed") return { id: "what-failed", basis: "recorded", lines: [{ text: "Nothing has been judged yet. The verdict is decided only after every required check has recorded an exit code." }] };
  if (run.verdict === "passed") return { id: "what-failed", basis: "recorded", lines: [{ text: "Nothing. Every required check exited 0 on this commit." }] };
  if (run.verdict === "incomplete") {
    const e = d.checks.find((c) => c.status === "error");
    return { id: "what-failed", basis: "recorded", lines: [{ text: "The verification environment failed, not the code, so the code wasn't judged." }, ...(e ? [{ text: `${e.name}: ${e.summary ?? "environment error"}` }] : [])] };
  }
  if (run.verdict === "cancelled") return { id: "what-failed", basis: "recorded", lines: [{ text: "The run was cancelled before it finished, so there is no verdict on the code." }] };

  const lines: AnswerLine[] = [];
  const p = d.proofs[0];
  if (p?.kind === "assertion") {
    const a = p.items[0];
    lines.push({ text: `The test “${a.name}” expected one value and received another.` });
    if (a.expected !== null && a.actual !== null) lines.push({ text: "Expected", code: a.expected }, { text: "Received", code: a.actual });
    const m = pageMatch(d);
    if (m?.text) lines.push({ text: "The built page shows the same wrong value", code: m.text });
  } else if (p?.kind === "type") {
    const t = p.items[0];
    lines.push({ text: t.expectedType && t.receivedType ? `A ${t.receivedType} is passed where a ${t.expectedType} is required.` : t.message, code: `${t.file}:${t.line}` });
  } else if (p?.kind === "lint") {
    lines.push({ text: `${p.items.length} lint ${p.items.length === 1 ? "error" : "errors"}, first:`, code: `${p.items[0].file}:${p.items[0].line} ${p.items[0].message}` });
  }
  const names = failing(d).map((c) => c.name);
  if (names.length) lines.push({ text: `Failed checks: ${names.join(", ")}.` });
  return { id: "what-failed", basis: "recorded", lines };
}

function evidence(d: Detail): Answer {
  const lines: AnswerLine[] = [];
  const p = d.proofs[0];
  if (p?.kind === "assertion") {
    const a = p.items[0];
    if (a.expected !== null && a.actual !== null) lines.push({ text: `Test runner: expected ${a.expected}, received ${a.actual}` });
    if (a.file) lines.push({ text: "Assertion location", code: `${a.file}:${a.line}` });
    if (a.relation) lines.push({ text: `Computed: ${a.relation.text}` });
  } else if (p?.kind === "type") {
    lines.push({ text: `Compiler: ${p.items[0].code}`, code: `${p.items[0].file}:${p.items[0].line}` });
  } else if (p?.kind === "lint") {
    lines.push({ text: "Linter", code: `${p.items[0].file}:${p.items[0].line}` });
  }
  for (const c of d.checks.filter((x) => x.required && x.exitCode !== null)) lines.push({ text: `${c.name} exited`, code: String(c.exitCode) });
  const shot = primaryShot(d.artifacts) ?? undefined;
  if (shot) {
    const m = pageMatch(d);
    lines.push({ text: `Chromium screenshot of ${shot.pageUrl}, SHA-256`, code: shot.sha256.slice(0, 16) + "…" });
    if (m?.text) lines.push({ text: "Found in the page text", code: m.text });
  } else {
    const snap = d.checks.find((c) => c.key === "snapshot");
    lines.push({ text: `No screenshot: ${snap?.summary ?? "the browser step didn't run for this run."}` });
  }
  return { id: "evidence", basis: "recorded", lines, action: shot ? { kind: "focus-preview", label: "Look at the screenshot" } : undefined };
}

function whichCheck(d: Detail): Answer {
  const f = failing(d);
  if (!f.length) {
    const done = d.checks.filter((c) => c.required && c.status === "passed");
    return { id: "which-check", basis: "recorded", lines: [{ text: d.run.status === "completed" ? `None. ${done.length} required checks passed.` : "No check has failed so far." }] };
  }
  const first = f[0];
  const lines: AnswerLine[] = [{ text: `${first.name} caught it first.` }];
  if (first.command) lines.push({ text: "Command", code: first.command });
  lines.push({ text: "Exit code", code: String(first.exitCode ?? "none") });
  if (first.summary) lines.push({ text: first.summary });
  if (f.length > 1) lines.push({ text: `Also failed: ${f.slice(1).map((c) => c.name).join(", ")}.` });
  return { id: "which-check", basis: "recorded", lines, action: { kind: "open-log", label: `Open the ${first.name.toLowerCase()} log`, key: first.key } };
}

function whatChanged(d: Detail, diff: CommitDiff | null): Answer {
  const lp = d.lastPassed;
  if (!lp) return { id: "what-changed", basis: "recorded", lines: [{ text: "No run on this project has passed yet, so there is nothing to compare against." }] };
  if (lp.id === d.run.id) return { id: "what-changed", basis: "recorded", lines: [{ text: "This run is the most recent pass on record." }] };
  const lines: AnswerLine[] = [{ text: "Last passing commit", code: lp.commitSha.slice(0, 7) }];
  const newly = d.sinceLastPassed.filter((c) => c.kind === "newly_failing").map((c) => c.name);
  const recovered = d.sinceLastPassed.filter((c) => c.kind === "now_passing").map((c) => c.name);
  if (newly.length) lines.push({ text: `Started failing: ${newly.join(", ")}.` });
  if (recovered.length) lines.push({ text: `Recovered: ${recovered.join(", ")}.` });
  if (diff) {
    lines.push({ text: `${diff.files.length} ${diff.files.length === 1 ? "file" : "files"} changed between the two commits:` });
    for (const f of diff.files.slice(0, 6)) lines.push({ text: `+${f.additions} −${f.deletions}`, code: f.path });
  }
  return { id: "what-changed", basis: diff ? "git" : "recorded", lines, action: { kind: "compare", label: "Open the before/after comparison" } };
}

/** Fixed rules, in order. The first that applies is the advice. */
function inspectNext(d: Detail, diff: CommitDiff | null): Answer {
  const p = d.proofs[0];
  const lines: AnswerLine[] = [];
  if (d.run.status !== "completed") return { id: "inspect-next", basis: "rule", lines: [{ text: "Wait for the verdict. Guidance is based on the finished run." }] };
  if (d.run.verdict === "passed") return { id: "inspect-next", basis: "rule", lines: [{ text: "Nothing failed. Passing means these checks exited 0; review behaviour the tests don't cover yourself." }] };
  if (d.run.verdict === "incomplete") return { id: "inspect-next", basis: "rule", lines: [{ text: "Fix the environment problem in the step's log, then run again. The code was not judged." }], action: { kind: "open-log", label: "Open the log", key: d.checks.find((c) => c.status === "error")?.key } };

  const changedSource = diff?.files.filter((f) => !/(^|\/)(tests?|__tests__)\/|\.test\.|\.spec\./.test(f.path) && !/lock/.test(f.path)) ?? [];
  if (p?.kind === "assertion") {
    lines.push({ text: "A test assertion failed. Rule: start with the code the test exercises, not the test." });
    if (changedSource.length) lines.push({ text: "Source files changed since the last pass", code: changedSource.map((f) => f.path).join(", ") });
    const a = p.items[0];
    if (a.file) lines.push({ text: "Then read the assertion", code: `${a.file}:${a.line}` });
  } else if (p?.kind === "type" || p?.kind === "lint") {
    const it = p.items[0];
    lines.push({ text: `The ${p.kind === "type" ? "compiler" : "linter"} gives an exact location. Rule: open it first.`, code: `${it.file}:${it.line}` });
  } else {
    lines.push({ text: "No structured failure was parsed. Rule: read the end of the failing check's log." });
  }
  return { id: "inspect-next", basis: "rule", lines };
}
