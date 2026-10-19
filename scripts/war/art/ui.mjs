// War UI kit (W-25): public/war/ui/ + ui.json from one PixelLab UI sheet, PixelLab icons and drawn glyphs.
// Raws: shots/war/pixellab/ui/raw/ (git-ignored; fetched from the jobs in ui-jobs.json when missing).
//   kit-sheet.png: create_ui_asset 512x512 (frames, buttons, tab, toggle, bars, slider, divider, minimap, bars).
//   icons/<id>.png: create_image_pixen 32x32 (resources, unit classes, buildings).
// Drawn here (0 generations): action, formation and cursor glyphs, stairs, ladders, the stone bridge; ram and stone thrower
// icons are the game's own siege sprites scaled down. Every output is snapped to one shared palette (ui.json `palette`).
// Usage: node scripts/war/art/ui.mjs   (ends with the QA gate; exit 1 on any failure)
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest, resizeArea, snapToPalette, hardAlpha, hexToRgb, rgbToHex, trim, alphaBox } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = join(ROOT, 'shots/war/pixellab/ui/raw');
const OUT = join(ROOT, 'public/war/ui');
const jobs = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/ui-jobs.json'), 'utf8'));

// ---------- fetch ----------
async function get(url, path) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}
await get(`https://api.pixellab.ai/mcp/ui-assets/${jobs.sheet}/download`, join(RAW, 'kit-sheet.png'));
for (const [id, job] of Object.entries(jobs.icons)) await get(`https://api.pixellab.ai/mcp/images/${job}/download`, join(RAW, 'icons', `${id}.png`));

const sheet = readImage(join(RAW, 'kit-sheet.png'));
const rawIcons = Object.fromEntries(Object.keys(jobs.icons).map((id) => [id, hardAlpha(readImage(join(RAW, 'icons', `${id}.png`)), 128)]));

// ---------- palette ----------
// Glyph ramps (dark, mid, light, highlight), picked to sit in the sheet's bronze / iron / oxblood family.
const RAMP = {
  bronze: ['#4f3219', '#8a5a2c', '#c08a48', '#e6c27a'],
  iron: ['#25252b', '#47474f', '#6e6e78', '#a2a2aa'],
  wood: ['#3a2416', '#664226', '#8e6236', '#b4884f'],
  stone: ['#3e3c42', '#625e66', '#8a868c', '#b6b2b2'],
  red: ['#3e1012', '#74201e', '#a8352a', '#d0644a'],
  fire: ['#7a2a14', '#c0501c', '#e8962e', '#f6d48a'],
  water: ['#1f3446', '#365a74', '#5a88a2', '#a0c8d6'],
  green: ['#1f3a1c', '#3c6430', '#68904a', '#a4c070'],
  tin: ['#464c56', '#7a828c', '#a8b0b8', '#dce2e6'],
  canvas: ['#5a4630', '#8a7254', '#b49c78', '#d8c4a0'],
};
const OUTLINE = '#16120e';
const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/** k-means palette of n colours over the opaque pixels of imgs (weights per image). */
function kmeans(imgs, n) {
  const hist = new Map();
  for (const [img, wgt] of imgs) for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 0) { const k = key(img.data, i); hist.set(k, (hist.get(k) ?? 0) + wgt); }
  const pts = [...hist].map(([k, c]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, c]);
  const d2 = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
  pts.sort((a, b) => b[3] - a[3]);
  const cs = [pts[0].slice(0, 3)];
  while (cs.length < n) { // farthest point, weighted by sqrt(count)
    let best = null, bd = -1;
    for (const p of pts) { const m = Math.min(...cs.map((c) => d2(p, c))) * Math.sqrt(p[3]); if (m > bd) (bd = m), (best = p); }
    cs.push(best.slice(0, 3));
  }
  for (let it = 0; it < 12; it++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let bi = 0, bd = Infinity; cs.forEach((c, j) => { const v = d2(p, c); if (v < bd) (bd = v), (bi = j); }); const a = acc[bi]; a[0] += p[0] * p[3]; a[1] += p[1] * p[3]; a[2] += p[2] * p[3]; a[3] += p[3]; }
    acc.forEach((a, j) => { if (a[3]) cs[j] = [Math.round(a[0] / a[3]), Math.round(a[1] / a[3]), Math.round(a[2] / a[3])]; });
  }
  return cs.map(rgbToHex);
}
const PALETTE = [...new Set([...kmeans([[sheet, 1], ...Object.values(rawIcons).map((im) => [im, 6])], 56), ...Object.values(RAMP).flat(), OUTLINE])];
const snap = (img) => snapToPalette(hardAlpha(img, 128), PALETTE);

