#!/usr/bin/env bash
# Turns Playwright's raw context recordings into the pair of files apps/www
# serves, plus a poster still.
#
# Playwright records the WHOLE context as VP8 WebM, so the raw file opens on a
# page load. `clips.spec.ts` writes `clips.json` with the measured millisecond
# the action began and ended; this trims to exactly that window rather than to a
# guessed offset.
#
# Two encodes per clip, because no single format plays everywhere:
#   • MP4  H.264 + yuv420p  — the pixel format matters; without it Safari and
#                             several Android browsers show a black rectangle.
#   • WebM VP9              — smaller at the same quality for flat UI footage.
# `faststart` moves the MP4 index to the front so playback can begin before the
# file has finished arriving, which on an Egyptian mobile connection is the
# difference between a video and a spinner.
#
# The poster is pulled from the LAST second, not the first: a reduced-motion
# reader sees the poster instead of the clip, so it should show the outcome the
# clip argues for, not the blank state it opens on.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/video-raw"
JSON="$HERE/clips.json"
OUT="$(cd "$HERE/../../../www" && pwd)/public/system"

[ -f "$JSON" ] || { echo "No clips.json — run the clip spec first."; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found."; exit 1; }
mkdir -p "$OUT"

count=$(python3 -c "import json;print(len(json.load(open('$JSON'))['cuts']))")
[ "$count" -gt 0 ] || { echo "clips.json has no cuts."; exit 1; }

for i in $(seq 0 $((count - 1))); do
  read -r name file start dur w h <<<"$(python3 -c "
import json
c = json.load(open('$JSON'))['cuts'][$i]
print(c['name'], c['file'], c['start'], c['duration'], c['width'], c['height'])
")"

  src="$RAW/$file"
  [ -f "$src" ] || { echo "  $name: raw file missing ($file), skipped"; continue; }

  # Even dimensions are required by H.264. Phone clips keep their width;
  # desktop clips drop to 1280 wide, which is the size the plate displays at.
  if [ "$w" -gt 1000 ]; then scale="1280:-2"; else scale="$w:-2"; fi

  ffmpeg -y -loglevel error -ss "$start" -t "$dur" -i "$src" \
    -vf "scale=$scale,fps=25" -an \
    -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 30 -preset slow \
    -movflags +faststart "$OUT/$name.mp4"

  ffmpeg -y -loglevel error -ss "$start" -t "$dur" -i "$src" \
    -vf "scale=$scale,fps=25" -an \
    -c:v libvpx-vp9 -crf 38 -b:v 0 -deadline good -cpu-used 2 \
    "$OUT/$name.webm"

  # Poster from near the end — the state the clip resolves to.
  poster_at=$(python3 -c "print(max(0.0, $dur - 1.0))")
  ffmpeg -y -loglevel error -ss "$poster_at" -i "$OUT/$name.mp4" -frames:v 1 "$RAW/$name-poster.png"
  cwebp -q 82 -quiet "$RAW/$name-poster.png" -o "$OUT/$name-poster.webp"

  mp4k=$(( $(stat -f%z "$OUT/$name.mp4") / 1024 ))
  webmk=$(( $(stat -f%z "$OUT/$name.webm") / 1024 ))
  postk=$(( $(stat -f%z "$OUT/$name-poster.webp") / 1024 ))
  flag=""
  { [ "$mp4k" -gt 2048 ] || [ "$webmk" -gt 2048 ]; } && flag="  <-- OVER the 2 MB budget"
  printf '  %-16s %5.1fs   mp4 %4d KB   webm %4d KB   poster %3d KB%s\n' \
    "$name" "$dur" "$mp4k" "$webmk" "$postk" "$flag"
done

cat <<'NOTE'

Two of these wrote to the dev database and neither undoes itself:
  • counter-board took 75 ج.م in cash through the real money engine
  • walk-in created a shell student (user + profile + roster + invite token)
List what the walk-in run created, and remove it, from the repo root:
  bun --env-file=packages/database/.env apps/erp/tools/system-shots/cleanup-walkins.ts
  bun --env-file=packages/database/.env apps/erp/tools/system-shots/cleanup-walkins.ts --yes
NOTE
