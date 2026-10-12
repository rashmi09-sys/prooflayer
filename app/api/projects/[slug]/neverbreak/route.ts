import { apiError, apiUser, json, readJson } from "@/lib/server/api.ts";
import { getProjectBySlug } from "@/lib/server/store.ts";
import { relearnFlows, setAutoRepair } from "@/lib/server/neverbreak.ts";

export const dynamic = "force-dynamic";

/** NeverBreak settings: learn flows from the latest passing run, or switch automatic repair. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  const { slug } = await ctx.params;
  const project = getProjectBySlug(user.id, slug);
  if (!project) return apiError(404, "not_found", "Project not found.");
  const { body, response: bad } = await readJson(req);
  if (!body) return bad;
  if (body.action === "relearn") return json({ ok: true, ...relearnFlows(user.id, project) });
  if (body.action === "auto-repair" && typeof body.on === "boolean") {
    setAutoRepair(project.id, body.on);
    return json({ ok: true, autoRepair: body.on });
  }
  return apiError(400, "bad_request", "Unknown action.");
}
