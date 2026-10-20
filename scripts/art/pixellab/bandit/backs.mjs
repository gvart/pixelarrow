// Bandit (polish): the back-view clips that turn to the viewer mid-clip are rebuilt from the bandit's own back frames,
// in place in src/assets/sheets/mob_bandit/ (north-east and north-west rows only; no generations). The north-west
// clips were generated and the north-east are their mirrors, so mirroring cannot help: both turn the same way.
// Usage: node scripts/art/pixellab/bandit/backs.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../lib/png.mjs';

// clip <- [source clip, source frames]
const BACKS = {
  look: ['idle', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]], // the head turns showed the face; from behind it is the idle
  adjust: ['idle', [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]], // was look reversed
  block: ['block', [0, 1, 2, 3, 3, 3, 3, 3, 2, 1, 0, 0]], // the parry held up, not the turn of frames 4-8
  thrust: ['thrust', [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0]], // the wind-up peaks on the strike frame (6), not the turned lunge
  build: ['thrust', [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0]], // was thrust
  cheer: ['block', [0, 2, 3, 2, 3, 2, 3, 2, 3, 2, 0, 0]], // the sword shaken up over the shoulder, not the front-facing jeer
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const dir = join(ROOT, 'src/assets/sheets/mob_bandit');
const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const img = readImage(join(dir, m.image));
const FW = m.frame.w, FH = m.frame.h, wrap = m.wrap, R = m.rows.length;
const cell = (col, r) => [(col % wrap) * FW, (Math.floor(col / wrap) * R + r) * FH];
const read = (col, r) => {
  const [x0, y0] = cell(col, r), f = new Uint8Array(FW * FH * 4);
  for (let y = 0; y < FH; y++) f.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + FW) * 4), y * FW * 4);
  return f;
};
const write = (col, r, f) => {
  const [x0, y0] = cell(col, r);
  for (let y = 0; y < FH; y++) img.data.set(f.subarray(y * FW * 4, (y + 1) * FW * 4), ((y0 + y) * img.w + x0) * 4);
};
// read every source frame first: block is its own source
const plan = Object.entries(BACKS).flatMap(([name, [src, frames]]) => {
  const a = m.anims[name], s = m.anims[src];
  if (frames.length !== a.frames) throw new Error(`${name}: ${frames.length} frames for ${a.frames}`);
  return ['north-east', 'north-west'].map((d) => {
    const r = m.rows.indexOf(d);
    return [a, r, frames.map((i) => read(s.col + i, r))];
  });
});
for (const [a, r, fs] of plan) fs.forEach((f, i) => write(a.col + i, r, f));
writeImage(join(dir, m.image), img);
console.log(`mob_bandit backs: ${Object.keys(BACKS).join(', ')}`);
