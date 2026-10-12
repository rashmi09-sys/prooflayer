import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The recorded demonstration package shipped in demo/recorded/dashdish:
// unchanged since export, internally consistent, and free of anything private.

const dir = path.join(import.meta.dirname, "..", "demo", "recorded", "dashdish");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const data = JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf8"));

describe("recorded demonstration package", () => {
  it("every file matches the hash recorded at export", () => {
    const listed = Object.keys(manifest.files);
    assert.ok(listed.length > 50);
    for (const rel of listed) {
      const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, ...rel.split("/")))).digest("hex");
      assert.equal(sha, manifest.files[rel], rel);
    }
  });

  it("holds the real story: a passing baseline, the failing change, and a passing repair", () => {
    const byRole = Object.fromEntries(manifest.runs.map((r: { role: string }) => [r.role, r]));
    assert.equal(byRole.baseline.verdict, "passed");
    assert.equal(byRole.change.verdict, "failed");
    assert.equal(byRole["repair-verification"].verdict, "passed");
    assert.equal(data.repairs[0].outcome, "repaired");
    assert.equal(data.repair_attempts[0].strategy, "prepared-fix");
    assert.equal(data.repair_attempts[0].run_id, byRole["repair-verification"].id);
    // The failing assertion is the one the worker recorded, not a summary written later.
    const test = data.verification_checks.find((c: { run_id: string; key: string }) => c.run_id === byRole.change.id && c.key === "test");
    assert.equal(test.exit_code, 1);
    assert.match(test.summary, /expected 'Order confirmed', received 'Choose a delivery time'/);
    // Every run row carries the timestamps it was recorded with.
    for (const r of data.verification_runs) assert.ok(r.started_at && r.finished_at && r.started_at < r.finished_at);
  });

  it("has a Chromium frame file for every artifact row, and the kept builds with their base paths", () => {
    for (const a of data.run_artifacts) assert.ok(manifest.files[`artifacts/${a.run_id}/${a.file_name}`], a.file_name);
    for (const r of manifest.runs) {
      const base = fs.readFileSync(path.join(dir, "artifacts", r.id, "site-base.txt"), "utf8").trim();
      assert.match(base, new RegExp(`^/preview/${r.id}-[0-9a-f]{24}$`));
      assert.ok(fs.readFileSync(path.join(dir, "artifacts", r.id, "site", "index.html"), "utf8").includes(base), "the build links to its own base path");
    }
  });

  it("contains nothing that identifies or unlocks the machine it came from", () => {
    const text = fs.readFileSync(path.join(dir, "data.json"), "utf8");
    assert.doesNotMatch(text, /\/home\/|\/root\/|\/Users\/|sk-ant|PROOFLAYER_ACCESS_CODE|PROOFLAYER_SESSION_SECRET/);
    for (const r of data.verification_runs) {
      for (const k of ["project_id", "connection_id", "triggered_by", "worker_id"]) assert.equal(k in r, false, k);
    }
  });
});

describe("kept build base paths", () => {
  it("serve a recorded build at the path it was built with, and refuse others", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-base-"));
    process.env.PROOFLAYER_DATA_DIR = tmp;
    delete process.env.PROOFLAYER_SESSION_SECRET;
    const { recordedPreviewBase, runFromPreviewSegment, previewBase } = await import("../lib/server/preview.ts");
    const id = "run_abcdefABCDEF";
    // Without a session secret, a random per-install secret is created, never a constant.
    const own = previewBase(id);
    assert.ok(fs.existsSync(path.join(tmp, "preview-secret")));
    assert.equal(runFromPreviewSegment(own.slice("/preview/".length)), id);
    // A recorded build keeps its own path; this install's path then no longer opens it.
    const recorded = `/preview/${id}-${"a1".repeat(12)}`;
    fs.mkdirSync(path.join(tmp, "artifacts", id), { recursive: true });
    fs.writeFileSync(path.join(tmp, "artifacts", id, "site-base.txt"), recorded + "\n");
    assert.equal(recordedPreviewBase(id), recorded);
    assert.equal(runFromPreviewSegment(recorded.slice("/preview/".length)), id);
    assert.equal(runFromPreviewSegment(`${id}-${"b2".repeat(12)}`), null);
  });
});
