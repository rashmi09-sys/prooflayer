import { History } from "lucide-react";
import { projectContext } from "@/lib/server/page-context.ts";
import { workerOnline } from "@/lib/server/health.ts";
import { listRunsForProject } from "@/lib/server/store.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { ButtonLink, EmptyState, Panel } from "@/components/ui.tsx";
import { HistoryTable } from "@/components/history-table.tsx";
import { AutoRefresh } from "@/components/auto-refresh.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs" };

export default async function RunsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { viewer, user, project } = await projectContext(slug);
  const runs = listRunsForProject(user.id, project.id, 200);
  return (
    <AppShell projectSlug={project.slug}>
      {runs.some((r) => r.status !== "completed") ? <AutoRefresh /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[2.25rem] leading-tight tracking-[-0.03em] text-ink">Runs</h1>
          <p className="mt-1 text-sm text-ink-3">Every check of {project.name}, newest first, including repair attempts. Tick two to compare.</p>
        </div>
        {viewer.operator && workerOnline() ? (
          <ButtonLink href={`/p/${project.slug}/verify`} variant="primary" size="sm">
            Check a change
          </ButtonLink>
        ) : (
          <span className="text-sm text-ink-3">{viewer.operator ? "Worker offline · live checks are off" : "Recorded runs · read-only"}</span>
        )}
      </div>
      <Panel className="mt-6">
        {runs.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" aria-hidden />}
            title="No runs recorded yet"
            action={viewer.operator ? <ButtonLink href={`/p/${project.slug}/verify`} variant="primary" size="sm">Choose a commit to verify</ButtonLink> : undefined}
          >
            History fills in as you verify commits.
          </EmptyState>
        ) : (
          <HistoryTable runs={runs} compareHref={`/p/${project.slug}/compare`} />
        )}
      </Panel>
    </AppShell>
  );
}
