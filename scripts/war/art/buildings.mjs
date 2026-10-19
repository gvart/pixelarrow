// Build-mode art (W-22..W-24): wall kits, gates, towers, bridges, buildings and their construction states ->
// public/war/buildings/ (objects.json + PNGs). Prompts and lessons: PROMPTS_ART.md "Buildings".
// Usage: node scripts/war/art/buildings.mjs [pixellab dir]   (raws in <dir>/buildings/raw, inits in <dir>/buildings/inits)
//
// Walls, gates, towers and bridges are drawn by a small iso box renderer (true scale: 1 m along a tile axis = 16 px
// across + 8 px down, 1 m up = 33 px; 1 tile = 2 m) and textured with PixelLab front elevations (create_image_pixflux
// over the periodic inits of kit-inits.mjs), quilted to an exact 2 m period. Every face samples its texture by world
// position, and box extents are half-open, so pieces drawn tile by tile join pixel for pixel along both axes.
// Buildings (camp, storehouse, ...) are PixelLab map objects scaled to their footprint; their scaffold and damaged
// states are pixflux img2img over a prepared init (raws listed in BUILDINGS). Foundations are drawn by the renderer.
// Every sprite snaps to the global tile + object palette plus up to 64 own colours. QA: qa.mjs (qaBuildings).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette, rgbToHex, hexToRgb, resizeArea, resizeNearest } from '../../art/lib/ops.mjs';
import { runBuildingsQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const RAW = join(PIX, 'buildings/raw'), INITS = join(PIX, 'buildings/inits'), OUT = join(ROOT, 'public/war/buildings');
const PPM = 33, MX = 16, MY = 8, P = 66, FW = 32; // px/m up; px/m across and down along a tile axis; elevation period; face period
const STATES = ['foundation', 'scaffold', 'done', 'damaged'];
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 10007) / 10007;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mul = (c, f) => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f), 255];
const lumOf = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function gradeC(c, g) { if (!g) return c; const l = lumOf(c); return [0, 1, 2].map((k) => clamp((l + (c[k] - l) * g.sat) * g.val)).concat(255); }

// ---- textures: front elevations quilted to period P, squeezed to FW face columns (16 px per m along the axis)
function faceStrip(name, g) {
  const R = readImage(join(RAW, 'tex', `${name}.png`)), I = readImage(join(INITS, `${name}.png`)), h = R.h;
  const at = (im, x, y) => { const i = (y * im.w + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]]; };
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  // min-cost vertical seam in the overlap: column k switches from R[P + c] (c < k) to R[c] (c >= k), so the tile's last
  // column runs on into its first one (R[c] continues into R[P] = column 0).
  const lo = 36, hi = P - 2, cost = [], back = [];
  for (let y = 0; y < h; y++) {
    cost.push([]); back.push([]);
    for (let k = lo; k <= hi; k++) {
      const c0 = d(at(R, P + k, y), at(R, k, y));
      let best = 1e9, bk = k; if (y) for (const kk of [k - 1, k, k + 1]) if (kk >= lo && kk <= hi && cost[y - 1][kk - lo] < best) { best = cost[y - 1][kk - lo]; bk = kk; }
      cost[y].push(c0 + (y ? best : 0)); back[y].push(bk);
    }
  }
  const cut = new Array(h); let k = lo + cost[h - 1].indexOf(Math.min(...cost[h - 1]));
  for (let y = h - 1; y >= 0; y--) { cut[y] = k; k = back[y][k - lo]; }
  const Q = blank(P, h);
  for (let y = 0; y < h; y++) for (let c = 0; c < P; c++) { const s = at(R, c < cut[y] ? P + c : c, y), a = at(I, c, y)[3] >= 128 ? 255 : 0; Q.data.set([...gradeC(s, g).slice(0, 3), a], (y * P + c) * 4); }
  // squeeze P elevation columns to FW face columns (area mean over opaque px, majority alpha)
  const F = blank(FW, h);
  for (let y = 0; y < h; y++) for (let c = 0; c < FW; c++) {
    const a0 = (c * P) / FW, a1 = ((c + 1) * P) / FW; let s = [0, 0, 0], n = 0, op = 0, tot = 0;
    for (let x = Math.floor(a0); x < Math.ceil(a1); x++) { const w = Math.min(a1, x + 1) - Math.max(a0, x), p = at(Q, x % P, y); tot += w; if (p[3]) { op += w; n += w; for (let q = 0; q < 3; q++) s[q] += p[q] * w; } }
    if (op * 2 >= tot) F.data.set([...s.map((v) => clamp(v / n)), 255], (y * FW + c) * 4);
  }
  return { h, px: (u, r) => { if (r < 0 || r >= h) return null; const i = ((h - 1 - r) * FW + (((u % FW) + FW) % FW)) * 4; return F.data[i + 3] ? [F.data[i], F.data[i + 1], F.data[i + 2], 255] : null; }, F };
}

