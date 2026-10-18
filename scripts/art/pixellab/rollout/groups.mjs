// I4a colour groups of a base character: remaps its 8 rotations to PA-WORLD-DARK (remap.mjs, ramp-aware), writes the
// remapped views to <rotations>/../remap/, and a false-colour sheet (one flat colour per ramp) so it can be seen which
// parts share a ramp: the cloak, crest and trim groups must each cover only their own part for the runtime recolour.
// Usage: node scripts/art/pixellab/rollout/groups.mjs <rotations dir> <false-colour.png> [palette.json, default PA-WORLD-DARK]
// Prints JSON: { ramps: { name: share of opaque px }, colours: n before, n after }
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { remap, loadRamps } from '../remap.mjs';
import { buildSheet, DIRS8 } from '../sheet.mjs';

const [dir, out, pal] = process.argv.slice(2);
const ramps = pal ? loadRamps(pal) : loadRamps();
const FALSE = { outline: [20, 20, 20], darkBronze: [200, 150, 40], bronze: [255, 220, 0], crimson: [220, 0, 0], teamRed: [255, 90, 160],
  umber: [120, 70, 30], purpleBlack: [170, 60, 220], plaidGreen: [40, 200, 60], woad: [0, 200, 255], skin: [255, 190, 150], metal: [150, 150, 170], linen: [240, 240, 220], enemySlate: [40, 90, 255] };
const lookup = new Map(ramps.flatMap((r) => r.cols.map((c) => [c.rgb.join(','), r.name])));
const rdir = join(dir, '..', 'remap');
mkdirSync(rdir, { recursive: true });
const count = {}, before = new Set(), after = new Set();
let total = 0;
const views = [], falses = [];
for (const d of DIRS8) {
  const im = readImage(`${dir}/${d}.png`);
  const m = remap(im, ramps);
  writeImage(`${rdir}/${d}.png`, m);
  const f = { w: m.w, h: m.h, data: new Uint8Array(m.data) };
  for (let i = 0; i < m.data.length; i += 4) {
    if (!m.data[i + 3]) continue;
    before.add(im.data.slice(i, i + 3).join(','));
    const k = [m.data[i], m.data[i + 1], m.data[i + 2]].join(',');
    after.add(k);
    const name = lookup.get(k);
    count[name] = (count[name] ?? 0) + 1; total++;
    f.data.set(FALSE[name] ?? [255, 0, 255], i);
  }
  views.push(m); falses.push(f);
}
writeImage(out, buildSheet([{ label: 'remap', imgs: views }, { label: 'ramps', imgs: falses }], { scale: 4 }));
const shares = Object.fromEntries(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / total).toFixed(3)]));
console.log(JSON.stringify({ ramps: shares, colours: before.size, remapped: after.size }));
