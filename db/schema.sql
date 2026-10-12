-- ProofLayer schema (SQLite). The Postgres/Supabase equivalent with
-- Row Level Security lives in db/supabase/0001_init.sql.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);

CREATE TABLE IF NOT EXISTS repository_connections (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('local','github')),
  full_name       TEXT NOT NULL,
  -- Server-side locator: a filesystem path for 'local', "owner/name" for 'github'.
  locator         TEXT NOT NULL,
  default_branch  TEXT NOT NULL,
  web_url         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS verification_runs (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL REFERENCES repository_connections(id) ON DELETE CASCADE,
  triggered_by      TEXT NOT NULL REFERENCES users(id),
  branch            TEXT NOT NULL,
  commit_sha        TEXT NOT NULL CHECK (length(commit_sha) = 40),
  commit_message    TEXT,
  commit_author     TEXT,
  commit_date       TEXT,
  status            TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed')),
  verdict           TEXT CHECK (verdict IN ('passed','failed','incomplete','cancelled')),
  verdict_reason    TEXT,
  cancel_requested  INTEGER NOT NULL DEFAULT 0,
  worker_id         TEXT,
  heartbeat_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at        TEXT,
  finished_at       TEXT,
  duration_ms       INTEGER,
  CHECK ((status = 'completed') = (verdict IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS runs_project_created_idx ON verification_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_status_idx ON verification_runs(status, created_at);
-- Job deduplication: one active run per project + commit.
CREATE UNIQUE INDEX IF NOT EXISTS runs_active_commit_uidx
  ON verification_runs(project_id, commit_sha) WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS verification_checks (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('pipeline','check')),
  required       INTEGER NOT NULL,
  position       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','passed','failed','skipped','error','cancelled')),
  failure_class  TEXT CHECK (failure_class IN ('code','infrastructure','timeout','resource_limit')),
  command        TEXT,
  exit_code      INTEGER,
  started_at     TEXT,
  finished_at    TEXT,
  duration_ms    INTEGER,
  summary        TEXT,
  UNIQUE (run_id, key)
);
CREATE INDEX IF NOT EXISTS checks_run_idx ON verification_checks(run_id, position);

CREATE TABLE IF NOT EXISTS execution_evidence (
  check_id     TEXT PRIMARY KEY REFERENCES verification_checks(id) ON DELETE CASCADE,
  run_id       TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,          -- sanitized, size-limited
  truncated    INTEGER NOT NULL DEFAULT 0,
  bytes_total  INTEGER NOT NULL DEFAULT 0,
  sha256       TEXT,                   -- hash of the stored content, set when the check ends
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS evidence_run_idx ON execution_evidence(run_id);

CREATE TABLE IF NOT EXISTS run_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id   TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  ts       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  level    TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  message  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run_idx ON run_events(run_id, id);

CREATE TABLE IF NOT EXISTS ai_explanations (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  check_id       TEXT NOT NULL REFERENCES verification_checks(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('ok','error')),
  model          TEXT,
  content_json   TEXT,
  error_message  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ai_run_idx ON ai_explanations(run_id, check_id, created_at DESC);

-- Source lines around each parsed failure location, copied from the exact
-- commit while its workspace still exists. Sanitized like all evidence.
CREATE TABLE IF NOT EXISTS source_excerpts (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  check_id        TEXT NOT NULL REFERENCES verification_checks(id) ON DELETE CASCADE,
  file            TEXT NOT NULL,
  start_line      INTEGER NOT NULL,
  highlight_line  INTEGER NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (check_id, file, highlight_line)
);
CREATE INDEX IF NOT EXISTS excerpts_run_idx ON source_excerpts(run_id);

-- Binary artifacts produced by a run (browser screenshots). Files live in
-- <data>/artifacts/<run id>/; only metadata is stored here.
CREATE TABLE IF NOT EXISTS run_artifacts (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  check_id     TEXT NOT NULL REFERENCES verification_checks(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('screenshot')),
  file_name    TEXT NOT NULL,
  mime         TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  width        INTEGER,
  height       INTEGER,
  page_url     TEXT,
  label        TEXT,
  captured_at  TEXT NOT NULL,
  annotations  TEXT            -- JSON: where assertion values render in the page
);
CREATE INDEX IF NOT EXISTS artifacts_run_idx ON run_artifacts(run_id);

-- NeverBreak: flows that already worked and must keep working. Each is tied
-- to a real check (a named test, or the built page opening in Chromium) and
-- remembers the passing run it was learned from.
CREATE TABLE IF NOT EXISTS protected_flows (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key                 TEXT NOT NULL,
  name                TEXT NOT NULL,
  why                 TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('test','page','journey')),
  test_name           TEXT,
  journey_id          TEXT,
  learned_from_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL,
  learned_commit_sha  TEXT NOT NULL CHECK (length(learned_commit_sha) = 40),
  position            INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (project_id, key),
  CHECK ((kind = 'test') = (test_name IS NOT NULL)),
  CHECK (kind <> 'journey' OR journey_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS project_settings (
  project_id   TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  auto_repair  INTEGER NOT NULL DEFAULT 0 CHECK (auto_repair IN (0,1))
);

-- A safe-repair attempt sequence for one failing run. At most two attempts,
-- each a real commit on a neverbreak/* branch verified by a normal run.
CREATE TABLE IF NOT EXISTS repairs (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_run_id  TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  base_run_id    TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  trigger        TEXT NOT NULL CHECK (trigger IN ('manual','automatic')),
  status         TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','stopped')),
  -- How a successful repair got there: a targeted fix that kept the change,
  -- or a roll-back that removed it. Never conflated.
  outcome        TEXT CHECK (outcome IN ('repaired','rolled-back')),
  summary        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS repairs_source_uidx ON repairs(source_run_id);

CREATE TABLE IF NOT EXISTS repair_attempts (
  id          TEXT PRIMARY KEY,
  repair_id   TEXT NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  n           INTEGER NOT NULL CHECK (n IN (1,2)),
  strategy    TEXT NOT NULL CHECK (strategy IN ('prepared-fix','restore-source','roll-back')),
  files       TEXT NOT NULL,
  -- For prepared-fix: the branch and commit the candidate patch came from.
  source_ref  TEXT,
  branch      TEXT NOT NULL,
  commit_sha  TEXT NOT NULL CHECK (length(commit_sha) = 40),
  run_id      TEXT REFERENCES verification_runs(id) ON DELETE SET NULL,
  outcome     TEXT CHECK (outcome IN ('passed','failed','incomplete','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (repair_id, n)
);
CREATE INDEX IF NOT EXISTS repair_attempts_run_idx ON repair_attempts(run_id);

-- Runs imported from a recorded demonstration package (scripts/import-recorded.ts).
-- They are genuine runs recorded elsewhere; this row is how the interface knows
-- to label them "Recorded demonstration" and never as a run of this machine.
CREATE TABLE IF NOT EXISTS recorded_imports (
  run_id       TEXT PRIMARY KEY REFERENCES verification_runs(id) ON DELETE CASCADE,
  package      TEXT NOT NULL,
  recorded_in  TEXT NOT NULL,
  exported_at  TEXT NOT NULL,
  imported_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- The prompt a live run was started from, and whether NeverBreak protection was on.
-- With protection off no repair is attempted for that run, manual or automatic.
CREATE TABLE IF NOT EXISTS run_requests (
  run_id      TEXT PRIMARY KEY REFERENCES verification_runs(id) ON DELETE CASCADE,
  prompt      TEXT NOT NULL,
  protection  TEXT NOT NULL CHECK (protection IN ('on','off')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Operator session epoch. Session cookies carry the epoch they were issued in;
-- signing out increments it, revoking every earlier session (one operator).
CREATE TABLE IF NOT EXISTS operator_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
