// Imports a recorded demonstration package (scripts/export-recorded.ts) into
// this installation, read-only and without Docker or a worker.
//
// It refuses to import anything it cannot verify: every file must match the
// manifest's SHA-256, and every commit the recording refers to must exist in
// this machine's fixture repository (the fixture scripts build the same
// history byte for byte). Imported runs keep their original ids and
// timestamps and are marked in `recorded_imports`, which the interface uses
// to label them "Recorded demonstration".
//
//   node scripts/import-recorded.ts [package-dir]   (default demo/recorded/dashdish)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { config } from "../lib/server/config.ts";
import { getDb } from "../lib/server/db.ts";
import { ensureUser, getProjectBySlug } from "../lib/server/store.ts";

type Row = Record<string, unknown>;
const fail = (msg: string): never => {
  console.error(`\nNot imported: ${msg}\nNo recorded results were added. Nothing is invented to replace them.`);
  process.exit(1);
};

const dir = path.resolve(process.argv[2] ?? path.join("demo", "recorded", "dashdish"));
if (!fs.existsSync(path.join(dir, "manifest.json"))) fail(`no recorded package at ${dir}`);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
if (manifest.format !== "prooflayer-recorded/1") fail(`unknown package format ${manifest.format}`);

// 1. Every file exactly as exported.
for (const [rel, sha] of Object.entries(manifest.files as Record<string, string>)) {
  const file = path.join(dir, ...rel.split("/"));
  if (!fs.existsSync(file)) fail(`missing file ${rel}`);
  const got = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (got !== sha) fail(`${rel} does not match its recorded hash`);
}
const data = JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf8")) as Record<string, Row[]>;

const db = getDb();
const owner = ensureUser(config.operatorEmail, "Operator");
const project = getProjectBySlug(owner, manifest.project.slug);
if (!project) fail(`project ${manifest.project.slug} isn't set up. Run the fixture and seed steps first (npm run demo:init does this).`);
const connectionId = String((db.prepare("SELECT id FROM repository_connections WHERE project_id = ?").get(project!.id) as Row).id);

// 2. The repository history the recording refers to.
const repo = path.join(config.dataDir, "repos", project!.connection.locator);
const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" }).toString().trim();
const has = (sha: string) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
if (!fs.existsSync(path.join(repo, ".git"))) fail(`fixture repository missing at ${repo}`);
const bundle = path.join(dir, "repo", "repairs.bundle");
if (fs.existsSync(bundle)) {
  try {
    git("bundle", "verify", bundle);
  } catch {
    fail("the repair bundle doesn't apply to this fixture's history (its base commit is missing)");
  }
  git("fetch", "--quiet", bundle, "refs/heads/neverbreak/*:refs/heads/neverbreak/*");
}
for (const sha of manifest.commits as string[]) if (!has(sha)) fail(`commit ${sha.slice(0, 7)} from the recording is not in this fixture repository`);

// 3. Rows, re-linked to this installation's operator, project and connection.
const insert = (table: string, row: Row) => {
  const cols = Object.keys(row);
  db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...(cols.map((c) => row[c]) as never[]));
};
const before = Number((db.prepare("SELECT count(*) AS n FROM recorded_imports").get() as Row).n);
db.exec("BEGIN");
try {
  for (const r of data.verification_runs) insert("verification_runs", { ...r, project_id: project!.id, connection_id: connectionId, triggered_by: owner, worker_id: null });
  for (const t of ["verification_checks", "execution_evidence", "source_excerpts", "run_artifacts", "ai_explanations"]) for (const r of data[t] ?? []) insert(t, r);
  const haveEvents = new Set((db.prepare("SELECT DISTINCT run_id FROM run_events").all() as Row[]).map((r) => String(r.run_id)));
  for (const r of data.run_events) if (!haveEvents.has(String(r.run_id))) insert("run_events", r);
  for (const r of data.repairs) insert("repairs", { ...r, project_id: project!.id });
  for (const r of data.repair_attempts) insert("repair_attempts", r);
  for (const r of data.protected_flows) insert("protected_flows", { ...r, project_id: project!.id });
  for (const r of data.verification_runs)
    insert("recorded_imports", { run_id: r.id, package: path.basename(dir), recorded_in: manifest.recordedIn, exported_at: manifest.exportedAt });
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  fail(`database import failed: ${(e as Error).message}`);
}

// 4. Frames and kept builds, byte for byte.
for (const r of data.verification_runs) {
  const src = path.join(dir, "artifacts", String(r.id));
  const dst = path.join(config.dataDir, "artifacts", String(r.id));
  if (fs.existsSync(src) && !fs.existsSync(dst)) fs.cpSync(src, dst, { recursive: true });
}

const added = Number((db.prepare("SELECT count(*) AS n FROM recorded_imports").get() as Row).n) - before;
console.log(`Recorded demonstration ${added ? "imported" : "already present"}: ${manifest.runs.map((r: Row) => `${r.role} ${String(r.commit).slice(0, 7)} ${r.verdict} (${r.id})`).join(", ")}.`);
console.log(`Originally recorded ${manifest.runs[0].startedAt.slice(0, 10)}; every file matched its SHA-256 and every commit exists in ${path.relative(process.cwd(), repo) || repo}.`);
