import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

export interface SystemHealth {
  worker: { online: boolean; lastSeen: string | null; currentRun: string | null; sandboxImage: string | null };
  ai: { configured: boolean; model: string };
  github: { repository: string | null; authenticated: boolean };
}

export function systemHealth(): SystemHealth {
  let worker: SystemHealth["worker"] = { online: false, lastSeen: null, currentRun: null, sandboxImage: null };
  try {
    const hb = JSON.parse(fs.readFileSync(path.join(config.dataDir, "worker-heartbeat.json"), "utf8"));
    const age = Date.now() - new Date(hb.ts).getTime();
    worker = { online: age < 15_000, lastSeen: hb.ts, currentRun: hb.currentRun ?? null, sandboxImage: hb.sandboxImage ?? null };
  } catch {
    /* no heartbeat file: the worker has never run or shut down cleanly */
  }
  return {
    worker,
    ai: { configured: Boolean(config.anthropicApiKey), model: config.anthropicModel },
    github: { repository: config.githubRepository ?? null, authenticated: Boolean(config.githubToken) },
  };
}

/**
 * True only when live verification can actually run: a worker has written a
 * heartbeat in the last 15 seconds and reports its Docker sandbox image as
 * available. Live checks and repairs are offered and accepted only then.
 */
export function workerOnline(): boolean {
  if (config.publicDemo) return false; // the public demo has no worker, by construction
  const w = systemHealth().worker;
  return w.online && Boolean(w.sandboxImage);
}
