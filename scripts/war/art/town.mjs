// Town dressing art (docs/playbook/PROMPTS_ART.md "Town dressing"): decorative map objects for market towns, agoras and
// villages, in the elaia library as `town-*` (regions place them as `elaia/town-*`; scripts/war/regions/kit.ts TOWN).
// Three sources: PixelLab map objects (houses, cottage, temple, stoa, statue, well, jetty; town-jobs.json), copies of
// the build-mode and trade sprites (stalls, warehouse, workshop, presses, gates, towers, the price board), and the court
// wall cut from the stone-wall kit (one tile, both layers, the face shortened to a 3 m court wall).
// Every sprite's anchor is the south vertex of its footprint (a region object stands at that ground point), so the
// view's foot sort draws it after the tiles it covers; its colours join the elaia object palette.
//
// Damaged and ruined states (ART-L, W-47 "Pre-built structures": a razed piece becomes a ruin in place): pixflux img2img
// over the intact raw (`--inits` writes the inits: holes and soot in the top third / the upper half thrown down to a
// jagged stump with soot), raws at raw/<id>-<state>.png; the stone tower, gates and walls copy the renderer's ruined
// kits (buildings.mjs). Sprites town-<id>-damaged / town-<id>-ruined (state, building, rubble on ruins).
//
// Usage: node scripts/war/art/town.mjs [--fetch] [--inits] [pixellab dir]   (ends with the elaia QA gate)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { alphaBox, blank, crop, paste, resizeArea, resizeNearest, snapToPalette, rgbToHex } from '../../art/lib/ops.mjs';
import { runQa } from './qa.mjs';
import { scorch, soot, hash } from './buildings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const PIX = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheet') ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const RAW = join(PIX, 'town/raw'), OUT = join(ROOT, 'public/war/biomes/elaia');
const J = JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/town-jobs.json'), 'utf8'));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

