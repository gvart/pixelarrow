// I5b: write a class's sheetbuild spec (docs/v5/pixellab/I5b/<class>.sheet.json) from its compact picks file
// (docs/v5/pixellab/I5b/<class>.picks.json): the canvases come from prep.mjs, the feet from the rotations.
// picks: { class, scale, ramps, parts?, tiers, anims: { <anim>: { fps, hold?, strike?, canvas, spear,
//          dirs: { se|ne|sw|nw: "<attempt>" | { attempt, fixes?, frames? } } } } }
// Usage: node scripts/art/pixellab/i5b/mkspec.mjs <class>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from '../../lib/png.mjs';
import { ROOT } from '../../lib/manifest.mjs';
import { fitOf } from '../rig.mjs';
import { CANVASES, DIRS } from './prep.mjs';

const D = { se: 'south-east', ne: 'north-east', sw: 'south-west', nw: 'north-west' };
const cls = process.argv[2];
const base = join(ROOT, 'docs/v5/pixellab/I5b');
const p = JSON.parse(readFileSync(join(base, `${cls}.picks.json`), 'utf8'));
const raw = `docs/v5/pixellab/I5b/raw/${cls}`;
const rowsFeet = {};
for (const d of DIRS) {
  const f = fitOf(readImage(join(ROOT, raw, 'first', `rot_${d}.png`)));
  rowsFeet[d] = [Math.round(f.cx), f.feet];
}
// canvas names: rot, tall, atk, die (prep.mjs) and the guard frames: guard (tall), gatk (atk)
const canvases = Object.fromEntries(Object.entries(CANVASES).map(([k, c]) => [k, c.at]));
canvases.guard = CANVASES.tall.at;
canvases.gatk = CANVASES.atk.at;
for (const [k, v] of Object.entries(p.extraCanvases ?? {})) canvases[k] = CANVASES[v].at;
const anims = {};
for (const [a, x] of Object.entries(p.anims)) {
  const dirs = {};
  for (const [k, v] of Object.entries(x.dirs)) dirs[D[k] ?? k] = typeof v === 'string' ? { attempt: v } : v;
  const { dirs: _, ...rest } = x;
  anims[a] = { ...rest, dirs };
}
const spec = {
  $doc: `I5b ${cls} sheet spec for scripts/art/pixellab/sheetbuild.mjs, written by scripts/art/pixellab/i5b/mkspec.mjs from ${cls}.picks.json. Rebuild: node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/I5b/${cls}.jobs.json ${raw} && node scripts/art/pixellab/sheetbuild.mjs docs/v5/pixellab/I5b/${cls}.sheet.json`,
  class: cls,
  raw,
  out: `src/assets/sheets/${cls}`,
  scale: p.scale ?? 0.55,
  ramps: p.ramps,
  ...(p.parts ? { parts: p.parts } : {}),
  ...(p.crest === false ? { crest: false } : {}),
  ...(p.emblem === false ? { emblem: false } : {}),
  ...(p.stature ? { stature: p.stature } : {}),
  ...(p.spear === false ? { spear: false } : {}),
  ...(p.metalKind ? { metalKind: p.metalKind } : {}),
  ...(p.metalSlots ? { metalSlots: p.metalSlots } : {}),
  ...(p.greyCut !== undefined ? { greyCut: p.greyCut } : {}),
  rowsFeet,
  canvases,
  anims,
  tiers: p.tiers,
};
writeFileSync(join(base, `${cls}.sheet.json`), JSON.stringify(spec, null, 1) + '\n');
console.log(`${cls}: ${Object.keys(anims).length} anims -> ${cls}.sheet.json`);
