#!/usr/bin/env bash
# Reconcile the money tables of the LOCAL load database. Read-only.
#   tests/load/lib/money-check.sh
# Every line must hold for the run to count as clean; the script exits non-zero
# on the first one that does not.
set -euo pipefail
db="${EDURA_LOAD_DB:-edura_load}"
q() { psql -h localhost -d "$db" -v ON_ERROR_STOP=1 -At -c "$1"; }
fail=0
check() { # name, sql returning a single integer that must be 0
  local n; n="$(q "$2")"
  if [ "$n" = "0" ]; then echo "  ok    $1"; else echo "  FAIL  $1  -> $n"; fail=1; fi
}
echo "rows: payments=$(q 'select count(*) from payments') transactions=$(q 'select count(*) from transactions') walk_in_passes=$(q "select count(*) from subscriptions where plan='per_session' and source='walk_in'")"
check "no (student, session) holds two active passes" \
  "select count(*) from (select 1 from subscriptions where plan='per_session' and status='active' group by student_id, session_id having count(*)>1) d"
check "every active walk-in pass has exactly one payment" \
  "select count(*) from subscriptions s where plan='per_session' and source='walk_in' and status='active' and (select count(*) from payments p where p.id = s.payment_id) <> 1"
check "no payment is shared by two subscriptions" \
  "select count(*) from (select payment_id from subscriptions where payment_id is not null group by 1 having count(*)>1) d"
check "no orphan payment (a charge with no coverage behind it)" \
  "select count(*) from payments p where not exists (select 1 from subscriptions s where s.payment_id = p.id)"
# A subscription payment's ledger row carries no payment_id (only refunds do); the
# link is the subscription id inside `notes`, which is what this matches on.
check "payments and ledger payment rows are equal in number" \
  "select (select count(*) from payments) - (select count(*) from transactions where type='payment')"
check "payments and ledger payment rows are equal in value" \
  "select (select coalesce(sum(amount),0) from payments) - (select coalesce(sum(amount),0) from transactions where type='payment')"
check "every paid walk-in pass has exactly one ledger payment row" \
  "select count(*) from subscriptions s where plan='per_session' and source='walk_in' and status='active' and (select count(*) from transactions t where t.type='payment' and t.from_entity_id = s.student_id and t.notes like '%subscription ' || s.id || ')') <> 1"
check "one attendance row per (session, student)" \
  "select count(*) from (select 1 from attendance_records group by session_id, student_id having count(*)>1) d"
check "receipt numbers are unique" \
  "select count(*) from (select receipt_number from payments where receipt_number is not null group by 1 having count(*)>1) d"
exit $fail
