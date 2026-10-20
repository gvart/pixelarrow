// Landmark architecture by PixelLab (PROMPTS_ART.md 40f): the dwellings, halls, temples, towers and gates of the big
// landmarks as PixelLab map objects in place of the box renderer's pieces (landmarks.mjs keeps the wall segments, the
// labyrinth kit and every piece not listed here). Same ids, footprints, kinds and hp as before.
//   intact   = the map object, keyed, ground dropped, graded dark (sat 0.62, val 0.78), scaled to the footprint width
//   damaged  = pixflux img2img over the --inits image (holes knocked in the top third, charring), cut back to the frame
//   ruined   = pixflux img2img over the --inits image (everything above a jagged line at ~half height gone): a roofless
//              shell of broken walls round its rooms, rubble and soot
//   restored = the intact raw graded fresher, a dark-red banner on a pole on its highest point (code, no generation)
// The sprite's foot is its bottom row; tileOrigin puts the footprint diamond's south vertex there, centred under it.
// -y gates and barbicans are the -x sprite mirrored (the iso view is symmetric about the screen's vertical).
//
// Usage: node scripts/war/art/landmarks-pl.mjs --fetch | --inits   (then node scripts/war/art/landmarks.mjs builds all)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { alphaBox, blank, crop, paste, resizeArea, resizeNearest } from '../../art/lib/ops.mjs';
import { scorch, soot } from './buildings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/landmarks-pl';
const RAW = join(PIX, 'raw'), INITS = join(PIX, 'inits');
const J = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/landmarks-pl-jobs.json'), 'utf8'));

/**
 * The PixelLab pieces: fill = share of the footprint diamond's width the sprite spans; flip = mirror the raw (its long
 * side to the footprint's long axis); ground = flood the raw's ground slab out (green / sand / grey); mirror = the
 * sprite of another piece mirrored; grade = the intact grade; bannerAt = banner foot as a share of the width (0..1).
 */
export const PL = {
  // the Dead City: tan mudbrick, flat roofs (the plot's sand slab kept as its yard)
  'ammon-house-a': { fill: 0.94 },
  'ammon-house-b': { key: 20 },
  'ammon-house-c': { key: 20 },
  'ammon-house-d': { fill: 0.92 },
  'ammon-tenement': { key: 20, ground: ['green'] },
  'ammon-workshop': { key: 20 },
  'ammon-palace': { key: 20, flatRuin: true, fill: 0.97 },
  'ammon-tomb': { fill: 0.9 },
  'ammon-tower': { ground: ['green'], fill: 0.95 },
  // the raw's towers stand along the screen's lower-left to upper-right diagonal: a gate in a wall along y
  'ammon-gate-y': { raw: 'ammon-gate-x', key: 20, flatRuin: true },
  'ammon-gate-x': { mirror: 'ammon-gate-y' },
  // the city set: limewash, ashlar, dark terracotta roofs
  'arch-house-a': { fill: 0.92 },
  'arch-house-b': { key: 20, ground: ['green'] },
  'arch-house-c': { key: 20 },
  'arch-garden': { key: 20, fill: 0.95 },
  'arch-tenement': { key: 20, ground: ['green'] },
  'arch-workshop': { key: 20, ground: ['green'] },
  'arch-treasury': { key: 20, ground: ['green'] },
  'arch-chapel': { key: 20, ground: ['green'] },
  'arch-cistern': { key: 20, ground: ['green'] },
  'arch-barracks': { key: 20, ground: ['green'], greenAll: true, fill: 0.97 },
  'arch-stables': { key: 20, ground: ['green'], greenAll: true, flip: true, fill: 0.97 },
  'arch-forge': { key: 20, ground: ['green'] },
  'arch-tomb-a': { key: 20, ground: ['green'], fill: 0.8 },
  'arch-tomb-b': { key: 20, ground: ['green'], fill: 0.9 },
  'arch-tower': { key: 20, ground: ['green'], fill: 0.95 },
  'arch-barbican-x': { key: 20, fill: 0.97 },
  'arch-barbican-y': { mirror: 'arch-barbican-x' },
  // Drakon's Citadel: cold cyclopean grey
  'citadel-keep': { key: 20, flatRuin: true, fill: 0.97, grade: { sat: 0.6, val: 0.8 } },
  'citadel-tower': { key: 20, flatRuin: true, fill: 0.95, grade: { sat: 0.6, val: 0.8 } },
};
/** Pieces only PixelLab draws (no box model): their landmarks.json fields. */
export const NEW = [
  { id: 'ammon-house-d', landmark: 'ammon', kind: 'house', fp: [2, 2], material: 'stone', hp: 600, heightM: 4, note: 'a one-room mudbrick hut: a flat palm-beam roof behind a lip, one door' },
  { id: 'arch-house-c', landmark: 'arch', kind: 'house', fp: [5, 5], material: 'stone', hp: 1500, heightM: 7, note: 'a peristyle townhouse (villa): tiled wings round a colonnaded court with a garden' },
  { id: 'arch-garden', landmark: 'arch', kind: 'well', fp: [3, 3], material: 'stone', hp: 400, heightM: 4, note: 'a walled garden plot: cypress and fig trees, beds, a well-head (a well)' },
];

