// Asset QA gate for the war region art (W-21). Checks public/war/tiles + public/war/objects and every biome folder
// public/war/biomes/<name>/ (against the global set); build.mjs runs it last.
// Usage: node scripts/war/art/qa.mjs   -> prints every failure, exits 1 if any.
//
// Tiles (per sheet): 16 frames, mask->frame complete, sizes, opaque top diamond, shared palette, no dark 1 px rim,
// seams (every edge whose two corners are one terrain equals that terrain's full tile, and the pixels across every
// legal neighbour pair of frames line up as well as the full tile does with itself), each terrain's full tile
// identical in every sheet (grass base identical across sets). Variants: same edge band as the base, new interior.
// Objects: metadata, PNG size, transparent background, binary alpha, trimmed bounds, shared palette,
// height_px ~ metres x 33 (+-10%), foot anchor near the bottom, no ground patch round the foot.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage } from '../../art/lib/png.mjs';
import { crop, hexToRgb } from '../../art/lib/ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const TW = 64, TH = 48, HW = 32, HH = 16;
const rimE = (x, y) => Math.abs(x + 0.5 - HW) / HW + Math.abs(y + 0.5 - HH) / HH;
const inTop = (x, y) => x >= 0 && y >= 0 && x < TW && y < 2 * HH && rimE(x, y) <= 1;
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
const dist = (d1, i, d2, j) => Math.abs(d1[i] - d2[j]) + Math.abs(d1[i + 1] - d2[j + 1]) + Math.abs(d1[i + 2] - d2[j + 2]);
const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const palSet = (hexes) => new Set(hexes.map((h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; }));

// Edge of the top diamond a pixel belongs to: 'tr' NW-NE, 'br' NE-SE, 'bl' SE-SW, 'tl' SW-NW; corners of each edge as mask bits.
const EDGE = { tr: [8, 4], br: [4, 1], bl: [1, 2], tl: [2, 8] };
const edgeOf = (x, y) => (y + 0.5 < HH ? (x + 0.5 < HW ? 'tl' : 'tr') : x + 0.5 < HW ? 'bl' : 'br');
// Pixels of the outer band of the top diamond (within ~2 px of an edge), grouped by edge; the 6 px next to each vertex are left
// out (they touch a third tile).
const BAND = (() => {
  const b = { tr: [], br: [], bl: [], tl: [] };
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y) || rimE(x, y) < 0.9) continue;
    const nearV = [[HW, 0], [TW, HH], [HW, 2 * HH], [0, HH]].some(([vx, vy]) => Math.abs(x + 0.5 - vx) < 6 && Math.abs(y + 0.5 - vy) < 4);
    if (!nearV) b[edgeOf(x, y)].push((y * TW + x) * 4);
  }
  return b;
})();
const cornerT = (mask, bit, first, second) => (mask & bit ? first : second);

function frames(img, n) { return [...Array(n)].map((_, i) => crop(img, { x: i * TW, y: 0, w: TW, h: TH })); }

// Mean colour step across the shared edge of two neighbour tiles. dir 'br': b is the (x+1, y) neighbour drawn at (+32, +16);
// dir 'bl': the (x, y+1) neighbour drawn at (-32, +16).
function seamStep(a, b, dir) {
  const ox = dir === 'br' ? HW : -HW, oy = HH; let s = 0, n = 0;
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) {
    if (!inTop(x, y) || edgeOf(x, y) !== dir) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0]]) {
      const X = x + dx, Y = y + dy; if (inTop(X, Y)) continue;
      const bx = X - ox, by = Y - oy; if (!inTop(bx, by)) continue;
      s += dist(a.data, (y * TW + x) * 4, b.data, (by * TW + bx) * 4); n++;
    }
  }
  return n ? s / n : 0;
}
// Mean colour step between neighbouring pixels inside a tile (the texture's own roughness).
function innerStep(t) {
  let s = 0, n = 0;
  for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW - 1; x++) if (inTop(x, y) && inTop(x + 1, y) && rimE(x, y) < 0.85) { s += dist(t.data, (y * TW + x) * 4, t.data, (y * TW + x + 1) * 4); n++; }
  return s / n;
}

// Dark outline: is the outermost pixel of each column of the top diamond (top and bottom edge) clearly darker (< 0.75x)
// than the 2 pixels inward, more often than the same test finds 4 px inside (the texture's own contrast)? Returns that
// excess share; > RIM_MAX = a dark 1 px rim (shows as a grid on the map). Raw PixelLab tiles score ~0.2-0.6, clean ones ~0.
export const RIM_MAX = 0.12;
export function rimCheck(t) {
  let dark = 0, base = 0, rn = 0;
  const darker = (x, y, dir) => lum(t.data, (y * TW + x) * 4) < 0.75 * ((lum(t.data, ((y + dir) * TW + x) * 4) + lum(t.data, ((y + 2 * dir) * TW + x) * 4)) / 2);
  for (let x = 2; x < TW - 2; x++) {
    let y0 = 0; while (y0 < 2 * HH && !t.data[(y0 * TW + x) * 4 + 3]) y0++; // top edges: first opaque px (the drawn rim may sit just outside the diamond)
    let y1 = 2 * HH - 1; while (y1 > y0 && !inTop(x, y1)) y1--; // bottom edges: last diamond px (the side band follows)
    if (y1 - y0 < 14) continue;
    for (const [y, dir] of [[y0, 1], [y1, -1]]) { dark += darker(x, y, dir); base += darker(x, y + 4 * dir, dir); rn++; }
  }
  return (dark - base) / rn;
}

