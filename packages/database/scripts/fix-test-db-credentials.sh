#!/usr/bin/env bash
# =============================================================================
# Repoint apps/*/.env.test and packages/database/.env.test at the test branch.
#
# RUN THIS YOURSELF. It prompts for the connection strings (hidden — they carry
# passwords), VALIDATES each one by connecting, and only then writes them.
#
#   bash packages/database/scripts/fix-test-db-credentials.sh
#
# ---------------------------------------------------------------------------
# THE POINT OF THIS SCRIPT IS THE LABEL CHECK.
#
# The DB suites TRUNCATE TABLES. If a production connection string ever lands in
# .env.test — one wrong paste out of a Neon console listing every branch — the
# next `bun run test:db` destroys production.
#
# `db-guard.ts` already refuses to run the suites against a database that is not
# labelled `edura-env:test`. That is the backstop. This is the earlier gate:
# refuse to WRITE the wrong URL in the first place, so the mistake is caught
# while you are looking at it rather than by a guard someone might one day pass
# `--force` to.
# ---------------------------------------------------------------------------
#
# Where to get the values: Neon Console -> the TEST branch -> Connection Details.
#   DATABASE_URL  pooled,   role edura_app     (host contains "-pooler")
#   DIRECT_URL    unpooled, role neondb_owner  (no "-pooler")
#   ADMIN_URL     pooled,   role neondb_owner
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

PSQL=""
for c in psql /opt/homebrew/opt/postgresql@18/bin/psql /opt/homebrew/bin/psql; do
  command -v "$c" >/dev/null 2>&1 && { PSQL="$c"; break; }
done
[ -n "$PSQL" ] || { echo "psql not found:  brew install postgresql@18"; exit 1; }

bold "Repoint the TEST database credentials"
dim "Neon Console -> TEST branch -> Connection Details."
dim "Leave a prompt blank to keep the current value for that variable."
echo

# Connect and report the role + the edura-env label. Same query db-guard.ts uses.
probe() { # $1=url ; echos "role|label" or "ERR:<msg>"
  local url="$1" out
  out=$("$PSQL" "$url" -tAX -c \
    "SELECT current_user || '|' || COALESCE(shobj_description(d.oid,'pg_database'),'<unlabelled>')
       FROM pg_database d WHERE d.datname = current_database()" 2>&1 | head -1)
  case "$out" in
    *"|"*) printf '%s' "$out" ;;
    *) printf 'ERR:%s' "$(printf '%s' "$out" | sed -E 's/.*(ERROR|error): *//; s/"//g' | head -c 120)" ;;
  esac
}

# Read one URL, validate it, refuse anything not labelled edura-env:test.
read_url() { # $1=var name, $2=hint  -> sets URL_OUT ("" = skipped)
  local name="$1" hint="$2" url probe_out role label
  URL_OUT=""
  read -rsp "  $name ($hint): " url; echo
  [ -z "$url" ] && { warn "$name unchanged"; return 0; }

  case "$url" in
    postgres://*|postgresql://*) ;;
    *) bad "$name does not look like a postgres URL — not written"; return 1 ;;
  esac

  probe_out=$(probe "$url")
  case "$probe_out" in
    ERR:*) bad "$name could not connect: ${probe_out#ERR:}"; return 1 ;;
  esac

  role="${probe_out%%|*}"
  label="${probe_out#*|}"

  if [ "$label" != "edura-env:test" ]; then
    echo
    bad "REFUSED — that database is labelled: $label"
    printf '\033[1;31m'
    echo "      The test suites TRUNCATE TABLES. Writing this into .env.test"
    echo "      would point them at a database that is not the test branch."
    printf '\033[0m'
    echo "      Expected label: edura-env:test"
    echo "      Use the TEST branch's connection string, not dev or production."
    return 1
  fi

  ok "$name → role '$role', labelled $label"
  URL_OUT="$url"
  return 0
}

FAILED=0
read_url DATABASE_URL "pooled, edura_app"      || FAILED=1; NEW_DB="$URL_OUT"
read_url DIRECT_URL   "unpooled, neondb_owner" || FAILED=1; NEW_DIRECT="$URL_OUT"
read_url ADMIN_URL    "pooled, neondb_owner"   || FAILED=1; NEW_ADMIN="$URL_OUT"
echo

if [ "$FAILED" -ne 0 ]; then
  bold "Nothing was written — fix the errors above and re-run."
  exit 1
fi

# Rewrite KEY=value in place, preserving every other line and any comments.
set_var() { # $1=file $2=key $3=value
  local file="$1" key="$2" val="$3" tmp
  [ -z "$val" ] && return 0
  [ -f "$file" ] || { warn "missing $file — skipped"; return 0; }
  # Follow symlinks: the worktrees symlink these files to the main checkout, and
  # writing through the link is the intended behaviour (one source of truth).
  file="$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$file")"
  tmp="$(mktemp)"
  KEY="$key" VAL="$val" python3 - "$file" "$tmp" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
key, val = os.environ["KEY"], os.environ["VAL"]
lines = open(src).read().split("\n")
found = False
for i, l in enumerate(lines):
    if l.startswith(key + "="):
        lines[i] = f"{key}={val}"
        found = True
if not found:
    lines.append(f"{key}={val}")
open(dst, "w").write("\n".join(lines))
PY
  cat "$tmp" > "$file" && rm -f "$tmp"
}

TARGETS=(
  "$ROOT/packages/database/.env.test"
  "$ROOT/apps/www/.env.test"
  "$ROOT/apps/superadmin/.env.test"
)

bold "Writing"
for f in "${TARGETS[@]}"; do
  set_var "$f" DATABASE_URL "$NEW_DB"
  set_var "$f" DIRECT_URL   "$NEW_DIRECT"
  set_var "$f" ADMIN_URL    "$NEW_ADMIN"
  [ -f "$f" ] && ok "${f#"$ROOT"/}"
done
echo

bold "Verifying with the real guard"
( cd "$ROOT/apps/www" && bun run pretest:db ) && {
  echo
  bold "✅ Test database is reachable and correctly labelled."
  echo "   Run the suites:"
  echo "     bun run --filter edura test:db:ci"
  echo "     bun run --filter superadmin test:db"
} || {
  echo
  bad "The guard still refuses. The URLs were written; read its message above."
  exit 1
}

echo
dim "These files are gitignored. GitHub Actions uses its own secrets —"
dim "if CI's DB job is also failing, update the repo secrets too."
