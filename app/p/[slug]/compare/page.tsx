import Link from "next/link";
import { ArrowRight, ChevronDown, EyeOff, GitCompareArrows } from "lucide-react";
import { projectContext } from "@/lib/server/page-context.ts";
import { getArtifacts, getChecks, getEvidence, getRunForUser, listRunsForProject } from "@/lib/server/store.ts";
import { changeBetween, ensureFlows } from "@/lib/server/neverbreak.ts";
import { baselineFor, getRepairForSource } from "@/lib/server/repair.ts";
import { buildProofs } from "@/lib/shared/proof.ts";
import { flowResults, type FlowResult, type ProtectedFlow } from "@/lib/shared/flows.ts";
import type { RunRecord } from "@/lib/shared/types.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { Button, EmptyState, Notice, Panel } from "@/components/ui.tsx";
import { CompareView } from "@/components/compare-view.tsx";
import { RenderedPage } from "@/components/proof-stage.tsx";
import { primaryShot } from "@/lib/shared/flows.ts";
import { DiffView } from "@/components/compare/diff-view.tsx";
import { FlowIcon, flowLabel } from "@/components/neverbreak/flow-list.tsx";
import { formatTimestamp, shortSha, VERDICT_COPY } from "@/lib/ui/format.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare" };

type Column = { key: "before" | "after" | "repair"; label: string; tone: "pass" | "fail" | "neutral"; run: RunRecord; results: FlowResult[] };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ base?: string; head?: string }> }) {
  const { slug } = await params;
  const { base: baseId, head: headId } = await searchParams;
  const { user, project } = await projectContext(slug);
  const completed = listRunsForProject(user.id, project.id, 200).filter((r) => r.status === "completed");
  const sources = completed.filter((r) => !r.isRepair);
  const flows = ensureFlows(user.id, project);

  // Default: the latest failing change against the last version that passed before it.
  const requested = Boolean(baseId || headId);
  let head: RunRecord | null = requested ? (headId ? getRunForUser(user.id, headId) : null) : (sources.find((r) => r.verdict === "failed") ?? sources[0] ?? null);
  let base: RunRecord | null = requested ? (baseId ? getRunForUser(user.id, baseId) : null) : head ? (baselineFor(head) ?? sources.find((r) => r.id !== head!.id) ?? null) : null;
  if (head && head.projectId !== project.id) head = null;
  if (base && base.projectId !== project.id) base = null;
  const valid = Boolean(base && head && base.status === "completed" && head.status === "completed");

  const repair = valid && !head!.isRepair ? getRepairForSource(head!.id) : null;
  const repairRunId = repair ? (repair.attempts.find((a) => a.outcome === "passed") ?? repair.attempts[repair.attempts.length - 1])?.runId : null;
  const repairRun = repairRunId ? getRunForUser(user.id, repairRunId) : null;

  const resultsFor = (r: RunRecord) => {
    const checks = getChecks(r.id);
    const evidence = getEvidence(r.id);
    return flowResults(flows, checks, evidence, buildProofs(checks, evidence), getArtifacts(r.id));
  };

  const columns: Column[] = valid
    ? [
        { key: "before", label: base!.verdict === "passed" ? "Passed before" : `${VERDICT_COPY[base!.verdict!].label} before`, tone: base!.verdict === "passed" ? "pass" : "fail", run: base!, results: resultsFor(base!) },
        { key: "after", label: head!.verdict === "passed" ? "Passed after the change" : "Failed after the change", tone: head!.verdict === "passed" ? "pass" : "fail", run: head!, results: resultsFor(head!) },
        ...(repairRun && repairRun.status === "completed"
          ? [{ key: "repair" as const, label: repairRun.verdict === "passed" ? "Passed after repair" : "Still failed after repair", tone: (repairRun.verdict === "passed" ? "pass" : "fail") as Column["tone"], run: repairRun, results: resultsFor(repairRun) }]
          : []),
      ]
    : [];

  const diff = valid ? await changeBetween(project, base!.commitSha, head!.commitSha) : null;
  const option = (r: (typeof completed)[number]) => `${r.verdict ? VERDICT_COPY[r.verdict].label : ""} · ${r.commitSha.slice(0, 7)}${r.isRepair ? " · repair" : ""} · ${r.commitMessage?.slice(0, 48) ?? ""}`;

  return (
    <AppShell projectSlug={project.slug} wide>
      <h1 className="text-[2.25rem] leading-tight tracking-[-0.03em] text-ink">Before and after</h1>
      <p className="mt-1 max-w-[62ch] text-[17px] text-ink-2">What worked before, what broke after the change{repair ? ", and whether the repair restored it" : ""}.</p>

      {completed.length < 2 ? (
        <Panel className="mt-6">
          <EmptyState icon={<GitCompareArrows className="size-5" aria-hidden />} title="Two completed runs are needed">
            Check at least two changes first.
          </EmptyState>
        </Panel>
      ) : !valid ? (
        <div className="mt-6">
          <Notice tone="warn" title="One of those runs isn't available">
            Pick two finished runs below.
          </Notice>
        </div>
      ) : (
        <>
          <section aria-label="Rendered app" className={`mt-7 grid gap-4 ${columns.length === 3 ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
            {columns.map((c) => (
              <ColumnCard key={c.key} c={c} annotate={c.key === "after"} />
            ))}
          </section>

          <section aria-labelledby="matrix-heading" className="mt-10">
            <h2 id="matrix-heading" className="text-base font-semibold text-ink">
              Protected flows
            </h2>
            <div className="relative mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Each protected flow before the change, after it, and after the repair</caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-ink-3">
                      Flow
                    </th>
                    {columns.map((c) => (
                      <th key={c.key} scope="col" className="px-4 py-3 text-xs font-medium text-ink-3">
                        {c.key === "before" ? "Before" : c.key === "after" ? "After change" : "After repair"} <code className="font-mono">{shortSha(c.run.commitSha)}</code>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {flows.map((f) => (
                    <FlowRow key={f.id} flow={f} columns={columns} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details className="group mt-10 rounded-[24px] border border-line bg-surface-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <span>
                <span className="block text-[15px] font-semibold text-ink">Behind the scenes</span>
                <span className="block text-sm text-ink-3">Required checks that changed outcome, and the code diff from git</span>
              </span>
              <ChevronDown className="size-5 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-8 border-t border-line px-5 py-6 sm:px-6">
              <div>
                <h3 className="text-sm font-semibold text-ink">Checks, from recorded exit codes</h3>
                <div className="mt-3">
                  <CompareView base={base!} head={head!} baseChecks={getChecks(base!.id)} headChecks={getChecks(head!.id)} hideCards />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Code changed: <code className="font-mono">{shortSha(base!.commitSha)}</code> → <code className="font-mono">{shortSha(head!.commitSha)}</code>
                </h3>
                <p className="mt-0.5 text-xs text-ink-3">From git. Secrets are redacted.</p>
                <div className="mt-3">{diff ? <DiffView diff={diff} /> : <p className="text-sm text-ink-3">The diff couldn&apos;t be read.</p>}</div>
              </div>
            </div>
          </details>
        </>
      )}

      {completed.length >= 2 ? (
        <details className="mt-6 rounded-2xl border border-line bg-surface" open={requested && !valid}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-ink">
            Compare other runs <ChevronDown className="size-4 text-ink-3" aria-hidden />
          </summary>
          <form method="get" className="grid gap-3 border-t border-line p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="block text-sm">
              <span className="text-xs text-ink-3">Before</span>
              <select name="base" defaultValue={base?.id ?? completed[1].id} className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink">
                {completed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {option(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-ink-3">After</span>
              <select name="head" defaultValue={head?.id ?? completed[0].id} className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink">
                {completed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {option(r)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary">
              Compare
            </Button>
          </form>
        </details>
      ) : null}
    </AppShell>
  );
}

function ColumnCard({ c, annotate }: { c: Column; annotate: boolean }) {
  const shot = primaryShot(getArtifacts(c.run.id));
  const snap = getChecks(c.run.id).find((x) => x.key === "snapshot");
  const broken = c.results.filter((r) => r.state === "failed" || r.state === "missing").length;
  return (
    <article className="flex min-w-0 flex-col rounded-[22px] border border-line bg-surface p-4 sm:p-5">
      <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold ${c.tone === "pass" ? "bg-pass-soft text-pass" : c.tone === "fail" ? "bg-fail-soft text-fail" : "bg-surface-2 text-ink-2"}`}>{c.label}</span>
      <p className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug text-ink" title={c.run.commitMessage ?? ""}>
        {c.run.commitMessage}
      </p>
      <p className="mt-1 text-xs text-ink-3">
        <code className="font-mono text-ink-2">{shortSha(c.run.commitSha)}</code> · {formatTimestamp(c.run.finishedAt)} ·{" "}
        {c.results.length ? (broken ? `${broken} of ${c.results.length} flows broken` : `all ${c.results.length} flows work`) : ""}
      </p>
      <div className="mt-4 flex-1 rounded-xl bg-surface-3 p-2.5">
        {shot ? (
          <RenderedPage artifact={shot} runId={c.run.id} commitSha={c.run.commitSha} caption={false} annotate={annotate} tone="light" animate={false} />
        ) : (
          <div className="flex aspect-[16/9] flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-4 text-center">
            <EyeOff className="size-5 text-ink-3" aria-hidden />
            <p className="mt-2 text-sm font-medium text-ink">No screenshot</p>
            <p className="mt-1 max-w-[36ch] text-xs text-ink-3">{snap?.summary ?? "Recorded before browser capture existed."}</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">{shot ? "Captured evidence from this run." : ""}</p>
      <Link href={`/runs/${c.run.id}`} className="mt-1 inline-flex min-h-7 items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
        Open this run <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </article>
  );
}

function FlowRow({ flow, columns }: { flow: ProtectedFlow; columns: Column[] }) {
  return (
    <tr>
      <th scope="row" className="px-5 py-3.5 text-left font-medium text-ink">
        {flow.name}
      </th>
      {columns.map((c) => {
        const r = c.results.find((x) => x.flow.id === flow.id);
        return (
          <td key={c.key} className="px-4 py-3.5">
            {r ? (
              <span className="flex items-center gap-2">
                <FlowIcon state={r.state} size="sm" />
                <span className={r.state === "passed" ? "text-ink-2" : r.state === "failed" || r.state === "missing" ? "font-medium text-fail" : "text-ink-3"}>{flowLabel(r.state)}</span>
                {r.actual ? <code className="font-mono text-xs text-ink-3">{r.actual}</code> : null}
              </span>
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
