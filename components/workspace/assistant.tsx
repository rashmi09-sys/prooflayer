"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookCheck, GitCommitHorizontal, Route } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import type { CommitDiff } from "@/lib/server/providers.ts";
import { answer, PROMPTS, type Answer, type AnswerBasis, type PromptId } from "@/lib/ui/assistant.ts";

const BASIS: Record<AnswerBasis, { label: string; Icon: typeof Route; title: string }> = {
  recorded: { label: "From recorded evidence", Icon: BookCheck, title: "Read from this run's stored checks, output and screenshot." },
  git: { label: "From recorded evidence and git", Icon: GitCommitHorizontal, title: "Recorded check outcomes plus the repository's own diff." },
  rule: { label: "Rule-based guidance", Icon: Route, title: "A fixed rule written into ProofLayer, applied to recorded evidence. Not a model." },
};

/**
 * Investigation assistant. Each prompt runs a fixed function over recorded
 * evidence; the label on every answer says so. No language model is used
 * here, and nothing is phrased as if one were.
 */
export function Assistant({
  detail,
  onFocusPreview,
  onOpenLog,
}: {
  detail: RunDetail;
  onFocusPreview: () => void;
  onOpenLog: (key: string) => void;
}) {
  const [asked, setAsked] = useState<Answer[]>([]);
  const [busy, setBusy] = useState<PromptId | null>(null);
  const diff = useRef<CommitDiff | null | undefined>(undefined);
  const { run, lastPassed } = detail;
  const done = run.status === "completed";

  async function loadDiff(): Promise<CommitDiff | null> {
    if (diff.current !== undefined) return diff.current;
    if (!lastPassed || lastPassed.id === run.id) return (diff.current = null);
    try {
      const res = await fetch(`/api/projects/${run.projectSlug}/diff?base=${lastPassed.commitSha}&head=${run.commitSha}`, { cache: "no-store" });
      diff.current = res.ok ? ((await res.json()) as CommitDiff) : null;
    } catch {
      diff.current = null;
    }
    return diff.current;
  }

  async function ask(id: PromptId) {
    setBusy(id);
    const d = id === "what-changed" || id === "inspect-next" ? await loadDiff() : null;
    const a = answer(id, detail, d);
    setAsked((prev) => [a, ...prev.filter((p) => p.id !== id)]);
    setBusy(null);
  }

  const compareHref = lastPassed && lastPassed.id !== run.id ? `/p/${run.projectSlug}/compare?base=${lastPassed.id}&head=${run.id}` : null;

  return (
    <section aria-labelledby="assistant-heading" className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <h2 id="assistant-heading" className="text-sm font-semibold text-ink">
        Ask about this run
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-3">Answers come from this run&apos;s recorded evidence and fixed rules. No language model is involved.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => ask(p.id)}
            disabled={busy !== null || (!done && p.id !== "what-failed" && p.id !== "which-check")}
            className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-left text-xs font-medium text-ink-2 transition-colors duration-200 hover:border-accent/40 hover:bg-accent-soft hover:text-accent-ink disabled:opacity-50 disabled:hover:border-line-strong disabled:hover:bg-surface disabled:hover:text-ink-2"
          >
            {busy === p.id ? "Reading…" : p.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-1">
        <AnimatePresence initial={false}>
          {asked.map((a) => {
            const b = BASIS[a.basis];
            const prompt = PROMPTS.find((p) => p.id === a.id)!;
            return (
              <motion.article
                key={a.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="mt-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-ink">{prompt.label}</h3>
                  <span title={b.title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10.5px] font-medium ${a.basis === "rule" ? "border-line-strong text-ink-3" : "border-line-strong bg-surface text-ink-2"}`}>
                    <b.Icon className="size-3" aria-hidden /> {b.label}
                  </span>
                </header>
                <ul className="mt-2 space-y-1.5">
                  {a.lines.map((l, i) => (
                    <li key={i} className="text-[13px] leading-snug text-ink-2">
                      {l.text}
                      {l.code ? (
                        <>
                          {l.text.endsWith(":") ? " " : ": "}
                          <code className="rounded bg-surface [overflow-wrap:anywhere] px-1 py-px font-mono text-[12px] text-ink">{l.code}</code>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {a.action ? (
                  a.action.kind === "compare" ? (
                    compareHref ? (
                      <Link href={compareHref} className="mt-2.5 inline-flex min-h-7 items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                        {a.action.label} <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    ) : null
                  ) : (
                    <button
                      type="button"
                      onClick={() => (a.action!.kind === "focus-preview" ? onFocusPreview() : a.action!.key && onOpenLog(a.action!.key))}
                      className="mt-2.5 inline-flex min-h-7 items-center gap-1 text-xs font-medium text-accent-ink hover:underline"
                    >
                      {a.action.label} <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  )
                ) : null}
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
