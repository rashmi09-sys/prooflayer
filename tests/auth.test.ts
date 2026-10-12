import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PROOFLAYER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-auth-"));
process.env.PROOFLAYER_SESSION_SECRET = "s".repeat(40);
process.env.PROOFLAYER_ACCESS_CODE = "correct horse";

const auth = await import("../lib/server/session.ts");

describe("sessions", () => {
  it("round-trips a signed session", () => {
    const token = auth.createSessionToken("usr_1");
    assert.equal(auth.verifySessionToken(token), "usr_1");
  });

  it("rejects tampered, malformed and expired tokens", () => {
    const token = auth.createSessionToken("usr_1");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "usr_admin", exp: 9e9 })).toString("base64url");
    assert.equal(auth.verifySessionToken(`${forged}.${sig}`), null);
    assert.equal(auth.verifySessionToken(`${payload}.AAAA`), null);
    assert.equal(auth.verifySessionToken("garbage"), null);
    assert.equal(auth.verifySessionToken(undefined), null);
    const old = auth.createSessionToken("usr_1", Date.now() - 13 * 3600_000);
    assert.equal(auth.verifySessionToken(old), null);
  });

  it("checks the access code", () => {
    assert.equal(auth.checkAccessCode("correct horse"), true);
    assert.equal(auth.checkAccessCode("wrong"), false);
    assert.equal(auth.checkAccessCode(""), false);
  });
});
