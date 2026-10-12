import type { DatabaseSync } from "node:sqlite";
import { getDb, newId, now } from "./db.ts";
import { STAGES } from "../shared/stages.ts";
import type { SourceExcerpt } from "../shared/proof.ts";
import type {
  AiExplanation,
  CheckRecord,
  CheckStatus,
  EvidenceRecord,
  FailureClass,
  RunArtifact,
  RunEvent,
  RunRecord,
  StageKey,
  Verdict,
} from "../shared/types.ts";

// Data access. Every function used by the web layer takes the acting
// user's id and only returns rows that user owns (the SQLite equivalent of
// the RLS policies in db/supabase/0001_init.sql).

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  connection: {
    id: string;
    provider: "local" | "github";
    fullName: string;
    locator: string;
    defaultBranch: string;
    webUrl: string | null;
  };
}

function mapProject(r: Row): ProjectRecord {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    name: String(r.name),
    slug: String(r.slug),
    connection: {
      id: String(r.connection_id),
      provider: r.provider as "local" | "github",
      fullName: String(r.full_name),
      locator: String(r.locator),
      defaultBranch: String(r.default_branch),
      webUrl: s(r.web_url),
    },
  };
}

const PROJECT_SELECT = `
  SELECT p.*, c.id AS connection_id, c.provider, c.full_name, c.locator, c.default_branch, c.web_url
  FROM projects p JOIN repository_connections c ON c.project_id = p.id`;

const RUN_SELECT = `
  SELECT r.*, p.name AS project_name, p.slug AS project_slug, p.owner_id,
         c.full_name, c.provider, c.web_url
  FROM verification_runs r
  JOIN projects p ON p.id = r.project_id
  JOIN repository_connections c ON c.id = r.connection_id`;

function mapRun(r: Row): RunRecord {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: String(r.project_name),
    projectSlug: String(r.project_slug),
    repoFullName: String(r.full_name),
    repoProvider: r.provider as "local" | "github",
    repoUrl: s(r.web_url),
    branch: String(r.branch),
    commitSha: String(r.commit_sha),
    commitMessage: s(r.commit_message),
    commitAuthor: s(r.commit_author),
    commitDate: s(r.commit_date),
    status: r.status as RunRecord["status"],
    verdict: (r.verdict as Verdict | null) ?? null,
    verdictReason: s(r.verdict_reason),
    cancelRequested: Number(r.cancel_requested) === 1,
    createdAt: String(r.created_at),
    startedAt: s(r.started_at),
    finishedAt: s(r.finished_at),
    durationMs: n(r.duration_ms),
    sample: false,
    isRepair: String(r.branch).startsWith(REPAIR_BRANCH_PREFIX),
  };
}

/** Branches NeverBreak creates for repair attempts. Never the project's own branches. */
export const REPAIR_BRANCH_PREFIX = "neverbreak/";

function mapCheck(r: Row): CheckRecord {
  return {
    id: String(r.id),
    runId: String(r.run_id),
    key: r.key as StageKey,
    name: String(r.name),
    kind: r.kind as CheckRecord["kind"],
    required: Number(r.required) === 1,
    position: Number(r.position),
    status: r.status as CheckStatus,
    failureClass: (r.failure_class as FailureClass | null) ?? null,
    command: s(r.command),
    exitCode: n(r.exit_code),
    startedAt: s(r.started_at),
    finishedAt: s(r.finished_at),
    durationMs: n(r.duration_ms),
    summary: s(r.summary),
  };
}

// ---------------------------------------------------------------- users

export function ensureUser(email: string, displayName: string, db: DatabaseSync = getDb()): string {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as Row | undefined;
  if (existing) return String(existing.id);
  const id = newId("usr");
  db.prepare("INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)").run(id, email, displayName);
  return id;
}

/** The only account in the public demo snapshot (whose email is anonymised there). */
export function soleUserId(db: DatabaseSync = getDb()): string | null {
  const rows = db.prepare("SELECT id FROM users LIMIT 2").all() as Row[];
  return rows.length === 1 ? String(rows[0].id) : null;
}

/** Read-only lookup (safe on the public demo's read-only database). */
export function findUserIdByEmail(email: string, db: DatabaseSync = getDb()): string | null {
  const r = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as Row | undefined;
  return r ? String(r.id) : null;
}

export function getUser(id: string, db: DatabaseSync = getDb()) {
  const r = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id) as Row | undefined;
  return r ? { id: String(r.id), email: String(r.email), displayName: String(r.display_name) } : null;
}

// ------------------------------------------------------------- projects