// ---------- helpers ----------
const lumOf = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
function recolor(img, f) {
  const out = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const [r, g, b] = f(d[i], d[i + 1], d[i + 2], i); d[i] = Math.max(0, Math.min(255, Math.round(r))); d[i + 1] = Math.max(0, Math.min(255, Math.round(g))); d[i + 2] = Math.max(0, Math.min(255, Math.round(b))); }
  return out;
}
const tone = (img, { k = 1, sat = 1, warm = 0 } = {}) => recolor(img, (r, g, b) => { const l = 0.3 * r + 0.59 * g + 0.11 * b; return [(l + (r - l) * sat) * k + warm, (l + (g - l) * sat) * k + warm * 0.6, (l + (b - l) * sat) * k]; });
const shift = (img, dy) => { const o = blank(img.w, img.h); paste(o, crop(img, { x: 0, y: 0, w: img.w, h: img.h - dy }), 0, dy); paste(o, crop(img, { x: 0, y: 0, w: img.w, h: 1 }), 0, 0); return o; };
const hcat = (...imgs) => { const o = blank(imgs.reduce((s, i) => s + i.w, 0), imgs[0].h); let x = 0; for (const i of imgs) { paste(o, i, x, 0); x += i.w; } return o; };
const vcat = (...imgs) => { const o = blank(imgs[0].w, imgs.reduce((s, i) => s + i.h, 0)); let y = 0; for (const i of imgs) { paste(o, i, 0, y); y += i.h; } return o; };
const cols = (img, x, w) => crop(img, { x, y: 0, w, h: img.h });
const rows = (img, y, h) => crop(img, { x: 0, y, w: img.w, h });
/** Replace the middle of each edge band by one clean column / row so a stretched edge stays clean (no smeared rivets). */
function flattenEdges(img, m) {
  const o = { w: img.w, h: img.h, data: new Uint8Array(img.data) };
  const L = (x, y) => lumOf(img.data, (y * img.w + x) * 4);
  const pick = (n0, n1, score) => { let b = n0, bs = Infinity; for (let v = n0; v < n1; v++) { const s = score(v); if (s < bs) (bs = s), (b = v); } return b; };
  const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const bandCols = (y0, y1) => { const ref = []; for (let y = y0; y < y1; y++) ref.push(med(Array.from({ length: img.w - 2 * m }, (_, k) => L(m + k, y)))); return pick(m, img.w - m, (x) => ref.reduce((s, r, k) => s + Math.abs(L(x, y0 + k) - r), 0)); };
  const bandRows = (x0, x1) => { const ref = []; for (let x = x0; x < x1; x++) ref.push(med(Array.from({ length: img.h - 2 * m }, (_, k) => L(x, m + k)))); return pick(m, img.h - m, (y) => ref.reduce((s, r, k) => s + Math.abs(L(x0 + k, y) - r), 0)); };
  const cp = (sx, sy, dx, dy) => o.data.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (dy * img.w + dx) * 4);
  for (const [y0, y1] of [[0, m], [img.h - m, img.h]]) { const cx = bandCols(y0, y1); for (let x = m; x < img.w - m; x++) for (let y = y0; y < y1; y++) cp(cx, y, x, y); }
  for (const [x0, x1] of [[0, m], [img.w - m, img.w]]) { const cy = bandRows(x0, x1); for (let y = m; y < img.h - m; y++) for (let x = x0; x < x1; x++) cp(x, cy, x, y); }
  // the centre: one flat fill (the panel's interior colour, most common inside)
  const hist = new Map();
  for (let y = m; y < img.h - m; y++) for (let x = m; x < img.w - m; x++) { const i = (y * img.w + x) * 4; if (img.data[i + 3]) { const k = key(img.data, i); hist.set(k, (hist.get(k) ?? 0) + 1); } }
  return { img: o, fill: [...hist].sort((a, b) => b[1] - a[1])[0]?.[0] };
}
/** Autocorrelation period of a band (meander), along x ('h') or y ('v'). */
function period(img, x0, x1, y0, y1, axis) {
  let best = 0, bs = Infinity;
  for (let p = 6; p <= 24; p++) {
    let s = 0, n = 0;
    if (axis === 'h') { for (let y = y0; y < y1; y++) for (let x = x0; x + p < x1; x++) { s += Math.abs(lumOf(img.data, (y * img.w + x) * 4) - lumOf(img.data, (y * img.w + x + p) * 4)); n++; } }
    else { for (let x = x0; x < x1; x++) for (let y = y0; y + p < y1; y++) { s += Math.abs(lumOf(img.data, (y * img.w + x) * 4) - lumOf(img.data, ((y + p) * img.w + x) * 4)); n++; } }
    if (s / n < bs) (bs = s / n), (best = p);
  }
  return best;
}

