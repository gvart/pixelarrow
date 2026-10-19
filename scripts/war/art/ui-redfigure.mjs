// War UI kit, red-figure theme (W-32): black bands with a terracotta meander and thin borders, a round meander minimap
// ring, buttons, tabs, bars and two painted red-figure accents (runner, horse). Frames, buttons and bars are drawn here
// from a 5 x 6 px running-key pattern (0 generations); the accents are PixelLab pixen 40x40 (ids in ui-jobs.json
// `redfigure`), snapped to the terracotta ramp. Icons and cursors stay from the first kit (ui.mjs).
// Run after ui.mjs: it replaces frames/, buttons/, bars/ and their ui.json entries and sets `theme: "redfigure"`.
// Raws: shots/war/pixellab/ui2/raw/ (git-ignored; fetched when missing).
// Usage: node scripts/war/art/ui-redfigure.mjs   (ends with the QA gate; exit 1 on any failure)
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, resizeNearest, resizeArea, snapToPalette, hardAlpha, hexToRgb, trim } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = join(ROOT, 'shots/war/pixellab/ui2/raw');
const OUT = join(ROOT, 'public/war/ui');
const jobs = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/ui-jobs.json'), 'utf8')).redfigure;

for (const [id, job] of Object.entries(jobs)) {
  const p = join(RAW, `${id}.png`);
  if (existsSync(p)) continue;
  mkdirSync(RAW, { recursive: true });
  const r = await fetch(`https://api.pixellab.ai/mcp/images/${job}/download`);
  if (!r.ok) throw new Error(`fetch ${id}: ${r.status}`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
}

// ---------- palette ----------
const C = {
  ink: '#0e0907', black: '#17100d', black2: '#251812', hover: '#33201a', press: '#4a2414',
  terraD: '#7a3418', terra: '#b8592a', terraL: '#de8a4e', terraH: '#f2b27a', cream: '#f0d9b5',
  grey: '#5d4c42', greyL: '#8a786a',
};
const FILL = {
  hp: ['#e05a3c', '#b42c22', '#b42c22', '#6e1712'],
  construction: ['#f0c050', '#c8861e', '#c8861e', '#7a4c12'],
  burn: ['#ffb040', '#e0661a', '#e0661a', '#8a2a08'],
  ok: ['#86c058', '#4c8c34', '#4c8c34', '#2c5a22'],
  water: ['#64a8d8', '#2e6c9c', '#2e6c9c', '#1c3c5c'],
};
const PALETTE = [...new Set([...Object.values(C), ...Object.values(FILL).flat()])];
const FIGURE = [C.ink, C.black, C.terraD, C.terra, C.terraL, C.terraH, C.cream];

// ---------- drawing ----------
const rgb = (h) => [...hexToRgb(h), 255];
const set = (img, x, y, h) => { if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; img.data.set(h ? rgb(h) : [0, 0, 0, 0], (y * img.w + x) * 4); };
const rect = (img, x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(img, i, j, c); };
const fillImg = (w, h, c) => { const o = blank(w, h); rect(o, 0, 0, w, h, c); return o; };
/** Running key, 5 rows x 6 columns per period, '#' = line. */
const KEY = ['#####.', '#...#.', '#.###.', '#.#...', '#.####'];
const PERIOD = 6;
const key = (x, y) => KEY[y][((x % PERIOD) + PERIOD) % PERIOD] === '#';

/** A meander strip (10 rows): ink, terracotta line, black, key x5, black, terracotta line. flip = mirrored for the bottom. */
function strip(img, y0, x0, x1, flip = false, ox = 0) {
  const rows = [C.ink, C.terra, C.black, null, null, null, null, null, C.black, C.terra];
  rows.forEach((c, k) => {
    const y = flip ? y0 + 9 - k : y0 + k;
    for (let x = x0; x < x1; x++) set(img, x, y, c ?? (key(x - ox, flip ? 4 - (k - 3) : k - 3) ? C.terraL : C.black));
  });
}
/** Left / right border columns: ink, terracotta, black, dark terracotta. */
function sides(img, y0, y1) {
  for (let y = y0; y < y1; y++) {
    [C.ink, C.terra, C.black, C.terraD].forEach((c, k) => { set(img, k, y, c); set(img, img.w - 1 - k, y, c); });
  }
}
/** A corner stud in the strip at x (2 x 3, light terracotta with a highlight). */
const stud = (img, x, y) => { rect(img, x, y, 2, 3, C.terraL); set(img, x, y, C.terraH); };

const manifest = JSON.parse(readFileSync(join(OUT, 'ui.json'), 'utf8'));
for (const d of ['frames', 'buttons', 'bars', 'accents']) rmSync(join(OUT, d), { recursive: true, force: true });
manifest.theme = 'redfigure';
manifest.note = 'War UI kit, red-figure theme (W-32). Sizes are 1x art px; every PNG has an @2x twin (nearest). slice = 9-slice margins {l, t, r, b}: corners fixed, edges and centre stretch; edges "tile" + period = the horizontal edges repeat (meander) and the box width minus l + r must be a multiple of the period. Icons: 32 and 24 px (full colour). Cursors: 32 px with hotspot.';
manifest.palette = [...new Set([...PALETTE, ...manifest.palette])];
manifest.frames = {}; manifest.buttons = {}; manifest.bars = {}; manifest.accents = {};
const save = (rel, img, pal = PALETTE) => {
  const im = snapToPalette(hardAlpha(img, 128), pal);
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  writeImage(join(OUT, rel + '.png'), im);
  writeImage(join(OUT, rel + '@2x.png'), resizeNearest(im, im.w * 2, im.h * 2));
  return { file: rel + '.png', w: im.w, h: im.h };
};

// ---------- frames ----------
const SIDE = 6; // corner width: 4 border columns, then 2 black before the key starts
{ // band: meander top and bottom (top resource band)
  const w = SIDE * 2 + PERIOD * 2, h = 24, img = fillImg(w, h, C.black);
  strip(img, 0, 0, w, false, SIDE); strip(img, h - 10, 0, w, true, SIDE); sides(img, 10, h - 10);
  for (const x of [0, w - 1]) for (const y of [0, 9, h - 10, h - 1]) set(img, x, y, C.ink);
  for (const [x, y] of [[2, 4], [w - 4, 4], [2, h - 7], [w - 4, h - 7]]) { rect(img, x - 1, y - 1, 4, 5, C.black); stud(img, x, y); }
  manifest.frames.band = { ...save('frames/band', img), slice: { l: SIDE, t: 10, r: SIDE, b: 10 }, edges: 'tile', period: [PERIOD, 1], use: 'top resource band (meander top and bottom)' };
}
{ // card: meander top, thin border elsewhere (command card, build bar)
  const w = SIDE * 2 + PERIOD * 2, h = 18, img = fillImg(w, h, C.black);
  strip(img, 0, 0, w, false, SIDE); sides(img, 10, h);
  for (let x = 0; x < w; x++) { set(img, x, h - 1, C.ink); set(img, x, h - 2, C.terra); if (x >= 2 && x < w - 2) set(img, x, h - 4, x >= 3 && x < w - 3 ? C.terraD : C.black), set(img, x, h - 3, C.black); }
  for (const x of [0, w - 1]) { set(img, x, 0, C.ink); set(img, x, 9, C.ink); }
  for (const x of [2, w - 4]) { rect(img, x - 1, 3, 4, 5, C.black); stud(img, x, 4); }
  manifest.frames.card = { ...save('frames/card', img), slice: { l: SIDE, t: 10, r: SIDE, b: 4 }, edges: 'tile', period: [PERIOD, 1], use: 'command card, build bar (meander top, thin border)' };
}
{ // tooltip: thin double border, studs in the corners
  const w = 12, h = 12, img = fillImg(w, h, C.black);
  for (let i = 0; i < w; i++) for (const [k, c] of [[0, C.ink], [1, C.terra], [3, C.terraD]]) { if (k === 3 && (i < 3 || i > w - 4)) continue; set(img, i, k, c); set(img, i, h - 1 - k, c); set(img, k, i, c); set(img, w - 1 - k, i, c); }
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) set(img, x, y, null);
  for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) set(img, x, y, C.terraH);
  manifest.frames.tooltip = { ...save('frames/tooltip', img), slice: { l: 4, t: 4, r: 4, b: 4 }, edges: 'stretch', use: 'tooltip (cost, labour); cream text' };
}
{ // label: the hover label "E: ..."
  const w = 8, h = 8, img = fillImg(w, h, C.black);
  for (let i = 0; i < w; i++) for (const [k, c] of [[0, C.ink], [1, C.terra]]) { set(img, i, k, c); set(img, i, h - 1 - k, c); set(img, k, i, c); set(img, w - 1 - k, i, c); }
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) set(img, x, y, null);
  manifest.frames.label = { ...save('frames/label', img), slice: { l: 3, t: 3, r: 3, b: 3 }, edges: 'stretch', use: 'hover label (E: action); cream text, key letter terracotta' };
}
{ // round minimap: a meander ring (key at 2x) round a transparent window
  const D = 168, c = D / 2, R = 83.5, img = blank(D, D);
  const ring = [C.ink, C.terra, C.black, ...Array(10).fill(null), C.black, C.terra, C.ink];
  const mid = R - ring.length / 2, n = Math.round((2 * Math.PI * mid) / (PERIOD * 2));
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), k = Math.floor(R - r);
    if (k < 0 || k >= ring.length) continue;
    let col = ring[k];
    if (!col) {
      const u = ((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * n * PERIOD;
      col = key(Math.floor(u), 4 - Math.floor((k - 3) / 2)) ? C.terraL : C.black;
    }
    set(img, x, y, col);
  }
  manifest.frames['minimap-round'] = { ...save('frames/minimap-round', img), window: { cx: c, cy: c, r: Math.floor(R - ring.length) + 1 }, use: 'round minimap frame (meander ring), fixed size; draw the map in the window circle under it' };
}

