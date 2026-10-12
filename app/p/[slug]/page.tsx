import Link from "next/link";
import { ArrowRight, Cpu, GitCompareArrows, History, Radio, ScrollText, Terminal, Unplug } from "lucide-react";
import { projectContext } from "@/lib/server/page-context.ts";
import { listRunsForProject } from "@/lib/server/store.ts";
import { loadRunViewFor } from "@/lib/server/run-detail.ts";
import { systemHealth } from "@/lib/server/health.ts";
import { providerFor } from "@/lib/server/providers.ts";
import { ensureFlows } from "@/lib/server/neverbreak.ts";
import { projectMeta } from "@/lib/projects-meta.ts";
import { headline } from "@/lib/ui/neverbreak.ts";
import type { RepoCommit } from "@/lib/shared/types.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { Monogram } from "@/components/shell.tsx";
import { VerifyButton } from "@/components/verify-button.tsx";
import { AutoRefresh } from "@/components/auto-refresh.tsx";
import { OutcomeBanner } from "@/components/neverbreak/outcome-banner.tsx";
import { VisualProof } from "@/components/neverbreak/visual-proof.tsx";
import { FlowList } from "@/components/neverbreak/flow-list.tsx";
import { RepairPanel } from "@/components/neverbreak/repair-panel.tsx";
import { Studio } from "@/components/showcase/studio.tsx";
import { loadShowcase } from "@/lib/server/showcase.ts";
import { relativeTime, shortSha } from "@/lib/ui/format.ts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `${(await params).slug} workspace` };
}

