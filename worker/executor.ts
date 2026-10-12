import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, knownSecrets } from "../lib/server/config.ts";
import { now } from "../lib/server/db.ts";
import {
  addEvent,
  checkId,
  saveExcerpt,
  getChecks,
  getEvidence,
  getProjectById,
  finishRun,
  heartbeat,
  updateCheck,
  writeEvidence,
} from "../lib/server/store.ts";
import { providerFor, ProviderError } from "../lib/server/providers.ts";
import { sanitize, limitOutput } from "../lib/shared/redact.ts";
import { extractFacts, looksLikeNetworkFailure } from "../lib/shared/facts.ts";
import { decideVerdict } from "../lib/shared/verdict.ts";
import { buildProofs, excerptTargets } from "../lib/shared/proof.ts";
import { captureSnapshot, findBrowser, snapshotPlanFor } from "./snapshot.ts";
import { previewBase, SITE_BASE_FILE } from "../lib/server/preview.ts";
import { ALTERNATE_LOCKFILES, lockfileProblems, pinnedNpmEnv } from "./install-policy.ts";
import type { FailureClass, RunRecord, StageKey } from "../lib/shared/types.ts";

const execFileP = promisify(execFile);

export class CancelledError extends Error {}

interface ProcResult {
  exitCode: number | null;
  output: string;
  bytesTotal: number;
  timedOut: boolean;
  cancelled: boolean;
  spawnError: string | null;
}

/**
 * Execute one verification run end to end. Every state change is written to
 * the database the moment it happens; the UI reads only those records.
 */