// ---- iso box renderer with a depth buffer. World (x, y, z) in metres; origin (ox, oy) = screen px of (0, 0, 0).
class Canvas {
  constructor(w, h, ox, oy) { Object.assign(this, { w, h, ox, oy, im: blank(w, h), z: new Float32Array(w * h).fill(-1e9) }); }
  put(px, py, depth, c) {
    if (!c || px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = py * this.w + px; if (depth < this.z[i]) return; this.z[i] = depth; this.im.data.set(c, i * 4);
  }
}
const DEPTH = (x, y, z) => x + y + 0.485 * z;
const SHADE = { '+y': 1.0, '+x': 0.74, '-x': 0.62, '-y': 0.55, top: 1.12 };
// box: { x0, x1, y0, y1, z0, z1, mat, skip: Set of faces }; mat(face, x, y, z, u, r) -> rgba | null (u, r: texture px)
function drawBox(cv, b) {
  const { ox, oy } = cv, skip = b.skip ?? new Set();
  if (b.z1 <= b.z0 || b.x1 <= b.x0 || b.y1 <= b.y0) return;
  const side = (face, fixed, isX) => { // isX: face at x = fixed (spans y)
    const sA = isX ? ox + (fixed - b.y1) * MX : ox + (b.x0 - fixed) * MX, sB = isX ? ox + (fixed - b.y0) * MX : ox + (b.x1 - fixed) * MX;
    for (let px = Math.floor(sA); px <= Math.ceil(sB); px++) {
      const t = (px + 0.5 - ox) / MX, x = isX ? fixed : t + fixed, y = isX ? fixed - t : fixed;
      if (isX ? y < b.y0 || y >= b.y1 : x < b.x0 || x >= b.x1) continue;
      const base = oy + (x + y) * MY, pyA = Math.floor(base - b.z1 * PPM), pyB = Math.ceil(base - b.z0 * PPM);
      for (let py = pyA; py <= pyB; py++) {
        const z = (base - (py + 0.5)) / PPM; if (z < b.z0 || z >= b.z1) continue;
        const u = Math.floor((isX ? y : x) * MX + 1e-6), r = Math.floor((z - b.z0) * PPM + 1e-6); // r: texture row above the box's base
        const c = b.mat(face, x, y, z, u, r); if (c) cv.put(px, py, DEPTH(x, y, z), mul(c, SHADE[face]));
      }
    }
  };
  if (!skip.has('-y')) side('-y', b.y0, false);
  if (!skip.has('-x')) side('-x', b.x0, true);
  if (!skip.has('+y')) side('+y', b.y1, false);
  if (!skip.has('+x')) side('+x', b.x1, true);
  if (!skip.has('top')) { // z = z1: x - y = a, x + y = bb
    const sx0 = Math.floor(ox + (b.x0 - b.y1) * MX), sx1 = Math.ceil(ox + (b.x1 - b.y0) * MX), sy0 = Math.floor(oy + (b.x0 + b.y0) * MY - b.z1 * PPM), sy1 = Math.ceil(oy + (b.x1 + b.y1) * MY - b.z1 * PPM);
    for (let py = sy0; py <= sy1; py++) for (let px = sx0; px <= sx1; px++) {
      const a = (px + 0.5 - ox) / MX, bb = (py + 0.5 - oy + b.z1 * PPM) / MY, x = (a + bb) / 2, y = (bb - a) / 2;
      if (x < b.x0 || x >= b.x1 || y < b.y0 || y >= b.y1) continue;
      const c = b.mat('top', x, y, b.z1, Math.floor(x * MX + 1e-6), Math.floor(y * MX + 1e-6)); if (c) cv.put(px, py, DEPTH(x, y, b.z1), mul(c, SHADE.top));
    }
  }
}
// A box cut into 1/16 m slices along `axis`, each topped at min(z1, prof(along)): broken tops, half-built walls.
function sliced(b, axis, prof) {
  const out = [], a0 = axis === 'x' ? b.x0 : b.y0, a1 = axis === 'x' ? b.x1 : b.y1;
  for (let s = Math.floor(a0 * MX); s < Math.ceil(a1 * MX); s++) {
    const s0 = Math.max(a0, s / MX), s1 = Math.min(a1, (s + 1) / MX); if (s1 <= s0) continue;
    const z1 = Math.min(b.z1, prof((s0 + s1) / 2)); if (z1 <= b.z0) continue;
    const skip = new Set(b.skip ?? []); if (s0 > a0) skip.delete(axis === 'x' ? '-x' : '-y'); if (s1 < a1) skip.delete(axis === 'x' ? '+x' : '+y'); // inner slice sides show where a neighbour slice is lower
    out.push(axis === 'x' ? { ...b, x0: s0, x1: s1, z1, skip } : { ...b, y0: s0, y1: s1, z1, skip });
  }
  return out;
}
function renderBoxes(boxes, w, h, ox, oy) { const cv = new Canvas(w, h, ox, oy); for (const b of boxes) drawBox(cv, b); return cv.im; }

// ---- materials
const TEX = {};
function loadTextures() {
  TEX.palisade = faceStrip('palisade', { sat: 0.75, val: 0.8 });
  TEX.ashlar = faceStrip('ashlar', { sat: 0.7, val: 0.72 });
  TEX.arches = faceStrip('arches', { sat: 0.7, val: 0.66 });
  TEX.trestle = faceStrip('trestle', { sat: 0.75, val: 0.8 });
  // wood ramp: quantiles of the palisade's opaque colours
  const cols = []; const F = TEX.palisade.F; for (let i = 0; i < F.data.length; i += 4) if (F.data[i + 3]) cols.push([F.data[i], F.data[i + 1], F.data[i + 2]]);
  cols.sort((a, b) => lumOf(a) - lumOf(b)); TEX.wood = [0.08, 0.3, 0.55, 0.8, 0.95].map((q) => [...cols[Math.floor(q * (cols.length - 1))], 255]);
  const sc = []; const S = TEX.ashlar.F; for (let i = 0; i < S.data.length; i += 4) if (S.data[i + 3]) sc.push([S.data[i], S.data[i + 1], S.data[i + 2]]);
  sc.sort((a, b) => lumOf(a) - lumOf(b)); TEX.stone = [0.05, 0.3, 0.55, 0.8, 0.95].map((q) => [...sc[Math.floor(q * (sc.length - 1))], 255]);
}
const EARTH = [43, 36, 29, 255], STRING = [150, 146, 136, 255], DOORDARK = [20, 17, 15, 255];
// texture of a face along x or y: u runs with x on +-y faces and with y on +-x faces
const along = (face, x, y) => (face === '+y' || face === '-y' ? x : y);
const strip = (T, rowOf = (r) => r) => (face, x, y, z, u, r) => face === 'top' ? null : T.px(u, rowOf(r));
// planks: boards 0.25 m wide across `dir` with dark seams; used for deck tops, doors, platforms and roofs
const planks = (dir = 'x', k = 0) => (face, x, y, z, u, r) => {
  const a = face === 'top' ? (dir === 'x' ? x : y) : (face === '+y' || face === '-y' ? x : y) * 1;
  const n = Math.floor(a * 4 + 1e-6), f = a * 4 - n, W = TEX.wood;
  if (f < 0.14) return W[0];
  const c = W[1 + (Math.floor(hash(((n % 8) + 8) % 8, k) * 3))]; return mul(c, 0.94 + 0.12 * hash(Math.floor((face === 'top' ? (dir === 'x' ? y : x) : z) * 12), n, k + 1));
};
const flags = (face, x, y) => { const S = TEX.stone, n = Math.floor(x * 2.5) * 7 + Math.floor(y * 2.5); const fx = x * 2.5 % 1, fy = y * 2.5 % 1; return fx < 0.12 || fy < 0.12 ? S[0] : mul(S[2 + Math.floor(hash(n & 63, 5) * 2)], 0.95 + 0.1 * hash(Math.floor(x * 16), Math.floor(y * 16), 2)); };
const solid = (c) => () => c;
const woodSolid = (i = 2) => (face, x, y, z) => mul(TEX.wood[i], 0.92 + 0.16 * hash(Math.floor(z * 10), Math.floor((x + y) * 6), 3));

// ---- wall kits: frame per neighbour mask (+x 1, +y 2, -x 4, -y 8). Wall centred in the tile, arms to the tile edges.
const KITS = {
  palisade: { material: 'wood', burnable: true, heightM: 3.0, thick: 0.4, source: 'pixflux 7eb5a5c5 (palisade elevation)' },
  'stone-wall': { material: 'stone', burnable: false, heightM: 5.1, walkM: 4.3, thick: 1.4, para: 0.32, source: 'pixflux 51ecb6e0 (ashlar elevation)' },
};
const KIT_W = 96, KIT_Y0 = 190, KIT_H = KIT_Y0 + 34; // frame 96 x 224 (16 px either side for scaffolds and rubble), tile top vertex at (48, 190)
const DIRS = [[1, 'x', 1], [2, 'y', 1], [4, 'x', -1], [8, 'y', -1]]; // bit, axis, sign
// The footprint of a wall piece in tile-local metres: centre square + one rectangle per arm; each piece knows which of its
// faces lie on an open tile edge (a continuing arm), where no end face is drawn.
function wallRects(mask, T) {
  const a = 1 - T / 2, b = 1 + T / 2, rx = [mask & 4 ? 0 : a, mask & 1 ? 2 : b], ry = [mask & 8 ? 0 : a, mask & 2 ? 2 : b];
  const rects = [];
  if (mask & 5 || !(mask & 10)) rects.push({ x0: rx[0], x1: rx[1], y0: a, y1: b, axis: 'x', skip: new Set([...(mask & 1 ? ['+x'] : []), ...(mask & 4 ? ['-x'] : [])]) });
  if (mask & 10) rects.push({ x0: a, x1: b, y0: ry[0], y1: ry[1], axis: 'y', skip: new Set([...(mask & 2 ? ['+y'] : []), ...(mask & 8 ? ['-y'] : [])]) });
  return rects;
}
// Edges of the wall outline (for parapets and foundation lines): [x0, y0, x1, y1, outward normal]
function wallEdges(mask, T) {
  const a = 1 - T / 2, b = 1 + T / 2, E = [];
  for (const [bit, ax, sg] of DIRS) {
    if (mask & bit) { // the arm's two long edges, from the centre square to the tile edge
      const s0 = sg > 0 ? b : 0, s1 = sg > 0 ? 2 : a;
      if (ax === 'x') E.push([s0, a, s1, a, '-y'], [s0, b, s1, b, '+y']); else E.push([a, s0, a, s1, '-x'], [b, s0, b, s1, '+x']);
    } else if (ax === 'x') E.push(sg > 0 ? [b, a, b, b, '+x'] : [a, a, a, b, '-x']); // centre square side
    else E.push(sg > 0 ? [a, b, b, b, '+y'] : [a, a, b, a, '-y']);
  }
  return E;
}
// palisade row for a log wall of height H m: the texture's sharpened tops (row ~105) at the wall top, logs repeat below
const palRow = (r, H) => { const q = r + 105 - Math.round(H * PPM); return q >= 10 ? q : 10 + (((q - 10) % 66) + 66) % 66; };
function palisadeMat() { return (face, x, y, z, u, r) => (face === 'top' ? null : TEX.palisade.px(face === '+x' || face === '-x' ? -u - 1 : u, r)); }
function stoneMat() {
  const T = TEX.ashlar, walk = 142;
  return (face, x, y, z, u, r) => {
    if (face === 'top') return z < 4.35 ? flags(face, x, y) : null;
    const uu = face === '+x' || face === '-x' ? -u - 1 : u;
    return T.px(uu, r % walk);
  };
}
// parapet box along an edge: crenels come from the texture's merlon alpha; its top only where a merlon stands
function parapet(e, K, mat, prof) {
  const [x0, y0, x1, y1, n] = e, p = K.para, ext = 0.0;
  const box = n === '+y' ? { x0: x0 - ext, x1: x1 + ext, y0: y1 - p, y1 } : n === '-y' ? { x0: x0 - ext, x1: x1 + ext, y0, y1: y0 + p } : n === '+x' ? { x0: x1 - p, x1, y0: y0 - ext, y1: y1 + ext } : { x0, x1: x0 + p, y0: y0 - ext, y1: y1 + ext };
  const axis = n === '+y' || n === '-y' ? 'x' : 'y';
  const m = (face, x, y, z, u, r) => { // texture rows 142..167 = the merlon band of the elevation
    const a = axis === 'x' ? x : y, uu = Math.floor(a * MX + 1e-6), uA = axis === 'x' ? uu : -uu - 1, rr = Math.min(167, 142 + r);
    if (!TEX.ashlar.px(uA, face === 'top' ? 167 : rr)) return null; // crenel gap
    return face === 'top' ? TEX.stone[3] : TEX.ashlar.px(uA, rr);
  };
  const b = { ...box, z0: K.walkM, z1: K.heightM, mat: m };
  return prof ? sliced(b, axis, prof) : [b];
}

// state profiles: scaffold = built to ~half height, a ragged course line; damaged = breaches between full-height tile edges
const halfProf = (H, k) => (a) => H * 0.52 + 0.25 * Math.floor(hash(Math.floor(a * 3), k, 11) * 3);
// damaged: a broken top, `edge` x H where pieces meet (every damaged piece, so damaged runs join), deeper towards the
// middle of the tile, ragged per block (stone) or per log (wood)
const breachProf = (H, k, per = 4, edge = 0.78) => (a) => { const m = ((a % 2) + 2) % 2, t = Math.sin((Math.PI * m) / 2) ** 0.6; return H * (edge - t * (0.12 + 0.3 * hash(Math.floor(a * per) & 7, k, 13))); };
function scorch(im, k, strength = 1) { // charred patches and a few embers (wood)
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4; if (!im.data[i + 3]) continue;
    const n = 0.6 * hash(x >> 3, y >> 3, k) + 0.4 * hash(x >> 1, y >> 1, k + 1);
    const f = n < 0.45 * strength ? 0.35 : n < 0.7 * strength ? 0.6 : 0.85;
    for (let c = 0; c < 3; c++) im.data[i + c] = clamp(im.data[i + c] * f);
    if (hash(x, y, k + 2) < 0.006 * strength) im.data.set([122, 58, 26, 255], i);
  }
  return im;
}
function soot(im, k) { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4; if (!im.data[i + 3]) continue; const n = 0.7 * hash(x >> 4, y >> 4, k) + 0.3 * hash(x >> 1, y >> 1, k + 1); if (n < 0.3) for (let c = 0; c < 3; c++) im.data[i + c] = clamp(im.data[i + c] * 0.78); } return im; }
// scaffolding along a run [a0, a1) on the outward side `n` of an edge at `at`: poles every metre, ledgers, a plank stage
function scaffold(axis, a0, a1, at, out, top) {
  const B = [], W = woodSolid(1), Wl = woodSolid(3), pole = 0.1, off = out * 0.45, c = at + off;
  for (let a = Math.ceil(a0 * 1 - 1e-6) + 0.45; a < a1; a += 1) {
    const p = axis === 'x' ? { x0: a, x1: a + pole, y0: c - pole / 2, y1: c + pole / 2 } : { x0: c - pole / 2, x1: c + pole / 2, y0: a, y1: a + pole };
    B.push({ ...p, z0: 0, z1: top + 1.3, mat: W });
  }
  for (let z = 1.1; z < top + 1.2; z += 1.1) {
    const t = 0.16; // ledgers thick enough to rasterise without holes on both axes
    const p = axis === 'x' ? { x0: a0, x1: a1, y0: c + (out > 0 ? pole / 2 : -pole / 2 - t), y1: c + (out > 0 ? pole / 2 + t : -pole / 2) } : { x0: c + (out > 0 ? pole / 2 : -pole / 2 - t), x1: c + (out > 0 ? pole / 2 + t : -pole / 2), y0: a0, y1: a1 };
    B.push({ ...p, z0: z, z1: z + 0.12, mat: Wl });
  }
  const st = top - 0.35, w0 = Math.min(at, c), w1 = Math.max(at, c) + 0.02; // plank stage between wall and poles
  B.push(axis === 'x' ? { x0: a0, x1: a1, y0: w0, y1: w1, z0: st, z1: st + 0.07, mat: planks('x', 3) } : { x0: w0, x1: w1, y0: a0, y1: a1, z0: st, z1: st + 0.07, mat: planks('y', 3) });
  return B;
}
// foundation: dug trench lines on the outline, a string line on stakes (wood) or a first course of stones (stone)
function foundation(edges, material, k, stakeEvery = 1) {
  const B = [], line = 0.09;
  for (const [x0, y0, x1, y1, n] of edges) {
    const ax = y0 === y1 ? 'x' : 'y', a0 = ax === 'x' ? Math.min(x0, x1) : Math.min(y0, y1), a1 = ax === 'x' ? Math.max(x0, x1) : Math.max(y0, y1), at = ax === 'x' ? y0 : x0;
    const o = n[0] === '+' ? -line : 0;
    B.push(ax === 'x' ? { x0: a0, x1: a1, y0: at + o, y1: at + o + line, z0: 0, z1: 0.02, mat: solid(EARTH) } : { x0: at + o, x1: at + o + line, y0: a0, y1: a1, z0: 0, z1: 0.02, mat: solid(EARTH) });
    if (material === 'stone') for (let a = a0 + 0.05; a < a1 - 0.2; a += 0.5) {
      const l = 0.32 + 0.1 * hash(Math.floor(a * 4), k, 4), w = 0.26; if (a + l > a1) break;
      B.push(ax === 'x' ? { x0: a, x1: a + l, y0: at - w / 2, y1: at + w / 2, z0: 0, z1: 0.22, mat: (f, x, y, z) => mul(TEX.stone[2 + (hash(Math.floor(a * 8), k, 6) > 0.5)], 0.9 + 0.2 * hash(Math.floor(x * 20), Math.floor(z * 30), 1)) } : { x0: at - w / 2, x1: at + w / 2, y0: a, y1: a + l, z0: 0, z1: 0.22, mat: (f, x, y, z) => mul(TEX.stone[2 + (hash(Math.floor(a * 8), k, 6) > 0.5)], 0.9 + 0.2 * hash(Math.floor(y * 20), Math.floor(z * 30), 1)) });
    }
    for (let a = Math.ceil(a0 / stakeEvery - 1e-6) * stakeEvery + 0.1; a < a1; a += stakeEvery) {
      const s = 0.08, sx = ax === 'x' ? a : at - s / 2, sy = ax === 'x' ? at - s / 2 : a;
      B.push({ x0: sx, x1: sx + s, y0: sy, y1: sy + s, z0: 0, z1: 0.6, mat: woodSolid(2) });
    }
    if (material !== 'stone') B.push(ax === 'x' ? { x0: a0, x1: a1, y0: at - 0.015, y1: at + 0.015, z0: 0.42, z1: 0.45, mat: solid(STRING) } : { x0: at - 0.015, x1: at + 0.015, y0: a0, y1: a1, z0: 0.42, z1: 0.45, mat: solid(STRING) });
  }
  return B;
}
function kitBoxes(id, mask, state) {
  const K = KITS[id], T = K.thick, rects = wallRects(mask, T), edges = wallEdges(mask, T), wood = K.material === 'wood';
  if (state === 'foundation') return foundation(edges, K.material, mask, 1);
  const H = wood ? K.heightM : K.walkM, mat = wood ? palisadeMat() : stoneMat(), B = [];
  const prof = state === 'scaffold' ? halfProf(H, mask) : state === 'damaged' ? breachProf(H, mask + 7, wood ? 3 : 4) : null;
  for (const r of rects) { const b = { ...r, z0: 0, z1: H, mat }; B.push(...(prof ? sliced(b, r.axis, prof) : [b])); }
  if (!wood && state === 'done') for (const e of edges) B.push(...parapet(e, K, mat)); // damaged: the parapet is gone
  if (state === 'scaffold') { // stage on the outward (viewer) side of every run
    const top = H * 0.52 + 0.5;
    for (const [x0, y0, x1, y1, n] of edges) if (n === '+y' || n === '+x') { const ax = n === '+y' ? 'x' : 'y'; B.push(...scaffold(ax, ax === 'x' ? x0 : y0, ax === 'x' ? x1 : y1, ax === 'x' ? y0 : x0, 1, top)); }
  }
  if (state === 'damaged') for (let i = 0; i < 4; i++) { // rubble / fallen logs at the foot, inside the tile
    const a = 0.3 + 1.4 * hash(i, mask, 21), s = 0.18 + 0.2 * hash(i, mask, 22), side = rects[0].axis === 'x' ? { x0: a, x1: a + s * 1.4, y0: 1 + T / 2 + 0.05, y1: 1 + T / 2 + 0.05 + s } : { x0: 1 + T / 2 + 0.05, x1: 1 + T / 2 + 0.05 + s, y0: a, y1: a + s * 1.4 };
    B.push({ ...side, z0: 0, z1: s * 0.8, mat: wood ? woodSolid(1) : (f, x, y, z) => mul(TEX.stone[2], 0.85 + 0.25 * hash(Math.floor(x * 30), Math.floor(y * 30 + z * 40), 7)) });
  }
  return B;
}
function renderKit(id, state) {
  const frames = [...Array(16)].map((_, mask) => {
    let im = renderBoxes(kitBoxes(id, mask, state), KIT_W, KIT_H, KIT_W / 2, KIT_Y0);
    if (state === 'damaged') im = KITS[id].material === 'wood' ? scorch(im, mask, 0.7) : soot(im, mask);
    return im;
  });
  return frames;
}

