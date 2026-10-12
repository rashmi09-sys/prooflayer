import type { StageKey } from "./types.ts";

// Deterministic fact extraction from captured output. These are parsed,
// not inferred: each summary quotes counts or lines that appear verbatim in
// the evidence.

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  message: string;
}

export interface ExtractedFacts {
  summary: string;
  locations: SourceLocation[];
}

const TS_ERR = /^(?<file>[^\s(][^(\n]*?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+): (?<msg>.+)$/gm;
const ESLINT_FILE = /^(\/work\/|\.\/)?(?<file>[^\s].*\.(?:[cm]?[jt]sx?))$/;
const ESLINT_PROBLEM = /^\s+(?<line>\d+):(?<col>\d+)\s+(?<sev>error|warning)\s+(?<msg>.+?)\s{2,}(?<rule>\S+)$/;

export function extractFacts(key: StageKey, output: string, exitCode: number | null): ExtractedFacts {
  const locations: SourceLocation[] = [];

  if (key === "typecheck" || key === "build") {
    for (const m of output.matchAll(TS_ERR)) {
      const g = m.groups!;
      locations.push({
        file: g.file.replace(/^\/work\//, ""),
        line: Number(g.line),
        column: Number(g.col),
        message: `${g.code}: ${g.msg}`,
      });
    }
  }

  if (key === "test") {
    // node:test reports "location: '/work/tests/x.test.ts:15:3'" for each failure.
    const seen = new Set<string>();
    for (const m of output.matchAll(/^\s*location: '\/work\/(?<file>[^':]+):(?<line>\d+):(?<col>\d+)'/gm)) {
      const g = m.groups!;
      const id = `${g.file}:${g.line}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const names = [...output.slice(0, m.index).matchAll(/not ok \d+ - (.+)/g)];
      const name = names.length ? names[names.length - 1][1].trim() : null;
      locations.push({ file: g.file, line: Number(g.line), column: Number(g.col), message: name ? `Failing test: ${name}` : "Failing test" });
    }
  }

  if (key === "lint") {
    let current: string | null = null;
    for (const line of output.split("\n")) {
      const f = ESLINT_FILE.exec(line);
      if (f) {
        current = f.groups!.file;
        continue;
      }
      const p = ESLINT_PROBLEM.exec(line);
      if (p && current && p.groups!.sev === "error") {
        locations.push({ file: current, line: Number(p.groups!.line), message: `${p.groups!.msg} (${p.groups!.rule})` });
      }
    }
  }

  if (exitCode === 0) {
    if (key === "test") {
      const pass = /^# pass (\d+)/m.exec(output) ?? /Tests\s+(\d+) passed/m.exec(output);
      return { summary: pass ? `${pass[1]} tests passed.` : "Test command exited with code 0.", locations };
    }
    return { summary: "Exited with code 0.", locations };
  }

  switch (key) {
    case "typecheck": {
      const n = locations.length;
      return {
        summary: n > 0
          ? `${n} TypeScript ${n === 1 ? "error" : "errors"}. First: ${locations[0].file}:${locations[0].line} ${locations[0].message}`
          : `TypeScript exited with code ${exitCode}.`,
        locations,
      };
    }
    case "test": {
      const fail = /^# fail (\d+)/m.exec(output) ?? /Tests\s+(\d+) failed/m.exec(output);
      const pass = /^# pass (\d+)/m.exec(output) ?? /(\d+) passed/m.exec(output);
      const firstFailing = /^\s*not ok \d+ - (.+)$/m.exec(output);
      const expected = /^\s*expected: (.+)$/m.exec(output);
      const actual = /^\s*actual: (.+)$/m.exec(output);
      let summary = fail ? `${fail[1]} failing, ${pass ? pass[1] : "0"} passing.` : `Test command exited with code ${exitCode}.`;
      if (firstFailing) summary += ` First failure: "${firstFailing[1].trim()}"`;
      if (expected && actual) summary += ` (expected ${expected[1].trim()}, received ${actual[1].trim()})`;
      return { summary, locations };
    }
    case "lint": {
      const total = /✖ (\d+) problems? \((\d+) errors?/.exec(output);
      return {
        summary: total ? `${total[2]} lint ${Number(total[2]) === 1 ? "error" : "errors"}.` : `Linter exited with code ${exitCode}.`,
        locations,
      };
    }
    case "build": {
      const typeFail = /Failed to type check/.test(output);
      const n = locations.length;
      if (typeFail) {
        return {
          summary: `Build stopped at type checking${n ? ` (${n} ${n === 1 ? "error" : "errors"})` : ""}.`,
          locations,
        };
      }
      const err = /^(Error: .+|.*Module not found.*|.*Build error occurred.*)$/m.exec(output);
      return { summary: err ? err[1].trim().slice(0, 240) : `Build exited with code ${exitCode}.`, locations };
    }
    case "install": {
      const code = /npm (?:ERR!|error) code (\S+)/.exec(output);
      return { summary: code ? `npm failed with ${code[1]}.` : `Install exited with code ${exitCode}.`, locations };
    }
    default:
      return { summary: `Exited with code ${exitCode}.`, locations };
  }
}

/** Heuristic for install output that points at the network, not the code. */
export function looksLikeNetworkFailure(output: string): boolean {
  return /\b(ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|ECONNREFUSED|EPROTO|ERR_SOCKET_TIMEOUT|CERT_|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT)\b|code E(5\d\d|403|407)\b|network request .* failed/i.test(
    output,
  );
}
