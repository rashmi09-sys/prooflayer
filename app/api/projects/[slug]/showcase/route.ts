import { apiError, json } from "@/lib/server/api.ts";
import { loadShowcase } from "@/lib/server/showcase.ts";
import { getViewer, viewerProject } from "@/lib/server/viewer.ts";

export const dynamic = "force-dynamic";

/** The NeverBreak showcase data for a project: recorded runs only. Readable in the public demo. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const viewer = await getViewer();
  const { slug } = await ctx.params;
  if (!viewerProject(viewer, slug)) return apiError(404, "not_found", "Project not found.");
  const run = new URL(req.url).searchParams.get("run");
  const data = await loadShowcase(viewer.userId, slug, run && /^run_[A-Za-z0-9]+$/.test(run) ? run : null);
  if (!data) return apiError(404, "not_found", "Project not found.");
  return json(data);
}
