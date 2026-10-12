"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, GitBranch, GitCommitHorizontal } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { formatTimestamp, shortSha } from "@/lib/ui/format.ts";
import { type SourceKind } from "../provenance.tsx";

interface Fact {
  text: React.ReactNode;
  source: SourceKind;
}

/** Deterministic statements about the run, each with its source. */
export function facts(d: RunDetail): Fact[] {
  const out: Fact[] = [];
  const { run, checks, proofs } = d;
  if (run.verdict && run.verdictReason) out.push({ text: run.verdictReason.replace(/ This is not evidence that the code is broken\.$/, ""), source: "exit-codes" });
  const seen = new Set<string>();
  for (const p of proofs) {
    const first = p.kind === "type" || p.kind === "lint" ? `${p.kind}:${p.items[0].file}:${p.items[0].line}` : `${p.kind}:${p.checkId}`;
    if (seen.has(first)) continue; // e.g. the build repeats the type checker's errors
    seen.add(first);
    if (p.kind === "assertion") {
      const a = p.items[0];
      if (a.expected !== null && a.actual !== null)
        out.push({ text: <>“{a.name}” expected <code className="font-mono">{a.expected}</code> and received <code className="font-mono">{a.actual}</code>.</>, source: "test-runner" });
      if (a.relation) out.push({ text: a.relation.text, source: "computed" });
    } else if (p.kind === "type") {
      const t = p.items[0];
      out.push({ text: <>{t.code} at <code className="font-mono">{t.file}:{t.line}</code>{p.items.length > 1 ? `, plus ${p.items.length - 1} more` : ""}.</>, source: "compiler" });
    } else if (p.kind === "lint") {
      out.push({ text: <>{p.items.length} lint {p.items.length === 1 ? "error" : "errors"}, first at <code className="font-mono">{p.items[0].file}:{p.items[0].line}</code>.</>, source: "linter" });
    }
  }
  const passed = checks.filter((c) => c.required && c.status === "passed").map((c) => c.name);
  const required = checks.filter((c) => c.required).length;
  if (run.status === "completed" && passed.length > 0 && passed.length < required) {
    out.push({ text: `${listNames(passed)} passed.`, source: "exit-codes" });
  }
  const changes = d.sinceLastPassed.filter((c) => c.kind === "newly_failing" || c.kind === "now_passing");
  if (changes.length && d.lastPassed) {
    const newly = changes.filter((c) => c.kind === "newly_failing").map((c) => c.name);
    const recovered = changes.filter((c) => c.kind === "now_passing").map((c) => c.name);
    out.push({
      text: `Since ${shortSha(d.lastPassed.commitSha)} last passed: ${[newly.length ? `${listNames(newly)} started failing` : "", recovered.length ? `${listNames(recovered)} recovered` : ""].filter(Boolean).join("; ")}.`,
      source: "computed",
    });
  }
  const snap = checks.find((c) => c.key === "snapshot");
  if (snap?.status === "passed" && d.artifacts.length > 0) out.push({ text: "A screenshot of the built page was captured.", source: "browser" });
  return out;
}

function listNames(n: string[]) {
  return n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export function CommitCard({ detail }: { detail: RunDetail }) {
  const { run } = detail;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(run.commitSha);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* blocked */
    }
  }
  return (
    <section aria-labelledby="commit-heading" className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <h2 id="commit-heading" className="text-sm font-semibold text-ink">
        Commit
      </h2>
      <p className="mt-2 text-sm leading-snug text-ink">{run.commitMessage}</p>
      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <dt className="sr-only">SHA</dt>
          <GitCommitHorizontal className="size-3.5 text-ink-3" aria-hidden />
          <dd className="min-w-0 flex-1 truncate font-mono text-ink-2" title={run.commitSha}>
            {run.commitSha}
          </dd>
          <button type="button" onClick={copy} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={copied ? "Copied" : "Copy full SHA"}>
            {copied ? <Check className="size-3.5 text-pass" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Branch</dt>
          <GitBranch className="size-3.5 text-ink-3" aria-hidden />
          <dd className="text-ink-2">
            {run.branch} <span className="text-ink-3">in</span> <span className="font-mono">{run.repoFullName}</span>
          </dd>
        </div>
        <div className="flex gap-2 text-ink-3">
          <dt className="sr-only">Author</dt>
          <dd>
            {run.commitAuthor}
            {run.commitDate ? ` · committed ${formatTimestamp(run.commitDate)}` : ""}
          </dd>
        </div>
      </dl>
      {run.repoUrl ? (
        <a href={`${run.repoUrl}/commit/${run.commitSha}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline">
          View commit on GitHub
        </a>
      ) : null}
    </section>
  );
}

export function Activity({ detail }: { detail: RunDetail }) {
  return (
    <details className="group rounded-xl border border-line bg-surface shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-ink">
        Run activity
        <span className="flex items-center gap-2 text-xs font-normal text-ink-3">
          {detail.events.length} events
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <ol className="space-y-2 border-t border-line px-4 py-3">
        {detail.events.map((e) => (
          <li key={e.id} className="text-xs">
            <time className="tabular block font-mono text-[11px] text-ink-3" dateTime={e.ts}>
              {formatTimestamp(e.ts)}
            </time>
            <span className={e.level === "error" ? "text-fail" : e.level === "warn" ? "text-warn" : "text-ink-2"}>{e.message}</span>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-2.5 font-mono text-[11px] text-ink-3">{detail.run.id}</p>
    </details>
  );
}