// ---------- glyph renderer ----------
// Shapes are drawn on a 32-unit grid and rasterised at the target size (24 or 32): fill by material, then a light
// edge up-left, a dark edge down-right and a 1 px dark outline outside (light from the upper left, ART_STYLE §4).
function glyph(size, shapes) {
  const s = size / 32;
  const mat = new Array(size * size).fill(null);
  const inside = (sh, x, y) => {
    if (sh.t === 'poly') { let c = false; const p = sh.p; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
    if (sh.t === 'circle') return (x - sh.x) ** 2 + (y - sh.y) ** 2 <= sh.r ** 2 && (!sh.r0 || (x - sh.x) ** 2 + (y - sh.y) ** 2 >= sh.r0 ** 2);
    if (sh.t === 'line') { const [ax, ay, bx, by] = sh.p, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= (sh.w / 2) ** 2; }
    if (sh.t === 'rect') return x >= sh.x && x < sh.x + sh.w && y >= sh.y && y < sh.y + sh.h;
    return false;
  };
  for (const sh of shapes) for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) if (inside(sh, (px + 0.5) / s, (py + 0.5) / s)) mat[py * size + px] = sh.erase ? null : sh.m;
  const img = blank(size, size);
  const set = (i, hex) => { const [r, g, b] = hexToRgb(hex); img.data.set([r, g, b, 255], i * 4); };
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? null : mat[y * size + x]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const m = at(x, y);
    if (!m) { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy))) set(y * size + x, OUTLINE); continue; }
    const r = RAMP[m];
    const up = at(x, y - 1) !== m || at(x - 1, y) !== m, dn = at(x, y + 1) !== m || at(x + 1, y) !== m;
    set(y * size + x, up && !dn ? r[2] : dn && !up ? r[0] : r[1]);
    if (up && at(x, y - 1) !== m && at(x - 1, y) !== m) set(y * size + x, r[3]);
  }
  return img;
}
const L = (m, x0, y0, x1, y1, w = 3) => ({ t: 'line', m, p: [x0, y0, x1, y1], w });
const C = (m, x, y, r, r0) => ({ t: 'circle', m, x, y, r, r0 });
const P = (m, ...p) => ({ t: 'poly', m, p });
const R = (m, x, y, w, h) => ({ t: 'rect', m, x, y, w, h });
const E = (sh) => ({ ...sh, erase: true });
const ladder = (m, x0, y0, x1, y1, n = 5, w = 7) => {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
  const out = [L(m, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 2.2), L(m, x0 - nx, y0 - ny, x1 - nx, y1 - ny, 2.2)];
  for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push(L(m, x0 + dx * t + nx, y0 + dy * t + ny, x0 + dx * t - nx, y0 + dy * t - ny, 1.6)); }
  return out;
};
const flame = (m, cx, by, h, w) => P(m, [cx - w / 2, by], [cx - w / 2 - 1, by - h * 0.45], [cx - w * 0.15, by - h * 0.7], [cx, by - h], [cx + w * 0.2, by - h * 0.62], [cx + w / 2 + 1, by - h * 0.4], [cx + w / 2, by]);
const dots = (pts, r = 2.3) => pts.map(([x, y]) => C('bronze', x, y, r));
const man = (m, x, y, k = 1) => [C(m, x, y - 5 * k, 3.2 * k), P(m, [x - 6 * k, y + 7 * k], [x - 5 * k, y], [x + 5 * k, y], [x + 6 * k, y + 7 * k])];
const arrowHead = (m, x, y, dir, s = 6) => { // dir: 'r','l','u','d'
  const pts = { r: [[x, y - s], [x + s, y], [x, y + s]], l: [[x, y - s], [x - s, y], [x, y + s]], u: [[x - s, y], [x, y - s], [x + s, y]], d: [[x - s, y], [x, y + s], [x + s, y]] }[dir];
  return P(m, ...pts);
};
const sword = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l; const gx = x0 + ux * 7, gy = y0 + uy * 7; return [L('wood', x0, y0, gx, gy, 3), L('bronze', gx - uy * 5, gy + ux * 5, gx + uy * 5, gy - ux * 5, 3), L('iron', gx + ux, gy + uy, x1 - ux * 3, y1 - uy * 3, 4), P('iron', [x1 - ux * 4 - uy * 2, y1 - uy * 4 + ux * 2], [x1, y1], [x1 - ux * 4 + uy * 2, y1 - uy * 4 - ux * 2])]; };
const hammer = (o = 0) => [L('wood', 7 + o, 26 + o, 19, 14, 3.4), P('iron', [13, 9], [19, 3], [29, 13], [23, 19])];
const pick = () => [L('wood', 7, 27, 21, 11, 3.2), P('iron', [8, 8], [14, 5], [20, 6], [26, 10], [29, 16], [24, 13], [19, 11], [14, 11], [9, 13])];
const stairs = (m) => [P(m, [4, 28], [4, 22], [10, 22], [10, 16], [16, 16], [16, 10], [22, 10], [22, 4], [28, 4], [28, 28])];

