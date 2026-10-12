import Link from "next/link";
import { ArrowRight, GitCommitHorizontal } from "lucide-react";
import type { RepoCommit, RunArtifact, RunStatus, Verdict } from "@/lib/shared/types.ts";
import { relativeTime, shortSha } from "@/lib/ui/format.ts";
import { RenderedPage } from "../proof-stage.tsx";
import { RunningBadge, VerdictBadge } from "../status.tsx";
import { VerifyButton } from "../verify-button.tsx";

export interface PickerCommit extends RepoCommit {
  latest: { runId: string; status: RunStatus; verdict: Verdict | null } | null;
  preview: { runId: string; artifact: RunArtifact } | null;
}

/** Pick a commit, start a real run, and land in its live workspace. */
export function CommitPicker({ project, branch, commits, activeRunId }: { project: string; branch: string; commits: PickerCommit[]; activeRunId: string | null }) {
  return (
    <ol className="space-y-3">
      {commits.map((c, i) => (
        <li key={c.sha} className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_200px] sm:p-5 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <GitCommitHorizontal className="size-3.5" aria-hidden />
              <code className="font-mono text-ink-2">{shortSha(c.sha)}</code>
              <span>{relativeTime(c.date)}</span>
              {i === 0 ? <span className="rounded-full bg-accent-soft px-2 py-px font-medium text-accent-ink">Latest on {branch}</span> : null}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{c.message}</p>
            <p className="mt-0.5 text-xs text-ink-3">{c.author}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.latest ? (
                <>
                  {c.latest.verdict ? <VerdictBadge verdict={c.latest.verdict} /> : <RunningBadge queued={c.latest.status === "queued"} />}
                  <Link href={`/runs/${c.latest.runId}`} className="inline-flex min-h-7 items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                    {c.latest.status === "completed" ? "Open last verification" : "Watch it live"} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </>
              ) : (
                <span className="text-xs text-ink-3">Never verified</span>
              )}
            </div>
          </div>
          <div className="min-w-0">
            {c.preview ? (
              <div title={`Real screenshot from run ${c.preview.runId}`}>
                <RenderedPage artifact={c.preview.artifact} runId={c.preview.runId} commitSha={c.sha} caption={false} annotate={false} tone="light" animate={false} />
              </div>
            ) : (
              <div className="grid aspect-[16/9] place-items-center rounded-xl border border-dashed border-line-strong px-3 text-center text-[11px] text-ink-3">No screenshot recorded</div>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <VerifyButton project={project} branch={branch} sha={c.sha} label={activeRunId ? "Queue" : "Verify"} variant={i === 0 ? "primary" : "secondary"} />
          </div>
        </li>
      ))}
    </ol>
  );
}
