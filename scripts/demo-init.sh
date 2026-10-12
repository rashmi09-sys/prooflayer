#!/usr/bin/env bash
# Sets up the recorded demonstration on a machine without Docker:
# creates the demo fixture repositories with git, registers the projects, and
# imports the genuine recorded DashDish story (demo/recorded/dashdish).
# Live checks and repairs stay off until a worker with Docker is running.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] && set -a && . ./.env.local && set +a
# Creating the recorded data is a private-mode operation, also during a public (Vercel) build.
export PROOFLAYER_PUBLIC_DEMO=false
command -v git >/dev/null || { echo "git is required (macOS: xcode-select --install)."; exit 1; }
bash scripts/create-fixture.sh
bash scripts/create-dashdish.sh
node --disable-warning=ExperimentalWarning scripts/seed.ts
node --disable-warning=ExperimentalWarning scripts/import-recorded.ts demo/recorded/dashdish
