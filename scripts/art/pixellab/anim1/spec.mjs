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
const cls = process.argv[2];
const src = JSON.parse(readFileSync(join(ROOT, SOURCE[cls]), 'utf8'));
const { $doc, anims, raw, out, ...rest } = src;
const spec = {
  $doc: `ANIM-1 append spec for ${cls} (scripts/art/pixellab/anim1/spec.mjs, from ${SOURCE[cls]}). Rebuild: node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/ANIM1/${cls}.jobs.json docs/v5/pixellab/ANIM1/raw/${cls} && node scripts/art/pixellab/anim1/append.mjs docs/v5/pixellab/ANIM1/${cls}.sheet.json`,
  class: cls,
  raw: `docs/v5/pixellab/ANIM1/raw/${cls}`,
  base: `${out}/manifest.json`,
  ...rest,
  anims: ANIMS[cls],
};
writeFileSync(join(ROOT, 'docs/v5/pixellab/ANIM1', `${cls}.sheet.json`), JSON.stringify(spec, null, 1) + '\n');
console.log(`${cls}: ${Object.keys(spec.anims).join(', ')}`);
