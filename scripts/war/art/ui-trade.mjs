// War UI, trade icons (ART-T, W-32 red-figure kit, WAR.md "Trade"): cart, wagon, chest, loot pile, load, unload, escort,
// hand-off, contract, rent, coin and the safe-zone badge. All drawn (glyph.mjs pictograms, full colour, the action-icon
// look; the badge on a red-figure medallion: black disc, terracotta ring), 0 generations.
// Additive: run after ui.mjs, ui-redfigure.mjs and ui-craft.mjs; it adds icons to public/war/ui/icons/{32,24} (+ @2x) and
// ui.json (groups trade, action, resource, badge; `tradeIcons` lists them). Uses the palette as it stands.
// Usage: node scripts/war/art/ui-trade.mjs   (ends with the QA gate; exit 1 on any failure)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, resizeNearest, snapToPalette, hardAlpha, hexToRgb } from '../../art/lib/ops.mjs';
import { RAMP, glyph, L, C, P, R, E, man, arrowHead } from './glyph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'public/war/ui');
const manifest = JSON.parse(readFileSync(join(OUT, 'ui.json'), 'utf8'));
const PAL = manifest.palette;
RAMP.cream = ['#8a7254', '#b49c78', '#f0d9b5', '#fff4dc'];
RAMP.silver = RAMP.tin;
const RF = { ink: '#0e0907', black2: '#251812', terra: '#b8592a', terraL: '#de8a4e' };

const save = (rel, img) => { const im = snapToPalette(hardAlpha(img, 128), PAL); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); writeImage(join(OUT, rel + '.png'), im); writeImage(join(OUT, rel + '@2x.png'), resizeNearest(im, im.w * 2, im.h * 2)); return rel + '.png'; };
const rgb = (h) => [...hexToRgb(h), 255];
function medal(S) { const im = blank(S, S), c = S / 2, R0 = S / 2 - 0.3, ring = [RF.ink, RF.terra, RF.terraL, RF.ink]; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = R0 - Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d < 0) continue; const k = Math.floor(d); im.data.set(rgb(k < ring.length ? ring[k] : RF.black2), (y * S + x) * 4); } return im; }
const onMedal = (S, shapes) => { const m = medal(S), gs = Math.round(S * 0.78), g = glyph(gs, shapes), o = Math.floor((S - gs) / 2); for (let y = 0; y < gs; y++) for (let x = 0; x < gs; x++) { const i = (y * gs + x) * 4; if (g.data[i + 3]) m.data.set(g.data.subarray(i, i + 4), ((y + o) * S + x + o) * 4); } return m; };

