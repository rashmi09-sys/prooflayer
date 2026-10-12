import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { limitOutput, sanitize } from "../lib/shared/redact.ts";

describe("sanitize", () => {
  it("redacts common secret shapes", () => {
    const out = sanitize(
      [
        "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
        "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        "Authorization: Bearer abc.def.ghi",
        "DATABASE_PASSWORD=hunter2hunter2",
        "https://user:pa55word@example.com/repo.git",
        "AKIAABCDEFGHIJKLMNOP",
      ].join("\n"),
    );
    for (const leaked of ["sk-ant-api03", "ghp_abcdef", "abc.def.ghi", "hunter2", "pa55word", "AKIAABCDEFGHIJKLMNOP"]) {
      assert.ok(!out.includes(leaked), `leaked ${leaked}`);
    }
  });

  it("redacts exact known secret values", () => {
    assert.equal(sanitize("code is proof-demo-2026!", ["proof-demo-2026"]), "code is [REDACTED]!");
  });

  it("strips terminal escape codes and control characters", () => {
    assert.equal(sanitize("\u001b[31mred\u001b[0m\u0007 ok\r\n"), "red ok\n");
  });
});

describe("limitOutput", () => {
  it("keeps head and tail with a visible marker", () => {
    const text = "H".repeat(100) + "M".repeat(10_000) + "T".repeat(100);
    const { text: out, truncated } = limitOutput(text, 1000, 200);
    assert.ok(truncated);
    assert.ok(out.startsWith("H".repeat(100)));
    assert.ok(out.endsWith("T".repeat(100)));
    assert.match(out, /ProofLayer omitted/);
  });

  it("leaves short output untouched", () => {
    assert.deepEqual(limitOutput("short"), { text: "short", truncated: false });
  });
});