// The full tile of every terrain in a set's sheets: terrain -> [{ sheet, im }].
function fullTiles(T, dir, full = new Map(), tag = '') {
  for (const s of T.sheets ?? []) {
    const f = join(dir, s.file); if (!existsSync(f)) continue;
    const img = readImage(f); if (img.w !== TW * 16 || img.h !== TH || (s.maskToFrame ?? []).length !== 16) continue;
    const fr = frames(img, 16);
    for (const [t, m] of [[s.first, 15], [s.second, 0]]) (full.get(t) ?? full.set(t, []).get(t)).push({ sheet: tag + s.pair, im: fr[s.maskToFrame[m]] });
  }
  return full;
}

// G = the global tiles.json when T is a biome set: its palette must start with the global palette, every full tile it shares
// with the global set must be identical to the global one (grass base), and variants of global terrains use the global base.
export function qaTiles(T, dir = join(ROOT, 'public/war/tiles'), G = null) {
  const fail = [], pal = palSet(T.palette ?? []);
  const full = G ? fullTiles(G, join(ROOT, 'public/war/tiles'), new Map(), 'global ') : new Map(); // terrain -> [{ sheet, im }]
  if (G && (G.palette ?? []).some((h, i) => T.palette?.[i] !== h)) fail.push('tiles.json: palette does not start with the global palette');
  const offPalette = (name, im) => {
    let n = 0; for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] && !pal.has(key(im.data, i))) n++;
    if (n) fail.push(`${name}: ${n} px outside the shared tile palette`);
  };
  if (!T.palette?.length) fail.push('tiles.json: no palette');
  const sets = [];
  for (const s of T.sheets ?? []) {
    const f = join(dir, s.file);
    if (!existsSync(f)) { fail.push(`${s.pair}: missing ${s.file}`); continue; }
    const img = readImage(f);
    if (img.w !== TW * 16 || img.h !== TH) { fail.push(`${s.pair}: sheet ${img.w}x${img.h}, want ${TW * 16}x${TH}`); continue; }
    if (s.frames !== 16 || s.frame?.w !== TW || s.frame?.h !== TH) fail.push(`${s.pair}: frames/frame size metadata wrong`);
    const m2f = s.maskToFrame ?? [];
    if (m2f.length !== 16 || new Set(m2f).size !== 16 || m2f.some((v) => v < 0 || v > 15)) { fail.push(`${s.pair}: maskToFrame must map all 16 masks`); continue; }
    if (!s.first || !s.second) fail.push(`${s.pair}: first/second terrain missing`);
    const fr = frames(img, 16), byMask = (m) => fr[m2f[m]];
    offPalette(s.pair, img);
    for (let m = 0; m < 16; m++) {
      const t = byMask(m);
      let holes = 0; for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y) && t.data[(y * TW + x) * 4 + 3] < 255) holes++;
      if (holes > 2) fail.push(`${s.pair} mask ${m}: ${holes} transparent px in the top diamond`);
      const r = rimCheck(t); if (r > RIM_MAX) fail.push(`${s.pair} mask ${m}: dark 1 px rim (${Math.round(100 * r)}% more edge px dark than inside)`);
    }
    (full.get(s.first) ?? full.set(s.first, []).get(s.first)).push({ sheet: s.pair, im: byMask(15) });
    (full.get(s.second) ?? full.set(s.second, []).get(s.second)).push({ sheet: s.pair, im: byMask(0) });
    sets.push({ s, byMask });
  }
  // One full tile per terrain, identical in every sheet that has it (grass base identical across sets).
  const base = new Map();
  for (const [terrain, list] of full) {
    base.set(terrain, list[0].im);
    for (const { sheet, im } of list.slice(1)) {
      let n = 0; for (let i = 0; i < im.data.length; i += 4) if (inTop((i / 4) % TW, Math.floor(i / 4 / TW)) && key(im.data, i) !== key(list[0].im.data, i)) n++;
      if (n) fail.push(`${sheet}: full ${terrain} tile differs from ${list[0].sheet}'s in ${n} px (base must be identical across sets)`);
    }
  }
  // Seams. (1) an edge whose corners are one terrain must equal that terrain's full tile along the edge band.
  for (const { s, byMask } of sets) for (let m = 0; m < 16; m++) {
    const t = byMask(m);
    for (const [e, [b1, b2]] of Object.entries(EDGE)) {
      const t1 = cornerT(m, b1, s.first, s.second), t2 = cornerT(m, b2, s.first, s.second);
      if (t1 !== t2 || !base.has(t1)) continue;
      const ref = base.get(t1), px = BAND[e]; let same = 0;
      for (const i of px) if (dist(t.data, i, ref.data, i) <= 24) same++;
      if (same / px.length < 0.9) fail.push(`${s.pair} mask ${m}: ${e} edge (${t1}) matches the full ${t1} tile in only ${Math.round((100 * same) / px.length)}% of edge px`);
    }
  }
  // (2) every legal neighbour pair inside a sheet: the colour step across the edge stays close to the full tile's own.
  for (const { s, byMask } of sets) {
    const lim = Math.max(seamStep(byMask(15), byMask(15), 'br'), seamStep(byMask(0), byMask(0), 'br'), innerStep(byMask(15)), innerStep(byMask(0))) * 1.8 + 12;
    let worst = { v: 0 };
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      // 'br': a's NE,SE = b's NW,SW ; 'bl': a's SW,SE = b's NW,NE
      if (!!(a & 4) === !!(b & 8) && !!(a & 1) === !!(b & 2)) { const v = seamStep(byMask(a), byMask(b), 'br'); if (v > worst.v) worst = { v, a, b, d: 'br' }; }
      if (!!(a & 2) === !!(b & 8) && !!(a & 1) === !!(b & 4)) { const v = seamStep(byMask(a), byMask(b), 'bl'); if (v > worst.v) worst = { v, a, b, d: 'bl' }; }
    }
    if (worst.v > lim) fail.push(`${s.pair}: seam between mask ${worst.a} and its ${worst.d} neighbour mask ${worst.b} (step ${worst.v.toFixed(0)} > ${lim.toFixed(0)})`);
  }
  // Variants: full-tile fills the renderer picks by a position hash; frame 0 = the base tile.
  for (const v of T.variants ?? []) {
    const f = join(dir, v.file);
    if (!existsSync(f)) { fail.push(`variant ${v.terrain}: missing ${v.file}`); continue; }
    const img = readImage(f);
    if (img.w !== TW * v.frames || img.h !== TH || v.frames < 2) { fail.push(`variant ${v.terrain}: ${img.w}x${img.h} for ${v.frames} frames`); continue; }
    offPalette(`variant ${v.terrain}`, img);
    const ref = base.get(v.terrain);
    if (!ref) { fail.push(`variant ${v.terrain}: no sheet has a full ${v.terrain} tile`); continue; }
    // detail = share of interior px that are not the base's commonest colour; a variant must change >= half of it (max 30%)
    const hist = new Map(); let nIn = 0;
    for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y) && rimE(x, y) < 0.7) { const k = key(ref.data, (y * TW + x) * 4); hist.set(k, (hist.get(k) ?? 0) + 1); nIn++; }
    const need = Math.min(0.3, 0.5 * (1 - Math.max(...hist.values()) / nIn));
    frames(img, v.frames).forEach((t, k) => {
      const r = rimCheck(t); if (r > RIM_MAX) fail.push(`variant ${v.terrain} #${k}: dark 1 px rim (${Math.round(100 * r)}% more edge px dark than inside)`);
      let same = 0, n = 0, diff = 0, inner = 0;
      for (const px of Object.values(BAND)) for (const i of px) { n++; if (dist(t.data, i, ref.data, i) <= 24) same++; }
      for (let y = 0; y < 2 * HH; y++) for (let x = 0; x < TW; x++) if (inTop(x, y) && rimE(x, y) < 0.7) { inner++; if (key(t.data, (y * TW + x) * 4) !== key(ref.data, (y * TW + x) * 4)) diff++; }
      if (same / n < 0.95) fail.push(`variant ${v.terrain} #${k}: edge band matches the base in only ${Math.round((100 * same) / n)}% (seams)`);
      if (k === 0 && diff) fail.push(`variant ${v.terrain} #0 must be the base tile`);
      if (k > 0 && diff / inner < need) fail.push(`variant ${v.terrain} #${k}: interior only ${Math.round((100 * diff) / inner)}% different from the base, need ${Math.round(100 * need)}% (repetition)`);
    });
  }
  for (const c of T.cliffs ?? []) {
    const f = join(dir, c.file); if (!existsSync(f)) { fail.push(`cliff ${c.id}: missing`); continue; }
    const im = readImage(f); if (im.w !== c.w || im.h !== c.h) fail.push(`cliff ${c.id}: ${im.w}x${im.h} vs metadata ${c.w}x${c.h}`);
    offPalette(`cliff ${c.id}`, im);
  }
  return fail;
}

