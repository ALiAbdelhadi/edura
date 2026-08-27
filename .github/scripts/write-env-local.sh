#!/usr/bin/env bash
# Writes the .env.local that CI's app-booting jobs need, for one package.
#
# There is no committed .env.example anywhere: each package holds exactly two
# env files, .env.local and .env.production, and both are gitignored. This
# script is the single place the key list lives, so it cannot drift between the
# db job and the e2e-playwright job, and it cannot be deleted from a package by
# a cleanup that does not realise CI reads it.
#
# Connection strings come from the caller's environment. The secrets below are
# fixed throwaway values: c04 requires the two auth secrets to DIFFER and to be
# identical across the two apps.
#
# Usage: write-env-local.sh <package-dir>
set -euo pipefail
dir="${1:?usage: write-env-local.sh <package-dir>}"
: "${DATABASE_URL:?}" "${DIRECT_URL:?}" "${ADMIN_URL:?}"

cat > "$dir/.env.local" <<EOF
DATABASE_URL=$DATABASE_URL
DIRECT_URL=$DIRECT_URL
ADMIN_URL=$ADMIN_URL
DATABASE_DRIVER=pg
NEXTAUTH_SECRET=ci-www-secret-0000000000000000000000000000
SUPERADMIN_NEXTAUTH_SECRET=ci-sa-secret-11111111111111111111111111111
REALTIME_JWT_SECRET=ci-realtime-2222222222222222222222222222
INTERNAL_API_SECRET=ci-internal-33333333333333333333333333333
CRON_SECRET=ci-cron-4444444444444444444444444444444444
PAYMENTS_MODE=mock
WHATSAPP_MODE=mock
MAIL_PROVIDER=console
SMS_PROVIDER=
INVITE_CHANNELS=email
EOF
echo "wrote $dir/.env.local (values not echoed)"
