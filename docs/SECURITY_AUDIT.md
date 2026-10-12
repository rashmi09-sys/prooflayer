# Security audit — 11 October 2026

Scope: the whole repository at the audited commit: the Next.js app (routes, API, server components), operator authentication, the verification worker, Docker execution, git operations, artifact and preview serving, persistence, the recorded demonstration, build and deployment configuration.

**Method.**
- Manual review of the source, not of documentation describing it.
- Two proofs of concept, each reproduced before its fix and re-run after it. One showed host code execution through `npm ci`; the other probed the worker browser's network reach.
- Automated tests: unit, route-handler and HTTP level.
- `npm audit` and gitleaks for dependencies and secrets.
- A browser QA pass.
- A separate reviewer that had not seen the work audited the fixes; its findings are included below and were fixed.

This is a portfolio prototype prepared for a public, read-only demonstration. It is not a production service, and passing these checks does not make it one.

## Decision

**READY FOR PUBLIC READ-ONLY DEMO**

No known critical or high-severity issue remains reachable in the public deployment. The two high findings were fixed and verified:
- The public deployment is now read-only by construction.
- The worker's host-side install can no longer be steered by the repository it checks.

This holds only if the demo is deployed as described in [DEPLOYMENT.md](DEPLOYMENT.md):
- Build with `npm run build:public`.
- Leave `PROOFLAYER_PUBLIC_DEMO` and `PROOFLAYER_DATA_DIR` unset, or set the first to `true`.
- Afterwards, run `scripts/security-smoke.mjs` against the deployed URL.

## Trust boundaries

| # | Boundary | Trust | What crosses it |
|---|---|---|---|
| 1 | Anonymous public reviewer | None | GET requests only (public demo) |
| 2 | Authenticated operator | Full, single account | Sign-in, run requests, repairs, settings (private mode only) |
| 3 | Next.js server | Trusted code | Reads the database; never executes checked code |
| 4 | Verification worker | Trusted code, untrusted input | Exports a commit, installs, runs checks in Docker, drives Chromium |
| 5 | Docker sandbox | Untrusted code | The checked repository's lint, types, tests, build |
| 6 | Git repositories and repair branches | Fixture repos; repair branches written only by NeverBreak | `neverbreak/repair-*` refs only |
| 7 | Recorded evidence | Committed, hash-verified package | Imported at build time into a read-only snapshot |
| 8 | External APIs | Optional, private mode | Anthropic (explanations), GitHub (one allowlisted repo) |

The public deployment contains boundaries 1, 3 and 7 only:
- No worker, Docker, git, operator sign-in or external API exists there.
- None of them is reachable from it.

## Findings

Severity is for the deployment the finding affects:
- **Public:** the Vercel demo.
- **Private:** an operator's own machine running the worker.

| ID | Severity | Where | Finding | Status |
|---|---|---|---|---|
| F1 | **High** (public) | `lib/server/config.ts`, `lib/server/db.ts`, missing `.vercelignore` | The public deployment was not read-only by construction (details below). | **Fixed** |
| F2 | **High** (private) | `worker/executor.ts` (install stage) | `npm ci` runs on the worker host. A commit could make it execute a program or fetch arbitrary URLs. **Proof of concept:** a repository `.npmrc` with `git=./evil.sh` plus a git dependency made `npm ci --ignore-scripts` run the script on the host. | **Fixed** |
| F3 | Medium (private) | `worker/snapshot.ts` | Chromium on the worker host ran the untrusted app's JavaScript with unrestricted network access: loopback, the LAN, metadata services, the internet. | **Fixed** |
| F4 | Medium (public) | `lib/server/run-detail.ts` `redactForPublic` (line 140) | Raw output could reach visitors in two ways. A fallback "last lines of output" proof carried raw log lines, and AI explanations could quote logs. *Found by the independent review.* | **Fixed** |
| F5 | Medium (private) | `app/preview/[seg]/[[...path]]/route.ts` | Only HTML responses got the sandbox CSP. An SVG from an untrusted build, opened directly, would run with ProofLayer's origin and the operator's cookie. *Found by the independent review.* | **Fixed** |
| F6 | Medium | `lib/server/session.ts` `originAllowed` (line 72) | The CSRF check accepted any state-changing request without an `Origin` header. `SameSite=Lax` limited the impact. | **Fixed** |
| F7 | Medium (private) | `app/api/auth/login/route.ts`, `lib/server/session.ts` `LoginLimiter` (line 92) | Sign-in limits were weak (details below). | **Fixed** |
| F8 | Medium | preview route; `lib/server/preview.ts` | Three preview problems (details below). | **Fixed** |
| F9 | Low (private) | `lib/server/auth.ts` | Signing out didn't revoke a copied session cookie; it stayed valid for 12 h. | **Fixed** |
| F10 | Low | app pages, JSON routes | Missing hardening (details below). | **Fixed** |
| F11 | Low (public) | `lib/server/viewer.ts` `isPublicProject` (line 23) | Visitors could browse the Ledgerly fixture; the demo's scope is DashDish only. | **Fixed** |
| F12 | Low (public) | `scripts/build-snapshot.ts` | Three weaknesses in how the public snapshot was built (details below). *Found by the independent review.* | **Fixed** |
| F13 | Low | `.gitignore` | `.env` and `.env.production` were not git-ignored; only `.env*.local` was. | **Fixed** |
| F14 | Low (private) | `worker/executor.ts` | A kept static build could be any size, so an untrusted build could exhaust disk. | **Fixed** |
| F15 | Info | repository | Dead code and unused dependencies, and an unused Supabase migration not marked as unused. | **Fixed** |