const GLYPHS = {
  // actions
  'act-move': [L('bronze', 5, 16, 20, 16, 5), arrowHead('bronze', 19, 16, 'r', 9)],
  'act-attack': sword(6, 26, 27, 5),
  'act-hold': [C('bronze', 16, 16, 12), C('iron', 16, 16, 7.5, 6), C('bronze', 16, 16, 3)],
  'act-line': dots([6, 11, 16, 21, 26].flatMap((x) => [[x, 12], [x, 20]])),
  'act-column': dots([6, 11, 16, 21, 26].flatMap((y) => [[12, y], [20, y]])),
  'act-wedge': dots([[16, 6], [12, 12], [20, 12], [8, 18], [16, 18], [24, 18], [4, 25], [12, 25], [20, 25], [28, 25]], 2.1),
  'act-loose': dots([[6, 7], [17, 5], [26, 9], [10, 15], [22, 16], [5, 24], [15, 22], [27, 25], [13, 28]], 2.1),
  'act-build': hammer(),
  'act-gather': pick(),
  'act-crew': [C('wood', 16, 16, 13, 9.5), L('wood', 16, 5, 16, 27, 2.5), L('wood', 5, 16, 27, 16, 2.5), L('wood', 8.5, 8.5, 23.5, 23.5, 2.2), L('wood', 23.5, 8.5, 8.5, 23.5, 2.2), C('iron', 16, 16, 3.5)],
  'act-deploy': [L('bronze', 16, 3, 16, 15, 5), arrowHead('bronze', 16, 14, 'd', 8), R('iron', 4, 24, 24, 5)],
  'act-raise-ladder': [...ladder('wood', 7, 29, 19, 6), L('bronze', 26, 27, 26, 13, 4), arrowHead('bronze', 26, 12, 'u', 6)],
  'act-push-ladder': [...ladder('wood', 9, 29, 13, 5), L('red', 15, 14, 24, 14, 4), arrowHead('red', 24, 14, 'r', 6)],
  'act-ignite': [L('wood', 12, 29, 17, 13, 4), R('iron', 13, 12, 7, 4), flame('fire', 17, 13, 12, 11)],
  'act-extinguish': [P('water', [16, 3], [24, 17], [25, 21], [23, 26], [19, 29], [13, 29], [9, 26], [7, 21], [8, 17])],
  'act-fire-arrows': [L('wood', 5, 27, 22, 10, 2.4), P('iron', [20, 8], [27, 5], [24, 12]), P('bronze', [5, 27], [3, 22], [8, 24]), P('bronze', [5, 27], [10, 29], [8, 24]), flame('fire', 23, 13, 11, 8)],
  'act-upgrade': [P('bronze', [4, 18], [16, 6], [28, 18], [28, 23], [16, 11], [4, 23]), P('bronze', [4, 28], [16, 16], [28, 28], [28, 31], [16, 21], [4, 31])],
  'act-cancel': [L('red', 7, 7, 25, 25, 6), L('red', 25, 7, 7, 25, 6)],
  'act-assign': [...man('bronze', 13, 15), L('iron', 25, 17, 25, 29, 3.5), L('iron', 19, 23, 31, 23, 3.5)],
  'act-stop': [P('red', [11, 4], [21, 4], [28, 11], [28, 21], [21, 28], [11, 28], [4, 21], [4, 11])],
  // buildings drawn here
  'bld-stairs-wood': stairs('wood'),
  'bld-stairs-stone': stairs('stone'),
  'bld-ladder': ladder('wood', 16, 30, 16, 2, 6, 10),
  'bld-siege-ladder': [...ladder('wood', 8, 30, 22, 3, 6, 8), P('iron', [17, 2], [21, 0], [24, 5], [22, 6], [20, 3])],
  'bld-bridge-stone': [R('stone', 1, 8, 30, 20), E(C(null, 9, 22, 5)), E(C(null, 23, 22, 5)), E(R(null, 4, 22, 10, 7)), E(R(null, 18, 22, 10, 7)), E(L(null, 1, 12.5, 31, 12.5, 1))],
  'bld-camp': [P('canvas', [13, 22], [21, 7], [30, 22]), L('wood', 21, 4, 21, 8, 1.6), P('canvas', [2, 27], [11, 9], [21, 27]), L('wood', 11, 5, 11, 10, 1.6), P('wood', [9, 27], [11, 19], [13, 27]), R('stone', 22, 28, 9, 2), flame('fire', 26.5, 28, 9, 6)],
  'bld-ram': [P('wood', [3, 15], [15, 5], [27, 15]), R('wood', 5, 15, 20, 8), E(L(null, 3, 15.5, 27, 15.5, 1)), L('wood', 21, 19, 28, 19, 3.2), P('bronze', [27, 16], [31, 19], [27, 22]), C('wood', 9, 25, 4.2), C('wood', 21, 25, 4.2), C('iron', 9, 25, 1.4), C('iron', 21, 25, 1.4)],
  'bld-stone-thrower': [R('wood', 3, 23, 26, 4), L('wood', 13, 23, 13, 13, 3), L('wood', 21, 23, 21, 13, 3), L('wood', 21, 13, 26, 8, 2.6), L('wood', 17, 18, 7, 6, 2.6), C('iron', 17, 18, 3.4), C('wood', 6, 6, 3.4), C('stone', 6, 4.5, 2.4), C('wood', 7, 28, 2.6), C('wood', 25, 28, 2.6)],
  'res-tin': [P('tin', [3, 23], [7, 18], [25, 18], [29, 23], [29, 28], [3, 28]), E(L(null, 3, 23, 29, 23, 0.9)), E(L(null, 4, 17, 28, 17, 1.2)), P('tin', [7, 15], [11, 9], [21, 9], [25, 15], [25, 16], [7, 16]), E(L(null, 7, 15, 25, 15, 0.9))],
};
const CURSORS = {
  default: { hot: [2, 2], shapes: [P('bronze', [3, 3], [3, 25], [9, 19], [13, 28], [17, 26], [13, 18], [21, 17])] },
  move: { hot: [16, 16], shapes: [L('bronze', 16, 6, 16, 26, 3), L('bronze', 6, 16, 26, 16, 3), arrowHead('bronze', 16, 5, 'u', 5), arrowHead('bronze', 16, 27, 'd', 5), arrowHead('bronze', 5, 16, 'l', 5), arrowHead('bronze', 27, 16, 'r', 5)] },
  attack: { hot: [3, 3], shapes: sword(27, 27, 4, 4) },
  build: { hot: [24, 6], shapes: hammer() },
  gather: { hot: [27, 15], shapes: pick() },
  interact: { hot: [2, 2], shapes: [P('bronze', [3, 3], [3, 21], [8, 16], [11, 23], [14, 22], [11, 15], [17, 14]), C('iron', 23, 23, 7, 4.2), C('bronze', 23, 23, 2)] },
  invalid: { hot: [16, 16], shapes: [C('red', 16, 16, 13, 9), L('red', 8, 8, 24, 24, 4.5)] },
};

