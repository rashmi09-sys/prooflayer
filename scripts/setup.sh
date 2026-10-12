#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] && set -a && . ./.env.local && set +a
bash scripts/create-fixture.sh
bash scripts/create-dashdish.sh
# Register the projects before anything that needs Docker, so the workspace
# exists even if the Docker daemon isn't running yet.
node --disable-warning=ExperimentalWarning scripts/seed.ts
bash scripts/build-runner-image.sh
