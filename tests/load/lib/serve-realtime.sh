#!/usr/bin/env bash
#
# Start / stop the chat WebSocket server (apps/realtime) against the LOCAL load
# database, the way Railway runs it: `bun src/server.ts`, pg driver, pool of 10.
#
#   tests/load/lib/serve-realtime.sh start
#   tests/load/lib/serve-realtime.sh stop
#
# apps/realtime loads its own `.env.local` through dotenv, which points at Neon.
# dotenv never overrides a variable that is already set, so every key that file
# names is exported here first; after boot the script proves the process holds no
# non-loopback connection, exactly as lib/serve.sh does for the Next apps.
set -euo pipefail
cmd="${1:?start|stop}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
run="$root/tests/load/.run"; mkdir -p "$run"
port=3005

stop() { lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true; }

case "$cmd" in
  stop) stop ;;
  start)
    stop
    # shellcheck disable=SC1091
    . "$root/tests/load/lib/env.sh" erp          # sealed DATABASE_URL + the shared secrets
    if [ -f "$root/apps/realtime/.env.local" ]; then
      while IFS= read -r k; do [ -n "${!k+x}" ] || export "$k="; done \
        < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$root/apps/realtime/.env.local" | cut -d= -f1)
    fi
    # `production` refuses a loopback APP_ORIGIN by design; nothing else in the
    # server branches on NODE_ENV in a way that changes what is measured.
    export NODE_ENV=development REALTIME_PORT=$port PORT=$port
    export APP_ORIGIN="http://localhost:3003" APP_INTERNAL_URL="http://localhost:3003"
    ulimit -n 61000 2>/dev/null || true
    cd "$root/apps/realtime"
    nohup bun src/server.ts > "$run/realtime.log" 2>&1 &
    for _ in $(seq 1 40); do curl -fsS -o /dev/null "http://localhost:$port/healthz" 2>/dev/null && break; sleep 0.5; done
    curl -fsS "http://localhost:$port/healthz" >/dev/null || { echo "realtime did not come up; see $run/realtime.log" >&2; exit 1; }
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN | head -1)"
    remote="$(lsof -nP -a -p "$pid" -iTCP -sTCP:ESTABLISHED 2>/dev/null | awk 'NR>1 {print $9}' | grep -E -- '->' | grep -Ev -- '->(127\.0\.0\.1|\[::1\]|localhost):' || true)"
    if [ -n "$remote" ]; then echo "REFUSING: non-loopback connection: $remote" >&2; stop; exit 1; fi
    echo "[serve-realtime] pid=$pid port=$port -- all established peers are loopback"
    ;;
esac
