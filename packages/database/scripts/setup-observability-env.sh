#!/usr/bin/env bash
set -euo pipefail

REPO="${BACKUP_SECRETS_REPO:-ALiAbdelhadi/edura}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

command -v gh >/dev/null || { echo "gh is not installed:  brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { bold "GitHub CLI is not signed in."; echo "Run:  gh auth login"; exit 1; }

HAS_VERCEL=no
command -v vercel >/dev/null && HAS_VERCEL=yes

bold "Sentry + PostHog"
dim "ENTER skips a value and leaves it unchanged."
echo

bold "1. Sentry — source maps in CI"
dim "Without these, production stack traces are minified and near-useless."
dim "Org and project slugs are in your Sentry URL:"
dim "  sentry.io/organizations/<ORG>/projects/<PROJECT>/"
dim ""
dim "The AUTH TOKEN is the one real secret here. Create it at"
dim "  Settings -> Developer Settings -> Organization Tokens"
dim "with scope 'project:releases'. Nothing more."

set_gh_secret() {
  local name="$1" prompt="$2" hidden="${3:-no}" value
  if [ "$hidden" = "yes" ]; then read -rsp "  $prompt: " value; echo
  else read -rp "  $prompt: " value; fi
  if [ -z "$value" ]; then warn "$name skipped"; return; fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
  unset value
  ok "$name set"
}

set_gh_secret SENTRY_ORG                "SENTRY_ORG (slug)"
set_gh_secret SENTRY_PROJECT            "SENTRY_PROJECT (slug for the www app)"
set_gh_secret SENTRY_PROJECT_SUPERADMIN "SENTRY_PROJECT_SUPERADMIN (slug for the back office)"
set_gh_secret SENTRY_AUTH_TOKEN         "SENTRY_AUTH_TOKEN (hidden)" yes
echo

bold "2. Runtime variables (Vercel)"
dim "These go on the DEPLOYMENT, not in GitHub — the running app reads them."
echo
read -rp "  Sentry DSN for www        (https://...ingest...sentry.io/...): " WWW_DSN
read -rp "  Sentry DSN for superadmin (blank = reuse the www DSN):        " SA_DSN
read -rp "  PostHog project key       (phc_...):                          " PH_KEY
read -rp "  PostHog host [https://eu.i.posthog.com]:                      " PH_HOST
PH_HOST="${PH_HOST:-https://eu.i.posthog.com}"
[ -z "$SA_DSN" ] && SA_DSN="$WWW_DSN"
echo

emit_www() {
  echo "  NEXT_PUBLIC_SENTRY_DSN           = ${WWW_DSN:-<skip>}"
  echo "  NEXT_PUBLIC_SENTRY_ENVIRONMENT   = production"
  echo "  SENTRY_TRACES_SAMPLE_RATE        = 0.1      (optional; errors are always 100%)"
  echo "  NEXT_PUBLIC_POSTHOG_KEY          = ${PH_KEY:-<skip>}"
  echo "  NEXT_PUBLIC_POSTHOG_HOST         = ${PH_HOST}"
}
emit_sa() {
  echo "  NEXT_PUBLIC_SENTRY_DSN           = ${SA_DSN:-<skip>}"
  echo "  NEXT_PUBLIC_SENTRY_ENVIRONMENT   = production"
  echo "  SENTRY_TRACES_SAMPLE_RATE        = 0.1      (optional)"
  echo "  # no PostHog here, on purpose — see the runbook"
}

if [ "$HAS_VERCEL" = yes ]; then
  bold "The Vercel CLI is installed."
  dim "Setting these needs the right project linked in the current directory,"
  dim "which differs per app, so they are printed rather than pushed blind."
  dim "To set one:  vercel env add NEXT_PUBLIC_SENTRY_DSN production"
else
  bold "The Vercel CLI is not installed — set these in the dashboard."
  dim "Project -> Settings -> Environment Variables -> Production."
fi
echo
bold "  apps/www"; emit_www
echo
bold "  apps/superadmin"; emit_sa
echo
warn "Redeploy after setting them — NEXT_PUBLIC_* are inlined AT BUILD TIME."
warn "Setting them without a rebuild changes nothing."
echo

bold "Configured GitHub secrets"
gh secret list --repo "$REPO" | grep -E '^SENTRY_' || warn "none found"
echo
bold "Then verify, in this order"
echo "  1. Redeploy both apps."
echo "  2. Sentry: check the release appears under Releases (proves the source-"
echo "     map upload ran) — not just that an event arrived."
echo "  3. PostHog: open the site, then Activity. If events are missing, check"
echo "     /ingest/e/ returns 200 and NOT a 307 — the locale middleware has"
echo "     eaten that path before (see tests/unit/ingest-proxy.test.ts)."
echo "  4. Confirm no PII: open any Sentry issue and check the exception message"
echo "     shows [redacted] where a token or email would be."
echo
dim "Runbook: docs/runbooks/observability.md"
