#!/usr/bin/env bash
#
# Source this to get the environment a load-test server runs with.
#
#   . tests/load/lib/env.sh erp          # or: superadmin
#
# WHY THIS IS NOT JUST `--env-file=.env.test`
#
#   `next start` runs with NODE_ENV=production and reads `.env.local` on its own,
#   and Bun injects the CWD's `.env.local` as well. In this repo `.env.local`
#   points at the Neon DEV branch. Neither loader overrides a variable that is
#   already set, so the only reliable way to keep a load run off Neon is to
#   export EVERY key either file names before the server starts -- a key that is
#   merely absent here would be filled in from `.env.local`.
#
#   So: every key in the app's `.env.local` and `.env.test` is exported, taking
#   its value from `.env.test` and an EMPTY string when `.env.test` has none.
#   Then DATABASE_URL is re-pointed at the load database and asserted to be
#   localhost. The script aborts rather than continue on any doubt.
#
# Nothing here is written to disk and nothing in the app is edited.

_app="${1:?usage: . tests/load/lib/env.sh <erp|superadmin>}"
_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../.." && pwd)"
_dir="$_root/apps/$_app"
_db="${EDURA_LOAD_DB:-edura_load}"

[ -f "$_dir/.env.test" ] || { echo "env.sh: $_dir/.env.test missing" >&2; return 1 2>/dev/null || exit 1; }

# 1. every key either file knows about -> exported empty
for _f in "$_dir/.env.local" "$_dir/.env.test"; do
  [ -f "$_f" ] || continue
  while IFS= read -r _k; do
    [ -n "$_k" ] && export "$_k="
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$_f" | cut -d= -f1)
done

# 2. values from .env.test (grep/cut, never `source`: the URLs carry unquoted `&`)
while IFS= read -r _line; do
  _k="${_line%%=*}"
  _v="${_line#*=}"
  _v="${_v%\"}"; _v="${_v#\"}"; _v="${_v%\'}"; _v="${_v#\'}"
  export "$_k=$_v"
done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$_dir/.env.test")

# 3. the load database, on localhost, as the NOBYPASSRLS app role
case "$DATABASE_URL" in
  postgresql://*@localhost:*|postgresql://*@127.0.0.1:*|postgres://*@localhost:*) ;;
  *) echo "env.sh: .env.test DATABASE_URL is not localhost -- run 'bun run db:local:env' first. Refusing." >&2
     return 1 2>/dev/null || exit 1 ;;
esac
export DATABASE_URL="${DATABASE_URL%/*}/$_db"
export DATABASE_DRIVER=pg
export EDURA_ENV=test
unset DIRECT_URL ADMIN_URL

# 4. load-run knobs. All of these are ENV, for this process only.
export NODE_ENV=production
export DATABASE_POOL_MAX="${LOAD_POOL_MAX:-${DATABASE_POOL_MAX:-10}}"
# Single long-lived local instance, no Redis: the documented escape hatch.
export REDIS_URL=""
export ALLOW_UNSHARED_RATE_LIMIT=1
# k6 sends one X-Forwarded-For per virtual user; with one trusted hop the limiter
# sees each VU as its own client, which is what a real crowd looks like.
export TRUSTED_PROXY_HOPS=1
export TRUSTED_CLIENT_IP_HEADER=""
export PAYMENTS_MODE=mock WHATSAPP_MODE=mock MAIL_PROVIDER=console
export NEXT_TELEMETRY_DISABLED=1

if [ "$_app" = "erp" ]; then
  export PORT=3003
  export NEXTAUTH_URL="http://localhost:3003" APP_BASE_URL="http://localhost:3003"
  export SUPERADMIN_BASE_URL="http://localhost:3006"
else
  export PORT=3006
  export NEXTAUTH_URL="http://localhost:3006" APP_BASE_URL="http://localhost:3006"
  export ERP_BASE_URL="http://localhost:3003"
fi

echo "[load-env] app=$_app db=${DATABASE_URL##*@} pool=$DATABASE_POOL_MAX" >&2
unset _app _root _dir _db _f _k _v _line