// ---------- build ----------
rmSync(OUT, { recursive: true, force: true });
for (const d of ['frames', 'buttons', 'bars', 'icons/32', 'icons/24', 'cursors']) mkdirSync(join(OUT, d), { recursive: true });
const manifest = { note: 'War UI kit (W-25). Sizes are 1x art px; every PNG has an @2x twin (nearest). slice = 9-slice margins {l, t, r, b}: corners fixed, edges and centre stretch; edges "tile" = repeat the edge strip (period px) instead of stretching (meander borders). Icons: 32 and 24 px. Cursors: 32 px with hotspot.', scale: [1, 2], palette: PALETTE, frames: {}, buttons: {}, bars: {}, icons: {}, cursors: {} };
const save = (rel, img) => {
  const im = snap(img);
  writeImage(join(OUT, rel + '.png'), im);
  writeImage(join(OUT, rel + '@2x.png'), resizeNearest(im, im.w * 2, im.h * 2));
  return { file: rel + '.png', w: im.w, h: im.h };
};
const sh = (x, y, w, h) => crop(sheet, { x, y, w, h });

// frames
{
  const main = sh(16, 16, 241, 161);
  const ph = period(sheet, 72, 192, 22, 34, 'h'), pv = period(sheet, 22, 34, 73, 121, 'v');
  const kh = Math.floor((192 - 72) / ph), kv = Math.floor((121 - 73) / pv);
  manifest.frames.panel = { ...save('frames/panel', main), slice: { l: 56, t: 57, r: 241 - 56 - kh * ph, b: 161 - 57 - kv * pv }, edges: 'tile', period: [ph, pv], use: 'main window, scenario and site panels (meander bronze)' };
  const small = flattenEdges(sh(272, 16, 121, 89), 14);
  manifest.frames['panel-small'] = { ...save('frames/panel-small', small.img), slice: { l: 14, t: 14, r: 14, b: 14 }, edges: 'stretch', use: 'selection panel, siege box, sub-panels (riveted iron)' };
  const bar = flattenEdges(sh(16, 359, 481, 67), 16);
  manifest.frames.bar = { ...save('frames/bar', hcat(cols(bar.img, 0, 48), cols(bar.img, 481 - 48, 48))), slice: { l: 16, t: 16, r: 16, b: 16 }, edges: 'stretch', use: 'top resource bar, command card, build toolbar (riveted iron)' };
  manifest.frames.tooltip = { ...save('frames/tooltip', sh(408, 16, 89, 57)), slice: { l: 8, t: 8, r: 8, b: 8 }, edges: 'stretch', use: 'tooltip (parchment, dark ink text)' };
  manifest.frames.label = { ...save('frames/label', hcat(cols(sh(404, 79, 97, 31), 0, 26), cols(sh(404, 79, 97, 31), 97 - 26, 26))), slice: { l: 24, t: 0, r: 24, b: 0 }, edges: 'stretch', fixedHeight: 31, use: 'hover label (3-slice, fixed height)' };
  const res = sh(16, 440, 481, 41);
  manifest.frames.plaque = { ...save('frames/plaque', hcat(cols(res, 0, 100), cols(res, 481 - 100, 100))), slice: { l: 96, t: 8, r: 96, b: 8 }, edges: 'stretch', fixedHeight: 41, use: 'title plaque / banner (bronze, meander ends)' };
  const mm = sh(360, 176, 137, 137);
  manifest.frames['minimap-round'] = { ...save('frames/minimap-round', mm), window: { cx: 68, cy: 68, r: 47 }, use: 'round minimap frame, fixed size' };
  const sq = { w: mm.w, h: mm.h, data: new Uint8Array(mm.data) };
  // the round window's ring bulges into the inner bars at the four sides: rebuild those bars from a clean column / row
  const px = (x, y) => mm.data.subarray((y * 137 + x) * 4, (y * 137 + x) * 4 + 4);
  for (let k = 14; k < 21; k++) for (let t = 21; t < 116; t++) {
    sq.data.set(px(30, k), (k * 137 + t) * 4); sq.data.set(px(30, 136 - k), ((136 - k) * 137 + t) * 4);
    sq.data.set(px(k, 30), (t * 137 + k) * 4); sq.data.set(px(136 - k, 30), (t * 137 + 136 - k) * 4);
  }
  for (let y = 21; y < 137 - 21; y++) for (let x = 21; x < 137 - 21; x++) sq.data[(y * 137 + x) * 4 + 3] = 0;
  manifest.frames.minimap = { ...save('frames/minimap', sq), window: { x: 21, y: 21, w: 95, h: 95 }, use: 'square minimap frame, fixed size' };
  const div = sh(16, 326, 481, 15);
  manifest.frames.divider = { ...save('frames/divider', hcat(cols(div, 0, 24), cols(div, 481 - 24, 24))), slice: { l: 20, t: 0, r: 20, b: 0 }, edges: 'stretch', fixedHeight: 15, use: 'horizontal divider (3-slice)' };
  manifest.frames['divider-ornament'] = { ...save('frames/divider-ornament', trim(crop(div, { x: 214, y: 0, w: 53, h: 15 }))), use: 'centre ornament laid over a divider' };
}

