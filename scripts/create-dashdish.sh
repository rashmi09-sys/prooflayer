#!/usr/bin/env bash
# Creates the DashDish demo repository: a real git repo for the NeverBreak story.
#   main  A  working food ordering app (cart, coupon, regular checkout)
#         B  an AI agent's change: scheduled delivery for tomorrow, which also
#            breaks regular checkout (every order now needs a delivery window)
#   prepared-fixes/scheduled-delivery
#         C  a targeted fix written in advance for this demo: only scheduled
#            orders need a window. NeverBreak applies it as a candidate patch
#            and verifies it; it is labelled as prepared, never as generated.
# Output: $PROOFLAYER_DATA_DIR/repos/dashdish (default ./.data/repos/dashdish)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fixtures/dashdish"
DATA="${PROOFLAYER_DATA_DIR:-$ROOT/.data}"
DEST="$DATA/repos/dashdish"

if [ -d "$DEST/.git" ] && [ "${1:-}" != "--force" ]; then
  echo "Fixture already exists at $DEST (use --force to recreate)"; exit 0
fi
rm -rf "$DEST"; mkdir -p "$DEST"
g() { git -C "$DEST" -c commit.gpgsign=false -c init.defaultBranch=main "$@"; }
commit() {
  local who="$1" email="$2" date="$3" msg="$4"
  g add -A
  GIT_AUTHOR_NAME="$who" GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_NAME="$who" GIT_COMMITTER_EMAIL="$email" \
    GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" g commit -q -m "$msg"
}

g init -q
# The fixture's ignore rules are stored as "gitignore" (no dot) and restored here:
# deploy tools such as the Vercel CLI never upload files named .gitignore, and a
# missing file would change the tree, so every commit ID, and the recorded
# evidence (which is pinned to those IDs) would no longer match.
tar -C "$SRC/base" --exclude=node_modules --exclude=.next --exclude=out --exclude=next-env.d.ts -cf - . | tar -C "$DEST" -xf -
mv "$DEST/gitignore" "$DEST/.gitignore"
commit "DashDish Team" "team@dashdish.example" "2026-10-05T11:00:00+05:30" "DashDish: restaurants, menu, cart and checkout"

cp -R "$SRC/rev-b/." "$DEST/"
commit "DashDish Agent" "agent@dashdish.example" "2026-10-08T16:40:00+05:30" "feat: let customers schedule delivery for tomorrow"

g checkout -q -b prepared-fixes/scheduled-delivery
cp -R "$SRC/prepared-fix/." "$DEST/"
commit "Prepared reference fix" "fixes@prooflayer.example" "2026-10-08T17:05:00+05:30" "fix: only require a delivery window for scheduled orders"
g checkout -q main

g log --oneline main; echo "prepared-fixes/scheduled-delivery:"; g log --oneline -1 prepared-fixes/scheduled-delivery

# The recorded evidence (demo/recorded/dashdish) refers to exactly these commits.
for pair in "main~1 0c4e1f8a15880849c720cb334a76378f059f5875" "main 9b70678fe46d1276a070aa691fb59744eb041e65" "prepared-fixes/scheduled-delivery 2341e46d6d3516f5169e0dc7edd908e2e9bc2d98"; do
  set -- $pair
  got="$(g rev-parse "$1")"
  if [ "$got" != "$2" ]; then
    echo "DashDish fixture history does not match the recorded evidence: $1 is $got, expected $2." >&2
    echo "Some fixture file was missing or changed when this copy was made (fixtures/dashdish)." >&2
    exit 1
  fi
done
