import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

// The public demo, as deployed: PROOFLAYER_PUBLIC_DEMO=true over a read-only
// snapshot, with operator secrets present in the environment (they must be
// ignored). Every route handler is imported and called as an anonymous visitor.

const root = path.join(import.meta.dirname, "..");
// Route files import "@/..." (the tsconfig path alias); map it for plain Node.
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        if (s.startsWith("@/")) return next(${JSON.stringify(pathToFileURL(root + "/").href)} + s.slice(2), c);
        if (s.startsWith("next/") && !s.slice(5).includes(".") && !s.slice(5).includes("/")) return next(s + ".js", c); // next has no exports map for ESM
        return next(s, c);
      }`,
    ),
);

const snap = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-public-"));
{
  const db = new DatabaseSync(path.join(snap, "prooflayer.db"));
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  db.exec(`INSERT INTO users (id, email, display_name) VALUES ('usr_owner', 'operator@prooflayer.local', 'Operator')`);
  db.exec("PRAGMA journal_mode = DELETE");
  db.close();
  fs.mkdirSync(path.join(snap, "repos"));
  const sha = (c: string) => c.repeat(40);
  fs.writeFileSync(
    path.join(snap, "repos", "dashdish.json"),
    JSON.stringify({
      fullName: "demo/dashdish",
      defaultBranch: "main",
      branches: [{ name: "main", headSha: sha("b") }],
      commits: { [sha("a")]: { sha: sha("a"), author: "x", date: "", message: "base" }, [sha("b")]: { sha: sha("b"), author: "x", date: "", message: "change" } },
      logs: { main: [sha("b"), sha("a")] },
      diffs: { [`${sha("a")}..${sha("b")}`]: { base: sha("a"), head: sha("b"), files: [{ path: "src/x.ts", additions: 1, deletions: 0, patch: "@@" }], truncated: false } },
      files: { [`${sha("b")}:src/x.ts`]: "export const x = 1;\n" },
    }),
  );
  fs.writeFileSync(path.join(snap, "worker-heartbeat.json"), JSON.stringify({ ts: new Date().toISOString(), sandboxImage: "img" }));
  fs.chmodSync(path.join(snap, "prooflayer.db"), 0o444);
}

process.env.PROOFLAYER_PUBLIC_DEMO = "true";
process.env.PROOFLAYER_DATA_DIR = snap;
process.env.PROOFLAYER_ACCESS_CODE = "a-real-operator-code";
process.env.PROOFLAYER_SESSION_SECRET = "s".repeat(64);
process.env.ANTHROPIC_API_KEY = "sk-ant-should-be-ignored";

const { config } = await import("../lib/server/config.ts");
const { getDb } = await import("../lib/server/db.ts");
const session = await import("../lib/server/session.ts");
const { getViewer } = await import("../lib/server/viewer.ts");
const { workerOnline } = await import("../lib/server/health.ts");
const { providerFor, ProviderError } = await import("../lib/server/providers.ts");
const { runFromPreviewSegment } = await import("../lib/server/preview.ts");
const { apiUser } = await import("../lib/server/api.ts");
const { proxy } = await import("../proxy.ts");
const { NextRequest } = await import("next/server");

const project = { id: "prj", slug: "dashdish", connection: { provider: "local", locator: "dashdish", fullName: "demo/dashdish", defaultBranch: "main" } } as never;

describe("public demo configuration", () => {
  it("is on, and ignores operator and API secrets from the environment", () => {
    assert.equal(config.publicDemo, true);
    assert.equal(config.accessCode, undefined);
    assert.equal(config.sessionSecret, undefined);
    assert.equal(config.anthropicApiKey, undefined);
    assert.equal(session.authConfigured(), false, "no sign-in exists, so a missing secret can never become a bypass");
    assert.equal(session.checkAccessCode("a-real-operator-code"), false);
  });

  it("opens the snapshot read-only: writes fail instead of silently succeeding", () => {
    const db = getDb();
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM users").get());
    assert.throws(() => db.prepare("INSERT INTO users (id, email, display_name) VALUES ('u2', 'x@y', 'X')").run(), /readonly|read-only|query_only/i);
  });

  it("treats every visitor as the public viewer without creating anything", async () => {
    const v = await getViewer();
    assert.equal(v.operator, false);
    assert.equal(v.userId, "usr_owner");
  });

  it("never reports a worker, even when a heartbeat file exists", () => {
    assert.equal(workerOnline(), false);
  });
});

describe("every privileged route handler rejects an anonymous visitor itself", () => {
  const apiRoot = path.join(root, "app", "api");
  const routes: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routes.push(p);
    }
  };
  before(() => walk(apiRoot));

  const ctx = { params: Promise.resolve({ id: "run_abcdefgh", slug: "dashdish", artifactId: "art_x" }) };
  const body = JSON.stringify({ project: "dashdish", sha: "a".repeat(40), branch: "main", prompt: "Add scheduled food delivery for tomorrow.", protection: "on", checkId: "c", action: "relearn" });

  it("POST/PUT/PATCH/DELETE: 403 read_only_demo (or 404 for sign-in), never success", async () => {
    let called = 0;
    for (const file of routes) {
      const mod = await import(pathToFileURL(file).href);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        if (typeof mod[method] !== "function") continue;
        const req = new Request(`http://demo.example/api/x`, { method, headers: { "content-type": "application/json", origin: "http://demo.example", host: "demo.example" }, body });
        const res: Response = await mod[method](req, ctx);
        called++;
        const rel = path.relative(apiRoot, file);
        assert.ok(res.status === 403 || res.status === 404, `${method} ${rel} returned ${res.status}`);
        const j = await res.json().catch(() => ({}));
        assert.ok(["read_only_demo", "not_found"].includes(j.error?.code), `${method} ${rel}: ${JSON.stringify(j)}`);
      }
    }
    assert.ok(called >= 8, `exercised ${called} state-changing handlers`);
  });

  it("operator-only reads (health, commits) are refused", async () => {
    for (const rel of ["health/route.ts", "projects/[slug]/commits/route.ts"]) {
      const mod = await import(pathToFileURL(path.join(apiRoot, rel)).href);
      const res: Response = await mod.GET(new Request("http://demo.example/api/x"), ctx);
      assert.equal(res.status, 403, rel);
    }
  });

  it("apiUser refuses before looking at cookies or origin", async () => {
    for (const mutating of [true, false]) {
      const { user, response } = await apiUser({ mutating });
      assert.equal(user, null);
      assert.equal(response!.status, 403);
    }
  });
});