// ---------- buttons ----------
const BTN = {
  normal: { edge: C.terra, fill: C.black2, top: C.terraD },
  hover: { edge: C.terraL, fill: C.hover, top: C.terra },
  pressed: { edge: C.terraD, fill: C.press, top: C.ink },
  disabled: { edge: C.grey, fill: C.black, top: C.black },
  active: { edge: C.terraH, fill: C.press, top: C.terraL },
};
function button(w, h, s) {
  const img = fillImg(w, h, s.fill);
  for (let x = 0; x < w; x++) { set(img, x, 0, C.ink); set(img, x, h - 1, C.ink); }
  for (let y = 0; y < h; y++) { set(img, 0, y, C.ink); set(img, w - 1, y, C.ink); }
  for (let x = 1; x < w - 1; x++) { set(img, x, 1, s.edge); set(img, x, h - 2, s.edge); set(img, x, 2, s.top); }
  for (let y = 1; y < h - 1; y++) { set(img, 1, y, s.edge); set(img, w - 2, y, s.edge); }
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) set(img, x, y, null);
  return img;
}
function states(name, w, h, extra) {
  const e = { states: {}, w, h, ...extra };
  for (const [st, s] of Object.entries(BTN)) e.states[st] = save(`buttons/${name}-${st}`, button(w, h, s)).file;
  manifest.buttons[name] = e;
}
states('button-icon', 30, 30, { content: { x: 3, y: 3, w: 24, h: 24 }, slice: { l: 3, t: 3, r: 3, b: 3 }, use: 'square icon button (command card, build bar); icon 24 inside, 1 px down when pressed; active = toggled / current tool' });
states('button', 12, 12, { slice: { l: 3, t: 3, r: 3, b: 3 }, use: 'text button (9-slice); cream label' });
{ // tabs: active joins the card below (no bottom border), inactive is darker
  const tab = (s, active) => {
    const w = 12, h = 12, img = fillImg(w, h, s.fill);
    for (let x = 0; x < w; x++) { set(img, x, 0, C.ink); set(img, x, 1, s.edge); }
    for (let y = 0; y < h; y++) { set(img, 0, y, C.ink); set(img, w - 1, y, C.ink); set(img, 1, y, s.edge); set(img, w - 2, y, s.edge); }
    if (!active) for (let x = 0; x < w; x++) set(img, x, h - 1, C.terra);
    set(img, 0, 0, null); set(img, w - 1, 0, null);
    return img;
  };
  const e = { states: {}, w: 12, h: 12, slice: { l: 3, t: 3, r: 3, b: 2 }, use: 'build bar tab (Camp / Walls / Siege); active joins the card' };
  e.states.active = save('buttons/tab-active', tab({ edge: C.terraL, fill: C.black }, true)).file;
  e.states.inactive = save('buttons/tab-inactive', tab({ edge: C.terraD, fill: C.ink }, false)).file;
  e.states.hover = save('buttons/tab-hover', tab({ edge: C.terra, fill: C.black2 }, false)).file;
  manifest.buttons.tab = e;
}