if (args.includes('--fetch')) {
  mkdirSync(RAW, { recursive: true });
  for (const [n, id] of Object.entries(J.objects)) {
    const f = join(RAW, `${n}.png`);
    if (existsSync(f)) continue;
    const r = await fetch(`https://api.pixellab.ai/mcp/map-objects/${id}/download`);
    if (!r.ok) throw new Error(`${r.status} ${n}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log('->', f);
  }
  for (const [n, id] of Object.entries(J.states ?? {})) { // ART-L state raws (pixflux images)
    const f = join(RAW, `${n}.png`);
    if (existsSync(f)) continue;
    const r = await fetch(`https://api.pixellab.ai/mcp/images/${id}/download`);
    if (!r.ok) { console.log(`skip ${n}: ${r.status}`); continue; }
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log('->', f);
  }
}

// ---- PixelLab raws: key the background, drop the grass PixelLab drew, grade darker, scale to the footprint width
const isGreen = (r, g, b) => (g > r + 4 && g >= b - 4) || (g >= r - 6 && g > b + 6 && r < 140);
function keyBorder(im, tol, at) {
  const { w, h, data: d } = im; if (d[at * 4 + 3] < 255) return im;
  const ref = [d[at * 4], d[at * 4 + 1], d[at * 4 + 2]], seen = new Uint8Array(w * h), st = [];
  const ok = (i) => Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) <= tol;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (seen[i] || !ok(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
// flood from the transparent outside into ground-coloured pixels (the grass slab round the object)
function floodGround(im, pred) {
  const { w, h, data: d } = im, seen = new Uint8Array(w * h), st = [];
  for (let i = 0; i < w * h; i++) {
    if (!d[i * 4 + 3] || !pred(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) continue;
    const x = i % w, y = (i / w) | 0;
    if ([x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1].some((j) => j < 0 || !d[j * 4 + 3])) st.push(i);
  }
  while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!d[i * 4 + 3] || !pred(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) continue; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
function dropSpecks(im, frac) {
  const { w, h, data: d } = im, lab = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s = 0; s < w * h; s++) { if (lab[s] >= 0 || !d[s * 4 + 3]) continue; const id = sizes.length, st = [s]; let n = 0; lab[s] = id; while (st.length) { const i = st.pop(); n++; const x = i % w, y = (i / w) | 0; for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && d[j * 4 + 3]) { lab[j] = id; st.push(j); } } sizes.push(n); }
  const tot = sizes.reduce((a, b) => a + b, 0); for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] < tot * frac) d[i * 4 + 3] = 0;
  return im;
}
const hard = (im) => { for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0; return im; };
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function grade(im, { sat, val }) {
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; for (let k = 0; k < 3; k++) d[i + k] = clamp((l + (d[i + k] - l) * sat) * val); }
  return im;
}
const box = (im) => crop(im, alphaBox(im, 1));
/** The foot: the centre of the bottom rows, nudged to the footprint's south vertex ((fw - fh) x 16 px right of the width's centre). */
function footOf(im, [fw, fh]) {
  const rows = Math.max(3, Math.round(im.h * 0.03)); let x0 = im.w, x1 = -1;
  for (let y = im.h - rows; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const want = Math.round(im.w / 2 + (fw - fh) * 16 * (im.w / ((fw + fh) * 32)));
  return { x: Math.max(x0, Math.min(x1, want)), y: im.h - 1 };
}
// keyed, ground dropped, cropped raw (also the frame the state inits are drawn in)
function keyed(o, file = `${o.raw}.png`) {
  let im = readImage(join(RAW, file));
  im = keyBorder(keyBorder(im, 34, 0), 34, (im.h - 1) * im.w);
  if (o.ground) im = floodGround(im, isGreen);
  return dropSpecks(hard(im), 0.004);
}
// graded and scaled to the footprint width; off: the last crop's offset in the scaled frame
function scaled(o, im, s) {
  grade(im, o.grade ?? { sat: 0.62, val: 0.78 });
  if (Math.abs(s - 1) > 0.01) im = hard((s > 1 ? resizeNearest : resizeArea)(im, Math.round(im.w * s), Math.round(im.h * s)));
  dropSpecks(im, 0.004); const b = alphaBox(im, 1);
  return { im: crop(im, b), off: { x: b.x, y: b.y } };
}
function prepRaw(o) {
  const frame = box(keyed(o)), s = ((o.fp[0] + o.fp[1]) * 32 * (o.fill ?? 1)) / frame.w;
  return { ...scaled(o, { w: frame.w, h: frame.h, data: new Uint8Array(frame.data) }, s), s, frame };
}

// ---- damaged and ruined states (ART-L, W-47 "a razed piece becomes a ruin in place"). Inits for pixflux img2img (sides a
// multiple of 4, the intact frame at the bottom right): damaged = holes knocked in the top third + charring; ruined =
// everything above a jagged line at ~half the height gone, soot and charring. A state raw is cut back to the intact
// frame, graded and scaled like the intact sprite, and keeps its anchor.
const STATES = ['damaged', 'ruined'];
const padOf = (im) => ({ w: Math.ceil(im.w / 4) * 4, h: Math.ceil(im.h / 4) * 4 });
function stateInit(im, state, k) {
  const out = { w: im.w, h: im.h, data: new Uint8Array(im.data) }, d = out.data, top = alphaBox(im, 1).y, Hs = im.h - top;
  if (state === 'damaged') {
    for (let i = 0; i < 5; i++) { const cx = im.w * (0.15 + 0.7 * hash(i, k, 1)), cy = top + Hs * (0.05 + 0.3 * hash(i, k, 2)), r = im.w * (0.04 + 0.07 * hash(i, k, 3)); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (Math.hypot(x - cx, (y - cy) * 1.4) < r) d[(y * im.w + x) * 4 + 3] = 0; }
    scorch(out, k, 1.1);
  } else {
    const cut = (x) => top + Hs * (0.5 + 0.12 * (hash(Math.floor(x / 7), k, 4) - 0.5) + 0.08 * Math.sin(x * 0.09 + k));
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y < cut(x)) d[(y * im.w + x) * 4 + 3] = 0;
    soot(out, k); scorch(out, k + 3, 1.3);
  }
  return dropSpecks(out, 0.003);
}
function prepState(o, intact, state) {
  if (!existsSync(join(RAW, `${o.raw}-${state}.png`))) return null;
  const F = intact.frame, P = padOf(F), im0 = keyed(o, `${o.raw}-${state}.png`);
  const im = crop(im0, { x: im0.w - F.w, y: im0.h - F.h, w: F.w, h: F.h });
  const r = scaled(o, dropSpecks(im, 0.01), intact.s); // a ruin breaks into pieces: drop the loose specks pixflux strews
  return { im: r.im, shift: { x: r.off.x - intact.off.x, y: r.off.y - intact.off.y }, P };
}

