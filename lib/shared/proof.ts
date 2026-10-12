// Structured, deterministic "proof" extracted from recorded check output.
//
// Everything here is parsed from text the tools printed, or computed from
// those parsed values with simple arithmetic. Nothing is inferred. Each item
// records where it came from so the interface can label it.

import type { CheckRecord, EvidenceRecord, StageKey } from "./types.ts";
import { extractFacts } from "./facts.ts";

export type Provenance = "test-runner" | "compiler" | "linter" | "computed" | "worker";

export interface SourceExcerpt {
  checkId: string;
  file: string;
  startLine: number;
  highlightLine: number;
  lines: string[];
}

export interface Relation {
  text: string;
  provenance: "computed";
}

export interface AssertionFailure {
  name: string;
  file: string | null;
  line: number | null;
  expected: string | null;
  actual: string | null;
  operator: string | null;
  message: string | null;
  relation: Relation | null;
}

export interface TypeFailure {
  file: string;
  line: number;
  column: number | null;
  code: string;
  message: string;
  expectedType: string | null;
  receivedType: string | null;
}

export interface LintFailure {
  file: string;
  line: number;
  message: string;
}

export type Proof =
  | { kind: "assertion"; checkId: string; checkKey: StageKey; checkName: string; provenance: "test-runner"; total: TestCounts; items: AssertionFailure[] }
  | { kind: "type"; checkId: string; checkKey: StageKey; checkName: string; provenance: "compiler"; items: TypeFailure[] }
  | { kind: "lint"; checkId: string; checkKey: StageKey; checkName: string; provenance: "linter"; items: LintFailure[] }
  | { kind: "output"; checkId: string; checkKey: StageKey; checkName: string; provenance: "worker"; tail: string[] };

export interface TestCounts {
  pass: number | null;
  fail: number | null;
}

// ------------------------------------------------------------ test output

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/** Parse failing tests from node:test TAP output, falling back to Jest/Vitest style. */
export function parseTestFailures(output: string): AssertionFailure[] {
  const lines = output.split("\n");
  const failures: AssertionFailure[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)not ok \d+ - (.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const block: Record<string, string> = {};
    let errorLines: string[] = [];
    let inError = false;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^\s*\.\.\.\s*$/.test(l) || new RegExp(`^\\s{0,${indent}}(not )?ok \\d+`).test(l)) break;
      const kv = /^\s*(location|failureType|expected|actual|operator|code|name): (.*)$/.exec(l);
      if (kv) {
        inError = false;
        block[kv[1]] = kv[2];
        continue;
      }
      if (/^\s*error: \|-?\s*$/.test(l)) {
        inError = true;
        continue;
      }
      const inline = /^\s*error: (.+)$/.exec(l);
      if (inline) {
        errorLines = [unquote(inline[1])];
        inError = false;
        continue;
      }
      if (inError) {
        if (/^\s*\w+: /.test(l) && !/^\s{8,}/.test(l)) inError = false;
        else if (l.trim()) errorLines.push(l.trim());
      }
    }
    if (block.failureType && /subtestsFailed/.test(block.failureType)) continue;
    const loc = block.location ? /'?\/?(?:work\/)?([^':]+):(\d+):(\d+)'?/.exec(block.location) : null;
    const expected = block.expected !== undefined ? unquote(block.expected) : null;
    const actual = block.actual !== undefined ? unquote(block.actual) : null;
    failures.push({
      name: m[2].trim(),
      file: loc ? loc[1] : null,
      line: loc ? Number(loc[2]) : null,
      expected,
      actual,
      operator: block.operator ? unquote(block.operator) : null,
      message: errorLines[0] ?? null,
      relation: expected !== null && actual !== null ? relateValues(expected, actual, block.expected, block.actual) : null,
    });
  }
  if (failures.length > 0) return failures;

  // Jest / Vitest style.
  const jest = /Expected:?\s+(.+)\n\s*Received:?\s+(.+)/.exec(output);
  if (jest) {
    const name = /^\s*(?:●|FAIL|×|✗)\s+(.+)$/m.exec(output)?.[1]?.trim() ?? "Failing assertion";
    const expected = unquote(jest[1]);
    const actual = unquote(jest[2]);
    return [{ name, file: null, line: null, expected, actual, operator: null, message: null, relation: relateValues(expected, actual, jest[1], jest[2]) }];
  }
  return [];
}

export function parseTestCounts(output: string): TestCounts {
  const pass = /^# pass (\d+)/m.exec(output) ?? /Tests\s+.*?(\d+) passed/m.exec(output);
  const fail = /^# fail (\d+)/m.exec(output) ?? /Tests\s+(\d+) failed/m.exec(output);
  return { pass: pass ? Number(pass[1]) : null, fail: fail ? Number(fail[1]) : null };
}

