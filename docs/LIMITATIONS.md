# Limitations

What ProofLayer does not do, stated plainly.

## What a verdict means

-   Passed means the configured checks exited 0 on that exact commit. It is not proof the app is free of bugs, secure, or ready for production.
-   A previously passing revision is only known to pass the checks that actually ran on it.
-   The browser snapshot shows what one page rendered after one click. It is evidence, never a test result, and never changes a verdict.

## What can be verified

-   Only server-allowlisted repositories: the Ledgerly demo repository, or one GitHub repository configured by the operator. Arbitrary third-party code is not accepted.
-   Node projects with a package-lock.json. Test runners: node --test, vitest, jest. Build: next build.
-   Install scripts are disabled by design, so packages that need them will not install.
-   Structured evidence (expected vs received, type mismatch, lint locations) covers node:test, Jest/Vitest-style assertions, TypeScript and ESLint. Other failures fall back to the last lines of output.
-   The page-value highlight only appears when the assertion's exact value text is found in the rendered page.
-   Protected flows are the tests that passed, the page opening, and (for DashDish) the Chromium journeys that passed. NeverBreak doesn't invent flows the test suite doesn't cover, and it can't see behaviour no test checks.

## What isn't built yet

-   Live verification is not hosted. The public demo (Vercel) is read-only: it replays the recorded runs from an immutable snapshot and has no worker, Docker, git or sign-in. Live checks and repairs run only on a private machine with the worker and Docker, and were tested on one machine.
-   There is no AI repair. The DashDish fix that keeps scheduled delivery is a prepared patch written in advance, kept on a prepared-fixes branch and labelled as such; NeverBreak applies and verifies it but did not write it. Without a prepared fix, repair restores or rolls back code known to have passed, which undoes the change and is reported as a roll-back. Repairs only work on the local demo repositories; a GitHub repository is read-only.
-   The DashDish agent request is scripted and its commits were written for the demo. Food images are original SVG illustrations, not photographs: no licensed photo source was reachable from the build environment.
-   Customer journeys are defined on the server for each demo app; a repository can't choose what the browser does. Other apps get the single page check.
-   The interactive phone preview needs the production server (npm run build && npm start); the Next.js dev server blocks its assets.
-   SQLite on the worker host; the Supabase migration with Row Level Security is written but has never been executed.
-   One operator account behind an access code, not a full identity provider. One run executes at a time; the live view polls once a second.
-   AI explanations have only been tested for their failure states: no API key was available, so no real model response has been generated.
-   No usability testing with real people. Every design decision in the case study is labelled as a hypothesis.

## The recorded demonstration

- `npm run demo:init` imports runs recorded on another machine. They are real, but they were not executed on yours; the interface labels them “Recorded demonstration”, and their logs, frames and builds are exactly what that worker recorded.
- The package covers DashDish only. Ledgerly has no recorded runs until you run checks yourself with Docker.
