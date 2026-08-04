#!/usr/bin/env bash
# =============================================================================
# Point the CI test-database secrets at the DEV branch.
#
# RUN THIS YOURSELF — it needs `gh auth login`, and it moves database passwords
# to GitHub. Nothing is echoed: values are read from .env and piped to `gh` on
# stdin, so they never appear in your shell history, in `ps`, or in the output.
#
# Companion to the 2026-08-03 decision to run the DB suites against dev (see
# CLAUDE.md). The code side is already done — db-guard.ts reads
# EDURA_ALLOW_DB_ENVS, and ci.yml appends `EDURA_ALLOW_DB_ENVS=dev` when it
# materialises .env.test. These three secrets are the only remaining step.
#
#   bash packages/database/scripts/point-ci-secrets-at-dev.sh
#
# WHICH ROLE GOES WHERE, and why it is not arbitrary:
#   TEST_DATABASE_URL -> DATABASE_URL  (edura_app, pooled)   the RUNTIME role.
#       It must be the NOBYPASSRLS one or rbac-isolation and every RLS proof
#       silently stops proving anything — they would pass against a role that
#       cannot be blocked.
#   TEST_DIRECT_URL   -> DIRECT_URL    (owner, unpooled)     migrations.
#   TEST_ADMIN_URL    -> ADMIN_URL     (owner, pooled)       test-cleanup, which
#       needs ownership because the money ledgers have DELETE revoked from
#       edura_app by design.
#
# WORTH KNOWING BEFORE YOU RUN IT: this gives CI write access to the database
# you demo from. Repo secrets are not exposed to fork pull requests, but anyone
# who can push a workflow to this repo can read them. That was already true of
# the old test branch; it matters slightly more now that the target holds your
# preview data.
# =============================================================================
set -euo pipefail

REPO="${REPO:-ALiAbdelhadi/edura}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/.env}"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not logged in. Run: gh auth login"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "No env file at $ENV_FILE (override with ENV_FILE=...)"; exit 1; }

# Read a KEY=value from the env file, stripping surrounding quotes. Never echoed.
read_val() {
  local key="$1"
  sed -n -E "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" \
    | head -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# Refuse to ship anything but a dev-labelled database, so a stray production
# string in .env cannot become CI's test target. Same posture as db-guard.
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
