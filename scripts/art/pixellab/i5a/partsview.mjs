// I5a: the colour-group parts of some frames as flat false colours, to check a class spec's `ramps` and `parts` before a
// sheet build (does the cloak group cover only the cloak, does the skin group swallow leather?).
// Usage: node scripts/art/pixellab/i5a/partsview.mjs <spec.json> <out.png> <frame.png> [<frame.png> ...] [--level dir]
//   --level dir   the frames hold the spear levelled for that facing (else upright)
// Prints the pixel count per part.
import { readFileSync } from 'node:fs';
import { readImage, writeImage } from '../../lib/png.mjs';
import { splitFrame, rampMapper, HOPLITE_RAMPS, LEVEL } from '../groups.mjs';
import { buildSheet } from '../sheet.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [specPath, out, ...rest] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const map = rampMapper(spec.ramps ?? HOPLITE_RAMPS);
const FALSE = { outline: [20, 20, 20], skin: [255, 190, 150], cloak: [170, 60, 220], crest: [255, 60, 60], emblem: [255, 160, 0], metal: [150, 150, 170],
  trim: [255, 230, 0], shadow: [70, 50, 40], wood: [120, 200, 60], weaponMetal: [0, 220, 255] };
const count = {};
const raws = [], falses = [];
for (const p of rest) {
  const img = readImage(p);
  const { parts } = splitFrame(img, map, { headDir: opt('level') ? LEVEL[opt('level')] : [0, -1], parts: spec.parts });
  const f = { w: img.w, h: img.h, data: new Uint8Array(img.w * img.h * 4) };
  parts.forEach((q, i) => {
    if (!q) return;
    count[q] = (count[q] ?? 0) + 1;
    f.data.set([...(FALSE[q] ?? [255, 0, 255]), 255], i * 4);
  });
  raws.push(img);
  falses.push(f);
}
writeImage(out, buildSheet([{ label: 'raw', imgs: raws }, { label: 'parts', imgs: falses }], { scale: 4 }));
console.log(JSON.stringify(count));
