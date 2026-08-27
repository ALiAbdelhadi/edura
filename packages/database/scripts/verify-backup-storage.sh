#!/usr/bin/env bash
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
export AWS_REQUEST_CHECKSUM_CALCULATION="${AWS_REQUEST_CHECKSUM_CALCULATION:-when_required}"

EP=()
[ -n "${BACKUP_S3_ENDPOINT:-}" ] && EP=(--endpoint-url "$BACKUP_S3_ENDPOINT")

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

dd if=/dev/urandom of="$TMP/probe.bin" bs=1024 count=1024 2>/dev/null
LOCAL_SUM=$(shasum -a 256 "$TMP/probe.bin" | awk '{print $1}')

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

if aws s3 ls "s3://$BUCKET/_healthcheck/" "${EP[@]}" 2>"$TMP/err" | grep -q "$(basename "$KEY")"; then
  ok "list (the restore test finds the newest backup this way)"
else
  bad "list — token can write but not list. The weekly restore test would fail."
fi

if aws s3 cp "s3://$BUCKET/$KEY" "$TMP/back.bin" "${EP[@]}" --only-show-errors 2>"$TMP/err"; then
  ok "read back"
else
  bad "read back — $(head -2 "$TMP/err" | tr '\n' ' ')"
fi

if [ -f "$TMP/back.bin" ]; then
  REMOTE_SUM=$(shasum -a 256 "$TMP/back.bin" | awk '{print $1}')
  if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
    ok "checksum matches (${LOCAL_SUM:0:16}…)"
  else
    bad "CHECKSUM MISMATCH — what came back is not what went up"
  fi
fi

if aws s3 rm "s3://$BUCKET/$KEY" "${EP[@]}" --only-show-errors 2>"$TMP/err"; then
  ok "delete"
else
  bad "delete — probe object left at $KEY (remove it by hand)"
fi

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