export default async function ProjectWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { viewer, user, project } = await projectContext(slug);
  // Projects with recorded customer journeys get the full NeverBreak showcase.
  if (projectMeta(project.slug).stages) {
    const data = await loadShowcase(user.id, project.slug);
    if (data?.source) {
      return (
        <AppShell projectSlug={project.slug} minimal>
          <Studio initial={data} operator={viewer.operator} />
        </AppShell>
      );
    }
  }
  const meta = projectMeta(project.slug);
  const runs = listRunsForProject(user.id, project.id, 40);
  const health = systemHealth();
  const flows = ensureFlows(user.id, project);

  let head: (RepoCommit & { branch: string }) | null = null;
  let repoError: string | null = null;
  try {
    const provider = providerFor(project);
    const branches = await provider.branches();
    const b = branches.find((x) => x.name === project.connection.defaultBranch) ?? branches[0];
    if (b) head = { ...(await provider.resolve(b.headSha)), branch: b.name };
  } catch (e) {
    repoError = (e as Error).message;
  }

  // The latest AI change is the head of the default branch; show its newest check,
  // or the newest check of anything if the head hasn't been checked yet.
  const latest = (head ? runs.find((r) => !r.isRepair && r.commitSha === head!.sha) : null) ?? runs.find((r) => !r.isRepair) ?? null;
  const detail = latest ? await loadRunViewFor(viewer, latest.id) : null;
  const active = runs.find((r) => r.status !== "completed") ?? null;
  const nbv = detail?.neverbreak;
  const repairing =
    nbv?.repair?.status === "running" ||
    (!!nbv?.autoRepair && !nbv.repair && nbv.availability.ok && detail?.run.verdict === "failed" && !!detail.run.finishedAt && Date.now() - new Date(detail.run.finishedAt).getTime() < 60_000);
  const h = detail ? headline(detail) : null;
  const headUnverified = head && !runs.some((r) => r.commitSha === head!.sha);

  return (
    <AppShell projectSlug={project.slug} wide>
      {active || repairing ? <AutoRefresh intervalMs={2500} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-3">
          <Monogram name={project.name} />
          <span className="font-semibold text-ink">{project.name}</span>
          <span>{meta.kind}</span>
          {meta.fixture ? (
            <span className="rounded-full border border-line-strong px-2 py-px text-[11px] font-medium text-ink-2" title="A small app kept for this demo. Its commits were written to look like an AI agent's work.">
              Example app
            </span>
          ) : null}
        </p>
        {head ? (
          <div className="flex items-center gap-2">
            {detail ? (
              <Link href={`/runs/${detail.run.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2">
                <ScrollText className="size-4 text-ink-3" aria-hidden /> Run details
              </Link>
            ) : null}
            {viewer.operator && health.worker.online ? (
              <VerifyButton project={project.slug} branch={head.branch} sha={head.sha} label={headUnverified ? "Check the latest change" : "Check again"} variant={detail?.run.verdict === "failed" ? "secondary" : "primary"} />
            ) : (
              <RecordedPill />
            )}
          </div>
        ) : null}
      </div>

      {repoError ? (
        <p className="mt-10 flex items-start gap-2 text-base text-ink-2">
          <Unplug className="mt-1 size-4 shrink-0 text-ink-3" aria-hidden /> {repoError}
        </p>
      ) : !detail ? (
        <section className="mt-12 max-w-[640px]">
          <h1 className="text-[2.4rem] leading-[1.05] tracking-[-0.035em] text-ink">Your AI builds it. We make sure it keeps working.</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-2">NeverBreak learns the flows that work, then checks them after every AI change.{viewer.operator ? " Run the first check to begin." : " No check has been recorded for this project yet."}</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="change-heading" className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">{head && detail.run.commitSha === head.sha ? "Latest AI change" : "Last change checked"}</p>
            <h1 id="change-heading" className="mt-1.5 max-w-[46ch] text-[1.8rem] leading-[1.12] tracking-[-0.03em] text-ink sm:text-[2.35rem]">
              “{detail.run.commitMessage ?? shortSha(detail.run.commitSha)}”
            </h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-3">
              <code className="font-mono text-ink-2">{shortSha(detail.run.commitSha)}</code>
              {detail.run.commitAuthor ? <span>by {detail.run.commitAuthor}</span> : null}
              {detail.neverbreak?.changedFiles ? <span>{detail.neverbreak.changedFiles.length} files changed</span> : null}
              <span>{detail.run.status === "completed" ? `checked ${relativeTime(detail.run.finishedAt)}` : "being checked now"}</span>
            </p>
          </section>

          {h ? <OutcomeBanner tone={h.tone} title={h.title} sub={h.sub} /> : null}

          {detail.run.status !== "completed" ? (
            <Link href={`/runs/${detail.run.id}`} className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-surface px-5 py-4 hover:border-accent/40">
              <span className="flex items-center gap-3 text-[15px] font-medium text-ink">
                <Radio className="size-5 text-accent" aria-hidden /> Watch this check live
              </span>
              <ArrowRight className="size-4 text-ink-3" aria-hidden />
            </Link>
          ) : null}

          <div className="mt-6">
            <VisualProof detail={detail} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-labelledby="flows-heading" className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="flows-heading" className="text-base font-semibold text-ink">
                  Protected flows
                </h2>
                <Link href={`/p/${project.slug}/flows`} className="text-sm font-medium text-accent-ink hover:underline">
                  {flows.length} protected · Manage
                </Link>
              </div>
              <p className="mt-0.5 text-sm text-ink-3">The flows that worked before, checked again on this change.</p>
              <div className="mt-3">
                <FlowList results={detail.neverbreak?.flows ?? []} />
              </div>
            </section>

            <aside aria-label="Next steps" className="min-w-0 space-y-4">
              <h2 className="text-base font-semibold text-ink">Next</h2>
              <RepairPanel detail={detail} />
              {detail.neverbreak?.baseline && detail.run.status === "completed" ? (
                <Link
                  href={`/p/${project.slug}/compare?base=${detail.neverbreak.baseline.runId}&head=${detail.run.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong"
                >
                  <span className="flex items-center gap-3">
                    <GitCompareArrows className="size-5 text-accent" aria-hidden />
                    <span>
                      <span className="block text-[15px] font-medium text-ink">Compare before and after</span>
                      <span className="block text-sm text-ink-3">What worked, what broke{detail.neverbreak.repair ? ", what the repair restored" : ""}</span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-ink-3" aria-hidden />
                </Link>
              ) : null}
              <Link href={`/runs/${detail.run.id}#background`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-5 py-4 transition-colors hover:border-line-strong">
                <span className="flex items-center gap-3">
                  <Cpu className="size-5 text-ink-3" aria-hidden />
                  <span>
                    <span className="block text-[15px] font-medium text-ink">Behind the scenes</span>
                    <span className="block text-sm text-ink-3">{viewer.operator ? "Sandbox steps, logs and exit codes" : "Sandbox steps, commands and exit codes"}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 text-ink-3" aria-hidden />
              </Link>
            </aside>
          </div>
        </>
      )}

      {viewer.operator && !health.worker.online ? (
        <p role="status" className="mt-6 inline-flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-ink-2">
          <Terminal className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden /> The worker isn&apos;t running, so new checks will wait. Start it with <code className="font-mono text-xs">npm run worker</code>.
        </p>
      ) : null}
    </AppShell>
  );
}

/** Shown in place of run controls in the public demo: what you see was recorded, nothing here runs. */
function RecordedPill() {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-ink-2" title="Public demo: recorded runs, read-only">
      <History className="size-4 text-ink-3" aria-hidden /> Recorded result
    </span>
  );
}
