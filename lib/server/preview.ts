import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

// Interactive previews of a verified build.
//
// A fixture that builds as a static export (DashDish) is built with a per-run
// base path, /preview/<run>-<token>, so the exact build a run verified can be
// opened later. The token is an HMAC of the run id: the path is a capability,
// because a sandboxed preview frame has an opaque origin and sends no cookies.

export const PREVIEW_ROOT = "/preview";

let installSecret: string | null = null;

/**
 * The key for preview capabilities: the session secret when one is configured,
 * otherwise a random secret created once per installation in the data
 * directory (never a constant), so a fresh install without any environment
 * variables still has unguessable preview paths.
 */
function previewSecret(): string {
  if (config.sessionSecret) return config.sessionSecret;
  if (config.publicDemo) throw new Error("No preview secret in the public demo: only recorded previews (site-base.txt) are served.");
  if (installSecret) return installSecret;
  const file = path.join(/*turbopackIgnore: true*/ config.dataDir, "preview-secret");
  try {
    installSecret = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim();
  } catch {
    fs.mkdirSync(/*turbopackIgnore: true*/ config.dataDir, { recursive: true });
    const fresh = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(/*turbopackIgnore: true*/ file, fresh, { mode: 0o600, flag: "wx" });
      installSecret = fresh;
    } catch {
      installSecret = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim(); // created concurrently
    }
  }
  return installSecret!;
}

export function previewToken(runId: string): string {
  return crypto.createHmac("sha256", previewSecret()).update(`preview:${runId}`).digest("hex").slice(0, 24);
}

export function previewBase(runId: string): string {
  return `${PREVIEW_ROOT}/${runId}-${previewToken(runId)}`;
}

/** File next to a kept build recording the base path it was built with (its links depend on it). */
export const SITE_BASE_FILE = "site-base.txt";

/**
 * The base path a run's kept build actually uses. A static export has its base
 * path compiled in, so a build recorded elsewhere (an imported recording)
 * keeps the path it was built with; anything else uses this install's token.
 * Null in the public demo when the run has no recorded base (it has no preview there).
 */
export function recordedPreviewBase(runId: string): string | null {
  try {
    const recorded = fs.readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ config.dataDir, "artifacts", runId, SITE_BASE_FILE), "utf8").trim();
    if (new RegExp(`^${PREVIEW_ROOT}/${runId}-[0-9a-f]{24}$`).test(recorded)) return recorded;
  } catch {
    /* no record: built by this installation */
  }
  return config.publicDemo ? null : previewBase(runId);
}

/** Parses "<run>-<token>" and checks the token in constant time. */
export function runFromPreviewSegment(segment: string): string | null {
  const m = /^(run_[A-Za-z0-9]{6,32})-([0-9a-f]{24})$/.exec(segment);
  if (!m) return null;
  const base = recordedPreviewBase(m[1]);
  if (!base) return null;
  const expected = Buffer.from(base.slice(`${PREVIEW_ROOT}/${m[1]}-`.length));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? m[1] : null;
}
