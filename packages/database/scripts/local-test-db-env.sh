#!/usr/bin/env bash
#
# Point the three .env.test files at the LOCAL Postgres, or back at the Neon
# `test` branch. Both sets of values are kept side by side in each file, so
# switching is a one-word command and nothing has to be re-typed from memory.
#
#   ./local-test-db-env.sh local   # localhost, DATABASE_DRIVER=pg
#   ./local-test-db-env.sh neon    # ep-morning-snow-…, DATABASE_DRIVER=ws
#
# Only the DB lines move. Every other key in those files -- the seed
# credentials, the app secrets -- is left exactly as it is.
set -euo pipefail

target="${1:?usage: local-test-db-env.sh local|neon}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DB="${EDURA_LOCAL_DB:-edura_test}"
APP_PW="${EDURA_LOCAL_APP_PW:-app_pw_local}"
SUPER="${EDURA_LOCAL_SUPERUSER:-$(whoami)}"

case "$target" in
  local) marker="LOCAL" ;;
  neon)  marker="NEON" ;;
  *) echo "target must be 'local' or 'neon'" >&2; exit 1 ;;
esac

for f in "$root/packages/database/.env.test" "$root/apps/erp/.env.test" "$root/apps/superadmin/.env.test"; do
  [ -f "$f" ] || { echo "skip (absent): $f"; continue; }
  python3 - "$f" "$marker" "$DB" "$APP_PW" "$SUPER" <<'PY'
import re, sys
path, marker, db, pw, superuser = sys.argv[1:6]
src = open(path, encoding="utf-8").read()

local = {
    "DATABASE_URL": f"postgresql://edura_app:{pw}@localhost:5432/{db}",
    "DIRECT_URL":   f"postgresql://{superuser}@localhost:5432/{db}",
    "ADMIN_URL":    f"postgresql://{superuser}@localhost:5432/{db}",
    "DATABASE_DRIVER": "pg",
}

# Stash whatever is live now under the other marker, once, so nothing is lost.
def stash(text, tag):
    out = []
    for line in text.split("\n"):
        m = re.match(r"^(DATABASE_URL|DIRECT_URL|ADMIN_URL|DATABASE_DRIVER)=(.*)$", line)
        if m and f"# {tag} {m.group(1)}=" not in text:
            out.append(f"# {tag} {line}")
        out.append(line)
    return "\n".join(out)

live_is_local = "localhost:5432" in src
src = stash(src, "LOCAL" if live_is_local else "NEON")

wanted = {}
if marker == "LOCAL":
    wanted = local
else:
    for k in ("DATABASE_URL", "DIRECT_URL", "ADMIN_URL", "DATABASE_DRIVER"):
        m = re.search(rf"^# NEON {k}=(.*)$", src, re.M)
        if m:
            wanted[k] = m.group(1)

lines = []
for line in src.split("\n"):
    m = re.match(r"^(DATABASE_URL|DIRECT_URL|ADMIN_URL|DATABASE_DRIVER)=", line)
    if m and m.group(1) in wanted:
        lines.append(f"{m.group(1)}={wanted[m.group(1)]}")
    else:
        lines.append(line)
open(path, "w", encoding="utf-8").write("\n".join(lines))
print(f"  {path} -> {marker}")
PY
done
echo "done — .env.test now points at $target"
