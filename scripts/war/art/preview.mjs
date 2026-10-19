// War art preview (ART-5): contact sheet of public/war/tiles + objects, a 1:1 variants field (same field without and
// with variant fills), and 1:1 renders of test-ridge windows autotiled with the tiles.json fallback rule, with objects
// and soldiers. Flat (heights are the renderer's job). Usage: node scripts/war/art/preview.mjs [out dir]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/art5';
mkdirSync(OUT, { recursive: true });
const T = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json')));
const O = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const { w: TW, h: TH } = T.tile, HW = TW / 2, HH = T.tile.topH / 2;
const BG = [22, 17, 13, 255];
const fill = (im) => { for (let i = 0; i < im.w * im.h; i++) im.data.set(BG, i * 4); return im; };
const frames = (file, n) => { const im = readImage(join(ROOT, 'public/war/tiles', file)); return [...Array(n)].map((_, i) => crop(im, { x: i * TW, y: 0, w: TW, h: TH })); };
const sheets = Object.fromEntries(T.sheets.map((s) => [s.pair, { ...s, f: frames(s.file, 16) }]));
const variants = Object.fromEntries((T.variants ?? []).map((v) => [v.terrain, frames(v.file, v.frames)]));
const objs = Object.fromEntries(O.objects.map((o) => [o.id, { ...o, im: readImage(join(ROOT, 'public/war/objects', o.file)) }]));
const hash = (x, y, k = 0) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0);

// ---- contact sheet: every tile set row, the variant rows, cliffs (x2) and every object (x1) on dark ground
{
  const rows = T.sheets.length + (T.variants ?? []).length, cw = 16 * 68;
  const objW = O.objects.reduce((s, o) => s + o.w + 12, 0), objH = Math.max(...O.objects.map((o) => o.h));
  const im = fill(blank(Math.max(cw, Math.min(objW, 2000)), rows * 52 + 70 + (objH + 8) * Math.ceil(objW / 2000) + 20));
  T.sheets.forEach((s, r) => sheets[s.pair].f.forEach((t, i) => paste(im, t, i * 68 + 2, r * 52 + 2)));
  (T.variants ?? []).forEach((v, r) => variants[v.terrain].forEach((t, i) => paste(im, t, i * 68 + 2, (T.sheets.length + r) * 52 + 2)));
  let x = 2, y = rows * 52 + 8;
  (T.cliffs ?? []).forEach((c) => { const ci = readImage(join(ROOT, 'public/war/tiles', c.file)); for (let k = 0; k < 3; k++) paste(im, ci, x, y + k * 16); x += 72; });
  x = 2; y += 64; let rowH = 0;
  for (const o of Object.values(objs)) { if (x + o.w > im.w) { x = 2; y += rowH + 8; rowH = 0; } paste(im, o.im, x, y); x += o.w + 12; rowH = Math.max(rowH, o.h); }
  const out = crop(im, { x: 0, y: 0, w: im.w, h: Math.min(im.h, y + rowH + 4) });
  writeImage(join(OUT, 'ART5_contact.png'), resizeNearest(out, out.w * 2, out.h * 2));
}

