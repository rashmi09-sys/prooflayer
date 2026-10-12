import Link from "next/link";
import { AppWindow, FlaskConical, ShieldCheck } from "lucide-react";
import { projectContext } from "@/lib/server/page-context.ts";
import { getArtifacts, getChecks, getEvidence, lastPassedRun, listRunsForProject } from "@/lib/server/store.ts";
import { ensureFlows, getAutoRepair } from "@/lib/server/neverbreak.ts";
import { buildProofs } from "@/lib/shared/proof.ts";
import { flowResults, newChecks } from "@/lib/shared/flows.ts";
import { JourneyMap, type MapData, type MapItem } from "@/components/neverbreak/journey-map.tsx";
import { projectMeta } from "@/lib/projects-meta.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { FlowIcon, flowLabel } from "@/components/neverbreak/flow-list.tsx";
import { FlowSettings } from "@/components/neverbreak/flow-settings.tsx";
import { relativeTime, shortSha } from "@/lib/ui/format.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Protected flows" };

export default async function FlowsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { viewer, user, project } = await projectContext(slug);
  const meta = projectMeta(project.slug);
  const flows = ensureFlows(user.id, project);
  const runs = listRunsForProject(user.id, project.id, 30).filter((r) => !r.isRepair && r.status === "completed");

  // Each flow's result in recent recorded runs, newest first.
  const history = runs.slice(0, 12).map((r) => {
    const checks = getChecks(r.id);
    const evidence = getEvidence(r.id);
    return { run: r, results: flowResults(flows, checks, evidence, buildProofs(checks, evidence), getArtifacts(r.id)) };
  });
  const latest = history[0] ?? null;
  const learnedFrom = flows[0] ? runs.find((r) => r.id === flows[0].learnedFromRunId) ?? null : null;

  // The journey map, for apps with a described customer journey.
  let map: MapData | null = null;
  if (meta.stages && latest) {
    const artifacts = getArtifacts(latest.run.id);
    const frames = artifacts.filter((a) => a.annotations?.frame);
    const stageOf = (key: string | null | undefined, kind: string, journeyId: string | null) => {
      if (kind === "page") return { stage: meta.pageFlow?.stage, also: meta.pageFlow?.alsoAt ?? [] };
      if (key && meta.flowCopy?.[key]) return { stage: meta.flowCopy[key].stage, also: meta.flowCopy[key].alsoAt ?? [] };
      if (journeyId && meta.newCheckCopy?.[journeyId]) return { stage: meta.newCheckCopy[journeyId].stage, also: [] };
      return { stage: undefined, also: [] };
    };
    const items: { stage: string; item: MapItem }[] = [];
    for (const f of flows) {
      const now = latest.results.find((r) => r.flow.id === f.id) ?? null;
      const lastOk = history.find((h) => h.results.find((r) => r.flow.id === f.id)?.state === "passed") ?? null;
      const where = stageOf(f.testName, f.kind, f.journeyId);
      const item: MapItem = {
        id: f.id,
        name: f.name,
        why: f.why,
        how: f.kind === "page" ? "Opening the built app in Chromium" : f.journeyId ? "A test and a Chromium journey" : f.kind === "journey" ? "A Chromium journey" : "A unit test",
        origin: "protected",
        now: now?.state ?? "not-checked",
        detail: now?.detail ?? null,
        lastOk: lastOk ? { runId: lastOk.run.id, sha: lastOk.run.commitSha, when: relativeTime(lastOk.run.finishedAt) } : null,
      };
      for (const st of [where.stage, ...where.also]) if (st) items.push({ stage: st, item: { ...item, id: `${f.id}-${st}` } });
    }
    for (const c of newChecks(flows, getEvidence(latest.run.id), getChecks(latest.run.id), artifacts)) {
      const raw = c.key.replace(/^(test|journey):/, "");
      const copy = meta.newCheckCopy?.[raw];
      if (!copy?.stage) continue;
      items.push({
        stage: copy.stage,
        item: { id: c.key, name: copy.name, why: null, how: c.kind === "journey" ? "A Chromium journey" : "A unit test", origin: "new", now: c.ok ? "passed" : "failed", detail: c.ok ? null : "This new check failed.", lastOk: null },
      });
    }
    map = {
      latest: { runId: latest.run.id, sha: latest.run.commitSha, message: latest.run.commitMessage },
      learned: flows[0] ? { runId: flows[0].learnedFromRunId, sha: flows[0].learnedCommitSha } : null,
      stages: meta.stages.map((st) => {
        let fr = null;
        for (const label of st.frames) {
          const hits = frames.filter((a) => a.annotations!.frame!.label === label);
          fr = hits.find((a) => a.annotations!.frame!.journey === "regular-checkout") ?? hits[0] ?? null;
          if (fr) break;
        }
        return {
          id: st.id,
          label: st.label,
          frame: fr ? { url: `/api/runs/${latest.run.id}/artifacts/${fr.id}`, label: fr.annotations!.frame!.label, journeyName: fr.annotations!.frame!.journeyName, ok: fr.annotations!.journey?.ok ?? null } : null,
          items: items.filter((i) => i.stage === st.id).map((i) => i.item),
        };
      }),
    };
  }

  return (
    <AppShell projectSlug={project.slug} wide={Boolean(map)}>
      <h1 className="text-[2.25rem] leading-tight tracking-[-0.03em] text-ink">Protected flows</h1>
      <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">
        NeverBreak remembers what already works and checks it after every AI change, so nobody has to keep saying “don&apos;t break this”.
      </p>

      {flows.length ? (
        <div className="mt-5 flex items-start gap-2.5 text-sm text-ink-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p>
            {flows.length} flows learned from the passing version <code className="font-mono text-ink-2">{shortSha(flows[0].learnedCommitSha)}</code>
            {learnedFrom ? (
              <>
                {" · "}
                <Link href={`/runs/${learnedFrom.id}`} className="font-medium text-accent-ink hover:underline">
                  open that run
                </Link>
              </>
            ) : null}
            <br />
            Detected from the test runner&apos;s output and the browser check{meta.flowCopy ? ". The plain-English names were written for this example app." : "."}
          </p>
        </div>
      ) : null}

      {map ? <JourneyMap data={map} /> : null}

      <ul className={`mt-6 space-y-3 ${map ? "hidden" : ""}`}>
        {flows.map((f) => {
          const now = latest?.results.find((r) => r.flow.id === f.id) ?? null;
          const lastOk = history.find((h) => h.results.find((r) => r.flow.id === f.id)?.state === "passed") ?? null;
          return (
            <li key={f.id} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-6">
              <div className="flex min-w-0 gap-4">
                <FlowIcon state={now?.state ?? "not-checked"} />
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold leading-snug text-ink">{f.name}</p>
                  <p className="mt-1 text-sm text-ink-2">{f.why}</p>
                  <p className="mt-3 flex items-start gap-2 text-sm text-ink-3">
                    {f.kind === "page" ? <AppWindow className="mt-0.5 size-4 shrink-0" aria-hidden /> : <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span>
                      {f.kind === "page" ? (
                        "Built and opened in Chromium after every change; a screenshot is kept as evidence."
                      ) : (
                        <>
                          The test <q className="font-mono text-[13px] text-ink-2">{f.testName}</q> must pass.
                        </>
                      )}
                    </span>
                  </p>
                  {now && now.state !== "passed" ? <p className="mt-2 text-sm text-fail">{now.detail}</p> : null}
                  {now?.testEdited ? <p className="mt-2 text-sm text-warn">The latest change rewrote this flow&apos;s test. Check the new expectation is right.</p> : null}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <div>
                  <dt className="text-xs text-ink-3">Now</dt>
                  <dd className={`mt-0.5 font-medium ${!now ? "text-ink-3" : now.state === "passed" ? "text-pass" : now.state === "failed" || now.state === "missing" ? "text-fail" : "text-ink-2"}`}>
                    {now ? flowLabel(now.state) : "Not checked yet"}
                    {latest ? <span className="block text-xs font-normal text-ink-3">on {shortSha(latest.run.commitSha)}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Last verified working</dt>
                  <dd className="mt-0.5 text-ink-2">
                    {lastOk ? (
                      <Link href={`/runs/${lastOk.run.id}`} className="font-medium text-accent-ink hover:underline">
                        {shortSha(lastOk.run.commitSha)} · {relativeTime(lastOk.run.finishedAt)}
                      </Link>
                    ) : (
                      "Not in recent runs"
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
        {!flows.length ? <li className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-ink-3">No flows yet. They&apos;re learned automatically from the first passing run.</li> : null}
      </ul>

      {viewer.operator ? (
        <div className="mt-8">
          <FlowSettings project={project.slug} autoRepair={getAutoRepair(project.id)} canRelearn={Boolean(lastPassedRun(user.id, project.id))} />
        </div>
      ) : null}
    </AppShell>
  );
}

