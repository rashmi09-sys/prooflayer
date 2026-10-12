"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { EvidenceRecord } from "@/lib/shared/types.ts";

export function LogViewer({ evidence, live, pending, skipped }: { evidence: EvidenceRecord | undefined; live: boolean; pending: boolean; skipped: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (live && follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [evidence?.content, live, follow]);

  if (!evidence) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-3">
        {pending ? "This step has not started. Output appears here as soon as the worker reaches it." : live ? "Waiting for the first output…" : skipped ? "This step did not run, so there is no output." : "No output was captured for this step."}
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(evidence!.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <span className="font-medium text-ink-2">Captured output</span>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-accent-ink">
              <span className="pl-live-dot size-1.5 rounded-full bg-accent" aria-hidden /> streaming from the sandbox
            </span>
          ) : null}
          <span className="tabular">{evidence.bytesTotal.toLocaleString("en-US")} bytes</span>
          {evidence.truncated ? <span className="text-warn">middle omitted to fit storage limits</span> : null}
        </p>
        <div className="flex items-center gap-1">
          {live ? (
            <label className="mr-2 flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[var(--accent)]" />
              Follow output
            </label>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {copied ? <Check className="size-3.5 text-pass" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy output"}
          </button>
        </div>
      </div>
      <pre
        ref={ref}
        tabIndex={0}
        aria-label="Captured command output"
        aria-live={live ? "off" : undefined}
        className="pl-scroll relative max-h-[420px] overflow-auto rounded-lg bg-log-bg px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-log-ink"
      >
        {evidence.content ? <HighlightedLog text={evidence.content} /> : <span className="text-log-dim">(no output)</span>}
      </pre>
      {evidence.sha256 ? (
        <p className="mt-2 truncate px-1 font-mono text-2xs text-ink-3" title={`SHA-256 of the stored output: ${evidence.sha256}`}>
          sha256 {evidence.sha256}
        </p>
      ) : null}
    </div>
  );
}

/** Colours error lines so they are findable; does not alter the text. */
function HighlightedLog({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const err = /error TS\d+|\berror\b|not ok |Error:|failed|✖|ERR!/i.test(line) && !/^#\s/.test(line);
        const ok = /^ok \d|✓|Compiled successfully|# pass [1-9]/.test(line);
        return (
          <span key={i} className={`block whitespace-pre-wrap break-words ${err ? "text-[#ff958a]" : ok ? "text-[#7fd6a7]" : ""}`}>
            {line || " "}
          </span>
        );
      })}
    </>
  );
}