### F1 details: public deployment not read-only (High)

**Problems:**
- There was no public-demo mode, so operator sign-in and every mutating API existed wherever secrets were set.
- At runtime the app needed a writable SQLite file under `.data/`.
- `vercel deploy` from a working folder would have uploaded `.env.local`, which holds the real access code and session secret.

**Fix:**
- `PROOFLAYER_PUBLIC_DEMO` resolves fail-closed (`resolvePublicDemo`, config.ts line 21). It is public on Vercel unless explicitly `false`, and any unknown value means public.
- In public mode, operator and API secrets are ignored and `authConfigured()` is false.
- The data is an immutable snapshot opened `readOnly` with `query_only` (`openSnapshotDb`, db.ts line 28).
- A recorded repository (`RecordedRepoProvider`, providers.ts line 131) replaces git.
- `apiUser` returns 403 before anything else.
- `proxy.ts` independently allows only GET/HEAD and returns 404 for operator paths.
- `.vercelignore` excludes `.env*`, `.data` and build output.
- Tracing bundles only the snapshot.

### F2 details: worker install could be steered by the repository (High)

**Three independent layers** (`worker/install-policy.ts`):
1. The repository `.npmrc` is deleted.
2. npm configuration is pinned through environment variables, which take precedence over project files: registry, `git` disabled, `ignore-scripts`, empty user and global config.
3. The lockfile must list only `https://registry.npmjs.org/` tarballs with integrity hashes, `node_modules/` install paths without traversal, or in-repo workspaces.

A repository that also has `npm-shrinkwrap.json` is refused, because npm would read it instead. That bypass was found by the independent review.

**Verification:** the proof of concept no longer runs, and is rejected by each layer separately.

### F3 details: unconfined worker browser (Medium)

**Fix:**
- Every destination except the app container goes to a refusing proxy (`--proxy-server=127.0.0.1:9`, `--proxy-bypass-list=<-loopback>;<ip>`).
- Hostnames don't resolve.
- WebRTC UDP can't bypass the proxy.
- Service workers are blocked.
- Each context aborts requests to any other origin (`confineTo`, snapshot.ts line 479).
- Chromium's own sandbox is used when the worker isn't root.

**Verified experimentally:** loopback, a host port, 169.254.169.254, example.com and WebSockets were all blocked. The app's own origin still loaded.

### F4 details: raw output reaching visitors (Medium)

Fix: the output-type proof is replaced with the private-log notice, and explanations are omitted for visitors.

### F5 details: unsandboxed preview documents (Medium)

Fix: the sandbox CSP is sent on every preview response.

### F7 details: weak sign-in limits (Medium)

**Problems:**
- Limits were keyed on a client-supplied header.
- Attempt storage was unbounded.
- There was no global cap.
- Checking happened after `await`, so parallel attempts slipped through.
- There was no minimum code length.

**Fix:**
- Per-client and global limits.
- Attempts are counted before the code is checked.
- Storage is bounded.
- Codes of at least 12 characters and secrets of at least 32.
- The form body is capped at 4 KB.

### F8 details: preview route errors (Medium)

**Problems:**
- Malformed percent-encoding caused a 500.
- Containment was checked without resolving symlinks.
- An unknown preview link made the server write a secret file.

**Fix:**
- Real-path containment.
- Malformed encodings return 400 from the proxy.
- No secret write in public mode.

### F9 details: sign-out didn't revoke sessions (Low)

**Fix:**
- Session tokens carry an epoch, and signing out increments it, which revokes every earlier session.
- Cookies are now `__Host-` prefixed, httpOnly, Secure in production, and SameSite=Lax.

