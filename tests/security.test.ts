import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Private (operator) mode: sessions, CSRF, sign-in limits, and the worker's install policy.
process.env.PROOFLAYER_PUBLIC_DEMO = "false";
process.env.PROOFLAYER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-sec-"));
process.env.PROOFLAYER_SESSION_SECRET = "k".repeat(48);
process.env.PROOFLAYER_ACCESS_CODE = "a-long-enough-code";

const { resolvePublicDemo } = await import("../lib/server/config.ts");
const session = await import("../lib/server/session.ts");
const { lockfileProblems, pinnedNpmEnv, REGISTRY } = await import("../worker/install-policy.ts");

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("public demo mode resolves fail-closed", () => {
  it("is on with PROOFLAYER_PUBLIC_DEMO=true, on Vercel by default, and for unknown values", () => {
    assert.equal(resolvePublicDemo({ PROOFLAYER_PUBLIC_DEMO: "true" }), true);
    assert.equal(resolvePublicDemo({ VERCEL: "1" }), true);
    assert.equal(resolvePublicDemo({ PROOFLAYER_PUBLIC_DEMO: "yes" }), true);
    assert.equal(resolvePublicDemo({ PROOFLAYER_PUBLIC_DEMO: "0" }), true, "anything but the literal false keeps the demo read-only");
  });
  it("is off only when explicitly false, or locally when unset", () => {
    assert.equal(resolvePublicDemo({ PROOFLAYER_PUBLIC_DEMO: "false" }), false);
    assert.equal(resolvePublicDemo({ PROOFLAYER_PUBLIC_DEMO: "FALSE", VERCEL: "1" }), false);
    assert.equal(resolvePublicDemo({}), false);
  });
});

describe("operator sessions", () => {
  it("signs in only with a configured, long enough code", () => {
    assert.equal(session.authConfigured(), true);
    assert.equal(session.checkAccessCode("a-long-enough-code"), true);
    assert.equal(session.checkAccessCode("a-long-enough-cod"), false);
    assert.equal(session.checkAccessCode("x".repeat(10_000)), false);
  });
  it("revokes tokens from an earlier epoch (sign-out everywhere)", () => {
    const t = session.createSessionToken("usr_1", 3);
    assert.equal(session.verifySessionToken(t, 3), "usr_1");
    assert.equal(session.verifySessionToken(t, 4), null);
  });
  it("rejects forged, extended, oversized and expired tokens", () => {
    const t = session.createSessionToken("usr_1", 0);
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "usr_admin", ep: 0, exp: 9e9 })).toString("base64url");
    assert.equal(session.verifySessionToken(`${forged}.${sig}`, 0), null);
    assert.equal(session.verifySessionToken(`${t}.extra`, 0), null);
    assert.equal(session.verifySessionToken("a".repeat(5000), 0), null);
    assert.equal(session.verifySessionToken(session.createSessionToken("usr_1", 0, Date.now() - 13 * 3600_000), 0), null);
  });
  it("uses a __Host- cookie when secure", () => {
    assert.equal(session.sessionCookie(true), "__Host-pl_session");
    assert.equal(session.sessionCookie(false), "pl_session");
  });
});

describe("CSRF origin checks", () => {
  it("accepts same-origin requests", () => {
    assert.equal(session.originAllowed(headers({ host: "demo.example", origin: "https://demo.example" })), true);
    assert.equal(session.originAllowed(headers({ host: "demo.example", "sec-fetch-site": "same-origin" })), true);
  });
  it("rejects cross-site, opaque and unparseable origins", () => {
    assert.equal(session.originAllowed(headers({ host: "demo.example", origin: "https://evil.example" })), false);
    assert.equal(session.originAllowed(headers({ host: "demo.example", origin: "null" })), false);
    assert.equal(session.originAllowed(headers({ host: "demo.example", origin: "::::" })), false);
  });
  it("rejects a cross-site request that omits Origin", () => {
    assert.equal(session.originAllowed(headers({ host: "demo.example", "sec-fetch-site": "cross-site" })), false);
    assert.equal(session.originAllowed(headers({ host: "demo.example", "sec-fetch-site": "same-site" })), false);
  });
});

