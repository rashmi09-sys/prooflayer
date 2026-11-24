# Current Scope & Technical Boundaries

What ProofLayer verifies today, how, and where its guarantees stop.

## Supported verification

- **Scenario.** One controlled request is demonstrated end to end: "Add scheduled food delivery for tomorrow" on the DashDish fixture. Requests are matched by a deterministic rule set (`lib/shared/intent.ts`); other requests are declined. Nothing is generated from the prompt.
- **Repositories.** Only server-allowlisted repositories: the two bundled fixtures, DashDish and Ledgerly, as local git repositories, and optionally one GitHub repository configured by the operator. Arbitrary third-party code is not accepted. The GitHub provider is read-only, and a full verification run of a GitHub repository has not been tested.
- **Project shape.** Node projects with a `package-lock.json` that lists only npm-registry packages. Test runners: `node --test`, `vitest`, `jest`. Build: `next build`.
- **Install scripts are disabled** by design, so packages that need them will not install.
- **Customer journeys** are defined on the server for each fixture; a repository cannot choose what the browser does. DashDish has scripted checkout journeys; Ledgerly gets a single page check.
- **Protected flows** are the tests that passed on the last passing run, the page opening, and (for DashDish) the journeys that reached their expected screen. NeverBreak does not invent flows, and it cannot see behaviour that no test or journey covers.

## Execution model

- **Live verification is private.** It runs on an operator's own machine with the worker and Docker, and was tested on one machine. It is not hosted.
- **The public demo is a replay.** The Vercel deployment serves an immutable snapshot of runs recorded on 10 October 2026. It has no worker, Docker, git or sign-in. `npm run demo:init` imports the same recorded runs locally: they are genuine, but they were not executed on your machine, and the interface labels them "Recorded demonstration". The recorded package covers DashDish only.
- **Dependency installation runs on the worker host,** not in a container, under a restricted policy. See residual risk 3 in the [security audit](SECURITY_AUDIT.md#residual-risks).
- **Single operator.** One account behind an access code, not an identity provider. One run executes at a time, and the live view polls once a second. There is no multi-tenant isolation.
- **Storage** is SQLite on the worker host.
- **The interactive preview** needs the production server (`npm run build && npm start`); the Next.js dev server blocks its assets.

## Evidence guarantees

- **Passed** means the five required checks (install, lint, type check, tests, build) exited 0 on that exact commit. It is not proof that the application is free of defects, secure or ready for production.
- **Incomplete** means a required check could not be completed (infrastructure error, timeout, resource limit, skipped). It says nothing about the code.
- A previously passing revision is only known to pass the checks that actually ran on it.
- **Screenshots are informational.** The page capture and its highlight never change a run verdict. The highlight appears only when the failing assertion's exact value is found in the rendered page.
- **Journey outcomes** feed NeverBreak's per-flow results, not the run verdict. See [ARCHITECTURE.md](ARCHITECTURE.md#what-each-kind-of-evidence-decides).
- **Structured evidence** (expected versus received, type mismatches, lint locations) covers `node:test`, Jest and Vitest-style assertions, TypeScript and ESLint. Other failures fall back to the last lines of output.
- **AI explanations** are optional, private-mode only and stored separately from verdicts. Prompt fencing, redaction and output validation are unit tested, and the missing-key and rejected-key paths were exercised. A successful model response has not been generated, so the quality of an explanation is unvalidated.

## Controlled repair

- **No fix is generated.** The DashDish repair that keeps scheduled delivery is a patch written in advance, kept on a `prepared-fixes/` branch and labelled as such. NeverBreak applies and verifies it; it did not write it.
- **Without a prepared fix,** repair restores the touched code or rolls back the whole change. That removes the new feature and is reported as a roll-back, not a repair.
- **At most two attempts,** each a commit on an isolated `neverbreak/repair-*` branch, each verified as a normal run. Nothing is merged, pushed or deployed.
- **Local fixtures only.** Repair is not available for a GitHub repository.
- **The demo change is prepared too.** The DashDish request is scripted, and its commits were written for the demonstration to stand in for an agent's work.

## Evaluation

- No external user testing has been carried out; the interface design is untested with users.
- The fixtures are fictional. Food images in DashDish are original SVG illustrations, not photographs.

## Future work

Not built:

- AI-written repair.
- Hosted live verification (the worker needs a host with Docker).
- Multiple users and an identity provider.
- Postgres storage. A Supabase migration with Row Level Security is written in `db/supabase/` but has never been applied or tested.
- A stronger sandbox runtime (gVisor class) and concurrent workers.
