#!/usr/bin/env bash
# Turns the raw 2x Playwright PNGs into the WebP files apps/www serves.
#
# Playwright writes at deviceScaleFactor 2, so a 1440x900 shot is 2880x1800 and
# roughly 1 MB. The site displays these inside a plate a few hundred CSS px
# wide, and Egyptian mobile data is the constraint rather than anyone's desktop,
# so each file is downscaled to ~2x its real display width and encoded to WebP.
# ASSETS.md's budget is ~180 KB per still.
#
# NOTHING IS COMPOSITED HERE, deliberately. `center-team` was going to be two
# captures of one URL stacked into a single plate; both reasons it was dropped
# are worth keeping written down. The manifest reserves a fixed aspect per slot,
# and two stacked 1440x900 frames are 0.8 against a reserved 1.6 — landing it
# would have changed the plate's geometry, which is the one thing the manifest
# exists to prevent. And the second half was a spinner, not a refusal. A
# composited marketing image is also a thing nobody can reproduce from the spec
# six months later.
#
# Requires: sips (macOS) and cwebp (`brew install webp`).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/raw"
OUT="$(cd "$HERE/../../../www" && pwd)/public/system"

[ -d "$RAW" ] || { echo "No raw/ directory — run the capture spec first."; exit 1; }
mkdir -p "$OUT"

# Phone slots display narrow; desktop slots wide. Widths are 2x display, not 2x
# capture. The curated phone slots are named individually because ASSETS.md
# fixed their ids; library phone shots carry a `-phone` suffix instead, so the
# convention is self-describing for anything added later.
phone_slot() {
  case "$1" in
    student-card|student-learn|parent-pay|assistant-door) return 0 ;;
    *-phone) return 0 ;;
    *) return 1 ;;
  esac
}

# Encodes every PNG in $1 into WebP under $2. Used twice: once for the curated
# slots, once for the library, which stays in its own directory because nothing
# on the site reads it.
encode_dir() {
  local src="$1" dest="$2" label="$3"
  shopt -s nullglob
  local files=("$src"/*.png)
  if [ ${#files[@]} -eq 0 ]; then
    echo "  ($label: nothing to do)"
    return 0
  fi
  mkdir -p "$dest"

  local total=0
  for f in "${files[@]}"; do
    local base width size kb flag
    base="$(basename "$f" .png)"
    if phone_slot "$base"; then width=780; else width=1600; fi

    cp "$f" "$src/.work.png"
    sips -Z "$width" "$src/.work.png" >/dev/null
    cwebp -q 82 -quiet "$src/.work.png" -o "$dest/$base.webp"
    rm -f "$src/.work.png"

    size=$(stat -f%z "$dest/$base.webp")
    total=$((total + size))
    kb=$((size / 1024))
    flag=""
    [ "$kb" -gt 180 ] && flag="  <-- OVER the 180 KB budget"
    printf '  %-34s %4d KB%s\n' "$base.webp" "$kb" "$flag"
  done
  echo "  $label: $((total / 1024)) KB across ${#files[@]} files"
  echo
}

echo "curated slots -> $OUT"
encode_dir "$RAW" "$OUT" "curated"

echo "library -> $OUT/library"
encode_dir "$RAW/library" "$OUT/library" "library"

echo "public/system is now $(du -sh "$OUT" | cut -f1) in total."
