// Assemble the war region art (ART-4/5, W-20, W-21) from PixelLab raws into game assets, then run the QA gate.
// Usage: node scripts/war/art/build.mjs [pixellab dir]   (default: shots/war/pixellab of the main checkout; raws in <batch>/raw)
//
// Tiles: each raw set is a create_tiles_pro iso Wang set, 16 tiles of 64x48 (top diamond 64x32 + 16 px side),
// tile_i = corner mask i = NW<<3|NE<<2|SW<<1|SE, a set bit = the pair's first terrain. Each top pixel is classed as
// "first" or "second" terrain and replaced by that terrain's fill (assets.mjs FILLS) at the same place, so every terrain
// is pixel-identical in every set and same-terrain edges line up; the 1 px boundary between the two keeps the raw
// pixels (the drawn bank/edge). The side band is replaced by the set's side source; the dark rim is repainted; all
// tiles snap to one shared palette. Variants: extra full tiles per terrain (assets.mjs VARIANTS).
// Out: public/war/tiles/<pair>.png (16 frames in a row, frame = mask), var-<terrain>.png, tiles.json, cliff side strips.
// Objects: trimmed PNG per object with a foot anchor -> public/war/objects/<id>.png + objects.json.
// Biomes (W-21): after the global set, every scripts/war/art/biomes/<name>.mjs is built by `build.mjs --biome <name>`
// into public/war/biomes/<name>/ (tiles.json, objects.json, PNGs). A biome uses the built global full tiles for the
// global terrains it names (grass, sand, ...), the global cliff sides, and the global palettes extended by its own colours.
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette, rgbToHex, hexToRgb, resizeArea } from '../../art/lib/ops.mjs';
import { runQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2), bi = argv.indexOf('--biome');
const BIOME = bi >= 0 ? argv.splice(bi, 2)[1] : null;
const A = BIOME ? await import(`./biomes/${BIOME}.mjs`) : await import('./assets.mjs');
const { SETS, FILLS, VARIANTS, FALLBACK, CLIFFS, OBJECTS, PX_PER_M, TILE_M } = A;
const PIX = argv[0] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const rawDir = (batch) => join(PIX, batch ?? A.BATCH ?? 'art4', 'raw');
const GLOBAL_T = join(ROOT, 'public/war/tiles'), GLOBAL_O = join(ROOT, 'public/war/objects');
const OUT_T = BIOME ? join(ROOT, 'public/war/biomes', BIOME) : GLOBAL_T, OUT_O = BIOME ? OUT_T : GLOBAL_O;
const G = BIOME ? JSON.parse(readFileSync(join(GLOBAL_T, 'tiles.json'))) : null; // the built global set a biome extends
const TW = 64, TH = 48, HW = 32, HH = 16, SIDE = 16, BAND_E = 0.88;
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const inTop = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH <= 1;
const rimE = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH;
const px = (im, x, y) => (y * im.w + x) * 4;
const dist2 = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
const loadSet = (dir, batch) => [...Array(16)].map((_, i) => readImage(join(rawDir(batch), 'tiles', dir, `tile_${i}.png`)));
const batchOf = (dir) => SETS.find((s) => s.dir === dir)?.batch;

// Repaint the tile's dark outline round the top diamond with the pixel 2 steps inward (else the map shows a grid).
function deline(im) {
  const d = im.data;
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
      const e = rimE(x, y); if (e < 0.84 || e > 1.1) continue;
      const i = px(im, x, y); if (!d[i + 3]) continue;
      if (d[i] + d[i + 1] + d[i + 2] > 120) continue;
      const ix = Math.round(x + Math.sign(HW - 0.5 - x) * 2), iy = Math.round(y + Math.sign(HH - 0.5 - y));
      const j = px(im, ix, iy); d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2];
    }
  return im;
}

// Colour samples of one terrain: the top-face colours of a full tile, inner part only (no rim).
function samples(im) {
  const m = new Map();
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (rimE(x, y) > 0.8) continue; const i = px(im, x, y); if (!im.data[i + 3]) continue;
    const k = (im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].filter(([, n]) => n >= 2).map(([k]) => [k >> 16, (k >> 8) & 255, k & 255]);
}

