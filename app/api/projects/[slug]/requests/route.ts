import { apiError, apiUser, json, readJson } from "@/lib/server/api.ts";
import { addEvent, createRun, getProjectBySlug, listRunsForProject, recordRunRequest } from "@/lib/server/store.ts";
import { ProviderError, providerFor } from "@/lib/server/providers.ts";
import { workerOnline } from "@/lib/server/health.ts";
import { projectMeta } from "@/lib/projects-meta.ts";
import { matchIntent, UNSUPPORTED_MESSAGE } from "@/lib/shared/intent.ts";

export const dynamic = "force-dynamic";

/**
 * Live mode for the prompt composer. Reads the request with the same
 * deterministic matcher the page uses, then starts real verification of the
 * prepared revision for that scenario on the worker: the baseline first if it
 * has never passed here, then the change. Operator only, worker required.
 * Recorded mode needs no server call: it replays runs already stored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  const { body, response: bad } = await readJson(req);
  if (!body) return bad;
  if (typeof body.prompt !== "string" || body.prompt.length > 1000) return apiError(400, "bad_request", "prompt is required (at most 1000 characters).");
  if (body.protection !== undefined && body.protection !== "on" && body.protection !== "off") return apiError(400, "bad_request", "protection must be \"on\" or \"off\".");
  const prompt = body.prompt;
  const protection: "on" | "off" = body.protection === "off" ? "off" : "on";
  const intent = matchIntent(prompt);
  if (intent.kind !== "supported") return apiError(422, "unsupported_request", UNSUPPORTED_MESSAGE);
  if (!workerOnline()) return apiError(503, "worker_unavailable", "The verification worker isn't running, so live verification is unavailable.");

  const { slug } = await ctx.params;
  const project = getProjectBySlug(user.id, slug);
  const scenario = projectMeta(slug).scenarios?.find((s) => s.id === intent.scenario);
  if (!project || !scenario) return apiError(404, "not_found", "This project has no such scenario.");

  try {
    const provider = providerFor(project);
    const [baseline, change] = [await provider.resolve(scenario.baseline), await provider.resolve(scenario.change)];
    const branch = project.connection.defaultBranch;
    const runs = listRunsForProject(user.id, project.id, 200);
    const queue = (c: typeof change) => createRun({ userId: user.id, project, branch, commitSha: c.sha, commitMessage: c.message, commitAuthor: c.author, commitDate: c.date });
    if (protection === "off") {
      // Without NeverBreak: the prepared change ships with no regression gate and no repair. The run below
      // is an independent evaluation of that revision, so its result can be shown afterwards, not a gate.
      const evaluation = queue(change);
      recordRunRequest(evaluation.runId, prompt, "off");
      addEvent(evaluation.runId, "info", "Requested with NeverBreak protection off: shipped without the regression gate. This run is an independent evaluation; no repair will be attempted.");
      return json({ mode: "live", protection, scenario: scenario.id, runId: evaluation.runId, baselineRunId: null, change: change.sha }, 201);
    }
    const baselineRun = runs.find((r) => !r.isRepair && r.commitSha === baseline.sha && r.verdict === "passed") ? null : queue(baseline);
    const changeRun = queue(change);
    recordRunRequest(changeRun.runId, prompt, "on");
    addEvent(changeRun.runId, "info", "Requested with NeverBreak protection on: protected journeys are checked and a controlled repair is attempted if one breaks.");
    return json({ mode: "live", protection, scenario: scenario.id, runId: changeRun.runId, baselineRunId: baselineRun?.runId ?? null, change: change.sha }, 201);
  } catch (e) {
    if (e instanceof ProviderError) return apiError(e.kind === "not_found" ? 404 : 502, e.kind, e.message);
    return apiError(500, "internal", "Could not start live verification.");
  }
}