// ---------- bars ----------
{
  const w = 6, h = 6, img = fillImg(w, h, C.ink);
  for (let x = 0; x < w; x++) { set(img, x, 0, C.terraD); set(img, x, h - 1, C.terraD); }
  for (let y = 0; y < h; y++) { set(img, 0, y, C.terraD); set(img, w - 1, y, C.terraD); }
  set(img, 0, 0, null); set(img, w - 1, 0, null); set(img, 0, h - 1, null); set(img, w - 1, h - 1, null);
  manifest.bars.track = { ...save('bars/track', img), slice: { l: 2, t: 0, r: 2, b: 0 }, fixedHeight: h, fill: { x: 1, y: 1, h: 4 }, use: 'progress bar track; draw a fill strip at fill.x, fill.y, stretched to value' };
  for (const [k, ramp] of Object.entries(FILL)) {
    const f = blank(2, 4);
    ramp.forEach((c, y) => rect(f, 0, y, 2, 1, c));
    manifest.bars[`fill-${k}`] = { ...save(`bars/fill-${k}`, f), stretch: 'x' };
  }
}

// ---------- accents ----------
const ACCENT_H = 26;
for (const [id, src] of [['runner', 'runner'], ['horse', 'horse']]) {
  let im = trim(hardAlpha(readImage(join(RAW, `${src}.png`)), 128));
  if (im.h > ACCENT_H) im = hardAlpha(resizeArea(im, Math.round((im.w * ACCENT_H) / im.h), ACCENT_H), 110);
  manifest.accents[id] = { ...save(`accents/${id}`, im, FIGURE), use: id === 'runner' ? 'red-figure runner, left end of a band (faces right)' : 'red-figure horse, right end of a band (faces left)' };
}

