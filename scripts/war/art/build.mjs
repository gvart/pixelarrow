// Assemble the war region art (ART-4, W-20) from PixelLab raws into game assets.
// Usage: node scripts/war/art/build.mjs [raw dir]   (default: shots/war/pixellab/art4/raw of the main checkout)
//
// Tiles: each raw set is a create_tiles_pro iso Wang set, 16 tiles of 64x48 (top diamond 64x32 + 16 px side),
// tile_i = corner mask i = NW<<3|NE<<2|SW<<1|SE, a set bit = the pair's first terrain. Every pair has grass first
// (or shallow water for the water/deep pair). To make grass identical across sets, each top pixel is classed as
// "first" or "second" terrain and grass pixels are replaced by the reference grass tile; the side band is replaced
// by the set's side source; the 1 px dark rim is repainted; all tiles snap to one shared palette.
// Out: public/war/tiles/<pair>.png (16 frames in a row, frame = mask) + tiles.json + cliff side strips.
// Objects: trimmed PNG per object with a foot anchor -> public/war/objects/<id>.png + objects.json.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette, rgbToHex } from '../../art/lib/ops.mjs';
import { SETS, CLIFFS, OBJECTS, PX_PER_M, TILE_M } from './assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = process.argv[2] ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/art4/raw';
const OUT_T = join(ROOT, 'public/war/tiles'), OUT_O = join(ROOT, 'public/war/objects');
const TW = 64, TH = 48, HW = 32, HH = 16, SIDE = 16;
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const inTop = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH <= 1;
const rimE = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH;
const px = (im, x, y) => (y * im.w + x) * 4;
const dist2 = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
const loadSet = (dir) => [...Array(16)].map((_, i) => readImage(join(RAW, 'tiles', dir, `tile_${i}.png`)));

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
function classify(im, mask, A, B) {
  const cls = new Uint8Array(TW * TH), near = (c, S) => Math.min(...S.map((s) => dist2(c, s)));
  const corner = [[HW, 0, 8], [TW, HH, 4], [0, HH, 2], [HW, 2 * HH, 1]]; // NW top, NE right, SW left, SE bottom
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y)) continue; const i = px(im, x, y); const c = [im.data[i], im.data[i + 1], im.data[i + 2]];
    // bilinear weight of first-terrain corners in diamond coords
    const u = (x + 0.5) / TW + (y + 0.5) / (2 * HH) - 0.5, v = (y + 0.5) / (2 * HH) - (x + 0.5) / TW + 0.5; // u: NW->NE, v: NW->SW
    const w = (1 - u) * (1 - v) * !!(mask & 8) + u * (1 - v) * !!(mask & 4) + (1 - u) * v * !!(mask & 2) + u * v * !!(mask & 1);
    if (mask === 15) { cls[y * TW + x] = 1; continue; }
    if (mask === 0 || w < 0.12) continue;
    if (w > 0.88) { cls[y * TW + x] = 1; continue; }
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
  return cls;
}