// ---- keying (as town.mjs)
const hard = (im) => { for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0; return im; };
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 10007) / 10007;
function keyBorder(im, tol, at) {
  const { w, h, data: d } = im; if (d[at * 4 + 3] < 255) return im;
  const ref = [d[at * 4], d[at * 4 + 1], d[at * 4 + 2]], seen = new Uint8Array(w * h), st = [];
  const ok = (i) => Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) <= tol;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (seen[i] || !ok(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
const GROUND = {
  green: (r, g, b) => (g > r + 4 && g >= b - 4) || (g >= r - 6 && g > b + 6 && r < 140),
  sand: (r, g, b) => r > 150 && g > 120 && b < 140 && r - b > 40,
};
function floodGround(im, pred, y0 = 0) {
  const { w, h, data: d } = im, seen = new Uint8Array(w * h), st = [];
  const ok = (i) => d[i * 4 + 3] && ((i / w) | 0) >= y0 && pred(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  for (let i = 0; i < w * h; i++) {
    if (!ok(i)) continue;
    const x = i % w, y = (i / w) | 0;
    if ([x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1].some((j) => j < 0 || !d[j * 4 + 3])) st.push(i);
  }
  while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!ok(i)) continue; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
function dropSpecks(im, frac) {
  const { w, h, data: d } = im, lab = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s = 0; s < w * h; s++) { if (lab[s] >= 0 || !d[s * 4 + 3]) continue; const id = sizes.length, st = [s]; let n = 0; lab[s] = id; while (st.length) { const i = st.pop(); n++; const x = i % w, y = (i / w) | 0; for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && d[j * 4 + 3]) { lab[j] = id; st.push(j); } } sizes.push(n); }
  const tot = sizes.reduce((a, b) => a + b, 0); for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] < tot * frac) d[i * 4 + 3] = 0;
  return im;
}
function grade(im, { sat, val }) {
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; for (let k = 0; k < 3; k++) d[i + k] = clamp((l + (d[i + k] - l) * sat) * val); }
  return im;
}
function flipX(im) {
  const o = blank(im.w, im.h);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + im.w - 1 - x) * 4);
  return o;
}
const copyIm = (im) => ({ w: im.w, h: im.h, data: new Uint8Array(im.data) });

/** Every grass pixel of the lower part, not only those a flood reaches past the slab's outline. */
function dropGreen(im) {
  const y0 = Math.round(im.h * 0.4);
  for (let i = y0 * im.w; i < im.w * im.h; i++) if (im.data[i * 4 + 3] && GROUND.green(im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2])) im.data[i * 4 + 3] = 0;
  return im;
}
function keyed(o, file) {
  let im = readImage(join(RAW, file));
  im = keyBorder(keyBorder(im, o.key ?? 34, 0), o.key ?? 34, (im.h - 1) * im.w);
  for (const g of o.ground ?? []) im = floodGround(im, GROUND[g], Math.round(im.h * (o.groundY0 ?? 0.5)));
  if (o.greenAll) dropGreen(im);
  im = dropSpecks(hard(im), 0.004);
  return o.flip ? flipX(im) : im;
}
/** The keyed intact raw, cropped (also the frame the state inits are drawn in). */
function frameOf(id) { const o = PL[id], im = keyed(o, `${o.raw ?? id}.png`), b = alphaBox(im, 1); return { im: crop(im, b), o }; }
const scaleOf = (o, fp, frame) => ((fp[0] + fp[1]) * 32 * (o.fill ?? 0.94)) / frame.w;
function scaled(im, s) {
  if (Math.abs(s - 1) > 0.01) im = hard((s > 1 ? resizeNearest : resizeArea)(im, Math.round(im.w * s), Math.round(im.h * s)));
  dropSpecks(im, 0.004);
  const b = alphaBox(im, 1);
  return { im: crop(im, b), off: { x: b.x, y: b.y } };
}
/**
 * Nothing in front of the footprint: pixels below its two near edges (a ground slab PixelLab drew wider than the plot,
 * a cast shadow) are cut, so the sprite's yard is the plot and a unit in the street before it is never under it.
 */