writeFileSync(join(OUT, 'ui.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`ui kit (redfigure): ${Object.keys(manifest.frames).length} frames, ${Object.keys(manifest.buttons).length} buttons, ${Object.keys(manifest.bars).length} bars, ${Object.keys(manifest.accents).length} accents`);

// ---------- QA ----------
const fails = [];
const pal = new Set(manifest.palette.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));
const check = (rel, w, h) => {
  const im = readImage(join(OUT, rel));
  if (w && (im.w !== w || im.h !== h)) fails.push(`${rel}: ${im.w}x${im.h}, want ${w}x${h}`);
  let off = 0, semi = 0;
  for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a && a < 255) semi++; if (a === 255 && !pal.has((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2])) off++; }
  if (semi) fails.push(`${rel}: ${semi} semi-transparent px`);
  if (off) fails.push(`${rel}: ${off} px off the palette`);
  const im2 = readImage(join(OUT, rel.replace('.png', '@2x.png')));
  if (im2.w !== im.w * 2 || im2.h !== im.h * 2) fails.push(`${rel}: @2x is ${im2.w}x${im2.h}`);
};
for (const g of ['frames', 'bars', 'accents']) for (const e of Object.values(manifest[g])) { check(e.file, e.w, e.h); if (e.slice) { const s = e.slice; if (s.l + s.r >= e.w || s.t + s.b > e.h) fails.push(`${e.file}: slice leaves no centre`); } }
for (const e of Object.values(manifest.buttons)) for (const f of Object.values(e.states)) check(f, e.w, e.h);
for (const e of Object.values(manifest.icons)) { check(e[32], 32, 32); check(e[24], 24, 24); }
for (const e of Object.values(manifest.cursors)) check(e.file, 32, 32);
if (fails.length) { console.log('UI QA FAIL\n' + fails.join('\n')); process.exit(1); }
console.log('UI QA ok');
