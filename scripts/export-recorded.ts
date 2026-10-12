// Exports one genuine NeverBreak story (baseline, failing change, repair and
// its re-verification) from this installation into a portable, read-only
// package: the database rows exactly as the worker recorded them, every
// Chromium frame and kept static build byte for byte, and the repair commit
// as a git bundle. Nothing is generated or edited; every file is hashed into
// the manifest so the importer can prove it arrived unchanged.
//
//   node scripts/export-recorded.ts [project-slug] [source-run-id]
//
// Output: demo/recorded/<slug>/{manifest.json,data.json,artifacts/,repo/}
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { config } from "../lib/server/config.ts";
import { getDb } from "../lib/server/db.ts";
import { getProjectBySlug, ensureUser } from "../lib/server/store.ts";
import { knownSecrets } from "../lib/server/config.ts";

type Row = Record<string, unknown>;
const db = getDb();
const slug = process.argv[2] ?? "dashdish";
const owner = ensureUser(config.operatorEmail, "Operator");
const project = getProjectBySlug(owner, slug);
if (!project) throw new Error(`No project ${slug}`);

// The story: the newest non-repair run whose repair succeeded, unless one is named.
const sourceId =
  process.argv[3] ??
  (
    db
      .prepare(
        `SELECT r.id FROM verification_runs r JOIN repairs p ON p.source_run_id = r.id
         WHERE r.project_id = ? AND p.status = 'succeeded' ORDER BY r.created_at DESC LIMIT 1`,
      )
      .get(project.id) as Row | undefined
  )?.id;
if (!sourceId) throw new Error("No repaired run to export.");
const repair = db.prepare("SELECT * FROM repairs WHERE source_run_id = ?").get(String(sourceId)) as Row;
const attempts = db.prepare("SELECT * FROM repair_attempts WHERE repair_id = ? ORDER BY n").all(String(repair.id)) as Row[];
const runIds = [String(repair.base_run_id), String(sourceId), ...attempts.map((a) => String(a.run_id)).filter((x) => x && x !== "null")];

const inRuns = `(${runIds.map(() => "?").join(",")})`;
const all = (sql: string, ...args: unknown[]) => db.prepare(sql).all(...(args as never[])) as Row[];
const data = {
  verification_runs: all(`SELECT * FROM verification_runs WHERE id IN ${inRuns} ORDER BY created_at`, ...runIds),
  verification_checks: all(`SELECT * FROM verification_checks WHERE run_id IN ${inRuns} ORDER BY run_id, position`, ...runIds),
  execution_evidence: all(`SELECT * FROM execution_evidence WHERE run_id IN ${inRuns}`, ...runIds),
  run_events: all(`SELECT run_id, ts, level, message FROM run_events WHERE run_id IN ${inRuns} ORDER BY id`, ...runIds),
  source_excerpts: all(`SELECT * FROM source_excerpts WHERE run_id IN ${inRuns}`, ...runIds),
  run_artifacts: all(`SELECT * FROM run_artifacts WHERE run_id IN ${inRuns} ORDER BY run_id, captured_at`, ...runIds),
  ai_explanations: all(`SELECT * FROM ai_explanations WHERE run_id IN ${inRuns}`, ...runIds),
  repairs: [repair],
  repair_attempts: attempts,
  protected_flows: all("SELECT * FROM protected_flows WHERE project_id = ? ORDER BY position", project.id),
};

// Columns that only identify this installation are dropped; the importer
// re-links rows to the fresh install's operator, project and connection.
for (const r of data.verification_runs) {
  delete r.project_id;
  delete r.connection_id;
  delete r.triggered_by;
  delete r.worker_id;
}
for (const r of [...data.repairs, ...data.protected_flows]) delete r.project_id;

// Guard: no configured secret value may leave in the package.
const text = JSON.stringify(data);
for (const s of knownSecrets()) if (s && text.includes(s)) throw new Error("A configured secret appears in the recorded data; refusing to export.");

const out = path.join(process.cwd(), "demo", "recorded", slug);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(out, "data.json"), JSON.stringify(data, null, 1) + "\n");

// Artifact files: frames, kept static builds and the base path each was built with.
for (const id of runIds) {
  const src = path.join(config.dataDir, "artifacts", id);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, "artifacts", id), { recursive: true, dereference: false, filter: (p) => !fs.lstatSync(p).isSymbolicLink() });
}

// The repair commits, as a bundle on top of the fixture's own (deterministic) history.
const repo = path.join(config.dataDir, "repos", project.connection.locator);
const branches = attempts.map((a) => String(a.branch));
fs.mkdirSync(path.join(out, "repo"), { recursive: true });
execFileSync("git", ["-C", repo, "bundle", "create", path.join(out, "repo", "repairs.bundle"), ...branches, "--not", project.connection.defaultBranch], { stdio: "pipe" });

// Every commit the story refers to, so the importer can check the fixture matches.
const commits = [...new Set([...data.verification_runs.map((r) => String(r.commit_sha)), ...attempts.map((a) => String(a.commit_sha)), ...data.protected_flows.map((f) => String(f.learned_commit_sha))])];

const files: Record<string, string> = {};
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name !== "manifest.json") files[path.relative(out, p).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  }
};
walk(out);

const role = (id: string) => (id === String(repair.base_run_id) ? "baseline" : id === String(sourceId) ? "change" : "repair-verification");
const manifest = {
  format: "prooflayer-recorded/1",
  description: "Genuine recorded NeverBreak runs, exported read-only. Import with `npm run demo:init`; imported runs are labelled “Recorded demonstration”.",
  project: { slug, name: project.name },
  exportedAt: new Date().toISOString(),
  recordedIn: "ProofLayer worker on a Linux host: checks in the Docker sandbox (node:22, no network), customer journeys in headless Chromium",
  story: {
    baselineRun: String(repair.base_run_id),
    changeRun: String(sourceId),
    repair: String(repair.id),
    attempts: attempts.map((a) => ({ n: Number(a.n), strategy: String(a.strategy), branch: String(a.branch), commit: String(a.commit_sha), run: String(a.run_id), sourceRef: a.source_ref ? String(a.source_ref) : null })),
  },
  runs: data.verification_runs.map((r) => ({ id: String(r.id), role: role(String(r.id)), commit: String(r.commit_sha), message: r.commit_message, verdict: r.verdict, startedAt: r.started_at, finishedAt: r.finished_at })),
  commits,
  rows: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  files,
};
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Exported ${runIds.length} recorded runs (${runIds.join(", ")}) and ${Object.keys(files).length} files to ${path.relative(process.cwd(), out)}`);