// ---- towers and gates (procedural, same textures). Footprints in tiles; models in metres from the footprint's NW corner.
function stoneTowerBoxes(state, k = 1) {
  const S = 6, H = 11.2, m = stoneMat(), K = { ...KITS['stone-wall'], walkM: H, heightM: H + 0.8, para: 0.4 };
  const slit = (face, x, y, z, u, r) => { const a = along(face, x, y) % 3; if ((face === '+y' || face === '+x') && a > 1.42 && a < 1.58 && ((z > 5 && z < 6.1) || (z > 8.2 && z < 9.3))) return DOORDARK; return m(face, x, y, z, u, r); };
  if (state === 'foundation') return foundation([[0, 0, S, 0, '-y'], [0, S, S, S, '+y'], [0, 0, 0, S, '-x'], [S, 0, S, S, '+x']], 'stone', k, 1.5);
  const prof = state === 'scaffold' ? halfProf(H * 0.6, k) : state === 'damaged' ? (a) => H * (0.62 + 0.3 * hash(Math.floor(a * 2), k, 3)) : null;
  const top = (face, x, y, z, u, r) => (face === 'top' ? planks('x', 9)(face, x, y) : slit(face, x, y, z, u, r));
  const body = { x0: 0, x1: S, y0: 0, y1: S, z0: 0, z1: H, mat: top };
  const B = prof ? sliced(body, 'x', prof) : [body];
  if (!prof) for (const e of [[0, 0, S, 0, '-y'], [0, S, S, S, '+y'], [0, 0, 0, S, '-x'], [S, 0, S, S, '+x']]) B.push(...parapet(e, K, m));
  if (state === 'scaffold') { B.push(...scaffold('x', 0, S, S, 1, H * 0.6 * 0.52 + 0.5), ...scaffold('y', 0, S, S, 1, H * 0.6 * 0.52 + 0.5)); }
  return B;
}
function woodTowerBoxes(state, k = 2) {
  const S = 2, W = woodSolid(1), pal = palisadeMat(), H = 7.9;
  if (state === 'foundation') return foundation([[0, 0, S, 0, '-y'], [0, S, S, S, '+y'], [0, 0, 0, S, '-x'], [S, 0, S, S, '+x']], 'wood', k, 0.66);
  const B = [{ x0: 0, x1: S, y0: 0, y1: S, z0: 0, z1: 3.0, mat: (f, x, y, z, u, r) => (f === 'top' ? planks('x', 5)(f, x, y) : pal(f, x, y, z, u, r)) }];
  if (state === 'scaffold') { B[0] = { ...B[0], z1: 1.6, mat: (f, x, y, z, u, r) => (f === 'top' ? planks('x', 5)(f, x, y) : pal(f, x, y, z, u, r + 40)) }; B.push(...scaffold('x', 0, S, S, 1, 2.2), ...scaffold('y', 0, S, S, 1, 2.2)); return B; }
  const posts = [[0.05, 0.05], [S - 0.3, 0.05], [0.05, S - 0.3], [S - 0.3, S - 0.3]];
  const broken = state === 'damaged';
  for (const [i, [x, y]] of posts.entries()) B.push({ x0: x, x1: x + 0.25, y0: y, y1: y + 0.25, z0: 3.0, z1: broken && i === 3 ? 4.2 : 7.2, mat: W });
  B.push({ x0: -0.2, x1: S + 0.2, y0: -0.2, y1: S + 0.2, z0: 5.1, z1: 5.35, mat: planks('x', 6) }); // fighting platform
  const rail = (b) => B.push({ ...b, z0: 5.35, z1: 6.4, mat: (f, x, y, z, u, r) => (f === 'top' ? null : pal(f, x, y, z, u, r + 72)) });
  rail({ x0: -0.2, x1: S + 0.2, y0: S + 0.05, y1: S + 0.2 }); rail({ x0: S + 0.05, x1: S + 0.2, y0: -0.2, y1: S + 0.05 }); rail({ x0: -0.2, x1: S + 0.2, y0: -0.2, y1: -0.05 }); rail({ x0: -0.2, x1: -0.05, y0: -0.05, y1: S + 0.05 });
  if (!broken) { B.push({ x0: -0.35, x1: S + 0.35, y0: -0.35, y1: S + 0.35, z0: 7.2, z1: 7.45, mat: planks('y', 7) }); B.push({ x0: 0.3, x1: S - 0.3, y0: 0.3, y1: S - 0.3, z0: 7.45, z1: H, mat: planks('x', 8) }); }
  return B;
}
// gates: 3 tiles along the wall axis, the middle tile is the gateway (2 m clear for a ram). Stone: 3 x 3 (bastions run
// through the wall line), wood: 3 x 1 (two log gate towers). Models along u (the wall axis) / v (across), then mapped.
function gateBoxes(material, axis, state, k = 3) {
  const stone = material === 'stone', D = stone ? 6 : 2, L = 6, B = [], c = D / 2;
  const map = (b) => (axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  const m = stone ? stoneMat() : palisadeMat();
  const out = []; const add = (b) => out.push(map(b));
  const edgeW = ([a0, b0, a1, b1, n]) => (axis === 'x' ? [a0, b0, a1, b1, n] : [b0, a0, b1, a1, n[0] + (n[1] === 'x' ? 'y' : 'x')]);
  if (state === 'foundation') {
    const fb = foundation([[0, 0, L, 0, '-y'], [0, D, L, D, '+y'], [0, 0, 0, D, '-x'], [L, 0, L, D, '+x']], material, k, stone ? 1.5 : 1);
    return fb.map((b) => (axis === 'x' ? b : { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  }
  const towerH = stone ? 6.5 : 4.6, half = state === 'scaffold', dmg = state === 'damaged';
  for (const [u0, u1] of [[0, 2], [4, 6]]) {
    const H = half ? towerH * 0.5 : towerH;
    const body = { u0, u1, v0: stone ? 1.5 : 0.2, v1: stone ? 4.5 : 1.8, z0: 0, z1: H, mat: (f, x, y, z, u, r) => (f === 'top' ? (stone ? flags(f, x, y) : planks('x', 4)(f, x, y)) : m(f, x, y, z, u, stone ? r : palRow(r, H))) };
    if (dmg) out.push(...sliced(map(body), 'x', (a) => H * (0.65 + 0.3 * hash(Math.floor(a * 3), u0, k))).map((b) => b)); else add(body);
    if (!half && !dmg && stone) for (const e of [[u0, 1.5, u1, 1.5, '-y'], [u0, 4.5, u1, 4.5, '+y'], [u0, 1.5, u0, 4.5, '-x'], [u1, 1.5, u1, 4.5, '+x']]) out.push(...parapet(edgeW(e), { ...KITS['stone-wall'], walkM: H, heightM: H + 0.8, para: 0.35 }, m));
    if (!half && !stone) { // log gate tower: posts, platform and a railing on top of the walled base
      add({ u0: u0 - 0.1, u1: u1 + 0.1, v0: 0, v1: 2, z0: H, z1: H + 0.22, mat: planks('x', 6) });
      if (!dmg) add({ u0: u0 - 0.1, u1: u1 + 0.1, v0: 1.85, v1: 2, z0: H + 0.22, z1: H + 1.2, mat: (f, x, y, z, u, r) => (f === 'top' ? null : m(f, x, y, z, u, r + 72)) });
    }
  }
  // gateway: lintel / walkway over the opening, the doors set in the wall line
  const passH = stone ? 3.4 : 3.3, wallTop = stone ? 5.1 : 3.9;
  if (!half) {
    add({ u0: 2, u1: 4, v0: c - (stone ? 0.8 : 0.25), v1: c + (stone ? 0.8 : 0.25), z0: passH, z1: dmg ? passH + 0.5 : wallTop, mat: (f, x, y, z, u, r) => (f === 'top' ? (stone ? flags(f, x, y) : planks('x', 2)(f, x, y)) : stone ? m(f, x, y, z, u, r) : planks('x', 2)(f, x, y, z, u, r)) });
    if (stone && !dmg) for (const e of [[2, c - 0.8, 4, c - 0.8, '-y'], [2, c + 0.8, 4, c + 0.8, '+y']]) out.push(...parapet(edgeW(e), { ...KITS['stone-wall'], walkM: wallTop, heightM: wallTop + 0.8 }, m));
  }
  const doorMat = (f, x, y, z) => { const a = axis === 'x' ? x : y, n = Math.floor(a * 3.3); if (Math.abs(a - 3) < 0.03 || (z > 0.8 && z < 0.92) || (z > 2.3 && z < 2.42)) return mul(TEX.wood[0], 1.2); return n % 2 ? TEX.wood[1] : TEX.wood[2]; };
  if (state === 'done') add({ u0: 2, u1: 4, v0: c - 0.08, v1: c + 0.08, z0: 0, z1: passH, mat: doorMat });
  if (dmg) { add({ u0: 2, u1: 2.9, v0: c - 0.08, v1: c + 0.08, z0: 0, z1: passH * 0.8, mat: doorMat }); add({ u0: 3.1, u1: 3.9, v0: c + 0.3, v1: c + 1.6, z0: 0, z1: 0.15, mat: doorMat }); }
  if (half) { for (const [u0] of [[0], [4]]) out.push(...scaffold(axis, u0, u0 + 2, axis === 'x' ? (stone ? 4.5 : 1.8) : (stone ? 4.5 : 1.8), 1, (stone ? towerH : towerH) * 0.5 * 0.52 + 0.6).map((b) => b)); }
  return out;
}

// render a model of footprint fw x fh tiles; returns { im, anchor, tileOrigin }
function renderModel(boxes, fw, fh, Hm, post) {
  const W = (fw + fh) * 32 + 40, ox = fh * 32 + 20, oy = Math.ceil(Hm * PPM) + 30, Ht = oy + (fw + fh) * 16 + 20;
  let im = renderBoxes(boxes, W, Ht, ox, oy); if (post) im = post(im);
  const box = alphaBox(im, 1), t = crop(im, box);
  return { im: t, tileOrigin: { x: ox - box.x, y: oy - box.y } };
}

// ---- PixelLab buildings: key the background, drop the ground PixelLab drew, grade, scale to the footprint width
const isGreen = (r, g, b) => g > r + 4 && g >= b - 4;
function keyBorder(im, tol = 18, at = 0) { // at: px index of the reference corner (some raws have a two-tone background)
  const { w, h, data: d } = im; if (d[at * 4 + 3] < 255) return im;
  const ref = [d[at * 4], d[at * 4 + 1], d[at * 4 + 2]], seen = new Uint8Array(w * h), st = [];
  const ok = (i) => Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) <= tol;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (seen[i] || !ok(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
// flood from the transparent outside into pixels that pass `pred` (a ground slab round the object), dropping them
function floodGround(im, pred, maxY0 = 0) {
  const { w, h, data: d } = im, seen = new Uint8Array(w * h), st = [];
  for (let y = maxY0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i * 4 + 3] && pred(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) { const nb = [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]; if (nb.some((j) => j < 0 || !d[j * 4 + 3])) st.push(i); } }
  while (st.length) { const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (!d[i * 4 + 3] || !pred(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) continue; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0; if (y < maxY0) continue; if (x) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return im;
}
function dropSpecks(im, frac = 0.01) {
  const { w, h, data: d } = im, lab = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s = 0; s < w * h; s++) { if (lab[s] >= 0 || d[s * 4 + 3] < 128) continue; const id = sizes.length, st = [s]; let n = 0; lab[s] = id; while (st.length) { const i = st.pop(); n++; const x = i % w, y = (i / w) | 0; for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && d[j * 4 + 3] >= 128) { lab[j] = id; st.push(j); } } sizes.push(n); }
  const tot = sizes.reduce((a, b) => a + b, 0); for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] < tot * frac) d[i * 4 + 3] = 0;
  return im;
}
const hard = (im) => { for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0; return im; };
const gradeIm = (im, g) => { if (!g) return im; for (let i = 0; i < im.data.length; i += 4) { const c = gradeC([im.data[i], im.data[i + 1], im.data[i + 2]], g); im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; } return im; };
const GROUND = {
  green: (r, g, b) => isGreen(r, g, b) || (g >= r - 6 && g > b + 6 && r < 140),
  sand: (r, g, b) => r > 120 && r > b + 30 && g > b + 10 && r - g < 60,
  earth: (r, g, b) => r >= g && g >= b - 4 && r - b > 12 && r < 150,
};
function prepBuilding(o, file) {
  let im = readImage(file); const bg = [...im.data.slice(0, 3)];
  im = keyBorder(keyBorder(im, 34), 34, (im.h - 1) * im.w);
  if (o.charHoles) for (let i = 0; i < im.data.length; i += 4) { // pixflux paints its background into holes: char them (a gutted interior)
    const d = im.data; if (d[i + 3] && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) <= 34) d.set(mul(DOORDARK, 0.8 + 0.5 * hash(i >> 4, 3, 9)), i);
  }
  for (const k of o.ground ?? []) im = floodGround(im, GROUND[k], o.groundY0 ?? 0);
  if (o.groundAll) for (let y = o.groundY0 ?? 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4; if (im.data[i + 3] && o.groundAll.some((k) => GROUND[k](im.data[i], im.data[i + 1], im.data[i + 2]))) im.data[i + 3] = 0; } // ground enclosed by a fence
  if (o.dropBelow) for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y > o.dropBelow(x)) im.data[(y * im.w + x) * 4 + 3] = 0;
  im = dropSpecks(hard(im), 0.004);
  im = gradeIm(im, o.grade); im = crop(im, alphaBox(im, 1));
  const tw = (o.footprint[0] + o.footprint[1]) * 32 * (o.fill ?? 1), s = o.scale ?? tw / im.w; // scale: a state raw keeps the done sprite's scale
  if (Math.abs(s - 1) > 0.01) im = hard((s > 1 ? resizeNearest : resizeArea)(im, Math.round(im.w * s), Math.round(im.h * s))); // small upscales: nearest
  return crop(im, alphaBox(im, 1));
}
function footOf(im) { const rows = Math.max(3, Math.round(im.h * 0.03)); let s = 0, n = 0; for (let y = im.h - rows; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { s += x; n++; } return { x: Math.round(s / n), y: im.h - 1 }; }

// PixelLab raws (raw/objects/<raw>.png) and their state raws. scaffold/damaged = pixflux img2img over the done sprite
// prepared by prepState() (prompts in PROMPTS_ART.md). fill: share of the footprint width the sprite spans.
export const BUILDINGS = [
  { id: 'camp', kind: 'camp', material: 'wood', burnable: true, footprint: [4, 4], raw: 'camp', ground: ['sand'], grade: { sat: 0.7, val: 0.8 }, fill: 0.95, source: 'map_object 883da2cc' },
  { id: 'storehouse', kind: 'storehouse', material: 'stone', burnable: false, footprint: [3, 3], raw: 'storehouse', ground: ['green'], grade: { sat: 0.55, val: 0.75 }, source: 'map_object c9e1eb41' },
  { id: 'outpost', kind: 'outpost', material: 'wood', burnable: true, footprint: [3, 3], raw: 'outpost', ground: ['green', 'earth'], groundAll: ['green'], groundY0: 150, grade: { sat: 0.7, val: 0.8 }, source: 'map_object c7fa4bf4' },
  { id: 'barracks', kind: 'barracks', material: 'stone', burnable: false, footprint: [4, 3], raw: 'barracks', grade: { sat: 0.55, val: 0.78 }, source: 'map_object eedd6c92' },
  { id: 'keep', kind: 'keep', material: 'stone', burnable: false, footprint: [4, 4], raw: 'keep', grade: { sat: 0.6, val: 0.78 }, source: 'map_object a9e4232c' },
  { id: 'farm', kind: 'farm', material: 'wood', burnable: true, footprint: [4, 4], raw: 'farm', ground: ['green'], grade: { sat: 0.55, val: 0.72 }, source: 'map_object d8a727c4' },
  { id: 'olive-press', kind: 'press', material: 'stone', burnable: false, footprint: [3, 3], raw: 'olive-press', ground: ['green'], grade: { sat: 0.6, val: 0.78 }, fill: 0.95, source: 'map_object 23e61811' },
];
export const PROPS = [
  { id: 'lumber-pile', kind: 'prop', material: 'wood', footprint: [1, 1], raw: 'lumber-pile', grade: { sat: 0.65, val: 0.8 }, fill: 0.85, source: 'map_object c872b491' },
  { id: 'stone-pile', kind: 'prop', material: 'stone', footprint: [1, 1], raw: 'stone-pile', grade: { sat: 0.7, val: 0.8 }, fill: 0.85, source: 'map_object 594dd609' },
];

// ---- bridges: 1-tile pieces. deck-x / deck-y span water along that axis; end-<axis><0|1> = abutment ramp from the bank
// (deck height at the inner edge, 0 at the outer edge; 0 = the ramp's outer edge is at the low end of the axis).
const BRIDGES = {
  'bridge-wood': { material: 'wood', burnable: true, deck: 2.0, source: 'pixflux b5ffd7c7 (trestle elevation)' },
  'bridge-stone': { material: 'stone', burnable: false, deck: 2.5, source: 'pixflux a55d882b (arch elevation)' },
};
const BRIDGE_PIECES = ['deck-x', 'deck-y', 'end-x0', 'end-x1', 'end-y0', 'end-y1'];
function bridgeBoxes(id, piece, state, k) {
  const Bd = BRIDGES[id], stone = Bd.material === 'stone', axis = piece.endsWith('x') || piece[4] === 'x' ? 'x' : 'y', end = piece.startsWith('end'), lowAt0 = piece.endsWith('0');
  const map = (b) => (axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  const out = [], add = (b) => out.push(map(b)), D = Bd.deck;
  if (state === 'foundation') { // marked line of the span with stakes / pier stones, on both edges
    const fb = foundation([[0, 0.05, 2, 0.05, '-y'], [0, 1.95, 2, 1.95, '+y']], Bd.material, k, 0.66);
    return fb.map((b) => (axis === 'x' ? b : { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  }
  const ramp = (u) => (lowAt0 ? D * u / 2 : D * (2 - u) / 2);
  const dmg = state === 'damaged', half = state === 'scaffold';
  if (!end) {
    if (stone) {
      const arch = (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : TEX.arches.px(u, r));
      const prof = null; // damaged: parapets broken, soot (a holed arch reads as a floating pier)
      const body = { u0: 0, u1: 2, v0: 0, v1: 2, z0: 0, z1: half ? 1.5 : D, mat: arch };
      if (prof) out.push(...sliced(map(body), axis, prof)); else add(body);
      if (half) { // timber centring under the arch and no parapets yet
        add({ u0: 0.6, u1: 1.9, v0: 0.1, v1: 1.9, z0: 0, z1: 1.2, mat: (f, x, y, z) => ((Math.floor(z * 4) + Math.floor((axis === 'x' ? x : y) * 4)) % 3 ? null : TEX.wood[1]) });
      }
      if (!half) for (const v of [[0, 0.3], [1.7, 2]]) { const pb = { u0: 0, u1: 2, v0: v[0], v1: v[1], z0: D, z1: D + 0.8, mat: (f, x, y, z, u, r) => (f === 'top' ? TEX.stone[3] : TEX.arches.px(u, r + Math.round(D * PPM))) }; if (dmg && v[0] > 0) out.push(...sliced(map(pb), axis, (a) => (a > 0.4 && a < 1.6 ? D : D + 0.8))); else add(pb); }
    } else {
      const tr = (f, x, y, z, u, r) => (f === 'top' ? TEX.wood[2] : TEX.trestle.px(u, r));
      for (const v of [[0.05, 0.2], [1.8, 1.95]]) {
        const sb = { u0: 0, u1: 2, v0: v[0], v1: v[1], z0: 0, z1: half ? D - 0.3 : D + 1.0, mat: tr };
        if (dmg && v[0] > 1) out.push(...sliced(map(sb), axis, (a) => (a > 0.5 && a < 1.6 ? 1.2 : D + 1.0))); else add(sb);
      }
      const deck = { u0: 0, u1: 2, v0: 0.2, v1: 1.8, z0: D - 0.25, z1: D, mat: planks(axis === 'x' ? 'x' : 'y', 2) };
      if (half) add({ ...deck, u1: 1.0 }); else if (dmg) { add({ ...deck, u1: 0.7 }); add({ ...deck, u0: 1.45 }); } else add(deck);
    }
  } else {
    const prof = (a) => Math.max(0.05, ramp(a));
    const body = { u0: 0, u1: 2, v0: stone ? 0 : 0.2, v1: stone ? 2 : 1.8, z0: 0, z1: D, mat: stone ? (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : TEX.ashlar.px(u, r)) : (f, x, y, z, u, r) => (f === 'top' ? planks(axis === 'x' ? 'x' : 'y', 4)(f, x, y) : (z * 5) % 1 < 0.18 ? TEX.wood[0] : mul(TEX.wood[1 + (Math.floor(z * 5) % 2)], 0.92 + 0.16 * hash(Math.floor(u / 3), Math.floor(z * 5), 4))) };
    const p2 = half && stone ? (a) => Math.min(prof(a), D * 0.45) : dmg ? (a) => prof(a) * (0.7 + 0.3 * hash(Math.floor(a * 5), k, 2)) : prof;
    out.push(...sliced(map(body), axis, p2));
    if (!half) for (const v of [[0, 0.3], [1.7, 2]]) if (stone) out.push(...sliced(map({ u0: 0, u1: 2, v0: v[0], v1: v[1], z0: 0, z1: D + 0.8, mat: (f, x, y, z, u, r) => (f === 'top' ? TEX.stone[3] : TEX.ashlar.px(u, r % 140)) }), axis, (a) => (dmg && v[0] > 1 ? prof(a) : prof(a) + 0.8)));
  }
  return out;
}

// ---- palette (biome rule): tile palette + global object palette (unchanged, first) + up to 64 colours far from them
function medianCut(images, n) {
  const all = []; for (const im of images) for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] > 128) all.push([im.data[i], im.data[i + 1], im.data[i + 2]]);
  let boxes = [all];
  while (boxes.length < n) { boxes.sort((a, b) => b.length - a.length); const b = boxes.shift(); if (b.length < 2) { boxes.push(b); break; } const rng = [0, 1, 2].map((c) => { let mn = 255, mx = 0; for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; } return mx - mn; }); const c = rng.indexOf(Math.max(...rng)); b.sort((x, y) => x[c] - y[c]); const m = b.length >> 1; boxes.push(b.slice(0, m), b.slice(m)); }
  return [...new Set(boxes.map((b) => { const s = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c]; return rgbToHex(s.map((v) => Math.round(v / b.length))); }))];
}
function extendPalette(base, images, n, far = 12) {
  const pal = base.map(hexToRgb), cache = new Map();
  const isFar = (r, g, b) => { const k = (r << 16) | (g << 8) | b; if (!cache.has(k)) cache.set(k, Math.min(...pal.map(([R, G, B]) => (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2)) > far * far); return cache.get(k); };
  const only = images.map((im) => { const o = { w: im.w, h: im.h, data: new Uint8Array(im.data) }; for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3] > 128 && !isFar(o.data[i], o.data[i + 1], o.data[i + 2])) o.data[i + 3] = 0; return o; });
  const extra = only.some((o) => o.data.some((v, i) => i % 4 === 3 && v > 128)) ? medianCut(only, n) : [];
  return [...base, ...extra.filter((h) => !base.includes(h))];
}

// ---- state inits for the PixelLab buildings (written for the pixflux img2img calls; `node buildings.mjs --inits`)
function stateInit(im, state, k) {
  const out = { w: im.w, h: im.h, data: new Uint8Array(im.data) }, d = out.data, top = alphaBox(im, 1).y, Hs = im.h - top;
  if (state === 'scaffold') { // erase the upper half along a V roof line (2:1), then draw poles and planks
    const cx = footOf(im).x, cut = (x) => top + Hs * 0.48 + Math.abs(x - cx) * 0.5 * 0.4;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y < cut(x)) d[(y * im.w + x) * 4 + 3] = 0;
    const W = TEX.wood; for (let x = 6; x < im.w - 4; x += 22) { const yb = im.h - 1 - Math.abs(x - cx) * 0.5 * 0.9, yt = cut(x) - 30; for (let y = Math.max(0, Math.round(yt)); y < yb; y++) for (const dx of [0, 1]) d.set(W[1 + dx], ((y * im.w) + x + dx) * 4); }
    for (let x = 0; x < im.w; x++) { const y = Math.round(cut(x) - 4); if (y > 0 && hash(x >> 4, 1, k) > 0.2) for (const dy of [0, 1]) if (y + dy < im.h) d.set(W[2 + dy], ((y + dy) * im.w + x) * 4); }
  } else if (state === 'damaged') { // knock holes in the top third, char it
    for (let i = 0; i < 6; i++) { const cx = im.w * (0.15 + 0.7 * hash(i, k, 1)), cy = top + Hs * (0.05 + 0.35 * hash(i, k, 2)), r = 6 + 14 * hash(i, k, 3); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (Math.hypot(x - cx, (y - cy) * 1.4) < r) d[(y * im.w + x) * 4 + 3] = 0; }
    scorch(out, k, 1.2);
  }
  return dropSpecks(out, 0.003);
}

