import type { CheckRecord, EvidenceRecord, RunArtifact } from "./types.ts";
import type { Proof } from "./proof.ts";

// NeverBreak's protected flows.
//
// A flow is something that already worked and must keep working. Each one
// is tied to a real check: a named test that passed in the run it was
// learned from, or the built page opening in Chromium. Results for any run
// are read from that run's recorded output; nothing is inferred.

export type FlowKind = "test" | "page" | "journey";

export interface ProtectedFlow {
  id: string;
  key: string;
  name: string;
  why: string;
  kind: FlowKind;
  /** For test flows: the exact test name the runner printed. */
  testName: string | null;
  /** A scripted browser journey that also verifies this flow (or the flow itself, for journey flows). */
  journeyId: string | null;
  learnedFromRunId: string | null;
  learnedCommitSha: string;
  position: number;
}

export type FlowState = "passed" | "failed" | "pending" | "not-checked" | "missing";

export interface FlowResult {
  flow: ProtectedFlow;
  state: FlowState;
  /** One plain sentence about this result. */
  detail: string;
  expected: string | null;
  actual: string | null;
  /** The change edited the test that protects this flow. */
  testEdited: boolean;
  /** What the browser journey for this flow saw, when one ran. */
  journey: JourneyOutcome | null;
}

export interface JourneyOutcome {
  id: string;
  name: string;
  ok: boolean;
  expected: string;
  actual: string | null;
  /** The journey's final screenshot. */
  frameId: string | null;
}

/** Results of the scripted browser journeys in a run, from its saved frames. */
export function journeyOutcomes(artifacts: RunArtifact[]): JourneyOutcome[] {
  return artifacts
    .filter((a) => a.annotations?.journey)
    .map((a) => ({ ...a.annotations!.journey!, frameId: a.id }));
}

export interface NewCheck {
  key: string;
  name: string;
  kind: "test" | "journey";
  ok: boolean;
}

/**
 * Checks in this run that no protected flow covers: usually the tests and
 * journeys for the feature the change introduced.
 */
export function newChecks(flows: ProtectedFlow[], evidence: EvidenceRecord[], checks: CheckRecord[], artifacts: RunArtifact[]): NewCheck[] {
  const test = checks.find((c) => c.key === "test");
  const out = test ? parseTestResults(evidence.find((e) => e.checkId === test.id)?.content ?? "") : [];
  const covered = new Set(flows.map((f) => f.testName).filter(Boolean));
  const coveredJ = new Set(flows.map((f) => f.journeyId).filter(Boolean));
  return [
    ...out.filter((t) => !t.group && !covered.has(t.name)).map((t) => ({ key: `test:${t.name}`, name: t.name, kind: "test" as const, ok: t.ok })),
    ...journeyOutcomes(artifacts)
      .filter((j) => !coveredJ.has(j.id))
      .map((j) => ({ key: `journey:${j.id}`, name: j.name, kind: "journey" as const, ok: j.ok })),
  ];
}

export interface TestResult {
  name: string;
  ok: boolean;
  /** True when the entry only groups other tests (a describe block). */
  group: boolean;
}

/**
 * Every test result in node:test TAP output, in order. Groups are marked so
 * that only real tests become flows. Also understands the ✓/✕ lines printed
 * by Jest and Vitest.
 */
