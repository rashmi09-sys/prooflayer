import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { investigationSteps, activeStep } from "../lib/ui/investigation.ts";
import { STAGES } from "../lib/shared/stages.ts";
import type { CheckRecord, CheckStatus } from "../lib/shared/types.ts";

const run = (statuses: Partial<Record<string, CheckStatus>>, summaries: Partial<Record<string, string>> = {}): CheckRecord[] =>
  STAGES.map((s, i) => ({
    id: s.key, runId: "r", key: s.key, name: s.name, kind: s.kind, required: s.required, position: i,
    status: statuses[s.key] ?? "pending", failureClass: statuses[s.key] === "failed" ? "code" : null, command: null,
    exitCode: statuses[s.key] === "passed" ? 0 : null, startedAt: null, finishedAt: null, durationMs: statuses[s.key] && statuses[s.key] !== "pending" ? 100 : null,
    summary: summaries[s.key] ?? null,
  }));

describe("investigationSteps", () => {
  it("uses future tense until the worker records a start, past tense only after it confirms", () => {
    const steps = investigationSteps(run({ prepare: "passed", install: "running" }));
    assert.equal(steps[0].label, "Repository prepared");
    assert.equal(steps[1].label, "Installing dependencies");
    assert.equal(steps[5].label, "Open in a browser", "never claims the browser opened before it starts");
    assert.equal(activeStep(steps)?.id, "install");
  });

  it("does not show a half-finished analysis as running between its two checks", () => {
    const steps = investigationSteps(run({ prepare: "passed", install: "passed", lint: "passed" }));
    assert.equal(steps[2].state, "pending");
    assert.equal(steps[2].detail, "Lint clean · Types waiting");
    assert.equal(activeStep(steps), null);
  });

  it("summarises tests and failures from recorded summaries", () => {
    const steps = investigationSteps(
      run({ prepare: "passed", install: "passed", lint: "passed", typecheck: "passed", test: "failed", build: "passed", snapshot: "passed", collect: "passed", summarize: "passed" }, { test: "1 failing, 2 passing. First failure: x" }),
    );
    assert.equal(steps[3].label, "Tests failed");
    assert.equal(steps[3].detail, "3 tests ran · 1 failed");
    assert.equal(steps[5].label, "Browser opened");
  });

  it("labels a skipped browser step honestly", () => {
    const steps = investigationSteps(run({ build: "failed", snapshot: "skipped" }, { snapshot: "No successful build to serve, so no page was captured." }));
    assert.equal(steps[5].label, "Browser not opened");
  });
});