### F10 details: missing hardening (Low)

**Problems:**
- No CSP on pages.
- No size limits or strict validation on JSON bodies.
- The repair route returned internal error text.

**Fix:**
- A per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`) plus HSTS and COOP.
- `readJson` with a 16 KB cap, an `application/json` requirement and object validation, with strict per-route checks.
- Internal errors are logged on the server, and the client gets a generic message.

### F12 details: snapshot builder weaknesses (Low)

**Problems:**
- A failed build could leave a full private database copy where it would be bundled.
- The operator's email went into the snapshot.
- Unrelated local repair branches were recorded.

**Fix:**
- The snapshot is built in a temporary folder and moved into place only on success.
- The owner is anonymised.
- Only referenced branches are kept.
- File contents are scrubbed.
- The snapshot is traced only in public builds.

### F15 details: dead code (Info)

**Removed:**
- Six unused components: `ProofStage`, `DiagnosisPanel`, `EvidencePanel`, `proof-seal`, `stage-actions` and `next-steps`, plus their orphaned helpers.
- Three unused font packages.

**Also:**
- `studio.tsx` was split from 1,357 lines into orchestration, home, run, comparison and shared modules.
- `db/supabase/README.md` states the migration is unused.

### Verified sound (no change needed)

- **Git:** argument arrays only (`execFile`), never a shell.
  - SHAs are validated against `^[0-9a-f]{40}$`, and refs against an allowlist that rejects a leading `-`.
  - Paths are checked by `SAFE_PATH` (providers.ts line 78).
  - `--` separates arguments.
  - Repairs may only write `neverbreak/repair-*` (`REPAIR_BRANCH_RE`, line 79), through a private index that never touches a working tree.
  - Diffs now also pass `--no-ext-diff --no-textconv`.
- **Docker:**
  - `--network none` (executor.ts line 488) and `--read-only` (line 493).
  - A size-capped `/tmp` tmpfs and `--cap-drop ALL`.
  - `no-new-privileges` and uid 10001.
  - Memory, swap, CPU and PID limits, plus per-step timeouts.
  - Output is capped at 4 MB raw and 64 kB stored, and redacted.
  - Containers are removed afterwards.
  - The image contains no npm and no credentials.
  - Only the commit's exported files are mounted.
- **Commands:**
  - Fixed argv for lint, typecheck and build.
  - The test command is accepted only if it matches `node --test`, `vitest run` or `jest --ci`.
  - No user-supplied shell command exists anywhere.
- **Prompt injection:** captured output is fenced and neutralised before it goes to the model (`neutralize`, explain.ts line 37). The model's answer is parsed as JSON, validated, stored separately and can never change a verdict.
- **XSS:** no `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere. React escapes all output.
- **Repository and network allowlists:** local repositories are confined to `<data>/repos`. GitHub is limited to one allowlisted repository at `api.github.com` (SSRF-safe).
- **Protection-off runs:** a run requested with NeverBreak off is never repaired (repair.ts line 117).
- **Verdicts:**
  - Decided from exit codes, never by AI.
  - Prepared fixes are labelled "written in advance, not generated".
  - Recorded playback is labelled "Recorded demonstration", and the public demo reports `workerOnline: false`.

## Tests performed (all ran; results as observed)

