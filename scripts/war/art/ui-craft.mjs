// War UI, crafting icons (ART-C, W-32 red-figure kit): the 7 new goods and 3 remedies (PixelLab pixen 32x32, ids in
// craft-jobs.json `icons`), one node icon per profession-tree node (6 trees x 12, WAR.md "Crafting and professions") and
// the quality and rarity badges. Node icons and badges are drawn (glyph.mjs pictograms on a red-figure medallion: black
// disc, terracotta ring; the root ring cream, the capstones a double light ring with studs), 0 generations.
// Additive: run after ui.mjs and ui-redfigure.mjs; it adds icons to public/war/ui/icons/{32,24} (+ @2x) and ui.json
// (groups resource, node, badge) and appends its own colours to the palette. Raws: shots/war/pixellab/ui/raw/craft/.
// Usage: node scripts/war/art/ui-craft.mjs   (ends with the QA gate; exit 1 on any failure)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, paste, resizeNearest, resizeArea, snapToPalette, hardAlpha, hexToRgb, trim } from '../../art/lib/ops.mjs';
import { RAMP, glyph, L, C, P, R, E, flame, sword, hammer, pick } from './glyph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = join(ROOT, 'shots/war/pixellab/ui/raw/craft'), OUT = join(ROOT, 'public/war/ui');
const jobs = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/craft-jobs.json'), 'utf8')).icons;
for (const [id, job] of Object.entries(jobs)) {
  const p = join(RAW, `${id}.png`); if (existsSync(p)) continue;
  mkdirSync(RAW, { recursive: true }); const r = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download`);
  if (!r.ok) throw new Error(`fetch ${id}: ${r.status}`); writeFileSync(p, Buffer.from(await r.arrayBuffer()));
}
const manifest = JSON.parse(readFileSync(join(OUT, 'ui.json'), 'utf8'));
const BASE = manifest.palette.filter((h) => !(manifest.craftPalette ?? []).includes(h)); // the palette before this script

// ---------- colours ----------
const RF = { ink: '#0e0907', black: '#17100d', black2: '#251812', terraD: '#7a3418', terra: '#b8592a', terraL: '#de8a4e', terraH: '#f2b27a', cream: '#f0d9b5' };
// rarity ramps (dark, mid, light, highlight) from the game's rarity tokens (src/ui/tokens.ts RARITY_INK / FRAME / TEXT)
const RAR = { common: ['#4f483f', '#9a948a', '#d2ccc0', '#f0ece4'], uncommon: ['#33581d', '#5f9a45', '#9ed67c', '#d4f2bc'], rare: ['#1f478a', '#4a78c0', '#8dbaff', '#cfe2ff'], epic: ['#62298a', '#9a58c0', '#d2a8ff', '#efdcff'], legendary: ['#6e4600', '#e0b040', '#ffd263', '#fff0a0'] };
for (const [k, r] of Object.entries(RAR)) RAMP[`r-${k}`] = r;
RAMP.cream = ['#8a7254', '#b49c78', '#f0d9b5', '#fff4dc'];
const CRAFT = [...new Set([...Object.values(RF), ...Object.values(RAR).flat(), ...RAMP.cream])].filter((h) => !BASE.includes(h));
const PAL = [...BASE, ...CRAFT];

const save = (rel, img, pal) => { const im = snapToPalette(hardAlpha(img, 128), pal); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); writeImage(join(OUT, rel + '.png'), im); writeImage(join(OUT, rel + '@2x.png'), resizeNearest(im, im.w * 2, im.h * 2)); return rel + '.png'; };
const fit = (img, size) => { const t = trim(img); const k = Math.min((size - 2) / t.w, (size - 2) / t.h, 1); const r = k < 1 ? hardAlpha(resizeArea(t, Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k))), 110) : t; const o = blank(size, size); paste(o, r, Math.floor((size - r.w) / 2), Math.floor((size - r.h) / 2)); return o; };
const add = (id, group, src, f32, f24, pal, extra = {}) => { manifest.icons[id] = { group, src, 32: save(`icons/32/${id}`, f32, pal), 24: save(`icons/24/${id}`, f24, pal), ...extra }; };

// ---------- goods (pixen) ----------
const GOODS = { 'res-hides': 'raw', 'res-flax': 'raw', 'res-herbs': 'raw', 'res-charcoal': 'refined', 'res-leather': 'refined', 'res-linen': 'refined', 'res-oil': 'refined', 'res-bandages': 'product', 'res-salves': 'product', 'res-theriac': 'product' };
for (const [id, tier] of Object.entries(GOODS)) { const im = hardAlpha(readImage(join(RAW, `${id}.png`)), 128); add(id, 'resource', 'pixellab', fit(im, 32), fit(im, 24), BASE, { goodTier: tier }); }

// ---------- node medallions ----------
const rgb = (h) => [...hexToRgb(h), 255];
function medal(S, kind) { // kind: node | root | cap
  const im = blank(S, S), c = S / 2, R0 = S / 2 - 0.3;
  const ring = kind === 'root' ? [RF.ink, RF.cream, RF.ink] : kind === 'cap' ? [RF.ink, RF.terraH, RF.terraD, RF.terraL] : [RF.ink, RF.terra, RF.ink];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = R0 - Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d < 0) continue; const k = Math.floor(d); im.data.set(rgb(k < ring.length ? ring[k] : RF.black2), (y * S + x) * 4); }
  if (kind === 'cap') for (const a of [0, 1, 2, 3].map((i) => Math.PI / 4 + (i * Math.PI) / 2)) { const x = Math.round(c - 0.5 + Math.cos(a) * (R0 - 1.5)), y = Math.round(c - 0.5 + Math.sin(a) * (R0 - 1.5)); im.data.set(rgb(RF.cream), (y * S + x) * 4); }
  return im;
}
function nodeIcon(S, kind, shapes) { const m = medal(S, kind), gs = Math.round(S * 0.8), g = glyph(gs, shapes), o = Math.floor((S - gs) / 2); for (let y = 0; y < gs; y++) for (let x = 0; x < gs; x++) { const i = (y * gs + x) * 4; if (g.data[i + 3]) m.data.set(g.data.subarray(i, i + 4), ((y + o) * S + x + o) * 4); } return m; }

// ---------- motifs (32-unit grid) ----------
const anvil = (m = 'iron') => [P(m, [4, 12], [28, 12], [28, 15], [22, 17], [21, 22], [25, 26], [7, 26], [11, 22], [10, 17], [4, 15])];
const ingot = (x, y, m = 'bronze') => P(m, [x, y + 6], [x + 3, y], [x + 13, y], [x + 16, y + 6]);
const pot = (m = 'bronze', y = 10) => [P(m, [6, y], [26, y], [25, y + 10], [21, y + 15], [11, y + 15], [7, y + 10]), R(m, 4, y - 2, 24, 3)];
const fire = (y = 30) => [flame('fire', 12, y, 7, 6), flame('fire', 20, y, 8, 6)];
const leaf = (m = 'green', x = 16, y = 16, s = 1) => [P(m, [x - 9 * s, y + 9 * s], [x - 7 * s, y - 2 * s], [x + 2 * s, y - 9 * s], [x + 9 * s, y - 9 * s], [x + 8 * s, y - 1 * s], [x + 1 * s, y + 7 * s]), L('wood', x - 10 * s, y + 10 * s, x + 4 * s, y - 4 * s, 1.4)];
const coin = (x, y, r = 5) => [C('tin', x, y, r), C('stone', x, y, r * 0.5)];
const pips = (n, m = 'bronze') => [...Array(n)].map((_, i) => C(m, 16 + (i - (n - 1) / 2) * 6, 28, 2.2));
const plus = (m = 'bronze') => [R(m, 23, 20, 8, 3), R(m, 25.5, 17.5, 3, 8)];
const star = (m = 'r-legendary', cx = 24, cy = 24, r = 6) => P(m, ...[...Array(10)].map((_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; }));
const wheel = (x = 23, y = 24, r = 6) => [C('wood', x, y, r, r - 2), L('wood', x - r, y, x + r, y, 1.5), L('wood', x, y - r, x, y + r, 1.5), C('iron', x, y, 1.5)];
const loopArrows = (m = 'green') => [C(m, 16, 16, 12, 9.5), E(R(null, 14, 2, 4, 6)), P(m, [12, 1], [19, 4.5], [12, 8])];
const bow = () => [P('wood', [9, 3], [14, 8], [16, 16], [14, 24], [9, 29], [11, 29], [17, 24], [19, 16], [17, 8], [11, 3]), L('canvas', 10, 4, 10, 28, 1)];
const helmet = (m = 'bronze') => [P(m, [8, 26], [7, 14], [10, 7], [16, 5], [22, 7], [25, 14], [24, 26], [20, 26], [20, 18], [18, 15], [14, 15], [12, 18], [12, 26]), P('red', [10, 7], [16, 2], [24, 4], [20, 7])];
const cuirass = (m = 'bronze') => [P(m, [7, 6], [12, 4], [16, 7], [20, 4], [25, 6], [26, 14], [24, 27], [8, 27], [6, 14]), L(m, 16, 9, 16, 25, 1), C('iron', 12, 13, 1.4), C('iron', 20, 13, 1.4)];
const bone = (m = 'canvas') => [L(m, 9, 23, 23, 9, 4), C(m, 7, 22, 3), C(m, 10, 25, 3), C(m, 22, 7, 3), C(m, 25, 10, 3)];
const roll = (m = 'cream') => [C(m, 12, 18, 7), C('canvas', 12, 18, 3), P(m, [12, 11], [27, 13], [27, 22], [12, 25])];
const tent = (m = 'canvas') => [P(m, [3, 27], [16, 5], [29, 27]), P('wood', [13, 27], [16, 17], [19, 27]), L('wood', 16, 3, 16, 6, 1.6)];
const temple = (m = 'stone') => [P(m, [4, 11], [16, 4], [28, 11]), R(m, 5, 12, 22, 2), ...[7, 12, 18, 23].map((x) => R(m, x, 15, 3, 10)), R(m, 4, 26, 24, 3)];
const scroll = (m = 'cream') => [R(m, 7, 7, 18, 18), C('canvas', 7, 7, 3), C('canvas', 25, 25, 3), L('wood', 11, 13, 21, 13, 1), L('wood', 11, 17, 21, 17, 1), L('wood', 11, 21, 18, 21, 1)];
const scale = (m = 'bronze') => [L(m, 16, 5, 16, 27, 2), L(m, 5, 9, 27, 9, 2), P(m, [2, 17], [8, 17], [5, 10]), P(m, [24, 17], [30, 17], [27, 10]), R(m, 10, 26, 12, 3)];
const crate = (m = 'wood') => [R(m, 6, 9, 20, 16), L('canvas', 6, 9, 26, 25, 1.5), L('canvas', 26, 9, 6, 25, 1.5), E(L(null, 6, 17, 26, 17, 0.8))];
const eye = () => [P('cream', [3, 16], [10, 9], [22, 9], [29, 16], [22, 23], [10, 23]), C('water', 16, 16, 5), C('pitch', 16, 16, 2)];
const sack = (m = 'canvas') => [P(m, [9, 10], [23, 10], [27, 20], [25, 27], [7, 27], [5, 20]), L('wood', 11, 8, 21, 8, 2), P(m, [12, 4], [20, 4], [21, 8], [11, 8])];
const amphora = (m = 'clay') => [P(m, [12, 3], [20, 3], [19, 7], [24, 12], [23, 22], [16, 30], [9, 22], [8, 12], [13, 7]), L(m, 10, 6, 8, 11, 1.5), L(m, 22, 6, 24, 11, 1.5)];
const ship = () => [P('wood', [3, 19], [29, 19], [25, 26], [7, 26]), L('wood', 16, 4, 16, 19, 1.6), P('cream', [17, 5], [26, 9], [17, 16])];
const wagon = () => [R('wood', 4, 12, 24, 8), ...wheel(9, 23, 5), ...wheel(23, 23, 5), L('wood', 28, 16, 31, 12, 2)];
const key = (m = 'bronze') => [C(m, 10, 10, 6, 3), L(m, 14, 14, 27, 27, 3), L(m, 22, 22, 25, 19, 2.4), L(m, 25, 25, 28, 22, 2.4)];
const shield = (m = 'bronze') => [C(m, 16, 16, 12), C('red', 16, 16, 7.5), C(m, 16, 16, 2.5)];
const road = () => [P('stone', [11, 4], [21, 4], [29, 29], [3, 29]), E(L(null, 16, 6, 16, 10, 1)), E(L(null, 16, 14, 16, 19, 1)), E(L(null, 16, 23, 16, 28, 1))];
const basket = () => [P('wood', [5, 13], [27, 13], [24, 27], [8, 27]), L('canvas', 6, 17, 26, 17, 1), L('canvas', 7, 22, 25, 22, 1), C('wood', 16, 13, 9, 7.6), E(R(null, 5, 13, 22, 9)), C('green', 12, 12, 3), C('red', 19, 12, 3)];
const axe = () => [L('wood', 8, 28, 22, 6, 3), P('iron', [18, 4], [27, 6], [29, 15], [24, 11], [21, 12])];
const potLid = () => [...pot('clay', 12), P('pitch', [8, 12], [24, 12], [22, 16], [10, 16])];
const mound = () => [P('pitch', [3, 27], [9, 17], [16, 14], [23, 17], [29, 27]), C('fire', 13, 23, 1.6), C('fire', 19, 21, 1.4), P('stone', [14, 13], [18, 13], [21, 5], [17, 7], [15, 3])];
const arrow = () => [L('wood', 5, 27, 24, 8, 2), P('iron', [22, 4], [28, 4], [28, 10]), P('red', [5, 27], [3, 22], [8, 24]), P('red', [5, 27], [10, 29], [8, 24])];
const hide = () => [P('wood', [8, 4], [24, 4], [27, 10], [25, 16], [28, 24], [22, 28], [10, 28], [4, 24], [7, 16], [5, 10]), L('wood', 4, 4, 28, 4, 2), L('wood', 4, 4, 4, 28, 2), L('wood', 28, 4, 28, 28, 2)];
const spindle = () => [L('wood', 16, 3, 16, 29, 2), C('cream', 16, 18, 7), C('canvas', 16, 18, 3), L('cream', 16, 11, 26, 4, 1.2)];
const press = () => [...amphora('clay'), C('green', 24, 8, 3), C('green', 27, 12, 3)];
const boot = () => [P('wood', [10, 4], [18, 4], [18, 20], [28, 23], [28, 28], [8, 28], [8, 20]), L('canvas', 10, 9, 18, 9, 1), L('canvas', 10, 14, 18, 14, 1)];
const saw = () => [P('iron', [3, 13], [26, 9], [26, 17], [3, 19]), ...[5, 9, 13, 17, 21].map((x) => P('iron', [x, 19], [x + 2, 22], [x + 4, 19])), R('wood', 25, 7, 5, 12)];
const chisel = () => [L('iron', 6, 26, 18, 14, 2.5), L('wood', 18, 14, 26, 6, 4)];
const bridge = () => [R('stone', 2, 12, 28, 6), R('stone', 4, 18, 6, 10), R('stone', 22, 18, 6, 10), E(C(null, 16, 26, 7)), C('stone', 16, 26, 8.5, 7)];
const ramHead = () => [R('wood', 2, 14, 18, 5), P('iron', [18, 11], [27, 13], [30, 17], [27, 21], [18, 23]), P('iron', [21, 11], [24, 6], [28, 8], [26, 11])];
const stakes = () => [L('wood', 6, 28, 12, 6, 2.6), L('wood', 16, 28, 16, 4, 2.6), L('wood', 26, 28, 20, 6, 2.6), P('cream', [10.5, 9], [12, 4], [13.5, 9]), P('cream', [14.5, 7], [16, 2], [17.5, 7]), P('cream', [18.5, 9], [20, 4], [21.5, 9])];
const dioptra = () => [L('wood', 16, 14, 8, 29, 2), L('wood', 16, 14, 24, 29, 2), L('wood', 16, 14, 16, 29, 2), C('bronze', 16, 11, 7, 5), L('bronze', 7, 11, 25, 11, 1.6)];
const boltThrower = () => [R('wood', 4, 15, 24, 3), L('wood', 22, 7, 26, 15, 2), L('wood', 22, 26, 26, 18, 2), L('canvas', 22, 7, 8, 16, 1), L('canvas', 22, 26, 8, 17, 1), L('iron', 8, 16.5, 30, 16.5, 1.4), L('wood', 14, 18, 10, 29, 2), L('wood', 14, 18, 18, 29, 2)];
const sapper = () => [...pick(), C('fire', 9, 24, 3.5), C('pitch', 9, 24, 1.6)];
const towerG = () => [R('wood', 9, 4, 14, 20), ...[13, 19].map((x) => R('pitch', x, 9, 2, 3)), R('wood', 7, 24, 18, 3), ...[10, 22].map((x) => C('wood', x, 28, 2.5)), P('wood', [23, 9], [30, 4], [30, 6], [23, 11])];
const gear = () => [C('bronze', 16, 16, 9, 4), ...[...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; return L('bronze', 16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 3.4); })];
const cup = (m = 'clay') => [P(m, [3, 10], [29, 10], [24, 17], [8, 17]), R(m, 14, 17, 4, 7), R(m, 9, 24, 14, 3), L(m, 3, 10, 1, 7, 1.6), L(m, 29, 10, 31, 7, 1.6)];
const laurel = (m = 'green') => [...[...Array(5)].flatMap((_, i) => { const a = Math.PI * (0.6 + i * 0.17); return [C(m, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 2.4), C(m, 16 - Math.cos(a) * 12, 16 + Math.sin(a) * 12, 2.4)]; })];
const loaf = () => [P('wood', [4, 22], [7, 13], [16, 9], [25, 13], [28, 22]), E(L(null, 11, 13, 9, 20, 1)), E(L(null, 17, 11, 15, 20, 1)), E(L(null, 23, 13, 21, 20, 1))];
const ham = () => [P('red', [6, 24], [5, 15], [11, 7], [20, 7], [24, 13], [21, 21], [12, 26]), C('cream', 11, 21, 3), L('canvas', 22, 10, 29, 4, 1.6)];
const bowl = (m = 'clay', s = 'green') => [P(m, [4, 14], [28, 14], [25, 22], [20, 26], [12, 26], [7, 22]), R(s, 6, 13, 20, 3), P('stone', [11, 11], [13, 3], [15, 11]), P('stone', [17, 11], [19, 4], [21, 11])];
const ladle = () => [L('wood', 26, 4, 12, 18, 2.4), C('bronze', 9, 21, 5.5)];
const snake = () => [L('wood', 16, 3, 16, 29, 2.4), L('green', 11, 8, 21, 12, 2.2), L('green', 21, 12, 11, 18, 2.2), L('green', 11, 18, 21, 24, 2.2), C('green', 11, 7, 2.6)];
const chain = () => [C('iron', 9, 16, 5, 3), C('iron', 16, 16, 5, 3), C('iron', 23, 16, 5, 3)];
const scalpel = () => [L('wood', 6, 26, 15, 17, 3), P('iron', [14, 18], [25, 6], [27, 8], [17, 20])];
const radius = () => [C('water', 16, 16, 12, 10.6), C('red', 16, 16, 2.5)];
const ribs = () => [L('cream', 16, 4, 16, 28, 2), ...[9, 14, 19, 24].flatMap((y) => [L('cream', 16, y, 8, y + 3, 1.8), L('cream', 16, y, 24, y + 3, 1.8)])];
const people = () => [C('canvas', 9, 11, 3), C('canvas', 23, 11, 3), C('red', 16, 9, 3.4), P('canvas', [5, 22], [6, 15], [12, 15], [13, 22]), P('canvas', [19, 22], [20, 15], [26, 15], [27, 22]), P('red', [11, 22], [12, 14], [20, 14], [21, 22]), R('cream', 6, 25, 20, 3)];
const root = () => [...leaf('green', 16, 10, 0.6), L('wood', 16, 14, 16, 22, 2), L('wood', 16, 22, 9, 29, 1.6), L('wood', 16, 22, 23, 29, 1.6), L('wood', 16, 22, 16, 30, 1.6)];
const mule = () => [P('wood', [6, 26], [8, 12], [16, 8], [24, 10], [26, 16], [21, 18], [18, 26]), P('wood', [14, 9], [12, 2], [16, 7]), P('wood', [19, 8], [20, 1], [22, 8]), R('canvas', 8, 18, 12, 6)];
const hand2 = () => [L('cream', 3, 20, 15, 14, 5), L('canvas', 29, 20, 17, 14, 5), C('cream', 16, 14, 4)];

const T = (shapes, ...tags) => [...shapes, ...tags.flat()];
// a motif scaled by k about the origin and moved by (dx, dy): small companions (a shield on a road, an eye over a leaf)
const sc = (shapes, k, dx, dy) => shapes.map((h) => h.t === 'poly' ? { ...h, p: h.p.map(([x, y]) => [x * k + dx, y * k + dy]) } : h.t === 'circle' ? { ...h, x: h.x * k + dx, y: h.y * k + dy, r: h.r * k, r0: h.r0 && h.r0 * k } : h.t === 'line' ? { ...h, p: [h.p[0] * k + dx, h.p[1] * k + dy, h.p[2] * k + dx, h.p[3] * k + dy], w: Math.max(1.2, h.w * k) } : { ...h, x: h.x * k + dx, y: h.y * k + dy, w: h.w * k, h: h.h * k });
const TREES = {
  smith: { smelter: ['root', [...pot('clay', 6), ...fire(31)]], armourer: [cuirass()], bladesmith: [sword(6, 26, 27, 5)], bowyer: [bow()], 'field-forge': [T(anvil(), wheel())], alloy: [[ingot(2, 18), ingot(14, 12, 'tin'), ...plus()]],
    journeyman: [T(hammer(), pips(2))], 'heavy-armour': [helmet()], master: [T(hammer(), pips(3))], masterwork: [T(hammer(), [star()])], reforger: ['cap', T(anvil(), loopArrows())], goldsmith: ['cap', [C('bronze', 16, 16, 11, 7), C('red', 16, 5, 3)]] },
  cook: { 'camp-cook': ['root', [...pot(), ...fire(31)]], baker: [loaf()], 'field-kitchen': [T(pot('bronze', 6), wheel())], 'salt-pork': [ham()], 'stew-pot': [bowl('clay', 'clay')], 'herb-cook': [T(cup(), leaf('green', 24, 24, 0.45))],
    'spartan-mess': [bowl('pitch', 'pitch')], quartermaster: [T(sack(), [L('green', 20, 22, 23, 26, 2), L('green', 23, 26, 29, 17, 2)])], 'big-pot': [T(pot('bronze', 6), plus())], feast: [T(cup('bronze'), laurel())], 'head-cook': ['cap', T(ladle(), [star()])], symposiarch: ['cap', T(cup('clay'), [star('r-legendary', 16, 24, 5)])] },
  physician: { healer: ['root', roll()], bonesetter: [bone()], 'field-surgeon': [T(radius(), scalpel())], herbalist: [leaf()], triage: [people()], rhizotomist: [root()], 'battle-dresser': [T(roll(), pips(2, 'red'))], 'field-tent': [tent()], iatreion: [temple()], anatomist: [ribs()], asclepiad: ['cap', snake()], 'proxenos-of-the-sick': ['cap', T(chain(), [C('red', 16, 26, 3.4)])] },
  engineer: { builder: ['root', hammer()], carpenter: [saw()], 'master-builder': [T(hammer(), plus())], toolmaker: [chisel()], bridgewright: [bridge()], rams: [ramHead()], fortifier: [stakes()], 'instrument-maker': [dioptra()], artillerist: [boltThrower()], sapper: [sapper()], poliorcetes: ['cap', towerG()], archimedes: ['cap', gear()] },
  merchant: { trader: ['root', [...coin(12, 18, 7), ...coin(20, 12, 6)]], haggler: [scale()], packer: [crate()], 'pack-mules': [mule()], appraiser: [eye()], contracts: [scroll()], 'safe-roads': [T(road(), sc(shield('bronze'), 0.5, 8, 14))],
    broker: [T(scroll(), pips(2))], banker: [T(coin(10, 22, 6), key())], importer: [ship()], emporos: ['cap', wagon()], proxenos: ['cap', hand2()] },
  forager: { gatherer: ['root', basket()], woodsman: [axe()], prospector: [pick()], pitchman: [potLid()], 'charcoal-burner': [mound()], hunter: [arrow()], tanner: [hide()], weaver: [spindle()], presser: [press()], 'herb-finder': [T(leaf(), sc(eye(), 0.45, 15, 15))], steward: ['cap', T(sack(), sc(key(), 0.5, 14, 14))], pathfinder: ['cap', boot()] },
};
const nodes = {};
for (const [tree, ns] of Object.entries(TREES)) for (const [node, spec] of Object.entries(ns)) {
  const kind = typeof spec[0] === 'string' ? spec[0] : 'node', shapes = (typeof spec[0] === 'string' ? spec[1] : spec[0]).flat();
  const id = `node-${tree}-${node}`; add(id, 'node', 'drawn', nodeIcon(32, kind, shapes), nodeIcon(24, kind, shapes), PAL, { tree, node, ring: kind });
  (nodes[tree] ??= []).push(node);
}

// ---------- badges ----------
const gem = (m) => [P(m, [16, 3], [27, 13], [16, 29], [5, 13]), E(L(null, 5, 13, 27, 13, 0.8)), P(m, [10, 13], [16, 3], [22, 13])];
const BADGES = {
  'badge-quality-crude': [P('stone', [5, 8], [27, 8], [25, 26], [7, 26]), E(L(null, 14, 8, 18, 15, 1)), E(L(null, 18, 15, 13, 21, 1)), E(L(null, 13, 21, 16, 26, 1))],
  'badge-quality-fine': [...shield('bronze')],
  'badge-quality-masterwork': [...laurel('r-legendary'), star('r-legendary', 16, 16, 8)],
  ...Object.fromEntries(Object.keys(RAR).map((r) => [`badge-rarity-${r}`, [...gem(`r-${r}`), ...(r === 'legendary' ? [L('r-legendary', 16, 0, 16, 2, 1), L('r-legendary', 2, 6, 4, 8, 1), L('r-legendary', 30, 6, 28, 8, 1)] : [])]])),
};
for (const [id, shapes] of Object.entries(BADGES)) add(id, 'badge', 'drawn', glyph(32, shapes), glyph(24, shapes), PAL);

manifest.palette = PAL; manifest.craftPalette = CRAFT; manifest.craftNodes = nodes;
manifest.craftNote = 'ART-C icons: res-<good> (group resource, goodTier raw / refined / product), node-<tree>-<node> (group node: one per profession-tree node, WAR.md "Crafting and professions"; ring root = the free L1 root, cap = an L10 capstone; craftNodes lists them per tree in table order), badge-quality-<crude|fine|masterwork> and badge-rarity-<common..legendary> (group badge). Built by ui-craft.mjs after ui.mjs and ui-redfigure.mjs.';
writeFileSync(join(OUT, 'ui.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`ui craft: ${Object.keys(GOODS).length} goods, ${Object.values(nodes).flat().length} node icons, ${Object.keys(BADGES).length} badges, palette +${CRAFT.length}`);

// ---------- QA (as ui.mjs: sizes, @2x, binary alpha, palette, no background ring on icons) ----------
const fails = [], pal = new Set(PAL.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));
for (const e of Object.values(manifest.icons).filter((q) => ['resource', 'node', 'badge'].includes(q.group))) for (const [sz, rel] of [[32, e[32]], [24, e[24]]]) {
  const im = readImage(join(OUT, rel)); if (im.w !== sz || im.h !== sz) fails.push(`${rel}: ${im.w}x${im.h}`);
  let off = 0, semi = 0; for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a && a < 255) semi++; if (a === 255 && !pal.has((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2])) off++; }
  if (semi) fails.push(`${rel}: ${semi} semi-transparent px`); if (off) fails.push(`${rel}: ${off} px off the palette`);
  let ring = 0, on = 0; for (let k = 0; k < im.w; k++) for (const p of [k, (im.h - 1) * im.w + k, k * im.w, k * im.w + im.w - 1]) { ring++; if (im.data[p * 4 + 3]) on++; }
  if (on > ring * (e.group === 'node' ? 0.45 : 0.3)) fails.push(`${rel}: ${on}/${ring} border px opaque (background?)`);
  let any = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) any++; if (any < sz * 2) fails.push(`${rel}: nearly empty`);
  const im2 = readImage(join(OUT, rel.replace('.png', '@2x.png'))); if (im2.w !== im.w * 2) fails.push(`${rel}: @2x is ${im2.w}x${im2.h}`);
}
if (fails.length) { console.log('UI CRAFT QA FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('UI CRAFT QA ok');
