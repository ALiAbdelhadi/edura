#!/usr/bin/env bash
# Sample the three things that can be the bottleneck, every 5 s, to a CSV:
# the app process CPU, Postgres CPU + connection states, and k6's own CPU (so a
# load generator starving the server on the same machine is visible, not assumed).
#   lib/sampler.sh <port> <out.csv>
set -uo pipefail
port="$1"; out="$2"; db="${EDURA_LOAD_DB:-edura_load}"
echo "ts,app_cpu_pct,app_rss_mb,pg_cpu_pct,k6_cpu_pct,pg_total,pg_active,pg_idle_in_tx,pg_waiting_lock,pg_waiting_client,load1" > "$out"
while true; do
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"
  app="$(ps -o %cpu=,rss= -p "${pid:-0}" 2>/dev/null | awk '{printf "%s,%d", $1, $2/1024}')"
  pg="$(ps -axo %cpu=,command= | awk '/[p]ostgres/ {s+=$1} END {printf "%.1f", s}')"
  k6="$(ps -axo %cpu=,comm= | awk '$2 ~ /k6$/ {s+=$1} END {printf "%.1f", s}')"
  act="$(psql -h localhost -d "$db" -AtF, -c "select count(*), count(*) filter (where state='active'), count(*) filter (where state like 'idle in transaction%'), count(*) filter (where wait_event_type='Lock'), count(*) filter (where wait_event='ClientRead' and state like 'idle in transaction%') from pg_stat_activity where datname='$db' and usename='edura_app'" 2>/dev/null)"
  l1="$(sysctl -n vm.loadavg | awk '{print $2}')"
  echo "$(date +%H:%M:%S),${app:-0,0},$pg,$k6,${act:-0,0,0,0,0},$l1" >> "$out"
  sleep 5
done