// ---------- motifs (32-unit grid, light from the upper left) ----------
const wheel = (x, y, r, m = 'wood') => [C(m, x, y, r, r - 2.2), L(m, x - r + 1, y, x + r - 1, y, 1.4), L(m, x, y - r + 1, x, y + r - 1, 1.4), C('bronze', x, y, 1.6)];
const disc = (x, y, r) => [C('wood', x, y, r), C('iron', x, y, r, r - 1.2), C('bronze', x, y, 1.5), E(L(null, x - r + 1, y - 1, x + r - 1, y - 1, 0.6))];
const sack = (x, y, s = 1, m = 'canvas') => [P(m, [x - 5 * s, y], [x + 5 * s, y], [x + 6 * s, y + 6 * s], [x + 4 * s, y + 9 * s], [x - 4 * s, y + 9 * s], [x - 6 * s, y + 6 * s]), L('wood', x - 3 * s, y, x + 3 * s, y, 1.4)];
const crate = (x, y, w, h, m = 'wood') => [R(m, x, y, w, h), L('pitch', x, y, x + w, y + h, 1), L('pitch', x + w, y, x, y + h, 1)];
const amph = (x, y, s = 1) => [P('clay', [x - 1.5 * s, y], [x + 1.5 * s, y], [x + 1.5 * s, y + 2 * s], [x + 4 * s, y + 5 * s], [x + 3.5 * s, y + 10 * s], [x, y + 14 * s], [x - 3.5 * s, y + 10 * s], [x - 4 * s, y + 5 * s], [x - 1.5 * s, y + 2 * s])];
const coin = (x, y, r = 5) => [C('silver', x, y, r), C('stone', x, y, r * 0.55), P('silver', [x - r * 0.3, y + r * 0.3], [x, y - r * 0.4], [x + r * 0.3, y + r * 0.3])];
const box = (x, y, w, h) => [R('wood', x, y, w, h), R('bronze', x, y, w, 2), R('bronze', x + 3, y, 2, h), R('bronze', x + w - 5, y, 2, h), R('iron', x + w / 2 - 1.5, y + h / 2 - 1, 3, 4)];
const cartShapes = () => [P('wood', [3, 13], [23, 13], [23, 20], [3, 20]), R('wood', 3, 10, 2, 4), R('wood', 21, 10, 2, 4), L('wood', 23, 18, 31, 15, 2), ...sack(11, 7, 0.8), ...sack(17, 8, 0.7), ...wheel(13, 23, 6)];
const wagonShapes = () => [P('wood', [2, 12], [24, 12], [24, 20], [2, 20]), ...amph(8, 3, 0.6), ...amph(13, 3, 0.6), ...amph(18, 3, 0.6), ...disc(7, 23, 5), ...disc(20, 23, 5), L('wood', 24, 18, 31, 16, 2)];
const chestShapes = () => [P('wood', [4, 15], [28, 15], [28, 28], [4, 28]), P('wood', [4, 15], [6, 9], [16, 7], [26, 9], [28, 15]), R('iron', 8, 9, 3, 19), R('iron', 21, 9, 3, 19), R('iron', 4, 14, 24, 2), R('bronze', 14, 16, 4, 5), E(R(null, 15, 18, 2, 2))];
const pileShapes = () => [...sack(21, 12, 0.9), ...amph(9, 8, 0.7), L('wood', 2, 18, 30, 24, 1.8), P('iron', [28, 22], [31, 24], [28, 26]), C('bronze', 10, 23, 7.5), C('red', 10, 23, 4.5), C('bronze', 10, 23, 1.6), P('bronze', [17, 30], [17, 23], [20, 19], [25, 19], [28, 23], [28, 30], [25, 30], [25, 25], [20, 25], [20, 30])];
const loadShapes = () => [...crate(8, 19, 16, 11), L('green', 16, 1, 16, 10, 4), arrowHead('green', 16, 10, 'd', 6.5)];
const unloadShapes = () => [...crate(8, 19, 16, 11), L('fire', 16, 16, 16, 8, 4), arrowHead('fire', 16, 8, 'u', 6.5)];
const escortShapes = () => [C('bronze', 11, 16, 9), C('red', 11, 16, 5.5), C('bronze', 11, 16, 1.8), ...wheel(24, 22, 5), R('wood', 18, 13, 12, 5)];
const handoffShapes = () => [L('cream', 2, 22, 13, 17, 5), L('canvas', 30, 22, 19, 17, 5), ...box(10, 7, 12, 9), arrowHead('green', 5, 10, 'l', 3.5), L('green', 5, 10, 10, 10, 1.6), arrowHead('green', 27, 14, 'r', 3.5), L('green', 22, 14, 27, 14, 1.6)];
const contractShapes = () => [R('cream', 6, 4, 20, 24), C('canvas', 6, 4, 3), C('canvas', 26, 28, 3), L('wood', 10, 9, 22, 9, 1), L('wood', 10, 13, 22, 13, 1), L('wood', 10, 17, 18, 17, 1), C('red', 21, 23, 4.5), C('red', 21, 23, 2.5, 1.5)];
const rentShapes = () => [P('clay', [3, 13], [15, 3], [27, 13]), R('stone', 6, 13, 18, 15), R('pitch', 12, 18, 6, 10), ...coin(24, 23, 6.5)];
const coinShapes = () => [C('silver', 16, 16, 12), C('silver', 16, 16, 9.5, 8.5), P('stone', [12, 22], [11, 14], [13, 9], [16, 7], [19, 9], [21, 14], [20, 22]), C('silver', 14, 13, 1.6), C('silver', 18, 13, 1.6), P('green', [21, 22], [26, 17], [27, 20], [23, 24])]; // an Athenian owl with its olive sprig
const safeShapes = () => [P('stone', [5, 9], [9, 5], [12, 9], [16, 5], [20, 9], [23, 5], [27, 9], [27, 28], [5, 28]), R('pitch', 12, 16, 8, 12), C('pitch', 16, 16, 4), P('green', [12, 30], [16, 26], [20, 30]), C('green', 8, 16, 2.2), C('green', 24, 16, 2.2)];

