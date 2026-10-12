import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "./auth.ts";
import { config } from "./config.ts";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

/** For operator-only endpoints in the public demo: they do not exist there. */
export function notAvailable() {
  return apiError(404, "not_found", "Not found.");
}

/**
 * Resolve the operator for an API route, or the response to send instead:
 * 403 in the public demo (read-only, checked before anything else),
 * 403 for a cross-site state-changing request, 401 without a valid session.
 */
export async function apiUser(opts: { mutating?: boolean } = {}) {
  if (config.publicDemo) {
    return { user: null, response: apiError(403, "read_only_demo", "This is a read-only public demo. Nothing can be run or changed here.") } as const;
  }
  if (opts.mutating && !(await sameOrigin())) {
    return { user: null, response: apiError(403, "cross_origin", "Cross-origin requests are not allowed.") } as const;
  }
  const user = await currentUser();
  if (!user) return { user: null, response: apiError(401, "unauthenticated", "Sign in to continue.") } as const;
  return { user, response: null } as const;
}

/** Largest JSON body any route accepts. */
export const MAX_JSON_BYTES = 16 * 1024;

/**
 * Parse a JSON object body of at most `max` bytes. Returns the object, or a
 * 413/415/400 response. Never trusts Content-Length alone.
 */
export async function readJson(req: Request, max = MAX_JSON_BYTES): Promise<{ body: Record<string, unknown>; response: null } | { body: null; response: NextResponse }> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return { body: null, response: apiError(415, "unsupported_media_type", "Expected application/json.") };
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return { body: null, response: apiError(413, "too_large", "Request body is too large.") };
  const text = await readCapped(req, max);
  if (text === null) return { body: null, response: apiError(413, "too_large", "Request body is too large.") };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return { body: parsed as Record<string, unknown>, response: null };
  } catch {
    return { body: null, response: apiError(400, "bad_request", "Expected a JSON object body.") };
  }
}

async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