// Class map of one tile's top: 1 = first terrain. Nearest sample colour, gated by the corner mask (a pixel far from
// every first-terrain corner cannot be first), then two 3x3 majority passes.
function classify(im, mask, A, B, gate = 0.12) {
  const cls = new Uint8Array(TW * TH), near = (c, S) => Math.min(...S.map((s) => dist2(c, s)));
  const corner = [[HW, 0, 8], [TW, HH, 4], [0, HH, 2], [HW, 2 * HH, 1]]; // NW top, NE right, SW left, SE bottom
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y)) continue; const i = px(im, x, y); const c = [im.data[i], im.data[i + 1], im.data[i + 2]];
    // bilinear weight of first-terrain corners in diamond coords
    const u = (x + 0.5) / TW + (y + 0.5) / (2 * HH) - 0.5, v = (y + 0.5) / (2 * HH) - (x + 0.5) / TW + 0.5; // u: NW->NE, v: NW->SW
    const w = (1 - u) * (1 - v) * !!(mask & 8) + u * (1 - v) * !!(mask & 4) + (1 - u) * v * !!(mask & 2) + u * v * !!(mask & 1);
    if (mask === 15) { cls[y * TW + x] = 1; continue; }
    if (mask === 0 || w < gate) continue;
    if (w > 1 - gate) { cls[y * TW + x] = 1; continue; }
    cls[y * TW + x] = near(c, A) <= near(c, B) ? 1 : 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    const prev = cls.slice();
    for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
      if (!inTop(x, y) || mask === 15 || mask === 0) continue; let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= TW || !inTop(X, Y)) continue; s += prev[Y * TW + X]; n++;
      }
      cls[y * TW + x] = s * 2 > n ? 1 : s * 2 < n ? 0 : prev[y * TW + x];
    }
  }
  // Outer band (seams): along an edge the class is the nearer corner's, so the two terrains meet at the edge midpoint
  // in every tile and neighbours always line up.
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y) || rimE(x, y) < BAND_E) continue;
    let best = 1e9, bit = 0;
    for (const [cx, cy, b] of corner) { const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 2); if (d < best) { best = d; bit = b; } }
    cls[y * TW + x] = mask & bit ? 1 : 0;
  }
  return cls;
}

// The fill of a terrain: its raw full tile, rim repainted, top toned. Cached.
const fills = new Map();
// Biome: the built global full tile of a global terrain (already delined and on the global palette).
function globalFull(terrain) {
  const s = G?.sheets.find((s) => s.first === terrain || s.second === terrain); if (!s) return null;
  return crop(readImage(join(GLOBAL_T, s.file)), { x: (s.first === terrain ? 15 : 0) * TW, y: 0, w: TW, h: TH });
}
// A fill's colour shift on the raw top: tone (value x) and/or grade { sat, val }; applied to the fill and the raw edge px.
function shade(d, i, f) {
  if (!f) return;
  if (f.tone) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * f.tone);
  if (f.grade) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((l + (d[i + c] - l) * f.grade.sat) * f.grade.val))); }
}
function fill(terrain) {
  if (fills.has(terrain)) return fills.get(terrain);
  const f = FILLS[terrain];
  if (!f && BIOME) { const g = globalFull(terrain); if (!g) throw new Error(`no global full tile for ${terrain}`); fills.set(terrain, g); return g; }
  if (!f) throw new Error(`no fill for ${terrain}`);
  const t = loadSet(f.dir, f.batch ?? batchOf(f.dir))[f.frame], im = deline({ w: TW, h: TH, data: new Uint8Array(t.data) });
  if (f.tone || f.grade) for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y)) shade(im.data, px(im, x, y), f);
  fills.set(terrain, im); return im;
}