function toNumber(v: string): number | null {
  const cleaned = v.replace(/[$€£₹,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function isQuoted(raw: string | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim();
  return t.startsWith("'") || t.startsWith('"');
}

/**
 * A plain-arithmetic relationship between expected and actual values.
 * Only produced when both values are numeric (optionally with a currency
 * symbol), or when they differ in type.
 */
export function relateValues(expected: string, actual: string, rawExpected?: string, rawActual?: string): Relation | null {
  if (rawExpected !== undefined && rawActual !== undefined && isQuoted(rawExpected) !== isQuoted(rawActual)) {
    return { text: `The values have different types: expected a ${isQuoted(rawExpected) ? "string" : "number"}, received a ${isQuoted(rawActual) ? "string" : "number"}.`, provenance: "computed" };
  }
  const e = toNumber(expected);
  const a = toNumber(actual);
  if (e === null || a === null) return null;
  if (e === a) return null;
  if (e !== 0 && a !== 0) {
    const ratio = e / a;
    const pow = Math.log10(Math.abs(ratio));
    if (Math.abs(pow - Math.round(pow)) < 1e-9 && Math.round(pow) !== 0) {
      const factor = 10 ** Math.abs(Math.round(pow));
      return {
        text: ratio > 0 && pow > 0
          ? `The received value is exactly 1/${factor.toLocaleString("en-US")} of the expected value.`
          : `The received value is exactly ${factor.toLocaleString("en-US")}× the expected value.`,
        provenance: "computed",
      };
    }
  }
  const diff = a - e;
  return { text: `The received value is ${diff > 0 ? "higher" : "lower"} by ${Math.abs(diff).toLocaleString("en-US", { maximumFractionDigits: 6 })}.`, provenance: "computed" };
}

// ------------------------------------------------------- compiler output

const TS_LINE = /^(?<file>[^\s(][^(\n]*?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+): (?<msg>.+)$/gm;

export function parseTypeFailures(output: string): TypeFailure[] {
  const seen = new Set<string>();
  const out: TypeFailure[] = [];
  for (const m of output.matchAll(TS_LINE)) {
    const g = m.groups!;
    const file = g.file.replace(/^\/work\//, "");
    const id = `${file}:${g.line}:${g.col}:${g.code}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const arg = /Argument of type '(.+)' is not assignable to parameter of type '(.+)'\.?$/.exec(g.msg);
    const asg = /^Type '(.+)' is not assignable to type '(.+)'\.?$/.exec(g.msg);
    const pair = arg ?? asg;
    out.push({
      file,
      line: Number(g.line),
      column: Number(g.col),
      code: g.code,
      message: g.msg,
      receivedType: pair ? pair[1] : null,
      expectedType: pair ? pair[2] : null,
    });
  }
  return out;
}

// ----------------------------------------------------------------- build

/** Build one proof per failing required check, in pipeline order. */
export function buildProofs(checks: CheckRecord[], evidence: EvidenceRecord[]): Proof[] {
  const proofs: Proof[] = [];
  for (const c of checks) {
    if (!c.required || c.status !== "failed" || c.failureClass !== "code") continue;
    const log = evidence.find((e) => e.checkId === c.id)?.content ?? "";
    const base = { checkId: c.id, checkKey: c.key, checkName: c.name };

    if (c.key === "test") {
      const items = parseTestFailures(log);
      if (items.length) {
        proofs.push({ ...base, kind: "assertion", provenance: "test-runner", total: parseTestCounts(log), items: items.slice(0, 6) });
        continue;
      }
    }
    if (c.key === "typecheck" || c.key === "build") {
      const items = parseTypeFailures(log);
      if (items.length) {
        proofs.push({ ...base, kind: "type", provenance: "compiler", items: items.slice(0, 8) });
        continue;
      }
    }
    if (c.key === "lint") {
      const items = extractFacts("lint", log, c.exitCode).locations.map((l) => ({ file: l.file, line: l.line, message: l.message }));
      if (items.length) {
        proofs.push({ ...base, kind: "lint", provenance: "linter", items: items.slice(0, 8) });
        continue;
      }
    }
    const tail = log.trimEnd().split("\n").filter((l) => l.trim()).slice(-12);
    proofs.push({ ...base, kind: "output", provenance: "worker", tail });
  }
  return proofs;
}

/**
 * A short, human-readable failure title built only from parsed facts.
 * Returns null when there is nothing more specific than the verdict reason.
 */
export function failureTitle(proof: Proof | undefined): { title: string; detail: string } | null {
  if (!proof) return null;
  switch (proof.kind) {
    case "assertion": {
      const first = proof.items[0];
      const more = proof.items.length > 1 ? ` and ${proof.items.length - 1} more` : "";
      const counts = proof.total.fail !== null && proof.total.pass !== null
        ? `${proof.total.fail} of ${proof.total.fail + proof.total.pass} tests failing`
        : `${proof.items.length} failing`;
      return { title: `Test “${first.name}” failed${more}`, detail: counts };
    }
    case "type": {
      const n = proof.items.length;
      const first = proof.items[0];
      return {
        title: first.expectedType && first.receivedType
          ? `A ${first.receivedType} is passed where a ${first.expectedType} is required`
          : `${n} type ${n === 1 ? "error" : "errors"} in ${first.file}`,
        detail: `${n} TypeScript ${n === 1 ? "error" : "errors"}, first at ${first.file}:${first.line}`,
      };
    }
    case "lint": {
      const n = proof.items.length;
      return { title: `${n} lint ${n === 1 ? "error" : "errors"} in ${proof.items[0].file}`, detail: proof.items[0].message };
    }
    default:
      return null;
  }
}

/** Locations worth capturing source excerpts for, per failing check. */
export function excerptTargets(proofs: Proof[]): Array<{ checkId: string; file: string; line: number }> {
  const out: Array<{ checkId: string; file: string; line: number }> = [];
  for (const p of proofs) {
    if (p.kind === "assertion") for (const i of p.items) if (i.file && i.line) out.push({ checkId: p.checkId, file: i.file, line: i.line });
    if (p.kind === "type" || p.kind === "lint") for (const i of p.items) out.push({ checkId: p.checkId, file: i.file, line: i.line });
  }
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = `${t.checkId}:${t.file}:${t.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}
