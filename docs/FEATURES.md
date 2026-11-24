# Feature status

What exists, where it runs, and the evidence for it. Run IDs and dates are in [VALIDATION.md](VALIDATION.md).

| Status | Meaning |
|---|---|
| **DEPLOYED DEMO** | Served by the public read-only deployment as recorded functionality. Nothing is executed there. |
| **LOCAL VERIFIED** | Executed successfully on a private installation with the worker and Docker (October 2026). Not hosted. |
| **PARTIALLY VALIDATED** | Implemented, but only part of it has been exercised: for example failure paths only. |
| **FIXTURE** | Demo application or prepared data. |
| **PLANNED** | Not implemented. |
| **REMOVED** | Existed in an earlier iteration and is no longer in the application. |

The deployed demo replays evidence that the private worker recorded. Features marked LOCAL VERIFIED produced that evidence but do not run in the deployment.

| Feature | Status | Evidence |
|---|---|---|
| **Deployed demo** | | |
| Recorded replay: one request, NeverBreak OFF and ON | DEPLOYED DEMO | The DashDish request replayed from the timestamps of the recorded runs. OFF ends on "Scheduled delivery was added, but regular checkout broke."; ON ends on "Scheduled delivery works. Regular checkout still works." Labelled "Recorded demonstration". Driven in Chromium against a simulated public runtime in October (0 POSTs). The hosted deployment passed the 42-check smoke test on 24 Nov 2026; the hosted replay was not re-driven by browser automation. |
| Recorded run pages, protected flows and comparison | DEPLOYED DEMO | Read-only pages for the three recorded DashDish runs: checks, parsed proof, Chromium frames, per-flow results, before and after. Raw logs are withheld from visitors. |
| Interactive preview of a recorded build | DEPLOYED DEMO | The static build each recorded run produced, served from a per-run path with a sandboxing Content-Security-Policy inside a sandboxed iframe, labelled with its SHA. |
| Read-only enforcement | DEPLOYED DEMO | `proxy.ts` allows only GET and HEAD and hides operator paths, every privileged route handler refuses on its own, and the snapshot database is opened read-only. Covered by `tests/public-demo.test.ts` and the hosted smoke test. |
| Recorded package integrity | DEPLOYED DEMO | `demo/recorded/dashdish`: 3 runs, 105 files, each with a SHA-256 in the manifest. Import refuses a file that does not match (tested with one altered value). |
| **Private live verification** | | |
| Verification worker and sandbox | LOCAL VERIFIED | Separate worker process. `npm ci` on the host under the install policy; lint, type check, tests and build in Docker with no network, a read-only root, a non-root user, dropped capabilities, and CPU, memory, process and time limits. Ran against every fixture commit in October. |
| Pass, fail, incomplete and cancelled verdicts | LOCAL VERIFIED | Ledgerly: one commit passed, one failed type checking (TS2345), one failed tests (expected $108.00, received $1.08), from recorded exit codes. With the sandbox image removed or the Docker daemon down, runs were recorded Incomplete, not Failed. A run cancelled during the build was recorded Cancelled and its container removed. |
| Customer journeys in Chromium | LOCAL VERIFIED | After a passing build, the static export is served on an internal Docker network and Chromium (390×844) follows server-defined journeys: regular and scheduled checkout. Each step is saved as a hashed frame with expected and actual. On `9b70678` regular checkout stopped at "Choose a delivery time" and scheduled checkout reached "Order scheduled". |
| Live request, protection OFF and ON | LOCAL VERIFIED | OFF: run_4xlRaMRsOuO7 failed as expected and the repair API refused (409). ON: run_27xA6MevsIMS failed, the prepared repair was verified in run_QTmiwrQOVgmR, outcome repaired. |
| NeverBreak: protected flows | LOCAL VERIFIED | Learned from the last passing run: every passing leaf test, the page opening, and journeys that reached their expected screen. Ledgerly: 4 flows from `9bc5d46`. DashDish: 5 flows from `0c4e1f8`. Unit tested on recorded `node:test` output. The plain-English flow names for the fixtures were written by hand. |
| NeverBreak: edited-test warning | LOCAL VERIFIED | Flags a flow when the change rewrote the test that protects it, even if the test now passes, by comparing the test body in git. Flagged the rewritten "adds tax to the subtotal" test in the Ledgerly fixture commits `0579999` and `1df91de`. |
| Controlled repair: prepared fix | LOCAL VERIFIED | Attempt 1 applies a fix written in advance (`prepared-fixes/*`, parent is the broken commit) on an isolated `neverbreak/repair-*` branch and verifies it as a normal run. Counts as "repaired" only if the change's new checks still pass. Ran live: `9b70678` → `e34e22a`, 5 protected flows and 3 new checks passed, `main` untouched. Not generated, and labelled so in the interface. |
| Controlled repair: restore and roll back | LOCAL VERIFIED | Without a prepared fix: restore the code the change touched, then roll back the whole change. At most two attempts; a roll-back is reported as a roll-back. Ran on Ledgerly manually and automatically: attempt 1 failed (the change had rewritten a test), attempt 2 passed. Does not touch `main` and does not push. Local fixtures only. |
| Structured proof and source excerpts | LOCAL VERIFIED | Expected versus received, type mismatches and lint locations parsed from recorded output; source lines around each failure copied from the exact commit. Unit tested and shown for the fixture failures. |
| Page capture and located assertion values | LOCAL VERIFIED | Chromium captures the built page and searches the DOM for the failing assertion's values. On `1df91de` it found "$1.08" in "Total due: $1.08". Informational: it does not change a verdict. |
| Run history, deduplication and stale-run recovery | LOCAL VERIFIED | SQLite with foreign keys and a schema-level verdict invariant. One active run per commit; a run left by a stopped worker is closed as Incomplete. |
| Secret redaction and output limits | LOCAL VERIFIED | Known secret shapes and configured secret values are removed before storage; output is capped per step. Unit tested. |
| Operator sign-in | LOCAL VERIFIED | One operator behind an access code; HMAC-signed `__Host-` session cookie; origin checks on writes; sign-in limits; sign-out revokes earlier sessions. Tested over HTTP in October. |
| Run investigation page | LOCAL VERIFIED | Step timeline, findings, log inspector, a rule-based assistant (five fixed prompts answered from recorded evidence and git, no language model) and a command palette. Driven with browser automation in the earlier October iterations; not re-driven after the workspace was rebuilt around the single request. |
| **Partially validated** | | |
| AI failure explanations (Anthropic) | PARTIALLY VALIDATED | Implemented, private mode only. Prompt fencing, redaction and output validation are unit tested. The missing-key path and a rejected key (HTTP 401 from the API) were exercised. No successful explanation has been generated. |
| GitHub repository integration | PARTIALLY VALIDATED | Metadata, branches, commits, commit resolution and tarball export succeeded against public `octocat/Hello-World` without a token. Not tested: a token, a private repository, or a full verification run of a GitHub repository. |
| Concurrent workers | PARTIALLY VALIDATED | Run claiming is atomic, but only one worker has been run. |
| **Fixtures** | | |
| DashDish demo app | FIXTURE | A fictional food-delivery app (Next.js static export) built by `scripts/create-dashdish.sh` with deterministic commits: `0c4e1f8` is the original, `9b70678` is the prepared change (adds scheduled delivery, breaks regular checkout), and `prepared-fixes/scheduled-delivery` holds the prepared repair `2341e46`. The request is scripted. |
| Ledgerly demo repository | FIXTURE | A small Next.js invoicing app with three commits on `main`, plus three earlier commits on `legacy-v1` so early runs stay reproducible. Built by `scripts/create-fixture.sh`. |
| **Planned** | | |
| AI-written repair | PLANNED | Not built. |
| Hosted live verification | PLANNED | The public demo is hosted; the worker is not. It needs a host with Docker. |
| Postgres storage, multiple users | PLANNED | A Supabase migration exists in `db/supabase/0001_init.sql`; it has never been applied or tested. |
| **Removed** | | |
| Seven-scene presentation and guided walkthrough | REMOVED | Earlier interface iterations, replaced by the single-request workspace. They appear in the historical sections of [VALIDATION.md](VALIDATION.md). |
| In-app documentation pages | REMOVED | Moved to `docs/` when the app became a public read-only demo. |
| Sample data mode | REMOVED | Four invented runs used for design review, removed before the public demo. |

Deliberately out of scope: merging, pushing or deploying code. ProofLayer writes only to isolated repair branches in the local fixture repositories.

Scope and boundaries: [LIMITATIONS.md](LIMITATIONS.md).
