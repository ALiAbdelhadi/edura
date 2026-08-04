#!/usr/bin/env bash
# =============================================================================
# Add the BETTER_AUTH_* env vars to Vercel, copying the values PRODUCTION IS
# ACTUALLY RUNNING.
#
# RUN THIS YOURSELF. It moves signing secrets into a hosting provider, which is
# yours to do. Nothing is echoed: values are piped to `vercel` on stdin, so they
# stay out of your shell history, out of `ps`, and out of this script's output —
# it reports character counts instead.
#
#   bash scripts/add-better-auth-env-to-vercel.sh
#
# Step 1 of docs/runbooks/auth-env-rename.md. ADDITIVE: the NEXTAUTH_* vars stay
# untouched and the code reads either name (new preferred), so this cannot break
# a running deployment whenever it runs relative to a deploy. Removing the old
# vars is step 4, AFTER a deployment has been seen not falling back.
#
# ---------------------------------------------------------------------------
# WHY IT PULLS FROM VERCEL INSTEAD OF READING .env.production
#
# The first version of this script copied from .env.production, and that was
# WRONG in a way that would have taken production down. That file has
# NEXTAUTH_URL=https://app.edura.eg — a domain which does not resolve (checked
# 2026-08-03: the connection fails outright; the custom domain is still
# outstanding). Production is served from edura-www.vercel.app and its live
# sign-in door answers 401 USER_NOT_FOUND — not 403 INVALID_ORIGIN — from that
# origin, so whatever Vercel holds is NOT what the local file says.
#
# Since the code PREFERS the new name, copying the local value would have moved
# baseURL onto a dead domain, taken trustedOrigins with it, and made every
# sign-in fail INVALID_ORIGIN. The only safe source for "what production runs"
# is production.
#
# The pulled file lands in a private temp dir, is chmod 600, and is deleted on
# exit including on failure.
# ---------------------------------------------------------------------------
#
# THE VALUES MUST BE THE SAME ONES. A fresh secret is not a rename — better-auth
# cannot verify a session signed with the old key, so every signed-in user is
# signed out. Hence copy, never generate.
#
# WHY NOT RAILWAY: apps/realtime never reads an auth secret in production.
# `dedicatedSecret()` returns REALTIME_JWT_SECRET on its first line and throws
# before reaching the fallback — that path is dev-only. Railway needs no change.
# =============================================================================
set -euo pipefail

TARGET_ENV="${TARGET_ENV:-production}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

vercel() { bunx vercel@latest "$@"; }

command -v bunx >/dev/null || { echo "bunx not found"; exit 1; }
vercel whoami >/dev/null 2>&1 || { echo "Not logged in to Vercel. Run: bunx vercel@latest login"; exit 1; }
echo "Vercel account: $(vercel whoami 2>/dev/null | tail -1)"

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT INT TERM

read_val() {
  sed -n -E "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" \
    | head -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# app_dir : new var : source var
PLAN=(
  "apps/www:BETTER_AUTH_SECRET:NEXTAUTH_SECRET"
  "apps/www:BETTER_AUTH_URL:NEXTAUTH_URL"
  "apps/superadmin:SUPERADMIN_BETTER_AUTH_SECRET:SUPERADMIN_NEXTAUTH_SECRET"
  "apps/superadmin:BETTER_AUTH_URL:NEXTAUTH_URL"
)

for dir in apps/www apps/superadmin; do
  out="$WORK/${dir//\//_}.env"
  ( cd "$REPO_ROOT/$dir" && vercel env pull "$out" --environment="$TARGET_ENV" --yes >/dev/null 2>&1 ) \
    || { echo "Could not pull $TARGET_ENV env for $dir"; exit 1; }
  chmod 600 "$out"
  echo "pulled $TARGET_ENV env for $dir ($(grep -c '=' "$out") vars)"
done

echo
echo "Adding to $TARGET_ENV (values copied from Vercel, never printed):"
for row in "${PLAN[@]}"; do
  IFS=":" read -r dir newname srcname <<<"$row"
  src="$WORK/${dir//\//_}.env"
  value="$(read_val "$src" "$srcname")"
  if [ -z "$value" ]; then
    echo "  SKIP $dir  $newname — $srcname is not set on Vercel for $dir"
    continue
  fi
  if printf '%s' "$value" | ( cd "$REPO_ROOT/$dir" && vercel env add "$newname" "$TARGET_ENV" >/dev/null 2>&1 ); then
    echo "  ok   $dir  $newname  <- $srcname  (${#value} chars)"
  else
    echo "  FAIL $dir  $newname — it may already exist. Remove and re-run:"
    echo "         (cd $dir && bunx vercel@latest env rm $newname $TARGET_ENV)"
  fi
done

echo
echo "Now set (names only):"
for dir in apps/www apps/superadmin; do
  echo "  $dir:"
  ( cd "$REPO_ROOT/$dir" && vercel env ls "$TARGET_ENV" 2>/dev/null \
    | grep -iE "BETTER_AUTH|NEXTAUTH" | awk '{print "    " $1}' )
done

cat <<'NEXT'

Both names are present now and the code prefers the new one. Nothing changes
until the next deploy, and the deploy works either way.

Next, in order (docs/runbooks/auth-env-rename.md):
  2. Get CI green and let Deploy ship.
  3. Confirm the running deployment is NOT falling back to the legacy names.
  4. Only then remove the NEXTAUTH_* vars and delete the code fallback.
NEXT
