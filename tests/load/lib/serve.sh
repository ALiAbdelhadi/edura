#!/usr/bin/env bash
#
# Start (or stop) a load-test server: the PRODUCTION build, on Bun, against the
# local load database.
#
#   tests/load/lib/serve.sh start erp            # :3003
#   tests/load/lib/serve.sh start superadmin     # :3006
#   LOAD_POOL_MAX=30 tests/load/lib/serve.sh start erp
#   tests/load/lib/serve.sh stop erp
#   tests/load/lib/serve.sh build erp            # build with the same sealed env
#
# After boot it PROVES where the server is connected: it lists the process's
# established TCP peers and aborts if any Postgres-port peer is not loopback.
set -euo pipefail

cmd="${1:?start|stop|build}"
app="${2:?erp|superadmin}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
run="$root/tests/load/.run"
mkdir -p "$run"
pidfile="$run/$app.pid"
port=$([ "$app" = "erp" ] && echo 3003 || echo 3006)

stop() {
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
  fi
  # `bun --bun next start` re-execs; make sure nothing is left on the port.
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
}

case "$cmd" in
  stop) stop ;;
  build)
    # shellcheck disable=SC1091
    . "$root/tests/load/lib/env.sh" "$app"
    cd "$root/apps/$app" && bun run build
    ;;
  start)
    stop
    # shellcheck disable=SC1091
    . "$root/tests/load/lib/env.sh" "$app"
    cd "$root/apps/$app"
    nohup bun --bun next start -p "$port" > "$run/$app.log" 2>&1 &
    echo $! > "$pidfile"
    for _ in $(seq 1 60); do
      curl -fsS -o /dev/null "http://localhost:$port/api/health" 2>/dev/null && break
      sleep 0.5
    done
    curl -fsS -o /dev/null "http://localhost:$port/api/health" || { echo "server did not come up; see $run/$app.log" >&2; exit 1; }
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN | head -1)"
    echo "$pid" > "$pidfile"
    remote="$(lsof -nP -a -p "$pid" -iTCP -sTCP:ESTABLISHED 2>/dev/null | awk 'NR>1 {print $9}' | grep -E -- '->' | grep -Ev -- '->(127\.0\.0\.1|\[::1\]|localhost):' || true)"
    if [ -n "$remote" ]; then
      echo "REFUSING: the server holds a non-loopback connection:" >&2
      echo "$remote" >&2
      stop
      exit 1
    fi
    echo "[serve] $app pid=$pid port=$port -- all established peers are loopback"
    ;;
  *) echo "unknown command $cmd" >&2; exit 1 ;;
esac
