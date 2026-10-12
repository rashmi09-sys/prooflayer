import { apiError, apiUser, json, readJson } from "@/lib/server/api.ts";
import { getChecks, getEvidence, getExplanations, getRunForUser, saveExplanation } from "@/lib/server/store.ts";
import { explainFailure } from "@/lib/server/explain.ts";
import { config } from "@/lib/server/config.ts";

export const dynamic = "force-dynamic";

/** Generate an AI explanation for one failed check. Never alters the verdict. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  const { id } = await ctx.params;
  const run = getRunForUser(user.id, id);
  if (!run) return apiError(404, "not_found", "Run not found.");
  if (run.status !== "completed") return apiError(409, "not_finished", "Explanations are available after the run finishes.");

  const { body, response: bad } = await readJson(req);
  if (!body) return bad;
  const checkId = body.checkId;
  if (typeof checkId !== "string" || checkId.length > 64) return apiError(400, "bad_request", "checkId is required.");
  const check = getChecks(id).find((c) => c.id === checkId);
  if (!check) return apiError(404, "not_found", "Check not found.");
  if (check.status !== "failed" && check.status !== "error") {
    return apiError(400, "not_failed", "Only failed checks can be explained.");
  }
  if (!config.anthropicApiKey) {
    return apiError(503, "ai_not_configured", "AI explanations are off: ANTHROPIC_API_KEY is not set on the server.");
  }
  // Basic abuse guard: one request per check every 20 seconds.
  const recent = getExplanations(id).find((e) => e.checkId === check.id);
  if (recent && Date.now() - new Date(recent.createdAt).getTime() < 20_000) {
    return apiError(429, "too_soon", "An explanation was just requested. Try again in a few seconds.");
  }

  const evidence = getEvidence(id).find((e) => e.checkId === check.id);
  const result = await explainFailure(run, check, evidence);
  saveExplanation({
    runId: id,
    checkId: check.id,
    status: result.status,
    model: result.model,
    content: result.status === "ok" ? result.content : null,
    errorMessage: result.status === "error" ? result.message : null,
  });
  return json({ ok: result.status === "ok" }, result.status === "ok" ? 200 : 502);
}
