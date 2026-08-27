#!/usr/bin/env bash
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