const ICONS = {
  'trade-cart': ['trade', cartShapes], 'trade-wagon': ['trade', wagonShapes], 'trade-chest': ['trade', chestShapes], 'trade-pile': ['trade', pileShapes],
  'act-load': ['action', loadShapes], 'act-unload': ['action', unloadShapes], 'act-escort': ['action', escortShapes], 'act-handoff': ['action', handoffShapes],
  'trade-contract': ['trade', contractShapes], 'trade-rent': ['trade', rentShapes], 'res-coin': ['resource', coinShapes], 'badge-safe-zone': ['badge', safeShapes, true],
};
for (const [id, [group, shapes, med]] of Object.entries(ICONS)) {
  const s = shapes().flat(), f = (S) => (med ? onMedal(S, s) : glyph(S, s));
  manifest.icons[id] = { group, src: 'drawn', 32: save(`icons/32/${id}`, f(32)), 24: save(`icons/24/${id}`, f(24)), ...(id === 'res-coin' && { goodTier: 'refined', note: 'coin: 200 = 1 load (WAR.md "Coin")' }) };
}
manifest.tradeIcons = Object.keys(ICONS);
manifest.tradeNote = 'ART-T icons (WAR.md "Trade"): trade-<cart|wagon|chest|pile|contract|rent> (group trade), act-<load|unload|escort|handoff> (action), res-coin (resource), badge-safe-zone (badge: a walled court with an olive wreath, on the red-figure medallion). Built by ui-trade.mjs after ui-craft.mjs.';
writeFileSync(join(OUT, 'ui.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`ui trade: ${Object.keys(ICONS).length} icons`);

// ---------- QA (as ui-craft.mjs) ----------
const fails = [], pal = new Set(PAL.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));
for (const id of Object.keys(ICONS)) for (const sz of [32, 24]) {
  const rel = manifest.icons[id][sz], im = readImage(join(OUT, rel)); if (im.w !== sz || im.h !== sz) fails.push(`${rel}: ${im.w}x${im.h}`);
  let off = 0, semi = 0, any = 0; for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a) any++; if (a && a < 255) semi++; if (a === 255 && !pal.has((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2])) off++; }
  if (semi) fails.push(`${rel}: ${semi} semi-transparent px`); if (off) fails.push(`${rel}: ${off} px off the palette`); if (any < sz * 2) fails.push(`${rel}: nearly empty`);
  let ring = 0, on = 0; for (let k = 0; k < im.w; k++) for (const p of [k, (im.h - 1) * im.w + k, k * im.w, k * im.w + im.w - 1]) { ring++; if (im.data[p * 4 + 3]) on++; }
  if (on > ring * (ICONS[id][2] ? 0.45 : 0.3)) fails.push(`${rel}: ${on}/${ring} border px opaque (background?)`);
  const im2 = readImage(join(OUT, rel.replace('.png', '@2x.png'))); if (im2.w !== im.w * 2) fails.push(`${rel}: @2x is ${im2.w}x${im2.h}`);
}
if (fails.length) { console.log('UI TRADE QA FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('UI TRADE QA ok');