// ---- the court wall: a run of 2 stone-wall kit tiles (back + front layer of each), the face cut to 3 m
const KIT = read('public/war/buildings/objects.json').kits.find((k) => k.id === 'stone-wall');
const CUT0 = 110, CUT_DONE = 99; // frame rows under the walk's diamond (walkwayPx 165 above the tile vertex at y 232) taken out
function wallRun(mask, [fw, fh], state = 'done') { // damaged / ruined (ART-L): the kit's frames as they are (already low)
  const B = 'public/war/buildings/', f = KIT.frameOf[mask], { w: FWp, h: FHp } = KIT.frame, O = KIT.tileOrigin;
  const r = { x: (f % KIT.columns) * FWp, y: Math.floor(f / KIT.columns) * FHp, w: FWp, h: FHp };
  const im = crop(readImage(join(ROOT, B, KIT.states[state])), r);
  paste(im, crop(readImage(join(ROOT, B, KIT.front[state])), r), 0, 0);
  const CUT = state === 'done' ? CUT_DONE : 0, tile = blank(FWp, FHp - CUT);
  if (CUT) { paste(tile, crop(im, { x: 0, y: 0, w: FWp, h: CUT0 }), 0, CUT); paste(tile, crop(im, { x: 0, y: CUT0 + CUT, w: FWp, h: FHp - CUT0 - CUT }), 0, CUT0); } else paste(tile, im, 0, 0);
  // tiles back to front; tile (i, j)'s top vertex at ((i - j) x 32, (i + j) x 16) from the run's north tile
  const ox = 32 * (fh - 1), out = blank(FWp + 32 * (fw + fh - 2), FHp - CUT + 16 * (fw + fh - 2));
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) paste(out, tile, ox + 32 * (i - j), 16 * (i + j));
  if (!CUT) { // a ruin's talus spills past the footprint: clip it at the footprint's two near edges (the anchor stays the south vertex)
    const Sx = ox + O.x + 32 * (fw - fh), Sy = O.y + 16 * (fw + fh);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) if (y > Sy - Math.abs(x - Sx) / 2) out.data[(y * out.w + x) * 4 + 3] = 0;
  }
  const b = alphaBox(out, 1), t = crop(out, b);
  // the run's south vertex: the north tile's vertex + ((fw - fh) x 32, (fw + fh) x 16)
  return { im: t, anchor: { x: ox + O.x + 32 * (fw - fh) - b.x, y: O.y - CUT + 16 * (fw + fh) - b.y } };
}

// ---- copies of build-mode and trade sprites (their anchor is already the footprint's south vertex)
function copy(lib, id) {
  const J2 = read(`public/war/${lib}/objects.json`), d = J2.objects.find((o) => o.id === id);
  return { im: readImage(join(ROOT, `public/war/${lib}`, d.file)), anchor: d.anchor };
}

