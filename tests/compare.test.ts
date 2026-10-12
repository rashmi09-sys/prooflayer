import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareRuns } from "../lib/shared/compare.ts";
import type { CheckRecord, CheckStatus, FailureClass, StageKey } from "../lib/shared/types.ts";

let n = 0;
const chk = (key: StageKey, status: CheckStatus, failureClass: FailureClass | null = null): CheckRecord => ({
  id: `c${n++}`, runId: "r", key, name: key, kind: "check", required: true, position: 0, status, failureClass,
  command: null, exitCode: null, startedAt: null, finishedAt: null, durationMs: null, summary: null,
});

describe("compareRuns", () => {
  it("classifies every change", () => {
    const before = [chk("lint", "passed"), chk("typecheck", "failed", "code"), chk("test", "passed"), chk("build", "failed", "code"), chk("install", "passed")];
    const after = [chk("lint", "passed"), chk("typecheck", "passed"), chk("test", "failed", "code"), chk("build", "failed", "code")];
    const kinds = Object.fromEntries(compareRuns(before, after).map((r) => [r.key, r.kind]));
    assert.deepEqual(kinds, {
      lint: "unchanged_pass",
      typecheck: "now_passing",
      test: "newly_failing",
      build: "unchanged_fail",
      install: "removed",
    });
  });

  it("reports added checks and non-comparable outcomes", () => {
    const kinds = Object.fromEntries(
      compareRuns([chk("test", "error", "infrastructure")], [chk("test", "passed"), chk("build", "passed")]).map((r) => [r.key, r.kind]),
    );
    assert.deepEqual(kinds, { test: "changed_other", build: "added" });
  });

  it("ignores pipeline stages", () => {
    const p = { ...chk("prepare", "passed"), required: false };
    assert.equal(compareRuns([p], [p]).length, 0);
  });
});