export function parseTestResults(output: string): TestResult[] {
  const out: TestResult[] = [];
  const lines = output.split("\n");
  let prevIndent = -1;
  for (const line of lines) {
    const m = /^(\s*)(not ok|ok) \d+ - (.+?)(?:\s+#\s*(SKIP|TODO).*)?\s*$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    // node:test prints children before their parent, one level deeper.
    const group = prevIndent > indent;
    prevIndent = indent;
    if (m[4]) continue;
    out.push({ name: m[3], ok: m[2] === "ok", group });
  }
  if (out.length) return out;
  for (const line of lines) {
    const j = /^\s*(✓|√|✕|×)\s+(.+?)(?:\s+\(\d+(?:\.\d+)?\s*m?s\))?\s*$/.exec(line);
    if (j) out.push({ name: j[2], ok: j[1] === "✓" || j[1] === "√", group: false });
  }
  return out;
}

/** The leaf tests that passed: the candidates for protection. */
export function passingTests(output: string): string[] {
  const seen = new Set<string>();
  return parseTestResults(output)
    .filter((t) => t.ok && !t.group)
    .map((t) => t.name)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
}

/** Result of every protected flow for one run, from its recorded evidence. */
export function flowResults(
  flows: ProtectedFlow[],
  checks: CheckRecord[],
  evidence: EvidenceRecord[],
  proofs: Proof[],
  artifacts: RunArtifact[],
  editedTests: string[] = [],
): FlowResult[] {
  const test = checks.find((c) => c.key === "test");
  const build = checks.find((c) => c.key === "build");
  const snap = checks.find((c) => c.key === "snapshot");
  const testOut = test ? (evidence.find((e) => e.checkId === test.id)?.content ?? "") : "";
  const results = parseTestResults(testOut);
  const assertions = proofs.flatMap((p) => (p.kind === "assertion" ? p.items : []));
  const pageHit = artifacts.flatMap((a) => a.annotations?.matches ?? []).find((m) => m.role === "received" && m.found) ?? null;
  const journeys = journeyOutcomes(artifacts);

  return flows.map((flow): FlowResult => {
    const journey = flow.journeyId ? (journeys.find((j) => j.id === flow.journeyId) ?? null) : null;
    const base = { flow, expected: null, actual: null, journey, testEdited: flow.kind === "test" && !!flow.testName && editedTests.includes(flow.testName) };
    if (flow.kind === "journey") {
      if (journey) {
        return journey.ok
          ? { ...base, state: "passed", detail: `Reached “${journey.expected}” in Chromium.` }
          : { ...base, state: "failed", expected: journey.expected, actual: journey.actual, detail: `Expected “${journey.expected}”, the page showed “${journey.actual ?? "nothing"}”.` };
      }
      if (!snap || snap.status === "pending" || snap.status === "running") return { ...base, state: "pending", detail: "Runs in Chromium after the app builds." };
      if (build && build.status !== "passed") return { ...base, state: "failed", detail: "The app didn't build, so the journey couldn't run." };
      return { ...base, state: "not-checked", detail: snap.summary ?? "The journey didn't run." };
    }
    if (flow.kind === "page") {
      if (!snap || snap.status === "pending" || snap.status === "running") {
        if (build && (build.status === "failed" || build.status === "error")) return { ...base, state: "failed", detail: "The app didn't build, so the page couldn't open." };
        return { ...base, state: "pending", detail: "Opens after the app builds." };
      }
      if (snap.status === "passed") return { ...base, state: "passed", detail: "Built, opened in Chromium and captured." };
      if (build && build.status !== "passed") return { ...base, state: "failed", detail: "The app didn't build, so the page couldn't open." };
      if (snap.status === "failed") return { ...base, state: "failed", detail: snap.summary ?? "The page didn't open." };
      return { ...base, state: "not-checked", detail: snap.summary ?? "The browser step didn't run." };
    }

    if (!test || test.status === "pending" || test.status === "running") return { ...base, state: "pending", detail: "Waiting for the tests to run." };
    if (test.status === "skipped" || test.status === "cancelled" || test.status === "error") {
      return { ...base, state: "not-checked", detail: test.summary ?? "The tests didn't run." };
    }
    const r = results.find((x) => x.name === flow.testName && !x.group);
    if (!r) {
      if (results.length === 0 && test.status === "failed") return { ...base, state: "failed", detail: "The tests couldn't run at all." };
      return { ...base, state: "missing", detail: "Its test no longer exists in this version." };
    }
    if (r.ok) {
      if (journey && !journey.ok) {
        return { ...base, state: "failed", expected: journey.expected, actual: journey.actual, detail: `The test passed, but in Chromium the page showed “${journey.actual ?? "nothing"}” instead of “${journey.expected}”.` };
      }
      return { ...base, state: "passed", detail: base.testEdited ? "Passed, but the change rewrote the test that protects it." : journey ? "Still works, in the tests and in Chromium." : "Still works." };
    }
    const a = assertions.find((x) => x.name === flow.testName) ?? null;
    const shown =
      a && pageHit && a.actual && pageHit.text?.includes(a.actual)
        ? ` The page shows “${pageHit.text}”.`
        : journey && !journey.ok
          ? ` In Chromium the page showed “${journey.actual ?? "nothing"}”.`
          : "";
    return {
      ...base,
      state: "failed",
      expected: a?.expected ?? null,
      actual: a?.actual ?? null,
      detail: a?.expected && a.actual ? `Expected ${a.expected}, got ${a.actual}.${shown}` : "Its test failed.",
    };
  });
}

/**
 * The body of a test in a source file: from its it()/test() line to the
 * next test or the end of the file. Used to notice when a change rewrites
 * the test that protects a flow.
 */
export function testBody(source: string, name: string): string | null {
  const lines = source.split("\n");
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((l) => new RegExp(`\\b(it|test)\\s*\\(\\s*(["'\`])${esc}\\2`).test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/\b(it|test|describe)\s*\(\s*["'`]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

export function isTestPath(p: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

/** Summary counts for headlines. */
export function flowCounts(results: FlowResult[]) {
  return {
    total: results.length,
    passed: results.filter((r) => r.state === "passed").length,
    failed: results.filter((r) => r.state === "failed" || r.state === "missing").length,
    pending: results.filter((r) => r.state === "pending").length,
    unchecked: results.filter((r) => r.state === "not-checked").length,
    edited: results.filter((r) => r.testEdited).length,
  };
}

/** The screenshot that best represents a run: the journey frame the checks were matched on, else the first one. */
export function primaryShot<T extends RunArtifact>(artifacts: T[]): T | null {
  const shots = artifacts.filter((a) => a.kind === "screenshot");
  return shots.find((a) => a.annotations?.frame?.primary) ?? shots.find((a) => a.annotations?.journey) ?? shots[0] ?? null;
}

/** Device pixels per CSS pixel of a screenshot. Journey frames are captured at the device's scale. */
export function pixelScale(a: RunArtifact): number {
  const f = a.annotations?.frame;
  if (!f) return 1;
  return f.scale ?? Math.max(1, Math.round((a.width ?? 390) / 390));
}