// id (town-<id>), footprint, kind, source
const TOWN = [
  { id: 'house-a', fp: [3, 3], raw: 'house-a', fill: 0.9 },
  { id: 'house-b', fp: [3, 3], raw: 'house-b', ground: true, fill: 0.95 },
  { id: 'cottage', fp: [3, 2], raw: 'cottage', fill: 0.9 },
  { id: 'temple', fp: [4, 4], raw: 'temple', ground: true },
  { id: 'stoa', fp: [2, 6], raw: 'stoa', ground: true },
  { id: 'statue', fp: [1, 1], raw: 'statue', fill: 0.75 },
  { id: 'well', fp: [1, 1], raw: 'well', fill: 0.85 },
  { id: 'jetty', fp: [1, 4], raw: 'jetty', kind: 'prop' },
  { id: 'stall-a', fp: [2, 2], from: ['buildings', 'market-stall-done'] },
  { id: 'stall-b', fp: [2, 2], from: ['buildings', 'market-stall2-done'] },
  { id: 'stall-c', fp: [2, 2], from: ['buildings', 'market-stall3-done'] },
  { id: 'warehouse', fp: [3, 2], from: ['buildings', 'warehouse-done'] },
  { id: 'workshop', fp: [4, 3], from: ['buildings', 'workshop-done'] },
  { id: 'storehouse', fp: [3, 3], from: ['buildings', 'storehouse-done'] },
  { id: 'forge', fp: [3, 3], from: ['buildings', 'forge-done'] },
  { id: 'cookhouse', fp: [3, 2], from: ['buildings', 'cookhouse-done'] },
  { id: 'olive-press', fp: [3, 3], from: ['buildings', 'olive-press-done'], states: { damaged: ['buildings', 'olive-press-damaged'], ruined: 'pix' } },
  { id: 'farm', fp: [4, 4], from: ['buildings', 'farm-done'] },
  { id: 'tower', fp: [2, 2], from: ['buildings', 'stone-tower-done'], states: { damaged: ['buildings', 'stone-tower-damaged'], ruined: ['buildings', 'stone-tower-ruined'] } },
  { id: 'gate-x', fp: [2, 1], from: ['buildings', 'stone-gate-x-open'], states: { damaged: ['buildings', 'stone-gate-x-damaged'], ruined: ['buildings', 'stone-gate-x-ruined'] } },
  { id: 'gate-y', fp: [1, 2], from: ['buildings', 'stone-gate-y-open'], states: { damaged: ['buildings', 'stone-gate-y-damaged'], ruined: ['buildings', 'stone-gate-y-ruined'] } },
  { id: 'board', fp: [1, 1], from: ['trade', 'price-board-done'] },
  { id: 'goods', fp: [1, 1], from: ['trade', 'pile-goods-m'] },
  { id: 'wall-x', fp: [2, 1], wall: 5 },
  { id: 'wall-y', fp: [1, 2], wall: 10 },
];

