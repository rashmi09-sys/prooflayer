import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeOutcome, labelFor } from "../lib/shared/outcome.ts";
import type { Proof } from "../lib/shared/proof.ts";
import type { CheckRecord, RunArtifact } from "../lib/shared/types.ts";

const checks = ["install", "lint", "typecheck", "test", "build"].map((key) => ({ key, name: key, required: true, status: "passed" })) as unknown as CheckRecord[];
const assertion: Proof = {
  kind: "assertion", checkId: "c", checkKey: "test", checkName: "Tests", provenance: "test-runner", total: { pass: 2, fail: 1 },
  items: [{ name: "formats the total for display", file: "tests/invoice.test.ts", line: 15, expected: "$108.00", actual: "$1.08", operator: "strictEqual", message: null, relation: null }],
};
const shot = (text: string | null, found = true) =>
  ({ annotations: { content: null, matches: [{ value: "$1.08", role: "received", test: "t", found, boxes: [], text }] } }) as unknown as RunArtifact;

describe("labelFor", () => {
  it("reads the label in front of a value", () => {
    assert.equal(labelFor("Total due: $1.08", "$1.08"), "total due");
    assert.equal(labelFor("Balance — $5", "$5"), "balance");
  });
  it("refuses labels that are not plain words", () => {
    assert.equal(labelFor("$1.08", "$1.08"), null);
    assert.equal(labelFor("2 × Hosting — $1.08", "$1.08"), null);
    assert.equal(labelFor("Thanks. Your total is $1.08", "$1.08"), null);
    assert.equal(labelFor("nothing here", "$1.08"), null);
  });
});

describe("describeOutcome", () => {
  it("names the wrong thing from the rendered page", () => {
    assert.deepEqual(describeOutcome("failed", [assertion], [shot("Total due: $1.08")], checks), { headline: "The total due is wrong.", basis: "page-text" });
  });
  it("falls back to the test when the value is not on the page", () => {
    assert.equal(describeOutcome("failed", [assertion], [shot(null, false)], checks)!.basis, "test-runner");
    assert.equal(describeOutcome("failed", [assertion], [], checks)!.headline, "“formats the total for display” gives the wrong result.");
  });
  it("describes type errors and verdicts without evidence", () => {
    const type: Proof = { kind: "type", checkId: "c", checkKey: "typecheck", checkName: "Type check", provenance: "compiler", items: [{ file: "a.ts", line: 1, column: 1, code: "TS2345", message: "m", expectedType: "number", receivedType: "string" }] };
    assert.equal(describeOutcome("failed", [type], [], checks)!.headline, "The code passes a string where a number is required.");
    assert.equal(describeOutcome("passed", [], [], checks)!.headline, "All 5 checks passed on this commit.");
    assert.equal(describeOutcome("incomplete", [], [], checks)!.basis, "exit-codes");
    assert.equal(describeOutcome(null, [], [], checks), null);
  });
});
