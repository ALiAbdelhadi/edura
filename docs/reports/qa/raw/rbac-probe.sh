#!/bin/bash
BASE=http://localhost:3102
ROLES="center_admin staff_manager staff_reception center_staff_acct teacher assistant parent student anon"
probe() {
  local m="$1" p="$2" note="$3"
  printf '%s\t%s\t%s' "$m" "$p" "$note"
  for r in $ROLES; do
    local jar="QA/raw/jars/$r.jar" args=(-s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$p")
    [ "$r" != "anon" ] && args+=(-b "$jar")
    [ "$m" != "GET" ] && args+=(-H 'content-type: application/json' -d '{}')
    printf '\t%s' "$(curl "${args[@]}")"
  done
  printf '\n'
}
printf 'METHOD\tPATH\tNOTE'; for r in $ROLES; do printf '\t%s' "$r"; done; printf '\n'
probe GET /api/v1/me self
probe GET /api/v1/notifications self
probe GET /api/v1/centers/me center_admin-only
probe PATCH /api/v1/centers/me center_admin-only-write
probe GET /api/v1/center/staff center_admin-only
probe GET /api/v1/center/checkin/lookup RECEPTION
probe GET /api/v1/rooms MANAGER
probe GET /api/v1/reports/revenue ACCOUNTANT-read
probe GET /api/v1/reports/attendance-by-course MANAGER-read
probe GET /api/v1/center/wallet ACCOUNTANT-read
probe POST /api/v1/center/wallet/payout-request HARD-EXCLUSION
probe GET /api/v1/payments ACCOUNTANT-read
probe GET /api/v1/teacher/courses teacher+assistant
probe GET /api/v1/teacher/wallet teacher-only-EXCLUDED
probe GET /api/v1/teacher/assistants teacher-only-EXCLUDED
probe GET /api/v1/me/subscriptions self
probe GET /api/v1/parent/children parent-only
probe GET /api/v1/dashboards/student student-only
probe GET /api/v1/dashboards/admin center-side
probe GET /api/v1/subjects PUBLIC
probe GET /api/v1/search/centers PUBLIC
