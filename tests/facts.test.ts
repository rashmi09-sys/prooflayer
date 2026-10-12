import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, looksLikeNetworkFailure } from "../lib/shared/facts.ts";

describe("extractFacts", () => {
  it("parses TypeScript errors with locations", () => {
    const out = "app/page.tsx(21,44): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n";
    const f = extractFacts("typecheck", out, 2);
    assert.equal(f.locations[0].file, "app/page.tsx");
    assert.equal(f.locations[0].line, 21);
    assert.match(f.summary, /1 TypeScript error/);
  });

  it("summarizes node:test failures with expected and actual values", () => {
    const out = [
      "    not ok 2 - formats the total for display",
      "      location: '/work/tests/invoice.test.ts:15:3'",
      "      expected: '$108.00'",
      "      actual: '$1.08'",
      "# pass 2",
      "# fail 1",
    ].join("\n");
    const f = extractFacts("test", out, 1);
    assert.match(f.summary, /1 failing, 2 passing/);
    assert.match(f.summary, /expected '\$108\.00', received '\$1\.08'/);
    assert.deepEqual(f.locations[0], { file: "tests/invoice.test.ts", line: 15, column: 3, message: "Failing test: formats the total for display" });
  });

  it("does not invent facts for passing steps", () => {
    assert.equal(extractFacts("lint", "", 0).summary, "Exited with code 0.");
  });

  it("recognizes network errors during install", () => {
    assert.ok(looksLikeNetworkFailure("npm error code ENOTFOUND"));
    assert.ok(!looksLikeNetworkFailure("npm error code EUSAGE: package-lock.json is out of sync"));
  });
});
