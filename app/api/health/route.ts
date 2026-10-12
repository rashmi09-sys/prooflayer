import { apiUser, json } from "@/lib/server/api.ts";
import { systemHealth } from "@/lib/server/health.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await apiUser();
  if (!user) return response;
  return json(systemHealth());
}
