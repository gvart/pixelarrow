// ANIM-3: the carried-load sprites, drawn in code (no generations), in the sheets' pixel scale (a man is 58 px skull
// to feet) and the dark-epic ramps: src/assets/loads/{loads.png, manifest.json}. One frame per load; `at` is
// where it sits on the carrier (shoulder: across the shoulders, over the body in every facing; chest: held in
// front, behind the body in the back facings); ox, oy the frame point placed on that anchor.
//   wood    a bundle of four short planks tied with a cord      stone   a dressed block
//   marble  a small pale dressed block                         ore     a tied sack (copper, tin, iron, silver, bronze, salt)
//   food    a woven basket of olives                           pitch   a clay jar with a stopper
// Usage: node scripts/art/pixellab/anim3/loads.mjs [--preview out.png]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeImage } from '../../lib/png.mjs';
import { blank, hexToRgb } from '../../lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const OUT = join(ROOT, 'src/assets/loads');
const OUTLINE = '#1c1411';
const WOOD = ['#30241b', '#463427', '#5e4633', '#7b5e45', '#977849'];
const STONE = ['#3b3936', '#55524d', '#716d66', '#8d887f'];
const MARBLE = ['#7d786f', '#a29d92', '#c2bdb1', '#d8d3c6'];
const SACK = ['#3a2a1d', '#54402c', '#6e573d', '#8a714f'];
const CLAY = ['#4e2a1c', '#6e3c26', '#8e5234', '#a86a46'];
const OLIVE = ['#2a2e1a', '#3f4526', '#565c32'];

const sprite = (w, h) => ({ w, h, px: Array.from({ length: h }, () => Array(w).fill(null)) });
const set = (s, x, y, c) => { if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y][x] = c; };
/** A 1 px outline round every filled pixel (4-neighbours), in place. */
function outline(s) {
  const fill = s.px.map((r) => r.slice());
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (fill[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fill[y + dy]?.[x + dx])) s.px[y][x] = OUTLINE;
  }
  return s;
}

/** Four short planks, stacked two by two, lying across the shoulders, a cord round the middle. */
function planks() {
  const s = sprite(19, 11);
  for (let p = 0; p < 4; p++) {
    const y0 = 2 + (p >> 1) * 4 - (p & 1), x0 = 1 + (p & 1) * 2 + (p >> 1);
    for (let x = x0; x < x0 + 14; x++) {
      set(s, x, y0, WOOD[4]); set(s, x, y0 + 1, WOOD[3]); set(s, x, y0 + 2, WOOD[1]);
      if ((x - x0) % 5 === 2) set(s, x, y0 + 1, WOOD[2]); // grain
    }
    set(s, x0 + 13, y0, WOOD[3]); set(s, x0 + 13, y0 + 1, WOOD[2]); // the sawn ends, darker
  }
  for (let y = 1; y < 10; y++) set(s, 8, y, SACK[3]), set(s, 9, y, SACK[1]); // the cord
  return outline(s);
}

/** A dressed block in the iso view: a light top, a mid left face, a dark right face. */
function block(R, w = 11, hh = 6) {
  const top = Math.floor(w / 4), s = sprite(w + 2, top * 2 + hh + 2), cx = (w + 1) / 2;
  for (let y = 0; y <= top * 2; y++) {
    const half = Math.round((y <= top ? y / top : (top * 2 - y) / top) * (w / 2));
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) set(s, x, y + 1, R[3]);
  }
  for (let x = 1; x <= w; x++) {
    const left = x <= cx, yTop = 1 + top + Math.round((left ? (x - 1) / (cx - 1) : (w - x) / (w - cx)) * top);
    for (let y = yTop; y < yTop + hh; y++) set(s, x, y, left ? R[1] : R[0]);
  }
  return outline(s);
}

