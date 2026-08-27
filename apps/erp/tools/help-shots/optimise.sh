#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../../public/help" && pwd)"
cd "$DIR"

shopt -s nullglob
pngs=(*.png)
if [ ${#pngs[@]} -eq 0 ]; then
  echo "No new PNGs in $DIR — nothing to optimise."
  exit 0
fi

for f in "${pngs[@]}"; do
  sips -Z 1440 "$f" >/dev/null
  cwebp -q 82 -quiet "$f" -o "${f%.png}.webp"
  rm -f "$f"
  echo "  $f -> ${f%.png}.webp"
done

echo "Done. $DIR is now $(du -sh . | cut -f1)."
