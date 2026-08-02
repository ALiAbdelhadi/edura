#!/usr/bin/env bash
# =============================================================================
# One-time setup for the backup GitHub Actions secrets.
#
# RUN THIS YOURSELF. It prompts for each value and pipes it straight into
# `gh secret set` — nothing is echoed to the terminal, written to a file, or
# kept in shell history. That is deliberate: these are a production database
# password and the key that decrypts every backup you will ever take, and they
# should pass through as few hands as possible.
#
#   bash packages/database/scripts/setup-backup-secrets.sh
#
# Re-running it is safe: it overwrites each secret with whatever you type and
# skips anything you leave blank.
# =============================================================================
set -euo pipefail

REPO="${BACKUP_SECRETS_REPO:-ALiAbdelhadi/edura}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

# --- preflight ---------------------------------------------------------------
command -v gh >/dev/null || { echo "gh is not installed:  brew install gh"; exit 1; }
command -v age-keygen >/dev/null || { echo "age is not installed:  brew install age"; exit 1; }

if ! gh auth status >/dev/null 2>&1; then
  bold "GitHub CLI is not signed in."
  echo "Run:  gh auth login"
  exit 1
fi

bold "Backup secrets → $REPO"
dim "Press ENTER on any prompt to skip that secret and leave it unchanged."
echo

# `read -rs` keeps the value off the screen. Piping it to gh on STDIN keeps it
# out of the PROCESS LIST too: `gh secret set X --body "$v"` puts the secret in
# argv, where any local process can read it out of `ps` for as long as the call
# runs. Short window, but a free one to close.
set_secret() {
  local name="$1" prompt="$2" secret="${3:-yes}" value
  if [ "$secret" = "yes" ]; then
    read -rsp "  $prompt: " value; echo
  else
    read -rp "  $prompt: " value
  fi
  if [ -z "$value" ]; then warn "$name skipped"; return; fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
  unset value
  ok "$name set"
}

# --- 1. database -------------------------------------------------------------
bold "1. Production database"
dim "The UNPOOLED connection string — your DIRECT_URL, NOT the one with"
dim "'-pooler' in the host. The pooler cannot produce a consistent dump."
set_secret BACKUP_DIRECT_URL "BACKUP_DIRECT_URL"
echo

# --- 2. encryption -----------------------------------------------------------
bold "2. Encryption key"
if gh secret list --repo "$REPO" 2>/dev/null | grep -q '^BACKUP_AGE_RECIPIENT'; then
  warn "BACKUP_AGE_RECIPIENT already exists — skipping key generation."
  dim  "Delete it in the repo settings first if you really want to rotate."
else
  KEYFILE="$HOME/edura-backup-age.key"
  if [ -f "$KEYFILE" ]; then
    warn "Reusing the existing key at $KEYFILE"
  else
    age-keygen -o "$KEYFILE" 2>/dev/null
    chmod 600 "$KEYFILE"
    ok "generated $KEYFILE"
  fi
  PUBLIC=$(age-keygen -y "$KEYFILE")
  printf '%s' "$PUBLIC" | gh secret set BACKUP_AGE_RECIPIENT --repo "$REPO" >/dev/null
  ok "BACKUP_AGE_RECIPIENT set (public key — safe to share)"
  gh secret set BACKUP_AGE_IDENTITY --repo "$REPO" < "$KEYFILE" >/dev/null
  ok "BACKUP_AGE_IDENTITY set (private key — used by the weekly restore test)"

  echo
  printf '\033[1;31m  ┌─────────────────────────────────────────────────────────────┐\033[0m\n'
  printf '\033[1;31m  │  DO THIS NOW, BEFORE YOU CLOSE THIS TERMINAL                 │\033[0m\n'
  printf '\033[1;31m  └─────────────────────────────────────────────────────────────┘\033[0m\n'
  echo "  The private key is at:  $KEYFILE"
  echo
  echo "  It is the ONLY thing that can read your backups. If you lose it,"
  echo "  every backup you have is permanently unreadable — there is no"
  echo "  recovery path and no support ticket that fixes it."
  echo
  echo "  1. Copy it into your password manager."
  echo "  2. Print it and put the paper somewhere physical."
  echo "  3. Do NOT store it in the same place as the backups themselves,"
  echo "     and do not rely on GitHub Secrets as your only copy — you"
  echo "     cannot read a secret back out of GitHub."
  echo
  read -rp "  Type 'saved' once you have done this: " CONFIRM
  [ "$CONFIRM" = "saved" ] || { echo; warn "Not confirmed. The key is still at $KEYFILE — go save it."; }
fi
echo

# --- 3. object storage -------------------------------------------------------
bold "3. Object storage (S3-compatible)"
dim "Backblaze B2, Cloudflare R2, Wasabi, iDrive e2, MinIO or AWS S3."
dim "Leave the endpoint blank ONLY if you are using AWS S3 itself."
dim ""
dim "B2:  endpoint https://s3.<region>.backblazeb2.com"
dim "     region   the segment inside that host, e.g. eu-central-003 — NOT 'auto'"
dim "     keys     keyID -> ACCESS_KEY_ID, applicationKey -> SECRET_ACCESS_KEY"
dim "R2:  endpoint https://<account-id>.r2.cloudflarestorage.com, region 'auto'"
set_secret BACKUP_S3_BUCKET   "BACKUP_S3_BUCKET (name)"           no
set_secret BACKUP_S3_ENDPOINT "BACKUP_S3_ENDPOINT (https://...)"  no
set_secret BACKUP_S3_ACCESS_KEY_ID     "BACKUP_S3_ACCESS_KEY_ID"
set_secret BACKUP_S3_SECRET_ACCESS_KEY "BACKUP_S3_SECRET_ACCESS_KEY"
set_secret BACKUP_S3_REGION   "BACKUP_S3_REGION (B2: eu-central-003 | R2: auto)"  no
echo

# --- 4. alerting -------------------------------------------------------------
bold "4. Failure alerts"
dim "Where a FAILED backup shouts. Without this, failures are logged and"
dim "nobody is told."
set_secret BACKUP_ALERT_EMAIL "BACKUP_ALERT_EMAIL" no
echo

# --- done --------------------------------------------------------------------
bold "Configured secrets"
gh secret list --repo "$REPO" | grep -E '^BACKUP_' || warn "none found"
echo
bold "Next: prove it works end to end"
echo "  gh workflow run backup.yml --repo $REPO -f environment=production"
echo "  gh run watch --repo $REPO"
echo
dim "Then run the restore test against what it uploaded:"
echo "  gh workflow run backup.yml --repo $REPO   # the restore-test job runs on dispatch"
echo
dim "Full runbook: docs/runbooks/backup-restore.md"
