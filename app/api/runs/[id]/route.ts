import { apiError, json } from "@/lib/server/api.ts";
import { loadRunViewFor } from "@/lib/server/run-detail.ts";
import { getViewer } from "@/lib/server/viewer.ts";

export const dynamic = "force-dynamic";

/** One run as the viewer may see it: full for the operator, logs withheld in the public demo. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = await loadRunViewFor(await getViewer(), id);
  if (!detail) return apiError(404, "not_found", "Run not found.");
  return json(detail);
}