function buildSet(set, sides) {
  const raw = loadSet(set.dir, set.batch).map((t) => (check(t.w === TW && t.h === TH, `${set.pair}: tile ${t.w}x${t.h}`), t));
  const side = set.side === 'own' ? raw[0] : sides[set.side ?? 'earth'];
  const A = samples(raw[15]), B = samples(raw[0]);
  const F = [fill(set.second), fill(set.first)], tone = [FILLS[set.second], FILLS[set.first]];
  return raw.map((t, mask) => {
    const im = { w: TW, h: TH, data: new Uint8Array(t.data) };
    const cls = classify(t, mask, A, B, set.gate);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const i = px(im, x, y);
      if (inTop(x, y)) {
        const c = cls[y * TW + x];
        let edge = false; // the 1 px boundary between the terrains keeps the raw (toned) pixel (the drawn bank / edge), except in the outer band
        if (rimE(x, y) < BAND_E) for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (inTop(X, Y) && cls[Y * TW + X] !== c) { edge = true; break; } }
        if (edge) shade(im.data, i, tone[c]);
        else im.data.set(F[c].data.subarray(i, i + 4), i);
      } else if (side) im.data.set(side.data.subarray(i, i + 4), i);
    }
    return deline(im);
  });
}

// A full-tile variant: the base's outer band (seams) with a new interior from `src`, joined along a noisy line.
const hash = (x, y, k) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000 / 1000;
function planeAt(base, x, y) { // the base tiled over the iso lattice, sampled at (x, y)
  for (let n = -2; n <= 2; n++) for (let m = -2; m <= 2; m++) {
    const X = x - HW * (n - m), Y = y - HH * (n + m); if (X >= 0 && Y >= 0 && X < TW && Y < 2 * HH && inTop(X, Y)) return px(base, X, Y);
  }
  return px(base, HW, HH);
}
function colourMatch(t, ref) { // per-channel mean/std transfer of t's top onto ref's
  const st = (im) => [0, 1, 2].map((c) => { let s = 0, q = 0, n = 0; for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y)) { const v = im.data[px(im, x, y) + c]; s += v; q += v * v; n++; } const m = s / n; return [m, Math.sqrt(Math.max(1, q / n - m * m))]; });
  const a = st(t), b = st(ref), out = { w: TW, h: TH, data: new Uint8Array(t.data) };
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y)) for (let c = 0; c < 3; c++) { const i = px(out, x, y) + c; out.data[i] = Math.max(0, Math.min(255, Math.round(b[c][0] + ((t.data[i] - a[c][0]) / a[c][1]) * b[c][1]))); }
  return out;
}
function variant(base, src, k) {
  const out = { w: TW, h: TH, data: new Uint8Array(base.data) };
  const rawSrc = typeof src === 'object' ? loadSet(src.dir, src.batch ?? batchOf(src.dir))[src.frame] : null; // src.y: top vertex row of a non-set tile (64x64)
  const s = rawSrc ? deline(colourMatch(src.y ? crop(rawSrc, { x: 0, y: src.y, w: TW, h: TH }) : rawSrc, base)) : null;
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y) || rimE(x, y) >= 0.84 + 0.05 * hash(x, y, k)) continue;
    const j = src === 'mirror' ? px(base, TW - 1 - x, y) : src === 'shift' ? planeAt(base, x + HW, y) : px(s, x, y);
    out.data.set((s ?? base).data.subarray(j, j + 4), px(out, x, y));
  }
  return out;
}

function sheet(tiles) {
  const im = blank(TW * 16, TH);
  tiles.forEach((t, i) => paste(im, t, i * TW, 0));
  return im;
}

// Median cut palette over every opaque pixel of the given images.
function medianCut(images, n) {
  const all = [];
  for (const im of images) for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] > 128) all.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  let boxes = [all];
  while (boxes.length < n) {
    boxes.sort((a, b) => b.length - a.length); const b = boxes.shift(); if (b.length < 2) { boxes.push(b); break; }
    const rng = [0, 1, 2].map((c) => { let mn = 255, mx = 0; for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; } return mx - mn; });
    const c = rng.indexOf(Math.max(...rng)); b.sort((x, y) => x[c] - y[c]); const m = b.length >> 1; boxes.push(b.slice(0, m), b.slice(m));
  }
  return [...new Set(boxes.map((b) => { const s = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c]; return rgbToHex(s.map((v) => Math.round(v / b.length))); }))];
}

