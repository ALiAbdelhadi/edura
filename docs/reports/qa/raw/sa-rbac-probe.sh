#!/bin/bash
# Superadmin RBAC probe: super_admin vs accountant vs anon.
BASE=http://localhost:3104
CENTER=4979efdd-908a-419d-9386-767f8aec3ab5
STUDENT=ba2e8498-a496-4a98-a5e8-15c13c0145ac
TEACHER=6d189fb3-2be8-448d-a365-fc4de3142062
probe(){ # method path label
  printf '%s\t%s\t%s' "$1" "$3" "$2"
  for r in sa_super sa_acct anon; do
    a=(-s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2")
    [ "$r" != anon ] && a+=(-b "QA/raw/jars/$r.jar")
    [ "$1" != GET ] && a+=(-H 'content-type: application/json' -d '{}')
    printf '\t%s' "$(curl "${a[@]}")"
  done; printf '\n'
}
printf 'METHOD\tLABEL\tPATH\tsuper_admin\taccountant\tanon\n'
# --- platform admin (super_admin only) ---
probe GET /api/v1/admin/dashboard/kpis admin-read
probe GET /api/v1/admin/users admin-read
probe GET /api/v1/admin/students admin-read
probe GET /api/v1/admin/teachers admin-read
probe GET /api/v1/admin/subscriptions admin-read
probe GET /api/v1/admin/payment-intents admin-read
probe GET /api/v1/admin/whatsapp-messages admin-read
probe GET /api/v1/admin/feature-flags admin-read
probe GET /api/v1/admin/revenue-split money-config-read
probe GET /api/v1/admin/wallet-settings money-config-read
probe GET /api/v1/admin/points/rules admin-read
probe GET /api/v1/admin/messaging/conversations admin-read
probe GET /api/v1/admin/messaging/reports admin-read
probe GET /api/v1/admin/deletion-requests admin-read
probe GET /api/v1/admin/registrations admin-read
probe GET /api/v1/admin/session-settlements settlement-read
probe GET "/api/v1/admin/users/$STUDENT" admin-read
probe GET "/api/v1/admin/students/$STUDENT" admin-read
probe GET "/api/v1/admin/centers/$CENTER" admin-read
# --- admin WRITES (super_admin only) ---
probe PUT /api/v1/admin/revenue-split money-config-WRITE
probe PUT /api/v1/admin/wallet-settings money-config-WRITE
probe PUT /api/v1/admin/feature-flags admin-WRITE
probe POST /api/v1/admin/points/rules admin-WRITE
probe PATCH "/api/v1/admin/users/$STUDENT/status" suspend-WRITE
probe PATCH "/api/v1/admin/users/$STUDENT/permissions" suspend-WRITE-dup
probe POST "/api/v1/admin/users/$STUDENT/revoke-sessions" admin-WRITE
probe POST "/api/v1/admin/users/$STUDENT/impersonate" impersonate
probe POST /api/v1/admin/impersonation/stop impersonate-stop
probe POST "/api/v1/admin/teachers/$TEACHER/approve" admin-WRITE
# --- finance portal (accountant + super_admin) ---
probe GET /api/v1/finance/payouts finance-read
probe GET /api/v1/finance/invoices finance-read
probe POST /api/v1/finance/payouts finance-WRITE
probe GET /api/v1/admin/session-settlements/export finance-export
# --- self ---
probe GET /api/v1/me self
probe GET /api/v1/notifications self
probe GET /api/v1/search search
