import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideVerdict } from "../lib/shared/verdict.ts";
import type { CheckStatus, FailureClass } from "../lib/shared/types.ts";

const c = (name: string, status: CheckStatus, failureClass: FailureClass | null = null, exitCode: number | null = null, required = true) => ({
  name, status, failureClass, exitCode, required,
});

describe("decideVerdict", () => {
  it("passes only when every required check passed", () => {
    const d = decideVerdict([c("Lint", "passed", null, 0), c("Tests", "passed", null, 0), c("Prepare", "error", "infrastructure", null, false)], false);
    assert.equal(d.verdict, "passed");
  });

  it("fails when a required check failed because of the code", () => {
    const d = decideVerdict([c("Lint", "passed"), c("Tests", "failed", "code", 1)], false);
    assert.equal(d.verdict, "failed");
    assert.match(d.reason, /Tests failed with exit code 1/);
  });

  it("is incomplete, not failed, for infrastructure errors", () => {
    const d = decideVerdict([c("Install", "error", "infrastructure"), c("Tests", "skipped")], false);
    assert.equal(d.verdict, "incomplete");
    assert.match(d.reason, /not evidence that the code is broken/);
  });

  it("treats timeouts and resource limits as incomplete", () => {
    assert.equal(decideVerdict([c("Build", "error", "timeout")], false).verdict, "incomplete");
    assert.equal(decideVerdict([c("Build", "error", "resource_limit")], false).verdict, "incomplete");
  });

  it("is incomplete when a required check was skipped", () => {
    assert.equal(decideVerdict([c("Lint", "passed"), c("Tests", "skipped")], false).verdict, "incomplete");
  });

  it("reports a code failure even if other checks could not run", () => {
    const d = decideVerdict([c("Install", "failed", "code", 1), c("Tests", "skipped")], false);
    assert.equal(d.verdict, "failed");
    assert.match(d.reason, /1 other required check could not run/);
  });

  it("returns cancelled when the user cancelled", () => {
    assert.equal(decideVerdict([c("Lint", "passed"), c("Tests", "cancelled")], true).verdict, "cancelled");
  });

  it("never passes with no required checks", () => {
    assert.equal(decideVerdict([c("Prepare", "passed", null, null, false)], false).verdict, "incomplete");
  });
});
