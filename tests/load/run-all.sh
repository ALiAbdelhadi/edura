#!/usr/bin/env bash
# Every role, one after another, each against a freshly started server so one
# role's overload cannot colour the next. Money-writing roles run before the
# accountant, so the finance screens read rows the real engine wrote.
#   tests/load/run-all.sh                 # default pool (10)
#   LOAD_POOL_MAX=30 tests/load/run-all.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
for role in ${ROLES:-student parent teacher assistant center_staff center_admin accountant super_admin}; do
  case "$role" in super_admin|accountant) app=superadmin ;; *) app=erp ;; esac
  echo "=== $role ($(date +%H:%M:%S))"
  "$here/lib/serve.sh" start "$app" || exit 1
  "$here/run.sh" "$role"
  # A killed k6 must END the chain, not advance it: on 2026-09-20 `pkill k6` under
  # this loop started the next role on top of a second chain.
  [ -f "$here/results/$role-$RUN_ID.json" ] || { echo "no result for $role -- stopping"; exit 1; }
  "$here/lib/serve.sh" stop "$app"
done
echo "=== done ($(date +%H:%M:%S))"
