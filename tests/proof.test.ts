import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProofs, failureTitle, parseTestFailures, parseTypeFailures, relateValues } from "../lib/shared/proof.ts";
import type { CheckRecord } from "../lib/shared/types.ts";

const TAP = `TAP version 13
# Subtest: invoice totals
    # Subtest: formats the total for display
    not ok 2 - formats the total for display
      ---
      duration_ms: 15.3
      type: 'test'
      location: '/work/tests/invoice.test.ts:15:3'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:

        '$1.08' !== '$108.00'

      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: '$108.00'
      actual: '$1.08'
      operator: 'strictEqual'
      ...
not ok 1 - invoice totals
  ---
  type: 'suite'
  failureType: 'subtestsFailed'
  ...
# pass 2
# fail 1
`;

describe("parseTestFailures", () => {
  it("extracts the failing assertion, skipping the parent suite", () => {
    const [f, ...rest] = parseTestFailures(TAP);
    assert.equal(rest.length, 0);
    assert.equal(f.name, "formats the total for display");
    assert.equal(f.file, "tests/invoice.test.ts");
    assert.equal(f.line, 15);
    assert.equal(f.expected, "$108.00");
    assert.equal(f.actual, "$1.08");
    assert.equal(f.operator, "strictEqual");
    assert.equal(f.message, "Expected values to be strictly equal:");
  });

  it("falls back to Jest/Vitest style output", () => {
    const [f] = parseTestFailures("● cart › applies discount\n\n    Expected: 90\n    Received: 100\n");
    assert.equal(f.expected, "90");
    assert.equal(f.actual, "100");
  });

  it("returns nothing for passing output", () => {
    assert.deepEqual(parseTestFailures("ok 1 - a\n# pass 1\n# fail 0\n"), []);
  });
});

describe("relateValues", () => {
  it("states exact powers of ten", () => {
    assert.equal(relateValues("$108.00", "$1.08")?.text, "The received value is exactly 1/100 of the expected value.");
    assert.equal(relateValues("5", "500")?.text, "The received value is exactly 100× the expected value.");
  });
  it("falls back to a difference", () => {
    assert.equal(relateValues("90", "100")?.text, "The received value is higher by 10.");
  });
  it("detects type differences from quoting", () => {
    assert.match(relateValues("10800", "108.00", "10800", "'108.00'")!.text, /expected a number, received a string/);
  });
  it("says nothing about non-numeric values", () => {
    assert.equal(relateValues("apple", "pear"), null);
  });
});

describe("parseTypeFailures", () => {
  it("reads expected and received types and ignores surrounding build output", () => {
    const out = "✓ Compiled\n  Running TypeScript ...\napp/page.tsx(21,44): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\napp/page.tsx(21,44): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n";
    const items = parseTypeFailures(out);
    assert.equal(items.length, 1, "deduplicated");
    assert.deepEqual([items[0].file, items[0].line, items[0].receivedType, items[0].expectedType], ["app/page.tsx", 21, "string", "number"]);
  });
});

describe("buildProofs and failureTitle", () => {
  const check = (id: string, key: CheckRecord["key"], status: CheckRecord["status"]): CheckRecord => ({
    id, runId: "r", key, name: key, kind: "check", required: true, position: 0, status, failureClass: status === "failed" ? "code" : null,
    command: null, exitCode: status === "failed" ? 1 : 0, startedAt: null, finishedAt: null, durationMs: null, summary: null,
  });
  it("only builds proofs for code failures, in order", () => {
    const proofs = buildProofs(
      [check("a", "lint", "passed"), check("b", "test", "failed"), check("c", "build", "error")],
      [{ checkId: "b", content: TAP, truncated: false, bytesTotal: 1, sha256: null, updatedAt: "" }],
    );
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].kind, "assertion");
    assert.deepEqual(failureTitle(proofs[0]), { title: "Test “formats the total for display” failed", detail: "1 of 3 tests failing" });
  });
});

describe("readExcerpt", () => {
  it("reads lines around a location and refuses paths outside the workspace", async () => {
    process.env.PROOFLAYER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-ex-"));
    const { readExcerpt } = await import("../worker/executor.ts");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-ws-"));
    fs.writeFileSync(path.join(dir, "a.ts"), ["1", "2", "3", "4", "const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';", "6", "7", "8"].join("\n"));
    const ex = readExcerpt(dir, "a.ts", 5)!;
    assert.equal(ex.startLine, 2);
    assert.equal(ex.lines.length, 7);
    assert.ok(!ex.lines.join("").includes("ghp_abcdef"), "secrets are redacted");
    assert.equal(readExcerpt(dir, "../etc/passwd", 1), null);
    assert.equal(readExcerpt(dir, "/etc/passwd", 1), null);
    assert.equal(readExcerpt(dir, "a.ts", 99), null);
  });
});