// buttons: normal / hover / pressed / disabled
const STATES = { normal: (i) => i, hover: (i) => tone(i, { k: 1.18, warm: 6 }), pressed: (i) => shift(tone(i, { k: 0.78 }), 1), disabled: (i) => tone(i, { k: 0.72, sat: 0.15 }) };
function states(name, img, extra) {
  const e = { states: {}, ...extra };
  for (const [s, f] of Object.entries(STATES)) e.states[s] = save(`buttons/${name}-${s}`, f(img)).file;
  e.w = img.w; e.h = img.h;
  manifest.buttons[name] = e;
}
{
  const big = sh(272, 120, 121, 41);
  const large = hcat(cols(big, 0, 32), cols(big, 121 - 32, 32));
  states('button', large, { slice: { l: 10, t: 10, r: 10, b: 10 }, use: 'text button (large); label Cinzel / Cormorant SC' });
  states('button-small', vcat(rows(large, 0, 14), rows(large, 41 - 14, 14)), { slice: { l: 10, t: 10, r: 10, b: 10 }, use: 'small text button (site panel Assign / Stop / Cancel)' });
  // icon button: the bronze square with its drawn sword cleared to the interior colour
  const ib = sh(408, 120, 41, 41);
  const hist = new Map();
  for (let y = 9; y < 32; y++) for (let x = 9; x < 32; x++) { const i = (y * 41 + x) * 4; const k = key(ib.data, i); hist.set(k, (hist.get(k) ?? 0) + 1); }
  const fill = [...hist].sort((a, b) => b[1] - a[1])[0][0];
  for (let y = 7; y < 34; y++) for (let x = 7; x < 34; x++) ib.data.set([(fill >> 16) & 255, (fill >> 8) & 255, fill & 255, 255], (y * 41 + x) * 4);
  states('button-icon', ib, { slice: { l: 10, t: 10, r: 10, b: 10 }, content: { x: 4, y: 4, w: 33, h: 33 }, use: 'square icon button (command card, build toolbar); icon 32 inside' });
  const tabOn = sh(13, 192, 95, 33), tabOff = tone(sh(109, 192, 95, 33), { k: 0.8, sat: 0.7 });
  manifest.buttons.tab = { states: { active: save('buttons/tab-active', tabOn).file, inactive: save('buttons/tab-inactive', tabOff).file, hover: save('buttons/tab-hover', tone(tabOff, { k: 1.2 })).file }, w: 95, h: 33, slice: { l: 14, t: 10, r: 14, b: 6 } };
  const tg = sh(272, 184, 73, 33);
  const tgOff = { w: tg.w, h: tg.h, data: new Uint8Array(tg.data) };
  const flip = blank(tg.w, tg.h);
  for (let y = 0; y < tg.h; y++) for (let x = 0; x < tg.w; x++) flip.data.set(tg.data.subarray((y * tg.w + x) * 4, (y * tg.w + x) * 4 + 4), (y * tg.w + tg.w - 1 - x) * 4);
  manifest.buttons.toggle = { states: { on: save('buttons/toggle-on', tg).file, off: save('buttons/toggle-off', tone(flip, { k: 0.85, sat: 0.25 })).file, disabled: save('buttons/toggle-disabled', tone(tgOff, { k: 0.7, sat: 0.1 })).file }, w: 73, h: 33 };
}