// ---- the fallback rule of tiles.json on a vertex grid V (terrain per vertex), then autotile
const pairOf = new Map(T.sheets.map((s) => [[s.first, s.second].sort().join('|'), s]));
const WATER = new Set(['deep', 'shallow']);
const rank = (t) => T.fallback.order.indexOf(t);
function resolve(V, n) {
  const at = (x, y) => (x >= 0 && y >= 0 && x <= n && y <= n ? V[y * (n + 1) + x] : null);
  const set = (x, y, t) => { V[y * (n + 1) + x] = t; };
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { // (1) shores get a shallow band
    if (at(x, y) !== 'deep') continue;
    let land = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(x + dx, y + dy); if (t && !WATER.has(t)) land = true; }
    if (land) set(x, y, 'shallow');
  }
  for (let pass = 0, changed = true; changed && pass < 30; pass++) { // (2) pairs with no sheet get a grass buffer; 3+ terrains: minority joins the majority
    changed = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], ts = c.map(([a, b]) => at(a, b)), kinds = [...new Set(ts)];
      if (kinds.length < 2) continue;
      for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
        const a = kinds[i], b = kinds[j]; if (pairOf.has([a, b].sort().join('|'))) continue;
        const lose = WATER.has(a) !== WATER.has(b) ? (WATER.has(a) ? b : a) : rank(a) < rank(b) ? a : b;
        c.forEach(([u, v], k) => { if (ts[k] === lose) { set(u, v, 'grass'); changed = true; } });
      }
      const ts2 = c.map(([a, b]) => at(a, b)), cnt = {}; ts2.forEach((t) => (cnt[t] = (cnt[t] ?? 0) + 1));
      const ks = Object.keys(cnt); if (ks.length < 3) continue;
      // 3+ terrains: grass corners give way to the commonest other terrain (grass only shrinks, so this ends); else the rarest gives way
      const lose = cnt.grass ? 'grass' : ks.sort((a, b) => cnt[a] - cnt[b] || rank(a) - rank(b))[0];
      const to = ks.filter((k) => k !== lose).sort((a, b) => cnt[b] - cnt[a] || rank(b) - rank(a))[0];
      c.forEach(([u, v], k) => { if (ts2[k] === ks[0]) { set(u, v, to); changed = true; } });
    }
  }
  return at;
}
function tileFor(at, x, y, useVariants) {
  const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)], kinds = [...new Set(c)];
  if (kinds.length === 1) {
    const t = kinds[0];
    if (useVariants && variants[t]) return variants[t][hash(x, y) % variants[t].length];
    const s = T.sheets.find((s) => s.first === t || s.second === t); return s ? sheets[s.pair].f[s.first === t ? 15 : 0] : null;
  }
  // last resort (the rule did not settle here): the commonest pair with a sheet, other corners count as its first terrain
  const cnt = {}; c.forEach((t) => (cnt[t] = (cnt[t] ?? 0) + 1));
  const ranked = kinds.sort((a, b) => cnt[b] - cnt[a]);
  let s = null; for (let i = 0; i < ranked.length && !s; i++) for (let j = i + 1; j < ranked.length && !s; j++) s = pairOf.get([ranked[i], ranked[j]].sort().join('|')) ?? null;
  if (!s) return null;
  if (kinds.length > 2) approx++;
  const m = c.reduce((m, t, i) => m | ((t !== s.second) << (3 - i)), 0);
  return sheets[s.pair].f[s.maskToFrame[m]];
}
let approx = 0;
function render(at, n, items = [], useVariants = true) {
  const W = 2 * n * HW + 40, H = 2 * n * HH + 440, OX = n * HW + 20, OY = 400;
  const img = fill(blank(W, H)); let missing = 0;
  const sx = (x, y) => OX + (x - y) * HW, sy = (x, y) => OY + (x + y) * HH;
  for (let d = 0; d <= 2 * (n - 1); d++) for (let x = 0; x < n; x++) {
    const y = d - x; if (y < 0 || y >= n) continue;
    const t = tileFor(at, x, y, useVariants); if (!t) { missing++; if (process.env.DEBUG) console.log("no sheet", x, y, [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)].join(",")); continue; }
    paste(img, t, Math.round(sx(x, y) - HW), Math.round(sy(x, y)));
  }
  items.sort((a, b) => a[1] + a[2] - (b[1] + b[2]));
  for (const [s, x, y] of items) paste(img, s.im, Math.round(sx(x, y) - s.anchor.x), Math.round(sy(x, y) + HH - s.anchor.y));
  return { img, missing };
}
function soldier(cls, row, col) {
  const dir = join(ROOT, 'src/assets/sheets', cls); if (!existsSync(dir)) return null;
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'))); const sheet = readImage(join(dir, m.image));
  const r = m.rows.indexOf(row), wrap = m.wrap ?? 1e9, band = Math.floor(col / wrap);
  const im = crop(sheet, { x: (col % wrap) * m.frame.w, y: (band * m.rows.length + r) * m.frame.h, w: m.frame.w, h: m.frame.h });
  const a = m.anchors?.[row] ?? m.anchor; return { im, anchor: { x: a.x, y: a.y } };
}

// ---- variants field: 24 x 24 of big single-terrain patches, without (left) and with (right) variant fills
{
  const n = 24, V = [];
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
    let t = 'grass';
    if (x < 9 && y < 10) t = 'forest';
    else if (x >= 15 && y < 11) t = 'marsh';
    else if (x < 10 && y >= 14) t = 'sand';
    else if (x >= 14 && y >= 15) t = 'dirt';
    V.push(t);
  }
  const at = resolve(V, n), a = render(at, n, [], false).img, b = render(at, n, [], true).img;
  const cut = (im) => crop(im, { x: 0, y: 380, w: im.w, h: im.h - 400 });
  const A = cut(a), B = cut(b), both = fill(blank(A.w * 2 + 20, A.h));
  paste(both, A, 0, 0); paste(both, B, A.w + 20, 0);
  writeImage(join(OUT, 'ART5_variants_1x.png'), both);
}