export function upsertProject(
  input: {
    ownerId: string;
    name: string;
    slug: string;
    provider: "local" | "github";
    fullName: string;
    locator: string;
    defaultBranch: string;
    webUrl: string | null;
  },
  db: DatabaseSync = getDb(),
): string {
  const existing = db.prepare("SELECT id FROM projects WHERE slug = ?").get(input.slug) as Row | undefined;
  if (existing) {
    const id = String(existing.id);
    db.prepare(
      `UPDATE repository_connections SET provider=?, full_name=?, locator=?, default_branch=?, web_url=?
       WHERE project_id=?`,
    ).run(input.provider, input.fullName, input.locator, input.defaultBranch, input.webUrl, id);
    return id;
  }
  const id = newId("prj");
  db.prepare("INSERT INTO projects (id, owner_id, name, slug) VALUES (?, ?, ?, ?)").run(
    id,
    input.ownerId,
    input.name,
    input.slug,
  );
  db.prepare(
    `INSERT INTO repository_connections (id, project_id, provider, full_name, locator, default_branch, web_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId("con"), id, input.provider, input.fullName, input.locator, input.defaultBranch, input.webUrl);
  return id;
}

export function listProjects(userId: string, db: DatabaseSync = getDb()): ProjectRecord[] {
  return (db.prepare(`${PROJECT_SELECT} WHERE p.owner_id = ? ORDER BY p.created_at`).all(userId) as Row[]).map(
    mapProject,
  );
}

export function getProjectBySlug(userId: string, slug: string, db: DatabaseSync = getDb()) {
  const r = db.prepare(`${PROJECT_SELECT} WHERE p.owner_id = ? AND p.slug = ?`).get(userId, slug) as
    | Row
    | undefined;
  return r ? mapProject(r) : null;
}

export function getProjectById(projectId: string, db: DatabaseSync = getDb()) {
  const r = db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(projectId) as Row | undefined;
  return r ? mapProject(r) : null;
}

// ----------------------------------------------------------------- runs

export type CreateRunResult = { ok: true; runId: string; deduplicated: boolean };

export function createRun(
  input: {
    userId: string;
    project: ProjectRecord;
    branch: string;
    commitSha: string;
    commitMessage: string | null;
    commitAuthor: string | null;
    commitDate: string | null;
  },
  db: DatabaseSync = getDb(),
): CreateRunResult {
  if (input.project.ownerId !== input.userId) throw new Error("forbidden");
  const active = db
    .prepare(
      "SELECT id FROM verification_runs WHERE project_id = ? AND commit_sha = ? AND status IN ('queued','running')",
    )
    .get(input.project.id, input.commitSha) as Row | undefined;
  if (active) return { ok: true, runId: String(active.id), deduplicated: true };

  const id = newId("run");
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare(
      `INSERT INTO verification_runs
        (id, project_id, connection_id, triggered_by, branch, commit_sha, commit_message, commit_author, commit_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.project.id,
      input.project.connection.id,
      input.userId,
      input.branch,
      input.commitSha,
      input.commitMessage,
      input.commitAuthor,
      input.commitDate,
    );
    const insertCheck = db.prepare(
      `INSERT INTO verification_checks (id, run_id, key, name, kind, required, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    STAGES.forEach((stage, i) =>
      insertCheck.run(newId("chk"), id, stage.key, stage.name, stage.kind, stage.required ? 1 : 0, i),
    );
    db.prepare("INSERT INTO run_events (run_id, level, message) VALUES (?, 'info', ?)").run(
      id,
      `Queued verification of ${input.commitSha.slice(0, 7)} on ${input.branch}.`,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    // Another request queued the same commit between our check and insert.
    if (String(err).includes("UNIQUE")) {
      const again = db
        .prepare(
          "SELECT id FROM verification_runs WHERE project_id = ? AND commit_sha = ? AND status IN ('queued','running')",
        )
        .get(input.project.id, input.commitSha) as Row | undefined;
      if (again) return { ok: true, runId: String(again.id), deduplicated: true };
    }
    throw err;
  }
  return { ok: true, runId: id, deduplicated: false };
}

export function getRunForUser(userId: string, runId: string, db: DatabaseSync = getDb()): RunRecord | null {
  const r = db.prepare(`${RUN_SELECT} WHERE r.id = ? AND p.owner_id = ?`).get(runId, userId) as Row | undefined;
  return r ? mapRun(r) : null;
}

export function getRunInternal(runId: string, db: DatabaseSync = getDb()): RunRecord | null {
  const r = db.prepare(`${RUN_SELECT} WHERE r.id = ?`).get(runId) as Row | undefined;
  return r ? mapRun(r) : null;
}

export function listRunsForProject(
  userId: string,
  projectId: string,
  limit = 50,
  db: DatabaseSync = getDb(),
): Array<RunRecord & { checks: CheckRecord[] }> {
  const runs = (
    db
      .prepare(`${RUN_SELECT} WHERE r.project_id = ? AND p.owner_id = ? ORDER BY r.created_at DESC LIMIT ?`)
      .all(projectId, userId, limit) as Row[]
  ).map(mapRun);
  if (runs.length === 0) return [];
  const placeholders = runs.map(() => "?").join(",");
  const checks = (
    db
      .prepare(`SELECT * FROM verification_checks WHERE run_id IN (${placeholders}) ORDER BY position`)
      .all(...runs.map((r) => r.id)) as Row[]
  ).map(mapCheck);
  return runs.map((r) => ({ ...r, checks: checks.filter((c) => c.runId === r.id) }));
}

export function getChecks(runId: string, db: DatabaseSync = getDb()): CheckRecord[] {
  return (
    db.prepare("SELECT * FROM verification_checks WHERE run_id = ? ORDER BY position").all(runId) as Row[]
  ).map(mapCheck);
}

export function getEvidence(runId: string, db: DatabaseSync = getDb()): EvidenceRecord[] {
  return (db.prepare("SELECT * FROM execution_evidence WHERE run_id = ?").all(runId) as Row[]).map((r) => ({
    checkId: String(r.check_id),
    content: String(r.content),
    truncated: Number(r.truncated) === 1,
    bytesTotal: Number(r.bytes_total),
    sha256: s(r.sha256),
    updatedAt: String(r.updated_at),
  }));
}

export function getEvents(runId: string, db: DatabaseSync = getDb()): RunEvent[] {
  return (db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id").all(runId) as Row[]).map((r) => ({
    id: Number(r.id),
    runId: String(r.run_id),
    ts: String(r.ts),
    level: r.level as RunEvent["level"],
    message: String(r.message),
  }));
}

export function getExplanations(runId: string, db: DatabaseSync = getDb()): AiExplanation[] {
  return (
    db.prepare("SELECT * FROM ai_explanations WHERE run_id = ? ORDER BY created_at DESC").all(runId) as Row[]
  ).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    checkId: String(r.check_id),
    status: r.status as AiExplanation["status"],
    model: s(r.model),
    content: r.content_json ? JSON.parse(String(r.content_json)) : null,
    errorMessage: s(r.error_message),
    createdAt: String(r.created_at),
  }));
}

export function saveExplanation(
  input: Omit<AiExplanation, "id" | "createdAt">,
  db: DatabaseSync = getDb(),
): void {
  db.prepare(
    `INSERT INTO ai_explanations (id, run_id, check_id, status, model, content_json, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("aix"),
    input.runId,
    input.checkId,
    input.status,
    input.model,
    input.content ? JSON.stringify(input.content) : null,
    input.errorMessage,
  );
}

export function requestCancel(userId: string, runId: string, db: DatabaseSync = getDb()): "ok" | "not_found" | "finished" {
  const run = getRunForUser(userId, runId, db);
  if (!run) return "not_found";
  if (run.status === "completed") return "finished";
  db.prepare("UPDATE verification_runs SET cancel_requested = 1 WHERE id = ?").run(runId);
  if (run.status === "queued") {
    // Nothing is executing yet, so the run can be closed immediately.
    finishRun(runId, "cancelled", "Cancelled by the user before execution started.", db);
    db.prepare("UPDATE verification_checks SET status = 'cancelled' WHERE run_id = ? AND status = 'pending'").run(
      runId,
    );
  }
  addEvent(runId, "warn", "Cancellation requested by the user.", db);
  return "ok";
}

/** The most recent run on this project that recorded a Passed verdict. */
export function lastPassedRun(userId: string, projectId: string, db: DatabaseSync = getDb()): RunRecord | null {
  const r = db
    .prepare(
      `${RUN_SELECT} WHERE r.project_id = ? AND p.owner_id = ? AND r.verdict = 'passed'
         AND r.branch NOT LIKE 'neverbreak/%'
       ORDER BY r.finished_at DESC LIMIT 1`,
    )
    .get(projectId, userId) as Row | undefined;
  return r ? mapRun(r) : null;
}

// ---------------------------------------------------- worker-side writes

export function claimNextRun(workerId: string, db: DatabaseSync = getDb()): RunRecord | null {
  const ts = now();
  const r = db
    .prepare(
      `UPDATE verification_runs
         SET status = 'running', worker_id = ?, started_at = ?, heartbeat_at = ?
       WHERE id = (SELECT id FROM verification_runs WHERE status = 'queued' AND cancel_requested = 0
                   ORDER BY created_at LIMIT 1)
         AND status = 'queued'
       RETURNING id`,
    )
    .get(workerId, ts, ts) as Row | undefined;
  return r ? getRunInternal(String(r.id), db) : null;
}

export function heartbeat(runId: string, db: DatabaseSync = getDb()): boolean {
  db.prepare("UPDATE verification_runs SET heartbeat_at = ? WHERE id = ?").run(now(), runId);
  const r = db.prepare("SELECT cancel_requested FROM verification_runs WHERE id = ?").get(runId) as Row | undefined;
  return Number(r?.cancel_requested) === 1;
}

export function updateCheck(
  runId: string,
  key: StageKey,
  patch: Partial<{
    status: CheckStatus;
    failureClass: FailureClass | null;
    command: string | null;
    exitCode: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    summary: string | null;
  }>,
  db: DatabaseSync = getDb(),
): void {
  const cols: Record<string, string> = {
    status: "status",
    failureClass: "failure_class",
    command: "command",
    exitCode: "exit_code",
    startedAt: "started_at",
    finishedAt: "finished_at",
    durationMs: "duration_ms",
    summary: "summary",
  };
  const entries = Object.entries(patch).filter(([k]) => k in cols);
  if (entries.length === 0) return;
  const sql = `UPDATE verification_checks SET ${entries.map(([k]) => `${cols[k]} = ?`).join(", ")}
               WHERE run_id = ? AND key = ?`;
  db.prepare(sql).run(...entries.map(([, v]) => (v === undefined ? null : (v as string | number | null))), runId, key);
}

export function checkId(runId: string, key: StageKey, db: DatabaseSync = getDb()): string {
  const r = db.prepare("SELECT id FROM verification_checks WHERE run_id = ? AND key = ?").get(runId, key) as Row;
  return String(r.id);
}

export function writeEvidence(
  runId: string,
  key: StageKey,
  content: string,
  truncated: boolean,
  bytesTotal: number,
  sha256: string | null,
  db: DatabaseSync = getDb(),
): void {
  db.prepare(
    `INSERT INTO execution_evidence (check_id, run_id, content, truncated, bytes_total, sha256, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(check_id) DO UPDATE SET content = excluded.content, truncated = excluded.truncated,
       bytes_total = excluded.bytes_total, sha256 = excluded.sha256, updated_at = excluded.updated_at`,
  ).run(checkId(runId, key, db), runId, content, truncated ? 1 : 0, bytesTotal, sha256, now());
}

export function addEvent(runId: string, level: RunEvent["level"], message: string, db: DatabaseSync = getDb()) {
  db.prepare("INSERT INTO run_events (run_id, level, message) VALUES (?, ?, ?)").run(runId, level, message);
}

export function finishRun(runId: string, verdict: Verdict, reason: string, db: DatabaseSync = getDb()) {
  const ts = now();
  db.prepare(
    `UPDATE verification_runs
       SET status = 'completed', verdict = ?, verdict_reason = ?, finished_at = ?,
           duration_ms = CAST((julianday(?) - julianday(COALESCE(started_at, created_at))) * 86400000 AS INTEGER)
     WHERE id = ? AND status != 'completed'`,
  ).run(verdict, reason, ts, ts, runId);
}

/** Close runs whose worker stopped heartbeating. Recorded as Incomplete, never Failed. */
export function recoverStaleRuns(staleAfterMs: number, db: DatabaseSync = getDb()): string[] {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const stale = db
    .prepare("SELECT id FROM verification_runs WHERE status = 'running' AND heartbeat_at < ?")
    .all(cutoff) as Row[];
  for (const r of stale) {
    const id = String(r.id);
    db.prepare(
      `UPDATE verification_checks SET status = 'error', failure_class = 'infrastructure',
         summary = 'The verification worker stopped before this step finished.'
       WHERE run_id = ? AND status = 'running'`,
    ).run(id);
    db.prepare("UPDATE verification_checks SET status = 'skipped' WHERE run_id = ? AND status = 'pending'").run(id);
    addEvent(id, "error", "The worker stopped responding. The run was closed as Incomplete.", db);
    finishRun(id, "incomplete", "The verification worker stopped before the run finished. This is not evidence that the code is broken.", db);
  }
  return stale.map((r) => String(r.id));
}

// ------------------------------------------------- excerpts and artifacts

export function saveExcerpt(
  input: { runId: string; checkId: string; file: string; startLine: number; highlightLine: number; lines: string[] },
  db: DatabaseSync = getDb(),
): void {
  db.prepare(
    `INSERT OR IGNORE INTO source_excerpts (id, run_id, check_id, file, start_line, highlight_line, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId("exc"), input.runId, input.checkId, input.file, input.startLine, input.highlightLine, input.lines.join("\n"));
}

export function getExcerpts(runId: string, db: DatabaseSync = getDb()): SourceExcerpt[] {
  return (db.prepare("SELECT * FROM source_excerpts WHERE run_id = ? ORDER BY rowid").all(runId) as Row[]).map((r) => ({
    checkId: String(r.check_id),
    file: String(r.file),
    startLine: Number(r.start_line),
    highlightLine: Number(r.highlight_line),
    lines: String(r.content).split("\n"),
  }));
}

export function saveArtifact(
  input: Omit<RunArtifact, "id"> & { fileName: string },
  db: DatabaseSync = getDb(),
): string {
  const id = newId("art");
  db.prepare(
    `INSERT INTO run_artifacts (id, run_id, check_id, kind, file_name, mime, bytes, sha256, width, height, page_url, label, captured_at, annotations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.runId, input.checkId, input.kind, input.fileName, input.mime, input.bytes, input.sha256, input.width, input.height, input.pageUrl, input.label, input.capturedAt, input.annotations ? JSON.stringify(input.annotations) : null);
  return id;
}

function mapArtifact(r: Row): RunArtifact & { fileName: string } {
  return {
    id: String(r.id),
    runId: String(r.run_id),
    checkId: String(r.check_id),
    kind: "screenshot",
    fileName: String(r.file_name),
    mime: String(r.mime),
    bytes: Number(r.bytes),
    sha256: String(r.sha256),
    width: n(r.width),
    height: n(r.height),
    pageUrl: s(r.page_url),
    label: s(r.label),
    capturedAt: String(r.captured_at),
    annotations: r.annotations ? (JSON.parse(String(r.annotations)) as RunArtifact["annotations"]) : null,
  };
}

export function getArtifacts(runId: string, db: DatabaseSync = getDb()): RunArtifact[] {
  return (db.prepare("SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY captured_at").all(runId) as Row[]).map((r) => {
    const { fileName: _f, ...rest } = mapArtifact(r);
    void _f;
    return rest;
  });
}

/** Artifact metadata including its file name, only if the user owns the run. */
export function getArtifactForUser(userId: string, runId: string, artifactId: string, db: DatabaseSync = getDb()) {
  if (!getRunForUser(userId, runId, db)) return null;
  const r = db.prepare("SELECT * FROM run_artifacts WHERE id = ? AND run_id = ?").get(artifactId, runId) as Row | undefined;
  return r ? mapArtifact(r) : null;
}

// ------------------------------------------------------ recorded imports

export interface RecordedImport {
  package: string;
  recordedIn: string;
  exportedAt: string;
  importedAt: string;
}

/** Set when a run came from a recorded demonstration package rather than this machine's worker. */
export function getRecordedImport(runId: string, db: DatabaseSync = getDb()): RecordedImport | null {
  const r = db.prepare("SELECT package, recorded_in, exported_at, imported_at FROM recorded_imports WHERE run_id = ?").get(runId) as Row | undefined;
  return r ? { package: String(r.package), recordedIn: String(r.recorded_in), exportedAt: String(r.exported_at), importedAt: String(r.imported_at) } : null;
}

// ---------------------------------------------------------- run requests

export function recordRunRequest(runId: string, prompt: string, protection: "on" | "off", db: DatabaseSync = getDb()): void {
  db.prepare("INSERT OR REPLACE INTO run_requests (run_id, prompt, protection) VALUES (?, ?, ?)").run(runId, prompt.slice(0, 400), protection);
}

export function getRunRequest(runId: string, db: DatabaseSync = getDb()): { prompt: string; protection: "on" | "off" } | null {
  const r = db.prepare("SELECT prompt, protection FROM run_requests WHERE run_id = ?").get(runId) as Row | undefined;
  return r ? { prompt: String(r.prompt), protection: r.protection === "off" ? "off" : "on" } : null;
}

// --------------------------------------------------------- operator sessions

export function getSessionEpoch(db: DatabaseSync = getDb()): number {
  const r = db.prepare("SELECT value FROM operator_state WHERE key = 'session_epoch'").get() as Row | undefined;
  return r ? Number(r.value) || 0 : 0;
}

/** Revokes every session issued so far. */
export function bumpSessionEpoch(db: DatabaseSync = getDb()): number {
  const next = getSessionEpoch(db) + 1;
  db.prepare("INSERT INTO operator_state (key, value) VALUES ('session_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(next));
  return next;
}