describe("the proxy is an independent read-only boundary", () => {
  const call = (url: string, method = "GET") => proxy(new NextRequest(`http://demo.example${url}`, { method }));
  it("rejects every state-changing method on every path", async () => {
    for (const [method, url] of [["POST", "/api/runs"], ["POST", "/api/runs/run_x/repair"], ["DELETE", "/api/runs/run_x"], ["PUT", "/p/dashdish"], ["PATCH", "/api/projects/dashdish/neverbreak"], ["POST", "/api/auth/login"], ["POST", "/"]]) {
      const res = call(url, method);
      assert.equal(res.status, 405, `${method} ${url}`);
    }
  });
  it("answers malformed percent-encoding with 400, not a server error", () => {
    assert.equal(call("/preview/run_abcdef-0/%E0%A4%A").status, 400);
  });
  it("hides operator-only paths", async () => {
    for (const url of ["/operator", "/api/auth/login", "/api/health", "/api/projects/dashdish/commits", "/api/projects/dashdish/requests", "/api/runs/run_x/repair", "/p/dashdish/verify"]) {
      assert.equal(call(url).status, 404, url);
    }
  });
  it("lets the recorded demo through, with a nonce CSP on pages", async () => {
    const page = call("/p/dashdish");
    assert.equal(page.headers.get("x-middleware-next"), "1");
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    for (const url of ["/api/projects/dashdish/showcase", "/api/runs/run_x", "/preview/run_abcdef-0123"]) assert.equal(call(url).headers.get("x-middleware-next"), "1", url);
  });
});

describe("recorded repository (no git in the public demo)", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  it("serves only what was recorded", async () => {
    const p = providerFor(project);
    assert.equal((await p.resolve("main")).sha, b);
    assert.equal((await p.resolve("aaaaaaa")).sha, a);
    assert.equal((await p.diff(a, b)).files[0].path, "src/x.ts");
    await assert.rejects(p.diff(b, a), ProviderError);
    assert.equal(await p.readFile(b, "src/x.ts"), "export const x = 1;\n");
    assert.equal(await p.readFile(b, "../../etc/passwd"), null);
    await assert.rejects(p.resolve("--upload-pack=evil"), ProviderError);
  });
  it("cannot export source for execution or write commits", async () => {
    const p = providerFor(project);
    await assert.rejects(p.exportTo(a, path.join(snap, "x")), /cannot export/);
    assert.equal(p.createRestoreCommit, undefined);
    assert.equal(p.preparedFixes, undefined);
  });
  it("refuses repository names outside the snapshot", () => {
    assert.throws(() => providerFor({ ...(project as object), connection: { provider: "local", locator: "../../etc", fullName: "x", defaultBranch: "main" } } as never), ProviderError);
  });
});

describe("previews", () => {
  it("an unknown preview path is refused without writing anything", () => {
    const before = fs.readdirSync(snap).sort();
    assert.equal(runFromPreviewSegment("run_abcdefgh-0123456789abcdef01234567"), null);
    assert.equal(runFromPreviewSegment("../../etc"), null);
    assert.deepEqual(fs.readdirSync(snap).sort(), before);
  });
});
