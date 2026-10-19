// ANIM-1: write docs/v5/pixellab/ANIM1/<class>.sheet.json, the append spec (anim1/append.mjs) of a class's new clips:
// the class's own sheet spec (ramps, parts, feet, canvases) with only the new anims and the ANIM1 raw dir.
// Usage: node scripts/art/pixellab/anim1/spec.mjs <class>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SOURCE = {
  militia: 'docs/v5/pixellab/I5a/militia/militia.sheet.json',
  hoplite: 'docs/v5/pixellab/I3/hoplite.sheet.json',
  archer: 'docs/v5/pixellab/I5b/archer.sheet.json',
  slinger: 'docs/v5/pixellab/I5b/slinger.sheet.json',
};
const DIRS = ['south-east', 'north-east', 'south-west', 'north-west'];
const all = (attempt, extra = {}) => Object.fromEntries(DIRS.map((d) => [d, { attempt, ...extra }]));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// build: align false (the stake at his feet throws off sheetbuild's shin search, 6-7 px). The new clips: fps, first-frame canvas, picks per facing (frames: the kept frames, in order)
const IDLES = {
  breathe: { fps: 8, canvas: 'rot', spear: 'upright', dirs: all('a1') },
  shift: { fps: 8, canvas: 'rot', spear: 'upright', dirs: all('a1') },
};
const ANIMS = {
  militia: {
    ...IDLES,
    build: { fps: 10, canvas: 'tall', spear: 'upright', align: false, dirs: all('a1') },
    // frames 0-2: the log is lifted onto the shoulder (or pops in); the loop is the carry from frame 3
    carry: { fps: 12, canvas: 'tall', spear: 'upright', dirs: all('a1', { frames: range(3, 11) }) },
  },
  hoplite: IDLES,
  archer: IDLES,
  slinger: IDLES,
};
// ANIM-2 work clips (ROUND=ANIM2): tall canvas, align false (the log, rock or bush at his feet throws off the feet
// search); frames = the loop after he puts his weapon away, the blow's end held a frame where a clip runs short.
const W = (fps, picks) => ({ fps, canvas: 'tall', spear: 'upright', align: false, dirs: Object.fromEntries(Object.entries(picks).map(([d, [attempt, frames]]) => [d, { attempt, frames }])) });
const ANIMS2 = {
  militia: {
    chop: W(10, { 'south-east': ['a2', [3, 4, 5, 6, 7, 8, 9, 10, 11, 11]], 'north-east': ['a3', range(2, 11)], 'south-west': ['a2', range(2, 11)], 'north-west': ['a2', [3, 4, 5, 6, 7, 8, 9, 10, 11, 11]] }),
    mine: W(10, { 'south-east': ['a1', range(2, 11)], 'north-east': ['a2', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }),
    harvest: W(8, { 'south-east': ['a1', range(2, 11)], 'north-east': ['a2', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }),
  },
  hoplite: {
    // chop and mine north-east (a2, a1) turn to a right profile from frame 5; the AWAY retry is over the 1000-character cap
    chop: W(10, { 'south-east': ['a1', [3, 4, 5, 6, 7, 8, 9, 10, 11, 11]], 'north-east': ['a2', range(2, 11)], 'south-west': ['a2', range(2, 11)], 'north-west': ['a2', range(2, 11)] }),
    mine: W(10, { 'south-east': ['a1', range(2, 11)], 'north-east': ['a1', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }),
    harvest: W(8, { 'south-east': ['a1', range(2, 11)], 'north-east': ['a2', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }),
    build: W(10, { 'south-east': ['a1', range(2, 11)], 'north-east': ['a1', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }),
    // frames 0-1 lift the log on; the loop is the walk from frame 2
    carry: { ...W(12, { 'south-east': ['a2', range(2, 11)], 'north-east': ['a1', range(2, 11)], 'south-west': ['a1', range(2, 11)], 'north-west': ['a1', range(2, 11)] }), align: true },
  },
};
const ROUND = process.env.ROUND ?? 'ANIM1';
if (ROUND === 'ANIM2') Object.assign(ANIMS, ANIMS2);
const cls = process.argv[2];
const src = JSON.parse(readFileSync(join(ROOT, SOURCE[cls]), 'utf8'));
const { $doc, anims, raw, out, ...rest } = src;
const spec = {
  $doc: `${ROUND} append spec for ${cls} (ROUND=${ROUND} scripts/art/pixellab/anim1/spec.mjs, from ${SOURCE[cls]}). Rebuild: node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/${ROUND}/${cls}.jobs.json docs/v5/pixellab/${ROUND}/raw/${cls} && node scripts/art/pixellab/anim1/append.mjs docs/v5/pixellab/${ROUND}/${cls}.sheet.json`,
  class: cls,
  raw: `docs/v5/pixellab/${ROUND}/raw/${cls}`,
  base: `${out}/manifest.json`,
  ...rest,
  anims: ANIMS[cls],
};
writeFileSync(join(ROOT, 'docs/v5/pixellab', ROUND, `${cls}.sheet.json`), JSON.stringify(spec, null, 1) + '\n');
console.log(`${cls}: ${Object.keys(spec.anims).join(', ')}`);
