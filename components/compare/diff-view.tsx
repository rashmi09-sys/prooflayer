import { FileCode2 } from "lucide-react";
import type { CommitDiff } from "@/lib/server/providers.ts";

/** The repository's own diff between two commits, as git reported it. */
export function DiffView({ diff }: { diff: CommitDiff }) {
  if (!diff.files.length) return <p className="text-sm text-ink-3">The two commits have identical files.</p>;
  return (
    <div className="space-y-3">
      {diff.files.map((f, i) => (
        <details key={f.path} open={i < 2} className="group overflow-hidden rounded-xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
            <FileCode2 className="size-4 shrink-0 text-ink-3" aria-hidden />
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{f.path}</code>
            <span className="shrink-0 font-mono text-xs">
              <span className="text-pass">+{f.additions}</span> <span className="text-fail">−{f.deletions}</span>
            </span>
          </summary>
          {f.patch ? (
            <pre className="pl-scroll relative overflow-x-auto border-t border-line bg-log-bg py-2 font-mono text-[12px] leading-[1.6]" tabIndex={0} aria-label={`Changes to ${f.path}`}>
              {f.patch.split("\n").map((l, j) => {
                const add = l.startsWith("+") && !l.startsWith("+++");
                const del = l.startsWith("-") && !l.startsWith("---");
                const hunk = l.startsWith("@@");
                if (l.startsWith("diff --git") || l.startsWith("index ") || l.startsWith("+++") || l.startsWith("---")) return null;
                return (
                  <span key={j} className={`block whitespace-pre px-4 ${add ? "bg-[#4cc98d]/12 text-[#9be3bd]" : del ? "bg-[#ff7b6c]/12 text-[#ffb3a9]" : hunk ? "text-[#a5a3ff]" : "text-log-dim"}`}>
                    <span className="sr-only">{add ? "added: " : del ? "removed: " : ""}</span>
                    {l || " "}
                  </span>
                );
              })}
            </pre>
          ) : (
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Patch not shown (lockfile, binary or too large).</p>
          )}
        </details>
      ))}
      {diff.truncated ? <p className="text-xs text-ink-3">Some patches were cut short to keep the page fast.</p> : null}
    </div>
  );
}
