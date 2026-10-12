import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { outcomeLine, type RunLite, type ShowcaseData } from "../lib/shared/showcase.ts";

// The closing line "Scheduled delivery works. Regular checkout still works."
// is shown only when the recorded evidence proves both, never by default.

const frame = (journey: string, ok: boolean) => ({ id: journey, url: "", label: "Result", journey, journeyName: journey, step: 5, last: true, ok, expected: "", actual: "", primary: false, highlight: null, viewport: { width: 390, height: 844 } });
const run = (over: Partial<RunLite>): RunLite =>
  ({ id: "run_x", sha: "a".repeat(40), message: null, status: "completed", verdict: "passed", createdAt: "", startedAt: "", finishedAt: "", checks: [], frames: [frame("regular-checkout", true), frame("scheduled-checkout", true)], flows: [{ id: "f", name: "Complete a regular checkout", kind: "test", state: "passed", detail: "", expected: null, actual: null }], newChecks: [{ key: "k", name: "schedules", kind: "test", ok: true }], preview: null, ...over }) as RunLite;
const data = (source: RunLite, repairRun: RunLite | null, outcome: "repaired" | "rolled-back" | null = "repaired"): ShowcaseData =>
  ({
    project: { slug: "dashdish", name: "DashDish" },
    request: null,
    change: { sha: "b".repeat(40), message: null, author: null, files: [] },
    baseline: run({}),
    source,
    repair: repairRun ? { id: "rep", status: "succeeded", outcome, summary: "", createdAt: "", finishedAt: "", attempts: [{ n: 1, strategy: "prepared-fix", files: [], branch: "b", commit: "c".repeat(40), sourceRef: null, run: repairRun }] } : null,
    repairAvailable: false,
    recorded: null,
    workerOnline: false,
  }) as unknown as ShowcaseData;

const broken = run({ verdict: "failed", frames: [frame("regular-checkout", false), frame("scheduled-checkout", true)], flows: [{ id: "f", name: "Complete a regular checkout", kind: "test", state: "failed", detail: "", expected: "Order confirmed", actual: "Choose a delivery time" }] });

describe("evidence-based outcome line", () => {
  it("says both work only when the repaired run proves both journeys in Chromium", () => {
    const o = outcomeLine(data(broken, run({})));
    assert.equal(o?.title, "Scheduled delivery works. Regular checkout still works.");
    assert.equal(o?.proven, true);
  });
  it("does not say it if scheduled checkout wasn't reached", () => {
    const o = outcomeLine(data(broken, run({ frames: [frame("regular-checkout", true), frame("scheduled-checkout", false)] })));
    assert.equal(o?.proven, false);
    assert.notEqual(o?.title, "Scheduled delivery works. Regular checkout still works.");
  });
  it("does not say it when the passing repair was a roll-back that dropped the feature", () => {
    const o = outcomeLine(data(broken, run({}), "rolled-back"));
    assert.equal(o?.proven, false);
    assert.match(o!.title, /Rolled back/);
  });
  it("does not say it without any repair", () => {
    assert.equal(outcomeLine(data(broken, null))?.proven, false);
  });
});