function clipFront(r, [fw, fh]) {
  const { im, tileOrigin: o } = r, sx = o.x + (fw - fh) * 32, sy = o.y + (fw + fh) * 16;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y > sy - Math.abs(x - sx) / 2 + 1) im.data[(y * im.w + x) * 4 + 3] = 0;
  const b = alphaBox(im, 1);
  return { ...r, im: crop(im, b), tileOrigin: { x: o.x - b.x, y: o.y - b.y } };
}
/** tileOrigin of a sprite whose foot (bottom row) is the south vertex, the footprint centred under the sprite at `cx`. */
const originOf = (im, [fw, fh], cx = im.w / 2) => ({ x: Math.round(cx - (fw - fh) * 16), y: im.h - 1 - (fw + fh) * 16 });

// ---- states
function banner(im, k) {
  // a pole with a dark-red pennant on the highest point (restored): the canvas grows 26 px at the top
  const T = 26, out = blank(im.w, im.h + T); paste(out, im, 0, T);
  let tx = -1, ty = im.h;
  for (let y = 0; y < im.h && tx < 0; y++) for (let x = Math.round(im.w * 0.25); x < im.w * 0.75; x++) if (im.data[(y * im.w + x) * 4 + 3]) { tx = x; ty = y; break; }
  if (tx < 0) return { im, grow: 0 };
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < out.w && y < out.h) out.data.set([...c, 255], (y * out.w + x) * 4); };
  for (let y = ty + T - 22; y <= ty + T + 1; y++) { set(tx, y, [52, 40, 30]); set(tx + 1, y, [40, 30, 24]); }
  set(tx, ty + T - 23, [150, 120, 60]); set(tx + 1, ty + T - 23, [120, 96, 50]);
  for (let x = 0; x < 11; x++) for (let y = 0; y < 7 - Math.floor(x / 3); y++) set(tx + 2 + x, ty + T - 21 + y + Math.round(Math.sin(x * 0.7 + k) * 0.8), y < 1 ? [120, 32, 30] : (x + y) % 3 ? [96, 24, 24] : [78, 18, 20]);
  return { im: out, grow: T };
}
function stateInit(im, state, k, flat = false) {
  const out = copyIm(im), d = out.data, top = alphaBox(im, 1).y, Hs = im.h - top;
  if (state === 'damaged') {
    for (let i = 0; i < 5; i++) { const cx = im.w * (0.15 + 0.7 * hash(i, k, 1)), cy = top + Hs * (0.05 + 0.3 * hash(i, k, 2)), r = im.w * (0.03 + 0.05 * hash(i, k, 3));
      // a ragged breach: the radius wobbles with the angle; its pixels charred (darkened, texture kept): a transparent hole
      // comes back flat grey, a flat dark disc stays a disc
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const q = (y * im.w + x) * 4, a = Math.atan2((y - cy) * 1.4, x - cx), rr = r * (0.55 + 0.6 * hash(Math.floor((a + 4) * 2.5), i, k + 5) + 0.25 * hash(x >> 2, y >> 2, k + 6));
        if (Math.hypot(x - cx, (y - cy) * 1.4) < rr && d[q + 3]) for (let c = 0; c < 3; c++) d[q + c] = clamp(d[q + c] * 0.4);
      }
    }
    scorch(out, k, 1.1);
  } else {
    const f = flat ? 0.3 : 1, cut = (x) => top + Hs * ((flat ? 0.58 : 0.5) + f * 0.12 * (hash(Math.floor(x / 7), k, 4) - 0.5) + f * 0.08 * Math.sin(x * 0.09 + k));
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y < cut(x)) d[(y * im.w + x) * 4 + 3] = 0;
    soot(out, k); scorch(out, k + 3, 1.3);
  }
  return dropSpecks(out, 0.003);
}
const padOf = (im) => ({ w: Math.ceil(im.w / 4) * 4, h: Math.ceil(im.h / 4) * 4 });