// ---- tiles
mkdirSync(OUT_T, { recursive: true });
const sides = {};
for (const c of G?.cliffs ?? []) { // biome: global cliff strips as named sides (the strip is the side band from y 16)
  const s = blank(TW, TH); paste(s, readImage(join(GLOBAL_T, c.file)), 0, HH); sides[c.id] = s;
}
const built = [];
for (const set of SETS) {
  if (!existsSync(join(rawDir(set.batch), 'tiles', set.dir))) { errors.push(`missing raw set ${set.batch ?? A.BATCH ?? 'art4'}/${set.dir}`); continue; }
  if (set.sideName) sides[set.sideName] = grade({ ...loadSet(set.dir, set.batch)[set.sideFrom] }, set.sideGrade);
  built.push([set, buildSet(set, sides)]);
}
const fullOf = (t) => { for (const [s, tiles] of built) { if (s.first === t) return tiles[15]; if (s.second === t) return tiles[0]; } return BIOME ? globalFull(t) : null; };
const variants = Object.entries(VARIANTS).map(([terrain, srcs]) => {
  const base = fullOf(terrain); if (!base) { errors.push(`variant ${terrain}: no set has it`); return null; }
  return [terrain, [base, ...srcs.map((s, k) => variant(base, s, k + 1))], srcs];
}).filter(Boolean);
// Biome palette: the global palette (unchanged, first) + up to n colours median-cut from the pixels that sit far from it.
function extendPalette(base, images, n, far = 12) {
  const pal = base.map(hexToRgb), cache = new Map();
  const isFar = (r, g, b) => { const k = (r << 16) | (g << 8) | b; if (!cache.has(k)) cache.set(k, Math.min(...pal.map(([R, G2, B]) => (r - R) ** 2 + (g - G2) ** 2 + (b - B) ** 2)) > far * far); return cache.get(k); };
  const only = images.map((im) => { const o = { w: im.w, h: im.h, data: new Uint8Array(im.data) }; for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3] > 128 && !isFar(o.data[i], o.data[i + 1], o.data[i + 2])) o.data[i + 3] = 0; return o; });
  const extra = only.some((o) => o.data.some((v, i) => i % 4 === 3 && v > 128)) ? medianCut(only, n) : [];
  return [...base, ...extra.filter((h) => !base.includes(h))];
}
const ownTiles = [...built.flatMap(([, t]) => t), ...variants.flatMap(([, f]) => f)];
const palette = BIOME ? extendPalette(G.palette, ownTiles, A.EXTRA_COLOURS ?? 48) : medianCut(ownTiles, 128);
const tilesJson = {
  ...(BIOME && { biome: BIOME, extends: 'public/war/tiles/tiles.json', note: 'biome set: draw with the global sheets, variants and cliffs plus these; a biome variant list replaces the global one for its terrain; palette = the global palette (first entries, unchanged) + this biome\'s colours' }),
  tile: { w: TW, h: TH, topH: 2 * HH, levelPx: SIDE, metres: TILE_M }, mask: 'NW<<3|NE<<2|SW<<1|SE, set bit = first terrain; frame index = mask; NW is the top vertex', anchor: { x: HW, y: 0, note: 'top vertex of the top diamond' }, palette, sheets: [],
  variants: [], fallback: FALLBACK,
};
for (const [set, tiles] of built) {
  const snapped = tiles.map((t) => snapToPalette(t, palette));
  writeImage(join(OUT_T, `${set.pair}.png`), sheet(snapped));
  tilesJson.sheets.push({ pair: set.pair, first: set.first, second: set.second, file: `${set.pair}.png`, frames: 16, frame: { w: TW, h: TH }, maskToFrame: [...Array(16).keys()], source: set.source });
}
for (const [terrain, frames, srcs] of variants) {
  const im = blank(TW * frames.length, TH); frames.forEach((t, i) => paste(im, snapToPalette(t, palette), i * TW, 0));
  writeImage(join(OUT_T, `var-${terrain}.png`), im);
  tilesJson.variants.push({ terrain, file: `var-${terrain}.png`, frames: frames.length, frame: { w: TW, h: TH }, sources: ['fill', ...srcs.map((s) => (typeof s === 'string' ? s : `${s.batch ?? A.BATCH ?? 'art4'}/${s.dir}#${s.frame}`))], note: `full ${terrain} tiles; wherever a sheet would draw the full ${terrain} tile, draw frame hash(x, y) % frames instead; frame 0 = that tile; all frames share its outer band, so they sit next to any transition tile` });
}
// Cliff side strips: the 16 px side band of a full tile (left + right faces), one per material; stack per level.
for (const c of CLIFFS) {
  const src = sides[c.from]; if (!src) { errors.push(`cliff ${c.id}: no side ${c.from}`); continue; }
  const side = { w: TW, h: TH, data: new Uint8Array(src.data) };
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y)) side.data[px(side, x, y) + 3] = 0;
  const strip = snapToPalette(crop(side, { x: 0, y: HH, w: TW, h: TH - HH }), palette);
  writeImage(join(OUT_T, `cliff-${c.id}.png`), strip);
  (tilesJson.cliffs ??= []).push({ id: c.id, file: `cliff-${c.id}.png`, w: TW, h: TH - HH, levelPx: SIDE, note: 'side faces only (left + right), 64x32; its top edge follows the lower half of the diamond; for a cliff of n levels draw it n times, 16 px apart, at tile origin y + 16' });
}
writeFileSync(join(OUT_T, 'tiles.json'), JSON.stringify(tilesJson, null, 1) + '\n');

