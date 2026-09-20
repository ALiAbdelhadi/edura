#!/usr/bin/env bash
#
# Run ONE role's load scenario end to end, locally, with evidence.
#
#   tests/load/run.sh student
#   STEPS=10,50 STEP_SECONDS=60 tests/load/run.sh center_staff      # a short run
#   LOAD_POOL_MAX=30 tests/load/run.sh teacher                       # after restarting the server with the same value
#
# Assumes the matching server is already up (tests/load/lib/serve.sh start <app>)
# and sessions are minted (bun tests/load/lib/mint-sessions.mjs).
#
# Around the k6 run it: resets pg_stat_statements, snapshots the money tables,
# samples CPU + pg_stat_activity every 5 s, then writes the top statements and a
# ledger reconciliation next to the k6 summary in tests/load/results/.
set -euo pipefail
role="${1:?role: student|parent|teacher|assistant|center_staff|center_admin|super_admin|accountant}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
db="${EDURA_LOAD_DB:-edura_load}"
case "$role" in super_admin|accountant) port=3006 ;; *) port=3003 ;; esac
export RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
export RESULTS_DIR="$here/results"
mkdir -p "$RESULTS_DIR"
tag="$RESULTS_DIR/$role-$RUN_ID"
q() { psql -h localhost -d "$db" -v ON_ERROR_STOP=1 -At "$@"; }

[ "$(q -c "select shobj_description(oid,'pg_database') from pg_database where datname=current_database()")" = "edura-env:test" ] \
  || { echo "refusing: $db is not labelled edura-env:test" >&2; exit 1; }
curl -fsS -o /dev/null "http://localhost:$port/api/health" || { echo "no server on :$port" >&2; exit 1; }

money_sql="select (select count(*) from payments), (select count(*) from transactions),
  (select count(*) from subscriptions where plan='per_session'), (select count(*) from attendance_records), (select count(*) from audit_logs)"
before="$(q -F' ' -c "$money_sql")"
q -c "select pg_stat_statements_reset()" >/dev/null

"$here/lib/sampler.sh" "$port" "$tag.samples.csv" &
sampler=$!
trap 'kill $sampler 2>/dev/null || true' EXIT

k6 run --quiet "$here/$role.js" 2>&1 | tail -5 || true
kill $sampler 2>/dev/null || true

q -F'|' -c "select round(total_exec_time::numeric,0) total_ms, calls, round(mean_exec_time::numeric,2) mean_ms,
  round((100*total_exec_time/sum(total_exec_time) over())::numeric,1) pct, rows, left(regexp_replace(query,'\s+',' ','g'),260)
  from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database())
  and query not like '%pg_stat%' order by total_exec_time desc limit 15" > "$tag.pgss.txt"

after="$(q -F' ' -c "$money_sql")"
{
  echo "before: payments transactions per_session_subs attendance audit_logs = $before"
  echo "after:  payments transactions per_session_subs attendance audit_logs = $after"
  echo "--- duplicate coverage: >1 active per-session subscription for one (student, session)"
  q -c "select count(*) from (select student_id, session_id from subscriptions where plan='per_session' and status='active' group by 1,2 having count(*)>1) d"
  echo "--- payments per per-session subscription (must be exactly 1 each): subs_without_payment, payments_without_sub"
  q -F' ' -c "select (select count(*) from subscriptions s where plan='per_session' and source='walk_in' and payment_id is null and not is_demo),
              (select count(*) from payments p where not exists (select 1 from subscriptions s where s.payment_id=p.id))"
} > "$tag.ledger.txt"
cat "$tag.ledger.txt"

# A laptop that slept mid-run produces numbers that look plausible and mean
# nothing (it happened: lid closed, 14 minutes missing). The sampler ticks every
# ~5 s, so any gap over 20 s between ticks means the machine was not running.
gaps="$(awk -F, 'NR>1 { split($1,t,":"); s=t[1]*3600+t[2]*60+t[3]; if (p && s-p>20) n++; p=s } END { print n+0 }' "$tag.samples.csv")"
if [ "$gaps" != "0" ]; then
  echo "INVALID RUN: $gaps sampling gap(s) > 20 s -- the machine slept or stalled. Discard $tag.*" | tee "$tag.INVALID"
fi
echo "[run] artefacts: $tag.{json,samples.csv,pgss.txt,ledger.txt}"
