import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { flowResults, isTestPath, parseTestResults, passingTests, testBody, type ProtectedFlow } from "../lib/shared/flows.ts";
import { planAttempts } from "../lib/server/repair.ts";
import { buildProofs } from "../lib/shared/proof.ts";
import type { CheckRecord, EvidenceRecord } from "../lib/shared/types.ts";

// Real node:test output recorded by the worker for commit 1df91de.
const TAP = fs.readFileSync(new URL("./fixtures/tap-1df91de.txt", import.meta.url), "utf8");

const flow = (key: string, kind: "test" | "page", testName: string | null): ProtectedFlow => ({ id: key, key, name: key, why: "", kind, testName, journeyId: null, learnedFromRunId: "run_a", learnedCommitSha: "a".repeat(40), position: 0 });
const check = (key: string, status: string, extra: Partial<CheckRecord> = {}) => ({ id: `c-${key}`, runId: "r", key, name: key, kind: "check", required: true, position: 0, status, failureClass: null, command: null, exitCode: status === "passed" ? 0 : 1, startedAt: null, finishedAt: null, durationMs: null, summary: null, ...extra }) as CheckRecord;

describe("test results from real output", () => {
  it("reads leaf tests and marks the describe block as a group", () => {
    const r = parseTestResults(TAP);
    assert.deepEqual(r.filter((t) => !t.group).map((t) => [t.name, t.ok]), [
      ["adds tax to the subtotal", true],
      ["formats the total for display", false],
      ["returns zero for an empty invoice", true],
    ]);
    assert.ok(r.find((t) => t.name === "invoice totals")?.group);
  });
  it("only learns passing leaf tests", () => {
    assert.deepEqual(passingTests(TAP), ["adds tax to the subtotal", "returns zero for an empty invoice"]);
  });
  it("understands Jest-style check marks", () => {
    assert.deepEqual(parseTestResults("  ✓ adds tax (3 ms)\n  ✕ formats total (5 ms)").map((t) => t.ok), [true, false]);
  });
});

describe("protected flow results", () => {
  const checks = [check("build", "passed"), check("test", "failed", { failureClass: "code" }), check("snapshot", "passed")];
  const evidence: EvidenceRecord[] = [{ checkId: "c-test", content: TAP, truncated: false, bytesTotal: TAP.length, sha256: null, updatedAt: "" }];
  const proofs = buildProofs(checks, evidence);
  const flows = [flow("page", "page", null), flow("total", "test", "formats the total for display"), flow("tax", "test", "adds tax to the subtotal"), flow("gone", "test", "a test that was deleted")];

  it("reports what broke, with the recorded values", () => {
    const [page, total, tax, gone] = flowResults(flows, checks, evidence, proofs, [], ["adds tax to the subtotal"]);
    assert.equal(page.state, "passed");
    assert.equal(total.state, "failed");
    assert.equal(total.expected, "$108.00");
    assert.equal(total.actual, "$1.08");
    assert.equal(tax.state, "passed");
    assert.equal(tax.testEdited, true);
    assert.equal(gone.state, "missing");
  });
  it("fails the page flow when the app didn't build", () => {
    const r = flowResults([flows[0]], [check("build", "failed"), check("snapshot", "skipped")], [], [], []);
    assert.equal(r[0].state, "failed");
  });
  it("waits instead of guessing while checks are running", () => {
    const r = flowResults(flows.slice(0, 2), [check("build", "running"), check("test", "running"), check("snapshot", "pending")], [], [], []);
    assert.deepEqual(r.map((x) => x.state), ["pending", "pending"]);
  });
});

describe("edited-test detection", () => {
  const before = `describe("x", () => {\n  it("adds tax", () => {\n    assert.equal(f(), 10800);\n  });\n  it("other", () => {});\n});`;
  it("isolates one test's body", () => {
    assert.equal(testBody(before, "adds tax"), `it("adds tax", () => {\n    assert.equal(f(), 10800);\n  });`);
    assert.equal(testBody(before, "missing"), null);
  });
  it("recognises test files", () => {
    assert.ok(isTestPath("tests/invoice.test.ts"));
    assert.ok(isTestPath("src/a.spec.tsx"));
    assert.ok(!isTestPath("src/lib/invoice.ts"));
  });
});

describe("repair plan", () => {
  it("restores app code first, then rolls back everything, never more than two", () => {
    assert.deepEqual(planAttempts(["tests/invoice.test.ts", "src/lib/invoice.ts"]), [
      { strategy: "restore-source", files: ["src/lib/invoice.ts"] },
      { strategy: "roll-back", files: ["src/lib/invoice.ts", "tests/invoice.test.ts"] },
    ]);
  });
  it("tries a prepared targeted fix first, then a roll-back", () => {
    const prepared = { ref: "prepared-fixes/x", sha: "c".repeat(40), message: "fix", files: ["src/lib/checkout.ts"] };
    assert.deepEqual(planAttempts(["src/lib/checkout.ts", "src/components/delivery.tsx"], prepared), [
      { strategy: "prepared-fix", files: ["src/lib/checkout.ts"], from: { ref: "prepared-fixes/x", sha: "c".repeat(40), message: "fix" } },
      { strategy: "roll-back", files: ["src/components/delivery.tsx", "src/lib/checkout.ts"] },
    ]);
  });
  it("skips a second attempt that would be identical", () => {
    assert.deepEqual(planAttempts(["src/a.ts"]), [{ strategy: "restore-source", files: ["src/a.ts"] }]);
    assert.deepEqual(planAttempts(["tests/a.test.ts"]), [{ strategy: "roll-back", files: ["tests/a.test.ts"] }]);
    assert.deepEqual(planAttempts([]), []);
  });
});
