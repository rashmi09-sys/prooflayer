# Deployment

ProofLayer is deployed in two separate shapes. They share code, never data or credentials.

| | Public demo (Vercel) | Private operator installation |
|---|---|---|
| Mode | `PROOFLAYER_PUBLIC_DEMO=true` (the default on Vercel) | `PROOFLAYER_PUBLIC_DEMO=false` (the default elsewhere) |
| Data | `.demo-snapshot/`, built during the build from the committed recorded package, opened read-only | `.data/`: SQLite, artifacts, fixture git repositories |
| Visitors | Anonymous, read-only | Anonymous read-only view, plus one operator who signs in at `/operator` |
| Worker, Docker, git | None, by construction | Required for live verification and repairs |
| Secrets | None configured. Operator credentials and API keys are ignored in this mode even if set | Access code and session secret; optionally Anthropic and GitHub keys |

## How the public build works

`vercel.json` runs `npm ci`, then `npm run build:public`, which does three things:

1. **`npm run demo:init`** (private mode, during the build only). It creates the fixture git repositories with `git`, registers the projects, and imports `demo/recorded/dashdish`. The import refuses any file whose SHA-256 doesn't match the package manifest.
2. **`npm run demo:snapshot`** writes `.demo-snapshot/` (`scripts/build-snapshot.ts`). The snapshot holds:
   - the DashDish project and its three recorded runs, and nothing else
   - the runs' Chromium frames and kept static builds
   - the fixture repository recorded as JSON (branches, commits, every pairwise diff, changed files), so no git is needed at runtime
   - a SHA-256 manifest

   The database uses a rollback journal and is opened read-only.
3. **`PROOFLAYER_PUBLIC_DEMO=true next build`** bundles `.demo-snapshot/` with the server functions (`outputFileTracingIncludes`). `.data/`, `.env*`, `fixtures/` and `demo/` are excluded.

At runtime the deployment needs:
- **No** Docker, worker, git, environment variables or writable storage.
- **No** operator sign-in, because none exists.

All pages are server-rendered on request from the read-only snapshot.

## Deploy with the Vercel CLI

You need Node.js ≥ 22.18, git and a Vercel account.

```bash
npm i -g vercel
vercel login

cd prooflayer
git status                   # deploy a clean, committed tree
vercel link                  # create or link the Vercel project (framework: Next.js)
vercel env add PROOFLAYER_PUBLIC_DEMO production   # enter: true   (explicit; it is also the default on Vercel)
vercel deploy --prod
```

`.vercelignore` keeps these out of the upload:
- `.env*` files, apart from the example file
- `.data/`, `.demo-snapshot/` and `.next/`
- `node_modules` and fixture build output

The build recreates the snapshot from committed files only.

## Or: deploy from GitHub

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repository. Leave the framework as Next.js; `vercel.json` sets the install and build commands.
3. Under **Environment Variables**, optionally add `PROOFLAYER_PUBLIC_DEMO` = `true` for Production and Preview.
4. Under **Settings → General → Node.js Version**, choose 22.x or newer.
5. Deploy.

## Public environment configuration

| Variable | Value | Notes |
|---|---|---|
| `PROOFLAYER_PUBLIC_DEMO` | `true`, or unset | Unset already means public on Vercel. Never set it to `false` on Vercel. |
| *everything else* | **do not set** | The public demo ignores `PROOFLAYER_ACCESS_CODE`, `PROOFLAYER_SESSION_SECRET`, `ANTHROPIC_API_KEY` and `PROOFLAYER_GITHUB_*`. Don't add them anyway. Don't set `PROOFLAYER_DATA_DIR`, which would point the app away from the bundled snapshot. |

## After deploying

Run the HTTP security checks against the real URL. They make only read-only and refused requests.

```bash
node scripts/security-smoke.mjs https://<your-deployment>.vercel.app
```

Expected result: `42/42 checks passed`. Then open the URL and run the demo once:
1. With NeverBreak OFF, submit the prefilled request. It should end on "Scheduled delivery was added, but regular checkout broke."
2. Press **Same request with NeverBreak ON**. It should end on "Scheduled delivery works. Regular checkout still works."

## Preview the exact public build locally

```bash
npm ci
npm run build:public
npm run start:public          # http://localhost:3000, public read-only mode
node scripts/security-smoke.mjs http://localhost:3000
```

## Private operator installation (live verification)

On your own machine, never on Vercel. You need Docker and Chromium (`npx playwright install chromium`).

```bash
cp .env.example .env.local
# Set PROOFLAYER_ACCESS_CODE (≥ 12 characters) and PROOFLAYER_SESSION_SECRET (openssl rand -hex 32)
npm ci
npm run setup                 # fixture repositories, projects, sandbox image
npm run build && npm start    # http://localhost:3000
npm run worker                # second terminal
```

Sign in at `/operator`. The worker refuses to start in public-demo mode. For hardening:
- Don't run a fixture app's own server (`next dev` or `next start` in `fixtures/`) on a public or untrusted network. The fixtures are pinned to Next.js 16.4.0, which has known advisories; see [SECURITY_AUDIT.md](SECURITY_AUDIT.md#fixture-dependency-advisories-25-november-2026).
- Run the worker as an unprivileged user, so Chromium keeps its own sandbox.
- Don't expose the operator installation to the internet.

## Rollback

Prefer rolling forward: fix on `main` and redeploy.

If a rollback is needed, Vercel keeps earlier deployments (**Deployments → Promote to Production**, or `vercel rollback`). Only promote a deployment built on or after 24 November 2026, when the root application was upgraded to Next.js 16.4.6 (commit `1638106` in this repository). Deployments built before that use Next.js 16.4.0, which has published security advisories, and should not be restored. Three such deployments, from 11, 12 and 23 October 2026, still exist in the Vercel project; consider deleting them.

The public deployment serves an immutable snapshot built into it and writes nothing at runtime, so a rollback has no data to migrate.
