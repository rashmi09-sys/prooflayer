# Feature validation report

## Security audit and public read-only release — 11 October 2026

Full report: [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Summary of what was executed after the fixes:

| Check | Result |
|---|---|
| Unit and route-handler tests | 141/141 (`npm test`). Every state-changing route handler was called anonymously in public-demo mode and refused it (8 handlers) |
| Proof of concept: a repository `.npmrc` with `git=./evil.sh` | **Before:** `npm ci --ignore-scripts` ran the script on the host. **After:** blocked by the pinned npm configuration, and the lockfile is also rejected |
| Worker Chromium confinement | An untrusted page could not reach loopback, a host port, 169.254.169.254, example.com or a WebSocket. Its own origin loaded |
| Clean `VERCEL=1 npm run build:public` | Snapshot built: DashDish, 3 recorded runs, 105 files, 10.0 MB |
| Simulated public runtime: unprivileged, read-only tree, no `.data`, no git | `scripts/security-smoke.mjs`: 42/42. OFF "Scheduled delivery was added, but regular checkout broke." (39 s); ON "Scheduled delivery works. Regular checkout still works." (48 s). 0 POSTs; axe: 0 violations on 9 screens; no overflow from 390 to 1440 px |
| Private live runs after the hardening | OFF run_z4q0ahoIMqxc failed as expected (80 s; 10 journey frames). Repair of an OFF run refused (409). ON detected the regression and repaired and verified it (174 s) |
| Operator auth over HTTP | `__Host-pl_session` cookie (httpOnly, Secure, Lax). A copied cookie was rejected after sign-out (401). A cross-site POST got 403. 12 wrong codes led to "limited" |
| `npm audit --omit=dev`, gitleaks | 0 vulnerabilities; no leaks (5 reviewed fake test tokens, then listed in `.gitleaksignore`; now allowed by exact value in `.gitleaks.toml`) |

## One prompt, two outcomes — 11 October 2026

The workspace is now one request with a **NeverBreak protection: OFF / ON** toggle. Results below are from this machine; “fresh install” means `git archive` of the commit into an empty directory, `npm ci`, `npm run demo:init`, `npm run build`, `npm start`, with no Docker, no worker and no environment variables.

| Check | Result |
|---|---|
| Baseline has no scheduled delivery | The home phone embeds the kept build of `0c4e1f8` (run_JhO1VOli1qxL). Driven in Chromium: no “Schedule” option in the cart; regular checkout reaches “Order confirmed” |
| OFF shows the broken revision | The phone switches to the kept build of `9b70678` (fresh install: run_hNpjuKUhRQ7V). Driven in Chromium: “Schedule” option present; scheduled checkout reaches “Order scheduled”; regular checkout stops at “Choose a delivery time”. Final line “Scheduled delivery was added, but regular checkout broke.” after 38 s of playback |
| ON selects the verified repair | The phone ends on the kept build of the repair commit (fresh install: `e34e22a`, run_yeShHEU1VkqA, branch `neverbreak/repair-Y8rYodlFbq3A-1`, prepared fix `2341e46`). Driven in Chromium: regular reaches “Order confirmed” and scheduled reaches “Order scheduled”. Final line “Scheduled delivery works. Regular checkout still works.” after 47 s |
| Same prompt in both modes | “Same request with NeverBreak ON” replays with the identical prompt; the request header shows “Add scheduled food delivery for tomorrow.” with NeverBreak OFF, then ON |
| Evidence matches the revisions shown | Comparison cards and Behind the scenes › Provenance cite the same run ids and SHAs as the embedded builds; run pages linked from the cards return 200 to visitors |
| Unsupported prompts | “Add a dark mode” → “This prototype currently supports the scheduled-delivery demonstration.”; stays on the composer; no playback, no request |
| Recorded playback is not live | 0 POST requests from a visitor across both flows; badge “Recorded demonstration”; anonymous `POST /requests` and `POST /runs/:id/repair` → 401 |
| Live OFF (operator, worker, Docker) | `POST /requests {protection:"off"}` → run_4xlRaMRsOuO7 (`9b70678`), stored in `run_requests` as off. Failed in 80 s; page ended on the OFF line; no repair requested. `POST /api/runs/run_4xlRaMRsOuO7/repair` → 409 “This change was requested with NeverBreak protection off, so no repair is attempted.” |
| Live ON (operator, worker, Docker) | `POST /requests {protection:"on"}` → run_27xA6MevsIMS failed (regression), the page started the existing repair; attempt `bb0a5e1` on `neverbreak/repair-hvorNmIFJ97z-1` verified in run_QTmiwrQOVgmR: passed, outcome repaired. 180 s; page ended on the ON line with “Live verification” badges |
| Navigation | No sidebar in the demo: wordmark, Workspace, “Behind the scenes” (opens the inspector). Runs, Protected journeys and Compare remain at their URLs (200) and are linked from the inspector |
| Truthfulness | The network node reads “Prepared change”, not “AI change”; Provenance states the change and repair were written in advance, not generated, and that request matching is deterministic |
| Keyboard | Tab: skip link → wordmark → Behind the scenes → toggle (one stop, arrow keys switch OFF/ON) → prompt → suggestion → Apply. Enter in the prompt submits |
| Layout | No horizontal overflow on home or result at 390, 768, 1024, 1280, 1440 px; no page errors |
| Static checks | `tsc`, `eslint`, 112/112 unit tests (new: `tests/protection.test.ts`, 4), `next build` |

## Prompt-first workspace — 11 October 2026

The DashDish workspace now starts with a prompt composer. A deterministic matcher (`lib/shared/intent.ts`) decides the scenario; the mode is decided by the server's answer to “operator, worker online and Docker sandbox available”.

| Check | Result |
|---|---|
| Supported wordings | 10 accepted in unit tests, e.g. “Add scheduled delivery for tomorrow”, “Allow users to schedule their order for later”, “Support pre-orders for next-day delivery”, “Add delivery time slots at checkout” |
| Unsupported | 9 declined, e.g. “Add a dark mode”, “Schedule a meeting with the team tomorrow”, “Remove scheduled delivery”, over-long input. The page shows “This prototype currently supports the scheduled-delivery demonstration.” and stays on the composer; the server returns 422 with the same message |
| Recorded mode, visitor, production build | Prompt submitted → steps A–H play from the recorded runs (recording time shown, e.g. “Recorded run … · 10 October 2026, 04:04 UTC”), the three moments (Before: “Order confirmed”; the change: “Choose a delivery time” ringed, scheduled “Order scheduled”; after the repair: both) and the result “Scheduled delivery works. Regular checkout still works.” after 90 s of natural playback. Labelled “Recorded demonstration”, with the disclosure that the change and repair were prepared in advance |
| Live mode, operator with worker and Docker | “Verify live” queued run_8ywQnHWLoqxs (`9b70678`, the baseline `0c4e1f8` had already passed so it was reused). Tests failed (expected 'Order confirmed', received 'Choose a delivery time'); the page started the existing repair (rep_IafO6LkaOPX6), which verified `f2b4394` in run_qeWQwFflFMsb: passed, outcome repaired. Total 182 s; the page ended on “Live result · Scheduled delivery works. Regular checkout still works.” POSTs made by the page: `/api/projects/dashdish/requests`, `/api/runs/run_8ywQnHWLoqxs/repair` |
| No live claims without a worker | Worker stopped: the operator's page shows “Recorded demonstration” and no “Verify live”; `POST /requests` returns 503 worker_unavailable. Docker down with a worker running: the heartbeat reports no sandbox image, so live is off as well |
| Access | Anonymous `POST /requests` 401; cross-origin 403; the public-access test covers the new route |
| Previously verified data | The three imported runs (run_JhO1VOli1qxL, run_hNpjuKUhRQ7V, run_yeShHEU1VkqA) still present; the recorded package is unchanged (its hash test passes) |
| Outcome line | Unit tested: shown only when the final run proves regular and scheduled checkout in Chromium with every flow and new check passing; not for a roll-back, a missing scheduled journey, or no repair |
| Layout | No horizontal overflow on home or story at 390, 768, 1024, 1280 and 1440 px; no page errors |
| Static checks | `tsc`, `eslint`, 108/108 unit tests, `next build` |

## Recorded demonstration package — 11 October 2026

The genuine DashDish story was exported from the machine that recorded it (`npm run demo:export`) into `demo/recorded/dashdish`: 3 runs, 27 checks, 25 Chromium frames, the 3 kept static builds, 15 run events, the repair and its attempt, the 5 protected flows, and the repair commit `e34e22a` as a git bundle. 105 files, each with its SHA-256 in `manifest.json`; installation-specific ids (owner, project, connection, worker) are dropped, and the exporter refuses to write if any configured secret value appears in the data.

Tested in a new directory created with `git archive HEAD` (no `.data`, no `.env.local`), with no ProofLayer environment variables, a fresh `HOME`, and a `docker` command that fails as when Docker isn't installed:

| Step | Result |
|---|---|
| `npm ci` | 159 packages |
| `npm run demo:init` | Fixture repositories rebuilt with the same SHAs (`0c4e1f8`, `9b70678`, `2341e46`); projects registered; “Recorded demonstration imported: baseline 0c4e1f8 passed (run_JhO1VOli1qxL), change 9b70678 failed (run_hNpjuKUhRQ7V), repair-verification e34e22a passed (run_yeShHEU1VkqA)” |
| Re-run | “already present”; no duplicate rows |
| A copy of the package with one changed value in `data.json` | Refused: “data.json does not match its recorded hash … No recorded results were added.” |
| `npm run build && npm start` | `/` → `/p/dashdish` |
| Workspace in Chromium | “Recorded demonstration … Nothing here is running now.”; the phone runs the recorded build (styled, interactive: tapping Ember & Crust opens the restaurant); 6 journeys; no “Check it live”, no repair button, no empty state |
| Presentation | 1 The request → 2 What's protected → 3 Checking → 4 Regression → 5 Repair → 6 Verification → 7 Proof in 92 s, ending on “Changes verified. Existing journeys protected.”; Restart → scene 1; Close → workspace |
| Run pages | Each labelled “Recorded demonstration · 10 Oct 2026”, with its recorded frame: baseline “Everything that worked still works.”, change “NeverBreak caught a regression and repaired it.”, attempt “Repair attempt 1 works.” |
| Protected Flows / Compare | 5 stages from the recorded frames (Checkout and Confirmation broken on `9b70678`); Passed before / Failed after the change / Passed after repair |
| `/operator` | “Operator access is not set up on this server.” (no access code configured) |
| Anonymous `POST /api/runs`, `POST …/repair`, `GET /api/health` | 401 |

Two defects found and fixed during this test:

- A build's preview path is compiled into the build, but it was recomputed from this installation's secret, so an imported build couldn't load its own assets. Each kept build now stores the base path it was built with (`site-base.txt`), and the preview route accepts exactly that path. Without a session secret, preview tokens now come from a random per-installation secret instead of a fixed fallback string.
- Run timestamps were formatted in the server's local time zone, so a browser in another zone got a hydration mismatch (React error #418). Timestamps are now always shown in UTC and labelled “UTC”.

Live checks and repairs now also require a running worker: without one, the controls aren't shown, `POST /api/runs` returns 503 and repair is unavailable, so nothing is queued that would never run.

## Public read-only demo — 11 October 2026

The documentation pages (About, Background, Case study, What's real, Limitations, Walkthroughs) and sample-data mode were removed from the app; their content moved to `docs/`. The home link now opens the DashDish workspace with no sign-in. Probed against the production build (`next build && next start`) with no session cookie:

| Request | Result |
|---|---|
| `/` | 307 → `/p/dashdish` |
| `/p/dashdish`, `/flows`, `/runs`, `/compare`, `/runs/run_hNpjuKUhRQ7V`, `/p/ledgerly`, `/operator` | 200 |
| `/p/dashdish/verify` | 307 → `/p/dashdish` |
| `/login`, `/about`, `/about/real`, `/about/limitations`, `/about/architecture`, `/case-study`, `/walkthroughs`, `/sample` | 404 |
| `POST /api/runs`, `/api/runs/:id/repair`, `/cancel`, `/explain`, `POST /api/projects/dashdish/neverbreak` | 401 |
| `GET /api/health`, `GET /api/projects/dashdish/commits` | 401 |
| `POST /api/runs` with `Origin: https://evil.example` | 403 |
| `POST /api/auth/login` cross-origin / wrong code | 303 → `/operator?error=origin` / `?error=invalid` |
| `GET /api/runs/run_hNpjuKUhRQ7V`, a frame artifact, `GET /api/projects/dashdish/showcase` | 200 |
| `GET /api/runs/run_doesnotexist` | 404 |

- The public run payload has `access: "public"`; all evidence bodies are the single “logs are private” notice; health is blanked. Neither the payload nor the rendered HTML of the run page, the Ledgerly workspace or the DashDish workspace contains TAP output, `npm ERR`, a server path, `PROOFLAYER_` or `sk-ant`, and none renders “Check it live” or a repair button.
- Run and repair counts were unchanged after the probe (48 runs, 8 repairs; newest run still from 10 October).
- In Chromium as a visitor: the replay plays to “Changes verified. Existing journeys protected.”; the run page shows “Recorded run · 10 Oct 2026”, the repair result, and no rerun or repair control; Protected Flows hides the settings. Signing in at `/operator` restores “Check it live”, Sign out and `/api/health` (200); signing out removes them again.
- No horizontal overflow on 8 public pages at 1440, 1280, 1024, 768 and 390 px; no page errors.
- `tsc`, `eslint`, 79/79 unit tests (including `tests/public-access.test.ts`), and `next build` pass. The build's file-tracing warning (the data directory could be traced into a deployment bundle) was fixed.

## Version six: the DashDish signature experience — 9–10 October 2026

Same machine (Linux, Node 22.22, Docker 29.8, headless Chromium 141). The live runs were started from the UI of the production build (`next build && next start`) with the worker and Docker running. Nothing below was simulated, and no outcome is stored in the interface: every state on screen is read from these runs.

### The three revisions, executed

The DashDish history was regenerated once during this version, after dish customization (size, add-ons) was added to the app and to both browser journeys. The runs below are on the final history; the first history (`e5a9822`, `f812ee4`, `c57b122`) is kept locally on `legacy-v1` so its earlier runs stay reproducible, and behaved identically (A passed, B failed at the same assertion, the prepared fix repaired it three times).

| Run | Commit | Result |
|---|---|---|
| run_JhO1VOli1qxL | A `0c4e1f8` | **Passed** in 47 s. 4 tests, lint, types, build exit 0. Chromium regular checkout (with a Large pizza and extra cheese) reached “Order confirmed” |
| run_f5x77LADlNfm, run_hNpjuKUhRQ7V | B `9b70678` | **Failed** both times, at tests only: “completes a regular checkout” expected 'Order confirmed', received 'Choose a delivery time' (1 failing, 5 passing). In Chromium: scheduled checkout reached “Order scheduled”; regular checkout ended on “Choose a delivery time”, located in the DOM and ringed on the frame. 10 frames recorded, including the dish customization screen |
| run_yeShHEU1VkqA | C applied as repair `e34e22a` | **Passed** in 43 s: 6 tests, both journeys reached their expected screens. 5 protected flows plus the change's 3 new checks (“schedules an order for tomorrow”, “asks for a delivery window when scheduling”, the scheduled-checkout journey) |

### Repair, live from the button

| Repair | Source run | Attempt 1 | Outcome |
|---|---|---|---|
| rep_j5vHtguD1pzU | run_f5x77LADlNfm (dev server) | prepared fix → `8ff08e8`, run_XV86NQSHCqU7 passed | repaired |
| rep_Y8rYodlFbq3A | run_hNpjuKUhRQ7V (**Check it live** on the production build) | prepared fix → `e34e22a` on `neverbreak/repair-Y8rYodlFbq3A-1`, run_yeShHEU1VkqA passed | repaired; check 59 s, repair 51 s |

- The prepared fix lives on `prepared-fixes/scheduled-delivery` (`2341e46`, parent `9b70678`, author “Prepared reference fix”). The repair commit message and every screen say it was written in advance, not generated.
- `git diff main neverbreak/repair-Y8rYodlFbq3A-1`: one file, `src/lib/checkout.ts`, 2 lines. `main` still points at `9b70678`, the working tree is clean; nothing was merged or pushed.
- “Repaired” is decided in code (`lib/server/repair.ts › finish`): the attempt's new checks must match the source's passing new checks. The 3 earlier Ledgerly repairs were migrated to outcome `rolled-back`, and their headline now reads “Rolled back. Previous working version preserved.”
- Protected flows were relearned from run_JhO1VOli1qxL: 5 flows, including “Choose a size and add-ons”.
- Unit test: “tries a prepared targeted fix first, then a roll-back”.

### Infrastructure failure stays Incomplete

run_HQ0bQhVgjk8X (first-history A, `e5a9822`) ran while the Docker daemon was down after an environment restart. It was recorded **Incomplete**, not Failed, confirming the version-five classifier fix. Docker was restarted and A was rerun (run_rrruZdIYYLEO). The environment restarted a second time later with Docker down again; the daemon was restarted before any further run.

### Ledgerly still intact

run_ubtIGjC9XGNi (`1df91de`, after all DashDish changes): prepare, install, lint, types, build and the browser step passed; tests failed with exit 1, as before. The Ledgerly workspace, flows, compare and run pages render under the Graphite theme.

### Interface checks (browser automation)

| Check | Result |
|---|---|
| Replay | All 7 scenes reached in order; screenshots reviewed at 2–88 s. Scene 2 shows the recorded “Order confirmed” frame of the baseline, labelled with its commit; while building, the phone shows a labelled skeleton, never a fake screen. Total ≈ 84 s |
| Final line | “Changes verified. Existing journeys protected.” shown only for a repaired outcome or a passing change (logic in `lib/shared/showcase.ts › finalOf`) |
| Live | “Check it live” then “Attempt a safe repair” followed to the end on the production build; buttons disabled while a live run is active; no page errors |
| Preview iframe | The exact build of each run served from `/preview/<run>-<hmac>/` with a sandbox CSP; renders on the production server. On the dev server its `/_next` assets are blocked (documented) |
| Journey map | 5 stages with recorded frames (Menu shows the customization screen); checkout and confirmation broken on `9b70678`, new checks marked “New, not protected yet” |
| Evidence network | NeverBreak's panel draws the change flowing through lint and types, tests, build and Chromium into protected and new journeys; every node is a recorded check or journey state at that moment of the replay |
| Overflow | No horizontal page overflow on 16 pages × 1440, 1280, 1024, 768, 390 px |
| Keyboard | Skip link, navigation, hero actions, then the embedded app; scene controls have labels |
| Reduced motion | Replay still works; motion is removed (MotionConfig `reducedMotion="user"`, CSS animations off) |
| Static checks | `tsc` clean, `eslint` clean, 73/73 unit tests, `next build` succeeds |

### Not done

- No real food photography: image hosts were unreachable from the build environment. Original SVG illustrations are used and labelled in Limitations.
- No AI-generated repair: no API key. Revision C is a prepared reference fix.
- No usability testing with people.

## Version five: NeverBreak — 9 October 2026

Same machine (Linux, Node 22.22, Docker 29.8, headless Chromium 141). The final runs were started from the UI of the production build (`next build && next start`) with the worker and Docker running. Nothing below was simulated.

### Protected flows

| Check | Result |
|---|---|
| Learned automatically | 4 flows from the passing run of `9bc5d46`: the three leaf tests node:test reported as passing, plus the page opening in Chromium. The describe block "invoice totals" was correctly excluded as a group |
| Per-run results | Read from each run's recorded test output and browser step. `1df91de`: "Total due shows the right amount" failed with expected $108.00, actual $1.08; the other three passed. `0579999`: the page flow failed (no build) and the total flow failed |
| Edited-test warning | Both AI commits rewrote "adds tax to the subtotal" to expect `"108.00"`. NeverBreak flagged "Its test was edited" by comparing that test's body in git at `9bc5d46` and at the change |

### Safe repair: real sequences

| Source run | Trigger | Attempt 1: restore app code | Attempt 2: roll back | Outcome |
|---|---|---|---|---|
| run_mGFAq5Vkt3FM (`1df91de`) | manual (server call) | run_Fncy6FmLzlPw `535b544`: failed, "adds tax" expected '108.00', got 10800 | run_1IkMaBrcds7F `65b249f`: passed | Rolled back (now labelled so) |
| run_q6Na2uVtQGnx (`0579999`) | automatic, started by the worker | run_wwDGg050N6WM `6802f97`: failed | run_uJ1krhxOurqh `9ffd6a5`: passed | Rolled back (now labelled so) |
| run_EdOvSV48qHaz (`1df91de`) | **Attempt safe repair** button, production build | run_LoqUES186EzV `3b1d277`: failed | run_PqC6QxIJZPzZ `b074baf`: passed | Rolled back, 63 s end to end |

Each attempt is a real commit on `neverbreak/repair-<id>-<n>`, made through a private git index. After all of this, `main` still points at `1df91de` and the fixture's working tree has no changes. Attempt 1 fails for a real reason: restoring the code alone doesn't satisfy the test the agent had rewritten. The interface says that the passing repair is a roll-back, so the change itself isn't included.

### A bug this found, and the fix

The environment restarted with the Docker daemon down. The first repair's two attempt runs recorded lint, types, tests and build as **code failures**: the Docker CLI exits 1 (not 125) when it can't reach the daemon. The classifier now treats "Cannot connect to the Docker daemon" (and image-missing) output as an infrastructure error, so such runs become Incomplete, and a repair stops instead of continuing. The two invalid runs and their branches were deleted; the repair was rerun with Docker up.

### Other real runs

| Run | Commit | Result |
|---|---|---|
| run_ObtsD4OTUPSY | `9bc5d46` | Passed: "Everything that worked still works. All 4 protected flows passed." |
| run_eCewcGmeVokP | `9bc5d46` | Passed; captured mid-run for the live screenshot |

### Interface

| Check | Result |
|---|---|
| Navigation | Workspace, Protected Flows, Runs, Compare; quiet links to Background, About, Case study, What's real, Limitations |
| Layout QA | 17 pages × 5 widths (1440, 1280, 1024, 768, 390): no horizontal overflow |
| Keyboard | Skip link first; every stop on the Workspace has a visible focus ring |
| Static checks | `tsc` 0 errors · ESLint 0 problems · 72/72 unit tests (10 new, using real recorded TAP output) · production build OK |

### Not tested

- AI repair (not built; no API key).
- Repair on a GitHub repository (unsupported by design: read-only).
- The flow-first framing with real users.

---

## Version four: investigation workspace — 9 October 2026

Executed on the same machine (Linux, Node 22.22, Docker 29.8, headless Chromium 141). Three of the four runs below were started from the UI of the production build (`next build && next start`) with the worker and Docker sandbox running. Nothing below was simulated.

### Real runs

| Run | Commit | How it was started | Result |
|---|---|---|---|
| run_pnrzTmX6nxsF | `1df91de` | **Start a real verification** on the workspace home (development server), with the walkthrough | Failed at tests in 49 s. Captured live at every step change; then the reveal: verdict, “The total due is wrong.”, $108.00 vs $1.08, screenshot with the highlight on “Total due: $1.08” |
| run_IjLmJ0Amtw4x | `9bc5d46` | **Verify** page, production build | Passed in 40 s; “All 5 checks passed on this commit.”; screenshot shows “Total due: $108.00” |
| run_WhM9xCcCtZoB | `1df91de` | **Verify** page, production build, reduced motion | Failed at tests; found a bug: under reduced motion the staged reveal still delayed visibility (fixed: no staging when reduced motion is set) |
| run_mGFAq5Vkt3FM | `1df91de` | **Verify** page, production build, reduced motion, after the fix | Failed at tests; all evidence visible at once at completion. Screenshot SHA-256 `dfb5fee1…727bca` matches the stored file |

### Integrity checks

| Check | Result |
|---|---|
| Steps change only on recorded events | Live captures show each step moving only after the worker wrote it; browser frame reads “Not opened” until the snapshot step starts, then reports the browser log's own lines |
| Browser log streamed during the step | The snapshot step's log now reaches the database line by line (8 lines recorded for run_pnrzTmX6nxsF) |
| Proof reveal | Plays only when the page observed live → completed. Opening or refreshing a finished run shows everything immediately |
| Screenshot unaltered | Highlight is a separate SVG layer from measured coordinates (40, 314, 218×34) and can be switched off; “Full capture” shows the uncropped image |
| No fake overlay | Type-error run (`0579999`) shows “No screenshot for this run: No successful build to serve” and no highlight |
| Assistant | Five fixed prompts; answers labelled “From recorded evidence”, “From recorded evidence and git” or “Rule-based guidance”; no model call is made. “What changed” used the real diff: `src/lib/invoice.ts` +9 −5, `tests/invoice.test.ts` +1 −1 |
| Before and after | Defaults to the last pass (`9bc5d46`) against the latest failure (`1df91de`): both real screenshots, 1 check changed (tests), git diff showing the double cents-to-dollars conversion |
| Diff route | Requires a session and full 40-character SHAs; invalid SHA rejected |

### Interface

| Check | Result |
|---|---|
| Layout QA | 14 pages × 5 widths (1440, 1280, 1024, 768, 390): no horizontal overflow. One bug found and fixed: screen-reader text in the compact step row escaped its scroll area at 390 px |
| Responsive workspace | 1280+: three columns (timeline, app, findings). 768–1279: compact step row, app and findings. 390: findings, app, assistant, inspector |
| Keyboard | Skip link first; every stop has a visible focus ring; inspector tabs move with arrow keys; “Show log” opens the inspector at the failing step |
| Themes | Light (default), Graphite and System; step glyph contrast fixed in Graphite |
| Static checks | `tsc` 0 errors · ESLint 0 problems · 62/62 unit tests · production build OK |

### Not tested (in addition to the list at the end)

- The walkthrough and the assistant with real people.
- Screen-reader output of the staged reveal with real assistive technology.

---

## Version three: product-first UX — 9 October 2026

Executed on the production build (`next build && next start`) with the worker and Docker sandbox running. Nothing below was simulated.

### Real runs started from the new UI

| Run | Commit | How it was started | Result |
|---|---|---|---|
| run_BXaHMghWHxF8 | `1df91de` | One click on the overview's **Run verification** | Failed at tests in 38 s; studio showed it live, then the proof stage with the ring on "Total due: $1.08" |
| run_HgSbnWn4asiM | `9bc5d46` | Verify studio, commit selected, **Run verification** | Passed in 43 s; stage header "All 5 checks passed" |
| run_xXqpex91O8A4 | `0579999` | Guided demo | Failed at type check; stage showed "No screenshot: no successful build to serve" |

### Screenshot linkage

| Check | Result |
|---|---|
| Artifact belongs to its run | run_BXaHMghWHxF8 → art_Mb0QlFxEfnP4 at commit `1df91de`; run_HgSbnWn4asiM → art_xXXyTFAYEbM2 at `9bc5d46` |
| Served bytes match the recorded hash | SHA-256 of the HTTP response equals `run_artifacts.sha256` for both |
| Artifact requested under another run's id | 404 |
| DOM annotations | `1df91de`: received "$1.08" found in "Total due: $1.08" at (40, 314, 218×34); expected "$108.00" not found. `9bc5d46`: no failing assertion, nothing searched |
| Unit tests | Annotations round-trip; artifacts hidden from other users and other runs; old databases gain the `annotations` column |

### Interface

| Check | Result |
|---|---|
| Primary navigation | Overview, Verify, Run History, Compare each load the right page and set `aria-current` |
| About this prototype | What's real, Architecture, Case study, Walkthroughs, Sample data reachable from one link, with tabs |
| Guided demo | Advances on real state (live → proof), skippable by mouse and keyboard; "last recorded run" path labelled "Recorded evidence … Nothing is running now" |
| Command palette | Centred at 1440, 1280, 1024, 768 and 390 px (equal side gaps); focus in the combobox; arrows, Enter and Escape work |
| Layout QA | 13 pages × 5 widths: no horizontal overflow. Undersized click targets found and enlarged. Checkbox glyphs remain 16 px inside 36 px labels |
| Keyboard | Skip link first on every primary page; every tab stop has a visible focus ring; commit radios move with arrow keys and show a ring on the card |
| Bugs found by this QA and fixed | Highlight label overlapped page text; value tiles wrapped "$108.00" in narrow columns (moved to container queries); palette input drew a stray focus ring (global focus rule moved into the base layer); commit badges went stale after a run |
| Static checks | `tsc` 0 errors · ESLint 0 problems · 46/46 unit tests · production build OK |

---

## Redesign — 9 October 2026

Everything in this section was executed after the redesign, on the same machine (Linux, Node 22.22, Docker 29.8, headless Chromium 141 from the Playwright cache). Anything not executed is listed under **Not tested** at the end.

### Functionality preserved

| Check | Result |
|---|---|
| Runs recorded before the redesign | All 6 still open in the new workspace; their commits were kept on the `legacy-v1` branch with identical SHAs |
| Re-verify a pre-redesign commit (`74c8338`) | run_Vf991JMZ30yC: Failed at tests, as before; now also with parsed proof, a source excerpt and a snapshot |
| Pass through the redesigned UI (production build) | run_fxd8eD3hCBUm, `9bc5d46`: started by clicking "Verify again" on the overview; Passed in 31 s; snapshot image loaded (1200 px) |
| Fail through the redesigned UI (production build) | run_yr2HP6bf40aX, `1df91de`: Failed at tests; workspace showed expected `$108.00`, received `$1.08`; snapshot loaded |
| Type-error commit | run_gx2SbKWu87mR, `0579999`: Failed; three tabs (Type check, Tests, Build); type proof "number" vs "string" at `app/page.tsx:28` |
| Live view | run_iNmp3FAitajI captured mid-run: seal arcs, timeline and live output followed recorded state only |
| Static checks | `tsc` 0 errors; ESLint 0 problems; 44/44 unit tests; `next build` succeeds |

### New capabilities

| Capability | How it was verified |
|---|---|
| Assertion parsing and computed relation | Unit tests on node:test TAP and Jest/Vitest output; real output of every fixture failure |
| Source excerpts | Captured by the worker in real runs (for example `tests/invoice.test.ts` lines 12–18 at `1df91de`); traversal outside the workspace refused in unit tests; secrets in excerpts redacted |
| Browser snapshot | Real captures for every run with a passing build. Log for run_btOiHGwKY6jo: server answered HTTP 200 in 1.1 s, browser opened `/`, clicked "Show breakdown", saved 1200×760 PNG with its SHA-256. The image shows "Total due: $1.08". Commit `0579999` (build failed) recorded the step as skipped. No `pl-*` containers left afterwards |
| Snapshot isolation | From inside the snapshot container, an outbound request failed with `EAI_AGAIN`; the host reached the container on the internal network |
| Artifact access | Owner fetch returned 200 `image/png`; unauthenticated fetch returned 401 |
| Command palette | Ctrl+K opened it with focus in the combobox; typing "compare" and Enter navigated; Escape closed it |
| Tabs and accordion | Arrow keys moved between failing-check tabs and switched the evidence; Enter expanded a step and showed its log |
| Focus | 45 tab stops on a run page, skip link first, every stop with a visible focus outline |
| Mobile (390 px) | 12 pages measured with no horizontal page overflow (one bug found by this check, screen-reader text escaping scroll areas, was fixed first) |
| Themes | Graphite, paper and system render from the same tokens; screenshots in `docs/screenshots` |
| Honesty fixes found during review | A TypeScript-location regex could span lines in build output (fixed, tested); the diagnosis panel could claim a screenshot on sample data (now requires a stored artifact); sample data snapshot step marked as not run |

### Screenshots

The version-two screenshots were replaced by the version-three set in `docs/screenshots/`.

---

## First release — 8–9 October 2026

Recorded 8–9 October 2026 on the build machine (Linux, Node 22.22, Docker 29.8 with a locally assembled sandbox image). Everything below was executed; anything not executed is listed under **Not tested**.

## Environment audit

| Item | Finding |
|---|---|
| Node, git, Docker | Available. Docker daemon had to be started manually. |
| Container registries | Blocked by network policy. Sandbox image assembled from the host Node binary (`scripts/build-runner-image.sh` fallback). |
| npm registry | Reachable. |
| GitHub API | Reachable unauthenticated. No valid GitHub token available. |
| Anthropic API | Reachable. No API key available. |
| Supabase | Unreachable (blocked). SQLite used instead; Postgres migration written but not run. |

## Static checks

| Check | Result |
|---|---|
| `npm run typecheck` (tsc --noEmit) | Pass, 0 errors |
| `npm run lint` (ESLint 10 + typescript-eslint) | Pass, 0 problems |
| `npm test` (node --test) | 34 / 34 pass |
| `npm run build` (next build, production) | Pass |
| Secret scan of source and `.next/static` | No credentials found. The client bundle contains the variable *name* `ANTHROPIC_API_KEY` in help text only. |

## End-to-end runs (real execution)

All runs below were executed by the worker against the Ledgerly fixture and are stored in the database.

| Run | Commit | Verdict | What was recorded |
|---|---|---|---|
| run_ZxuFrC1n3BK5 | dab1526 | Passed | Started from the UI. Install, lint, tsc, 3 tests, next build all exit 0. 31 s. |
| run_w98STThsZAvp | f9312de | Failed | tsc exit 2 (3 × TS2345, first at app/page.tsx:21); tests exit 1; next build exit 1 "Failed to type check". |
| run_pxUoh0r8maYn | 74c8338 | Failed | tsc and build pass; tests exit 1: expected '$108.00', actual '$1.08'. |
| run_SgzyvTyh1eEo | 74c8338 | Cancelled | Cancel requested via API during `next build`; container killed; no `pl-*` containers left running. |
| run_TI2bNrQRsOgL | dab1526 | Incomplete | Sandbox image removed before the run; checks exited 125 and were classed as environment errors; verdict Incomplete, not Failed. Image restored afterwards. |
| run_SB6sMEtliSxz | 74c8338 | Failed | Queued while the worker was stopped: UI showed "No worker is running" and the run stayed queued; picked up and completed after the worker started. Same result as run_pxUoh0r8maYn (reproducible). |

## API and security probes

| Probe | Result |
|---|---|
| Queue the same commit twice | Second call returned the existing run (`deduplicated: true`) |
| POST /api/runs without a session | 401 `unauthenticated` |
| POST /api/runs with a foreign Origin header | 403 `cross_origin` |
| Unknown SHA / malformed ref | 404 `not_found` / `Invalid ref.` |
| GET /api/runs/{unknown} | 404 |
| Wrong access code | Redirect to `/login?error=invalid` |
| Explain request with no API key | 503 `ai_not_configured`; UI states no explanation was generated |
| AI service with an invalid key | Real HTTP 401 from the Anthropic API, reported as "The API key was rejected" |
| Another user's project/run (unit test) | Not returned; cancel returns not_found; createRun throws |
| Security headers | X-Frame-Options DENY, nosniff, strict referrer policy, no X-Powered-By |

## GitHub provider (public repository, no token)

`octocat/Hello-World`: repository metadata, branches, commit list, short-SHA resolution and tarball export into a workspace all succeeded. A non-allowlisted repository was refused. A further call hit GitHub's unauthenticated rate limit and was reported as such.

## Interface checks (headless Chromium via Playwright)

| Check | Result |
|---|---|
| Pages: overview, live run, results, history, compare, sample run, about, case study, walkthroughs, login | Rendered with no console errors or page errors |
| Live view | Screenshots mid-run show completed steps, the running step and pending steps matching the worker's recorded state |
| Mobile (390 px) | Measured on 9 pages: no horizontal page overflow (three overflow bugs found by this check were fixed first) |
| Dark mode | Run page and walkthroughs rendered with dark tokens |
| Keyboard | Skip link is the first tab stop; every interactive element on the overview is reachable in order with a visible focus outline; Enter on a step selects it and sets `aria-current` |
| Reduced motion | Tested with `reduced_motion=reduce`; animations are disabled by CSS |

## Not tested (both releases)

- A successful AI explanation (no API key).
- The redesign with real people; every layout decision is a hypothesis.
- Browser snapshots on a worker without the Playwright Chromium build used here.
- GitHub with a token, a private repository, or a full verification run of a GitHub repository.
- Supabase migration and RLS policies (never executed).
- Any hosted deployment.
- Screen-reader output with real assistive technology, and usability with real people.
- Concurrent workers (the design supports one; claiming is atomic but multi-worker operation was not exercised).