describe("sign-in limits", () => {
  it("limits one client, then everyone, and stays bounded in memory", () => {
    const l = new session.LoginLimiter(3, 5, 60_000, 100);
    for (let i = 0; i < 3; i++) l.failure("a", 1000);
    assert.equal(l.allowed("a", 1000), false);
    assert.equal(l.allowed("b", 1000), true);
    l.failure("b", 1000);
    l.failure("c", 1000);
    assert.equal(l.allowed("rotating-address", 1000), false, "the global cap stops address rotation");
    assert.equal(l.allowed("a", 70_000), true, "limits reset after the window");
    const race = new session.LoginLimiter(2, 100, 60_000, 100);
    assert.deepEqual([race.attempt("x", 1), race.attempt("x", 1), race.attempt("x", 1)], [true, true, false], "attempts count before they are checked");
    const big = new session.LoginLimiter(1, 1e9, 60_000, 50);
    for (let i = 0; i < 500; i++) big.failure(`ip${i}`, 1000);
    assert.ok((big as unknown as { perClient: Map<string, unknown> }).perClient.size <= 50);
  });
});

describe("worker install policy (npm ci runs on the host)", () => {
  const lock = (packages: Record<string, unknown>) => JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "x" }, ...packages } });
  it("accepts registry packages with integrity hashes and in-repo workspace links", () => {
    assert.deepEqual(lockfileProblems(lock({ "node_modules/a": { resolved: `${REGISTRY}a/-/a-1.0.0.tgz`, integrity: "sha512-abc" }, "node_modules/w": { link: true, resolved: "packages/w" } })), []);
  });
  it("accepts bundled dependencies and workspace folders, refuses traversal in install paths", () => {
    assert.deepEqual(lockfileProblems(lock({ "node_modules/a/node_modules/b": { inBundle: true }, "packages/ui": { version: "1.0.0" }, "node_modules/@scope/pkg": { resolved: `${REGISTRY}@scope/pkg/-/pkg-1.0.0.tgz`, integrity: "sha512-x" } })), []);
    for (const key of ["node_modules/../../x", "node_modules/a/../../../etc", "node_modules/..", "../outside", "/abs/path", "packages/../../x"]) {
      assert.equal(lockfileProblems(lock({ [key]: { resolved: `${REGISTRY}a.tgz`, integrity: "sha512-x" } })).length, 1, key);
    }
  });
  it("refuses git, file, http and foreign-host sources, missing integrity, and old lockfiles", () => {
    for (const resolved of ["git+ssh://git@github.com/x/y.git#abc", "file:../outside", "http://registry.npmjs.org/a.tgz", "https://evil.example/a.tgz"]) {
      assert.equal(lockfileProblems(lock({ "node_modules/a": { resolved, integrity: "sha512-abc" } })).length, 1, resolved);
    }
    assert.equal(lockfileProblems(lock({ "node_modules/a": { resolved: `${REGISTRY}a.tgz` } })).length, 1);
    assert.equal(lockfileProblems(lock({ "node_modules/w": { link: true, resolved: "../../etc" } })).length, 1);
    assert.equal(lockfileProblems(JSON.stringify({ lockfileVersion: 1, dependencies: {} })).length, 1);
    assert.equal(lockfileProblems("{not json").length, 1);
  });
  it("pins npm's configuration above a malicious project .npmrc", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-npmrc-"));
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    fs.writeFileSync(path.join(dir, ".npmrc"), "git=./evil.sh\nregistry=https://evil.example/\nignore-scripts=false\n");
    for (const f of ["user", "global"]) fs.writeFileSync(path.join(dir, f), "");
    const env: NodeJS.ProcessEnv = { ...({} as NodeJS.ProcessEnv), PATH: process.env.PATH, HOME: dir, ...pinnedNpmEnv(path.join(dir, "user"), path.join(dir, "global")) };
    const get = (k: string) => execFileSync("npm", ["config", "get", k], { cwd: dir, env, encoding: "utf8" }).trim();
    assert.equal(get("git"), "false-git-is-disabled");
    assert.equal(get("registry"), REGISTRY);
    assert.equal(get("ignore-scripts"), "true");
  });
});