function buildSet(set, ref) {
  const raw = loadSet(set.dir).map((t) => (check(t.w === TW && t.h === TH, `${set.pair}: tile ${t.w}x${t.h}`), t));
  const side = set.side === 'own' ? raw[0] : ref.sides[set.side ?? 'earth'];
  const A = samples(raw[15]), B = samples(raw[0]);
  const fill = set.unifyFrom ? deline(loadSet(set.unifyFrom.dir)[set.unifyFrom.frame]) : ref.grass;
  const out = raw.map((t, mask) => {
    const im = { w: TW, h: TH, data: new Uint8Array(t.data) };
    const cls = set.unify ? classify(t, mask, A, B) : null;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const i = px(im, x, y);
      if (inTop(x, y)) {
        if (cls && cls[y * TW + x]) im.data.set(fill.data.subarray(i, i + 4), i);
        else if (set.tone) for (let c = 0; c < 3; c++) im.data[i + c] = Math.round(im.data[i + c] * set.tone);
      } else if (side) im.data.set(side.data.subarray(i, i + 4), i);
    }
    return deline(im);
  });
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
const refSet = loadSet(SETS[0].dir).map((t) => ({ w: t.w, h: t.h, data: new Uint8Array(t.data) }));
const ref = { grass: deline(refSet[15]), sides: {} };
const built = [];
for (const set of SETS) {
  if (!existsSync(join(RAW, 'tiles', set.dir))) { errors.push(`missing raw set ${set.dir}`); continue; }
  if (set.sideName) ref.sides[set.sideName] = loadSet(set.dir)[set.sideFrom];
  built.push([set, buildSet(set, ref)]);
}
const palette = medianCut(built.flatMap(([, t]) => t), 128);
const tilesJson = { tile: { w: TW, h: TH, topH: 2 * HH, levelPx: SIDE, metres: TILE_M }, mask: 'NW<<3|NE<<2|SW<<1|SE, set bit = first terrain; frame index = mask; NW is the top vertex', anchor: { x: HW, y: 0, note: 'top vertex of the top diamond' }, palette, sheets: [] };
for (const [set, tiles] of built) {
  const snapped = tiles.map((t) => snapToPalette(t, palette));
  writeImage(join(OUT_T, `${set.pair}.png`), sheet(snapped));
  tilesJson.sheets.push({ pair: set.pair, first: set.first, second: set.second, file: `${set.pair}.png`, frames: 16, frame: { w: TW, h: TH }, maskToFrame: [...Array(16).keys()], source: set.source });
}
// Cliff side strips: the 16 px side band of a full tile (left + right faces), one per material; stack per level.
for (const c of CLIFFS) {
  const src = ref.sides[c.from]; if (!src) { errors.push(`cliff ${c.id}: no side ${c.from}`); continue; }
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
    if (y >= (b.cut ?? 1e9) || x < (b.x0 ?? 0) || x > (b.x1 ?? 1e9) || !KEEP[b.keep](d[i], d[i + 1], d[i + 2])) d[i + 3] = 0;
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
const objJson = { pxPerMetre: PX_PER_M, tileMetres: TILE_M, note: 'anchor = foot point in the PNG (px); draw at the ground point minus anchor; no ground patch', objects: [] };
const objImages = [];
for (const o of OBJECTS) {
  const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) { errors.push(`missing object raw ${o.raw}`); continue; }
  let im = grade(dropBase(keyBorder(readImage(f), o.keyTol, o.keyAll), o.base), o.grade);
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0;
  const b = alphaBox(im, 1); im = crop(im, b);
  const foot = { x: o.foot?.x != null ? o.foot.x - b.x : Math.round(b.w / 2), y: o.foot?.y != null ? Math.min(o.foot.y - b.y, b.h - 1) : b.h - 1 };
  check(foot.x >= 0 && foot.x < b.w, `${o.id}: foot x ${foot.x} outside ${b.w}`);
  objImages.push([o, im, foot]);
}
const objPalette = medianCut(objImages.map(([, im]) => im), 128);
for (const [o, im, foot] of objImages) {
  const s = snapToPalette(im, [...palette, ...objPalette]);
  writeImage(join(OUT_O, `${o.id}.png`), s);
  const metres = +(im.h / PX_PER_M).toFixed(1);
  check(!o.metres || Math.abs(metres - o.metres) / o.metres < 0.35, `${o.id}: ${metres} m, want ~${o.metres} m`);
  objJson.objects.push({ id: o.id, kind: o.kind, file: `${o.id}.png`, w: im.w, h: im.h, metres, anchor: foot, footprint: o.footprint, blocksMovement: o.blocks, source: o.source });
}
writeFileSync(join(OUT_O, 'objects.json'), JSON.stringify(objJson, null, 1) + '\n');

console.log(`tiles: ${built.length} sets, palette ${palette.length}; objects: ${objImages.length}`);
if (errors.length) { console.error('FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('OK');
