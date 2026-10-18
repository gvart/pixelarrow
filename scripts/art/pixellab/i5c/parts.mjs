// I5c: which part every pixel of a class's 4 game-facing rotations lands in under a spec's ramps and `parts` map
// (groups.mjs splitFrame, as sheetbuild runs it), as a false-colour sheet beside the remapped figure, and the
// ramp:step counts per part, so the horse coat can be kept out of skin / metal / trim where the colours allow.
// Usage: node scripts/art/pixellab/i5c/parts.mjs <spec.json> <out.png> [--scale 4]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage, writeImage } from '../../lib/png.mjs';
import { blank } from '../../lib/ops.mjs';
import { buildSheet } from '../sheet.mjs';
import { splitFrame, rampMapper, HOPLITE_RAMPS } from '../groups.mjs';
import { FACINGS, rotDir } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [specPath, out] = args;
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const map = rampMapper(spec.ramps ?? HOPLITE_RAMPS);
const COL = {
  outline: [20, 20, 20], skin: [240, 200, 160], cloak: [150, 40, 200], crest: [255, 60, 60], emblem: [255, 160, 0],
  metal: [80, 140, 255], trim: [255, 230, 60], shadow: [90, 90, 90], wood: [140, 255, 140], weaponMetal: [0, 255, 255],
};
const count = {};
const imgs = [];
for (const d of FACINGS) {
  const im = readImage(join(rotDir(spec.class), `${d}.png`));
  const r = splitFrame(im, map, { parts: spec.parts, headDir: [0, -1] });
  const fc = blank(im.w, im.h), rm = blank(im.w, im.h);
  r.parts.forEach((p, i) => {
    if (!p) return;
    fc.data.set([...COL[p], 255], i * 4);
    rm.data.set([...r.info[i].rgb, 255], i * 4);
    const k = `${p} <- ${r.info[i].ramp}:${r.info[i].step}`;
    count[k] = (count[k] ?? 0) + 1;
  });
  imgs.push(rm, fc);
}
writeImage(out, buildSheet([{ label: `${spec.class} remapped | parts (skin tan, cloak purple, metal blue, trim yellow, shadow grey, wood green, weaponMetal cyan)`, imgs }], { scale: Number(opt('scale', 4)) }));
for (const [k, n] of Object.entries(count).sort()) console.log(`${k.padEnd(28)} ${n}`);
