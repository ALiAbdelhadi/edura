#!/usr/bin/env bash
#
# Seed the LOCAL load-test database with realistic volume.
#
#   tests/load/seed/seed.sh            # 20 centres x 1000 students (default)
#   CENTERS=5 STUDENTS=200 tests/load/seed/seed.sh
#
# Build the database first (once):
#   cd packages/database && EDURA_LOCAL_DB=edura_load bash scripts/local-test-db.sh
#
# SAFETY: this script only ever talks to a Postgres on localhost, and refuses a
# database that is not labelled `edura-env:test`. There is no flag to override
# either check -- a load seed pointed at a Neon branch is 16k junk users on
# someone else's bill.
set -euo pipefail

DB="${EDURA_LOAD_DB:-edura_load}"
HOST="localhost"
PORT="${EDURA_LOCAL_PORT:-5432}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

label="$(psql -h "$HOST" -p "$PORT" -d "$DB" -tAc \
  "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname = current_database()")"
if [ "$label" != "edura-env:test" ]; then
  echo "refusing: $DB on $HOST is labelled '$label', not 'edura-env:test'" >&2
  exit 1
fi

psql -h "$HOST" -p "$PORT" -d "$DB" -v ON_ERROR_STOP=1 \
  -v centers="${CENTERS:-20}" \
  -v teachers="${TEACHERS:-10}" \
  -v students="${STUDENTS:-1000}" \
  -v past_weeks="${PAST_WEEKS:-8}" \
  -v staff_accounts="${STAFF_ACCOUNTS:-25}" \
  -v password="${LOAD_PASSWORD:-Load-Test-2026!}" \
  -f "$here/load-seed.sql"
