#!/usr/bin/env bash
# Turns the raw 2x Playwright PNGs into the WebP files apps/www serves.
#
# NO DOWNSCALING. The source keeps every pixel it was captured with.
#
# The first version resized each shot to 1600px wide and encoded it at q82,
# which threw away 44% of the linear resolution of a 2880px capture and then
# compressed the remainder — and `next/image` re-encoded THAT at its default
# quality of 75. Three lossy steps, on an image whose whole content is 13px
# Arabic labels, hairline rules and figures in a money column. Text is the
# worst possible subject for that pipeline.
#
# Captures now come in at deviceScaleFactor 3 (4320x2700 for a 1440x900 screen)
# and are encoded once, near-lossless. That is not the extravagance it sounds
# like: flat interface art compresses extremely well, so a full 4K plate lands
# around 115 KB — smaller than the old 180 KB budget the downscaling existed to
# meet. And the SOURCE size is not what a visitor downloads: `next/image`
# resizes per device, so shipping a 4K master costs storage, not bandwidth.
#
# `-sharp_yuv` matters here. WebP subsamples chroma by default, which is
# invisible on a photograph and very visible on coloured text and 1px rules.
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
# Requires: cwebp (`brew install webp`).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/raw"
OUT="$(cd "$HERE/../../../www" && pwd)/public/system"

[ -d "$RAW" ] || { echo "No raw/ directory — run the capture spec first."; exit 1; }
mkdir -p "$OUT"

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
    local base size kb flag
    base="$(basename "$f" .png)"
    cwebp -q 92 -sharp_yuv -quiet "$f" -o "$dest/$base.webp"

    size=$(stat -f%z "$dest/$base.webp")
    total=$((total + size))
    kb=$((size / 1024))
    flag=""
    # Roomier than the old 180 KB, because these are now full-resolution
    # masters that next/image resizes per device rather than files served
    # as-is. A plate over 400 KB means something went wrong in the capture.
    [ "$kb" -gt 400 ] && flag="  <-- unusually large, check the capture"
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