// ---- test-ridge windows, 1:1
const R = JSON.parse(readFileSync(join(ROOT, 'src/war/regions/test-ridge.json')));
const cellT = (x, y) => { const i = y * R.w + x; return R.water[i] === 2 ? 'deep' : R.water[i] === 1 ? 'shallow' : R.terrain[i]; };
const hop = soldier('hoplite', 'south-east', 0), hop2 = soldier('hoplite', 'south-west', 40), arc = soldier('archer', 'south-east', 0);
const report = [];
for (const [name, x0, y0, n] of [['ford', 248, 104, 40], ['marsh-ridge', 264, 216, 40]]) {
  const V = []; for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) V.push(cellT(Math.min(R.w - 1, x0 + x), Math.min(R.h - 1, y0 + y)));
  const raw = V.slice(), at = resolve(V, n);
  const moved = V.filter((t, i) => t !== raw[i]).length;
  const items = []; let placed = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = at(x, y), h = hash(x + x0, y + y0, 7) % 1000, ox = (hash(x, y, 3) % 60) / 100, oy = (hash(x, y, 5) % 60) / 100;
    const pick = (ids) => objs[ids[hash(x, y, 9) % ids.length]];
    let o = null;
    if (t === 'forest' && h < 300) o = pick(['pine-a', 'pine-b', 'stone-pine', 'oak', 'pine-a', 'stone-pine']);
    else if (t === 'grass' && h < 22) o = pick(['olive-a', 'olive-b', 'bush-a', 'bush-b', 'stone-pine', 'cypress', 'dead-tree']);
    else if (t === 'marsh' && h < 140) o = pick(['reeds', 'reeds', 'bush-b']);
    else if (t === 'rock' && h < 50) o = pick(['boulder-a', 'boulder-b']);
    else if (t === 'sand' && h < 12) o = pick(['bush-a', 'boulder-b']);
    if (o) { items.push([o, x + ox + 0.2, y + oy + 0.2]); placed++; }
  }
  // a watchtower and a ruin on open grass near the middle, a file of hoplites and two archers
  const spot = (pred) => { for (let r = 0; r < n / 2; r++) for (let d = -r; d <= r; d++) for (const [x, y] of [[n / 2 + d, n / 2 - r], [n / 2 + r, n / 2 + d]]) { if (pred(x, y)) return [x, y]; } return null; };
  const open = (w) => (x, y) => { for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (at(x + dx, y + dy) !== 'grass') return false; return true; };
  const tw = spot(open(2)); if (tw) items.push([objs.watchtower, tw[0] + 1, tw[1] + 1]);
  const ru = spot((x, y) => open(1)(x, y) && (!tw || Math.abs(x - tw[0]) + Math.abs(y - tw[1]) > 6)); if (ru) items.push([objs['wall-ruin'], ru[0] + 0.5, ru[1] + 0.5]);
  const sq = spot((x, y) => open(2)(x, y) && (!tw || Math.abs(x - tw[0]) + Math.abs(y - tw[1]) > 5) && (!ru || Math.abs(x - ru[0]) + Math.abs(y - ru[1]) > 4));
  if (sq) { for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hop && items.push([(i + j) % 2 && hop2 ? hop2 : hop, sq[0] - 1 + i * 0.55 + j * 0.5, sq[1] + 1 - i * 0.55 + j * 0.5]); arc && items.push([arc, sq[0] + 2, sq[1] + 2], [arc, sq[0] + 2.5, sq[1] + 2.4]); }
  approx = 0;
  const { img, missing } = render(at, n, items, true);
  writeImage(join(OUT, `ART5_ridge_${name}_1x.png`), crop(img, { x: 0, y: 200, w: img.w, h: img.h - 220 }));
  const z = crop(img, { x: Math.round(img.w / 2) - 300, y: Math.round(img.h / 2) - 60, w: 600, h: 340 });
  writeImage(join(OUT, `ART5_ridge_${name}_zoom2x.png`), resizeNearest(z, z.w * 2, z.h * 2));
  report.push(`${name} (${x0},${y0} ${n}x${n}): ${moved} vertices moved by the fallback, ${missing} tiles without a sheet, ${approx} 3-terrain tiles drawn as a pair, ${placed} objects`);
}
console.log(report.join('\n') + '\n->', OUT);
