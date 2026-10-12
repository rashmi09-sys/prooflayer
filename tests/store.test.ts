import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolated database for this test file.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-test-"));
process.env.PROOFLAYER_DATA_DIR = dir;
process.env.PROOFLAYER_SESSION_SECRET = "x".repeat(40);
process.env.PROOFLAYER_ACCESS_CODE = "test-code";

const store = await import("../lib/server/store.ts");
const { getDb } = await import("../lib/server/db.ts");

const sha = (c: string) => c.repeat(40);
let alice: string, bob: string;
let project: NonNullable<ReturnType<typeof store.getProjectBySlug>>;

before(() => {
  getDb();
  alice = store.ensureUser("alice@example.com", "Alice");
  bob = store.ensureUser("bob@example.com", "Bob");
  store.upsertProject({ ownerId: alice, name: "A", slug: "a", provider: "local", fullName: "demo/a", locator: "a", defaultBranch: "main", webUrl: null });
  project = store.getProjectBySlug(alice, "a")!;
});

const input = (commit: string) => ({ userId: alice, project, branch: "main", commitSha: sha(commit), commitMessage: "m", commitAuthor: "x", commitDate: null });

describe("persistence and authorization", () => {
  it("creates a run with one pending check per stage", () => {
    // 9 stages since the browser snapshot step was added.
    const { runId, deduplicated } = store.createRun(input("a"));
    assert.equal(deduplicated, false);
    const checks = store.getChecks(runId);
    assert.equal(checks.length, 9);
    assert.ok(checks.every((c) => c.status === "pending"));
  });

  it("deduplicates an active run for the same commit", () => {
    const first = store.createRun(input("b"));
    const second = store.createRun(input("b"));
    assert.equal(second.runId, first.runId);
    assert.equal(second.deduplicated, true);
  });

  it("hides other users' projects and runs", () => {
    const { runId } = store.createRun(input("c"));
    assert.equal(store.getProjectBySlug(bob, "a"), null);
    assert.equal(store.getRunForUser(bob, runId), null);
    assert.deepEqual(store.listRunsForProject(bob, project.id), []);
    assert.equal(store.requestCancel(bob, runId), "not_found");
    assert.throws(() => store.createRun({ ...input("d"), userId: bob }), /forbidden/);
  });

  it("claims queued runs once, in order", () => {
    const claimed = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = store.claimNextRun("w1");
      if (!r) break;
      assert.ok(!claimed.has(r.id));
      claimed.add(r.id);
    }
    assert.ok(claimed.size >= 3);
    assert.equal(store.claimNextRun("w2"), null);
  });

  it("cancels a queued run immediately", () => {
    const { runId } = store.createRun(input("e"));
    assert.equal(store.requestCancel(alice, runId), "ok");
    const run = store.getRunForUser(alice, runId)!;
    assert.equal(run.verdict, "cancelled");
    assert.equal(store.requestCancel(alice, runId), "finished");
  });

  it("closes runs from a dead worker as incomplete, never failed", () => {
    const { runId } = store.createRun(input("f"));
    const r = store.claimNextRun("dead")!;
    assert.equal(r.id, runId);
    store.updateCheck(runId, "install", { status: "running" });
    getDb().prepare("UPDATE verification_runs SET heartbeat_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(runId);
    assert.deepEqual(store.recoverStaleRuns(60_000), [runId]);
    const run = store.getRunForUser(alice, runId)!;
    assert.equal(run.verdict, "incomplete");
    assert.equal(store.getChecks(runId).find((c) => c.key === "install")!.failureClass, "infrastructure");
  });

  it("enforces the verdict/status invariant in the schema", () => {
    const { runId } = store.createRun(input("9"));
    assert.throws(() => getDb().prepare("UPDATE verification_runs SET status = 'completed' WHERE id = ?").run(runId));
  });

  it("survives reopening the database", async () => {
    const { openDb } = await import("../lib/server/db.ts");
    const db2 = openDb(path.join(dir, "prooflayer.db"));
    const count = (db2.prepare("SELECT count(*) AS n FROM verification_runs").get() as { n: number }).n;
    assert.ok(count >= 6);
    db2.close();
  });
});

describe("snapshot artifacts", () => {
  it("round-trips DOM annotations and scopes artifacts to the run owner", () => {
    const { runId } = store.createRun(input("7"));
    const checkId = store.checkId(runId, "snapshot");
    const annotations = {
      content: { x: 40, y: 40, width: 560, height: 308 },
      matches: [{ value: "$1.08", role: "received" as const, test: "t", found: true, boxes: [{ x: 40, y: 314, width: 218, height: 34 }], text: "Total due: $1.08" }],
    };
    const id = store.saveArtifact({ runId, checkId, kind: "screenshot", fileName: "snapshot.png", mime: "image/png", bytes: 1, sha256: "a".repeat(64), width: 1200, height: 760, pageUrl: "/", label: "/", capturedAt: new Date().toISOString(), annotations });
    assert.deepEqual(store.getArtifacts(runId)[0].annotations, annotations);
    assert.ok(store.getArtifactForUser(alice, runId, id));
    assert.equal(store.getArtifactForUser(bob, runId, id), null, "other users cannot fetch it");
    const other = store.createRun(input("8")).runId;
    assert.equal(store.getArtifactForUser(alice, other, id), null, "an artifact is only served under its own run");
  });

  it("adds the annotations column to databases created before it existed", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { openDb } = await import("../lib/server/db.ts");
    const file = path.join(dir, "old.db");
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE run_artifacts (id TEXT PRIMARY KEY, run_id TEXT, check_id TEXT, kind TEXT, file_name TEXT, mime TEXT, bytes INTEGER, sha256 TEXT, width INTEGER, height INTEGER, page_url TEXT, label TEXT, captured_at TEXT)");
    old.close();
    const db = openDb(file);
    const cols = (db.prepare("PRAGMA table_info(run_artifacts)").all() as Array<{ name: string }>).map((c) => c.name);
    assert.ok(cols.includes("annotations"));
    db.close();
  });
});
