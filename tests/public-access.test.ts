import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The public, read-only demo: what a visitor without a session may see, and
// proof that every route which could start work still demands an operator.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prooflayer-public-"));
process.env.PROOFLAYER_DATA_DIR = dir;
process.env.PROOFLAYER_SESSION_SECRET = "x".repeat(40);
process.env.PROOFLAYER_ACCESS_CODE = "test-code";
process.env.PROOFLAYER_ANTHROPIC_API_KEY = "sk-ant-should-never-leak";

const store = await import("../lib/server/store.ts");
const { getDb } = await import("../lib/server/db.ts");
const { config } = await import("../lib/server/config.ts");
const viewer = await import("../lib/server/viewer.ts");
const { redactForPublic, PRIVATE_LOG } = await import("../lib/server/run-detail.ts");

const sha = (c: string) => c.repeat(40);
let owner: string;
let publicRun: string;
let privateRun: string;
let publicArtifact: string;
let privateArtifact: string;

before(() => {
  getDb();
  owner = store.ensureUser(config.operatorEmail, "Operator");
  store.upsertProject({ ownerId: owner, name: "DashDish", slug: "dashdish", provider: "local", fullName: "demo/dashdish", locator: "dashdish", defaultBranch: "main", webUrl: null });
  store.upsertProject({ ownerId: owner, name: "Ledgerly", slug: "ledgerly", provider: "local", fullName: "demo/ledgerly", locator: "ledgerly", defaultBranch: "main", webUrl: null });
  store.upsertProject({ ownerId: owner, name: "Private", slug: "private-app", provider: "github", fullName: "acme/private-app", locator: "acme/private-app", defaultBranch: "main", webUrl: "https://github.com/acme/private-app" });
  store.upsertProject({ ownerId: owner, name: "Scratch", slug: "scratch", provider: "local", fullName: "local/scratch", locator: "scratch", defaultBranch: "main", webUrl: null });
  const make = (slug: string, c: string) => {
    const project = store.getProjectBySlug(owner, slug)!;
    const { runId } = store.createRun({ userId: owner, project, branch: "main", commitSha: sha(c), commitMessage: "m", commitAuthor: "x", commitDate: null });
    const check = store.getChecks(runId)[0];
    const art = store.saveArtifact({ runId, checkId: check.id, kind: "screenshot", fileName: "a.png", mime: "image/png", bytes: 1, sha256: "0", width: 1, height: 1, pageUrl: "/", label: "x", capturedAt: new Date().toISOString(), annotations: null });
    return { runId, art };
  };
  ({ runId: publicRun, art: publicArtifact } = make("dashdish", "a"));
  ({ runId: privateRun, art: privateArtifact } = make("private-app", "b"));
});

const visitor = () => ({ userId: owner, operator: false, email: null });
const operator = () => ({ userId: owner, operator: true, email: config.operatorEmail });

describe("public demo access", () => {
  it("shows visitors only the public demo project", () => {
    assert.deepEqual(viewer.viewerProjects(visitor()).map((p) => p.slug).sort(), ["dashdish"]);
    assert.equal(viewer.viewerProject(visitor(), "ledgerly"), null, "other fixtures are operator-only");
    assert.equal(viewer.viewerProject(visitor(), "private-app"), null);
    assert.equal(viewer.viewerProject(visitor(), "scratch"), null, "a local project that isn't a known fixture stays private");
    assert.equal(viewer.viewerProjects(operator()).length, 4);
  });

  it("lets visitors read runs and frames of public projects only", () => {
    assert.ok(viewer.viewerRun(visitor(), publicRun));
    assert.equal(viewer.viewerRun(visitor(), privateRun), null);
    assert.ok(viewer.viewerArtifact(visitor(), publicRun, publicArtifact));
    assert.equal(viewer.viewerArtifact(visitor(), privateRun, privateArtifact), null);
    assert.equal(viewer.viewerArtifact(visitor(), publicRun, privateArtifact), null, "an artifact id from another run is refused");
    assert.ok(viewer.viewerRun(operator(), privateRun));
  });

  it("never sends raw logs or server configuration to visitors", () => {
    const detail = {
      evidence: [{ checkId: "c", content: "npm ERR! token=abc /home/operator/secret", truncated: false, bytesTotal: 40, sha256: "h", updatedAt: "" }],
      proofs: [{ kind: "output", checkId: "c", checkKey: "build", checkName: "Build", provenance: "worker", tail: ["npm ERR! token=abc /home/operator/secret"] }],
      explanations: [{ checkId: "c", status: "ok", content: { evidence: ["token=abc"] } }],
      health: { worker: { online: true, lastSeen: "now", currentRun: "run_x", sandboxImage: "img" }, ai: { configured: true, model: "m" }, github: { repository: "acme/private-app", authenticated: true } },
    } as unknown as Parameters<typeof redactForPublic>[0];
    const out = redactForPublic(detail);
    assert.equal(out.access, "public");
    assert.equal(out.evidence[0].content, PRIVATE_LOG);
    assert.equal(out.health.github.repository, null);
    assert.equal(out.health.ai.configured, false);
    assert.equal(out.health.worker.sandboxImage, null);
    assert.doesNotMatch(JSON.stringify(out), /secret|token=abc|acme|sk-ant/);
  });
});

describe("privileged routes", () => {
  const root = path.join(import.meta.dirname, "..", "app", "api");
  const routes: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routes.push(p);
    }
  };
  walk(root);

  it("every route that can change something requires an operator session", () => {
    const mutating = routes.filter((r) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(fs.readFileSync(r, "utf8")));
    assert.ok(mutating.length >= 6, `found ${mutating.length} mutating routes`);
    for (const r of mutating) {
      const src = fs.readFileSync(r, "utf8");
      const rel = path.relative(root, r);
      if (rel.startsWith(path.join("auth", ""))) continue; // sign-in and sign-out themselves
      assert.match(src, /apiUser\(\{ mutating: true \}\)/, `${rel} must require an operator session`);
      assert.doesNotMatch(src, /getViewer/, `${rel} must not accept the public viewer`);
    }
  });

  it("operator-only reads stay behind the session", () => {
    for (const rel of [path.join("health", "route.ts"), path.join("projects", "[slug]", "commits", "route.ts")]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      assert.match(src, /apiUser\(\)/, `${rel} must require a session`);
    }
  });

  it("public reads go through the viewer, never straight to another user's data", () => {
    for (const rel of [path.join("runs", "[id]", "route.ts"), path.join("runs", "[id]", "artifacts", "[artifactId]", "route.ts"), path.join("projects", "[slug]", "showcase", "route.ts"), path.join("projects", "[slug]", "diff", "route.ts")]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      assert.match(src, /getViewer\(\)/, rel);
      assert.match(src, /viewer(Run|Artifact|Project)|loadRunViewFor/, rel);
    }
  });
});