// Ground patch: in the bottom rows (12% of the height), a wide horizontal run of ground-coloured pixels. Trees and stone:
// green counts (grass squares, discs, slabs, moss beds; trunks and roots are brown); bushes and reeds are green
// themselves, so for them earth counts (soil rings and mounds).
const isGreen = (r, g, b) => g > r + 4 && g >= b - 4;
const isEarth = (r, g, b) => r >= g && r >= b && r - Math.min(g, b) > 18 && !isGreen(r, g, b);
export function groundPatch(im, anchor, kind) {
  const { w, h, data: d } = im, rows = Math.max(6, Math.round(h * 0.12));
  const plant = kind === 'bush' || kind === 'reeds', ground = plant ? isEarth : isGreen;
  const rowRun = (y, pred) => {
    let best = 0, run = 0, gap = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] && pred(d[i], d[i + 1], d[i + 2])) { run += 1 + gap; gap = 0; best = Math.max(best, run); }
      else if (run && gap < 2) gap++; else { run = 0; gap = 0; }
    }
    return best;
  };
  const y1 = Math.min(h - 1, Math.max(anchor.y, h - 1)), y0 = Math.max(0, y1 - rows);
  let worst = { run: 0 };
  for (let y = y0; y <= y1; y++) { const run = rowRun(y, ground); if (run > worst.run) worst = { run, y }; }
  const minRun = Math.max((plant ? 0.35 : 0.25) * w, 8);
  return worst.run >= minRun ? { ...worst, min: Math.round(minRun) } : null;
}

