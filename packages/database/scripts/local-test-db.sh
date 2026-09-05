#!/usr/bin/env bash
#
# Build (or rebuild) a LOCAL test database for the DB suites.
#
# Why this exists: the suites used to run against the Neon `test` branch, and
# every query was a round-trip to eu-central-1. Measured 2026-09-06, the erp
# suites took 3686s (mean 104s per suite) while the 1490 unit assertions, which
# touch no database, took 2.7s. The work is not the bottleneck; the wire is.
#
# This mirrors what CI already does (.github/workflows/ci.yml, "Label the
# throwaway database and create the app role") so local and CI prove the same
# thing against the same shape:
#
#   * the database carries the `edura-env:test` label `db-guard` keys on --
#     WITHOUT it every suite refuses to run, which is the point: a suite must
#     never be able to reach a database nobody labelled;
#   * `edura_app` is NOBYPASSRLS, so RLS is actually enforced, exactly as in
#     every other environment;
#   * `bootstrap-app-role` runs BEFORE any table exists, because on a populated
#     schema its `GRANT ... ON ALL TABLES` would re-grant the UPDATE/DELETE that
#     migration 00000000000003 revokes on the append-only ledger. The script
#     refuses in that case; this ordering is why it never has to.
#
# Idempotent: safe to re-run. `--reset` drops and rebuilds from nothing.
set -euo pipefail

DB="${EDURA_LOCAL_DB:-edura_test}"
APP_PW="${EDURA_LOCAL_APP_PW:-app_pw_local}"
HOST="${EDURA_LOCAL_HOST:-localhost}"
PORT="${EDURA_LOCAL_PORT:-5432}"
SUPER="${EDURA_LOCAL_SUPERUSER:-$(whoami)}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql_super() { psql -h "$HOST" -p "$PORT" -U "$SUPER" -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }

if ! pg_isready -h "$HOST" -p "$PORT" >/dev/null 2>&1; then
  echo "No Postgres on $HOST:$PORT. Start it with:  brew services start postgresql@18" >&2
  exit 1
fi

if [ "${1:-}" = "--reset" ]; then
  echo "==> dropping $DB"
  psql_super postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);"
fi

if ! psql_super postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  echo "==> creating $DB"
  psql_super postgres -c "CREATE DATABASE \"$DB\";"
fi

echo "==> labelling $DB as a test database (db-guard refuses anything unlabelled)"
psql_super postgres -c "COMMENT ON DATABASE \"$DB\" IS 'edura-env:test';"

# Neon runs GMT. A Homebrew cluster inherits the machine's zone (Africa/Cairo
# here, UTC+3), and that offset is enough to make a freshly minted view-as
# session look three hours old and every expiry comparison flip — it broke
# invite-claim, view-as and guardian-verification, and nothing else. The local
# database must mirror the real one.
echo "==> timezone UTC (matching Neon)"
psql_super postgres -c "ALTER DATABASE \"$DB\" SET timezone TO 'UTC';"

echo "==> app role"
psql_super postgres -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='edura_app') THEN
    CREATE ROLE edura_app WITH LOGIN PASSWORD '$APP_PW' NOBYPASSRLS;
  ELSE
    ALTER ROLE edura_app WITH LOGIN PASSWORD '$APP_PW' NOBYPASSRLS;
  END IF;
END \$\$;"
psql_super "$DB" -c "GRANT ALL ON SCHEMA public TO edura_app;"

DIRECT="postgresql://$SUPER@$HOST:$PORT/$DB"
APP="postgresql://edura_app:$APP_PW@$HOST:$PORT/$DB"

# `local` is not one of db-guard's environment names; the LABEL is what makes
# this a test database, and the env file below is what selects it.
export DATABASE_URL="$APP" DIRECT_URL="$DIRECT" ADMIN_URL="$DIRECT" DATABASE_DRIVER=pg
# `load-env` refuses when the environment disagrees with the .env file it would
# otherwise read -- the guard that catches `bun run` silently injecting
# .env.local and reaching dev while printing something else. Here the
# environment IS authoritative, which is the case its own message names ("CI
# sets these directly"), so the override is the sanctioned path rather than a
# way around the guard.
export EDURA_ALLOW_ENV_OVERRIDE=1

cd "$here"
tables=$(psql_super "$DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$tables" = "0" ]; then
  echo "==> bootstrap-app-role (empty schema — the only safe moment)"
  npx tsx scripts/bootstrap-app-role.ts
fi

echo "==> migrate deploy"
npx prisma migrate deploy

echo "==> seed (production path, no demo rows)"
npx tsx prisma/seed.ts --no-demo

echo "==> verify"
npx tsx scripts/verify-db.ts || true

cat <<SUMMARY

Local test database ready.

  DATABASE_URL=$APP
  DIRECT_URL=$DIRECT
  ADMIN_URL=$DIRECT
  DATABASE_DRIVER=pg

Those four lines belong in apps/erp/.env.test, apps/superadmin/.env.test and
packages/database/.env.test. Run 'bun run db:local:env' to write them.
SUMMARY
