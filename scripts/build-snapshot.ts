// Builds the public demo's immutable snapshot (.demo-snapshot/) from this
// installation's private data (.data/, created by `npm run demo:init`).
//
// What goes in, and nothing else:
// - prooflayer.db: a copy of the database holding only the public demo
//   project(s) and only runs imported from the committed, hash-verified
//   recorded package (recorded_imports). Rollback journal, so it opens
//   read-only on a read-only filesystem.
// - artifacts/<run>/: those runs' Chromium frames and kept static builds.
// - repos/<project>.json: the fixture repository as recorded (branches,
//   commits, every pairwise diff, changed file contents), so the public demo
//   never runs git.
// - manifest.json: SHA-256 of every file.
//
// Never included: other projects, local live runs, the operator's email, the
// worker heartbeat, the npm cache, work directories, git repositories, local
// repair branches no kept run refers to, or any environment value. The
// snapshot is built in a temporary directory and only moved into place once
// every step has succeeded, so a failed build leaves nothing behind.
//
//   PROOFLAYER_PUBLIC_DEMO=false node scripts/build-snapshot.ts [out-dir]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config, knownSecrets, SNAPSHOT_DIR } from "../lib/server/config.ts";
import { sanitize } from "../lib/shared/redact.ts";
import { getDb } from "../lib/server/db.ts";
import { findUserIdByEmail, listProjects } from "../lib/server/store.ts";
import { ensureFlows } from "../lib/server/neverbreak.ts";
import { LocalGitProvider, type CommitDiff, type RecordedRepo } from "../lib/server/providers.ts";
import { projectMeta } from "../lib/projects-meta.ts";

let tmp: string | null = null;
const fail = (msg: string): never => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.error(`\nSnapshot not built: ${msg}`);
  process.exit(1);
};

if (config.publicDemo) fail("run with PROOFLAYER_PUBLIC_DEMO=false; the snapshot is built from private data.");
const out = path.resolve(process.argv[2] ?? SNAPSHOT_DIR);
if (out === path.resolve(config.dataDir)) fail("the output directory must differ from the data directory.");

const db = getDb();
const ownerId = findUserIdByEmail(config.operatorEmail) ?? fail("no operator account; run npm run demo:init first.");
const projects = listProjects(ownerId).filter((p) => projectMeta(p.slug).publicDemo && p.connection.provider === "local");
if (!projects.length) fail("no public demo project; run npm run demo:init first.");

// Protected flows are learned on first view; learn them here so the read-only snapshot already has them.
for (const p of projects) ensureFlows(ownerId, p);

const final = out;
tmp = `${final}.tmp-${process.pid}`;
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
const work = tmp;

// 1. Database: copy, then keep only public projects and recorded (imported) runs.
const dbFile = path.join(work, "prooflayer.db");
db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
const snap = new DatabaseSync(dbFile);
snap.exec("PRAGMA foreign_keys = ON;");
const keep = projects.map((p) => p.id);
const marks = keep.map(() => "?").join(",");
snap.prepare(`DELETE FROM projects WHERE id NOT IN (${marks})`).run(...keep);
snap.exec("DELETE FROM verification_runs WHERE id NOT IN (SELECT run_id FROM recorded_imports)");
snap.prepare("DELETE FROM users WHERE id <> ?").run(ownerId);
snap.prepare("UPDATE users SET email = 'demo@prooflayer.invalid', display_name = 'Demo' WHERE id = ?").run(ownerId);
snap.exec("DELETE FROM operator_state; DELETE FROM run_requests;");
const runIds = (snap.prepare("SELECT id FROM verification_runs ORDER BY created_at").all() as Array<{ id: string }>).map((r) => r.id);
const repairBranches = new Set((snap.prepare("SELECT branch FROM repair_attempts WHERE branch IS NOT NULL").all() as Array<{ branch: string }>).map((r) => r.branch));
if (!runIds.length) fail("no recorded runs to publish; run npm run demo:init (it imports demo/recorded/dashdish).");
snap.exec("PRAGMA journal_mode = DELETE;");
snap.exec("VACUUM;");
const integrity = (snap.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
const fk = snap.prepare("PRAGMA foreign_key_check").all();
snap.close();
if (integrity !== "ok" || fk.length) fail(`snapshot database failed its integrity check (${integrity}, ${fk.length} foreign key problems).`);

// 2. Artifacts of the kept runs only.
for (const id of runIds) {
  const src = path.join(config.dataDir, "artifacts", id);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(work, "artifacts", id), { recursive: true, dereference: false, filter: (s) => !fs.lstatSync(s).isSymbolicLink() });
}

// 3. Each public project's repository, recorded.
fs.mkdirSync(path.join(work, "repos"), { recursive: true });
for (const p of projects) {
  const git = new LocalGitProvider(p.connection.locator, p.connection.fullName);
  const info = await git.info();
  // The default branch, prepared fixes, and only the repair branches a kept run refers to.
  const branches = (await git.branches()).filter((b) => b.name === info.defaultBranch || b.name.startsWith("prepared-fixes/") || repairBranches.has(b.name));
  const commits: RecordedRepo["commits"] = {};
  const logs: RecordedRepo["logs"] = {};
  for (const b of branches) {
    const log = await git.commits(b.name, 100);
    logs[b.name] = log.map((c) => c.sha);
    for (const c of log) commits[c.sha] = c;
  }
  const shas = Object.keys(commits);
  const diffs: Record<string, CommitDiff> = {};
  const files: Record<string, string | null> = {};
  for (const base of shas) {
    for (const head of shas) {
      if (base === head) continue;
      const d = await git.diff(base, head);
      diffs[`${base}..${head}`] = d;
      for (const f of d.files) {
        for (const sha of [base, head]) {
          const key = `${sha}:${f.path}`;
          if (!(key in files)) {
            const content = await git.readFile(sha, f.path);
            files[key] = content === null ? null : sanitize(content, knownSecrets());
          }
        }
      }
    }
  }
  const recorded: RecordedRepo = { fullName: info.fullName, defaultBranch: info.defaultBranch, branches, commits, logs, diffs, files };
  fs.writeFileSync(path.join(work, "repos", `${p.connection.locator}.json`), JSON.stringify(recorded));
}

// 4. Manifest.
const manifest: Record<string, string> = {};
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile()) manifest[path.relative(work, full).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
};
walk(work);
fs.writeFileSync(
  path.join(work, "manifest.json"),
  JSON.stringify({ format: "prooflayer-snapshot/1", builtAt: new Date().toISOString(), projects: projects.map((p) => p.slug), runs: runIds, files: manifest }, null, 2),
);

// 5. Prove it opens read-only.
const check = new DatabaseSync(dbFile, { readOnly: true });
const n = (check.prepare("SELECT COUNT(*) AS n FROM verification_runs").get() as { n: number }).n;
check.close();
const bytes = Object.keys(manifest).reduce((s, f) => s + fs.statSync(path.join(work, f)).size, 0);
fs.rmSync(final, { recursive: true, force: true });
fs.renameSync(work, final);
tmp = null;
console.log(`Public demo snapshot: ${projects.map((p) => p.slug).join(", ")}; ${n} recorded runs (${runIds.join(", ")}); ${Object.keys(manifest).length} files, ${(bytes / 1e6).toFixed(1)} MB → ${path.relative(process.cwd(), final)}/`);
