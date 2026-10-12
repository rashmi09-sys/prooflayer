import { apiError, apiUser, json, readJson } from "@/lib/server/api.ts";
import { createRun, getProjectBySlug } from "@/lib/server/store.ts";
import { ProviderError, providerFor } from "@/lib/server/providers.ts";
import { workerOnline } from "@/lib/server/health.ts";

export const dynamic = "force-dynamic";

/** Queue a verification run for one commit. The worker picks it up. */
export async function POST(req: Request) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  // Never queue work nobody will run: without a worker (and its Docker sandbox) live checks are off.
  if (!workerOnline()) return apiError(503, "worker_unavailable", "The verification worker isn't running, so live checks are unavailable. Recorded runs can still be viewed.");

  const { body, response: bad } = await readJson(req);
  if (!body) return bad;
  if (
    typeof body.project !== "string" || !/^[a-z0-9-]{1,64}$/.test(body.project) ||
    typeof body.sha !== "string" || !/^[0-9a-f]{7,40}$/.test(body.sha) ||
    typeof body.branch !== "string" || body.branch.length > 200
  ) {
    return apiError(400, "bad_request", "project, branch and sha are required.");
  }
  const project = getProjectBySlug(user.id, body.project);
  if (!project) return apiError(404, "not_found", "Project not found.");

  try {
    const provider = providerFor(project);
    // Verify the commit really exists in the allowlisted repository and pin the full SHA.
    const commit = await provider.resolve(body.sha);
    const branches = await provider.branches();
    if (!branches.some((b) => b.name === body.branch)) return apiError(400, "bad_branch", "Unknown branch.");
    const result = createRun({
      userId: user.id,
      project,
      branch: body.branch,
      commitSha: commit.sha,
      commitMessage: commit.message,
      commitAuthor: commit.author,
      commitDate: commit.date,
    });
    return json({ runId: result.runId, deduplicated: result.deduplicated }, result.deduplicated ? 200 : 201);
  } catch (e) {
    if (e instanceof ProviderError) {
      return apiError(e.kind === "not_found" ? 404 : e.kind === "connection_required" ? 424 : 502, e.kind, e.message);
    }
    return apiError(500, "internal", "Could not queue the run.");
  }
}