| Test | Result |
|---|---|
| `npm test`: 20 files, including `tests/security.test.ts` (15) and `tests/public-demo.test.ts` (15) | **141 / 141 pass** |
| `tests/public-demo.test.ts` | Runs in public mode with real operator secrets set in the environment, which must be ignored. **Results:** <br>• Every state-changing route handler is imported and called anonymously; each returns 403 or 404 (8 handlers). <br>• Health and commits return 403. <br>• Writes to the snapshot throw. <br>• The proxy refuses POST, PUT, PATCH and DELETE on any path, hides operator paths, and rejects malformed encoding. <br>• The recorded repository can't export source or write commits. <br>• An unknown preview link writes nothing. |
| `tests/security.test.ts` | Covers: <br>• fail-closed mode resolution <br>• token forgery, expiry, oversized tokens and epoch revocation <br>• the CSRF matrix <br>• the limiter: per client, global, bounded, and counting before checking <br>• the lockfile policy, including traversal, git, file, http, foreign hosts, bundled packages and workspaces <br>• the pinned npm config overriding a malicious `.npmrc` (real `npm config get`) |
| `tsc --noEmit`, `eslint .` | Clean |
| `npm run build` (private) and `VERCEL=1 npm run build:public` in a clean directory | Both succeed |
| `npm audit --omit=dev` and `npm audit` | **0 vulnerabilities** (next 16.4.0, the current release) |
| gitleaks 8.21.2 on all 16 commits | **No leaks.** 5 findings in test files are fake tokens used to prove redaction; they are reviewed and listed in `.gitleaksignore`. The working tree's real `.env.local` is untracked and ignored by git and Vercel. |
| Simulated Vercel runtime: unprivileged user, read-only tree, no `.data`, no `fixtures`, no `git` on PATH, `VERCEL=1` | All public pages 200; operator paths 404 |
| `scripts/security-smoke.mjs` against that runtime | **42 / 42.** Covers: <br>• writes refused (405) <br>• operator surfaces absent <br>• traversal, private files and other projects refused <br>• logs and configuration withheld <br>• CSP, framing and nosniff headers <br>• clean error bodies |
| Browser QA on that runtime (Chromium) | **Flows:** NeverBreak OFF ends on "Scheduled delivery was added, but regular checkout broke." (39 s). ON ends on "Scheduled delivery works. Regular checkout still works." (48 s). The browser sent 0 POSTs and logged no page errors. <br>**Embedded builds, driven:** the original has no Schedule option and regular checkout confirms. The changed build: regular checkout stops at "Choose a delivery time", scheduled reaches "Order scheduled". The repaired build: both succeed. <br>**Layout and keyboard:** no overflow at 390, 768, 1024, 1280 or 1440 px; the toggle works with arrow keys. <br>**Accessibility:** axe (WCAG 2.0/2.1 AA) found 0 violations on 9 screens, with reduced motion. |
| Private mode after the fixes (Docker worker, live) | **OFF:** run_z4q0ahoIMqxc failed as expected in 80 s; its Chromium journeys still captured 10 frames under confinement. The repair API returned 409 for an OFF run. <br>**ON:** detected the regression, then repaired and verified it in 174 s. |
| Operator authentication over HTTP | **Cookie:** `__Host-pl_session`, httpOnly, Secure, Lax. <br>**Revocation:** a copied cookie worked before sign-out (200) and was rejected after it (401). <br>**CSRF:** a cross-site POST carrying the cookie got 403. <br>**Limits:** 12 wrong codes returned "limited". |

## Residual risks

1. **Root workers run Chromium without its own sandbox.** When the worker runs as root, Chromium's sandbox is off. The network confinement above still applies. Run the worker as an unprivileged user (private mode only).
2. **Containers on an internal Docker network may reach host services.** The snapshot server's container sits on an `--internal` Docker network, which can usually still reach services bound to the host's bridge address. Don't run sensitive services on `0.0.0.0` on a worker host.
3. **`npm ci` still runs on the host.** It downloads and extracts registry tarballs, pinned by integrity hash, with scripts and git disabled. A vulnerability in npm's own extraction would affect the host.
4. **Sign-in can be locked out globally.** About 50 failed attempts in 10 minutes block everyone, the operator included. This is an accepted trade-off for one operator; limits are per server process.
5. **CSP allows inline styles.** `style-src` includes `'unsafe-inline'` (React style attributes). Scripts are nonce-only.
6. **Some evidence stays public by design.** Parsed proofs and excerpts from the fixture's source are shown publicly: assertion expected/actual values, and compiler and linter findings. They come from a fictional demo repository.
7. **The origin check trusts `X-Forwarded-Host`.** Deploy behind a proxy that sets it (Vercel does), or with none.
8. **Preview links are capabilities in the URL.** They carry an HMAC token and could leak through history or sharing. They expose only the public fixture's static builds.
9. **The public build trusts the committed recorded package.** It is SHA-256 verified on import, but its authenticity rests on the git history.
10. **Repository hygiene is not automated yet.** Enable GitHub Dependabot, secret scanning and push protection when publishing (see the [release checklist](RELEASE_CHECKLIST.md)).

## Unverified assumptions

- **No real Vercel deploy was done.** The audit had no Vercel access. A deployment was simulated as listed above. It assumes:
  - Vercel's build image provides `git` and `bash`, which `demo:init` uses to recreate the fixture repositories.
  - Vercel uses Node ≥ 22.18, which the `engines` field requires.
  - Vercel honours `outputFileTracingIncludes` for `.demo-snapshot/`.
  - `vercel deploy` honours `.vercelignore`.

  `scripts/security-smoke.mjs` should be run against the real URL to confirm.
- **Chromium's own sandbox was not tested,** because the audit environment runs as root.
- **npm's handling of a traversing lockfile key was not tested.** Such keys are rejected before npm runs, so npm's behaviour is not relied on.
- **No container-escape or kernel-level testing** was done on the Docker sandbox. The flags were verified in code and in real runs.
