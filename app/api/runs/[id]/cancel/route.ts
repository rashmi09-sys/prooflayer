import { apiError, apiUser, json } from "@/lib/server/api.ts";
import { requestCancel } from "@/lib/server/store.ts";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  const { id } = await ctx.params;
  const result = requestCancel(user.id, id);
  if (result === "not_found") return apiError(404, "not_found", "Run not found.");
  if (result === "finished") return apiError(409, "finished", "This run has already finished.");
  return json({ ok: true });
}