/**
 * The sprite of PixelLab piece `id` (footprint fp) in state `st`: { im, tileOrigin, source } or null (not a PixelLab
 * piece, or the state raw is missing: the box renderer draws it).
 */
export function plPiece(id, fp, st) { const r = plRaw(id, fp, st); return r && !PL[id].mirror ? clipFront(r, fp) : r; }
function plRaw(id, fp, st) {
  const o = PL[id]; if (!o) return null;
  if (o.mirror) {
    const r = plPiece(o.mirror, [fp[1], fp[0]], st); if (!r) return null;
    const im = flipX(r.im);
    return { im, tileOrigin: { x: im.w - r.tileOrigin.x, y: r.tileOrigin.y }, source: `${r.source}, mirrored (${o.mirror})` };
  }
  if (!existsSync(join(RAW, `${o.raw ?? id}.png`))) return null;
  const F = frameOf(id), s = scaleOf(o, fp, F.im), g = o.grade ?? { sat: 0.62, val: 0.78 };
  const intact = scaled(grade(copyIm(F.im), g), s), src = `map_object ${J.objects[o.raw ?? id].slice(0, 8)}`;
  if (st === 'intact') return { im: intact.im, tileOrigin: originOf(intact.im, fp), source: src };
  if (st === 'restored') {
    const r = scaled(grade(copyIm(F.im), { sat: g.sat * 1.15, val: g.val * 1.1 }), s), b = banner(r.im, id.length);
    const o0 = originOf(r.im, fp);
    return { im: b.im, tileOrigin: { x: o0.x, y: o0.y + b.grow }, source: `${src}, graded fresh + banner` };
  }
  const f = join(RAW, `${id}-${st}.png`); if (!existsSync(f)) return null;
  const P = padOf(F.im);
  let im0 = keyBorder(keyBorder(readImage(f), 34, 0), 34, (P.h - 1) * P.w); // the state raw has the init's padded size
  if (o.greenAll) dropGreen(im0);
  im0 = dropSpecks(hard(im0), 0.004);
  const cut = crop(im0, { x: im0.w - F.im.w, y: im0.h - F.im.h, w: F.im.w, h: F.im.h });
  const r = scaled(grade(dropSpecks(cut, 0.01), { sat: g.sat * 1.1, val: g.val * 1.12 }), s); // the soot-darkened state raws lifted back toward the intact's tone
  // keep the intact sprite's south vertex: the state's crop offset against the intact one's
  const cx = intact.im.w / 2 - (r.off.x - intact.off.x), io = originOf(intact.im, fp, intact.im.w / 2);
  return { im: r.im, tileOrigin: { x: Math.round(cx - (fp[0] - fp[1]) * 16), y: io.y - (r.off.y - intact.off.y) }, source: `pixflux ${J.states[`${id}-${st}`]?.slice(0, 8) ?? '?'} img2img over the intact raw` };
}

// ---- CLI
const args = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args.includes('--fetch')) {
    mkdirSync(RAW, { recursive: true });
    for (const [n, id] of Object.entries(J.objects)) {
      const f = join(RAW, `${n}.png`); if (existsSync(f) && !args.includes('--force')) continue;
      const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${id}/download`);
      if (!r.ok) { console.log(`skip ${n}: ${r.status}`); continue; }
      writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log('->', f);
    }
    for (const [n, id] of Object.entries(J.states)) {
      const f = join(RAW, `${n}.png`); if (existsSync(f) && !args.includes('--force')) continue;
      const r = await fetch(`https://api.pixellab.ai/mcp/images/${id}/download`);
      if (!r.ok) { console.log(`skip ${n}: ${r.status}`); continue; }
      writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log('->', f);
    }
  }
  if (args.includes('--inits')) {
    mkdirSync(INITS, { recursive: true });
    for (const id of Object.keys(PL)) {
      if (PL[id].mirror || !existsSync(join(RAW, `${PL[id].raw ?? id}.png`))) continue;
      const fr = frameOf(id).im, P = padOf(fr);
      for (const st of ['damaged', 'ruined']) { const pad = blank(P.w, P.h); paste(pad, stateInit(fr, st, id.length + st.length, !!PL[id].flatRuin), P.w - fr.w, P.h - fr.h); writeImage(join(INITS, `${id}-${st}.png`), pad); }
    }
    console.log('inits ->', INITS);
  }
}
