#!/usr/bin/env bash
#
# One WebSocket load scenario against the LOCAL realtime server, with evidence.
#
#   tests/load/realtime/run.sh connect [--target 10000 --rate 250 --hold 30]
#   tests/load/realtime/run.sh storm   [--target 5000 --hold 20]
#   tests/load/realtime/run.sh chat    [--senders 3000 --rates 25,100,200,400,800 --step 45]
#
# Starts a fresh server, samples its CPU / memory / DB connections every 5 s,
# resets pg_stat_statements, runs the client, then prints peak memory, the top
# statements, and (for chat) checks that every acked message is exactly one row.
set -euo pipefail
mode="${1:?connect|storm|chat}"; shift || true
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; load="$here/.."
db="${EDURA_LOAD_DB:-edura_load}"
run_id="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$load/results"; tag="$load/results/realtime-$mode-$run_id"
q() { psql -h localhost -d "$db" -v ON_ERROR_STOP=1 -At "$@"; }

case "$mode" in
  connect) defaults=(--target 10000 --rate 250 --hold 30) ;;
  storm)   defaults=(--target 5000 --hold 20) ;;
  chat)    defaults=(--senders 3000 --rates 25,100,200,400,800 --step 45) ;;
esac
[ "$#" -gt 0 ] && defaults=("$@")

"$load/lib/serve-realtime.sh" start
# shellcheck disable=SC1091
. "$load/lib/env.sh" erp 2>/dev/null          # REALTIME_JWT_SECRET for minting tokens
ulimit -n 61000 2>/dev/null || true

before="$(q -c "select count(*) from conversation_messages")"
q -c "select pg_stat_statements_reset()" >/dev/null
"$load/lib/sampler.sh" 3005 "$tag.samples.csv" & sampler=$!
trap 'kill $sampler 2>/dev/null || true; "$load/lib/serve-realtime.sh" stop' EXIT

bun "$here/ws-load.mjs" "$mode" "${defaults[@]}" --out "$tag.json" | tee "$tag.txt"
kill $sampler 2>/dev/null || true

echo
awk -F, 'NR>1 { if ($2>c) c=$2; if ($3>m) m=$3; if ($4>p) p=$4; if ($6>n) n=$6 } END { printf "server peak: CPU %.0f%% of one core, RSS %d MB, Postgres CPU %.0f%%, DB connections %d\n", c, m, p, n }' "$tag.samples.csv" | tee -a "$tag.txt"
gaps="$(awk -F, 'NR>1 { split($1,t,":"); s=t[1]*3600+t[2]*60+t[3]; if (p && s-p>20) n++; p=s } END { print n+0 }' "$tag.samples.csv")"
[ "$gaps" = "0" ] || echo "INVALID RUN: the machine slept ($gaps sampling gaps)" | tee -a "$tag.txt" "$tag.INVALID"
after="$(q -c "select count(*) from conversation_messages")"
echo "conversation_messages rows written: $((after - before))" | tee -a "$tag.txt"
echo "duplicate (conversation, client_id): $(q -c "select count(*) from (select 1 from conversation_messages where client_id is not null group by conversation_id, client_id having count(*)>1) d")" | tee -a "$tag.txt"
echo "server errors logged: $(grep -ciE 'error|P20[0-9]{2}' "$load/.run/realtime.log" || true)" | tee -a "$tag.txt"
q -F'|' -c "select round(total_exec_time::numeric,0), calls, round(mean_exec_time::numeric,2), left(regexp_replace(query,'\s+',' ','g'),150) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) and query not like '%pg_stat%' order by total_exec_time desc limit 8" > "$tag.pgss.txt"
