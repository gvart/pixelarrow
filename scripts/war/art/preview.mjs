// ART-4 preview: contact sheet of public/war/tiles + objects, and a 1:1 iso mock-up with transitions, a height
// step, objects and soldier frames. Usage: node scripts/war/art/preview.mjs <out dir>
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/art4';
mkdirSync(OUT, { recursive: true });
const T = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json')));
const O = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const BG = [22, 17, 13, 255];
const fill = (im) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(BG, i * 4); return im; };
const sheets = Object.fromEntries(T.sheets.map((s) => {
  const im = readImage(join(ROOT, 'public/war/tiles', s.file));
  return [s.pair, [...Array(16)].map((_, m) => crop(im, { x: s.maskToFrame[m] * T.tile.w, y: 0, w: T.tile.w, h: T.tile.h }))];
}));
const objs = Object.fromEntries(O.objects.map((o) => [o.id, { ...o, im: readImage(join(ROOT, 'public/war/objects', o.file)) }]));

// ---- contact sheet: every tile set row (x2) + every object (x1) on dark ground
{
  const rows = T.sheets.length, cw = 16 * 68;
  const objW = O.objects.reduce((s, o) => s + o.w + 12, 0), objH = Math.max(0, ...O.objects.map((o) => o.h));
  const im = fill(blank(Math.max(cw, Math.min(objW, 2400)), rows * 52 + 8 + 24 + (T.cliffs?.length ?? 0) * 0 + objH * Math.ceil(objW / 2400) + 40));
  T.sheets.forEach((s, r) => sheets[s.pair].forEach((t, i) => paste(im, t, i * 68 + 2, r * 52 + 2)));
  let x = 2, y = rows * 52 + 8;
  (T.cliffs ?? []).forEach((c) => { const ci = readImage(join(ROOT, 'public/war/tiles', c.file)); for (let k = 0; k < 3; k++) paste(im, ci, x, y + k * 16); x += 72; });
  x = 2; y += 60; let rowH = 0;
  for (const o of Object.values(objs)) { if (x + o.w > im.w) { x = 2; y += rowH + 8; rowH = 0; } paste(im, o.im, x, y); x += o.w + 12; rowH = Math.max(rowH, o.h); }
  const out = crop(im, { x: 0, y: 0, w: im.w, h: Math.min(im.h, y + rowH + 4) });
  writeImage(join(OUT, 'ART4_contact.png'), resizeNearest(out, out.w * 2, out.h * 2));
}

// ---- mock-up: a corner field of terrains, autotiled per pair, one raised plateau, objects and soldiers
const HW = 32, HH = 16, LH = T.tile.levelPx, N = 18;
const W = 2 * N * HW + 80, H = 2 * N * HH + 4 * LH + 420, OX = N * HW + 40, OY = 4 * LH + 360;
const img = fill(blank(W, H));
const blit = (src, x, y) => paste(img, src, Math.round(x), Math.round(y));
// corner terrain: g grass, d dirt, s sand, r rock, f forest floor, m marsh, w shallow, W deep
const V = [];
for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
  let t = 'g';
  if ((x - 13) ** 2 / 10 + (y - 4) ** 2 / 5 <= 1) t = 'd';
  if ((x + y === 17 || x + y === 18) && x >= 3 && x <= 9) t = 'o'; // a road
  if ((x - 2) ** 2 / 3 + (y - 8) ** 2 / 2 <= 1) t = 'r'; // a rock outcrop
  if (Math.abs(x - y - 4) <= 1 && x + y > 16) t = 'w'; // a ford stream
  if (Math.abs(x - y - 4) <= 0 && x + y > 22) t = 'W';
  if (x <= 4 && y >= 12) t = 'm';
  if (x - y <= 0 && x >= 12 && y >= 14) t = 's';
  if (x >= 7 && x <= 10 && y >= 8 && y <= 11) t = 'f';
  V.push(t);
}
const v = (x, y) => V[y * (N + 1) + x];
const level = (x, y) => (x < 6 && y < 6 ? 2 : x < 7 && y < 7 ? 1 : 0);
const PAIR = { o: 'grass-road', d: 'grass-dirt', s: 'grass-sand', r: 'grass-rock', f: 'grass-forest', m: 'grass-marsh', w: 'grass-shallow' };
const sx = (x, y) => OX + (x - y) * HW, sy = (x, y, z) => OY + (x + y) * HH - z * LH;
for (let d = 0; d <= 2 * (N - 1); d++) for (let x = 0; x < N; x++) {
  const y = d - x; if (y < 0 || y >= N) continue;
  const c = [v(x, y), v(x + 1, y), v(x, y + 1), v(x + 1, y + 1)];
  let pair, first;
  if (c.includes('W')) { pair = 'shallow-deep'; first = (t) => t !== 'W'; }
  else { const o = c.find((t) => t !== 'g') ?? 'd'; pair = PAIR[o]; first = (t) => t === 'g'; }
  const set = sheets[pair] ?? sheets['grass-dirt'];
  const mask = (first(c[0]) << 3) | (first(c[1]) << 2) | (first(c[2]) << 1) | first(c[3]);
  const L = level(x, y);
  for (let z = 0; z < L; z++) blit(sheets['grass-dirt'][15], sx(x, y) - HW, sy(x, y, z));
  blit(set[mask], sx(x, y) - HW, sy(x, y, L));
}
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))); const sheet = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sheet, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}
const items = [];
const put = (id, x, y) => objs[id] && items.push([objs[id], x, y]);
put('watchtower', 3.5, 2.5); put('pine-a', 9, 8.6); put('pine-b', 10.4, 9.8); put('oak', 12.5, 7.5); put('olive-a', 6.5, 12.5);
put('olive-b', 14.5, 3.0); put('bush-a', 11.5, 12.5); put('bush-b', 7.4, 14.3); put('boulder-a', 5.6, 5.4); put('boulder-b', 16.2, 6.5);
put('reeds', 2.6, 13.6); put('reeds', 3.6, 15.4); put('dead-tree', 16.2, 13.2); put('tall-tree', 11.8, 4.2); put('cypress', 8.2, 10.6); put('cypress', 16.5, 9.5); put('boulder-a', 2.2, 8.6); put('wall-ruin', 13.2, 10.5); put('pine-a', 1.5, 8.5);
const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hop && items.push([(i + j) % 2 && hop2 ? hop2 : hop, 8.2 + i * 0.55 + j * 0.5, 14.6 - i * 0.55 + j * 0.5]);
arc && items.push([arc, 12.4, 14.2], [arc, 12.9, 14.6]);
items.sort((a, b) => a[1] + a[2] - (b[1] + b[2]));
for (const [s, x, y] of items) blit(s.im, sx(x, y) - s.anchor.x, sy(x, y, level(Math.floor(x), Math.floor(y))) + HH - s.anchor.y);
const out = crop(img, { x: 20, y: 80, w: W - 40, h: H - 110 });
writeImage(join(OUT, 'ART4_mockup_1x.png'), out);
const z = crop(img, { x: Math.round(W / 2) - 330, y: Math.round(H / 2) - 40, w: 440, h: 300 });
writeImage(join(OUT, 'ART4_mockup_zoom3x.png'), resizeNearest(z, z.w * 3, z.h * 3));
console.log('->', OUT);