const FIELDS = ['id', 'kind', 'file', 'w', 'h', 'metres', 'anchor', 'footprint', 'blocksMovement', 'source'];
export function qaObjects(O, tilePalette, dir = join(ROOT, 'public/war/objects'), GO = null) {
  const fail = [], pal = palSet([...(tilePalette ?? []), ...(O.palette ?? [])]), ppm = O.pxPerMetre;
  if (GO && (GO.palette ?? []).some((h, i) => O.palette?.[i] !== h)) fail.push('objects.json: palette does not start with the global object palette');
  if (!O.palette?.length) fail.push('objects.json: no palette');
  if (ppm !== 33) fail.push(`objects.json: pxPerMetre ${ppm}, want 33 (W-18)`);
  for (const o of O.objects ?? []) {
    const id = o.id ?? '?', miss = FIELDS.filter((k) => o[k] == null);
    if (miss.length) { fail.push(`${id}: metadata missing ${miss.join(', ')}`); continue; }
    const f = join(dir, o.file); if (!existsSync(f)) { fail.push(`${id}: missing ${o.file}`); continue; }
    const im = readImage(f), { w, h, data: d } = im;
    if (w !== o.w || h !== o.h) fail.push(`${id}: PNG ${w}x${h} vs metadata ${o.w}x${o.h}`);
    let soft = 0, off = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i + 3] < 255) soft++; if (d[i + 3] && !pal.has(key(d, i))) off++; }
    if (soft) fail.push(`${id}: ${soft} semi-transparent px (alpha must be 0 or 255)`);
    if (off) fail.push(`${id}: ${off} px outside the shared palette`);
    const a = (x, y) => d[(y * w + x) * 4 + 3];
    const corners = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)].filter(Boolean).length;
    let per = 0, pn = 0; for (let x = 0; x < w; x++) { per += !!a(x, 0) + !!a(x, h - 1); pn += 2; } for (let y = 0; y < h; y++) { per += !!a(0, y) + !!a(w - 1, y); pn += 2; }
    if ((corners > 1 && !o.thin) || per / pn > (O.borderMax ?? 0.5)) fail.push(`${id}: background not transparent (${corners} opaque corners, ${Math.round((100 * per) / pn)}% opaque border)`);
    const rowHas = (y) => { for (let x = 0; x < w; x++) if (a(x, y)) return true; return false; };
    const colHas = (x) => { for (let y = 0; y < h; y++) if (a(x, y)) return true; return false; };
    if (!rowHas(0) || !rowHas(h - 1) || !colHas(0) || !colHas(w - 1)) fail.push(`${id}: not trimmed (empty border row/column)`);
    const hm = (h - (o.basePx ?? 0)) / ppm; if (Math.abs(hm - o.metres) / o.metres > 0.1) fail.push(`${id}: ${h} px = ${hm.toFixed(1)} m, metadata ${o.metres} m (want +-10%)`); // basePx: the footprint diamond under a building
    const an = o.anchor;
    if (!(an.x >= 0 && an.x < w && an.y >= h * 0.85 && an.y < h)) fail.push(`${id}: anchor (${an.x}, ${an.y}) not at the foot of ${w}x${h}`);
    else {
      let x0 = w, x1 = -1; // opaque span of the bottom rows: the foot must stand under the object, not beside it
      for (let y = Math.max(0, h - Math.max(3, Math.round(h * 0.03))); y < h; y++) for (let x = 0; x < w; x++) if (a(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      if (an.x < x0 || an.x > x1) fail.push(`${id}: anchor x ${an.x} outside the foot span ${x0}..${x1}`);
    }
    const g = groundPatch(im, an, o.kind);
    if (g) fail.push(`${id}: ground patch at row ${g.y}: ${g.run} px wide ground-coloured run (limit ${g.min})`);
  }
  return fail;
}

// runQa() checks the global set, runQa('<biome>') public/war/biomes/<biome>/ against it.
export function runQa(biome) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f)));
  const G = read('public/war/tiles/tiles.json'), GO = read('public/war/objects/objects.json');
  const dir = biome && join(ROOT, 'public/war/biomes', biome);
  const T = biome ? JSON.parse(readFileSync(join(dir, 'tiles.json'))) : G, O = biome ? JSON.parse(readFileSync(join(dir, 'objects.json'))) : GO;
  const fail = [...qaTiles(T, dir ?? undefined, biome ? G : null).map((f) => `tile  ${f}`), ...qaObjects(O, T.palette, dir ?? undefined, biome ? GO : null).map((f) => `object ${f}`)];
  const n = `${biome ? `biome ${biome}: ` : ''}${T.sheets.length} tile sets, ${(T.variants ?? []).length} variant fills, ${O.objects.length} objects`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  ') + (biome ? '\n  (a biome is built on the global set: after any global change run node scripts/war/art/build.mjs, which rebuilds every biome)' : ''));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// Build-mode art (public/war/buildings): every building-state sprite passes the object checks (palette = tiles + global
