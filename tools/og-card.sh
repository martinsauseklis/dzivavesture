#!/usr/bin/env bash
# Render tools/og-card.html to public/og.png at exactly 1200x630.
#
# --virtual-time-budget matters: without it Chrome screenshots before the fonts
# have loaded and the text comes out in the fallback face.
set -euo pipefail
cd "$(dirname "$0")/.."

google-chrome --headless --disable-gpu --no-sandbox \
  --screenshot="public/og.png" \
  --window-size=1200,630 \
  --force-device-scale-factor=1 \
  --hide-scrollbars \
  --virtual-time-budget=4000 \
  "file://$PWD/tools/og-card.html" 2>/dev/null

python3 - <<'PY'
import struct
raw = open('public/og.png', 'rb').read()
w, h = struct.unpack('>II', raw[16:24])   # PNG IHDR: width and height at bytes 16–24
assert (w, h) == (1200, 630), f'wrong size: {w}x{h}'
print(f'public/og.png  {w}x{h}  {len(raw)/1024:.0f} KB')
PY
