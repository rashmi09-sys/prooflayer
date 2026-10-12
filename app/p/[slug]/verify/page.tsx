import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Terminal } from "lucide-react";
import { operatorProjectContext } from "@/lib/server/page-context.ts";
import { getArtifacts, listRunsForProject } from "@/lib/server/store.ts";
import { providerFor, ProviderError } from "@/lib/server/providers.ts";
import { systemHealth } from "@/lib/server/health.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { Notice } from "@/components/ui.tsx";
import { CommitPicker, type PickerCommit } from "@/components/verify/commit-picker.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify" };

export default async function VerifyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ run?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  // Older links opened a run inside this page; runs now live in their workspace.
  if (q.run && /^run_[A-Za-z0-9]+$/.test(q.run)) redirect(`/runs/${q.run}`);
  const { user, project } = await operatorProjectContext(slug);

  let branch = project.connection.defaultBranch;
  let commits: PickerCommit[] = [];
  let repoError: string | null = null;
  const runs = listRunsForProject(user.id, project.id, 200);
  try {
    const provider = providerFor(project);
    const branches = await provider.branches();
    branch = branches.find((b) => b.name === project.connection.defaultBranch)?.name ?? branches[0]?.name ?? branch;
    const list = await provider.commits(branch, 10);
    commits = list.map((c) => {
      const forCommit = runs.filter((r) => r.commitSha === c.sha);
      const latest = forCommit[0] ?? null;
      let preview: PickerCommit["preview"] = null;
      for (const r of forCommit) {
        const shot = getArtifacts(r.id).find((a) => a.kind === "screenshot");
        if (shot) {
          preview = { runId: r.id, artifact: shot };
          break;
        }
      }
      return { ...c, latest: latest ? { runId: latest.id, status: latest.status, verdict: latest.verdict } : null, preview };
    });
  } catch (e) {
    repoError = e instanceof ProviderError ? e.message : "The repository could not be read.";
  }
  const active = runs.find((r) => r.status !== "completed") ?? null;
  const health = systemHealth();

  return (
    <AppShell projectSlug={project.slug}>
      <h1 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.03em] text-ink">Check a change</h1>
      <p className="mt-1 max-w-[62ch] text-sm text-ink-3">
        Pick a commit from <code className="font-mono text-ink-2">{project.connection.fullName}</code> · {branch}. NeverBreak checks every protected flow on it, in a sandbox and a real browser. You&apos;ll watch it live.
      </p>
      <div className="mt-5 space-y-3 empty:hidden">
        {active ? (
          <Notice tone="info" title="A verification is in progress" action={<Link href={`/runs/${active.id}`} className="inline-flex h-8 items-center gap-1 text-sm font-medium text-accent-ink hover:underline">Watch it <ArrowRight className="size-4" aria-hidden /></Link>}>
            New runs wait in the queue; one runs at a time.
          </Notice>
        ) : null}
        {!health.worker.online ? (
          <Notice tone="warn" title="The worker isn't running">
            <span className="inline-flex items-center gap-1.5"><Terminal className="size-3.5" aria-hidden /> Runs will queue until it starts: <code className="font-mono text-xs">npm run worker</code></span>
          </Notice>
        ) : null}
        {repoError ? <Notice tone="fail" title="The repository couldn't be read">{repoError}</Notice> : null}
      </div>
      <div className="mt-6">
        <CommitPicker project={project.slug} branch={branch} commits={commits} activeRunId={active?.id ?? null} />
      </div>
    </AppShell>
  );
}
