import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { getArtifacts, getChecks, getEvidence, getProjectBySlug, getRecordedImport, getRunForUser, listRunsForProject } from "./store.ts";
import { workerOnline } from "./health.ts";
import { changeBetween, ensureFlows } from "./neverbreak.ts";
import { baselineFor, getRepairForSource, repairAvailability } from "./repair.ts";
import { recordedPreviewBase } from "./preview.ts";
import { providerFor } from "./providers.ts";
import { buildProofs } from "../shared/proof.ts";
import { flowResults, newChecks, type ProtectedFlow } from "../shared/flows.ts";
import type { RunRecord } from "../shared/types.ts";
import type { FrameLite, RunLite, ShowcaseData } from "../shared/showcase.ts";
import { projectMeta } from "../projects-meta.ts";

/** Everything the showcase shows, from recorded runs. Null if the project doesn't exist. */
export async function loadShowcase(userId: string, slug: string, runId?: string | null): Promise<ShowcaseData | null> {
  const project = getProjectBySlug(userId, slug);
  if (!project) return null;
  const flows = ensureFlows(userId, project);
  const runs = listRunsForProject(userId, project.id, 100).filter((r) => !r.isRepair);

  let head: string | null = null;
  try {
    const provider = providerFor(project);
    const b = (await provider.branches()).find((x) => x.name === project.connection.defaultBranch);
    head = b?.headSha ?? null;
  } catch {
    head = null;
  }
  const picked = runId ? getRunForUser(userId, runId) : null;
  const source: RunRecord | null =
    picked && picked.projectId === project.id ? picked : (runs.find((r) => r.commitSha === head && r.status === "completed") ?? runs.find((r) => r.commitSha === head) ?? null);
  const baseline = source ? baselineFor(source) : null;
  const repair = source ? getRepairForSource(source.id) : null;
  const diff = baseline && source ? await changeBetween(project, baseline.commitSha, source.commitSha) : null;
  const meta = projectMeta(project.slug);
  const request = source ? (Object.entries(meta.agentRequests ?? {}).find(([k]) => source.commitSha.startsWith(k))?.[1] ?? null) : null;

  return {
    project: { slug: project.slug, name: project.name },
    request,
    change: {
      sha: source?.commitSha ?? head ?? "",
      message: source?.commitMessage ?? null,
      author: source?.commitAuthor ?? null,
      files: diff?.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })) ?? [],
    },
    baseline: baseline ? lite(baseline, flows) : null,
    source: source ? lite(source, flows) : null,
    repair: repair
      ? {
          id: repair.id,
          status: repair.status,
          outcome: repair.outcome,
          summary: repair.summary,
          createdAt: repair.createdAt,
          finishedAt: repair.finishedAt,
          attempts: repair.attempts.map((a) => {
            const run = a.runId ? getRunForUser(userId, a.runId) : null;
            return { n: a.n, strategy: a.strategy, files: a.files, branch: a.branch, commit: a.commitSha, sourceRef: a.sourceRef, run: run ? lite(run, flows) : null };
          }),
        }
      : null,
    repairAvailable: source ? repairAvailability(source, project).ok : false,
    recorded: (() => {
      const imp = source ? getRecordedImport(source.id) : null;
      return imp ? { recordedAt: baseline?.startedAt ?? source!.startedAt ?? imp.exportedAt, exportedAt: imp.exportedAt, recordedIn: imp.recordedIn } : null;
    })(),
    workerOnline: workerOnline(),
    generatedAt: new Date().toISOString(),
  };
}

function lite(run: RunRecord, flows: ProtectedFlow[]): RunLite {
  const checks = getChecks(run.id);
  const evidence = getEvidence(run.id);
  const artifacts = getArtifacts(run.id);
  const results = flowResults(flows, checks, evidence, buildProofs(checks, evidence), artifacts);
  const frames: FrameLite[] = artifacts
    .filter((a) => a.annotations?.frame)
    .map((a) => {
      const f = a.annotations!.frame!;
      const j = a.annotations!.journey;
      return {
        id: a.id,
        url: `/api/runs/${run.id}/artifacts/${a.id}`,
        label: f.label,
        journey: f.journey,
        journeyName: f.journeyName,
        step: f.step,
        last: Boolean(j),
        ok: j ? j.ok : null,
        expected: j?.expected ?? null,
        actual: j?.actual ?? null,
        primary: Boolean(f.primary),
        highlight: (() => {
          const m = a.annotations!.matches.find((x) => x.role === "received" && x.found) ?? null;
          const b = m?.boxes[0];
          return b ? { ...b, text: m!.text } : null;
        })(),
        viewport: { width: Math.round((a.width ?? 780) / 2), height: Math.round((a.height ?? 1688) / 2) },
      };
    });
  const site = path.join(config.dataDir, "artifacts", run.id, "site", "index.html");
  const previewRoot = fs.existsSync(site) ? recordedPreviewBase(run.id) : null;
  return {
    id: run.id,
    sha: run.commitSha,
    message: run.commitMessage,
    status: run.status,
    verdict: run.verdict,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    checks: checks.map((c) => ({ key: c.key, name: c.name, status: c.status, startedAt: c.startedAt, finishedAt: c.finishedAt, command: c.command, exitCode: c.exitCode })),
    frames,
    flows: results.map((r) => ({ id: r.flow.id, name: r.flow.name, kind: r.flow.kind, state: r.state, detail: r.detail, expected: r.expected, actual: r.actual })),
    newChecks: newChecks(flows, evidence, checks, artifacts),
    preview: previewRoot ? `${previewRoot}/` : null,
  };
}
