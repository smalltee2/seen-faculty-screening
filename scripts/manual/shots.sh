#!/bin/zsh
# Screenshots for the user manual (docs/manual). Needs Google Chrome on the Mac.
# Usage: scripts/manual/shots.sh [base-url]   (default: the live site)
# Output: docs/manual/shots/*.png (1400 px wide desktop views)
set -eu
BASE="${1:-https://smalltee2.github.io/seen-faculty-screening/}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/manual/shots"
mkdir -p "$OUT"

shot() { # name width height url-fragment
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$2,$3" --virtual-time-budget=8000 --screenshot="$OUT/$1.png" "${BASE}$4" 2>/dev/null
  print -r -- "  $1.png"
}

print "Screenshots from $BASE"
shot overview        1400 2600 '#/'
shot lecturers-cards 1400 1500 '#/lecturers'
shot lecturers-table 1400 1200 '#/lecturers?view=table'
shot lecturers-fail  1400 1500 '#/lecturers?filter=not_met&scope=grad'
shot person          1400 2200 '#/person/Chaiwat%20Photong'
shot admin           1400 1400 '#/admin'
