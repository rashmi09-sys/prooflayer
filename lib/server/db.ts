import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config, dbPath } from "./config.ts";

// One connection per process. The web server and the worker are separate
// processes sharing the same file; WAL mode and a busy timeout let them
// read and write concurrently.

const globalForDb = globalThis as unknown as { __prooflayerDb?: DatabaseSync };

export function openDb(file = dbPath()): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  db.exec(schema); // recreate indexes for any table a migration rebuilt
  return db;
}

/**
 * The public demo's database: the immutable snapshot, opened read-only. No
 * schema changes, migrations or journal files, so it works on a read-only
 * filesystem and any attempted write fails instead of silently succeeding.
 */
export function openSnapshotDb(file = dbPath()): DatabaseSync {
  if (!fs.existsSync(file)) {
    throw new Error(`The public demo snapshot is missing (${path.basename(path.dirname(file))}/${path.basename(file)}). Build it with npm run demo:snapshot.`);
  }
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec("PRAGMA query_only = ON;");
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalForDb.__prooflayerDb) globalForDb.__prooflayerDb = config.publicDemo ? openSnapshotDb() : openDb();
  return globalForDb.__prooflayerDb;
}

export function now(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const s = Buffer.from(bytes).toString("base64url").replace(/[-_]/g, "x");
  return `${prefix}_${s}`;
}

/** Additive migrations for databases created by earlier versions. */
function migrate(db: DatabaseSync): void {
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols("run_artifacts").includes("annotations")) {
    db.exec("ALTER TABLE run_artifacts ADD COLUMN annotations TEXT");
  }
  // NeverBreak v2: journey flows, repair outcomes, prepared fixes. SQLite can't
  // alter CHECK constraints, so older tables are rebuilt with their rows kept.
  const tableSql = (t: string) => String((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t) as { sql?: string } | undefined)?.sql ?? "");
  if (!tableSql("protected_flows").includes("'journey'")) {
    rebuild(db, "protected_flows", ["id", "project_id", "key", "name", "why", "kind", "test_name", "learned_from_run_id", "learned_commit_sha", "position", "created_at"]);
  }
  if (!cols("repairs").includes("outcome")) {
    db.exec("ALTER TABLE repairs ADD COLUMN outcome TEXT CHECK (outcome IN ('repaired','rolled-back'))");
    // Earlier successful repairs all passed by rolling back; say so.
    db.exec(`UPDATE repairs SET outcome = 'rolled-back' WHERE status = 'succeeded' AND id IN (SELECT repair_id FROM repair_attempts WHERE strategy = 'roll-back' AND outcome = 'passed')`);
    db.exec(`UPDATE repairs SET outcome = 'repaired' WHERE status = 'succeeded' AND outcome IS NULL`);
  }
  if (!tableSql("repair_attempts").includes("'prepared-fix'")) {
    rebuild(db, "repair_attempts", ["id", "repair_id", "n", "strategy", "files", "branch", "commit_sha", "run_id", "outcome", "created_at"]);
  }
}

/** Recreate a table from the current schema.sql definition, copying the given columns. */
function rebuild(db: DatabaseSync, table: string, columns: string[]) {
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`).exec(schema);
  if (!m) throw new Error(`No definition for ${table} in schema.sql`);
  const cols = columns.join(", ");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    db.exec(m[0].replace("IF NOT EXISTS ", ""));
    db.exec(`INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${table}_old`);
    db.exec(`DROP TABLE ${table}_old`);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
