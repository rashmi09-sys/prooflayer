import { apiError, apiUser, json } from "@/lib/server/api.ts";
import { getProjectBySlug } from "@/lib/server/store.ts";
import { ProviderError, providerFor } from "@/lib/server/providers.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { user, response } = await apiUser();
  if (!user) return response;
  const { slug } = await ctx.params;
  const project = getProjectBySlug(user.id, slug);
  if (!project) return apiError(404, "not_found", "Project not found.");

  try {
    const provider = providerFor(project);
    const info = await provider.info();
    const branches = await provider.branches();
    const requested = new URL(req.url).searchParams.get("branch");
    const branch = requested && branches.some((b) => b.name === requested) ? requested : info.defaultBranch;
    const commits = await provider.commits(branch, 25);
    return json({ info, branches, branch, commits });
  } catch (e) {
    if (e instanceof ProviderError) {
      const status = e.kind === "connection_required" ? 424 : e.kind === "not_found" ? 404 : e.kind === "forbidden" ? 403 : 502;
      return apiError(status, e.kind, e.message);
    }
    return apiError(500, "internal", "Could not load repository data.");
  }
}
