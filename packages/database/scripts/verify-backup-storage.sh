#!/usr/bin/env bash
# =============================================================================
# Prove the backup bucket actually works — BEFORE a real backup depends on it.
#
# "The credentials are in GitHub Secrets" is not evidence. A bucket can be
# write-only, region-mismatched, pointed at the wrong endpoint, or scoped to a
# token that cannot read back what it just wrote — and every one of those
# surfaces as a green backup job followed by an unrestorable file.
#
# This does a full round trip with a throwaway object:
#   write -> list -> read back -> byte-compare -> delete -> confirm gone
#
# It never touches a real backup and writes only to a `_healthcheck/` prefix.
#
#   bash packages/database/scripts/verify-backup-storage.sh
#
# Reads credentials from the environment, so nothing is stored or echoed:
#   export BACKUP_S3_BUCKET=edura-backups
#   export BACKUP_S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
#   export AWS_ACCESS_KEY_ID=...          # B2 "keyID"
#   export AWS_SECRET_ACCESS_KEY=...      # B2 "applicationKey"
#   export AWS_DEFAULT_REGION=eu-central-003
#
# For Cloudflare R2 instead: endpoint
# https://<account-id>.r2.cloudflarestorage.com and region `auto`.
# =============================================================================
set -uo pipefail

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=$((FAILED+1)); }
bold() { printf '\033[1m%s\033[0m\n' "$1"; }

FAILED=0

command -v aws >/dev/null || { echo "aws CLI not installed:  brew install awscli"; exit 1; }

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is not set}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is not set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is not set}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# See backup-db.ts: AWS CLI v2.23+ sends x-amz-checksum on every upload, which
# some S3-compatible providers (Backblaze B2) reject with an opaque error that
# reads like a credentials problem. No-op on AWS and R2.
export AWS_REQUEST_CHECKSUM_CALCULATION="${AWS_REQUEST_CHECKSUM_CALCULATION:-when_required}"

EP=()
[ -n "${BACKUP_S3_ENDPOINT:-}" ] && EP=(--endpoint-url "$BACKUP_S3_ENDPOINT")

# 'auto' is a Cloudflare R2 convention. Backblaze needs its REAL region
# (eu-central-003, us-west-004, ...) and fails with a signature error otherwise
# — which reads as "wrong credentials" and sends people down the wrong path.
case "${BACKUP_S3_ENDPOINT:-}" in
  *backblazeb2.com*)
    if [ "$AWS_DEFAULT_REGION" = "auto" ]; then
      printf '  \033[33m!\033[0m region is "auto" but this is a Backblaze endpoint.\n'
      printf '    B2 needs its real region, e.g. eu-central-003 — the one in your endpoint host.\n'
      GUESS=$(printf '%s' "$BACKUP_S3_ENDPOINT" | sed -n 's#.*s3\.\([a-z0-9-]*\)\.backblazeb2\.com.*#\1#p')
      [ -n "$GUESS" ] && { printf '    Using "%s", inferred from the endpoint.\n' "$GUESS"; export AWS_DEFAULT_REGION="$GUESS"; }
    fi
    ;;
esac

BUCKET="$BACKUP_S3_BUCKET"
KEY="_healthcheck/probe-$(date -u +%Y%m%dT%H%M%SZ)-$$.bin"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

bold "Bucket round trip → s3://$BUCKET"
echo "  endpoint: ${BACKUP_S3_ENDPOINT:-<AWS default>}   region: $AWS_DEFAULT_REGION"
echo

# A megabyte of random bytes: large enough that a truncating proxy or a
# multipart threshold bug shows up, small enough to be instant.
dd if=/dev/urandom of="$TMP/probe.bin" bs=1024 count=1024 2>/dev/null
LOCAL_SUM=$(shasum -a 256 "$TMP/probe.bin" | awk '{print $1}')

# 1. write
if aws s3 cp "$TMP/probe.bin" "s3://$BUCKET/$KEY" "${EP[@]}" --only-show-errors 2>"$TMP/err"; then
  ok "write"
else
  bad "write — $(head -2 "$TMP/err" | tr '\n' ' ')"
  echo
  bold "Cannot continue without write access."
  echo "  Common causes: wrong endpoint; the key lacks read+write on this"
  echo "  bucket; a bucket-name typo; or a region mismatch — B2 needs its real"
  echo "  region (eu-central-003, us-west-004...), R2 needs the literal 'auto'."
  exit 1
fi

# 2. list — a token can be able to PUT but not LIST, and the restore test
#    finds the newest backup by listing. That would fail only in an emergency.
if aws s3 ls "s3://$BUCKET/_healthcheck/" "${EP[@]}" 2>"$TMP/err" | grep -q "$(basename "$KEY")"; then
  ok "list (the restore test finds the newest backup this way)"
else
  bad "list — token can write but not list. The weekly restore test would fail."
fi

# 3. read back
if aws s3 cp "s3://$BUCKET/$KEY" "$TMP/back.bin" "${EP[@]}" --only-show-errors 2>"$TMP/err"; then
  ok "read back"
else
  bad "read back — $(head -2 "$TMP/err" | tr '\n' ' ')"
fi

# 4. byte-for-byte — the check that catches a silently truncated upload, which
#    is the classic way a backup is worthless without anyone noticing.
if [ -f "$TMP/back.bin" ]; then
  REMOTE_SUM=$(shasum -a 256 "$TMP/back.bin" | awk '{print $1}')
  if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
    ok "checksum matches (${LOCAL_SUM:0:16}…)"
  else
    bad "CHECKSUM MISMATCH — what came back is not what went up"
  fi
fi

# 5. delete
if aws s3 rm "s3://$BUCKET/$KEY" "${EP[@]}" --only-show-errors 2>"$TMP/err"; then
  ok "delete"
else
  bad "delete — probe object left at $KEY (remove it by hand)"
fi

# 6. versioning — not fatal, but its absence means an overwrite is permanent.
#
# Reported in THREE states, not two: several S3-compatible providers do not
# implement GetBucketVersioning at all, and reporting that as "versioning is
# OFF" would send you hunting for a setting that is not missing. Backblaze in
# particular manages this as a per-bucket "Keep all versions" lifecycle setting
# rather than through the S3 versioning API.
VERS_RAW=$(aws s3api get-bucket-versioning --bucket "$BUCKET" "${EP[@]}" 2>"$TMP/verr")
if grep -qiE "not implemented|unsupported|MethodNotAllowed|InvalidRequest" "$TMP/verr" 2>/dev/null; then
  printf '  \033[33m!\033[0m versioning: provider does not expose the S3 versioning API.\n'
  printf '    Check it in the provider console instead (B2: bucket -> "Keep all versions").\n'
elif printf '%s' "$VERS_RAW" | grep -q '"Status": *"Enabled"'; then
  ok "versioning enabled"
else
  printf '  \033[33m!\033[0m versioning is OFF — an overwritten backup is unrecoverable. Turn it on.\n'
fi

echo
if [ "$FAILED" -eq 0 ]; then
  bold "✅ Storage is good. Safe to enable the schedule."
  echo "   Next:  gh workflow run backup.yml -f environment=production"
else
  bold "❌ $FAILED check(s) failed — do NOT enable the schedule yet."
  exit 1
fi