/** A tied sack, round at the bottom, gathered at the neck. */
function sack() {
  const s = sprite(13, 14);
  // the belly: an ellipse, lit from the upper left
  for (let y = 4; y < 13; y++) for (let x = 1; x < 12; x++) {
    const dx = (x - 6) / 5.2, dy = (y - 8.6) / 4.4;
    if (dx * dx + dy * dy > 1) continue;
    const lit = -dx * 0.6 - dy * 0.5;
    set(s, x, y, lit > 0.35 ? SACK[3] : lit > -0.1 ? SACK[2] : lit > -0.5 ? SACK[1] : SACK[0]);
  }
  for (let y = 1; y < 4; y++) for (let x = 5; x <= 7; x++) set(s, x, y, x === 5 ? SACK[2] : SACK[1]); // the gathered neck
  for (let x = 4; x <= 8; x++) set(s, x, 4, CLAY[1]); // the cord
  return outline(s);
}

/** A shallow woven basket heaped with dark olives. */
function basket() {
  const s = sprite(14, 10);
  for (let y = 4; y < 9; y++) {
    const inset = Math.max(0, y - 6);
    for (let x = 1 + inset; x < 13 - inset; x++) set(s, x, y, (x + y) % 2 ? WOOD[3] : WOOD[2]);
  }
  for (let x = 1; x < 13; x++) set(s, x, 4, WOOD[4]); // the rim
  for (let y = 1; y < 4; y++) for (let x = 2 + (3 - y); x < 12 - (3 - y); x++) set(s, x, y, OLIVE[(x * 3 + y * 5) % 3]);
  return outline(s);
}

/** A clay jar: a round belly, a short neck, a stopper. */
function jar() {
  const s = sprite(11, 15);
  for (let y = 4; y < 14; y++) for (let x = 0; x < 11; x++) {
    const dx = (x - 5) / 4.4, dy = (y - 8.5) / 5;
    if (dx * dx + dy * dy > 1) continue;
    const lit = -dx * 0.7 - dy * 0.4;
    set(s, x, y, lit > 0.35 ? CLAY[3] : lit > -0.1 ? CLAY[2] : lit > -0.5 ? CLAY[1] : CLAY[0]);
  }
  for (let y = 2; y < 4; y++) for (let x = 4; x <= 6; x++) set(s, x, y, x === 4 ? CLAY[2] : CLAY[1]); // the neck
  for (let x = 3; x <= 7; x++) set(s, x, 2, CLAY[2]); // the lip
  for (let x = 4; x <= 6; x++) set(s, x, 1, WOOD[2]); // the stopper
  return outline(s);
}

// at: shoulder | chest; ox, oy: the frame point on the anchor (the planks' middle on the shoulders, a held load's top
// edge at the hands)
const LOADS = {
  wood: { s: planks(), at: 'shoulder' },
  stone: { s: block(STONE), at: 'chest' },
  marble: { s: block(MARBLE, 9, 5), at: 'chest' },
  ore: { s: sack(), at: 'chest' },
  food: { s: basket(), at: 'chest' },
  pitch: { s: jar(), at: 'chest' },
};
const names = Object.keys(LOADS);
const W = Math.max(...names.map((n) => LOADS[n].s.w)), H = Math.max(...names.map((n) => LOADS[n].s.h));
const img = blank(W * names.length, H);
const frames = {};
names.forEach((n, i) => {
  const { s, at } = LOADS[n];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.px[y][x]) img.data.set([...hexToRgb(s.px[y][x]), 255], (y * img.w + i * W + x) * 4);
  frames[n] = { x: i * W, y: 0, w: s.w, h: s.h, ox: Math.floor(s.w / 2), oy: at === 'shoulder' ? Math.floor(s.h / 2) : 2, at };
});
mkdirSync(OUT, { recursive: true });
writeImage(join(OUT, 'loads.png'), img);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ $doc: 'Carried loads (scripts/art/pixellab/anim3/loads.mjs). Each frame sits with (ox, oy) on the carrier\'s per-frame load anchor (the class manifest\'s `loads`): shoulder over the body in every facing, chest behind it in the north facings.', image: 'loads.png', scale: 0.55, frames }, null, 1) + '\n');
console.log(`loads: ${names.join(', ')} -> ${img.w}x${img.h}`);
const pv = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : null;
if (pv) {
  const S = 8, o = blank(img.w * S, img.h * S);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const k = (Math.floor(y / S) * img.w + Math.floor(x / S)) * 4;
    o.data.set(img.data[k + 3] ? img.data.subarray(k, k + 4) : [143, 138, 66, 255], (y * o.w + x) * 4);
  }
  writeImage(pv, o);
}
