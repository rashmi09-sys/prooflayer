// ProofLayer verification worker.
//
// A long-running process, separate from the web server, that claims queued
// runs from the database one at a time and executes them. Start it with
// `npm run worker`. The web app never executes commands itself.

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { config } from "../lib/server/config.ts";
import { getDb } from "../lib/server/db.ts";
import { addEvent, claimNextRun, finishRun, getChecks, recoverStaleRuns, updateCheck } from "../lib/server/store.ts";
import { executeRun } from "./executor.ts";
import { afterRunFinished } from "../lib/server/repair.ts";
import { now } from "../lib/server/db.ts";

if (config.publicDemo) {
  console.error("The worker does not run in the public demo (PROOFLAYER_PUBLIC_DEMO). Set PROOFLAYER_PUBLIC_DEMO=false on a private machine.");
  process.exit(1);
}

const workerId = `${os.hostname()}:${process.pid}`;
const STALE_MS = 60_000;
let current: string | null = null;
let stopping = false;

function log(msg: string) {
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);
}

async function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("docker", ["image", "inspect", config.runner.image, "--format", "{{.Id}}"], (err) => resolve(!err));
  });
}

function beat() {
  // Lets the web app tell the user whether a worker is actually running.
  try {
    fs.writeFileSync(
      path.join(config.dataDir, "worker-heartbeat.json"),
      JSON.stringify({ workerId, ts: new Date().toISOString(), currentRun: current, sandboxImage: sandboxReady ? config.runner.image : null }),
    );
  } catch {
    /* data dir unavailable; health will show offline */
  }
}
let sandboxReady = false;

async function main() {
  getDb();
  setInterval(beat, 3000).unref();
  log(`started as ${workerId}; data dir ${config.dataDir}`);
  sandboxReady = await checkDocker();
  // Keep the heartbeat honest if Docker stops or starts while the worker runs.
  setInterval(async () => {
    sandboxReady = await checkDocker();
  }, 30_000).unref();
  beat();
  if (!sandboxReady) {
    log(`WARNING: sandbox image ${config.runner.image} is not available. Checks will be recorded as Incomplete (infrastructure).`);
  }

  while (!stopping) {
    const recovered = recoverStaleRuns(STALE_MS);
    if (recovered.length) log(`closed ${recovered.length} stale run(s) as incomplete`);

    const run = claimNextRun(workerId);
    if (!run) {
      await sleep(1000);
      continue;
    }
    current = run.id;
    log(`claimed ${run.id} (${run.commitSha.slice(0, 7)})`);
    const t = Date.now();
    try {
      await executeRun(run);
    } catch (err) {
      log(`run ${run.id} crashed: ${(err as Error).stack}`);
    }
    log(`finished ${run.id} in ${Math.round((Date.now() - t) / 1000)}s`);
    current = null;
    // NeverBreak: advance a repair whose attempt just finished, or start one.
    try {
      await afterRunFinished(run.id);
    } catch (err) {
      log(`repair step after ${run.id} failed: ${(err as Error).message}`);
    }
  }
}

function shutdown(signal: string) {
  if (stopping) process.exit(1);
  stopping = true;
  log(`received ${signal}`);
  if (current) {
    // Record the interruption truthfully instead of leaving a dangling run.
    for (const c of getChecks(current)) {
      if (c.status === "running") updateCheck(current, c.key, { status: "error", failureClass: "infrastructure", finishedAt: now(), summary: "The worker was stopped while this step was running." });
      if (c.status === "pending") updateCheck(current, c.key, { status: "skipped", summary: "Not run: the worker was stopped." });
    }
    try {
      // Stop any sandbox container still running for this run.
      const ids = execFileSync("docker", ["ps", "-q", "--filter", `name=pl-${current.toLowerCase()}`]).toString().split(/\s+/).filter(Boolean);
      if (ids.length) execFileSync("docker", ["rm", "-f", ...ids]);
    } catch {
      /* docker unavailable */
    }
    addEvent(current, "error", `Worker received ${signal} and stopped.`);
    finishRun(current, "incomplete", "The verification worker was stopped before the run finished. This is not evidence that the code is broken.");
  }
  try {
    fs.rmSync(path.join(config.dataDir, "worker-heartbeat.json"), { force: true });
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