const ET = read('public/war/biomes/elaia/tiles.json'), EO = read('public/war/biomes/elaia/objects.json');
const SNAP = [...new Set([...ET.palette, ...EO.palette, ...read('public/war/buildings/objects.json').palette, ...read('public/war/tiles/tiles.json').palette, ...read('public/war/objects/objects.json').palette])];
if (args.includes('--inits')) { // the pixflux inits of the damaged and ruined states
  const dir = join(PIX, 'town/inits'); mkdirSync(dir, { recursive: true });
  const put = (name, t) => { const P = padOf(t), pad = blank(P.w, P.h); paste(pad, t, P.w - t.w, P.h - t.h); writeImage(join(dir, `${name}.png`), pad); };
  for (const o of TOWN) {
    if (o.raw) { const fr = prepRaw(o).frame; for (const st of STATES) put(`${o.raw}-${st}`, stateInit(fr, st, o.id.length + st.length)); }
    for (const [st, src] of Object.entries(o.states ?? {})) if (src === 'pix') put(`${o.id}-${st}`, stateInit(copy(...o.from).im, st, o.id.length + st.length));
  }
  console.log('state inits ->', dir); process.exit(0);
}
const defs = [], used = new Set();
const clampA = (im, a) => ({ x: Math.max(0, Math.min(im.w - 1, a.x)), y: Math.max(Math.ceil(im.h * 0.85), Math.min(im.h - 1, a.y)) });
function emit(o, im, anchor, state, source) {
  anchor = clampA(im, anchor);
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) used.add(rgbToHex([im.data[i], im.data[i + 1], im.data[i + 2]]));
  const id = state ? `town-${o.id}-${state}` : `town-${o.id}`, file = `${id}.png`;
  writeImage(join(OUT, file), im);
  defs.push({
    id, kind: o.kind ?? 'building', file, w: im.w, h: im.h, metres: Math.round((im.h / 33) * 100) / 100, anchor, footprint: o.fp,
    blocksMovement: false, town: true, ...(state && { building: `town-${o.id}`, state, ...(state === 'ruined' && { rubble: true }) }), source,
  });
}
for (const o of TOWN) {
  let im, anchor, intact;
  if (o.raw) { intact = prepRaw(o); im = snapToPalette(intact.im, SNAP); anchor = footOf(im, o.fp); }
  else if (o.wall) ({ im, anchor } = wallRun(o.wall, o.fp));
  else ({ im, anchor } = copy(...o.from));
  // the trade sprites carry their own palette: snap them too (a no-op for the buildings' sprites)
  if (o.from?.[0] === 'trade') im = snapToPalette(im, SNAP);
  const a0 = clampA(im, anchor);
  emit(o, im, anchor, null, o.raw ? `map_object ${J.objects[o.raw].slice(0, 8)}` : o.wall ? `stone-wall kit frames (mask ${o.wall}), 2 tiles, face cut to 3 m` : `copy of ${o.from.join('/')}`);
  // damaged and ruined (ART-L): pixflux over the intact raw, or copies of the renderer's states
  if (o.raw) for (const st of STATES) {
    const r = prepState(o, intact, st); if (!r) continue;
    emit(o, snapToPalette(r.im, SNAP), { x: a0.x - r.shift.x, y: a0.y - r.shift.y }, st, `pixflux ${J.states?.[`${o.raw}-${st}`]?.slice(0, 8) ?? '?'} img2img over the intact raw`);
  }
  if (o.wall) for (const st of STATES) { const r = wallRun(o.wall, o.fp, st); emit(o, r.im, r.anchor, st, `stone-wall kit ${st} frames (mask ${o.wall}), 2 tiles`); }
  for (const [st, src] of Object.entries(o.states ?? {})) {
    if (src !== 'pix') { const c = copy(...src); emit(o, c.im, c.anchor, st, `copy of ${src.join('/')}`); continue; }
    const f = join(RAW, `${o.id}-${st}.png`); if (!existsSync(f)) continue;
    const c = copy(...o.from), raw = keyBorder(keyBorder(readImage(f), 34, 0), 34, (readImage(f).h - 1) * readImage(f).w);
    const fr = dropSpecks(hard(crop(raw, { x: raw.w - c.im.w, y: raw.h - c.im.h, w: c.im.w, h: c.im.h })), 0.004), b = alphaBox(fr, 1);
    emit(o, snapToPalette(grade(crop(fr, b), { sat: 0.85, val: 0.95 }), SNAP), { x: c.anchor.x - b.x, y: c.anchor.y - b.y }, st, `pixflux ${J.states?.[`${o.id}-${st}`]?.slice(0, 8) ?? '?'} img2img over ${o.from.join('/')}`);
  }
}
// the elaia library: its own objects first, then the town set; town colours the palette lacks are appended
const own = new Set([...ET.palette, ...EO.palette]);
const add = [...used].filter((c) => !own.has(c));
EO.objects = [...EO.objects.filter((d) => !d.id.startsWith('town-')), ...defs];
EO.palette = [...EO.palette, ...add];
if (EO.borderMax === undefined) EO.borderMax = 0.75; // boxy buildings and wall tiles fill more of their border than trees
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(EO, null, 1) + '\n');
console.log(`town: ${defs.length} sprites, palette +${add.length}`);

// contact sheet for a look (not committed)
if (args.includes('--sheet')) {
  const ims = defs.map((d) => readImage(join(OUT, d.file)));
  const W = ims.reduce((a, b) => a + b.w + 6, 0), H = Math.max(...ims.map((i) => i.h));
  const sheet = blank(W, H); for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([74, 80, 62, 255], i);
  let x = 0; for (const im of ims) { paste(sheet, im, x, H - im.h); x += im.w + 6; }
  writeImage(args[args.indexOf('--sheet') + 1], sheet);
}
process.exit(runQa('elaia').length ? 1 : 0);