// ---- objects
mkdirSync(OUT_O, { recursive: true });
// Flood-fill an opaque border background (PixelLab sometimes returns a grey ground) to transparent.
function keyBorder(im, tol = 18, all = false) {
  const { w, h, data: d } = im; if (d[3] < 255) return im;
  const ref0 = [d[0], d[1], d[2]], seen = new Uint8Array(w * h), st = [];
  const ok = (i) => Math.abs(d[i * 4] - ref0[0]) + Math.abs(d[i * 4 + 1] - ref0[1]) + Math.abs(d[i * 4 + 2] - ref0[2]) <= tol;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const i = st.pop(); if (seen[i] || !ok(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w);
  }
  if (all) for (let i = 0; i < w * h; i++) if (ok(i)) d[i * 4 + 3] = 0;
  return im;
}
// Drop the ground patch PixelLab draws under objects anyway (owner: no ground under objects, W-20), see assets.mjs.
const isGreen = (r, g, b) => g > r + 4 && g >= b - 4;
const isNeutral = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 30 && !isGreen(r, g, b);
const KEEP = { notgreen: (r, g, b) => !(g >= r - 2 && g >= b - 4), green: (r, g, b) => isGreen(r, g, b) || (g >= r - 6 && b < g + 30 && r < g + 10), neutral: isNeutral };
function dropBase(im, b) {
  if (!b) return im;
  const d = im.data;
  for (let y = b.y0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = px(im, x, y); if (!d[i + 3]) continue;
    const near = (b.drop ?? []).some(([hex, tol]) => { const c = hexToRgb(hex); return Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) <= tol; });
    if (y >= (b.cut ?? 1e9) || x < (b.x0 ?? 0) || x > (b.x1 ?? 1e9) || near || (b.keep && !KEEP[b.keep](d[i], d[i + 1], d[i + 2]))) d[i + 3] = 0;
  }
  return dropSpecks(im);
}
// Remove small detached bits (< 1% of the sprite) left by the base drop.
function dropSpecks(im) {
  const { w, h, data: d } = im, lab = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s = 0; s < w * h; s++) {
    if (lab[s] >= 0 || d[s * 4 + 3] < 128) continue;
    const id = sizes.length, st = [s]; let n = 0; lab[s] = id;
    while (st.length) {
      const i = st.pop(); n++; const x = i % w, y = (i / w) | 0;
      for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && d[j * 4 + 3] >= 128) { lab[j] = id; st.push(j); }
    }
    sizes.push(n);
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] < total * 0.01) d[i * 4 + 3] = 0;
  return im;
}
function grade(im, g) {
  if (!g) return im;
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((l + (d[i + c] - l) * g.sat) * g.val)));
  }
  return im;
}
const objJson = { pxPerMetre: PX_PER_M, tileMetres: TILE_M, note: 'anchor = foot point in the PNG (px): centre of the bottom rows; draw at the ground point minus anchor; no ground patch; metres = design height (h = metres x 33 +-10%); colours = tiles.json palette + palette', palette: [], objects: [] };
// Foot point: mean x of the opaque pixels in the bottom rows (trunk base / base centre), bottom row.
function footOf(im) {
  const rows = Math.max(3, Math.round(im.h * 0.03)); let s = 0, n = 0;
  for (let y = im.h - rows; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[px(im, x, y) + 3]) { s += x; n++; }
  return { x: Math.round(s / n), y: im.h - 1 };
}
const objImages = [];
for (const o of OBJECTS) {
  const f = join(rawDir(o.batch), 'objects', `${o.raw}.png`); if (!existsSync(f)) { errors.push(`missing object raw ${o.batch ?? A.BATCH ?? 'art4'}/${o.raw}`); continue; }
  let im = grade(dropBase(keyBorder(readImage(f), o.keyTol, o.keyAll), o.base), o.grade);
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0;
  im = crop(im, alphaBox(im, 1));
  if (o.scale) { // drawn too big for 33 px/m: area-downscale, then hard alpha again
    im = resizeArea(im, Math.round(im.w * o.scale), Math.round(im.h * o.scale));
    for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0;
    im = crop(im, alphaBox(im, 1));
  }
  if (o.mirror) { const m = blank(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) m.data.set(im.data.subarray(px(im, x, y), px(im, x, y) + 4), px(m, im.w - 1 - x, y)); im = m; } // a piece along the other tile axis
  objImages.push([o, im, footOf(im)]);
}
// Biome: the global object palette (first, unchanged) + up to 64 own colours far from the tile and global object palettes.
const GO = BIOME ? JSON.parse(readFileSync(join(GLOBAL_O, 'objects.json'))) : null;
const objPalette = BIOME ? extendPalette([...palette, ...GO.palette], objImages.map(([, im]) => im), 64).slice(palette.length) : medianCut(objImages.map(([, im]) => im), 128);
objJson.palette = objPalette;
for (const [o, im, foot] of objImages) {
  writeImage(join(OUT_O, `${o.id}.png`), snapToPalette(im, [...palette, ...objPalette]));
  objJson.objects.push({ id: o.id, kind: o.kind, file: `${o.id}.png`, w: im.w, h: im.h, metres: o.metres, anchor: foot, footprint: o.footprint, blocksMovement: o.blocks, ...o.extra, source: o.source });
}
writeFileSync(join(OUT_O, 'objects.json'), JSON.stringify(objJson, null, 1) + '\n');

console.log(`tiles: ${built.length} sets, ${variants.length} variant fills, palette ${palette.length}; objects: ${objImages.length}`);
if (errors.length) { console.error('BUILD FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
let failed = runQa(BIOME ?? undefined).length > 0;
// The global build then rebuilds every biome on top of it (each one runs its own QA).
if (!BIOME) for (const f of readdirSync(join(dirname(fileURLToPath(import.meta.url)), 'biomes')).filter((f) => f.endsWith('.mjs'))) {
  try { execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--biome', f.slice(0, -4), PIX], { stdio: 'inherit' }); } catch { failed = true; }
}
process.exit(failed ? 1 : 0);