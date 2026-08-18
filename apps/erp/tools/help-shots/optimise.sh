#!/usr/bin/env bash
# Post-processes the raw Playwright captures into what the help pages actually serve.
#
# Playwright writes 2x PNGs (2560px wide); the articles display them at ~736px.
# Shipping the raw output cost 5.2 MB across 30 files on a PUBLIC marketing page.
# Downscaling to 1440 (still ~2x the display width, so it stays sharp on retina)
# and encoding to WebP brings that to under 1 MB.
#
# Requires: sips (macOS built-in) and cwebp (`brew install webp`).
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