export async function executeRun(run: RunRecord): Promise<void> {
  const project = getProjectById(run.projectId);
  const runRoot = path.join(config.dataDir, "work", run.id);
  const workDir = path.join(runRoot, "src");
  let cancelled = false;

  // Heartbeat + cancellation watcher. Runs for the life of the job.
  let currentKill: (() => void) | null = null;
  const watcher = setInterval(() => {
    try {
      if (heartbeat(run.id) && !cancelled) {
        cancelled = true;
        addEvent(run.id, "warn", "Stopping the current step after a cancellation request.");
        currentKill?.();
      }
    } catch {
      /* database busy; next tick retries */
    }
  }, 1000);

  const assertNotCancelled = () => {
    if (cancelled) throw new CancelledError();
  };

  addEvent(run.id, "info", `Worker picked up the run (pid ${process.pid}).`);

  try {
    if (!project) throw new Error("Project no longer exists.");

    // ---------------------------------------------------------- prepare
    await stage(run.id, "prepare", async () => {
      fs.rmSync(runRoot, { recursive: true, force: true });
      fs.mkdirSync(runRoot, { recursive: true });
      const provider = providerFor(project);
      const resolved = await provider.resolve(run.commitSha);
      if (resolved.sha !== run.commitSha) throw new ProviderError("not_found", "Commit SHA mismatch.");
      await provider.exportTo(run.commitSha, workDir);
      const files = countFiles(workDir);
      const pkg = readPackageJson(workDir);
      const lines = [
        `Repository: ${project.connection.fullName} (${project.connection.provider})`,
        `Commit:     ${run.commitSha}`,
        `Message:    ${resolved.message}`,
        `Exported ${files} files into an isolated workspace.`,
        pkg ? `package.json: ${pkg.name ?? "(unnamed)"}` : "No package.json found at the repository root.",
      ];
      return { status: "passed", summary: `Exported ${files} files at ${run.commitSha.slice(0, 7)}.`, output: lines.join("\n") };
    });
    assertNotCancelled();

    // ---------------------------------------------------------- install
    const pkg = readPackageJson(workDir);
    await stage(run.id, "install", async () => {
      if (!pkg) return codeFail("No package.json at the repository root.", "ProofLayer supports Node projects with a package.json.");
      if (!fs.existsSync(path.join(workDir, "package-lock.json"))) {
        return codeFail(
          "No package-lock.json, so dependencies cannot be installed reproducibly.",
          "ProofLayer only installs locked dependency versions (npm ci).",
        );
      }
      // npm ci runs on the host: the repository must not be able to configure it (see install-policy.ts).
      const alternate = ALTERNATE_LOCKFILES.find((f) => fs.existsSync(path.join(workDir, f)));
      if (alternate) {
        return codeFail(`The repository has ${alternate}, which npm would install from instead of package-lock.json.`, "ProofLayer installs only from a checked package-lock.json. Remove the other lockfile.");
      }
      const lockIssues = lockfileProblems(fs.readFileSync(path.join(workDir, "package-lock.json"), "utf8"));
      if (lockIssues.length) {
        return codeFail(
          "The lockfile installs packages from outside the npm registry, so it was not installed.",
          `ProofLayer installs only registry packages with integrity hashes on the worker.\n${lockIssues.join("\n")}`,
        );
      }
      const projectNpmrc = path.join(workDir, ".npmrc");
      const hadNpmrc = fs.existsSync(projectNpmrc);
      fs.rmSync(projectNpmrc, { force: true, recursive: true });
      if (hadNpmrc) addEvent(run.id, "info", "Ignored the repository's .npmrc: the worker's npm configuration is fixed.");
      const argv = ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"];
      updateCheck(run.id, "install", { command: `npm ${argv.join(" ")}` });
      const res = await runHostProcess(run.id, "install", "npm", argv, workDir, config.runner.installTimeoutMs, (k) => (currentKill = k), () => cancelled);
      return outcome("install", res, (out) => (looksLikeNetworkFailure(out) ? "infrastructure" : "code"));
    });
    assertNotCancelled();

    const installOk = getChecks(run.id).find((c) => c.key === "install")?.status === "passed";

    // ----------------------------------------------------------- checks
    const plan = installOk ? planChecks(workDir, pkg ?? {}) : null;
    for (const key of ["lint", "typecheck", "test", "build"] as const) {
      assertNotCancelled();
      if (!plan) {
        updateCheck(run.id, key, { status: "skipped", summary: "Skipped because dependencies could not be installed." });
        continue;
      }
      const step = plan[key];
      if ("skip" in step) {
        updateCheck(run.id, key, { status: "skipped", summary: step.skip, finishedAt: now() });
        addEvent(run.id, "warn", `${key}: ${step.skip}`);
        continue;
      }
      await stage(run.id, key, async () => {
        updateCheck(run.id, key, { command: step.display });
        // Static-export apps are built under a per-run preview path so the exact
        // verified build can be opened later. Apps that ignore it are unaffected.
        const env: Record<string, string> = key === "build" ? { PROOFLAYER_PREVIEW_BASE: previewBase(run.id) } : {};
        const res = await runSandboxed(run.id, key, step.argv, workDir, (k) => (currentKill = k), () => cancelled, env);
        return outcome(key, res, () => "code");
      });
    }
    assertNotCancelled();

    // --------------------------------------------------------- snapshot
    // Optional and informational: never part of the verdict.
    const buildPassed = getChecks(run.id).find((c) => c.key === "build")?.status === "passed";
    // Keep a static export (if the app produced one) so the verified build can be opened interactively.
    const outDir = path.join(workDir, "out");
    const outSize = buildPassed && fs.existsSync(path.join(outDir, "index.html")) ? treeSize(outDir) : null;
    if (outSize && (outSize.files > MAX_SITE_FILES || outSize.bytes > MAX_SITE_BYTES)) {
      addEvent(run.id, "warn", `The static build is too large to keep for preview (${outSize.files} files, ${(outSize.bytes / 1e6).toFixed(0)} MB).`);
    } else if (outSize) {
      const site = path.join(config.dataDir, "artifacts", run.id, "site");
      fs.rmSync(site, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(site), { recursive: true });
      fs.cpSync(path.join(workDir, "out"), site, { recursive: true, dereference: false, filter: (src) => !fs.lstatSync(src).isSymbolicLink() });
      fs.writeFileSync(path.join(path.dirname(site), SITE_BASE_FILE), previewBase(run.id) + "\n");
      addEvent(run.id, "info", `Kept the static build (${countFiles(site)} files) for interactive preview.`);
    }
    const browser = buildPassed ? findBrowser() : null;
    if (!buildPassed) {
      updateCheck(run.id, "snapshot", { status: "skipped", summary: "No successful build to serve, so no page was captured." });
    } else if (!browser) {
      updateCheck(run.id, "snapshot", { status: "skipped", summary: "No browser is installed on the worker, so no page was captured." });
    } else {
      await stage(run.id, "snapshot", async () => {
        const plan = snapshotPlanFor(project!.slug);
        updateCheck(run.id, "snapshot", {
          command: plan.journeys?.length
            ? `serve static build · ${plan.journeys.map((j) => j.name.toLowerCase()).join(" · ")} · screenshots`
            : `next start · open ${plan.path}${plan.clickText ? ` · click "${plan.clickText}"` : ""} · screenshot`,
        });
        const res = await captureSnapshot({
          runId: run.id,
          checkId: checkId(run.id, "snapshot"),
          workDir,
          browserPath: browser,
          plan,
          basePath: previewBase(run.id),
          needles: buildProofs(getChecks(run.id), getEvidence(run.id)).flatMap((p) =>
            p.kind === "assertion"
              ? p.items.slice(0, 2).flatMap((a) => [
                  ...(a.expected ? [{ value: a.expected, role: "expected" as const, test: a.name }] : []),
                  ...(a.actual ? [{ value: a.actual, role: "received" as const, test: a.name }] : []),
                ])
              : [],
          ),
          onLog: (text) => {
            const clean = sanitize(text, knownSecrets());
            writeEvidence(run.id, "snapshot", clean, false, Buffer.byteLength(clean), null);
          },
          setKill: (k) => (currentKill = k),
          isCancelled: () => cancelled,
        });
        if (res.cancelled) throw new CancelledError();
        return res.ok
          ? { status: "passed", summary: res.summary, output: res.log }
          : { status: "error", failureClass: "infrastructure", summary: res.summary, output: res.log };
      });
    }
    assertNotCancelled();

    // ---------------------------------------------------------- collect
    await stage(run.id, "collect", async () => {
      const evidence = getEvidence(run.id);
      const checks = getChecks(run.id);
      const lines: string[] = [];
      // Keep the source lines behind each parsed failure while the workspace exists.
      const targets = excerptTargets(buildProofs(checks, evidence));
      let excerpts = 0;
      for (const t of targets) {
        const ex = readExcerpt(workDir, t.file, t.line);
        if (!ex) continue;
        saveExcerpt({ runId: run.id, checkId: t.checkId, file: t.file, ...ex });
        excerpts++;
      }
      if (targets.length) lines.push(`kept ${excerpts} source excerpt${excerpts === 1 ? "" : "s"} from the commit`);
      for (const ev of evidence) {
        const hash = crypto.createHash("sha256").update(ev.content).digest("hex");
        const key = checks.find((c) => c.id === ev.checkId)?.key;
        if (key && key !== "collect") {
          writeEvidence(run.id, key, ev.content, ev.truncated, ev.bytesTotal, hash);
          lines.push(`${key.padEnd(10)} ${hash}  ${ev.bytesTotal} bytes captured${ev.truncated ? " (stored truncated)" : ""}`);
        }
      }
      const logs = lines.length - (targets.length ? 1 : 0);
      return {
        status: "passed",
        summary: `Hashed ${logs} evidence logs${excerpts ? ` and kept ${excerpts} source excerpt${excerpts === 1 ? "" : "s"}` : ""}.`,
        output: lines.join("\n"),
      };
    });

    // -------------------------------------------------------- summarize
    await stage(run.id, "summarize", async () => {
      const decision = decideVerdict(getChecks(run.id), false);
      finishRun(run.id, decision.verdict, decision.reason);
      addEvent(run.id, decision.verdict === "passed" ? "info" : "warn", `Verdict: ${decision.verdict}. ${decision.reason}`);
      return {
        status: "passed",
        summary: `Verdict ${decision.verdict}, decided from recorded exit codes.`,
        output: `verdict: ${decision.verdict}\nreason:  ${decision.reason}`,
      };
    });
  } catch (err) {
    if (err instanceof CancelledError || cancelled) {
      closeRemaining(run.id, "cancelled");
      const decision = decideVerdict(getChecks(run.id), true);
      finishRun(run.id, "cancelled", decision.reason);
      addEvent(run.id, "warn", decision.reason);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      addEvent(run.id, "error", `Execution environment error: ${sanitize(message, knownSecrets())}`);
      closeRemaining(run.id, "skipped");
      const decision = decideVerdict(getChecks(run.id), false);
      // A pipeline failure can never yield Passed: required checks were skipped.
      finishRun(run.id, decision.verdict, decision.reason);
    }
  } finally {
    clearInterval(watcher);
    if (!process.env.PROOFLAYER_KEEP_WORKDIRS) fs.rmSync(runRoot, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------- stage glue

interface StageOutcome {
  status: "passed" | "failed" | "error";
  failureClass?: FailureClass | null;
  exitCode?: number | null;
  summary: string;
  output?: string;
  bytesTotal?: number;
}

async function stage(runId: string, key: StageKey, fn: () => Promise<StageOutcome>): Promise<void> {
  const started = Date.now();
  updateCheck(runId, key, { status: "running", startedAt: new Date(started).toISOString() });
  let result: StageOutcome;
  try {
    result = await fn();
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    const message = sanitize(err instanceof Error ? err.message : String(err), knownSecrets());
    result = { status: "error", failureClass: "infrastructure", summary: message, output: message };
  }
  if (result.output !== undefined) {
    const { text, truncated } = limitOutput(sanitize(result.output, knownSecrets()), config.runner.maxStoredChars);
    writeEvidence(runId, key, text, truncated, result.bytesTotal ?? Buffer.byteLength(result.output), null);
  }
  updateCheck(runId, key, {
    status: result.status,
    failureClass: result.status === "passed" ? null : (result.failureClass ?? "infrastructure"),
    exitCode: result.exitCode ?? null,
    finishedAt: now(),
    durationMs: Date.now() - started,
    summary: result.summary,
  });
  if (result.status === "error" && (key === "prepare" || key === "collect" || key === "summarize")) {
    throw new Error(`${key} failed: ${result.summary}`);
  }
}

function codeFail(summary: string, detail: string): StageOutcome {
  return { status: "failed", failureClass: "code", summary, output: `${summary}\n${detail}` };
}

const CONTAINER_RUNTIME_DOWN = /Cannot connect to the Docker daemon|Is the docker daemon running\?|docker: Error response from daemon|Unable to find image '[^']+' locally/;

function outcome(key: StageKey, res: ProcResult, classify: (out: string) => FailureClass): StageOutcome {
  if (res.cancelled) throw new CancelledError();
  const clean = sanitize(res.output, knownSecrets());
  if (res.spawnError) {
    return { status: "error", failureClass: "infrastructure", summary: res.spawnError, output: `${res.spawnError}\n${clean}`, bytesTotal: res.bytesTotal };
  }
  if (res.timedOut) {
    return {
      status: "error",
      failureClass: "timeout",
      summary: "Stopped after exceeding the time limit.",
      output: clean,
      bytesTotal: res.bytesTotal,
    };
  }
  if (res.exitCode === 0) {
    return { status: "passed", exitCode: 0, summary: extractFacts(key, clean, 0).summary, output: clean, bytesTotal: res.bytesTotal };
  }
  // Exit 125-127 come from the container runtime itself; 137 is SIGKILL (memory limit).
  // The Docker CLI exits 1 when it cannot reach the daemon: never blame the code for that.
  if (res.exitCode === 125 || res.exitCode === 126 || res.exitCode === 127 || CONTAINER_RUNTIME_DOWN.test(clean)) {
    return {
      status: "error",
      failureClass: "infrastructure",
      exitCode: res.exitCode,
      summary: CONTAINER_RUNTIME_DOWN.test(clean) ? "The sandbox couldn't start: the container runtime isn't available." : `The sandbox could not start the command (exit ${res.exitCode}).`,
      output: clean,
      bytesTotal: res.bytesTotal,
    };
  }
  if (res.exitCode === 137) {
    return {
      status: "error",
      failureClass: "resource_limit",
      exitCode: 137,
      summary: `Killed by the sandbox (exit 137), most likely the ${config.runner.memory} memory limit.`,
      output: clean,
      bytesTotal: res.bytesTotal,
    };
  }
  const failureClass = classify(clean);
  return {
    status: failureClass === "code" ? "failed" : "error",
    failureClass,
    exitCode: res.exitCode,
    summary:
      failureClass === "infrastructure"
        ? "Failed with a network or registry error, not a code error."
        : extractFacts(key, clean, res.exitCode).summary,
    output: clean,
    bytesTotal: res.bytesTotal,
  };
}

function closeRemaining(runId: string, status: "cancelled" | "skipped") {
  for (const c of getChecks(runId)) {
    if (c.status === "running") updateCheck(runId, c.key, { status, finishedAt: now(), summary: status === "cancelled" ? "Stopped by cancellation." : "Interrupted." });
    else if (c.status === "pending") updateCheck(runId, c.key, { status, summary: status === "cancelled" ? "Not run: the run was cancelled." : "Not run." });
  }
}

// -------------------------------------------------------- check planning

type PlannedStep = { argv: string[]; display: string } | { skip: string };

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

/**
 * Commands come from this server-side allowlist, never from the repository.
 * package.json scripts are only inspected to choose among known runners.
 */
export function planChecks(dir: string, pkg: PackageJson): Record<"lint" | "typecheck" | "test" | "build", PlannedStep> {
  const has = (p: string) => fs.existsSync(path.join(dir, p));
  const eslintConfig = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"].some(has);

  const lint: PlannedStep =
    has("node_modules/eslint/bin/eslint.js") && eslintConfig
      ? { argv: ["node", "node_modules/eslint/bin/eslint.js", "."], display: "eslint ." }
      : { skip: "No ESLint installation and flat config found, so lint could not run." };

  const typecheck: PlannedStep =
    has("node_modules/typescript/bin/tsc") && has("tsconfig.json")
      ? { argv: ["node", "node_modules/typescript/bin/tsc", "--noEmit"], display: "tsc --noEmit" }
      : { skip: "No TypeScript installation and tsconfig.json found, so type checking could not run." };

  let test: PlannedStep;
  const script = pkg.scripts?.test?.trim() ?? "";
  const nodeTest = /^node --test((?: [A-Za-z0-9_./*{},-]+)*)$/.exec(script);
  if (nodeTest) {
    const args = nodeTest[1].trim().split(/\s+/).filter(Boolean);
    test = { argv: ["node", "--test", ...args], display: `node --test ${args.join(" ")}`.trim() };
  } else if (/^vitest( run)?$/.test(script) && has("node_modules/vitest/vitest.mjs")) {
    test = { argv: ["node", "node_modules/vitest/vitest.mjs", "run"], display: "vitest run" };
  } else if (/^jest( --ci)?$/.test(script) && has("node_modules/jest/bin/jest.js")) {
    test = { argv: ["node", "node_modules/jest/bin/jest.js", "--ci"], display: "jest --ci" };
  } else {
    test = {
      skip: script
        ? `The test script "${script.slice(0, 80)}" is not a supported runner (node --test, vitest, jest).`
        : "No test script is defined in package.json.",
    };
  }

  const build: PlannedStep = has("node_modules/next/dist/bin/next")
    ? { argv: ["node", "node_modules/next/dist/bin/next", "build"], display: "next build" }
    : { skip: "Next.js is not installed, so the production build could not run." };

  return { lint, typecheck, test, build };
}

// ------------------------------------------------------------- execution

function scrubbedEnv(home: string): Record<string, string | undefined> {
  // Only what npm needs. No application secrets reach the child process, and
  // npm's configuration is pinned here, above anything in the repository.
  const pass = ["PATH", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"];
  const userConfig = path.join(home, ".npmrc-user-empty");
  const globalConfig = path.join(home, ".npmrc-global-empty");
  fs.writeFileSync(userConfig, "");
  fs.writeFileSync(globalConfig, "");
  const env: Record<string, string | undefined> = { HOME: home, CI: "1", npm_config_cache: path.join(config.dataDir, "npm-cache"), ...pinnedNpmEnv(userConfig, globalConfig) };
  for (const k of pass) if (process.env[k]) env[k] = process.env[k];
  return env;
}

function runHostProcess(
  runId: string,
  key: StageKey,
  cmd: string,
  argv: string[],
  cwd: string,
  timeoutMs: number,
  setKill: (k: () => void) => void,
  isCancelled: () => boolean,
): Promise<ProcResult> {
  const home = path.join(path.dirname(cwd), "home");
  fs.mkdirSync(home, { recursive: true });
  const child = spawn(cmd, argv, { cwd, env: scrubbedEnv(home) as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"], detached: true });
  return capture(runId, key, child, timeoutMs, () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already exited */
    }
  }, setKill, isCancelled);
}

async function runSandboxed(
  runId: string,
  key: StageKey,
  argv: string[],
  workDir: string,
  setKill: (k: () => void) => void,
  isCancelled: () => boolean,
  extraEnv: Record<string, string> = {},
): Promise<ProcResult> {
  // The sandbox user (uid 10001) needs write access for build output.
  await execFileP("chown", ["-R", "10001:10001", workDir]).catch(() => execFileP("chmod", ["-R", "a+rwX", workDir]));
  const name = `pl-${runId}-${key}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  const args = [
    "run",
    "--name", name,
    "--network", "none",
    "--memory", config.runner.memory,
    "--memory-swap", config.runner.memory,
    "--cpus", config.runner.cpus,
    "--pids-limit", String(config.runner.pids),
    "--read-only",
    "--tmpfs", "/tmp:rw,size=512m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", "10001:10001",
    "-e", "HOME=/tmp",
    "-e", "CI=1",
    "-e", "NEXT_TELEMETRY_DISABLED=1",
    ...Object.entries(extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    "-v", `${workDir}:/work`,
    "-w", "/work",
    config.runner.image,
    ...argv,
  ];
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  const kill = () => {
    execFile("docker", ["kill", name], () => undefined);
  };
  const res = await capture(runId, key, child, config.runner.checkTimeoutMs, kill, setKill, isCancelled);
  // Distinguish an out-of-memory kill from an ordinary failure.
  if (res.exitCode === 137 && !res.timedOut && !res.cancelled) {
    const oom = await execFileP("docker", ["inspect", "-f", "{{.State.OOMKilled}}", name]).catch(() => null);
    if (oom && oom.stdout.trim() !== "true") res.exitCode = 1;
  }
  execFile("docker", ["rm", "-f", name], () => undefined);
  return res;
}

function capture(
  runId: string,
  key: StageKey,
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
  kill: () => void,
  setKill: (k: () => void) => void,
  isCancelled: () => boolean,
): Promise<ProcResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytesTotal = 0;
    let captured = 0;
    let timedOut = false;
    let spawnError: string | null = null;
    let dirty = false;

    setKill(kill);
    const onData = (b: Buffer) => {
      bytesTotal += b.length;
      if (captured < config.runner.maxCaptureBytes) {
        const slice = b.subarray(0, config.runner.maxCaptureBytes - captured);
        chunks.push(slice);
        captured += slice.length;
      }
      dirty = true;
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    // Stream sanitized output to the database so the live view shows real logs.
    const flusher = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      const { text, truncated } = limitOutput(sanitize(Buffer.concat(chunks).toString("utf8"), knownSecrets()), config.runner.maxStoredChars);
      try {
        writeEvidence(runId, key, text, truncated, bytesTotal, null);
      } catch {
        /* retry next tick */
      }
    }, 750);

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    child.on("error", (err) => {
      spawnError =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `The ${child.spawnfile} executable is not available on the worker host.`
          : `Could not start the process: ${err.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(flusher);
      const output = Buffer.concat(chunks).toString("utf8") + (captured < bytesTotal ? `\n[ProofLayer stopped capturing after ${captured} bytes]` : "");
      resolve({ exitCode: spawnError ? null : code, output, bytesTotal, timedOut, cancelled: isCancelled(), spawnError });
    });
  });
}

// ------------------------------------------------------------------ utils

/** Up to three lines either side of a location, read safely from the workspace. */
export function readExcerpt(workDir: string, file: string, line: number): { startLine: number; highlightLine: number; lines: string[] } | null {
  const full = path.resolve(workDir, file);
  if (!full.startsWith(workDir + path.sep) || full.includes(`${path.sep}node_modules${path.sep}`)) return null;
  try {
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > 1_000_000) return null;
    const all = fs.readFileSync(full, "utf8").split("\n");
    if (line < 1 || line > all.length) return null;
    const start = Math.max(1, line - 3);
    const end = Math.min(all.length, line + 3);
    const lines = all.slice(start - 1, end).map((l) => sanitize(l, knownSecrets()).slice(0, 240));
    return { startLine: start, highlightLine: line, lines };
  } catch {
    return null;
  }
}

function readPackageJson(dir: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

/** Limits for keeping a static build for interactive preview (the build itself is untrusted output). */
const MAX_SITE_FILES = 5_000;
const MAX_SITE_BYTES = 100 * 1024 * 1024;

function treeSize(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    files++;
    bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return { files, bytes };
}

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) if (entry.isFile()) n++;
  return n;
}
