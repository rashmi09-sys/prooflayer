import { apiError, apiUser, json } from "@/lib/server/api.ts";
import { getRunForUser } from "@/lib/server/store.ts";
import { startRepair } from "@/lib/server/repair.ts";

export const dynamic = "force-dynamic";

/** Start NeverBreak's safe repair for a failed run: at most two verified attempts. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await apiUser({ mutating: true });
  if (!user) return response;
  const { id } = await ctx.params;
  if (!getRunForUser(user.id, id)) return apiError(404, "not_found", "Run not found.");
  try {
    const r = await startRepair(id, "manual");
    if (!r.ok) return apiError(409, "repair_unavailable", r.reason);
    return json({ ok: true, repairId: r.repairId });
  } catch (e) {
    console.error(`[repair] ${id}:`, e);
    return apiError(500, "repair_failed", "The repair couldn't start. The server log has the details.");
  }
}