// ======== main
if (process.argv.includes('--inits')) { // write the state inits for the PixelLab buildings
  loadTextures(); mkdirSync(join(INITS, 'states'), { recursive: true });
  for (const o of BUILDINGS) { const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) continue; const im = prepBuilding(o, f); for (const s of ['scaffold', 'damaged']) { // pixflux wants sides divisible by 4 and <= 400: shrink, then pad at the top-left
    let t = stateInit(im, s, o.id.length); const k = Math.min(1, 400 / t.h, 400 / t.w); if (k < 1) t = hard(resizeArea(t, Math.floor(t.w * k), Math.floor(t.h * k)));
    const pad = blank(Math.ceil(t.w / 4) * 4, Math.ceil(t.h / 4) * 4); paste(pad, t, pad.w - t.w, pad.h - t.h); writeImage(join(INITS, 'states', `${o.id}-${s}.png`), pad); } }
  console.log('state inits ->', join(INITS, 'states')); process.exit(0);
}
loadTextures();
mkdirSync(OUT, { recursive: true });
const sprites = []; // { o (metadata), im }
const kits = [], buildings = [];
// wall kits
for (const id of Object.keys(KITS)) {
  const K = KITS[id], files = {};
  for (const s of STATES) { const fr = renderKit(id, s), sheet = blank(KIT_W * 16, KIT_H); fr.forEach((f, i) => paste(sheet, f, i * KIT_W, 0)); files[s] = `${id}-${s}.png`; sprites.push({ sheet: true, file: files[s], im: sheet }); }
  kits.push({ id, kind: 'wall', material: K.material, burnable: K.burnable, heightM: K.heightM, thicknessM: K.thick, frames: 16, frame: { w: KIT_W, h: KIT_H }, tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, states: files, source: K.source });
}
for (const id of Object.keys(BRIDGES)) {
  const Bd = BRIDGES[id], files = {};
  for (const s of STATES) { const sheet = blank(KIT_W * BRIDGE_PIECES.length, KIT_H); BRIDGE_PIECES.forEach((p, i) => { let im = renderBoxes(bridgeBoxes(id, p, s, i + 1), KIT_W, KIT_H, KIT_W / 2, KIT_Y0); if (s === 'damaged') im = Bd.material === 'wood' ? scorch(im, i) : soot(im, i); paste(sheet, im, i * KIT_W, 0); }); files[s] = `${id}-${s}.png`; sprites.push({ sheet: true, file: files[s], im: sheet }); }
  kits.push({ id, kind: 'bridge', material: Bd.material, burnable: Bd.burnable, deckM: Bd.deck, maxSpanTiles: 10, pieces: BRIDGE_PIECES, frames: BRIDGE_PIECES.length, frame: { w: KIT_W, h: KIT_H }, tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, states: files, source: Bd.source });
}
// procedural structures: towers and gates
const PROC = [
  { id: 'stone-tower', kind: 'tower', material: 'stone', burnable: false, footprint: [3, 3], heightM: 12, inline: 'centre tile on the wall line', boxes: stoneTowerBoxes, source: 'renderer + ashlar elevation' },
  { id: 'wood-tower', kind: 'tower', material: 'wood', burnable: true, footprint: [1, 1], heightM: 8, inline: 'replaces one wall tile', boxes: woodTowerBoxes, source: 'renderer + palisade elevation' },
  { id: 'stone-gate-x', kind: 'gate', material: 'stone', burnable: false, footprint: [3, 3], axis: 'x', heightM: 8, inline: 'centre tile on the wall line, opening along y', boxes: (s) => gateBoxes('stone', 'x', s), source: 'renderer + ashlar elevation' },
  { id: 'stone-gate-y', kind: 'gate', material: 'stone', burnable: false, footprint: [3, 3], axis: 'y', heightM: 8, inline: 'centre tile on the wall line, opening along x', boxes: (s) => gateBoxes('stone', 'y', s), source: 'renderer + ashlar elevation' },
  { id: 'wood-gate-x', kind: 'gate', material: 'wood', burnable: true, footprint: [3, 1], axis: 'x', heightM: 5.8, inline: '3 wall tiles along x', boxes: (s) => gateBoxes('wood', 'x', s), source: 'renderer + palisade elevation' },
  { id: 'wood-gate-y', kind: 'gate', material: 'wood', burnable: true, footprint: [1, 3], axis: 'y', heightM: 5.8, inline: '3 wall tiles along y', boxes: (s) => gateBoxes('wood', 'y', s), source: 'renderer + palisade elevation' },
];
const rendered = {}; // id -> state -> { im, tileOrigin }
for (const p of PROC) {
  rendered[p.id] = {};
  for (const s of STATES) {
    const post = s === 'damaged' ? (im) => (p.material === 'wood' ? scorch(im, p.id.length, 0.7) : soot(im, p.id.length)) : null;
    rendered[p.id][s] = renderModel(p.boxes(s), p.footprint[0], p.footprint[1], p.heightM + 1, post);
  }
}
// PixelLab buildings + their state raws
const loadState = (o, s) => { const f = join(RAW, 'objects', `${o.raw}-${s}.png`); return existsSync(f) ? f : null; };
for (const o of BUILDINGS) {
  const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) { console.error('missing raw', o.raw); continue; }
  rendered[o.id] = {};
  const done = prepBuilding(o, f);
  const place = (im0) => { const im = crop(im0, alphaBox(im0, 1)), a = footOf(im); return { im, tileOrigin: { x: a.x - (o.footprint[0] - o.footprint[1]) * 32, y: im.h - (o.footprint[0] + o.footprint[1]) * 16 } }; };
  rendered[o.id].done = place(done);
  for (const s of ['scaffold', 'damaged']) { const sf = loadState(o, s); const k = Math.min(1, 400 / done.h, 400 / done.w); rendered[o.id][s] = place(sf ? prepBuilding({ ...o, ground: [...(o.ground ?? []), 'green'], scale: 1 / k, charHoles: s === 'damaged' }, sf) : stateInit(done, s, o.id.length)); } // the state init was the done sprite, shrunk by k to fit pixflux
  const [fw, fh] = o.footprint;
  rendered[o.id].foundation = renderModel(foundation([[0, 0, fw * 2, 0, '-y'], [0, fh * 2, fw * 2, fh * 2, '+y'], [0, 0, 0, fh * 2, '-x'], [fw * 2, 0, fw * 2, fh * 2, '+x']], o.material, o.id.length, 1), fw, fh, 1);
}
// fort: composed on a 10 x 10 footprint: stone wall ring on the line 1..8, corner towers, a gate in the south-west (+y)
// side, the keep in the middle. Components are drawn back to front by their south vertex.
const FORT = { id: 'fort', kind: 'fort', material: 'stone', burnable: false, footprint: [10, 10] };
function composeFort(state) {
  const parts = [];
  const kitFr = (mask) => ({ im: renderKit('stone-wall', state)[mask], tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, fw: 1, fh: 1 });
  const wallCache = {}; const wall = (mask) => (wallCache[mask] ??= kitFr(mask));
  for (const [x, y] of [[1, 1], [8, 1], [1, 8], [8, 8]]) parts.push({ ...rendered['stone-tower'][state], x: x - 1, y: y - 1, fw: 3, fh: 3 });
  for (let t = 3; t <= 6; t++) { parts.push({ ...wall(5), x: t, y: 1, fw: 1, fh: 1 }); parts.push({ ...wall(10), x: 1, y: t, fw: 1, fh: 1 }); parts.push({ ...wall(10), x: 8, y: t, fw: 1, fh: 1 }); }
  parts.push({ ...wall(5), x: 3, y: 8, fw: 1, fh: 1 }); // (7, 8) is the corner tower's
  parts.push({ ...rendered['stone-gate-x'][state], x: 4, y: 7, fw: 3, fh: 3 });
  parts.push({ ...rendered.keep[state], x: 3, y: 2, fw: 4, fh: 4 });
  const fix = parts;
  fix.sort((a, b) => a.x + a.fw + a.y + a.fh - (b.x + b.fw + b.y + b.fh) || a.x - b.x);
  const sx = (x, y) => (x - y) * 32, sy = (x, y) => (x + y) * 16;
  const pos = fix.map((p) => ({ p, X: Math.round(sx(p.x, p.y) - p.tileOrigin.x), Y: Math.round(sy(p.x, p.y) - p.tileOrigin.y) }));
  const x0 = Math.min(...pos.map((q) => q.X)), y0 = Math.min(...pos.map((q) => q.Y)), x1 = Math.max(...pos.map((q) => q.X + q.p.im.w)), y1 = Math.max(...pos.map((q) => q.Y + q.p.im.h));
  const im = blank(x1 - x0, y1 - y0); for (const q of pos) paste(im, q.p.im, q.X - x0, q.Y - y0);
  const box = alphaBox(im, 1);
  return { im: crop(im, box), tileOrigin: { x: -x0 - box.x, y: -y0 - box.y } };
}
rendered.fort = {}; for (const s of STATES) rendered.fort[s] = composeFort(s);
// props (one state)
for (const o of PROPS) { const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) continue; const im = prepBuilding(o, f); const a = footOf(im); rendered[o.id] = { done: { im, tileOrigin: { x: a.x, y: im.h - 32 } } }; }

