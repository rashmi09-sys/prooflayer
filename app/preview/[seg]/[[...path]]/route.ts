import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/server/config.ts";
import { runFromPreviewSegment } from "@/lib/server/preview.ts";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/**
 * Serves the static build a run verified, for the interactive phone preview.
 * The path segment is a capability (run id + HMAC), because the preview runs
 * in a sandboxed frame with an opaque origin that carries no cookies. HTML is
 * served with a CSP sandbox, so the app's scripts never run with ProofLayer's
 * origin and cannot reach its cookies or API.
 */
/**
 * The file a preview path names, or null. Containment is checked on the real
 * path (symlinks resolved), so nothing outside the run's kept build is served.
 */
function resolveSiteFile(root: string, parts: string[]): string | null {
  let decoded: string[];
  try {
    decoded = parts.map((p) => decodeURIComponent(p));
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.some((p) => p.includes("\0") || p.length > 200) || decoded.length > 20) return null;
  let realRoot: string;
  let file: string;
  try {
    realRoot = fs.realpathSync(/*turbopackIgnore: true*/ root);
    file = fs.realpathSync(/*turbopackIgnore: true*/ path.resolve(/*turbopackIgnore: true*/ root, ...decoded));
    if (fs.statSync(/*turbopackIgnore: true*/ file).isDirectory()) file = fs.realpathSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ file, "index.html"));
  } catch {
    return null; // missing
  }
  if (!file.startsWith(realRoot + path.sep) || !fs.statSync(/*turbopackIgnore: true*/ file).isFile()) return null;
  return file;
}

export async function GET(_req: Request, ctx: { params: Promise<{ seg: string; path?: string[] }> }) {
  const { seg, path: parts = [] } = await ctx.params;
  const runId = runFromPreviewSegment(seg);
  if (!runId) return new Response("Not found", { status: 404 });
  const file = resolveSiteFile(path.join(/*turbopackIgnore: true*/ config.dataDir, "artifacts", runId, "site"), parts);
  if (!file) return new Response("Not found", { status: 404 });
  const ext = path.extname(file);
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "private, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  // Every response is sandboxed, not only HTML: an SVG (or any document) from the untrusted build
  // opened directly must never run with ProofLayer's origin. Scripts and styles ignore this header.
  headers["Content-Security-Policy"] = "sandbox allow-scripts allow-forms; frame-ancestors 'self'";
  return new Response(new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ file)), { headers });
}
