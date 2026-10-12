import { apiError, json } from "@/lib/server/api.ts";
import { getViewer, viewerProject } from "@/lib/server/viewer.ts";
import { ProviderError, providerFor, SHA_RE } from "@/lib/server/providers.ts";

export const dynamic = "force-dynamic";

/** Real code differences between two commits of an allowlisted repository. Public only for the demo fixtures. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const viewer = await getViewer();
  const { slug } = await ctx.params;
  const project = viewerProject(viewer, slug);
  if (!project) return apiError(404, "not_found", "Project not found.");
  const q = new URL(req.url).searchParams;
  const base = q.get("base") ?? "";
  const head = q.get("head") ?? "";
  if (!SHA_RE.test(base) || !SHA_RE.test(head)) return apiError(400, "bad_request", "base and head must be full commit SHAs.");
  try {
    return json(await providerFor(project).diff(base, head));
  } catch (e) {
    if (e instanceof ProviderError) return apiError(e.kind === "not_found" ? 404 : 502, e.kind, e.message);
    return apiError(500, "internal", "Could not compute the diff.");
  }
}
