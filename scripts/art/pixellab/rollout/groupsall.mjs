// I4a colour groups for every class in docs/v5/pixellab/bases.json: remaps each class's rotations to PA-WORLD-DARK-I4a,
// reports the share of each ramp over the 8 views, and writes one false-colour sheet (S, SE, NE, N per class, one flat
// colour per ramp) to check that the cloak, crest and trim each sit in a ramp of their own.
// Usage: node scripts/art/pixellab/rollout/groupsall.mjs <false-colour.png>   -> prints { class: { ramp: share } }
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { remap, loadRamps } from '../remap.mjs';
import { buildSheet, DIRS8 } from '../sheet.mjs';

const [out] = process.argv.slice(2);
const ramps = loadRamps(join(ROOT, 'docs/v5/pixellab/I4a/palette-dark-i4a.json'));
const FALSE = { outline: [20, 20, 20], darkBronze: [200, 150, 40], bronze: [255, 220, 0], crimson: [220, 0, 0], teamRed: [255, 90, 160],
  umber: [120, 70, 30], purpleBlack: [170, 60, 220], plaidGreen: [40, 200, 60], skin: [255, 190, 150], metal: [150, 150, 170],
  linen: [240, 240, 220], enemySlate: [40, 90, 255] };
const lookup = new Map(ramps.flatMap((r) => r.cols.map((c) => [c.rgb.join(','), r.name])));
const bases = JSON.parse(readFileSync(join(ROOT, 'docs/v5/pixellab/bases.json'), 'utf8'));
const rows = [], report = {};
for (const [id, c] of Object.entries(bases.classes)) {
  const count = {}; let total = 0;
  const imgs = [];
  for (const d of DIRS8) {
    const m = remap(readImage(join(ROOT, c.rotations, `${d}.png`)), ramps);
    const f = { w: m.w, h: m.h, data: new Uint8Array(m.data) };
    for (let i = 0; i < m.data.length; i += 4) {
      if (!m.data[i + 3]) continue;
      const name = lookup.get(`${m.data[i]},${m.data[i + 1]},${m.data[i + 2]}`);
      count[name] = (count[name] ?? 0) + 1; total++;
      f.data.set(FALSE[name] ?? [255, 0, 255], i);
    }
    if (['south', 'south-east', 'north-east', 'north'].includes(d)) imgs.push(m, f);
  }
  rows.push({ label: id, imgs });
  report[id] = Object.fromEntries(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / total).toFixed(3)]));
}
writeImage(out, buildSheet(rows, { scale: 2 }));
console.log(JSON.stringify(report, null, 0).replace(/\},/g, '},\n'));
