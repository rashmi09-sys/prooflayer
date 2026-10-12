#!/usr/bin/env bash
# Creates the Ledgerly demo repository: a real git repo with three commits.
#   A  passing baseline
#   B  refactor that introduces a genuine TypeScript error (and a test failure)
#   C  "AI fix" that silences the type error but ships a wrong total (test fails)
# Output: $PROOFLAYER_DATA_DIR/repos/ledgerly (default ./.data/repos/ledgerly)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fixtures/ledgerly"
DATA="${PROOFLAYER_DATA_DIR:-$ROOT/.data}"
DEST="$DATA/repos/ledgerly"

if [ -d "$DEST/.git" ] && [ "${1:-}" != "--force" ]; then
  echo "Fixture already exists at $DEST (use --force to recreate)"; exit 0
fi
rm -rf "$DEST"; mkdir -p "$DEST"

export GIT_AUTHOR_NAME="Ledgerly Agent" GIT_AUTHOR_EMAIL="agent@ledgerly.example"
export GIT_COMMITTER_NAME="Ledgerly Agent" GIT_COMMITTER_EMAIL="agent@ledgerly.example"
g() { git -C "$DEST" -c commit.gpgsign=false -c init.defaultBranch=main "$@"; }

g init -q

# legacy-v1: the original three commits (first ProofLayer release). Same
# content and dates as before, so the same SHAs, keeping old runs reproducible.
legacy() {
  local msg="$1" date="$2"
  g add -A
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" g commit -q -m "$msg"
}
g checkout -q -b legacy-v1
tar -C "$SRC/base" --exclude=node_modules --exclude=.next --exclude=next-env.d.ts -cf - . | tar -C "$DEST" -xf -
mv "$DEST/gitignore" "$DEST/.gitignore"  # stored without the dot so deploy tools keep it (see create-dashdish.sh)
cp -R "$SRC/legacy-v1/." "$DEST/"
legacy "Initial invoice page with tax-inclusive totals" "2026-10-06T10:00:00+05:30"
cp -R "$SRC/rev-b/." "$DEST/"
legacy "refactor: return invoice totals as decimal strings for the billing API" "2026-10-07T14:20:00+05:30"
cp -R "$SRC/rev-c/." "$DEST/"
legacy "fix: formatCurrency accepts decimal string totals (resolves type error)" "2026-10-07T15:05:00+05:30"

# main: current fixture, with a "Show breakdown" disclosure for the browser snapshot.
g checkout -q --orphan main
g rm -rqf . >/dev/null
tar -C "$SRC/base" --exclude=node_modules --exclude=.next --exclude=next-env.d.ts -cf - . | tar -C "$DEST" -xf -
mv "$DEST/gitignore" "$DEST/.gitignore"  # stored without the dot so deploy tools keep it (see create-dashdish.sh)
g add -A
GIT_AUTHOR_DATE="2026-10-06T10:00:00+05:30" GIT_COMMITTER_DATE="2026-10-06T10:00:00+05:30" \
  g commit -q -m "Initial invoice page with tax-inclusive totals"

cp -R "$SRC/rev-b/." "$DEST/"
g add -A
GIT_AUTHOR_DATE="2026-10-07T14:20:00+05:30" GIT_COMMITTER_DATE="2026-10-07T14:20:00+05:30" \
  g commit -q -m "refactor: return invoice totals as decimal strings for the billing API"

cp -R "$SRC/rev-c/." "$DEST/"
g add -A
GIT_AUTHOR_DATE="2026-10-07T15:05:00+05:30" GIT_COMMITTER_DATE="2026-10-07T15:05:00+05:30" \
  g commit -q -m "fix: formatCurrency accepts decimal string totals (resolves type error)"

g log --oneline main; echo "legacy-v1:"; g log --oneline legacy-v1
