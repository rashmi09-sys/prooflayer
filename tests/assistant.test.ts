import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answer, PROMPTS } from "../lib/ui/assistant.ts";
import type { RunDetail } from "../lib/server/run-detail.ts";
import type { CommitDiff } from "../lib/server/providers.ts";

const check = (key: string, status: string, extra: Record<string, unknown> = {}) => ({ key, name: key[0].toUpperCase() + key.slice(1), required: key !== "snapshot", status, exitCode: status === "passed" ? 0 : 1, summary: null, command: `run ${key}`, ...extra });

function detail(over: Partial<RunDetail> = {}): RunDetail {
  return {
    run: { id: "run_b", status: "completed", verdict: "failed", commitSha: "b".repeat(40), projectSlug: "ledgerly" },
    checks: [check("install", "passed"), check("lint", "passed"), check("test", "failed", { summary: "1 failing, 2 passing." }), check("build", "passed"), check("snapshot", "passed")],
    proofs: [
      {
        kind: "assertion", checkId: "c3", checkKey: "test", checkName: "Tests", provenance: "test-runner", total: { pass: 2, fail: 1 },
        items: [{ name: "formats the total", file: "tests/invoice.test.ts", line: 15, expected: "$108.00", actual: "$1.08", operator: null, message: null, relation: null }],
      },
    ],
    artifacts: [{ kind: "screenshot", pageUrl: "/", sha256: "f".repeat(64), annotations: { content: null, matches: [{ value: "$1.08", role: "received", test: "t", found: true, boxes: [], text: "Total due: $1.08" }] } }],
    excerpts: [],
    locations: {},
    evidence: [],
    lastPassed: { id: "run_a", commitSha: "a".repeat(40), commitMessage: "ok", finishedAt: null, branch: "main" },
    sinceLastPassed: [{ name: "Tests", kind: "newly_failing" }],
    ...over,
  } as unknown as RunDetail;
}

const diff: CommitDiff = {
  base: "a".repeat(40),
  head: "b".repeat(40),
  truncated: false,
  files: [
    { path: "src/lib/invoice.ts", additions: 9, deletions: 5, patch: null },
    { path: "tests/invoice.test.ts", additions: 1, deletions: 1, patch: null },
  ],
};

describe("investigation assistant", () => {
  it("offers exactly the five prompts", () => {
    assert.deepEqual(PROMPTS.map((p) => p.label), ["What failed?", "Show me the evidence", "Which check caught this?", "What changed since the last passing run?", "What should I inspect next?"]);
  });

  it("answers from recorded evidence, including what the page showed", () => {
    const a = answer("what-failed", detail());
    assert.equal(a.basis, "recorded");
    assert.ok(a.lines.some((l) => l.code === "$1.08"));
    assert.ok(a.lines.some((l) => l.code === "Total due: $1.08"));
  });

  it("names the check, its command and exit code", () => {
    const a = answer("which-check", detail());
    assert.equal(a.lines[0].text, "Test caught it first.");
    assert.ok(a.lines.some((l) => l.code === "run test"));
    assert.equal(a.action?.kind, "open-log");
  });

  it("uses the git diff only when it was read, and says so", () => {
    assert.equal(answer("what-changed", detail()).basis, "recorded");
    const a = answer("what-changed", detail(), diff);
    assert.equal(a.basis, "git");
    assert.ok(a.lines.some((l) => l.code === "src/lib/invoice.ts"));
  });

  it("labels next-step advice as rules and points at changed source, not tests", () => {
    const a = answer("inspect-next", detail(), diff);
    assert.equal(a.basis, "rule");
    const changed = a.lines.find((l) => l.text.startsWith("Source files changed"));
    assert.equal(changed?.code, "src/lib/invoice.ts");
  });

  it("does not judge a run that is still live", () => {
    const live = detail({ run: { ...detail().run, status: "running", verdict: null } as RunDetail["run"] });
    assert.match(answer("what-failed", live).lines[0].text, /Nothing has been judged yet/);
    assert.match(answer("inspect-next", live).lines[0].text, /Wait for the verdict/);
  });

  it("never invents a comparison without a passing run", () => {
    const a = answer("what-changed", detail({ lastPassed: null }));
    assert.match(a.lines[0].text, /nothing to compare against/);
  });
});