// bars and slider
{
  const hp = sh(16, 240, 241, 22);
  const track = hcat(cols(hp, 0, 12), cols(hp, 241 - 12, 12));
  // empty: the oxblood fill replaced by the dark well colour
  const well = hexToRgb(RAMP.iron[0]);
  const empty = recolor(track, (r, g, b, i) => { const p = i / 4, x = p % track.w, y = Math.floor(p / track.w); return y >= 4 && y <= 17 && x >= 4 && x < track.w - 4 && r > g + 8 ? well : [r, g, b]; });
  manifest.bars.track = { ...save('bars/track', empty), slice: { l: 6, t: 0, r: 6, b: 0 }, fixedHeight: 22, fill: { x: 5, y: 4, h: 13 }, use: 'progress bar track; draw a fill strip at fill.x, fill.y, stretched to value' };
  for (const [n, m] of [['hp', 'red'], ['construction', 'bronze'], ['burn', 'fire'], ['ok', 'green'], ['water', 'water']]) {
    const f = blank(4, 13), r = RAMP[m];
    for (let y = 0; y < 13; y++) for (let x = 0; x < 4; x++) f.data.set([...hexToRgb(y === 0 ? r[3] : y <= 3 ? r[2] : y >= 11 ? r[0] : r[1]), 255], (y * 4 + x) * 4);
    manifest.bars[`fill-${n}`] = { ...save(`bars/fill-${n}`, f), stretch: 'x' };
  }
  const sl = sh(16, 274, 241, 25);
  const tr = hcat(cols(sl, 0, 16), cols(sl, 160, 16), cols(sl, 241 - 16, 16));
  manifest.bars['slider-track'] = { ...save('bars/slider-track', tr), slice: { l: 12, t: 0, r: 12, b: 0 }, fixedHeight: 25 };
  const knob = blank(25, 25);
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if ((x - 12) ** 2 + (y - 12) ** 2 <= 12.6 ** 2) knob.data.set(sheet.data.subarray(((274 + y) * 512 + 108 + x) * 4, ((274 + y) * 512 + 108 + x) * 4 + 4), (y * 25 + x) * 4);
  manifest.bars['slider-knob'] = save('bars/slider-knob', knob);
}