// objects + own colours). Kit sheets (walls, bridges, stairs, ladders, towers; layered kits also their front sheets):
// sizes (frames in rows of `columns`), binary alpha, palette, and no gap where two pieces meet: pieces are laid out as the
// map lays them (palisade: straight runs along both axes and a corner; layered walls: 2-deep runs along both axes and a
// 2-deep L, back then front per tile; bridge spans with abutments), and every tile boundary is searched for cracks.
export function qaBuildings(dir = join(ROOT, 'public/war/buildings')) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f)));
  const G = read('public/war/tiles/tiles.json'), GO = read('public/war/objects/objects.json'), B = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const fail = qaObjects(B, G.palette, dir, GO), pal = palSet([...G.palette, ...(B.palette ?? [])]);
  return [...fail, ...qaKits(B, dir, pal)];
}
// kit sheets of a set (build-mode kits, the landmark labyrinth): size, binary alpha, palette, seams
function qaKits(B, dir, pal) {
  const fail = [];
  for (const k of B.kits ?? []) for (const [state, file] of Object.entries(k.states ?? {})) {
    const cols = k.columns ?? k.frames, sheets = { back: file, ...(k.front ? { front: k.front[state] } : {}) }, ims = {};
    for (const [layer, fl] of Object.entries(sheets)) {
      const f = join(dir, fl ?? ''), tag = `${k.id} ${state} ${layer}`; if (!fl || !existsSync(f)) { fail.push(`${tag}: missing ${fl}`); continue; }
      const im = readImage(f), { w, h, data: d } = im;
      if (w !== k.frame.w * Math.min(cols, k.frames) || h !== k.frame.h * Math.ceil(k.frames / cols)) { fail.push(`${tag}: sheet ${w}x${h}, want ${k.frame.w * Math.min(cols, k.frames)}x${k.frame.h * Math.ceil(k.frames / cols)}`); continue; }
      let soft = 0, off = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i + 3] < 255) soft++; if (d[i + 3] && !pal.has(key(d, i))) off++; }
      if (soft) fail.push(`${tag}: ${soft} semi-transparent px`);
      if (off) fail.push(`${tag}: ${off} px outside the shared palette`);
      ims[layer] = im;
    }
    const tag = `${k.id} ${state}`;
    if (k.kind === 'bridge-diag' && ims.back) { fail.push(...diagSeams(k, ims.back, tag)); continue; }
    if (!ims.back || (k.front && !ims.front) || !['wall', 'ditch', 'bridge'].includes(k.kind)) continue; // stairs, ladders and towers stand alone: no seams to test
    const fr = (im, n) => crop(im, { x: (n % cols) * k.frame.w, y: Math.floor(n / cols) * k.frame.h, w: k.frame.w, h: k.frame.h }), o = k.tileOrigin;
    const fi = (n) => (k.frameOf ? k.frameOf[n] : n); // layered walls: frame of (mask, nothing open)
    // blob layouts from tile sets: [[frame, tile x, tile y], ...] with their masks
    const blob = (cells) => { const S = new Set(cells.map(([x, y]) => `${x},${y}`)), has = (x, y) => S.has(`${x},${y}`); return cells.map(([x, y]) => [(has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0), x, y]); };
    const two = (n, ax) => [...Array(n)].flatMap((_, i) => (ax === 'x' ? [[i, 0], [i, 1]] : [[0, i], [1, i]]));
    // layouts: [[frame, tile x, tile y], ...] and the tile pairs whose boundary is tested
    const L = k.kind === 'wall' && k.layered
      ? { '2-deep run x': [blob(two(3, 'x')), [[0, 2], [2, 4], [1, 3], [3, 5]]], '2-deep run y': [blob(two(3, 'y')), [[0, 2], [2, 4], [1, 3], [3, 5]]], '2-deep L': [blob([...two(3, 'x'), [0, 2], [1, 2], [0, 3], [1, 3]]), [[0, 2], [1, 6], [6, 8]]] }
      : k.kind === 'wall' || k.kind === 'ditch'
        ? { 'run x': [[[5, 0, 0], [5, 1, 0], [5, 2, 0]], [[0, 1], [1, 2]]], 'run y': [[[10, 0, 0], [10, 0, 1], [10, 0, 2]], [[0, 1], [1, 2]]], corner: [[[3, 0, 0], [5, 1, 0], [10, 0, 1]], [[0, 1], [0, 2]]] }
        : { // a 2-tile ramp (out-, end-), two decks, the far ramp (frames: deck-x 0, deck-y 1, end-x0 2 .. end-y1 5, out-x0 6 .. out-y1 9)
          'span x': [[[6, 0, 0], [2, 1, 0], [0, 2, 0], [0, 3, 0], [3, 4, 0], [7, 5, 0]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]],
          'span y': [[[8, 0, 0], [4, 0, 1], [1, 0, 2], [1, 0, 3], [5, 0, 4], [9, 0, 5]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]],
        };
    for (const [name, [tiles, pairs]] of Object.entries(L)) {
      const W = 9 * 64, H = k.frame.h + 6 * 32, OX = 4 * 64, cmp = { w: W, h: H, data: new Uint8Array(W * H * 4) };
      const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => (x + y) * 16;
      for (const [n, x, y] of [...tiles].sort((a, b) => a[1] + a[2] - b[1] - b[2])) for (const im of [ims.back, ims.front].filter(Boolean)) {
        const t = fr(im, fi(n)), X = sx(x, y) - o.x, Y = sy(x, y);
        for (let yy = 0; yy < t.h; yy++) for (let xx = 0; xx < t.w; xx++) { const i = (yy * t.w + xx) * 4; if (t.data[i + 3]) cmp.data.set(t.data.subarray(i, i + 4), ((Y + yy) * W + X + xx) * 4); }
      }
      // a crack = a transparent px with opaque px within 2 to its left and right in its row and within 3 above and below in
      // its column (texture gaps such as palisade tips, crenels and arches are open on one side); an empty column = a slit
      const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cmp.data[(y * W + x) * 4 + 3] > 0;
      const near = (x, y, dx, dy, n) => { for (let k = 1; k <= n; k++) if (op(x + dx * k, y + dy * k)) return true; return false; };
      const cracks = (c) => { let n = 0; for (let x = c - 4; x <= c + 4; x++) for (let y = 0; y < H; y++) if (!op(x, y) && near(x, y, -1, 0, 2) && near(x, y, 1, 0, 2) && near(x, y, 0, -1, 3) && near(x, y, 0, 1, 3)) n++; return n; };
      const colH = (x) => { let n = 0; for (let y = 0; y < H; y++) if (op(x, y)) n++; return n; };
      for (const [ia, ib] of pairs) {
        const [, ax, ay] = tiles[ia], [, bx, by] = tiles[ib], mid = Math.round((sx(ax, ay) + sx(bx, by)) / 2); // the boundary, halfway between the tile centres
        const inner = Math.max(cracks(sx(ax, ay)), cracks(sx(bx, by))), atB = cracks(mid);
        if (atB > inner + 2) fail.push(`${tag}: ${name}: ${atB} crack px where tiles ${ia} and ${ib} meet (${inner} inside the tiles)`);
        for (let x = mid - 3; x <= mid + 3; x++) if (!colH(x) && colH(x - 4) && colH(x + 4)) { fail.push(`${tag}: ${name}: empty column where tiles ${ia} and ${ib} meet`); break; }
      }
    }
  }
  return fail;
}
// Diagonal bridge segments (kind bridge-diag): runs of a 2-row ramp, 3 decks, a 2-row ramp laid one row step apart (h: rowStepPx along
// screen x, v: along screen y, drawn north to south); no crack or slit where two segments meet.
function diagSeams(k, im, tag) {
  const fail = [], cols = k.columns ?? k.frames, fw = k.frame.w, fh = k.frame.h;
  const fr = (n) => crop(im, { x: (n % cols) * fw, y: Math.floor(n / cols) * fh, w: fw, h: fh });
  for (const d of ['h', 'v']) for (const w of [1, 2, 3]) {
    const seq = [`${d}${w}-out+`, `${d}${w}-end+`, `${d}${w}-deck`, `${d}${w}-deck`, `${d}${w}-deck`, `${d}${w}-end-`, `${d}${w}-out-`].map((p) => k.pieces.indexOf(p));
    if (seq.some((n) => n < 0)) { fail.push(`${tag}: ${d}${w}: pieces missing`); continue; }
    const [sx, sy] = k.rowStepPx[d], W = fw + sx * 6, H = fh + sy * 6, cmp = { w: W, h: H, data: new Uint8Array(W * H * 4) };
    seq.forEach((n, i) => { const t = fr(n); for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const s = (y * fw + x) * 4; if (t.data[s + 3]) cmp.data.set(t.data.subarray(s, s + 4), ((y + i * sy) * W + x + i * sx) * 4); } });
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cmp.data[(y * W + x) * 4 + 3] > 0;
    const near = (x, y, dx, dy, n) => { for (let q = 1; q <= n; q++) if (op(x + dx * q, y + dy * q)) return true; return false; };
    for (let i = 1; i < 7; i++) { // the boundary between segments i - 1 and i: a column (h) or a row (v)
      let n = 0;
      if (d === 'h') { const c = k.tileOrigin.x + (i - 0.5) * sx; for (let x = c - 2; x <= c + 2; x++) for (let y = 0; y < H; y++) if (!op(x, y) && near(x, y, -1, 0, 2) && near(x, y, 1, 0, 2) && near(x, y, 0, -1, 3) && near(x, y, 0, 1, 3)) n++; }
      else { const r = k.tileOrigin.y + (i - 0.5) * sy; for (let y = r - 2; y <= r + 2; y++) for (let x = 0; x < W; x++) if (!op(x, y) && near(x, y, -1, 0, 3) && near(x, y, 1, 0, 3) && near(x, y, 0, -1, 2) && near(x, y, 0, 1, 2)) n++; }
      if (n > 2) fail.push(`${tag}: ${d}${w}: ${n} crack px where segments ${i - 1} and ${i} meet`);
    }
  }
  return fail;
}
export function runBuildingsQa() {
  const dir = join(ROOT, 'public/war/buildings'); if (!existsSync(join(dir, 'objects.json'))) return [];
  const fail = qaBuildings(dir), B = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const n = `buildings: ${(B.kits ?? []).length} kits, ${(B.buildings ?? []).length} buildings, ${B.objects.length} sprites`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  '));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// Siege art (public/war/siege): every sprite passes the object checks; every strip (engine anims, ladder push-offs, fx, char):
// size = frames x frame, binary alpha, palette, no empty frame; every engine facing has all its states.
export function qaSiege(dir = join(ROOT, 'public/war/siege')) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f)));
  const G = read('public/war/tiles/tiles.json'), GO = read('public/war/objects/objects.json'), S = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const fail = qaObjects(S, G.palette, dir, GO), pal = palSet([...G.palette, ...(S.palette ?? [])]), ids = new Set(S.objects.map((o) => o.id));
  for (const e of S.engines ?? []) for (const f of e.facings) for (const s of [...S.buildOrder, 'damaged', 'destroyed']) if (!ids.has(e.states?.[f]?.[s])) fail.push(`${e.id} ${f}: no ${s} sprite`);
  const strips = [...(S.engines ?? []).flatMap((e) => Object.values(e.anims ?? {}).flatMap((a) => Object.values(a))), ...Object.values(S.ladders?.pushOff ?? {}), ...(S.fx ?? []), ...(S.char ?? [])];
  for (const t of strips) {
    const f = join(dir, t.file); if (!existsSync(f)) { fail.push(`${t.file}: missing`); continue; }
    const im = readImage(f), { w, h, data: d } = im;
    if (w !== t.frame.w * t.frames || h !== t.frame.h) { fail.push(`${t.file}: ${w}x${h}, want ${t.frame.w * t.frames}x${t.frame.h}`); continue; }
    let soft = 0, off = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i + 3] < 255) soft++; if (d[i + 3] && !pal.has(key(d, i))) off++; }
    if (soft) fail.push(`${t.file}: ${soft} semi-transparent px`);
    if (off) fail.push(`${t.file}: ${off} px outside the shared palette`);
    for (let n = 0; n < t.frames; n++) { let any = false; for (let y = 0; y < h && !any; y++) for (let x = n * t.frame.w; x < (n + 1) * t.frame.w; x++) if (d[(y * w + x) * 4 + 3]) { any = true; break; } if (!any) fail.push(`${t.file}: frame ${n} empty`); }
  }
  return fail;
}
export function runSiegeQa() {
  const dir = join(ROOT, 'public/war/siege'); if (!existsSync(join(dir, 'objects.json'))) return [];
  const fail = qaSiege(dir), S = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const n = `siege: ${(S.engines ?? []).length} engines, ${S.objects.length} sprites, ${(S.fx ?? []).length} fx`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  '));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// trade art (ART-T): object checks for every sprite (cargo overlays and piles included), each cart has every state and
// strip per facing, cargo kinds per facing, the mule sheet and strips on the shared palette with binary alpha.
export function qaTrade(dir = join(ROOT, 'public/war/trade')) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f)));
  const G = read('public/war/tiles/tiles.json'), GO = read('public/war/objects/objects.json'), T = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const fail = qaObjects(T, G.palette, dir, GO), pal = palSet([...G.palette, ...(T.palette ?? [])]), ids = new Set(T.objects.map((o) => o.id));
  for (const c of T.carts ?? []) for (const f of c.facings) {
    for (const s of ['halted', 'burning', 'wrecked', 'burnt']) if (!ids.has(c.states?.[f]?.[s])) fail.push(`${c.id} ${f}: no ${s} sprite`);
    if (Object.keys(c.cargo?.[f] ?? {}).length < 12) fail.push(`${c.id} ${f}: ${Object.keys(c.cargo?.[f] ?? {}).length} cargo overlays, want 12`);
  }
  for (const t of T.things ?? []) for (const s of Object.values(t.states)) if (!ids.has(s)) fail.push(`${t.id}: no sprite ${s}`);
  const strips = [...(T.carts ?? []).flatMap((c) => Object.values(c.moving ?? {})), ...(T.mules?.file ? [{ file: T.mules.file, frame: T.mules.frame, frames: Math.max(...Object.values(T.mules.anims).map((a) => a.col + a.frames)), rows: T.mules.rows.length }] : [])];
  if (!T.mules?.file) fail.push('no mule team sheet');
  for (const t of strips) {
    const f = join(dir, t.file); if (!existsSync(f)) { fail.push(`${t.file}: missing`); continue; }
    const im = readImage(f), { w, h, data: d } = im, rows = t.rows ?? 1;
    if (w !== t.frame.w * t.frames || h !== t.frame.h * rows) { fail.push(`${t.file}: ${w}x${h}, want ${t.frame.w * t.frames}x${t.frame.h * rows}`); continue; }
    let soft = 0, off = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i + 3] < 255) soft++; if (d[i + 3] && !pal.has(key(d, i))) off++; }
    if (soft) fail.push(`${t.file}: ${soft} semi-transparent px`);
    if (off) fail.push(`${t.file}: ${off} px outside the shared palette`);
    for (let r = 0; r < rows; r++) for (let n = 0; n < t.frames; n++) { let any = false; for (let y = r * t.frame.h; y < (r + 1) * t.frame.h && !any; y++) for (let x = n * t.frame.w; x < (n + 1) * t.frame.w; x++) if (d[(y * w + x) * 4 + 3]) { any = true; break; } if (!any) fail.push(`${t.file}: row ${r} frame ${n} empty`); }
  }
  return fail;
}
export function runTradeQa() {
  const dir = join(ROOT, 'public/war/trade'); if (!existsSync(join(dir, 'objects.json'))) return [];
  const fail = qaTrade(dir), T = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const n = `trade: ${(T.carts ?? []).length} carts, ${T.objects.length} sprites`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  '));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// Landmark structures (ART-L, public/war/landmarks): every sprite passes the object checks; every piece has its four
// states; the labyrinth kit as the build-mode kits; wall segments (segmentM) laid three in a row in every state show no
// crack or slit where two meet.
export function qaLandmarks(dir = join(ROOT, 'public/war/landmarks')) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, f)));
  const G = read('public/war/tiles/tiles.json'), GO = read('public/war/objects/objects.json'), L = JSON.parse(readFileSync(join(dir, 'landmarks.json')));
  const fail = qaObjects(L, G.palette, dir, GO), pal = palSet([...G.palette, ...(L.palette ?? [])]), byId = new Map(L.objects.map((o) => [o.id, o]));
  for (const p of L.pieces ?? []) for (const s of L.states) if (!byId.has(p.states?.[s])) fail.push(`${p.id}: no ${s} sprite`);
  fail.push(...qaKits(L, dir, pal));
  for (const p of (L.pieces ?? []).filter((q) => q.segmentM)) for (const s of L.states) {
    const o = byId.get(p.states[s]); if (!o) continue;
    const im = readImage(join(dir, o.file)), n = p.segmentM / 2, ax = p.axis === 'y' ? [0, n] : [n, 0];
    const W = im.w + 3 * n * 64 + 8, H = im.h + 3 * n * 32 + 8, cmp = { w: W, h: H, data: new Uint8Array(W * H * 4) }, OX = 3 * n * 32 + 4;
    const sx = (x, y) => OX + (x - y) * 32, sy = (x, y) => 4 + (x + y) * 16;
    for (let i = 0; i < 3; i++) { const X = sx(ax[0] * i, ax[1] * i) - o.tileOrigin.x, Y = sy(ax[0] * i, ax[1] * i) - o.tileOrigin.y + o.tileOrigin.y; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const q = (y * im.w + x) * 4; if (im.data[q + 3] && X + x >= 0 && Y + y >= 0 && X + x < W && Y + y < H) cmp.data.set(im.data.subarray(q, q + 4), ((Y + y) * W + X + x) * 4); } }
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cmp.data[(y * W + x) * 4 + 3] > 0;
    const near = (x, y, dx, dy, m) => { for (let k = 1; k <= m; k++) if (op(x + dx * k, y + dy * k)) return true; return false; };
    const cracks = (c) => { let m = 0; for (let x = c - 4; x <= c + 4; x++) for (let y = 0; y < H; y++) if (!op(x, y) && near(x, y, -1, 0, 2) && near(x, y, 1, 0, 2) && near(x, y, 0, -1, 3) && near(x, y, 0, 1, 3)) m++; return m; };
    const colH = (x) => { let m = 0; for (let y = 0; y < H; y++) if (op(x, y)) m++; return m; };
    const [fw, fh] = p.footprint, ctr = (i) => sx(ax[0] * i + fw / 2, ax[1] * i + fh / 2);
    for (const i of [1, 2]) {
      const mid = Math.round(p.axis === 'y' ? sx(fw / 2, ax[1] * i) : sx(ax[0] * i, fh / 2)), inner = Math.max(cracks(Math.round(ctr(i - 1))), cracks(Math.round(ctr(i)))), at = cracks(mid);
      if (at > inner + 2) fail.push(`${p.id} ${s}: ${at} crack px where segments ${i - 1} and ${i} meet (${inner} inside)`);
      for (let x = mid - 3; x <= mid + 3; x++) if (!colH(x) && colH(x - 4) && colH(x + 4)) { fail.push(`${p.id} ${s}: empty column where segments ${i - 1} and ${i} meet`); break; }
    }
  }
  return fail;
}
export function runLandmarksQa() {
  const dir = join(ROOT, 'public/war/landmarks'); if (!existsSync(join(dir, 'landmarks.json'))) return [];
  const fail = qaLandmarks(dir), L = JSON.parse(readFileSync(join(dir, 'landmarks.json')));
  const n = `landmarks: ${(L.pieces ?? []).length} pieces, ${(L.kits ?? []).length} kits, ${L.objects.length} sprites`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  '));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// landmark FX (ART-L, public/war/fx): every strip: size = frames x frame, binary alpha, palette (tiles + own), no empty
// frame, the anchor inside the frame.
export function qaFx(dir = join(ROOT, 'public/war/fx')) {
  const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), X = JSON.parse(readFileSync(join(dir, 'objects.json')));
  const fail = [], pal = palSet([...G.palette, ...(X.palette ?? [])]);
  for (const t of X.fx ?? []) {
    const f = join(dir, t.file); if (!existsSync(f)) { fail.push(`${t.file}: missing`); continue; }
    const im = readImage(f), { w, h, data: d } = im;
    if (w !== t.frame.w * t.frames || h !== t.frame.h) { fail.push(`${t.file}: ${w}x${h}, want ${t.frame.w * t.frames}x${t.frame.h}`); continue; }
    if (w > 8192) fail.push(`${t.file}: ${w} px wide (max 8192)`);
    if (!(t.anchor.x >= 0 && t.anchor.y >= 0 && t.anchor.x < t.frame.w && t.anchor.y < t.frame.h)) fail.push(`${t.file}: anchor outside the frame`);
    let soft = 0, off = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] && d[i + 3] < 255) soft++; if (d[i + 3] && !pal.has(key(d, i))) off++; }
    if (soft) fail.push(`${t.file}: ${soft} semi-transparent px`);
    if (off) fail.push(`${t.file}: ${off} px outside the shared palette`);
    for (let n = 0; n < t.frames; n++) { let any = false; for (let y = 0; y < h && !any; y++) for (let x = n * t.frame.w; x < (n + 1) * t.frame.w; x++) if (d[(y * w + x) * 4 + 3]) { any = true; break; } if (!any) fail.push(`${t.file}: frame ${n} empty`); }
  }
  return fail;
}
export function runFxQa() {
  const dir = join(ROOT, 'public/war/fx'); if (!existsSync(join(dir, 'objects.json'))) return [];
  const fail = qaFx(dir), n = `fx: ${(JSON.parse(readFileSync(join(dir, 'objects.json'))).fx ?? []).length} strips`;
  if (fail.length) console.error(`QA FAIL (${fail.length}) over ${n}\n  ` + fail.join('\n  '));
  else console.log(`QA OK: ${n}`);
  return fail;
}

// CLI: the global set, every biome folder, the build-mode set, the siege, trade, landmark and landmark FX sets.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bdir = join(ROOT, 'public/war/biomes');
  const biomes = existsSync(bdir) ? readdirSync(bdir).filter((b) => existsSync(join(bdir, b, 'tiles.json'))) : [];
  process.exit([...[undefined, ...biomes].map((b) => runQa(b).length), runBuildingsQa().length, runSiegeQa().length, runTradeQa().length, runLandmarksQa().length, runFxQa().length].some(Boolean) ? 1 : 0);
}
