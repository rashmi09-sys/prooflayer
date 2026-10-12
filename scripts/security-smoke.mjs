// HTTP-level checks of a running public demo, as an anonymous visitor.
// Run against a local `npm run start:public` or the deployed URL:
//
//   node scripts/security-smoke.mjs https://your-deployment.vercel.app
//
// Exits non-zero if any check fails. Read-only: it never changes anything,
// and on a correctly deployed demo every state-changing request is refused.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const get = (p, init) => fetch(base + p, { redirect: "manual", ...init });
const follow = (p) => fetch(base + p, { redirect: "follow" });
const sha = (c) => c.repeat(40);

// 1. Nothing can be started, repaired, changed or signed into.
const writes = [
  ["POST", "/api/runs", { project: "dashdish", sha: sha("a"), branch: "main" }],
  ["POST", "/api/runs", { project: "https://github.com/attacker/repo", sha: sha("a"), branch: "main" }],
  ["POST", "/api/projects/dashdish/requests", { prompt: "Add scheduled food delivery for tomorrow.", protection: "on" }],
  ["POST", "/api/runs/run_hNpjuKUhRQ7V/repair", {}],
  ["POST", "/api/runs/run_hNpjuKUhRQ7V/cancel", {}],
  ["POST", "/api/runs/run_hNpjuKUhRQ7V/explain", { checkId: "x" }],
  ["POST", "/api/projects/dashdish/neverbreak", { action: "auto-repair", on: true }],
  ["POST", "/api/auth/login", null],
  ["POST", "/api/auth/logout", null],
  ["PUT", "/api/runs/run_hNpjuKUhRQ7V", {}],
  ["DELETE", "/api/runs/run_hNpjuKUhRQ7V", null],
  ["PATCH", "/p/dashdish", {}],
];
for (const [method, path, body] of writes) {
  const res = await get(path, { method, headers: { "content-type": "application/json", origin: base }, body: body ? JSON.stringify(body) : undefined });
  check(`${method} ${path} is refused`, res.status === 405 || res.status === 403 || res.status === 404, `HTTP ${res.status}`);
}

// 2. Operator-only surfaces do not exist.
for (const path of ["/operator", "/api/health", "/api/projects/dashdish/commits", "/p/dashdish/verify", "/api/auth/login"]) {
  const res = await get(path);
  check(`GET ${path} is not available`, res.status === 404, `HTTP ${res.status}`);
}

// 3. No private files, traversal or other projects.
for (const path of [
  "/preview/run_hNpjuKUhRQ7V-859c240ef8c1f7db37ea051e/..%2f..%2f..%2fprooflayer.db",
  "/preview/run_hNpjuKUhRQ7V-859c240ef8c1f7db37ea051e/%2e%2e/%2e%2e/manifest.json",
  "/preview/run_hNpjuKUhRQ7V-000000000000000000000000/",
  "/preview/run_hNpjuKUhRQ7V-859c240ef8c1f7db37ea051e/%E0%A4%A",
  "/api/runs/run_hNpjuKUhRQ7V/artifacts/..%2f..%2fprooflayer.db",
  "/.env.local",
  "/.demo-snapshot/prooflayer.db",
  "/.data/prooflayer.db",
  "/p/ledgerly",
  "/api/projects/ledgerly/showcase",
]) {
  const res = await follow(path);
  check(`GET ${path} is refused`, res.status === 404 || res.status === 400, `HTTP ${res.status}`);
}

// 4. Public reads work, and withhold execution logs.
const page = await get("/p/dashdish");
check("the recorded demo page loads", page.status === 200, `HTTP ${page.status}`);
const csp = page.headers.get("content-security-policy") ?? "";
check("pages send a nonce Content-Security-Policy", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && csp.includes("frame-ancestors 'none'"), csp.slice(0, 80));
check("pages may not be framed", page.headers.get("x-frame-options") === "DENY");
check("nosniff is set", page.headers.get("x-content-type-options") === "nosniff");
const html = await page.text();
check("the page is labelled as a recorded demonstration", /Recorded demonstration/.test(html));

const run = await get("/api/runs/run_hNpjuKUhRQ7V");
const runJson = run.status === 200 ? await run.json() : null;
check("a recorded run is readable", run.status === 200, `HTTP ${run.status}`);
check("raw execution logs are withheld", runJson && runJson.access === "public" && runJson.evidence.every((e) => /Execution logs are private/.test(e.content)));
check("server configuration is withheld", runJson && runJson.health.worker.online === false && runJson.health.ai.configured === false && runJson.health.github.repository === null);

const showcase = await get("/api/projects/dashdish/showcase");
const sc = showcase.status === 200 ? await showcase.json() : null;
check("showcase reports no worker (no live execution)", sc && sc.workerOnline === false, `workerOnline=${sc?.workerOnline}`);
check("showcase is marked recorded", sc && sc.recorded !== null);

// 5. Errors are plain, without internals.
const bad = await get(`/api/projects/dashdish/diff?base=${sha("1")}&head=${sha("2")}`);
const badText = await bad.text();
check("an unknown comparison is a clean 404", bad.status === 404 && !/at .*\.(ts|js):\d+|ENOENT|spawn|git /.test(badText), `HTTP ${bad.status} ${badText.slice(0, 80)}`);
const junk = await get("/api/runs/..%2f..%2fetc");
check("a malformed run id is a clean 404", junk.status === 404);
for (const r of [page, run, showcase]) check(`no X-Powered-By on ${new URL(r.url).pathname}`, !r.headers.get("x-powered-by"));

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
process.exit(failed.length ? 1 : 0);
