#!/usr/bin/env bash
# Render every kv-*.html in this folder to ../<NAME>.png at 2× using headless Chrome.
# Usage: ./render.sh            (all)
#        ./render.sh kv-03      (one)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$(cd .. && pwd)"
SCALE="${SCALE:-2}"

for f in ${1:-kv-}*.html; do
  name="${f%.html}"
  # frame size is declared in the file as --w / --h
  w=$(grep -oE -- '--w: *[0-9]+px' "$f" | head -1 | grep -oE '[0-9]+')
  h=$(grep -oE -- '--h: *[0-9]+px' "$f" | head -1 | grep -oE '[0-9]+')
  png="$OUT/$(echo "$name" | sed -E 's/^kv-([0-9]+)-/KV-\1-/').png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --force-device-scale-factor="$SCALE" --window-size="$w,$h" \
    --virtual-time-budget=2500 --run-all-compositor-stages-before-draw \
    --screenshot="$png" "file://$PWD/$f" >/dev/null 2>&1
  echo "→ $(basename "$png")  (${w}×${h} @${SCALE}x)"
done
