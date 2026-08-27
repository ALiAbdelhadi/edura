#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-ALiAbdelhadi/edura}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/.env}"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not logged in. Run: gh auth login"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "No env file at $ENV_FILE (override with ENV_FILE=...)"; exit 1; }

read_val() {
  local key="$1"
  sed -n -E "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" \
    | head -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

guard_is_dev() {
  local url="$1"
  ADMIN_URL="$url" DIRECT_URL="$url" DATABASE_URL="$url" \
    bunx tsx "$(dirname "${BASH_SOURCE[0]}")/db-guard.ts" dev >/dev/null 2>&1
}

set_secret() {
  local name="$1" value="$2"
  if [ -z "$value" ]; then echo "  SKIP $name — not found in $ENV_FILE"; return 1; fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  set  $name  (${#value} chars, value not shown)"
}

DB="$(read_val DATABASE_URL)"
DIRECT="$(read_val DIRECT_URL)"
ADMIN="$(read_val ADMIN_URL)"

echo "Checking the target is a dev-labelled database..."
if ! guard_is_dev "${ADMIN:-$DIRECT}"; then
  echo "REFUSING: $ENV_FILE does not point at a database labelled 'edura-env:dev'."
  echo "Nothing was sent to GitHub."
  exit 1
fi
echo "  ok — dev-labelled."

echo "Setting secrets on $REPO:"
set_secret TEST_DATABASE_URL "$DB"
set_secret TEST_DIRECT_URL   "$DIRECT"
set_secret TEST_ADMIN_URL    "$ADMIN"

echo
echo "Done. Re-run CI on main (or: gh workflow run CI --repo $REPO --ref main)."
echo "When CI goes green, Deploy runs on its own and ships the backlog."
