import fs from "node:fs";
import path from "node:path";
import { apiError } from "@/lib/server/api.ts";
import { getViewer, viewerArtifact } from "@/lib/server/viewer.ts";
import { config } from "@/lib/server/config.ts";

export const dynamic = "force-dynamic";

/** Serve a stored run artifact (a Chromium frame) to the owner, or to anyone for the public demo fixtures. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; artifactId: string }> }) {
  const { id, artifactId } = await ctx.params;
  const artifact = viewerArtifact(await getViewer(), id, artifactId);
  if (!artifact) return apiError(404, "not_found", "Artifact not found.");
  let file: string;
  try {
    const root = fs.realpathSync(path.join(config.dataDir, "artifacts", id));
    file = fs.realpathSync(path.resolve(root, artifact.fileName));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error("outside");
  } catch {
    return apiError(404, "not_found", "Artifact file is missing.");
  }
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": artifact.mime,
      "Cache-Control": "private, max-age=3600, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
