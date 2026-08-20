#!/usr/bin/env bash
# Exact row count for every base table in `public`, one "table count" line each,
# sorted. Used by the `seeds` CI job to prove the seeds are idempotent without
# hard-coding any expected number: the check is census-before == census-after,
# so adding a fixture stays green while a duplicating seed names its own table.
#
# query_to_xml is the portable way to count a dynamically-named table from
# inside a single query; pg_stat_user_tables.n_live_tup is only an estimate and
# would make this flaky.
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-neondb}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -tAc "
  SELECT string_agg(t, E'\n' ORDER BY t) FROM (
    SELECT table_name || ' ' || (xpath('/row/c/text()',
      query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                   false, true, '')))[1]::text AS t
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) s;"