// sprites + metadata
const all = [...PROC, ...BUILDINGS, FORT, ...PROPS];
for (const o of all) {
  if (!rendered[o.id]) continue; const states = {};
  for (const [s, r] of Object.entries(rendered[o.id])) {
    const sid = `${o.id}-${s}`, a = footOf(r.im);
    const base = Math.min((o.footprint[0] + o.footprint[1]) * 16, r.im.h - 4), metres = +((r.im.h - base) / PPM).toFixed(2); // flat states (a field, a pitched-down camp) draw less than the diamond
    sprites.push({ file: `${sid}.png`, im: r.im, meta: { id: sid, kind: o.kind, file: `${sid}.png`, w: r.im.w, h: r.im.h, metres: Math.max(0.05, metres), basePx: base, anchor: a, tileOrigin: r.tileOrigin, footprint: o.footprint, blocksMovement: s !== 'foundation' && o.kind !== 'farm', building: o.id, state: s, material: o.material, burnable: !!o.burnable, source: o.source ?? 'renderer' } });
    states[s] = sid;
  }
  buildings.push({ id: o.id, kind: o.kind, material: o.material, burnable: !!o.burnable, footprint: o.footprint, ...(o.axis && { axis: o.axis }), ...(o.inline && { inline: o.inline }), ...(o.heightM && { heightM: o.heightM }), states });
}
// palette + write
const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const pal = extendPalette([...G.palette, ...GO.palette], sprites.map((s) => s.im), 64);
for (const s of sprites) writeImage(join(OUT, s.file), snapToPalette(s.im, pal));
const json = {
  pxPerMetre: PPM, tileMetres: 2, borderMax: 0.75,
  note: 'Build-mode art (W-22..W-24). objects[]: one sprite per building state; anchor = foot (bottom centre); tileOrigin = px of the top (north) vertex of the footprint\'s north tile: draw at that tile\'s top vertex minus tileOrigin; metres = height above the footprint (h = metres x 33 + basePx, basePx = (fw + fh) x 16). kits[]: walls and bridges, one sheet per state, frame per piece, tileOrigin = the tile\'s top vertex in every frame; wall frame index = neighbour mask (+x 1, +y 2, -x 4, -y 8; a neighbour is a wall, gate or tower tile); bridge frames = pieces. Towers and gates sit inline: walls run up to their footprint. States: foundation -> scaffold -> done -> damaged. Colours = tiles.json palette + objects.json palette + palette.',
  palette: pal.slice(G.palette.length), kits, buildings, objects: sprites.filter((s) => s.meta).map((s) => s.meta),
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`buildings: ${kits.length} kits, ${buildings.length} buildings, ${json.objects.length} sprites, palette +${pal.length - G.palette.length - GO.palette.length}`);
process.exit(runBuildingsQa().length ? 1 : 0);