// icons
const fit32 = (img, size) => { const t = trim(img); const k = Math.min((size - 2) / t.w, (size - 2) / t.h, 1); const r = k < 1 ? hardAlpha(resizeArea(t, Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k))), 110) : t; const o = blank(size, size); paste(o, r, Math.floor((size - r.w) / 2), Math.floor((size - r.h) / 2)); return o; };
const ICON_GROUP = (id) => id.split('-')[0];
const addIcon = (id, src, f32, f24) => { manifest.icons[id] = { group: { res: 'resource', unit: 'unit', bld: 'building', act: 'action' }[ICON_GROUP(id)], src, 32: save(`icons/32/${id}`, f32).file, 24: save(`icons/24/${id}`, f24).file }; };
for (const [id, img] of Object.entries(rawIcons)) addIcon(id, 'pixellab', fit32(img, 32), fit32(img, 24));
for (const [id, shapes] of Object.entries(GLYPHS)) addIcon(id, 'drawn', glyph(32, shapes), glyph(24, shapes));
// cursors
for (const [id, c] of Object.entries(CURSORS)) manifest.cursors[id] = { ...save(`cursors/${id}`, glyph(32, c.shapes)), hotspot: c.hot };

writeFileSync(join(OUT, 'ui.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`ui kit: ${Object.keys(manifest.frames).length} frames, ${Object.keys(manifest.buttons).length} buttons, ${Object.keys(manifest.bars).length} bars, ${Object.keys(manifest.icons).length} icons, ${Object.keys(manifest.cursors).length} cursors, palette ${PALETTE.length}`);

// ---------- QA ----------
const fails = [];
const pal = new Set(PALETTE.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));
const check = (rel, w, h) => {
  const im = readImage(join(OUT, rel));
  if (w && (im.w !== w || im.h !== h)) fails.push(`${rel}: ${im.w}x${im.h}, want ${w}x${h}`);
  let off = 0, semi = 0;
  for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a && a < 255) semi++; if (a === 255 && !pal.has(key(im.data, i))) off++; }
  if (semi) fails.push(`${rel}: ${semi} semi-transparent px`);
  if (off) fails.push(`${rel}: ${off} px off the palette`);
  const corners = [0, im.w - 1, (im.h - 1) * im.w, im.h * im.w - 1].filter((p) => im.data[p * 4 + 3]).length;
  if (corners === 4 && !rel.startsWith('bars/fill') && !rel.startsWith('frames/')&& !rel.startsWith('buttons/')) fails.push(`${rel}: opaque in all four corners (background?)`);
  if (rel.startsWith('icons/') || rel.startsWith('cursors/')) { // a background left in: most of the border ring opaque
    let ring = 0, on = 0;
    for (let k = 0; k < im.w; k++) for (const p of [k, (im.h - 1) * im.w + k, k * im.w, k * im.w + im.w - 1]) { ring++; if (im.data[p * 4 + 3]) on++; }
    if (on > ring * 0.3) fails.push(`${rel}: ${on}/${ring} border px opaque (background?)`);
  }
  const im2 = readImage(join(OUT, rel.replace('.png', '@2x.png')));
  if (im2.w !== im.w * 2 || im2.h !== im.h * 2) fails.push(`${rel}: @2x is ${im2.w}x${im2.h}`);
};
for (const g of ['frames', 'bars']) for (const e of Object.values(manifest[g])) { check(e.file, e.w, e.h); if (e.slice) { const s = e.slice; if (s.l + s.r >= e.w || s.t + s.b > e.h) fails.push(`${e.file}: slice ${JSON.stringify(s)} leaves no centre`); } }
for (const e of Object.values(manifest.buttons)) for (const f of Object.values(e.states)) check(f, e.w, e.h);
for (const e of Object.values(manifest.icons)) { check(e[32], 32, 32); check(e[24], 24, 24); }
for (const e of Object.values(manifest.cursors)) check(e.file, 32, 32);
if (fails.length) { console.log('UI QA FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('UI QA ok');
