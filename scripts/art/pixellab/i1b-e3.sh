#!/bin/bash
# I1b: rebuild the dark hoplite E3 from PixelLab (docs/v5/ASSET_LOG.md I1b). Re-fetches the character, adds the
# skeleton-v3 thrust jobs (image jobs are not stored on the character), applies the reviewed frame fixes and
# builds the processed strips, the PA-WORLD-DARK remap, contact sheets and GIFs.
# Usage: bash scripts/art/pixellab/i1b-e3.sh [sheets dir]
#
# How the inputs were made (once, before the PixelLab jobs; raw files are gitignored):
#   node scripts/art/pixellab/i1b-prep.mjs                      # E1fix (NW spear arm patched) + E1pad96 (the E3 import)
#   spear.mjs E1fix/<dir>.png E1guard128/<dir>.png ...          # thrust first frames, spear couched, head forward:
#     south-west --grip 15,36 --box 11,1,18,62 --keep 13,33,18,39
#     south-east --grip 30,37 --box 29,1,31,3 --column 30,11,61 --head 28,4,32,10 --keep 28,35,32,39
#     north-east --grip 51,36 --box 49,1,56,62 --keep 49,33,53,40 --pad 128,128,14,40   (north-east-b.png)
#     north-west --grip 54,36 --box 52,1,60,62 --keep 52,33,56,40
#   spear.mjs ... south-east --vec -0.5,-1 --ahead 34 --behind 24 --over both --pad 96,96,14,16   # SE walk start frame
#   skeleton.mjs thrustLow <dir> E1guard128/<dir>.png --frames 12 --head 50 --feet 105 --cx 65|64|52|67
#     -> docs/v5/pixellab/I1/skeletons/thrustLow_<dir>.json (sent to animate_with_skeleton_v3)
set -e
cd "$(dirname "$0")/../../.."
RAW=docs/v5/pixellab/I1/raw/E3
P=scripts/art/pixellab
node $P/fetch.mjs 62d4f135-e00e-45d6-9daa-f2c1d1d6734f $RAW
node $P/addclip.mjs 25e978ee-15da-4426-87e6-28b2f5b56512 12 $RAW/zip thrust south-west   # thrust1, rejected (kept for the comparison)
node $P/addclip.mjs dee85aff-5dbd-4828-8099-c25562267510 12 $RAW/zip thrust2 south-west
node $P/addclip.mjs c166495c-85f6-4a8f-8c44-4436746d2d50 12 $RAW/zip thrust2 south-east
node $P/addclip.mjs 34a8b616-88d8-4e9c-9686-9bcdcdb94b32 12 $RAW/zip thrust2 north-east   # NE redo (the first one ran off the canvas)
node $P/addclip.mjs 9252a8d0-6ecb-4351-a264-268e6592479e 12 $RAW/zip thrust2 north-west
node $P/fixframes.mjs $RAW/zip docs/v5/pixellab/I1/fixes-E3.json
SHEETS=${1:+--sheets $1}
node $P/build.mjs E3 $RAW/zip docs/v5/pixellab/I1/processed/E3 --post remap $SHEETS --scale 2 \
  --fps walk_template=10,walk_pixminimax=20,walk_pixminimax_se2=20,thrust=14,thrust2=14
node $P/fetch.mjs 9618a1bf-fffc-4357-96d0-c4fb67bf698e docs/v5/pixellab/I1/raw/E3elite
python3 - <<'EOF'
# the elite state is the second state of the same group: build it on its own
import json
p = 'docs/v5/pixellab/I1/raw/E3elite/zip/metadata.json'
m = json.load(open(p))
m['states'] = [s for s in m['states'] if s['folder'] == 'Elite']
json.dump(m, open('docs/v5/pixellab/I1/raw/E3elite/zip/metadata-elite.json', 'w'))
EOF
mkdir -p docs/v5/pixellab/I1/raw/E3elite/elite
cp docs/v5/pixellab/I1/raw/E3elite/zip/metadata-elite.json docs/v5/pixellab/I1/raw/E3elite/elite/metadata.json
rm -rf docs/v5/pixellab/I1/raw/E3elite/elite/Elite
cp -R docs/v5/pixellab/I1/raw/E3elite/zip/Elite docs/v5/pixellab/I1/raw/E3elite/elite/Elite
node $P/build.mjs E3elite docs/v5/pixellab/I1/raw/E3elite/elite docs/v5/pixellab/I1/processed/E3elite --post remap $SHEETS --scale 2
