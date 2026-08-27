#!/bin/bash
set -u
ROOT="${SMOKE_BASE:-http://localhost:3002}"
BASE="$ROOT/api/v1"
PW="${SMOKE_PASSWORD:-Passw0rd!}"
FAILURES=0

expect() {
  if [ "$1" = "$2" ]; then
    printf "  ok   [%s] %s\n" "$1" "$3"
  else
    printf "  FAIL [%s != %s] %s\n" "$1" "$2" "$3"
    FAILURES=$((FAILURES + 1))
  fi
}

login() {
  jar="/tmp/edura-smoke-$(echo "$1" | tr '@.' '__').jar"
  code=$(curl -s -m 20 -c "$jar" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PW\"}" "$ROOT/api/auth/sign-in/email")
  expect "$code" 200 "login $1" >&2
  echo "$jar"
}

get() {
  code=$(curl -s -m 30 -b "$1" -o /dev/null -w '%{http_code}' "$BASE/$2")
  expect "$code" "$3" "$4"
}

echo "== health =="
expect "$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$ROOT/api/health")" 200 "health"

echo "== logins =="
AJ=$(login admin@nile-academy.eg)
TJ=$(login hossam.aziz@nile-academy.eg)
SJ=$(login lina.hassan@student.nile-academy.eg)
PJ=$(login mona.hassan@email.eg)

echo "== center admin =="
get "$AJ" "dashboards/admin" 200 "admin dashboard"
get "$AJ" "courses" 200 "courses"
get "$AJ" "payments" 200 "payments"
get "$AJ" "reports/net-profit" 200 "net-profit report"
get "$AJ" "roster/students" 200 "roster"

echo "== teacher =="
get "$TJ" "dashboards/teacher" 200 "teacher dashboard"
get "$TJ" "sessions" 200 "sessions"
get "$TJ" "grades" 200 "grades"

echo "== student =="
get "$SJ" "dashboards/student" 200 "student dashboard"
get "$SJ" "me/attendance" 200 "attendance"

echo "== parent =="
get "$PJ" "me/children" 200 "children"

echo "== write path (room create/patch/delete) =="
resp=$(curl -s -m 30 -b "$AJ" -H 'Content-Type: application/json' -d '{"name":"smoke-room","capacity":5}' -w '\n%{http_code}' "$BASE/rooms")
code=$(echo "$resp" | tail -1)
rid=$(echo "$resp" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.id)}catch{console.log('')}})")
expect "$code" 201 "create room"
if [ -n "$rid" ]; then
  expect "$(curl -s -m 30 -b "$AJ" -X PATCH -H 'Content-Type: application/json' -d '{"capacity":9}' -o /dev/null -w '%{http_code}' "$BASE/rooms/$rid")" 200 "patch room"
  expect "$(curl -s -m 30 -b "$AJ" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/rooms/$rid")" 200 "delete room"
fi

echo "== rbac isolation =="
get "$SJ" "reports/revenue" 403 "student blocked from finance"
get "$TJ" "expenses" 403 "teacher blocked from expenses"
get "" "me" 401 "unauthenticated me"

echo
if [ "$FAILURES" -eq 0 ]; then echo "SMOKE PASSED ✅"; else echo "SMOKE FAILED: $FAILURES failures ❌"; exit 1; fi
