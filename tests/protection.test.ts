import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// NeverBreak OFF must change real behaviour, not just the screen: a change
// requested with protection off is never repaired, manually or automatically.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-protection-"));
process.env.PROOFLAYER_DATA_DIR = dir;
process.env.PROOFLAYER_SESSION_SECRET = "x".repeat(40);
process.env.PROOFLAYER_ACCESS_CODE = "test-code";

const store = await import("../lib/server/store.ts");
const { repairAvailability } = await import("../lib/server/repair.ts");
const { getDb } = await import("../lib/server/db.ts");

const sha = (c: string) => c.repeat(40);
let project: NonNullable<ReturnType<typeof store.getProjectBySlug>>;
let owner: string;

before(() => {
  getDb();
  owner = store.ensureUser("op@example.com", "Operator");
  store.upsertProject({ ownerId: owner, name: "D", slug: "d", provider: "local", fullName: "demo/d", locator: "d", defaultBranch: "main", webUrl: null });
  project = store.getProjectBySlug(owner, "d")!;
});

function failedRun(c: string) {
  const { runId } = store.createRun({ userId: owner, project, branch: "main", commitSha: sha(c), commitMessage: "m", commitAuthor: "x", commitDate: null });
  store.finishRun(runId, "failed", "regular checkout failed");
  return store.getRunInternal(runId)!;
}

describe("NeverBreak protection", () => {
  it("records the prompt and the protection with the run", () => {
    const run = failedRun("1");
    store.recordRunRequest(run.id, "Add scheduled food delivery for tomorrow.", "off");
    assert.deepEqual(store.getRunRequest(run.id), { prompt: "Add scheduled food delivery for tomorrow.", protection: "off" });
  });

  it("refuses to repair a change requested with protection off", () => {
    const run = failedRun("2");
    store.recordRunRequest(run.id, "Add scheduled delivery", "off");
    const a = repairAvailability(run, project);
    assert.equal(a.ok, false);
    assert.match(a.reason, /protection off/);
  });

  it("does not block repair for the same change requested with protection on", () => {
    const run = failedRun("3");
    store.recordRunRequest(run.id, "Add scheduled delivery", "on");
    assert.doesNotMatch(repairAvailability(run, project).reason, /protection off/);
  });

  it("only accepts on or off", () => {
    const run = failedRun("4");
    assert.throws(() => getDb().prepare("INSERT INTO run_requests (run_id, prompt, protection) VALUES (?, ?, ?)").run(run.id, "x", "maybe"));
  });
});
