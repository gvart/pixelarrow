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
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette, rgbToHex, hexToRgb, resizeArea, resizeNearest } from '../../art/lib/ops.mjs';
import { runBuildingsQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const RAW = join(PIX, 'buildings/raw'), INITS = join(PIX, 'buildings/inits'), OUT = join(ROOT, 'public/war/buildings');
const PPM = 33, MX = 16, MY = 8, P = 66, FW = 32; // px/m up; px/m across and down along a tile axis; elevation period; face period
const STATES = ['foundation', 'rising', 'scaffold', 'done', 'damaged'];
// construction order and the build progress (labour share) from which each state shows; the view picks by progress
const BUILD_ORDER = ['foundation', 'rising', 'scaffold', 'done'], PROGRESS = { foundation: 0, rising: 0.25, scaffold: 0.6, done: 1 };
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 10007) / 10007;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mul = (c, f) => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f), 255];
const lumOf = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function gradeC(c, g) { if (!g) return c; const l = lumOf(c); return [0, 1, 2].map((k) => clamp((l + (c[k] - l) * g.sat) * g.val)).concat(255); }

// ---- textures: front elevations quilted to period P, squeezed to FW face columns (16 px per m along the axis)
function faceStrip(name, g, P = 66, FW = 32, quilt = true) { // P: elevation period (px at 33 px/m), FW: face px per period
  const R = readImage(join(RAW, 'tex', `${name}.png`)), I = readImage(join(INITS, `${name}.png`)), h = R.h;
  const at = (im, x, y) => { const i = (y * im.w + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]]; };
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  // min-cost vertical seam in the overlap: column k switches from R[P + c] (c < k) to R[c] (c >= k), so the tile's last
  // column runs on into its first one (R[c] continues into R[P] = column 0).
  const lo = quilt ? 36 : 0, hi = quilt ? Math.min(P - 2, R.w - P - 1) : 0, cost = [], back = [];
  for (let y = 0; y < h; y++) {
    cost.push([]); back.push([]);
    for (let k = lo; k <= hi; k++) {
      const c0 = quilt ? d(at(R, P + k, y), at(R, k, y)) : 0;
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
  return { h, w: FW, px: (u, r) => { if (r < 0 || r >= h) return null; const i = ((h - 1 - r) * FW + (((u % FW) + FW) % FW)) * 4; return F.data[i + 3] ? [F.data[i], F.data[i + 1], F.data[i + 2], 255] : null; }, F };
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
        const c = b.mat(face, x, y, z, u, r); if (c) cv.put(px, py, DEPTH(x, y, z), b.lit ? c : mul(c, SHADE[face]));
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
      const c = b.mat('top', x, y, b.z1, Math.floor(x * MX + 1e-6), Math.floor(y * MX + 1e-6)); if (c) cv.put(px, py, DEPTH(x, y, b.z1), b.lit ? c : mul(c, SHADE.top));
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
const rampOf = (F, qs = [0.05, 0.3, 0.55, 0.8, 0.95]) => { const c = []; for (let i = 0; i < F.data.length; i += 4) if (F.data[i + 3]) c.push([F.data[i], F.data[i + 1], F.data[i + 2]]); c.sort((a, b) => lumOf(a) - lumOf(b)); return qs.map((q) => [...c[Math.floor(q * (c.length - 1))], 255]); };
function loadTextures() {
  TEX.palisade = faceStrip('palisade', { sat: 0.75, val: 0.8 });
  TEX.ashlar = faceStrip('ashlar', { sat: 0.7, val: 0.72 }); // stone bridge abutments
  TEX.arches = faceStrip('arches', { sat: 0.7, val: 0.66 });
  TEX.trestle = faceStrip('trestle', { sat: 0.75, val: 0.8 });
  // Greek stone set: 8 m period (264 elevation px -> 128 face px), so the masonry does not repeat every tile
  TEX.cyclo = faceStrip('cyclopean', { sat: 0.72, val: 0.76 }, 264, 128);
  TEX.iso = faceStrip('isodomic', { sat: 0.72, val: 0.8 }, 264, 128);
  TEX.lion = faceStrip('liongate', { sat: 0.72, val: 0.8 }, 132, 64, false);
  const R = readImage(join(INITS, 'rooftiles.png')); // drawn (pixflux turned it into plaid, PROMPTS_ART.md)
  TEX.roof = (u, v) => { const i = ((((v % R.h) + R.h) % R.h) * R.w + (((u % R.w) + R.w) % R.w)) * 4; return gradeC([R.data[i], R.data[i + 1], R.data[i + 2]], { sat: 0.72, val: 0.78 }); };
  TEX.wood = rampOf(TEX.palisade.F, [0.08, 0.3, 0.55, 0.8, 0.95]); TEX.stone = rampOf(TEX.ashlar.F); TEX.lime = rampOf(TEX.cyclo.F);
  TEX.tile = [0.1, 0.35, 0.6, 0.85].map((q) => gradeC(TEX.roof(Math.floor(q * 200), Math.floor(q * 97)), null));
}
const EARTH = [43, 36, 29, 255], STRING = [150, 146, 136, 255], DOORDARK = [20, 17, 15, 255], CHAR = [26, 22, 20, 255], EMBER = [122, 58, 26, 255];
const PAINT = [92, 44, 36, 255]; // Mycenaean red on column shafts and timber bands, dulled
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
// paving: irregular limestone slabs (walks, podium tops, thresholds)
const flags = (face, x, y) => { const S = TEX.lime, row = Math.floor(y * 1.6), xo = x * 1.25 + hash(row & 31, 4) * 0.7, n = Math.floor(xo) * 7 + row; const fx = xo % 1, fy = (y * 1.6) % 1; return fx < 0.08 || fy < 0.1 ? S[0] : mul(S[2 + Math.floor(hash(n & 63, 5) * 2)], 0.92 + 0.12 * hash(Math.floor(x * 16), Math.floor(y * 16), 2)); };
const rough = (face, x, y) => mul(TEX.lime[1 + Math.floor(hash(Math.floor(x * 5), Math.floor(y * 5), 8) * 3)], 0.85 + 0.25 * hash(Math.floor(x * 14), Math.floor(y * 14), 9)); // broken wall tops
const solid = (c) => () => c;
const woodSolid = (i = 2) => (face, x, y, z) => mul(TEX.wood[i], 0.92 + 0.16 * hash(Math.floor(z * 10), Math.floor((x + y) * 6), 3));
const ao = (z) => 0.68 + 0.32 * Math.min(1, z / 0.9); // contact shadow at the foot of a wall
const lightOf = (nx, ny) => 0.55 + 0.45 * Math.max(0, nx * 0.41 + ny * 0.91); // round faces: lit like the +y (1.0) / +x (0.74) faces
// masonry: a texture strip by world position, texture row = height above the box base (+ row0, mod `mod`)
const masonry = (T, { row0 = 0, mod = 0, top = flags } = {}) => (face, x, y, z, u, r) => {
  if (face === 'top') return top ? top(face, x, y) : null;
  const uu = face === '+x' || face === '-x' ? -u - 1 : u; let rr = r + row0; if (mod) rr %= mod;
  const c = T.px(uu, rr); return c && mul(c, ao(z));
};
const rubMat = (k, R = TEX.lime) => (f, x, y, z) => mul(R[Math.min(R.length - 1, 1 + Math.floor(hash(Math.floor(x * 4.5), Math.floor(y * 4.5), k) * (R.length - 1)))], (0.8 + 0.35 * hash(Math.floor(x * 9), Math.floor(y * 9) + Math.floor(z * 9), k + 1)) * (f === 'top' ? 1 : 0.92));
const rectEdges = (x0, y0, x1, y1) => [[x0, y0, x1, y0, '-y'], [x0, y1, x1, y1, '+y'], [x0, y0, x0, y1, '-x'], [x1, y0, x1, y1, '+x']];

// ---- shapes beyond boxes: a grid of 1/16 m columns (round towers, roofs, rubble heaps). fn(cx, cy, i, j) -> box rest | null
function cells(x0, x1, y0, y1, fn, step = 1 / 16) {
  const out = [], nx = Math.round((x1 - x0) / step), ny = Math.round((y1 - y0) / step);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const c = fn(x0 + (i + 0.5) * step, y0 + (j + 0.5) * step, i, j); if (c) out.push({ x0: x0 + i * step, x1: x0 + (i + 1) * step, y0: y0 + j * step, y1: y0 + (j + 1) * step, ...c }); }
  return out;
}
// a cylinder textured by angle (16 px per m round it), lit by its normal; prof(x, y) cuts its top (scaffold, ruin)
function cylinder(cx, cy, R, z0, z1, T, { row0 = 0, mod = 0, top = flags, prof = null, slits = null, paint = null } = {}) {
  const C = 2 * Math.PI * R;
  const mat = (face, x, y, z) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    if (face === 'top') return top ? mul(top(face, x, y), SHADE.top) : null;
    if (d < R - 0.12) return mul(rough(face, x + z, y - z), SHADE[face] ?? 0.8); // broken core (a ruined top's steps)
    const th = Math.atan2(dy, dx); if (slits && slits(th, z)) return DOORDARK;
    let rr = Math.floor((z - z0) * PPM) + row0; if (mod) rr %= mod;
    const c = paint ? mul(paint, 0.9 + 0.1 * Math.cos(th * 9)) : T.px(Math.floor(((th + Math.PI) / (2 * Math.PI)) * C * MX), rr);
    return c && mul(c, lightOf(dx / d, dy / d) * ao(z));
  };
  return cells(cx - R, cx + R, cy - R, cy + R, (x, y) => { if (Math.hypot(x - cx, y - cy) > R) return null; const zt = prof ? Math.min(z1, prof(x, y)) : z1; return zt > z0 ? { z0, z1: zt, mat, lit: true } : null; });
}
// a roof surface z = f(x, y), 0.25 m thick, tiles running down the slope (down(x, y) -> [along the eaves, down the slope]
// in metres), shaded by its slope; holes(x, y) knocks it in (ruins); tex(u, v) -> rgb (default terracotta)
function roof(x0, x1, y0, y1, f, down, { holes = null, tex = TEX.roof, k = 0 } = {}) {
  const e = 0.03, L = [0.3, 0.75, 0.9], ln = Math.hypot(...L);
  const mat = (face, x, y) => {
    const gx = (f(x + e, y) - f(x - e, y)) / (2 * e), gy = (f(x, y + e) - f(x, y - e)) / (2 * e), n = Math.hypot(gx, gy, 1);
    const s = 0.5 + 0.72 * Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) / (n * ln));
    const [u, v] = down(x, y), c = tex(Math.floor(u * PPM), Math.floor(v * PPM)), edge = Math.min(x - x0, x1 - x, y - y0, y1 - y) < 0.08 ? 0.62 : 1;
    return mul([c[0], c[1], c[2], 255], s * edge);
  };
  return cells(x0, x1, y0, y1, (x, y) => (holes && holes(x, y) ? null : { z0: f(x, y) - 0.25, z1: f(x, y), mat, lit: true }));
}
const pyramid = (cx, cy, half, eave, rise) => [(x, y) => eave + rise * (1 - Math.max(Math.abs(x - cx), Math.abs(y - cy)) / half), (x, y) => (Math.abs(x - cx) >= Math.abs(y - cy) ? [y, Math.abs(x - cx)] : [x, Math.abs(y - cy)])];
const cone = (cx, cy, R, eave, rise) => [(x, y) => eave + rise * (1 - Math.hypot(x - cx, y - cy) / R), (x, y) => [Math.atan2(y - cy, x - cx) * R, Math.hypot(x - cx, y - cy) * 1.2]];
const shingles = (u, v) => { const W = TEX.wood, row = Math.floor(v / 9), n = Math.floor((u + row * 5) / 8); return v % 9 > 7 || (u + row * 5) % 8 === 0 ? W[0] : W[1 + Math.floor(hash(n & 63, row & 63, 6) * 3)]; };
// a heap of rubble: blocks on a 0.22 m grid, higher towards the middle
function heap(cx, cy, rx, ry, hm, k, mat, step = 0.22) {
  return cells(cx - rx, cx + rx, cy - ry, cy + ry, (x, y, i, j) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d > 1) return null; const h = hm * (1 - d) * (0.5 + 0.75 * hash(i, j, k)); return h > 0.05 ? { z0: 0, z1: h, mat } : null; }, step);
}
// a thin sloped beam along x or y following z = f (charred rafters), w wide
const beam = (axis, a0, a1, at, w, f, mat) => (axis === 'x' ? cells(a0, a1, at, at + w, (x, y) => ({ z0: f(x, y) - 0.16, z1: f(x, y), mat }), 1 / 16) : cells(at, at + w, a0, a1, (x, y) => ({ z0: f(x, y) - 0.16, z1: f(x, y), mat }), 1 / 16));

// ---- wall kits: frame per neighbour mask (+x 1, +y 2, -x 4, -y 8). Wall centred in the tile, arms to the tile edges.
const KITS = {
  // three tiers, upgraded in place (W-27): palisade (no walk) -> timber rampart (a walk behind a log parapet, burnable) ->
  // Greek stone wall (tall, a wide walk behind a plain parapet). walkM: the walk surface soldiers stand on.
  // W-28: the walk tiers are blob kits (layered): every wall tile is a full 2 x 2 m block to the walk, so a wall two tiles
  // deep has a 4 m walk; parapets (paraH high, para thick) stand on the exposed sides, split into a back and a FRONT layer.
  palisade: { material: 'wood', burnable: true, heightM: 3.0, thick: 0.4, source: 'pixflux 7eb5a5c5 (palisade elevation)' },
  rampart: { material: 'wood', burnable: true, layered: true, walkM: 3.0, paraH: 1.0, para: 0.25, source: 'renderer + palisade elevation' },
  'stone-wall': { material: 'stone', burnable: false, layered: true, walkM: 5.0, paraH: 1.0, para: 0.45, source: 'pixflux 7055aa08 (cyclopean elevation)' },
};
for (const K of Object.values(KITS)) if (K.layered) Object.assign(K, { heightM: K.walkM + K.paraH, thick: 2 });
const KIT_W = 96, KIT_Y0 = 206, KIT_H = KIT_Y0 + 48; // frame 96 x 254 (room either side for scaffolds and rubble), tile top vertex at (48, 206)
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
function palisadeMat() { return (face, x, y, z, u, r) => (face === 'top' ? mul(TEX.wood[0], 1.1) : TEX.palisade.px(face === '+x' || face === '-x' ? -u - 1 : u, r)); }
// plain parapet (no crenels: Greek) along an edge, the same masonry as the face below it (row0 = its rows)
function parapet(e, K, T, row0, prof) {
  const [x0, y0, x1, y1, n] = e, p = K.para;
  const box = n === '+y' ? { x0, x1, y0: y1 - p, y1 } : n === '-y' ? { x0, x1, y0, y1: y0 + p } : n === '+x' ? { x0: x1 - p, x1, y0, y1 } : { x0, x1: x0 + p, y0, y1 };
  const axis = n === '+y' || n === '-y' ? 'x' : 'y';
  const b = { ...box, z0: K.walkM, z1: K.heightM, mat: masonry(T, { row0, top: (f, x, y) => mul(TEX.lime[3], 0.95 + 0.1 * hash(Math.floor((x + y) * 1.7), 3, 7)) }) };
  return prof ? sliced(b, axis, prof) : [b];
}

// state profiles: scaffold = built to ~half height, a ragged course line
const halfProf = (H, k, f = 0.52) => (a) => H * f + 0.16 * Math.floor(hash(Math.floor(a * 1.5), k, 11) * 3); // a course line, ragged per block
// construction stages: rising (~1/3, materials stacked by it), scaffold (~2/3, scaffolding)
const RISE = 0.3, SCAF = 0.62;
// a stack of building stone (or logs) on the ground, ~0.8 x 0.7 m, its NW corner at (x0, y0)
function stack(x0, y0, wood, k = 0) {
  if (wood) return [0, 1, 2].map((i) => ({ x0, x1: x0 + 0.9, y0: y0 + i * 0.22, y1: y0 + i * 0.22 + 0.2, z0: 0, z1: 0.2, mat: woodSolid(1 + (i % 2)) })).concat([{ x0: x0 + 0.05, x1: x0 + 0.95, y0: y0 + 0.11, y1: y0 + 0.31, z0: 0.2, z1: 0.4, mat: woodSolid(3) }, { x0: x0 + 0.05, x1: x0 + 0.95, y0: y0 + 0.33, y1: y0 + 0.53, z0: 0.2, z1: 0.4, mat: woodSolid(2) }]);
  return [[0, 0, 0], [0.42, 0, 0], [0, 0.36, 0], [0.42, 0.36, 0], [0.21, 0.18, 0.3]].map(([dx, dy, z], i) => ({ x0: x0 + dx, x1: x0 + dx + 0.38, y0: y0 + dy, y1: y0 + dy + 0.32, z0: z, z1: z + 0.3, mat: masonry(TEX.cyclo, { row0: 20 + i * 23 + k, top: rough }) }));
}
// wrecked (stone): `edge` x H where pieces meet (every damaged piece, so damaged runs join), collapsing to a deep breach
// mid-tile, ragged per block
// (a breach in every tile repeats as teeth along a run, so: the whole run thrown down to about half height, a ragged
// top of fallen blocks, a shallow dip mid-tile)
const wreckProf = (H, k, per = 1.6, edge = 0.46) => { const h = (i) => hash(i & 15, k, 13) - 0.5; return (a) => { const m = ((a % 2) + 2) % 2, env = Math.min(1, m / 0.35, (2 - m) / 0.35), x = a * per, i = Math.floor(x), f = x - i, sm = f * f * (3 - 2 * f), n = h(i) + (h(i + 1) - h(i)) * sm; return Math.round((H * Math.max(0.05, edge + 0.09 * n * env)) / 0.15) * 0.15; }; }; // smooth noise, whole courses (no 1 px steps)
// wrecked (wood): per log (3 a metre) snapped stumps, half-burnt and standing logs; logs at the tile edges at `edge` x H
const stakeProf = (H, k, edge = 0.62) => (a) => { const m = ((a % 2) + 2) % 2, n = Math.floor(a * 3); if (m < 0.34 || m > 1.66) return H * edge; const q = hash(n & 15, k, 19); return H * (q < 0.4 ? 0.06 + 0.22 * hash(n, k, 20) : q < 0.75 ? 0.38 + 0.25 * hash(n, k, 21) : 0.97); };
function scorch(im, k, strength = 1) { // charred patches and a few embers (wood)
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4; if (!im.data[i + 3]) continue;
    const n = 0.6 * hash(x >> 3, y >> 3, k) + 0.4 * hash(x >> 1, y >> 1, k + 1);
    const f = n < 0.45 * strength ? 0.35 : n < 0.7 * strength ? 0.6 : 0.85;
    for (let c = 0; c < 3; c++) im.data[i + c] = clamp(im.data[i + c] * f);
    if (hash(x, y, k + 2) < 0.006 * strength) im.data.set(EMBER, i);
  }
  return im;
}
// burnt wood: every column's top run charred black with embers, scorched below
function burn(im, k) {
  const { w, h, data: d } = im;
  for (let x = 0; x < w; x++) for (let y = 0, run = -1; y < h; y++) {
    const i = (y * w + x) * 4; if (!d[i + 3]) { run = -1; continue; } run++;
    const f = run < 3 ? 0.22 : run < 8 ? 0.45 : run < 14 ? 0.75 : 1; for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] * f);
    if (run < 3 && hash(x, y, k + 5) < 0.07) d.set(EMBER, i);
  }
  return scorch(im, k, 0.55);
}
// soot on stone: blotches, and the broken tops blackened
function soot(im, k) {
  const { w, h, data: d } = im;
  for (let x = 0; x < w; x++) for (let y = 0, run = -1; y < h; y++) {
    const i = (y * w + x) * 4; if (!d[i + 3]) { run = -1; continue; } run++;
    const n = 0.7 * hash(x >> 4, y >> 4, k) + 0.3 * hash(x >> 1, y >> 1, k + 1);
    const f = (n < 0.33 ? 0.72 : 1) * (run < 3 ? 0.7 : 1); for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] * f);
  }
  return im;
}
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
    if (material === 'stone') for (let a = a0 + 0.05; a < a1 - 0.2; a += 0.55) { // a first course of big rough blocks
      const l = 0.36 + 0.12 * hash(Math.floor(a * 4), k, 4), w = 0.34, hgt = 0.22 + 0.12 * hash(Math.floor(a * 4), k, 5); if (a + l > a1) break;
      const m = (f, x, y, z) => mul(TEX.lime[2 + (hash(Math.floor(a * 8), k, 6) > 0.5)], 0.9 + 0.2 * hash(Math.floor((x + y) * 20), Math.floor(z * 30), 1));
      B.push(ax === 'x' ? { x0: a, x1: a + l, y0: at - w / 2, y1: at + w / 2, z0: 0, z1: hgt, mat: m } : { x0: at - w / 2, x1: at + w / 2, y0: a, y1: a + l, z0: 0, z1: hgt, mat: m });
    }
    for (let a = Math.ceil(a0 / stakeEvery - 1e-6) * stakeEvery + 0.1; a < a1; a += stakeEvery) {
      const s = 0.08, sx = ax === 'x' ? a : at - s / 2, sy = ax === 'x' ? at - s / 2 : a;
      B.push({ x0: sx, x1: sx + s, y0: sy, y1: sy + s, z0: 0, z1: 0.6, mat: woodSolid(2) });
    }
    if (material !== 'stone') B.push(ax === 'x' ? { x0: a0, x1: a1, y0: at - 0.015, y1: at + 0.015, z0: 0.42, z1: 0.45, mat: solid(STRING) } : { x0: at - 0.015, x1: at + 0.015, y0: a0, y1: a1, z0: 0.42, z1: 0.45, mat: solid(STRING) });
  }
  return B;
}
// wreckage at the foot of a wrecked wall piece: rubble heaps and fallen blocks (stone), charred fallen logs (wood).
// u runs along the wall, v across; heaps spill out of the tile a little (the frame has room)
function wreckage(axis, T, k, wood, u0 = 0, u1 = 2, vc = 1) {
  const B = [], a = vc - T / 2, b = vc + T / 2, L = u1 - u0;
  const box = (p, q, r, s, z0, z1, mat) => (axis === 'x' ? { x0: p, x1: q, y0: r, y1: s, z0, z1, mat } : { x0: r, x1: s, y0: p, y1: q, z0, z1, mat });
  if (wood) {
    for (let i = 0; i < 3; i++) { const p = u0 + 0.1 + (L - 1.2) * hash(i, k, 23), len = 0.6 + 0.6 * hash(i, k, 24), v = i % 2 ? b + 0.06 + 0.3 * hash(i, k, 25) : a - 0.34 - 0.2 * hash(i, k, 25); B.push(box(p, Math.min(u1 + 0.3, p + len), v, v + 0.28, 0, 0.24, woodSolid(i % 2))); }
    return B;
  }
  // a continuous talus of fallen stones along both faces (heaps per tile would repeat as bumps along a run)
  const D = 0.95, m = rubMat(k), st = 0.2;
  for (const [v0, sg] of [[b, 1], [a, -1]]) B.push(...(axis === 'x' ? cells(u0, u1, sg > 0 ? v0 : v0 - D, sg > 0 ? v0 + D : v0, (x, y, i, j) => { const t = Math.abs(y - v0) / D, h = 1.0 * (1 - t) ** 1.3 * (0.5 + 0.7 * hash(i, j, k + sg)); return h > 0.05 ? { z0: 0, z1: h, mat: m } : null; }, st) : cells(sg > 0 ? v0 : v0 - D, sg > 0 ? v0 + D : v0, u0, u1, (x, y, i, j) => { const t = Math.abs(x - v0) / D, h = 1.0 * (1 - t) ** 1.3 * (0.5 + 0.7 * hash(j, i, k + sg)); return h > 0.05 ? { z0: 0, z1: h, mat: m } : null; }, st)));
  for (let i = 0; i < 2; i++) { // big fallen blocks
    const p = u0 + 0.15 + (L - 0.9) * hash(i, k, 27), sz = 0.42 + 0.22 * hash(i, k, 28), v = i ? b + 0.12 : a - 0.12 - sz;
    B.push(box(p, p + sz * 1.35, v, v + sz, 0, sz * 0.75, masonry(TEX.cyclo, { row0: 40 + i * 50, top: rough })));
  }
  return B;
}
function kitBoxes(id, mask, state) {
  const K = KITS[id], T = K.thick, rects = wallRects(mask, T), edges = wallEdges(mask, T), wood = K.material === 'wood';
  if (state === 'foundation') return foundation(edges, K.material, mask, 1);
  const H = K.heightM, B = [], mat = palisadeMat(); // the palisade: the walk tiers are blob kits (cellBoxes)
  const prof = state === 'scaffold' ? halfProf(H, mask, SCAF) : state === 'rising' ? halfProf(H, mask, RISE) : state === 'damaged' ? (wood ? stakeProf(H, mask + 7) : wreckProf(H, mask + 7)) : null;
  for (const r of rects) { const b = { ...r, z0: 0, z1: H, mat }; B.push(...(prof ? sliced(b, r.axis, prof) : [b])); }
  if (state === 'scaffold') { // stage on the outward (viewer) side of every run
    const top = H * SCAF + 0.5;
    for (const [x0, y0, x1, y1, n] of edges) if (n === '+y' || n === '+x') { const ax = n === '+y' ? 'x' : 'y'; B.push(...scaffold(ax, ax === 'x' ? x0 : y0, ax === 'x' ? x1 : y1, ax === 'x' ? y0 : x0, 1, top)); }
  }
  if (state === 'damaged') B.push(...wreckage(rects[0].axis, T, mask + 3, wood));
  if (state === 'rising' && (mask === 5 || mask === 10 || mask % 3 === 0)) { const s = 1 + T / 2 + 0.12; B.push(...(rects[0].axis === 'x' ? stack(0.5, s, wood, mask) : stack(s, 0.5, wood, mask))); }
  return B;
}
function renderKit(id, state) {
  return [...Array(16)].map((_, mask) => {
    let im = renderBoxes(kitBoxes(id, mask, state), KIT_W, KIT_H, KIT_W / 2, KIT_Y0);
    if (state === 'damaged') im = KITS[id].material === 'wood' ? burn(im, mask) : soot(im, mask);
    return im;
  });
}

// ---- W-28 blob wall kits (rampart, stone-wall): one frame per (neighbour mask, open sides). A tile is a full 2 x 2 m
// block up to the walk, so a wall two tiles deep has a 4 m walk where two files pass. Connected sides (mask: a wall or
// gate tile of the same walk there) draw no face and no parapet; every other side gets its face and, unless it is open (a
// stair top, a joined tower, a ladder's head), a parapet. A parapet runs on by its thickness past its -x / -y end when
// that side is connected, so the inner corner of an L closes. Boxes tagged layer 'front' (the parapets on the +x / +y sides, nearest
// the viewer) go to the front sheet, drawn after the soldiers on the walk: only their upper bodies show over it.
const SIDES = [[1, '+x'], [2, '+y'], [4, '-x'], [8, '-y']];
const SIDE_EDGE = { '+x': [2, 0, 2, 2, '+x'], '+y': [0, 2, 2, 2, '+y'], '-x': [0, 0, 0, 2, '-x'], '-y': [0, 0, 2, 0, '-y'] };
const COMBOS = []; for (let m = 0; m < 16; m++) for (let o = 0; o < 16; o++) if (!(o & m)) COMBOS.push([m, o]); // 81
const FRAME_OF = [...Array(256)].map((_, i) => { const m = i & 15, o = (i >> 4) & ~m & 15; return COMBOS.findIndex(([a, b]) => a === m && b === o); });
const LK_COLS = 16;
const runAxis = (m) => { const x = (m & 5) === 5 || ((m & 5) && !(m & 10)), y = (m & 10) === 10 || ((m & 10) && !(m & 5)); return y && !x ? 'y' : 'x'; };
// walk paving with a 2 m period (slabs 1 m long in rows of 2/3 m), so it runs on from tile to tile
const flagsP = (face, x, y) => { const S = TEX.lime, ly = (((y % 2) + 2) % 2) * 1.5, row = Math.floor(ly), lx = (((x % 2) + 2) % 2) + hash(row, 4, 4) * 0.9, n = Math.floor(lx) + row * 7; return lx % 1 < 0.07 || ly % 1 < 0.09 ? S[0] : mul(S[2 + Math.floor(hash(n & 63, 5) * 2)], 0.92 + 0.12 * hash(Math.floor(x * 16), Math.floor(y * 16), 2)); };
const capTop = (f, x, y) => mul(TEX.lime[3], 0.95 + 0.1 * hash(Math.floor((x + y) * 1.7), 3, 7));
// a parapet on side n of a 2 m tile, extended by p past its -x / -y end when that side is connected (mask): it closes the
// notch of an inner corner in the tile drawn before it (one end is enough, and it keeps a stair's opening wide)
function paraBox(n, mask, p, z0, z1, mat) {
  const e = (bit) => (mask & bit ? p : 0);
  const b = n === '+y' ? { x0: -e(4), x1: 2, y0: 2 - p, y1: 2 } : n === '-y' ? { x0: -e(4), x1: 2, y0: 0, y1: p } : n === '+x' ? { x0: 2 - p, x1: 2, y0: -e(8), y1: 2 } : { x0: 0, x1: p, y0: -e(8), y1: 2 };
  return { ...b, z0, z1, mat, layer: n[0] === '+' ? 'front' : 'back' };
}
// a parapet (rail) round an S x S footprint, side n, no extension
const paraBoxS = (n, S, p, z0, z1, mat) => ({ ...(n === '+y' ? { x0: 0, x1: S, y0: S - p, y1: S } : n === '-y' ? { x0: 0, x1: S, y0: 0, y1: p } : n === '+x' ? { x0: S - p, x1: S, y0: 0, y1: S } : { x0: 0, x1: p, y0: 0, y1: S }), z0, z1, mat, layer: n[0] === '+' ? 'front' : 'back' });
// a sloped run along x (local u) from u0 to u1 following z = f(u), th thick, between y = v0 and v1 (stringers, ramps, ladders)
const ramp = (u0, u1, v0, v1, f, th, mat, step = 1 / 16) => { const B = []; for (let u = u0; u < u1 - 1e-9; u += step) { const u2 = Math.min(u1, u + step), a = f(u), b = f(u2); B.push({ x0: u, x1: u2, y0: v0, y1: v1, z0: Math.max(0, Math.min(a, b) - th), z1: Math.max(a, b), mat }); } return B; };
// a continuous talus of fallen stones (or two fallen logs) outside the exposed side n of a tile
function talus(n, k, wood) {
  const out = n[0] === '+' ? 1 : -1, alongX = n[1] === 'y', v0 = out > 0 ? 2 : 0, D = 0.95;
  const box = (a0, a1, b0, b1, z0, z1, mat) => (alongX ? { x0: a0, x1: a1, y0: b0, y1: b1, z0, z1, mat } : { x0: b0, x1: b1, y0: a0, y1: a1, z0, z1, mat });
  if (wood) return [0, 1].map((i) => { const a = 0.1 + 0.8 * hash(i, k, 23), v = v0 + out * (0.1 + 0.35 * i); return box(a, Math.min(2.2, a + 0.7 + 0.5 * hash(i, k, 24)), Math.min(v, v + out * 0.26), Math.max(v, v + out * 0.26), 0, 0.24, woodSolid(i)); });
  const m = rubMat(k), [b0, b1] = out > 0 ? [v0, v0 + D] : [v0 - D, v0];
  const B = cells(alongX ? 0 : b0, alongX ? 2 : b1, alongX ? b0 : 0, alongX ? b1 : 2, (x, y, i, j) => { const t = Math.abs((alongX ? y : x) - v0) / D, h = (1 - t) ** 1.3 * (0.5 + 0.7 * hash(i, j, k + out)); return h > 0.05 ? { z0: 0, z1: h, mat: m } : null; }, 0.2);
  const a = 0.2 + 1.1 * hash(1, k, 27), sz = 0.45 + 0.2 * hash(1, k, 28), v = out > 0 ? v0 + 0.1 : v0 - 0.1 - sz;
  B.push(box(a, a + sz * 1.35, v, v + sz, 0, sz * 0.75, masonry(TEX.cyclo, { row0: 40, top: rough })));
  return B;
}
function cellBoxes(id, mask, open, state) {
  const K = KITS[id], wood = K.material === 'wood', W = K.walkM, kk = 7, axis = runAxis(mask); // one damage seed per kit: runs join
  const exposed = SIDES.filter(([b]) => !(mask & b));
  if (state === 'foundation') return foundation(exposed.map(([, n]) => SIDE_EDGE[n]), K.material, mask, 1);
  const pal = palisadeMat(), done = state === 'done';
  const top = done ? (wood ? planks(axis, 5) : flagsP) : wood ? () => mul(TEX.wood[0], 1.1) : rough;
  const mat = wood ? (f, x, y, z, u, r) => (f === 'top' ? top(f, x, y) : r % 22 < 3 ? mul(TEX.wood[0], 0.9) : pal(f, x, y, z, u, (r % 60) + 12)) : masonry(TEX.cyclo, { top });
  const body = { x0: 0, x1: 2, y0: 0, y1: 2, z0: 0, z1: W, mat, skip: new Set(SIDES.filter(([b]) => mask & b).map(([, n]) => n)) };
  const prof = state === 'scaffold' ? halfProf(W, kk, SCAF) : state === 'rising' ? halfProf(W, kk, RISE) : state === 'damaged' ? (wood ? stakeProf(W, kk) : wreckProf(W, kk)) : null;
  const B = prof ? sliced(body, axis, prof) : [body];
  if (done) {
    const pm = wood ? (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.wood[0], 1.1) : pal(f, x, y, z, u, palRow(r, K.paraH))) : masonry(TEX.cyclo, { row0: Math.round(W * PPM), top: capTop });
    for (const [b, n] of exposed) if (!(open & b)) B.push(paraBox(n, mask, K.para, W, W + K.paraH, pm));
  }
  if (state === 'scaffold') for (const [, n] of exposed) if (n[0] === '+') B.push(...scaffold(n === '+y' ? 'x' : 'y', 0, 2, 2, 1, W * SCAF + 0.5));
  if (state === 'damaged') for (const [, n] of exposed) B.push(...talus(n, kk + 3, wood));
  if (state === 'rising' && hash(mask, 3, 1) < 0.5) { const n = exposed.find(([, s]) => s[0] === '+')?.[1]; if (n) B.push(...(n === '+y' ? stack(0.5, 2.12, wood, mask) : stack(2.12, 0.5, wood, mask))); }
  return B;
}
// the post that closes a back-facing inner corner (W-28): where a tile's -x and -y sides join walls but its -x -y diagonal
// is open, the -y parapet of the tile to -x and the -x parapet of the tile to -y both end at its NW corner, short of each
// other by the parapet's thickness (the frames see no diagonals); the view draws this post there, over the tile's back
function postBoxes(id) {
  const K = KITS[id], W = K.walkM, pal = palisadeMat();
  const pm = K.material === 'wood' ? (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.wood[0], 1.1) : pal(f, x, y, z, u, palRow(r, K.paraH))) : masonry(TEX.cyclo, { row0: Math.round(W * PPM), top: capTop });
  return [{ x0: 0, x1: K.para, y0: 0, y1: K.para, z0: W, z1: W + K.paraH, mat: pm }];
}
const layerSplit = (B, w, h, ox, oy) => [renderBoxes(B.filter((b) => b.layer !== 'front'), w, h, ox, oy), renderBoxes(B.filter((b) => b.layer === 'front'), w, h, ox, oy)];
const LK = (id) => { const y0 = Math.ceil(KITS[id].heightM * PPM) + 34; return { w: 96, y0, h: y0 + 60 }; };
function renderLayered(id, state) {
  const g = LK(id), cache = new Map(), back = [], front = [];
  for (const [m, o] of COMBOS) {
    const key = state === 'done' ? `${m},${o}` : `${m}`; // only the done state has parapets to open
    if (!cache.has(key)) {
      let [bk, fr] = layerSplit(cellBoxes(id, m, o, state), g.w, g.h, g.w / 2, g.y0);
      if (state === 'damaged') bk = KITS[id].material === 'wood' ? burn(bk, m) : soot(bk, m);
      cache.set(key, [bk, fr]);
    }
    const [b, f] = cache.get(key); back.push(b); front.push(f);
  }
  return { back, front };
}
const over = (a, b) => paste({ w: a.w, h: a.h, data: new Uint8Array(a.data) }, b, 0, 0);
// 16 frames by neighbour mask, layers merged (the fort, previews of the old kind)
function kitFrames16(id, state) { if (!KITS[id].layered) return renderKit(id, state); const L = renderLayered(id, state); return [...Array(16)].map((_, m) => over(L.back[FRAME_OF[m]], L.front[FRAME_OF[m]])); }
// a sheet of frames in rows of `cols`
function gridSheet(ims, fw, fh, cols) { const sheet = blank(fw * Math.min(cols, ims.length), fh * Math.ceil(ims.length / cols)); ims.forEach((im, i) => paste(sheet, im, (i % cols) * fw, Math.floor(i / cols) * fh)); return sheet; }

// ---- stairs (W-28): player-placed flights 1 tile wide and 2 or 3 long, set square against a wall's face; the wall tile
// at the high end opens its parapet on that side (open bit). Pieces <axis><rise +/-><length>: x+3 = 3 x 1 tiles rising
// towards +x, the wall tile beyond its +x end. The top step is flush with the walk at the wall face. A unit on a stair
// stands at z = topM x (distance from the low end / length). Stone: a solid flight of steps; wood: a ramp-stair (plank
// ramp with cleats on two stringers, posts under the high end).
const STAIR_PIECES = ['x+2', 'x-2', 'y+2', 'y-2', 'x+3', 'x-3', 'y+3', 'y-3'];
const STAIRS = {
  'stair-stone': { material: 'stone', burnable: false, wall: 'stone-wall', source: 'renderer + isodomic elevation' },
  'stair-wood': { material: 'wood', burnable: true, wall: 'rampart', source: 'renderer + palisade elevation' },
};
const ST_W = 240, ST_X0 = 120, ST_Y0 = 230, ST_H = ST_Y0 + 92;
function stairBoxes(id, piece, state, k) {
  const S = STAIRS[id], walk = KITS[S.wall].walkM, stone = S.material === 'stone';
  const axis = piece[0], up = piece[1] === '+', L = 2 * Number(piece[2]);
  // built along x (u, rising to +u) with the visible side at y = 2 (v), then placed
  const M = (b) => { const [a0, a1] = up ? [b.x0, b.x1] : [L - b.x1, L - b.x0]; return axis === 'x' ? { ...b, x0: a0, x1: a1 } : { ...b, x0: b.y0, x1: b.y1, y0: a0, y1: a1 }; };
  if (state === 'foundation') return foundation(rectEdges(0, 0.1, L, 1.9), S.material, k, 1).map(M);
  const cut = { rising: RISE, scaffold: SCAF }[state] ?? 1, top = walk * cut, dmg = state === 'damaged', out = [];
  if (stone) {
    const n = Math.ceil(walk / 0.3), run = L / n;
    const tread = (f, x, y) => mul(TEX.lime[3], 0.95 + 0.1 * hash(Math.floor(x * 5), Math.floor(y * 5), 6));
    const m = masonry(TEX.iso, { mod: 180, top: state === 'done' ? tread : rough });
    for (let i = 0; i < n; i++) { const z = (i + 1) * (walk / n); if (z > top + 1e-6) break; out.push({ x0: i * run, x1: (i + 1) * run, y0: 0.1, y1: 1.9, z0: 0, z1: dmg && i > n * 0.5 ? Math.min(z, walk * (0.35 + 0.2 * hash(i, k, 3))) : z, mat: m }); }
    if (dmg) out.push(...cells(0, L, 1.9, 2.8, (x, y, i, j) => { const hh = 0.7 * (1 - (y - 1.9) / 0.9) * (0.5 + 0.7 * hash(i, j, k)); return hh > 0.05 ? { z0: 0, z1: hh, mat: rubMat(k) } : null; }, 0.2));
    if (state === 'scaffold') out.push(...scaffold('x', 0, L, 1.9, 1, top + 0.3));
    if (state === 'rising') out.push(...stack(0.3, 2.1, false, k));
  } else {
    const sl = (u) => (walk * u) / L, uEnd = L * cut, W1 = woodSolid(1), deck = planks(axis, 4);
    const strs = [[0.15, 0.32], [1.68, 1.85]];
    if (state === 'rising') { for (const [v0, v1] of strs) out.push({ x0: 0.2, x1: L - 0.3, y0: v0 + 2.1, y1: v1 + 2.1, z0: 0, z1: 0.18, mat: W1 }); out.push(...stack(0.4, 2.6, true, k)); }
    else {
      for (const [v0, v1] of strs) out.push(...ramp(0, uEnd, v0, v1, sl, 0.32, W1));
      const holes = (u) => dmg && hash(Math.floor(u / 0.5), k, 5) < 0.35;
      out.push(...ramp(0, state === 'scaffold' ? uEnd * 0.5 : uEnd, 0.32, 1.68, sl, 0.09, deck).filter((b) => !holes(b.x0)));
      if (state !== 'scaffold') for (let u = 0.3; u < uEnd - 0.2; u += 0.42) if (!holes(u)) out.push({ x0: u, x1: u + 0.09, y0: 0.32, y1: 1.68, z0: sl(u), z1: sl(u + 0.09) + 0.07, mat: woodSolid(3) });
      if (uEnd >= L - 0.35) for (const [v0] of strs) out.push({ x0: L - 0.32, x1: L - 0.15, y0: v0, y1: v0 + 0.17, z0: 0, z1: dmg && v0 > 1 ? walk * 0.45 : walk - 0.05, mat: W1 });
      for (const [v0] of strs) out.push({ x0: L / 2, x1: L / 2 + 0.16, y0: v0, y1: v0 + 0.17, z0: 0, z1: sl(L / 2) - 0.05, mat: W1 });
      if (dmg) out.push({ x0: 0.4, x1: 1.9, y0: 2.1, y1: 2.4, z0: 0, z1: 0.2, mat: woodSolid(0) });
    }
  }
  return out.map(M);
}

// ---- ladders (W-28): a 1 x 1 piece leaning on the face of the tile on its side (n = -y, e = +x, s = +y, w = -x): up to
// a wall's parapet top (attackers' ladders) or to a wood tower's platform (its way up: the tower opens its rail there).
const LADDER_TARGETS = { rampart: KITS.rampart.heightM + 0.25, 'stone-wall': KITS['stone-wall'].heightM + 0.25, 'tower-wood': KITS.rampart.walkM + 0.8 };
const LADDER_PIECES = Object.keys(LADDER_TARGETS).flatMap((t) => ['n', 'e', 's', 'w'].map((s) => `${t}-${s}`));
const LD_W = 96, LD_Y0 = Math.ceil(6.4 * PPM) + 20, LD_H = LD_Y0 + 56;
function ladderBoxes(piece, state, k) {
  const side = piece.slice(-1), T = LADDER_TARGETS[piece.slice(0, -2)], d = Math.min(1.8, Math.max(0.8, T * 0.26)), uf = 2 - d;
  // built with the face at u = 2 (x), across v (y); then turned to its side
  const M = (b) => (side === 'e' ? b : side === 'w' ? { ...b, x0: 2 - b.x1, x1: 2 - b.x0 } : side === 's' ? { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : { ...b, x0: b.y0, x1: b.y1, y0: 2 - b.x1, y1: 2 - b.x0 });
  const W1 = woodSolid(1), W3 = woodSolid(3), dmg = state === 'damaged';
  const lying = (n, u0 = 0.2, u1 = 1.9) => { const B = [[0.55, 0.65], [1.15, 1.25]].map(([v0, v1]) => ({ x0: u0, x1: u1, y0: v0, y1: v1, z0: 0, z1: 0.09, mat: W1 })); for (let i = 0; i < n; i++) B.push({ x0: u0 + 0.15 + i * 0.3, x1: u0 + 0.22 + i * 0.3, y0: 0.6, y1: 1.2, z0: 0.06, z1: 0.12, mat: W3 }); return B; };
  if (state !== 'done' && state !== 'damaged') return lying({ foundation: 0, rising: 2, scaffold: 5 }[state]).map(M); // made on the ground, then raised
  const top = dmg ? T * 0.45 : T, zat = (u) => (T * (u - uf)) / d, out = [];
  for (const [v0, v1] of [[0.66, 0.77], [1.23, 1.34]]) out.push(...ramp(uf, uf + (d * top) / T, v0, v1, zat, 0.16, W1, 1 / 32));
  for (let z = 0.3; z < top - 0.1; z += 0.33) { const u = uf + (d * z) / T; out.push({ x0: u - 0.04, x1: u + 0.05, y0: 0.7, y1: 1.3, z0: z - 0.05, z1: z + 0.04, mat: W3 }); }
  if (dmg) out.push(...lying(3, 0.05, 1.1).map((b) => ({ ...b, y0: b.y0 + 0.5, y1: b.y1 + 0.5 }))); // the top half lies broken by it
  return out.map(M);
}

// ---- towers (W-28): placed freely, 2 x 2 tiles, flush with the footprint; the platform is at the walk height of the
// tier (stone: the stone wall's 5 m, wood: the rampart's 3 m), so a wall walk placed against a side joins it level. Frame
// per open mask (sides joined to a walk, or with a ladder: no parapet / rail there); layers as the walls. Stone: solid,
// a door at ground level (on the first side of +y, +x, -x, -y that is not open), the internal stair coming out in a
// little roofed stair-house on the back corner of the platform. Wood: four posts with braces, a plank platform, a log
// rail, a shingle roof on the posts (front layer, over the men), reached by a ladder (ladder piece tower-wood-*).
const TOWERS = {
  'tower-stone': { material: 'stone', burnable: false, wall: 'stone-wall', heightM: 7.5, source: 'renderer + cyclopean / isodomic elevations' },
  'tower-wood': { material: 'wood', burnable: true, wall: 'rampart', heightM: 7.1, source: 'renderer + palisade elevation' },
};
const TW_W = 176, TW_X0 = 88, TW_Y0 = Math.ceil(8.2 * PPM) + 30, TW_H = TW_Y0 + 128 + 36;
const SIDE_BIT = Object.fromEntries(SIDES.map(([b, n]) => [n, b]));
const DOOR = { r: 0.62, spring: 1.6, frame: 0.2 }; // the stone tower's arched door: half width, arch springing height, arch ring (m)
function stoneTowerBoxes(state, open = 0, k = 1) {
  const K = KITS['stone-wall'], W = K.walkM, S = 4, socle = 1.3;
  const door = ['+y', '+x', '-x', '-y'].find((n) => !(open & SIDE_BIT[n])) ?? '+y';
  const st = { '+y': { x0: 1.15, x1: 2.85, y0: S, y1: S + 0.4 }, '+x': { x0: S, x1: S + 0.4, y0: 1.15, y1: 2.85 }, '-x': { x0: -0.4, x1: 0, y0: 1.15, y1: 2.85 }, '-y': { x0: 1.15, x1: 2.85, y0: -0.4, y1: 0 } }[door];
  const step = { ...st, z0: 0, z1: 0.17, mat: masonry(TEX.iso, { row0: 30, top: flagsP }) }; // the threshold step, laid first
  if (state === 'foundation') return [...foundation(rectEdges(0.05, 0.05, S - 0.05, S - 0.05), 'stone', k, 1.3), step];
  const cyc = masonry(TEX.cyclo, { row0: 6 }), iso = masonry(TEX.iso, { mod: 180, top: state === 'done' ? flagsP : rough });
  const mat = (f, x, y, z, u, r) => {
    if (f !== 'top') {
      const a = along(f, x, y), ad = Math.abs(a - 2);
      if (f === door) { // an arched door: a limestone arch of voussoirs round two shut oak leaves with iron bands and studs
        const ar = z > DOOR.spring ? Math.hypot(ad, z - DOOR.spring) : ad, inDoor = ar < DOOR.r, inArch = ar < DOOR.r + DOOR.frame && z < DOOR.spring + DOOR.r + DOOR.frame;
        if (inDoor) {
          if (DOOR.r - ar < 0.07 && (z > DOOR.spring || a < 2)) return DOORDARK; // the reveal's shadow under the arch and on the lit jamb
          if (ad < 0.035) return DOORDARK; // the meeting of the leaves
          if (Math.abs(z - 0.45) < 0.055 || Math.abs(z - 1.45) < 0.055) return (Math.floor(a * 9) + Math.floor(z * 9)) % 3 ? mul(TEX.wood[0], 0.75) : mul(TEX.lime[1], 0.8); // iron bands, studs
          const p = Math.floor((a - 2) * 6.5 + 20);
          if (((a - 2) * 6.5 + 20) % 1 < 0.14) return mul(TEX.wood[0], 0.9); // plank seams
          return mul(TEX.wood[p % 2 ? 1 : 2], 0.9 + 0.14 * hash(p, Math.floor(z * 5), 5));
        }
        if (inArch) {
          const th = z > DOOR.spring ? Math.atan2(z - DOOR.spring, a - 2) : (a < 2 ? Math.PI : 0), n = z > DOOR.spring ? Math.floor((th / Math.PI) * 7) : Math.floor(z * 2.2);
          const seam = z > DOOR.spring ? ((th / Math.PI) * 7) % 1 < 0.12 : (z * 2.2) % 1 < 0.1;
          return seam ? mul(TEX.lime[1], 0.75) : mul(TEX.lime[3], 0.86 + 0.14 * hash(n, a < 2 ? 1 : 2, 3));
        }
      }
      for (const q of [0.8, 3.2]) if (Math.abs(a - q) < 0.07 && z > 2.9 && z < 3.8) return DOORDARK; // arrow slits
      if (z < socle) return cyc(f, x, y, z, u, r);
    }
    return iso(f, x, y, z, u, r);
  };
  const body = { x0: 0, x1: S, y0: 0, y1: S, z0: 0, z1: W, mat }, B = [step];
  if (state === 'done') {
    B.push(body);
    const pm = masonry(TEX.iso, { row0: Math.round(W * PPM), mod: 180, top: capTop });
    for (const [b, n] of SIDES) if (!(open & b)) B.push(paraBoxS(n, S, K.para, W, W + K.paraH, pm));
    const sh = { x0: 0.5, x1: 1.85, y0: 0.5, y1: 1.85, z0: W, z1: W + 1.9 }; // the stair-house over the internal stair
    B.push({ ...sh, mat: (f, x, y, z, u, r) => (f === '+y' && x > 0.85 && x < 1.5 && z < W + 1.65 ? DOORDARK : iso(f, x, y, z, u, r)) });
    const [rf, rd] = pyramid(1.175, 1.175, 0.95, W + 1.9, 0.55); B.push(...roof(0.225, 2.125, 0.225, 2.125, rf, rd));
  } else if (state === 'rising') {
    B.push(...sliced(body, 'x', (a) => socle + halfProf(W - socle, k, 0.2)(a)), ...stack(1.0, S + 0.1, false, k), ...stack(S + 0.1, 1.2, false, k + 3));
  } else if (state === 'scaffold') {
    B.push(...sliced(body, 'x', (a) => socle + halfProf(W - socle, k, SCAF)(a)));
    const top = socle + (W - socle) * SCAF + 0.5; B.push(...scaffold('x', 0, S, S, 1, top), ...scaffold('y', 0, S, S, 1, top));
  } else { // wrecked: broken off unevenly, the stair-house gone, rubble at its foot
    B.push(...sliced(body, 'x', (a) => socle + (W - socle) * (0.3 + 0.35 * hash(Math.floor(a * 1.2), k, 3) * (a > 2 ? 1 : 0.7))));
    B.push(...heap(2.6, S + 0.15, 1.3, 0.55, 0.85, k + 40, rubMat(k)), ...heap(S + 0.15, 1.6, 0.55, 1.2, 0.7, k + 41, rubMat(k + 1)), ...heap(1.3, S + 0.05, 0.7, 0.4, 0.4, k + 42, rubMat(k + 2, TEX.tile)));
  }
  return B;
}
function woodTowerBoxes(state, open = 0, k = 2) {
  const P = KITS.rampart.walkM, S = 4, R = 2.9, pal = palisadeMat(), W1 = woodSolid(1), W2 = woodSolid(2);
  if (state === 'foundation') return foundation(rectEdges(0.1, 0.1, S - 0.1, S - 0.1), 'wood', k, 0.66);
  const q0 = 0.1, ps = 0.3, q1 = S - q0 - ps, posts = [[q0, q0], [q1, q0], [q0, q1], [q1, q1]], dmg = state === 'damaged', B = [];
  const post = (x, y, z0, z1, layer = 'back') => ({ x0: x, x1: x + ps, y0: y, y1: y + ps, z0, z1, mat: W1, layer });
  const plane = (n, t) => (n === '+y' || n === '+x' ? [q1 + ps - t, q1 + ps] : [q0, q0 + t]);
  const girt = (n, z) => { const [c0, c1] = plane(n, 0.14); return { ...(n[1] === 'y' ? { x0: q0, x1: q1 + ps, y0: c0, y1: c1 } : { x0: c0, x1: c1, y0: q0, y1: q1 + ps }), z0: z, z1: z + 0.18, mat: W2 }; };
  const brace = (n, z0, z1, flip) => { // a diagonal board in the side's plane, post to post
    const a0 = q0 + ps, a1 = q1, f = (a) => z0 + ((flip ? a1 - a : a - a0) / (a1 - a0)) * (z1 - z0), [c0, c1] = plane(n, 0.1);
    return ramp(a0, a1, 0, 1, f, 0.17, W2).map((b) => (n[1] === 'y' ? { ...b, y0: c0, y1: c1 } : { ...b, x0: c0, x1: c1, y0: b.x0, y1: b.x1 }));
  };
  const sides = ['+x', '+y', '-x', '-y'];
  if (state === 'rising') { for (const [x, y] of posts) B.push(post(x, y, 0, 1.7)); for (const n of sides) B.push(girt(n, 0.2)); B.push(...stack(0.6, S + 0.1, true, k), ...stack(S + 0.1, 0.8, true, k)); return B; }
  if (state === 'scaffold') {
    for (const [x, y] of posts) B.push(post(x, y, 0, P + R));
    for (const n of sides) B.push(girt(n, 0.2), girt(n, P - 0.45), ...brace(n, 0.38, P - 0.45, n[0] === '-'));
    B.push({ x0: 0, x1: S / 2, y0: 0, y1: S, z0: P - 0.22, z1: P, mat: planks('x', 6) });
    return B;
  }
  for (const [i, [x, y]] of posts.entries()) { const hi = dmg ? [P + R, P * 0.55, P + 0.6, P * 0.4][i] : P + R; B.push(post(x, y, 0, Math.min(hi, P))); if (hi > P) B.push(post(x, y, P, hi, x + y > 1 ? 'front' : 'back')); }
  for (const n of sides) { B.push(girt(n, 0.2)); if (!dmg || n[0] === '-') B.push(girt(n, P - 0.45), ...brace(n, 0.38, P - 0.45, false), ...brace(n, 0.38, P - 0.45, true)); }
  const pl = { x0: 0, x1: S, y0: 0, y1: S, z0: P - 0.22, z1: P, mat: planks('x', 6) };
  if (dmg) { B.push({ ...pl, x1: S * 0.55, y1: S * 0.6 }, ...wreckage('x', 0.4, k + 9, true, 0, S, S - 0.4), ...wreckage('y', 0.4, k + 11, true, 0, S, S - 0.4)); return B; }
  B.push(pl);
  const rm = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.wood[0], 1.1) : pal(f, x, y, z, u, palRow(r, 1.0)));
  for (const [b, n] of SIDES) if (!(open & b)) B.push(paraBoxS(n, S, 0.14, P, P + 1.0, rm));
  const [f, d] = pyramid(S / 2, S / 2, S / 2 + 0.3, P + R, 1.1); B.push(...roof(-0.3, S + 0.3, -0.3, S + 0.3, f, d, { tex: shingles }).map((b) => ({ ...b, layer: 'front' })));
  return B;
}
const TOWER_BOXES = { 'tower-stone': stoneTowerBoxes, 'tower-wood': woodTowerBoxes };
function renderTower(id, state) {
  const cache = new Map(), back = [], front = [];
  for (let o = 0; o < 16; o++) {
    const key = state === 'done' || TOWERS[id].material === 'stone' ? o : 0; // a stone tower's door (and its threshold) moves with the open sides
    if (!cache.has(key)) {
      let [bk, fr] = layerSplit(TOWER_BOXES[id](state, o), TW_W, TW_H, TW_X0, TW_Y0);
      if (state === 'damaged') bk = TOWERS[id].material === 'wood' ? burn(bk, 2) : soot(bk, 1);
      cache.set(key, [bk, fr]);
    }
    const [b, f] = cache.get(key); back.push(b); front.push(f);
  }
  return { back, front };
}

// ---- the round stone tower (2 x 2 tiles, 4 m): the fort's corner towers. A cyclopean socle, an ashlar shaft with arrow
// slits, an upper chamber with shuttered ports, a cornice and a low conical terracotta roof. Model in metres from the
// footprint's NW corner.
const TW = { S: 4, socle: 1.5, H: 7.2 }; // stocky, low-pitched roofs: Greek, not a castle
function rdTowerBoxes(state, k = 5) {
  const { S, socle, H } = TW, c = S / 2, R = 1.75;
  const slits = (th, z) => [Math.PI / 2, 0, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4].some((a) => Math.abs(th - a) < 0.04) && ((z > 2.3 && z < 3.3) || (z > 3.8 && z < 4.7));
  if (state === 'foundation') return [...cells(0, S, 0, S, (x, y) => { const d = Math.hypot(x - c, y - c); return Math.abs(d - R - 0.05) < 0.18 ? { z0: 0, z1: 0.2 + 0.1 * hash(Math.floor(Math.atan2(y - c, x - c) * 6), k, 4), mat: rubMat(k) } : null; }, 1 / 8)];
  const B = cylinder(c, c, R + 0.13, 0, socle, TEX.cyclo, { row0: 6, top: rough });
  if (state === 'done') {
    B.push(...cylinder(c, c, R, socle, H, TEX.iso, { mod: 180, slits: (th, z) => slits(th, z) || ([Math.PI / 3, (2 * Math.PI) / 3].some((a) => Math.abs(th - a) < 0.12) && z > 5.9 && z < 6.65) }));
    B.push(...cylinder(c, c, R + 0.15, H, H + 0.22, TEX.iso, { row0: 3 }));
    const [f, d] = cone(c, c, R + 0.42, H + 0.22, 1.1); B.push(...roof(c - R - 0.42, c + R + 0.42, c - R - 0.42, c + R + 0.42, (x, y) => (Math.hypot(x - c, y - c) > R + 0.42 ? -9 : f(x, y)), d, { holes: (x, y) => Math.hypot(x - c, y - c) > R + 0.42 }));
  } else if (state === 'rising') {
    B.push(...cylinder(c, c, R, socle, H, TEX.iso, { mod: 180, top: rough, prof: (x) => socle + halfProf(H - socle, k, 0.2)(x) }), ...stack(1.0, S - 0.1, false, k), ...stack(S - 0.05, 1.2, false, k + 3));
  } else if (state === 'scaffold') {
    B.push(...cylinder(c, c, R, socle, H, TEX.iso, { mod: 180, slits, top: rough, prof: (x) => socle + halfProf(H - socle, k, SCAF)(x) }));
    const top = socle + (H - socle) * SCAF + 0.5; B.push(...scaffold('x', 0.4, S - 0.4, c + R, 1, top), ...scaffold('y', 0.4, S - 0.4, c + R, 1, top));
  } else {
    B.push(...cylinder(c, c, R, socle, H, TEX.iso, { mod: 180, slits, top: rough, prof: (x, y) => socle + (H - socle) * (0.3 + 0.35 * hash(Math.floor((Math.atan2(y - c, x - c) + 4) * 1.1), k, 3) * (x + y > S ? 0.7 : 1)) }));
    const ch = woodSolid(0); B.push({ x0: 1.4, x1: 1.54, y0: 1.6, y1: 1.74, z0: 4, z1: H * 0.85, mat: ch });
    B.push(...heap(c + 0.5, S + 0.1, 1.3, 0.55, 0.85, k + 40, rubMat(k)), ...heap(S + 0.1, c - 0.3, 0.55, 1.2, 0.7, k + 41, rubMat(k + 1)), ...heap(c - 0.8, S, 0.7, 0.4, 0.4, k + 42, rubMat(k + 2, TEX.tile)));
  }
  return B;
}

// ---- gates: 2 tiles along the wall line (the sim's), 4 m: a 2.8 m opening. Stone: the Lion Gate (monolithic jambs, a
// massive lintel, the relieving triangle with its relief), its block 1.7 m deep; wood: two heavy posts, a beam with a
// fighting walk, two log leaves. Modelled along u (the wall axis) / v (across), then mapped. state 'open': leaves swung in.
// opt (2-deep variants, gate2Boxes): leaves false = a passage without doors; sides: which faces across the wall ('-' / '+'
// along v) keep their parapets / rails.
function gateBoxes(material, axis, state, k = 3, opt = {}) {
  const withLeaves = opt.leaves ?? true, sides = opt.sides ?? ['-', '+'];
  const stone = material === 'stone', L = 4, out = [];
  const map = (b) => (axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  const add = (b) => out.push(map(b)), uv = (b) => map({ ...b, u0: b.x0, u1: b.x1, v0: b.y0, v1: b.y1 });
  const front = (face) => (axis === 'x' ? face === '+y' || face === '-y' : face === '+x' || face === '-x');
  const ua = (face, x, y) => { const a = axis === 'x' ? x : y; return axis === 'x' ? a : L - a; }; // left to right as seen
  const v0 = stone ? 0.05 : 0.7, v1 = stone ? 1.95 : 1.3, o0 = stone ? 0.6 : 0.55, o1 = L - o0;
  if (state === 'foundation') return foundation(rectEdges(0, v0, L, v1), material, k, stone ? 1.3 : 1).map((b) => (axis === 'x' ? b : { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  const half = state === 'scaffold' || state === 'rising', low = state === 'rising', dmg = state === 'damaged', open = state === 'open';
  const doorMat = (f, x, y, z) => { const a = (axis === 'x' ? x : y) + (axis === 'x' ? y : x), n = Math.floor(a * 3.3); if ((z > 0.8 && z < 0.92) || (z > 2.3 && z < 2.42)) return mul(TEX.wood[0], 1.2); if (stone && (z * 4) % 1 < 0.12 && n % 2) return [96, 78, 52, 255]; return n % 2 ? TEX.wood[1] : TEX.wood[2]; };
  const hinge = stone ? 1.45 : 1.3, dz = stone ? 3.2 : 3.0;
  const ironL = opt.iron ? ironLeaf(axis) : null; // Fortifier: iron-bound leaves (riveted plates over the timber)
  const leaves = () => {
    if (!withLeaves) return;
    if (open) { add({ u0: o0, u1: o0 + 0.14, v0: hinge - (o1 - o0) / 2, v1: hinge, z0: 0, z1: dz, mat: ironL ?? doorMat }); add({ u0: o1 - 0.14, u1: o1, v0: hinge - (o1 - o0) / 2, v1: hinge, z0: 0, z1: dz, mat: ironL ?? doorMat }); }
    else add({ u0: o0, u1: o1, v0: hinge - 0.14, v1: hinge, z0: 0, z1: dz, mat: (f, x, y, z, u, r) => (Math.abs((axis === 'x' ? x : y) - L / 2) < 0.03 ? DOORDARK : ironL ? ironL(f, x, y, z) : stone ? doorMat(f, x, y, z) : f === 'top' ? CHAR : palisadeMat()(f, x, y, z, u, palRow(r, dz))) });
  };
  if (stone) {
    const passH = 3.2, lin = 4.1, walk = 5.0, top = 5.97, cyc = masonry(TEX.cyclo, { top: rough });
    const lionMat = (face, x, y, z, u, r) => { if (face === 'top') return dmg || half ? rough(face, x, y) : flags(face, x, y); if (!front(face)) return cyc(face, x, y, z, u, r); const c = TEX.lion.px(Math.floor(ua(face, x, y) * MX), Math.floor(z * PPM)); return c ? mul(c, ao(z)) : cyc(face, x, y, z, u, r); };
    add({ u0: o0, u1: o1, v0, v1, z0: 0, z1: 0.06, mat: (f, x, y) => flags(f, x, y) }); // threshold
    if (half) { // jambs set, the lintel waits on a timber centring
      for (const [a, b] of [[0, o0], [o1, L]]) out.push(...sliced(map({ u0: a, u1: b, v0, v1, z0: 0, z1: walk, mat: lionMat }), axis, (s) => (low ? 1.2 + 0.3 * hash(Math.floor(s * 3), k, 8) : passH)));
      if (low) { out.push(...stack(0.4, 1.95, false, k).map(uv), ...stack(2.6, 1.95, false, k + 5).map(uv)); return out; }
      for (const a of [o0 + 0.1, o1 - 0.25]) add({ u0: a, u1: a + 0.15, v0: 0.9, v1: 1.05, z0: 0, z1: passH, mat: woodSolid(2) });
      add({ u0: o0, u1: o1, v0: 0.85, v1: 1.1, z0: passH - 0.2, z1: passH, mat: planks('x', 4) });
      out.push(...scaffold(axis, 0, L, axis === 'x' ? v1 : v1, 1, 2.9));
      return out;
    }
    const jamb = (a, b, zt) => { const bx = { u0: a, u1: b, v0, v1, z0: 0, z1: zt, mat: lionMat }; out.push(...(dmg ? sliced(map(bx), axis, (s) => zt * (0.55 + 0.3 * hash(Math.floor(s * 3), k, a > 1 ? 5 : 6))) : [map(bx)])); };
    if (!dmg) {
      jamb(0, o0, lin); jamb(o1, L, lin);
      add({ u0: o0, u1: o1, v0, v1, z0: passH, z1: lin, mat: lionMat });
      add({ u0: 0, u1: L, v0, v1, z0: lin, z1: walk, mat: lionMat });
      for (const e of [[0, v0, L, v0, '-y'], [0, v1, L, v1, '+y']].filter((q) => sides.includes(q[4][0]))) { const [p, q, r, s, n] = e; out.push(...parapet(axis === 'x' ? e : [q, p, s, r, n === '-y' ? '-x' : '+x'], { walkM: walk, heightM: top, para: 0.45 }, TEX.cyclo, 165)); }
      leaves();
    } else { // wrecked: the lintel down across the passage, the triangle and walk collapsed, a jamb broken, doors smashed
      jamb(0, o0, walk * 0.92); jamb(o1, L, lin * 0.75);
      add({ u0: o0 - 0.2, u1: o1 - 0.4, v0: v1 - 0.95, v1: v1 - 0.1, z0: 0, z1: 0.9, mat: (f, x, y, z, u, r) => (f === 'top' ? rough(f, x, y) : mul(TEX.lion.px(40 + (u & 15), 112 + (r % 28)) ?? TEX.lime[2], 0.9)) });
      add({ u0: o0 + 0.1, u1: o0 + 1.3, v0: 0.2, v1: 0.42, z0: 0, z1: 0.14, mat: doorMat });
      out.push(...wreckage(axis, v1 - v0, k + 20, false, 0, L, 1), ...(axis === 'x' ? heap(L / 2, v1 + 0.3, 1.6, 0.6, 1.0, k + 50, rubMat(k)) : heap(v1 + 0.3, L / 2, 0.6, 1.6, 1.0, k + 50, rubMat(k))));
    }
  } else {
    const postH = 4.4, bm = 3.5, pal = palisadeMat();
    const postMat = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.wood[1], 1.1) : pal(f, x, y, z, u, (r % 60) + 20));
    if (half) {
      for (const [a, b] of [[0, o0], [o1, L]]) add({ u0: a, u1: b, v0, v1, z0: 0, z1: low ? 1.5 : postH, mat: postMat });
      add({ u0: o0 + 0.2, u1: o1 - 0.2, v0: v1 + 0.2, v1: v1 + 0.55, z0: 0, z1: 0.3, mat: woodSolid(2) }); // the leaves lie ready
      if (low) { out.push(...stack(0.5, 0.0, true, k).map(uv)); return out; }
      add({ u0: 0, u1: L, v0: v0 - 0.1, v1: v1 + 0.1, z0: bm, z1: bm + 0.3, mat: planks('x', 2) });
      out.push(...scaffold(axis, 0, L, v1, 1, 2.6));
      return out;
    }
    for (const [i, [a, b]] of [[0, o0], [o1, L]].entries()) add({ u0: a, u1: b, v0, v1, z0: 0, z1: dmg && i ? 1.7 : postH, mat: postMat });
    if (!dmg) {
      add({ u0: 0, u1: L, v0: v0 - 0.1, v1: v1 + 0.1, z0: bm, z1: bm + 0.3, mat: planks('x', 2) });
      add({ u0: -0.1, u1: L + 0.1, v0: 0.4, v1: 1.6, z0: bm + 0.3, z1: bm + 0.42, mat: planks(axis === 'x' ? 'y' : 'x', 6) });
      for (const v of [[0.4, 0.52, '-'], [1.48, 1.6, '+']].filter((q) => sides.includes(q[2]))) add({ u0: -0.1, u1: L + 0.1, v0: v[0], v1: v[1], z0: bm + 0.42, z1: bm + 1.3, mat: (f, x, y, z, u, r) => (f === 'top' ? null : pal(f, x, y, z, u, palRow(r, 0.88))) });
      leaves();
    } else { // the beam down, one leaf flat on the ground, the other hanging half burnt
      add({ u0: 0.3, u1: L - 0.2, v0: v1 + 0.15, v1: v1 + 0.45, z0: 0, z1: 0.3, mat: woodSolid(1) });
      add({ u0: o0 + 0.1, u1: L / 2 + 0.2, v0: 0.05, v1: v0 - 0.05, z0: 0, z1: 0.14, mat: doorMat });
      out.push(...sliced(map({ u0: L / 2, u1: o1, v0: hinge - 0.14, v1: hinge, z0: 0, z1: dz, mat: (f, x, y, z, u, r) => (f === 'top' ? CHAR : pal(f, x, y, z, u, palRow(r, dz))) }), axis, stakeProf(dz, k)));
      out.push(...wreckage(axis, 0.6, k + 9, true, 0, L, 1));
    }
  }
  return out;
}

// ---- 2-deep gates (W-28): walls with a walkway are 2 tiles deep, the sim's gate stays on the line (2 x 1) and the inner
// row behind it is the open passage. Composed from the gate above: the gate on the line (doors, outer parapet / rail) and a
// copy without doors on the inner row (inner parapet / rail), joined into one deep gatehouse; wood bridges the walk
// between the two beams. inner: the side of the inner row across the line ('+' or '-' along y for axis x, x for axis y).
function gate2Boxes(material, axis, state, inner, k = 3, iron = false) {
  const out = [], shift = (bs, d) => bs.map((b) => (axis === 'x' ? { ...b, y0: b.y0 + d, y1: b.y1 + d } : { ...b, x0: b.x0 + d, x1: b.x1 + d }));
  const lineAt = inner === '+' ? 0 : 2, innerAt = 2 - lineAt, outer = inner === '+' ? '-' : '+';
  out.push(...shift(gateBoxes(material, axis, state, k, { sides: [outer], iron }), lineAt));
  out.push(...shift(gateBoxes(material, axis, state === 'open' ? 'done' : state, k + 7, { leaves: false, sides: [inner] }), innerAt));
  if (material === 'wood' && (state === 'done' || state === 'open')) { // the walk across between the two beams
    const bm = 3.5, b = { u0: -0.1, u1: 4.1, v0: 1.6, v1: 2.4, z0: bm + 0.3, z1: bm + 0.42, mat: planks(axis === 'x' ? 'y' : 'x', 6) };
    out.push(axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  }
  return out;
}

// ---- the keep: a Mycenaean megaron on an acropolis terrace (4 x 4 tiles, 8 m): a cyclopean podium (P m; the fort sets
// it on a high terrace), an ashlar hall with a porch of two red columns between the antae, a timber band and a low tiled
// gable roof, its pediment to the front (+y).
function megaronBoxes(state, k = 4, P = 1.0) {
  const WH = 2.9, E = P + WH + 0.45, rise = 1.25, cx = 4, iso = masonry(TEX.iso, { mod: 180, top: state === 'done' ? flags : rough });
  const pod = { x0: 0.15, x1: 7.85, y0: 0.15, y1: 7.55, z0: 0, z1: P, mat: masonry(TEX.cyclo, { row0: 4 }) };
  if (state === 'foundation') return [...foundation(rectEdges(0.15, 0.15, 7.85, 7.55), 'stone', k, 1.5), ...foundation(rectEdges(1.0, 0.9, 7.0, 6.9), 'stone', k + 1, 2)];
  const steps = P > 1.2 ? [] : [0.33, 0.66].map((h, i) => ({ x0: 3.0, x1: 5.0, y0: 7.55, y1: 7.9 - i * 0.17, z0: 0, z1: h, mat: masonry(TEX.iso, { row0: 30 }) }));
  const B = [pod, ...steps];
  const door = (face, x, y, z, u, r) => (face === '+y' && y > 5.5 && x > 3.35 && x < 4.65 && z > P && z < P + 2.2 ? (x < 3.45 || x > 4.55 || z > P + 2.1 ? mul(TEX.wood[1], 0.9) : DOORDARK) : iso(face, x, y, z, u, r));
  const hall = { x0: 1.0, x1: 7.0, y0: 0.9, y1: 5.6, z0: P, z1: P + WH, mat: door };
  const antae = [{ x0: 1.0, x1: 1.5, y0: 5.6, y1: 6.9, z0: P, z1: P + WH, mat: iso }, { x0: 6.5, x1: 7.0, y0: 5.6, y1: 6.9, z0: P, z1: P + WH, mat: iso }];
  const col = (x, z1, prof) => cylinder(x, 6.5, 0.24, P, z1, null, { paint: PAINT, top: (f) => TEX.lime[3], prof });
  const capital = (x) => ({ x0: x - 0.32, x1: x + 0.32, y0: 6.18, y1: 6.82, z0: P + WH - 0.25, z1: P + WH, mat: masonry(TEX.iso, { row0: 9 }) });
  const bandMat = (f, x, y, z) => (f === 'top' ? (state === 'damaged' ? mul(CHAR, 0.9 + 0.4 * hash(Math.floor(x * 6), Math.floor(y * 6), 3)) : TEX.wood[0]) : (z - P - WH) % 0.45 < 0.08 ? TEX.wood[0] : Math.floor(along(f, x, y) * 2) % 3 === 0 ? PAINT : TEX.wood[1]);
  const band = { x0: 0.9, x1: 7.1, y0: 0.8, y1: 7.0, z0: P + WH, z1: E, mat: bandMat };
  const [rf, rd] = [(x, y) => E + rise * (1 - Math.abs(x - cx) / 3.35), (x, y) => [y, Math.abs(x - cx)]];
  const pediment = (prof) => sliced({ x0: 0.9, x1: 7.1, y0: 6.85, y1: 7.0, z0: E, z1: E + rise, mat: masonry(TEX.iso, { row0: 50 }) }, 'x', prof);
  if (state === 'done') {
    B.push(hall, ...antae, ...col(3.0, P + WH - 0.25), ...col(5.0, P + WH - 0.25), capital(3.0), capital(5.0), band, ...pediment((a) => rf(a, 0) - 0.08));
    B.push(...roof(0.65, 7.35, 0.5, 7.25, rf, rd), { x0: cx - 0.12, x1: cx + 0.12, y0: 0.5, y1: 7.25, z0: E + rise - 0.05, z1: E + rise + 0.12, mat: (f, x, y) => mul(TEX.tile[1], 0.9 + 0.2 * hash(Math.floor(y * 3), 2, 2)) });
  } else if (state === 'rising') {
    const pr = (a) => P + halfProf(WH, k, 0.25)(a);
    B.push(...sliced(hall, 'x', pr), ...antae.flatMap((b) => sliced(b, 'x', pr)), ...stack(5.6, 6.4, false, k), ...stack(1.9, 6.3, false, k + 7));
  } else if (state === 'scaffold') {
    const pr = (a) => P + halfProf(WH, k, 0.66)(a);
    B.push(...sliced(hall, 'x', pr), ...antae.flatMap((b) => sliced(b, 'x', pr)), ...col(3.0, P + 1.4));
    B.push({ x0: 4.6, x1: 5.4, y0: 6.1, y1: 6.9, z0: P, z1: P + 0.45, mat: solid(PAINT) }); // column drums waiting
    B.push(...scaffold('x', 1.0, 7.0, 6.9, 1, P + 2.4), ...scaffold('y', 0.9, 6.9, 7.0, 1, P + 2.4));
  } else { // wrecked: the back of the hall stands with a scrap of burnt roof; the front thrown down, rafters fallen in,
    // one column broken, the other lying in the porch, rubble and roof tiles round it
    const yb = 2.5, pr = (a) => P + WH * (0.3 + 0.3 * hash(Math.floor(a * 1.3), k, 7));
    B.push({ ...hall, y1: yb }, ...sliced({ ...hall, y0: yb }, 'x', pr), ...sliced(antae[0], 'x', () => P + 1.4), { ...antae[1], z1: P + 2.1 }, ...col(5.0, P + 1.2));
    B.push({ ...band, y1: yb }, ...roof(0.65, 7.35, 0.5, yb, rf, rd, { holes: (x, y) => hash(Math.floor(x * 1.4), Math.floor(y * 1.4), k + 3) < 0.3 || (x > 5.2 && y > 1.6) }));
    for (const x of [1.6, 2.7, 4.6, 5.9]) B.push(...beam('y', yb, 5.4, x, 0.14, (xx, y) => E - ((y - yb) / (5.4 - yb)) * (E - P - WH * 0.42), solid(CHAR))); // rafters fallen in from the back wall
    B.push(...cells(1.6, 4.4, 6.28, 6.72, (x, y) => (Math.abs(y - 6.5) < 0.24 ? { z0: P, z1: P + 0.45, mat: (f) => mul(PAINT, f === 'top' ? 1.05 : 0.85) } : null))); // the fallen column
    B.push(...heap(4.6, 7.5, 1.7, 0.6, 1.0, k + 60, rubMat(k)), ...heap(7.7, 4.4, 0.55, 1.9, 0.9, k + 61, rubMat(k + 1)), ...heap(2.2, 7.4, 1.0, 0.5, 0.6, k + 62, rubMat(k + 2, TEX.tile)), ...heap(7.6, 6.4, 0.5, 0.9, 0.5, k + 63, rubMat(k + 3, TEX.tile)));
  }
  return B;
}

// ---- W-35 fire arrows: the brazier (1 tile) and the pitch kiln (2 x 2). Drawn here, 0 generations.
// vox: a solid sampled on a 1/16 m grid (fn(x, y, z) -> material key | null), merged into columns per key (finer columns
// than 1 px drop out of the renderer, which samples pixel centres)
function vox(x0, x1, y0, y1, z0, z1, fn, M, s = 1 / 16, sz = 1 / 48) {
  const out = [];
  for (let x = x0; x < x1 - 1e-9; x += s) for (let y = y0; y < y1 - 1e-9; y += s) {
    let run = null;
    for (let z = z0; z < z1 - 1e-9; z += sz) {
      const k = fn(x + s / 2, y + s / 2, z + sz / 2);
      if (k && run && run.k === k) { run.z1 = z + sz; continue; }
      if (run) out.push(run); run = k ? { k, x0: x, x1: x + s, y0: y, y1: y + s, z0: z, z1: z + sz, ...M[k] } : null;
    }
    if (run) out.push(run);
  }
  return out;
}
const BRONZE = [[40, 27, 18], [72, 46, 26], [112, 72, 36], [156, 106, 54], [206, 158, 88]].map((c) => [...c, 255]);
const FIREC = { deep: [92, 30, 18, 255], red: [150, 54, 26, 255], or: [204, 104, 40, 255], yel: [232, 168, 80, 255] };
const ASH = [[46, 42, 40, 255], [78, 72, 68, 255], [112, 106, 100, 255]];
// the brazier, upright, centred on its tile: a 1.2 m bronze tripod, lion-paw feet, a ring brace, a shallow bowl of coals
const BZ = { zb: 0.84, zr: 1.16, R: 0.4, coal: 1.06 };
function brazierShape(x, y, z) {
  const dx = x - 1, dy = y - 1, d = Math.hypot(dx, dy);
  if (z >= BZ.zr - 0.035 && z <= BZ.zr + 0.015 && d <= BZ.R + 0.035 && d >= BZ.R - 0.03) return 'rim';
  if (z >= BZ.zb && z <= BZ.zr) {
    const Ro = 0.14 + (BZ.R - 0.14) * Math.sqrt((z - BZ.zb) / (BZ.zr - BZ.zb));
    if (d <= Ro) return d < Ro - 0.035 && z > BZ.zb + 0.05 ? (z < BZ.coal + 0.05 * (1 - d / BZ.R) ? 'coal' : null) : 'bowl';
  }
  if (Math.abs(z - 0.36) <= 0.025 && Math.abs(d - 0.45) <= 0.035) return 'leg'; // ring brace
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 4 + (i * 2 * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
    if (Math.hypot(dx - 0.5 * ca, dy - 0.5 * sa, (z - 0.05) * 1.2) <= 0.07) return 'paw';
    for (let t = 0; t <= 1; t += 1 / 40) { // the leg: foot to the bowl's belly, bowed out
      const r = 0.5 - 0.27 * t + 0.07 * Math.sin(Math.PI * t), lz = 0.06 + t * (BZ.zb + 0.1 - 0.06);
      if (Math.hypot(dx - r * ca, dy - r * sa, z - lz) <= 0.05) return 'leg';
    }
  }
  return null;
}
function brazierMats(lit) {
  const bowl = (f, x, y, z) => { const dx = x - 1, dy = y - 1, d = Math.hypot(dx, dy) || 1; const c = BRONZE[f === 'top' ? 3 : 2 + (hash(Math.floor(x * 40), Math.floor(z * 40), 3) > 0.85 ? -1 : 0)]; return mul(c, f === 'top' ? 1 : lightOf(dx / d, dy / d)); };
  const coal = (f, x, y, z) => {
    const h = hash(Math.floor(x * 28), Math.floor(y * 28), 7), h2 = hash(Math.floor(x * 56), Math.floor(y * 56), 8);
    if (!lit) return h2 < 0.3 ? ASH[2] : h < 0.5 ? CHAR : ASH[h < 0.8 ? 0 : 1];
    const d = Math.hypot(x - 1, y - 1) / BZ.R; return h < 0.22 ? CHAR : h < 0.45 ? FIREC.deep : h2 < 0.25 + 0.4 * (1 - d) ? FIREC.yel : h < 0.75 ? FIREC.red : FIREC.or;
  };
  return { rim: { mat: (f, x, y) => (f === 'top' ? BRONZE[3] : mul(BRONZE[3], lightOf((x - 1) / BZ.R, (y - 1) / BZ.R))), lit: true }, bowl: { mat: bowl, lit: true }, coal: { mat: coal, lit: true }, leg: { mat: solid(BRONZE[2]) }, paw: { mat: solid(BRONZE[3]) },
    ash: { mat: (f, x, y) => { const h = hash(Math.floor(x * 30), Math.floor(y * 30), 9); return h < 0.35 ? CHAR : h < 0.42 ? EMBER : ASH[h < 0.7 ? 0 : 1]; }, lit: true } };
}
// state: unlit | lit | destroyed (knocked over: the tripod lies on its side, its coals and ash spilt beside it)
function brazierBoxes(state) {
  if (state !== 'destroyed') return vox(0.4, 1.6, 0.4, 1.6, 0, 1.2, brazierShape, brazierMats(state === 'lit'));
  const th = (100 * Math.PI) / 180, f = [Math.SQRT1_2, -Math.SQRT1_2], P0 = [0.5, 1.5], c = Math.cos(th), s = Math.sin(th);
  const tipped = (x, y, z) => { // world -> upright: undo the fall (about the horizontal axis across f, through P0 at z = 0.12)
    const px = x - P0[0], py = y - P0[1], pz = z - 0.12, a = px * f[0] + py * f[1], b = -px * f[1] + py * f[0];
    const a0 = a * c - pz * s, z0 = a * s + pz * c; return brazierShape(1 + a0 * f[0] - b * f[1], 1 + a0 * f[1] + b * f[0], z0);
  };
  const sc = [P0[0] + f[0] * 1.3, P0[1] + f[1] * 1.3];
  const spill = (x, y, z) => { const u = ((x - sc[0]) * f[0] + (y - sc[1]) * f[1]) / 0.42, v = (-(x - sc[0]) * f[1] + (y - sc[1]) * f[0]) / 0.3, q = u * u + v * v; return q < 1 && z < 0.025 + 0.06 * (1 - q) * hash(Math.floor(x * 20), Math.floor(y * 20), 5) ? 'ash' : null; };
  return vox(0, 2, 0, 2, 0, 1.0, (x, y, z) => (z < 0.1 && spill(x, y, z)) || tipped(x, y, z), brazierMats(false));
}
// the pitch kiln: a clay dome on a stone ring, a stoking mouth to the south-west (+y), a vent on top; a woodstack and
// pitch jars by it. Footprint 2 x 2 (4 m), dome 2.7 m across, 2.3 m to the vent's lip.
const CLAY = [[70, 48, 34], [102, 72, 50], [134, 98, 68], [160, 124, 88]].map((c) => [...c, 255]);
const KL = { cx: 2, cy: 2, R: 1.35, z0: 0.3, H: 1.65, vent: 0.26, ventTop: 2.2 };
function kilnBoxes(state, k = 9) {
  if (state === 'foundation') return [...foundation(rectEdges(0.2, 0.2, 3.8, 3.8), 'stone', k, 1.2), ...stack(2.9, 0.15, true)];
  const { cx, cy, R, z0, H } = KL, L = [0.3, 0.75, 0.9], ln = Math.hypot(...L), mdir = Math.atan2(1, 0.35);
  const top = { rising: z0 + 0.6, scaffold: z0 + 1.25, done: 9, damaged: 9 }[state];
  const domeZ = (x, y) => { const q = 1 - (Math.hypot(x - cx, y - cy) / R) ** 2; return q > 0 ? z0 + H * Math.sqrt(q) : -1; };
  const hole = (x, y) => state === 'damaged' && Math.hypot(x - cx + 0.35, y - cy + 0.25) < 0.55 + 0.15 * hash(Math.floor(x * 6), Math.floor(y * 6), k);
  const clay = (f, x, y, z) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, zz = Math.max(0, z - z0) / H;
    if (f === 'top' && z < domeZ(x, y) - 0.04) return d < R - 0.22 ? DOORDARK : mul(CLAY[2], 0.95 + 0.1 * hash(Math.floor(x * 9), Math.floor(y * 9), 4)); // a cut top: the hollow inside a 0.2 m wall
    const n = [dx / R, dy / R, zz], nl = Math.hypot(...n) || 1, li = 0.5 + 0.72 * Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ln));
    const th = Math.atan2(dy, dx), dth = Math.abs(((th - mdir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    const arch = 0.62 * Math.sqrt(Math.max(0, 1 - (dth / 0.3) ** 2)); // the stoking mouth: an arch 0.6 m high
    if (z - z0 < arch && d > R * 0.6) return z - z0 < 0.14 && hash(Math.floor(x * 30), Math.floor(y * 30), 6) < (state === 'done' ? 0.35 : 0.1) ? EMBER : DOORDARK;
    if (dth < 0.42 && z - z0 < arch + 0.5 && z - z0 > 0.5) return mul(CHAR, 1.2 + 0.4 * hash(Math.floor(x * 20), Math.floor(z * 20), 2)); // soot over the mouth
    const coil = (z - z0) % 0.22 < 0.03 ? 0 : 1, c = CLAY[coil + (hash(Math.floor(th * 9), Math.floor(z * 6), 5) > 0.6 ? 1 : 0) + 1];
    return mul(c, li * (0.92 + 0.12 * hash(Math.floor(x * 18), Math.floor(y * 18) + Math.floor(z * 18), 3)));
  };
  const B = [...cylinder(cx, cy, R + 0.15, 0, z0, TEX.cyclo, { row0: 12, top: rough })];
  B.push(...cells(cx - R, cx + R, cy - R, cy + R, (x, y) => { const z = Math.min(domeZ(x, y), top, hole(x, y) ? z0 + 0.35 : 9); return z > z0 ? { z0, z1: z, mat: clay, lit: true } : null; }));
  if (state === 'damaged') B.push(...heap(cx + 0.3, cy + 1.75, 0.8, 0.35, 0.45, k + 3, (f, x, y) => mul(CLAY[1 + Math.floor(hash(Math.floor(x * 5), Math.floor(y * 5), 3) * 3)], f === 'top' ? 1.05 : 0.85)));
  if (state === 'done' || state === 'damaged') { // the vent: a clay collar, black inside
    const vm = (f, x, y) => (f === 'top' && Math.hypot(x - cx, y - cy) < KL.vent - 0.08 ? DOORDARK : mul(CLAY[f === 'top' ? 3 : 2], f === 'top' ? 1 : lightOf((x - cx) / KL.vent, (y - cy) / KL.vent)));
    if (state === 'done') B.push(...cells(cx - KL.vent, cx + KL.vent, cy - KL.vent, cy + KL.vent, (x, y) => (Math.hypot(x - cx, y - cy) <= KL.vent ? { z0: z0 + H - 0.1, z1: KL.ventTop, mat: vm, lit: true } : null)));
  }
  if (state === 'scaffold') B.push(...scaffold('x', 0.6, 3.4, 3.4, 1, z0 + 1.0), ...scaffold('y', 0.6, 3.4, 3.4, 1, z0 + 1.0));
  B.push(...stack(2.9, 0.15, true), ...(state === 'rising' ? stack(0.15, 2.9, true, 2) : []));
  if (state !== 'rising') { // pitch jars: squat pots with black pitch to the brim (one knocked over when damaged)
    const jar = (jx, jy, h) => cells(jx - 0.18, jx + 0.18, jy - 0.18, jy + 0.18, (x, y) => { const d = Math.hypot(x - jx, y - jy); if (d > 0.17) return null; return { z0: 0, z1: d < 0.11 ? h : h - 0.08 * ((d - 0.11) / 0.06), mat: (f, xx, yy, z) => (f === 'top' ? (d < 0.12 ? mul(CHAR, 1.2) : CLAY[3]) : mul(z > h - 0.1 ? CLAY[3] : CLAY[2], lightOf((xx - jx) / d || 0, (yy - jy) / d || 0))), lit: true }; });
    B.push(...jar(3.35, 2.75, 0.42), ...jar(3.55, 3.2, 0.36), ...(state === 'damaged' ? [] : jar(3.05, 3.45, 0.4)));
  }
  return B;
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
// the plinth's side faces off: the lowest `t` px of every column (the floor's front edges then end the sprite)
function shave(im, t) {
  if (!t) return im;
  const { w, h, data: d } = im;
  for (let x = 0; x < w; x++) { let b = h - 1; while (b >= 0 && !d[(b * w + x) * 4 + 3]) b--; for (let y = Math.max(0, b - t + 1); y <= b; y++) d[(y * w + x) * 4 + 3] = 0; }
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
  { id: 'farm', kind: 'farm', material: 'wood', burnable: true, footprint: [4, 4], raw: 'farm', ground: ['green'], grade: { sat: 0.55, val: 0.72 }, source: 'map_object d8a727c4' },
  { id: 'olive-press', kind: 'press', material: 'stone', burnable: false, footprint: [3, 3], raw: 'olive-press', ground: ['green'], grade: { sat: 0.6, val: 0.78 }, fill: 0.95, source: 'map_object 23e61811' },
];
// ART-C workplaces (WAR.md "Workplaces"): each level is its own building type chained by `upgrade` (forge -> forge2 ->
// forge3); the sorting floor is the storehouse's upgrade and has two levels. Same pipeline as BUILDINGS. plinth: px of
// the raised slab PixelLab drew under the floor (its side faces), shaved off so the floor sits on the terrain.
const WP = (chain, kind, fp, levels) => levels.map(([material, src, plinth, extra], i) => ({ id: i ? `${chain}${i + 1}` : chain, raw: i ? `${chain}${i + 1}` : chain, kind, chain, level: i + 1, ...(i + 1 < levels.length && { upgrade: `${chain}${i + 2}` }), material, burnable: material === 'wood', footprint: fp, ground: ['green'], grade: { sat: 0.6, val: 0.78 }, plinth, source: `map_object ${src}`, ...extra }));
export const WORKPLACES = [
  ...WP('forge', 'forge', [3, 3], [['stone', 'e3777fbd', 11], ['stone', '131af9a3', 3], ['stone', 'bab7d0b8', 3]]),
  ...WP('cookhouse', 'cookhouse', [3, 2], [['wood', 'f8bbe7a5', 16], ['stone', 'eb22ef20', 6], ['stone', '5e298186', 1]]),
  ...WP('infirmary', 'infirmary', [3, 3], [['wood', 'ea7f015d', 3], ['stone', 'a6818f38', 3], ['stone', '24db3ab2', 0]]),
  ...WP('workshop', 'workshop', [4, 3], [['wood', '849334f6', 3], ['wood', '6994bf80', 0], ['stone', '954f4146', 4]]),
  ...WP('market-stall', 'stall', [2, 2], [['wood', '6c2ef514', 6], ['stone', 'ac483a10', 5], ['stone', '59475235', 7]]),
  ...WP('sorting-floor', 'sorting-floor', [3, 3], [['stone', '7b3cb213', 0, { from: 'storehouse' }], ['stone', 'e20b0195', 0]]),
];
BUILDINGS.push(...WORKPLACES);
// ART-T (WAR.md "Trade"): the rented warehouse of a trade town's court (20 loads), next to the market-stall chain
export const TRADE_BUILDINGS = [{ id: 'warehouse', kind: 'warehouse', material: 'stone', burnable: false, footprint: [3, 2], raw: 'warehouse', ground: ['green'], grade: { sat: 0.55, val: 0.74 }, plinth: 3, source: 'map_object 5e3e00b9' }];
BUILDINGS.push(...TRADE_BUILDINGS);
export const PROPS = [
  { id: 'lumber-pile', kind: 'prop', material: 'wood', footprint: [1, 1], raw: 'lumber-pile', grade: { sat: 0.65, val: 0.8 }, fill: 0.85, source: 'map_object c872b491' },
  { id: 'stone-pile', kind: 'prop', material: 'stone', footprint: [1, 1], raw: 'stone-pile', grade: { sat: 0.7, val: 0.8 }, fill: 0.85, source: 'map_object 594dd609' },
];

// ---- bridges (W-24, v2 W-33). Axis pieces: 1 tile each. deck-x / deck-y span water along that axis; a ramp from the bank
// is 2 tiles: out-<axis><0|1> its lower half (0 at the outer edge, half the deck height at the inner), end-<axis><0|1> its
// upper half up to the deck (0 = the ramp's outer edge is at the low end of the axis). The deck stands ~1 m over the bank. A suffix picks the rails of a tile in a wider bridge: none = both sides (1 wide), .l = the low side
// across only (-y along x, -x along y), .h = the high side only, .n = none (the middle tile of a 3-wide bridge).
// Diagonal pieces (kit <id>-diag): one row segment of a bridge along a grid diagonal: h = screen-horizontal (along
// +-(1,-1)), v = screen-vertical (along +-(1,1)); <dir><width 1-3>-<part>: deck, end+ / end- = upper ramp row rising towards
// +a (screen right, h) or +b (screen down, v), out+ / out- = the lower ramp row on the bank. Drawn by a screen-aligned box renderer: world a = x - y, b = x + y (m); a box
// shows its top and its +b face (its a faces are edge-on). A segment is 4 m of a or b long (one row step = sqrt 2 tiles)
// and width x 2 sqrt 2 m across; frame origin = the row's centre on the ground.
// Stone reads as a low road bridge: paved deck, low parapets on a thin cornice, one flat segmental arch per tile / segment.
const BRIDGES = {
  'bridge-wood': { material: 'wood', burnable: true, deck: 1.0, source: 'pixflux b5ffd7c7 (trestle elevation)' },
  'bridge-stone': { material: 'stone', burnable: false, deck: 1.2, source: 'renderer: arches, cornice, ashlar (pixflux ashlar elevation)' },
};
const BRIDGE_BASE = ['deck-x', 'deck-y', 'end-x0', 'end-x1', 'end-y0', 'end-y1', 'out-x0', 'out-x1', 'out-y0', 'out-y1'];
const BRIDGE_PIECES = [...BRIDGE_BASE, ...['l', 'h', 'n'].flatMap((e) => BRIDGE_BASE.map((p) => `${p}.${e}`))];
const PARA = 0.5; // stone parapet height (m) over the deck
// stone arch face along `a` (m): one flat arch per period L, piers `pier` wide centred on the period ends; springing just
// over the water, crown ARCH_CROWN under the deck; a voussoir ring over it, the soffit in shadow at the head of the opening,
// open (see-through) below
const ARCH_CROWN = 0.36;
function archFace(a, z, u, r, D, L, pier) {
  const m = ((a % L) + L) % L, half = L / 2 - pier / 2, d = Math.abs(m - L / 2);
  if (z >= D - 0.22 && z < D - 0.13) return mul(TEX.stone[3], 1.04); // cornice course
  if (z >= D - 0.13) return TEX.ashlar.px(u, r);
  if (d < half + 0.16) {
    const q = Math.min(1, d / half), zs = 0.06, top = zs + (D - ARCH_CROWN - zs) * Math.sqrt(Math.max(0, 1 - q * q));
    if (d < half) {
      const t = 0.22 * Math.sqrt(Math.max(0, 1 - q * q));
      if (z < top - t) return null;
      if (z < top) return mul(TEX.stone[0], 0.5);
    }
    if (z >= top - 0.01 && z < top + 0.17 && z >= zs) { // voussoirs: radial joints round the ring
      const ang = Math.atan2(z - zs, (m - L / 2) * ((D - ARCH_CROWN - zs) / half)), n = Math.floor(ang / 0.22);
      return (ang / 0.22) % 1 < 0.16 || z >= top + 0.14 ? TEX.stone[0] : mul(TEX.stone[2 + (n & 1)], 1.02);
    }
  }
  return TEX.ashlar.px(u, r);
}
const coping = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.stone[3], 1.05) : r >= Math.round(PARA * PPM) - 3 ? TEX.stone[3] : TEX.ashlar.px(u, r));
function bridgeBoxes(id, pieceName, state, k) {
  const [piece, edge = 'b'] = pieceName.split('.'), railLo = edge === 'b' || edge === 'l', railHi = edge === 'b' || edge === 'h';
  const Bd = BRIDGES[id], stone = Bd.material === 'stone', axis = piece.endsWith('x') || piece[4] === 'x' ? 'x' : 'y', lower = piece.startsWith('out'), end = lower || piece.startsWith('end'), lowAt0 = piece.endsWith('0');
  const map = (b) => (axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  const out = [], add = (b) => out.push(map(b)), D = Bd.deck, rails = [...(railLo ? [0] : []), ...(railHi ? [1] : [])];
  if (state === 'foundation') { // marked line of the span with stakes / pier stones, on the outer edges
    const fb = foundation([...(railLo ? [[0, 0.05, 2, 0.05, '-y']] : []), ...(railHi ? [[0, 1.95, 2, 1.95, '+y']] : []), ...(rails.length ? [] : [[0, 1, 2, 1, '+y']])], Bd.material, k, 0.66);
    return fb.map((b) => (axis === 'x' ? b : { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  }
  const ramp = (u) => (lower ? 0 : D / 2) + (lowAt0 ? D * u / 4 : D * (2 - u) / 4); // a 2-tile ramp: this tile's half
  const dmg = state === 'damaged', half = state === 'scaffold' || state === 'rising', low = state === 'rising';
  const along = (f) => (axis === 'x' ? f === '+y' || f === '-y' : f === '+x' || f === '-x');
  if (!end) {
    if (stone) {
      const mat = (f, x, y, z, u, r) => (f === 'top' ? (half ? rough(f, x, y) : flags(f, x, y)) : along(f) ? archFace(axis === 'x' ? x : y, z, u, r, D, 2, 0.6) : TEX.ashlar.px(u, r));
      add({ u0: 0, u1: 2, v0: 0, v1: 2, z0: 0, z1: low ? D * 0.35 : half ? D * 0.7 : D, mat });
      if (half && !low) add({ u0: 0.45, u1: 1.55, v0: 0.1, v1: 1.9, z0: 0, z1: D * 0.6, mat: (f, x, y, z) => ((Math.floor(z * 4) + Math.floor((axis === 'x' ? x : y) * 4)) % 3 ? null : TEX.wood[1]) }); // timber centring
      if (!half) for (const s of rails) { const pb = { u0: 0, u1: 2, v0: s ? 1.65 : 0, v1: s ? 2 : 0.35, z0: D, z1: D + PARA, mat: coping }; if (dmg && s) out.push(...sliced(map(pb), axis, (a) => (a > 0.4 && a < 1.6 ? D + 0.1 : D + PARA))); else add(pb); }
    } else {
      const tr = (f, x, y, z, u, r) => (f === 'top' ? TEX.wood[2] : TEX.trestle.px(u, r));
      for (const s of [0, 1]) {
        const rail = rails.includes(s), sb = { u0: 0, u1: 2, v0: s ? 1.8 : 0.05, v1: s ? 1.95 : 0.2, z0: 0, z1: low ? D * 0.45 : half || !rail ? D - 0.18 : D + 0.9, mat: tr };
        if (dmg && s && rail) out.push(...sliced(map(sb), axis, (a) => (a > 0.4 && a < 1.2 ? D + 0.2 : D + 0.9))); else add(sb);
      }
      const deck = { u0: 0, u1: 2, v0: railLo ? 0.2 : 0, v1: railHi ? 1.8 : 2, z0: D - 0.18, z1: D, mat: planks(axis === 'x' ? 'x' : 'y', 2) };
      if (low) { /* piles only */ } else if (half) add({ ...deck, v1: (deck.v0 + deck.v1) / 2 }); else if (dmg) { add({ ...deck, u1: 0.7 }); add({ ...deck, u0: 1.45 }); } else add(deck); // scaffold: half the boards laid across
    }
  } else {
    const prof = (a) => Math.max(0.05, ramp(a));
    const body = { u0: 0, u1: 2, v0: stone || !railLo ? 0 : 0.2, v1: stone || !railHi ? 2 : 1.8, z0: 0, z1: D, mat: stone ? (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : TEX.ashlar.px(u, r)) : (f, x, y, z, u, r) => (f === 'top' ? planks(axis === 'x' ? 'x' : 'y', 4)(f, x, y) : (z * 5) % 1 < 0.18 ? TEX.wood[0] : mul(TEX.wood[1 + (Math.floor(z * 5) % 2)], 0.92 + 0.16 * hash(Math.floor(u / 3), Math.floor(z * 5), 4))) };
    const p2 = low ? (a) => Math.min(prof(a), D * 0.22) : half && stone ? (a) => Math.min(prof(a), D * 0.45) : dmg ? (a) => prof(a) * (0.7 + 0.3 * hash(Math.floor(a * 5), k, 2)) : prof;
    out.push(...sliced(map(body), axis, p2));
    if (!half && stone) for (const s of rails) out.push(...sliced(map({ u0: 0, u1: 2, v0: s ? 1.65 : 0, v1: s ? 2 : 0.35, z0: 0, z1: D + PARA, mat: (f, x, y, z, u, r) => (f === 'top' ? TEX.stone[3] : TEX.ashlar.px(u, r % 140)) }), axis, (a) => (dmg && s ? prof(a) : prof(a) + PARA)));
  }
  return out;
}

// diagonal segments: boxes in (l along, c across, z) m of the screen axes (h: l = a, c = b; v: l = b, c = a)
const DG_W = 160, DG_H = 184, DG_X0 = 80, DG_Y0 = 144, DG_COLS = 6;
const DIAG_PIECES = ['h', 'v'].flatMap((d) => [1, 2, 3].flatMap((w) => ['deck', 'end+', 'end-', 'out+', 'out-'].map((p) => `${d}${w}-${p}`)));
function drawDBox(cv, axis, B) {
  const h = axis === 'h', a0 = h ? B.l0 : B.c0, a1 = h ? B.l1 : B.c1, b0 = h ? B.c0 : B.l0, b1 = h ? B.c1 : B.l1;
  if (B.z1 <= B.z0 || a1 <= a0 || b1 <= b0) return;
  const { ox, oy } = cv, LC = (a, b) => (h ? [a, b] : [b, a]);
  for (let px = Math.floor(ox + a0 * MX); px <= Math.ceil(ox + a1 * MX); px++) {
    const a = (px + 0.5 - ox) / MX; if (a < a0 || a >= a1) continue;
    for (let py = Math.floor(oy + b0 * MY - B.z1 * PPM); py <= Math.ceil(oy + b1 * MY - B.z1 * PPM); py++) {
      const b = (py + 0.5 - oy + B.z1 * PPM) / MY; if (b < b0 || b >= b1) continue;
      const [l, c] = LC(a, b), col = B.mat('top', l, c, B.z1, Math.floor(l * MX + 1e-6), Math.floor(c * MX + 1e-6));
      if (col) cv.put(px, py, b + 0.485 * B.z1, mul(col, SHADE.top));
    }
    for (let py = Math.floor(oy + b1 * MY - B.z1 * PPM); py <= Math.ceil(oy + b1 * MY - B.z0 * PPM); py++) {
      const z = (oy + b1 * MY - (py + 0.5)) / PPM; if (z < B.z0 || z >= B.z1) continue;
      const [l, c] = LC(a, b1), col = B.mat('front', l, c, z, Math.floor((h ? l : c) * MX + 1e-6), Math.floor((z - B.z0) * PPM + 1e-6));
      if (col) cv.put(px, py, b1 + 0.485 * z, mul(col, 0.87));
    }
  }
}
// a box cut into slices along l, each spanning z0(l) .. z1(l) (ramps, broken rails)
function slicedL(B, z0, z1, step = 1 / 16) {
  const out = [];
  for (let l = B.l0; l < B.l1 - 1e-9; l += step) { const m = l + step / 2, lo = z0(m), hi = z1(m); if (hi > lo) out.push({ ...B, l0: l, l1: Math.min(B.l1, l + step), z0: lo, z1: hi }); }
  return out;
}
function diagBoxes(id, piece, state, k) {
  const Bd = BRIDGES[id], stone = Bd.material === 'stone', axis = piece[0], W = Number(piece[1]), part = piece.slice(3), D = Bd.deck, L = 2, hw = W * Math.SQRT2;
  const out = [], add = (b) => out.push(b), step = axis === 'h' ? 1 / 16 : 1 / 8;
  const dmg = state === 'damaged', half = state === 'scaffold' || state === 'rising', low = state === 'rising', end = part !== 'deck';
  // a 2-row ramp: the lower (out) or upper (end) row's half of the rise to the deck
  const rampZ = (l) => Math.max(0.05, (part.startsWith('out') ? 0 : D / 2) + (D / 2) * (part.endsWith('+') ? (l + L) / (2 * L) : (L - l) / (2 * L)));
  const wood = (i) => (f, l, c, z) => mul(TEX.wood[i], 0.92 + 0.16 * hash(Math.floor(z * 10), Math.floor((l + c + 16) * 6), 3));
  const boards = (f, l, c, z) => { // boards across the way, dark seams
    const s = (f === 'top' ? l : z) * 3.2 + 64, n = Math.floor(s);
    return s - n < 0.16 ? TEX.wood[0] : mul(TEX.wood[1 + Math.floor(hash(n & 7, 2) * 3)], 0.94 + 0.12 * hash(Math.floor((c + 16) * 6), n, 3));
  };
  if (state === 'foundation') { // the edges pegged out: stakes and string (wood), a first course of pier stones (stone)
    for (const c of [-hw + 0.2, hw - 0.2]) {
      add({ l0: -L, l1: L, c0: c - 0.07, c1: c + 0.07, z0: 0, z1: 0.02, mat: solid(EARTH) });
      for (let l = -L + 0.25; l < L - 0.1; l += stone ? 0.9 : 1) {
        const n = Math.floor((l + 8) * 4);
        if (stone) add({ l0: l, l1: l + 0.55, c0: c - 0.3, c1: c + 0.3, z0: 0, z1: 0.22 + 0.1 * hash(n, k, 5), mat: (f, l2, c2, z) => mul(TEX.lime[2 + (hash(n, k, 6) > 0.5 ? 1 : 0)], 0.9 + 0.2 * hash(Math.floor((l2 + c2 + 16) * 20), Math.floor(z * 30), 1)) });
        else add({ l0: l, l1: l + 0.13, c0: c - 0.07, c1: c + 0.07, z0: 0, z1: 0.6, mat: wood(2) });
      }
      if (!stone) add({ l0: -L, l1: L, c0: c - 0.025, c1: c + 0.025, z0: 0.42, z1: 0.45, mat: solid(STRING) });
    }
    return out;
  }
  if (!end) {
    if (stone) {
      const top = low ? D * 0.35 : half ? D * 0.7 : D;
      add({ l0: -L, l1: L, c0: -hw, c1: hw, z0: 0, z1: top, mat: (f, l, c, z, u, r) => (f === 'top' ? (half ? rough(f, l + 16, c + 16) : flags(f, l + 16, c + 16)) : axis === 'h' ? archFace(l + L, z, u, r, D, 2 * L, 0.9) : TEX.ashlar.px(u, r)) });
      if (half && !low && axis === 'h') add({ l0: -1.2, l1: 1.2, c0: -hw + 0.3, c1: hw - 0.25, z0: 0, z1: D * 0.6, mat: (f, l, c, z) => ((Math.floor(z * 4) + Math.floor((l + 8) * 4)) % 3 ? null : TEX.wood[1]) }); // timber centring
      if (!half) for (const s of [-1, 1]) {
        const pb = { l0: -L, l1: L, c0: s < 0 ? -hw : hw - 0.4, c1: s < 0 ? -hw + 0.4 : hw, z0: D, z1: D + PARA, mat: coping };
        if (dmg && s > 0) out.push(...slicedL(pb, () => D, (l) => (l > -0.9 && l < 0.7 ? D + 0.08 : D + PARA), step)); else add(pb);
      }
    } else {
      const pz = low ? D * 0.45 : D - 0.18;
      for (let i = 0; i <= W; i++) { // a bent of piles under the middle of the segment, a cap beam on them
        const c = -hw + 0.25 + (i * (2 * hw - 0.5)) / W;
        add({ l0: -0.12, l1: 0.12, c0: c - 0.12, c1: c + 0.12, z0: 0, z1: pz, mat: wood(1) });
      }
      if (!low) add({ l0: -0.16, l1: 0.16, c0: -hw + 0.05, c1: hw - 0.05, z0: D - 0.38, z1: D - 0.18, mat: wood(0) });
      if (!low) for (const s of [-1, 1]) add({ l0: -L, l1: L, c0: s < 0 ? -hw : hw - 0.2, c1: s < 0 ? -hw + 0.2 : hw, z0: D - 0.34, z1: D - 0.16, mat: wood(1) }); // stringers
      const deck = { l0: -L, l1: L, c0: -hw + 0.02, c1: hw - 0.02, z0: D - 0.18, z1: D, mat: boards };
      if (low) { /* piles only */ } else if (half) add({ ...deck, l1: 0 }); else if (dmg) { add({ ...deck, l1: -0.7 }); add({ ...deck, l0: 0.6 }); } else add(deck);
      if (!half) for (const s of [-1, 1]) { // railing: posts, a mid and a top rail
        const c0 = s < 0 ? -hw : hw - 0.2, c1 = c0 + 0.2, broken = dmg && s > 0;
        for (const l of [-1.5, -0.5, 0.5, 1.5]) if (!broken || Math.abs(l) > 1) add({ l0: l - 0.08, l1: l + 0.08, c0, c1, z0: D, z1: D + 0.95, mat: wood(1) });
        for (const [z0, z1] of [[D + 0.4, D + 0.5], [D + 0.82, D + 0.95]]) if (broken) { add({ l0: -L, l1: -0.9, c0, c1, z0, z1, mat: wood(2) }); add({ l0: 1.1, l1: L, c0, c1, z0, z1, mat: wood(2) }); } else add({ l0: -L, l1: L, c0, c1, z0, z1, mat: wood(2) });
      }
    }
  } else {
    const cap = low ? D * 0.22 : half && stone ? D * 0.45 : Infinity, broke = (l) => (dmg ? 0.7 + 0.3 * hash(Math.floor((l + 8) * 5), k, 2) : 1);
    const zTop = (l) => Math.min(cap, rampZ(l) * broke(l));
    const mat = stone ? (f, l, c, z, u, r) => (f === 'top' ? flags(f, l + 16, c + 16) : TEX.ashlar.px(u, r)) : (f, l, c, z, u) => (f === 'top' ? boards(f, l, c, z) : (z * 5) % 1 < 0.18 ? TEX.wood[0] : mul(TEX.wood[1 + (Math.floor(z * 5) % 2)], 0.92 + 0.16 * hash(Math.floor((u + 256) / 3), Math.floor(z * 5), 4)));
    out.push(...slicedL({ l0: -L, l1: L, c0: -hw + (stone ? 0 : 0.1), c1: hw - (stone ? 0 : 0.1), mat }, () => 0, zTop, step));
    if (!half) for (const s of [-1, 1]) {
      const c0 = s < 0 ? -hw : hw - (stone ? 0.4 : 0.2), c1 = c0 + (stone ? 0.4 : 0.2), broken = dmg && s > 0;
      if (stone) out.push(...slicedL({ l0: -L, l1: L, c0, c1, mat: (f, l, c, z, u, r) => (f === 'top' ? TEX.stone[3] : TEX.ashlar.px(u, r % 140)) }, () => 0, (l) => (broken ? zTop(l) : rampZ(l) + PARA), step));
      else {
        out.push(...slicedL({ l0: -L, l1: L, c0, c1, mat: wood(2) }, (l) => rampZ(l) + 0.82, (l) => (broken && l > -0.5 ? 0 : rampZ(l) + 0.95), step));
        for (const l of [-1.5, 0, 1.5]) add({ l0: l - 0.08, l1: l + 0.08, c0, c1, z0: 0, z1: rampZ(l) + 0.95, mat: wood(1) });
      }
    }
  }
  return out;
}
function renderDiag(id, piece, state, k) {
  const cv = new Canvas(DG_W, DG_H, DG_X0, DG_Y0);
  for (const b of diagBoxes(id, piece, state, k)) drawDBox(cv, piece[0], b);
  return cv.im;
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

// ---- ART-C fortifications (Fortifier node): iron-bound gate leaves, a ditch kit, stake fields, wet-hide overlays.
const IRONC = [[30, 30, 34, 255], [46, 46, 52, 255], [66, 66, 72, 255], [92, 90, 92, 255]];
// iron plates 0.5 m square over the leaves, dark seams, a rivet at each plate corner, two heavy straps
const ironLeaf = (axis) => (f, x, y, z) => {
  const a = axis === 'x' ? x : y, pa = (a * 2) % 1, pz = (z * 2) % 1;
  if (Math.abs(z - 0.8) < 0.07 || Math.abs(z - 2.3) < 0.07) return IRONC[3];
  if (pa < 0.06 || pz < 0.06) return IRONC[0];
  if ((pa < 0.16 || pa > 0.9) && (pz < 0.16 || pz > 0.9)) return IRONC[3];
  return mul(IRONC[1 + Math.floor(hash(Math.floor(a * 2), Math.floor(z * 2), 9) * 2)], 0.94 + 0.12 * hash(Math.floor(a * 16), Math.floor(z * 16), 3));
};
// ditch (1 tile, a 16-frame kit by neighbour mask like the palisade): a pit 1.7 m wide and DITCH_D deep along the arms, the
// rest of the tile dug earth at ground level (it occludes the pit's near side). Engines cannot cross; men slow. States:
// foundation = the line strung and scratched, rising / scaffold = dug to 0.35 / 0.75 of the depth, done, damaged = half
// filled with fascines and earth (an attacker's crossing).
const DITCH_D = 1.4, DITCH_W = 1.4, DT = { w: 96, h: 60, x0: 48, y0: 24 };
const dirt = (f, x, y, z) => { const n = hash(Math.floor(x * 9), Math.floor(y * 9), 31), m = hash(Math.floor(x * 3), Math.floor(y * 3), 32); return mul(EARTH, (f === "top" ? 2.0 : 1.5 - 0.15 * Math.floor(-z * 3)) * (0.88 + 0.2 * n) * (m < 0.12 ? 0.85 : 1)); };
function ditchBoxes(mask, state, k = 3) {
  const rects = wallRects(mask, DITCH_W), inPit = (x, y) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  if (state === 'foundation') return [...foundation(wallEdges(mask, DITCH_W), 'wood', mask, 1)];
  const d = DITCH_D * ({ rising: 0.35, scaffold: 0.75 }[state] ?? 1), fillZ = state === 'damaged' ? -d * 0.45 : -d;
  const bottom = (f, x, y, z) => (state === 'damaged' ? (hash(Math.floor(x * 4), Math.floor(y * 12), 7) < 0.5 ? mul(TEX.wood[1], 0.8) : mul(EARTH, 1.3)) : mul(EARTH, 0.75 + 0.15 * hash(Math.floor(x * 8), Math.floor(y * 8), 5)));
  // drawn over the tile and 1 m into its neighbours (the pit runs straight on into a joined neighbour), then clipped to the
  // tile's diamond: the pit's far walls seen through this tile's opening may stand in the next tile
  const h = DITCH_W / 2, nb = (x, y) => (x < 0 ? mask & 4 && y >= 0 && y < 2 && Math.abs(y - 1) < h : x >= 2 ? mask & 1 && y >= 0 && y < 2 && Math.abs(y - 1) < h : y < 0 ? mask & 8 && Math.abs(x - 1) < h : y >= 2 ? mask & 2 && Math.abs(x - 1) < h : inPit(x, y));
  return cells(-1, 3, -1, 3, (x, y) => (nb(x, y) ? { z0: -d - 0.1, z1: fillZ, mat: bottom } : { z0: -d - 0.1, z1: 0, mat: dirt }));
}
// stakes (1 tile): nine sharpened stakes driven in at angles, pale cut points
function stakesBoxes(state, k = 5) {
  const n = { rising: 3, scaffold: 6 }[state] ?? 9, st = [];
  for (let i = 0; i < 9; i++) { const bx = 0.35 + (i % 3) * 0.65 + 0.2 * (hash(i, k, 1) - 0.5), by = 0.35 + Math.floor(i / 3) * 0.65 + 0.2 * (hash(i, k, 2) - 0.5), a = hash(i, k, 3) * Math.PI * 2, t = 0.35 + 0.25 * hash(i, k, 4), L = 1.15 + 0.3 * hash(i, k, 5); st.push({ b: [bx, by, 0], d: [Math.cos(a) * Math.sin(t), Math.sin(a) * Math.sin(t), Math.cos(t)], L: state === 'damaged' && i % 3 === 1 ? L * 0.4 : L }); }
  if (state === 'foundation') return st.slice(0, 4).map((s, i) => ({ x0: 0.2, x1: 1.6, y0: 0.3 + i * 0.35, y1: 0.42 + i * 0.35, z0: 0, z1: 0.12, mat: woodSolid(1 + (i % 2)) }));
  const M = { w: { mat: (f, x, y, z) => mul(TEX.wood[f === 'top' ? 3 : 1 + (hash(Math.floor(z * 8), Math.floor((x + y) * 6), 2) > 0.5 ? 1 : 0)], 1) }, tip: { mat: (f) => mul(TEX.wood[4], f === 'top' ? 1.05 : 0.9) } };
  return vox(0, 2, 0, 2, 0, 1.45, (x, y, z) => {
    for (const s of st.slice(0, n)) { const px = x - s.b[0], py = y - s.b[1], pz = z, t = px * s.d[0] + py * s.d[1] + pz * s.d[2]; if (t < 0 || t > s.L) continue; const r = 0.065 * Math.min(1, (s.L - t) / 0.25); const qx = px - t * s.d[0], qy = py - t * s.d[1], qz = pz - t * s.d[2]; if (qx * qx + qy * qy + qz * qz <= r * r) return s.L - t < 0.2 ? 'tip' : 'w'; }
    return null;
  }, M, 1 / 16, 1 / 32);
}
// wet hides hung over a wooden wall (rampart, palisade): an overlay drawn over the wall's own frame (same sheet layout).
// Rendered from the wall's own boxes: their side faces between zlo and zhi become hides, everything else only writes depth
// (a marker colour, cleared), so the overlay is exactly the visible part of the hides.
const OV_MARK = [255, 0, 255, 255];
const wetHide = (f, x, y, z, zhi) => { const a = f === '+x' || f === '-x' ? y : x, u = Math.floor(a * PPM), col = Math.floor(u / 15), fu = u - col * 15; const H = [[54, 38, 29], [78, 56, 40], [101, 76, 54], [124, 96, 70]]; if (fu < 1) return mul([...H[0], 255], SHADE[f]); if (Math.abs(z - zhi + 0.08) < 0.05) return mul([122, 104, 78, 255], SHADE[f]); const c = H[1 + Math.floor(hash(col & 63, 3, 36) * 2) + (hash(col & 63, Math.floor(u / 3), 35) > 0.85 ? 1 : 0)]; return mul([...c, 255], SHADE[f] * (0.72 + 0.1 * Math.sin(u * 1.7 + col))); };
function hideOverlay(boxes, w, h, ox, oy, zlo, zhiOf) {
  const bs = boxes.map((b) => ({ ...b, lit: true, mat: (f, x, y, z, u, r) => { const c = b.mat(f, x, y, z, u, r); if (!c) return null; const zhi = zhiOf(b); const bottom = zlo + 0.12 * Math.sin(along(f, x, y) * 4.1) + 0.1 * hash(Math.floor(along(f, x, y) * 2), 1, 37); return f !== 'top' && z >= bottom && z < zhi ? wetHide(f, x, y, z, zhi) : OV_MARK; } }));
  const im = renderBoxes(bs, w, h, ox, oy); for (let i = 0; i < im.data.length; i += 4) if (im.data[i] === 255 && im.data[i + 1] === 0 && im.data[i + 2] === 255) im.data[i + 3] = 0;
  return im;
}

// shared with siege.mjs (siege engines, ladders, rubble: the same renderer, textures and palette)
export { PPM, MX, MY, TEX, hash, mul, clamp, Canvas, drawBox, renderBoxes, cells, heap, ramp, beam, roof, sliced, masonry, rubMat, rough, flags, planks, woodSolid, solid, scorch, burn, soot, wreckProf, stakeProf, palisadeMat, foundation, loadTextures, extendPalette, footOf, hard, CHAR, EMBER, EARTH, STRING, DOORDARK, KITS };

// ======== main (only when run directly)
function main() {
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
// wall kits: the palisade (16 frames by mask, one layer); the walk tiers (81 frames by mask + open sides, back + front)
const sheetOut = (file, im) => { sprites.push({ sheet: true, file, im }); return file; };
for (const id of Object.keys(KITS)) {
  const K = KITS[id], files = {}, front = {};
  if (!K.layered) {
    for (const s of STATES) { const fr = renderKit(id, s); files[s] = sheetOut(`${id}-${s}.png`, gridSheet(fr, KIT_W, KIT_H, 16)); }
    kits.push({ id, kind: 'wall', material: K.material, burnable: K.burnable, heightM: K.heightM, thicknessM: K.thick, walkwayM: null, frames: 16, columns: 16, frame: { w: KIT_W, h: KIT_H }, tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, states: files, source: K.source });
    continue;
  }
  const g = LK(id);
  for (const s of STATES) { const L = renderLayered(id, s); files[s] = sheetOut(`${id}-${s}.png`, gridSheet(L.back, g.w, g.h, LK_COLS)); front[s] = sheetOut(`${id}-${s}-front.png`, gridSheet(L.front, g.w, g.h, LK_COLS)); }
  const post = sheetOut(`${id}-post.png`, renderBoxes(postBoxes(id), g.w, g.h, g.w / 2, g.y0));
  kits.push({ id, kind: 'wall', layered: true, post, material: K.material, burnable: K.burnable, heightM: K.heightM, thicknessM: K.thick, walkwayM: K.walkM, walkwayPx: Math.round(K.walkM * PPM), parapetM: K.paraH, parapetPx: Math.round(K.paraH * PPM), parapetThickM: K.para, walkwayWidthM: { oneDeep: +(2 - 2 * K.para).toFixed(2), twoDeep: +(4 - 2 * K.para).toFixed(2) }, frames: COMBOS.length, columns: LK_COLS, frameOf: FRAME_OF, frame: { w: g.w, h: g.h }, tileOrigin: { x: g.w / 2, y: g.y0 }, states: files, front, source: K.source });
}
for (const id of Object.keys(STAIRS)) { // player-placed stairs up to the walk
  const S = STAIRS[id], K = KITS[S.wall], files = {};
  for (const s of STATES) { const ims = STAIR_PIECES.map((p, i) => { const im = renderBoxes(stairBoxes(id, p, s, i + 1), ST_W, ST_H, ST_X0, ST_Y0); return s === 'damaged' ? (S.material === 'wood' ? burn(im, i) : soot(im, i)) : im; }); files[s] = sheetOut(`${id}-${s}.png`, gridSheet(ims, ST_W, ST_H, 8)); }
  kits.push({ id, kind: 'stair', material: S.material, burnable: S.burnable, wall: S.wall, topM: K.walkM, topPx: Math.round(K.walkM * PPM), pieces: STAIR_PIECES, footprints: STAIR_PIECES.map((p) => (p[0] === 'x' ? [Number(p[2]), 1] : [1, Number(p[2])])), wallAt: STAIR_PIECES.map((p) => ({ x: '+x', y: '+y' }[p[0]].replace('+', p[1]))), frames: STAIR_PIECES.length, columns: 8, frame: { w: ST_W, h: ST_H }, tileOrigin: { x: ST_X0, y: ST_Y0 }, states: files, source: S.source });
}
{ // ladders
  const files = {};
  for (const s of STATES) { const ims = LADDER_PIECES.map((p, i) => { const im = renderBoxes(ladderBoxes(p, s, i + 1), LD_W, LD_H, LD_W / 2, LD_Y0); return s === 'damaged' ? burn(im, i) : im; }); files[s] = sheetOut(`ladder-${s}.png`, gridSheet(ims, LD_W, LD_H, 12)); }
  kits.push({ id: 'ladder', kind: 'ladder', material: 'wood', burnable: true, pieces: LADDER_PIECES, topM: Object.fromEntries(Object.entries(LADDER_TARGETS).map(([t, v]) => [t, +v.toFixed(2)])), footprint: [1, 1], frames: LADDER_PIECES.length, columns: 12, frame: { w: LD_W, h: LD_H }, tileOrigin: { x: LD_W / 2, y: LD_Y0 }, states: files, source: 'renderer' });
}
{ // ART-C: the ditch (16 frames by neighbour mask, every state) and the wet-hide overlays (done walls only)
  const files = {};
  // the pit is below the ground: only what shows through the tile's own top diamond is drawn (neighbouring ground hides
  // the rest; a neighbouring ditch tile draws its own pit)
  const clipTile = (im) => { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (Math.abs(x + 0.5 - DT.x0) / 32 + Math.abs(y + 0.5 - DT.y0 - 16) / 16 > 1) im.data[(y * im.w + x) * 4 + 3] = 0; return im; };
  for (const s of STATES) files[s] = sheetOut(`ditch-${s}.png`, gridSheet([...Array(16)].map((_, m) => { const im = renderBoxes(ditchBoxes(m, s), DT.w, DT.h, DT.x0, DT.y0); return s === 'foundation' ? im : clipTile(im); }), DT.w, DT.h, 16));
  kits.push({ id: 'ditch', kind: 'ditch', material: 'earth', burnable: false, depthM: DITCH_D, widthM: DITCH_W, frames: 16, columns: 16, frame: { w: DT.w, h: DT.h }, tileOrigin: { x: DT.x0, y: DT.y0 }, states: files, note: 'frame = neighbour mask (+x 1, +y 2, -x 4, -y 8) of ditch tiles; a ground-level piece: draw it with the terrain (before anything standing on the tile). Engines cannot cross a done ditch; damaged = filled in (crossable)', source: 'renderer (W-ART-C)' });
  const pal = KITS.palisade, ov = [...Array(16)].map((_, m) => hideOverlay(kitBoxes('palisade', m, 'done'), KIT_W, KIT_H, KIT_W / 2, KIT_Y0, 0.45, () => pal.heightM - 0.45));
  kits.push({ id: 'hides-palisade', kind: 'overlay', overlayOf: 'palisade', material: 'hide', burnable: false, frames: 16, columns: 16, frame: { w: KIT_W, h: KIT_H }, tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, states: { done: sheetOut('hides-palisade-done.png', gridSheet(ov, KIT_W, KIT_H, 16)) }, note: 'wet hides (Fortifier): drawn over the palisade done frame of the same mask; the wall ignites at half the chance', source: 'renderer' });
  const g = LK('rampart'), back = [], front = [], cache = new Map();
  for (const [m, o] of COMBOS) { const k = `${m},${o}`; if (!cache.has(k)) { const B = cellBoxes('rampart', m, o, 'done'), zhi = (b) => b.z1 - 0.06; cache.set(k, [hideOverlay(B.map((b) => (b.layer === 'front' ? { ...b, mat: () => null } : b)), g.w, g.h, g.w / 2, g.y0, 0.4, zhi), hideOverlay(B.filter((b) => b.layer === 'front'), g.w, g.h, g.w / 2, g.y0, 3.2, zhi)]); } const [b, f] = cache.get(k); back.push(b); front.push(f); }
  kits.push({ id: 'hides-rampart', kind: 'overlay', overlayOf: 'rampart', layered: true, material: 'hide', burnable: false, frames: COMBOS.length, columns: LK_COLS, frameOf: FRAME_OF, frame: { w: g.w, h: g.h }, tileOrigin: { x: g.w / 2, y: g.y0 }, states: { done: sheetOut('hides-rampart-done.png', gridSheet(back, g.w, g.h, LK_COLS)) }, front: { done: sheetOut('hides-rampart-done-front.png', gridSheet(front, g.w, g.h, LK_COLS)) }, note: 'wet hides over the rampart done frames (back over back, front over front, same frameOf)', source: 'renderer' });
}
for (const id of Object.keys(TOWERS)) { // free-standing towers, joined level to a walk
  const T = TOWERS[id], K = KITS[T.wall], files = {}, front = {};
  for (const s of STATES) { const L = renderTower(id, s); files[s] = sheetOut(`${id}-${s}.png`, gridSheet(L.back, TW_W, TW_H, 16)); front[s] = sheetOut(`${id}-${s}-front.png`, gridSheet(L.front, TW_W, TW_H, 16)); }
  const stone = T.material === 'stone';
  kits.push({ id, kind: 'tower', layered: true, material: T.material, burnable: T.burnable, footprint: [2, 2], wall: T.wall, heightM: T.heightM, platformM: K.walkM, platformPx: Math.round(K.walkM * PPM), parapetM: stone ? K.paraH : 1.0, parapetPx: Math.round((stone ? K.paraH : 1.0) * PPM), access: stone ? 'door at ground level (first of +y, +x, -x, -y not open) + internal stair' : 'ladder (ladder piece tower-wood-<side> on an open side)', frames: 16, columns: 16, frameOf: 'open mask (+x 1, +y 2, -x 4, -y 8)', frame: { w: TW_W, h: TW_H }, tileOrigin: { x: TW_X0, y: TW_Y0 }, states: files, front, source: T.source });
}
for (const id of Object.keys(BRIDGES)) {
  const Bd = BRIDGES[id], files = {};
  for (const s of STATES) { const sheet = blank(KIT_W * BRIDGE_PIECES.length, KIT_H); BRIDGE_PIECES.forEach((p, i) => { let im = renderBoxes(bridgeBoxes(id, p, s, i + 1), KIT_W, KIT_H, KIT_W / 2, KIT_Y0); if (s === 'damaged') im = Bd.material === 'wood' ? scorch(im, i) : soot(im, i); paste(sheet, im, i * KIT_W, 0); }); files[s] = `${id}-${s}.png`; sprites.push({ sheet: true, file: files[s], im: sheet }); }
  const maxSpanTiles = Bd.material === 'wood' ? 12 : 24; // src/war/sim/economy.ts BRIDGE.maxSpan
  kits.push({ id, kind: 'bridge', material: Bd.material, burnable: Bd.burnable, deckM: Bd.deck, maxSpanTiles, pieces: BRIDGE_PIECES, frames: BRIDGE_PIECES.length, frame: { w: KIT_W, h: KIT_H }, tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, states: files, source: Bd.source });
  const dfiles = {};
  for (const s of STATES) { const ims = DIAG_PIECES.map((p, i) => { const im = renderDiag(id, p, s, i + 1); return s === 'damaged' ? (Bd.material === 'wood' ? scorch(im, i) : soot(im, i)) : im; }); dfiles[s] = sheetOut(`${id}-diag-${s}.png`, gridSheet(ims, DG_W, DG_H, DG_COLS)); }
  kits.push({ id: `${id}-diag`, kind: 'bridge-diag', material: Bd.material, burnable: Bd.burnable, deckM: Bd.deck, maxSpanTiles, pieces: DIAG_PIECES, frames: DIAG_PIECES.length, columns: DG_COLS, frame: { w: DG_W, h: DG_H }, tileOrigin: { x: DG_X0, y: DG_Y0 }, origin: 'the row centre on the ground (not a tile vertex)', rowStepPx: { h: [64, 0], v: [0, 32] }, states: dfiles, source: Bd.source });
}
// procedural structures: towers, gates and the keep (true scale; footprints = the sim's, src/war/sim/economy.ts)
const PROC = [
  { id: 'stone-tower', kind: 'tower', material: 'stone', burnable: false, footprint: [2, 2], heightM: TOWERS['tower-stone'].heightM, platformM: KITS['stone-wall'].walkM, inline: 'free-standing (kit tower-stone: layers, joined sides)', boxes: (s) => stoneTowerBoxes(s), source: TOWERS['tower-stone'].source },
  { id: 'stone-tower-round', kind: 'tower', material: 'stone', burnable: false, footprint: [2, 2], heightM: 8.6, inline: 'variant of stone-tower', boxes: rdTowerBoxes, source: 'renderer + cyclopean / isodomic elevations' },
  { id: 'wood-tower', kind: 'tower', material: 'wood', burnable: true, footprint: [2, 2], heightM: TOWERS['tower-wood'].heightM, platformM: KITS.rampart.walkM, inline: 'free-standing (kit tower-wood: layers, joined sides)', boxes: (s) => woodTowerBoxes(s), source: TOWERS['tower-wood'].source },
  { id: 'stone-gate-x', kind: 'gate', material: 'stone', burnable: false, footprint: [2, 1], axis: 'x', heightM: 6, inline: '2 wall tiles along x, opening along y', boxes: (s) => gateBoxes('stone', 'x', s), source: 'renderer + Lion Gate elevation (pixflux f1d20a40)' },
  { id: 'stone-gate-y', kind: 'gate', material: 'stone', burnable: false, footprint: [1, 2], axis: 'y', heightM: 6, inline: '2 wall tiles along y, opening along x', boxes: (s) => gateBoxes('stone', 'y', s), source: 'renderer + Lion Gate elevation (pixflux f1d20a40)' },
  { id: 'wood-gate-x', kind: 'gate', material: 'wood', burnable: true, footprint: [2, 1], axis: 'x', heightM: 4.9, inline: '2 wall tiles along x', boxes: (s) => gateBoxes('wood', 'x', s), source: 'renderer + palisade elevation' },
  { id: 'wood-gate-y', kind: 'gate', material: 'wood', burnable: true, footprint: [1, 2], axis: 'y', heightM: 4.9, inline: '2 wall tiles along y', boxes: (s) => gateBoxes('wood', 'y', s), source: 'renderer + palisade elevation' },
  ...['stone', 'wood'].flatMap((m) => [['x', '+', 's'], ['x', '-', 'n'], ['y', '+', 'e'], ['y', '-', 'w']].map(([axis, inner, side]) => ({
    id: `${m}-gate-${axis}-deep-${side}`, kind: 'gate', material: m, burnable: m === 'wood', footprint: [2, 2], axis, deep: side, heightM: m === 'stone' ? 6 : 4.9,
    inline: `2-deep wall gate: the ${m}-gate-${axis} on the line, its passage on the inner row (${side} side)`, boxes: (s) => gate2Boxes(m, axis, s, inner),
    source: m === 'stone' ? 'renderer + Lion Gate elevation (pixflux f1d20a40), composed 2 deep' : 'renderer + palisade elevation, composed 2 deep',
  }))),
  // ART-C fortifications: iron-bound gates (variants of every gate) and a stake field
  ...['stone', 'wood'].flatMap((m) => [['x', [2, 1]], ['y', [1, 2]]].map(([axis, fp]) => ({ id: `${m}-gate-${axis}-iron`, variantOf: `${m}-gate-${axis}`, kind: 'gate', material: m, burnable: m === 'wood', footprint: fp, axis, heightM: m === 'stone' ? 6 : 4.9, inline: `iron-bound ${m}-gate-${axis} (Fortifier: gate hp +50%)`, boxes: (s) => gateBoxes(m, axis, s, 3, { iron: true }), source: 'renderer (iron-bound leaves)' }))),
  ...['stone', 'wood'].flatMap((m) => [['x', '+', 's'], ['x', '-', 'n'], ['y', '+', 'e'], ['y', '-', 'w']].map(([axis, inner, side]) => ({ id: `${m}-gate-${axis}-deep-${side}-iron`, variantOf: `${m}-gate-${axis}-deep-${side}`, kind: 'gate', material: m, burnable: m === 'wood', footprint: [2, 2], axis, deep: side, heightM: m === 'stone' ? 6 : 4.9, inline: `iron-bound ${m}-gate-${axis}-deep-${side}`, boxes: (s) => gate2Boxes(m, axis, s, inner, 3, true), source: 'renderer (iron-bound leaves), composed 2 deep' }))),
  { id: 'stakes', kind: 'stakes', material: 'wood', burnable: true, footprint: [1, 1], heightM: 1.3, inline: 'stake field (Fortifier): men -50% speed, blocks engines; damaged = broken and burnt', boxes: (s) => stakesBoxes(s), source: 'renderer (W-ART-C)' },
  { id: 'pitch-kiln', kind: 'kiln', material: 'stone', burnable: false, footprint: [2, 2], heightM: KL.ventTop, boxes: (s) => kilnBoxes(s), source: 'renderer (W-35): clay dome on a stone ring, woodstack, pitch jars' },
  { id: 'keep', kind: 'keep', material: 'stone', burnable: false, footprint: [4, 4], heightM: 5.6, inline: 'the fort\'s citadel: a megaron on its terrace', boxes: megaronBoxes, source: 'renderer + cyclopean / isodomic elevations, drawn roof tiles' },
];
const rendered = {}; // id -> state -> { im, tileOrigin }
for (const p of PROC) {
  rendered[p.id] = {};
  for (const s of [...STATES, ...(p.kind === 'gate' ? ['open'] : [])]) {
    const post = s === 'damaged' ? (im) => (p.material === 'wood' ? burn(im, p.id.length) : soot(im, p.id.length)) : null;
    rendered[p.id][s] = renderModel(p.boxes(s), p.footprint[0], p.footprint[1], p.heightM + 1, post);
  }
}
// brazier (W-35): placed whole (buildOrder done only), unlit = done, destroyed = knocked over
const BRAZIER = { id: 'brazier', kind: 'brazier', material: 'bronze', burnable: false, footprint: [1, 1], heightM: 1.2, alias: { done: 'unlit', damaged: 'destroyed' }, source: 'renderer (W-35): bronze tripod brazier' };
rendered.brazier = {}; for (const s of ['unlit', 'lit', 'destroyed']) rendered.brazier[s] = renderModel(brazierBoxes(s), 1, 1, 1.6);
// fx anchors: siege fx[] ids drawn with their anchor on sprite px `at` (world point (x, y, z) m from the NW tile's top vertex)
const pxAt = (r, x, y, z, dx = 0, dy = 0) => ({ x: Math.round(r.tileOrigin.x + (x - y) * MX) + dx, y: Math.round(r.tileOrigin.y + (x + y) * MY - z * PPM) + dy });
{ const r = rendered.brazier.lit, c = (dx, dy) => pxAt(r, 1, 1, BZ.coal, dx, dy);
  BRAZIER.extra = { buildOrder: ['done'], progress: { done: 0 }, fx: { lit: [{ id: 'tongue-m-a', at: c(0, 0) }, { id: 'tongue-s-b', at: c(-5, 1) }, { id: 'tongue-s-c', at: c(5, 1) }, { id: 'embers', at: c(0, -16) }] } }; }
{ const P = PROC.find((p) => p.id === 'pitch-kiln'), r = rendered['pitch-kiln'].done, m = Math.atan2(1, 0.35);
  P.extra = { fx: { working: [{ id: 'smoke-wisp-b', at: pxAt(r, KL.cx, KL.cy, KL.ventTop), alpha: 0.45 }, { id: 'tongue-s-a', at: pxAt(r, KL.cx + KL.R * Math.cos(m), KL.cy + KL.R * Math.sin(m), KL.z0) }] } }; }
// props (one state); also the material piles of the PixelLab buildings' rising state
for (const o of PROPS) { const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) continue; const im = prepBuilding(o, f); const a = footOf(im); rendered[o.id] = { done: { im, tileOrigin: { x: a.x, y: im.h - 32 } } }; }
// rising (composited, no generation): the scaffold sprite cut down to its lower part along a 2:1 V line, a pile of its
// material by it
function rising(sc, o) {
  const im = { w: sc.im.w, h: sc.im.h, data: new Uint8Array(sc.im.data) }, bp = (o.footprint[0] + o.footprint[1]) * 16, Hs = Math.max(0, im.h - bp), cx = footOf(im).x;
  const [fw, fh] = o.footprint, L = [cx - fh * 32, im.h - fh * 16], Rv = [cx + fw * 32, im.h - fw * 16], T = [cx + (fw - fh) * 32, im.h - bp];
  const yf = (x) => im.h - Math.abs(x - cx) * 0.5, yb = (x) => (x < T[0] ? L[1] + ((x - L[0]) * (T[1] - L[1])) / (T[0] - L[0]) : T[1] + ((x - T[0]) * (Rv[1] - T[1])) / (Rv[0] - T[0]));
  const keep = Math.max(10, Hs * 0.3), cut = (x) => (yf(x) + yb(x)) / 2 - keep; // walls kept to ~1/3 of the scaffold's height over the footprint's middle line
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (y < cut(x)) im.data[(y * im.w + x) * 4 + 3] = 0;
  const pile = rendered[o.material === 'stone' ? 'stone-pile' : 'lumber-pile']?.done.im;
  if (pile) { const px = im.w - pile.w - 2, py = im.h - Math.round(bp / 2) - Math.round(pile.h * 0.75); for (let y = 0; y < pile.h; y++) for (let x = 0; x < pile.w; x++) { const i = (y * pile.w + x) * 4, j = ((py + y) * im.w + px + x) * 4; if (pile.data[i + 3] && py + y >= 0 && py + y < im.h && px + x >= 0) im.data.set(pile.data.subarray(i, i + 4), j); } }
  const box = alphaBox(dropSpecks(im, 0.002), 1);
  return { im: crop(im, box), tileOrigin: { x: sc.tileOrigin.x - box.x, y: sc.tileOrigin.y - box.y } };
}
// PixelLab buildings + their state raws
const loadState = (o, s) => { const f = join(RAW, 'objects', `${o.raw}-${s}.png`); return existsSync(f) ? f : null; };
for (const o of BUILDINGS) {
  const f = join(RAW, 'objects', `${o.raw}.png`); if (!existsSync(f)) { console.error('missing raw', o.raw); continue; }
  rendered[o.id] = {};
  const done = prepBuilding(o, f);
  const place = (im0) => { const im = shave(crop(im0, alphaBox(im0, 1)), o.plinth), a = footOf(im); return { im, tileOrigin: { x: a.x - (o.footprint[0] - o.footprint[1]) * 32, y: im.h - (o.footprint[0] + o.footprint[1]) * 16 } }; };
  const [fw, fh] = o.footprint;
  rendered[o.id].foundation = renderModel(foundation([[0, 0, fw * 2, 0, '-y'], [0, fh * 2, fw * 2, fh * 2, '+y'], [0, 0, 0, fh * 2, '-x'], [fw * 2, 0, fw * 2, fh * 2, '+x']], o.material, o.id.length, 1), fw, fh, 1);
  rendered[o.id].done = place(done);
  for (const s of ['scaffold', 'damaged']) { const sf = loadState(o, s); const k = Math.min(1, 400 / done.h, 400 / done.w); rendered[o.id][s] = place(sf ? prepBuilding({ ...o, ground: [...(o.ground ?? []), 'green'], scale: 1 / k, charHoles: s === 'damaged' }, sf) : stateInit(done, s, o.id.length)); } // the state init was the done sprite, shrunk by k to fit pixflux
  rendered[o.id].rising = rising(rendered[o.id].scaffold, o);
}
// ART-C working fx hooks (siege fx ids, anchors on the done sprite): found on the sprite, not hand placed: the hearth =
// the centroid of its fire-coloured px, the chimney / smoke hole = the top of the sprite near it
function workFx(o, im) {
  const { w, h, data: d } = im; let sx = 0, sy = 0, n = 0, ty = h, tx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!d[i + 3]) continue; if (y < ty) { ty = y; tx = x; } if (d[i] > 140 && d[i + 1] > 80 && d[i] - d[i + 2] > 72 && d[i] - d[i + 1] < 70) { sx += x; sy += y; n++; } }
  const fire = n >= 5 ? { x: Math.round(sx / n), y: Math.round(sy / n) } : null, top = { x: tx, y: ty }, up = (p, dy) => ({ x: p.x, y: p.y + dy });
  const chimney = o.level > 1 && ['forge', 'cookhouse'].includes(o.chain);
  const fx = [];
  if (fire && ['forge', 'cookhouse', 'infirmary', 'sorting-floor'].includes(o.chain)) fx.push({ id: 'heat-glow', at: fire }, { id: o.chain === 'forge' ? 'tongue-m-a' : 'tongue-s-a', at: up(fire, 2) });
  if (o.chain === 'forge' && fire) fx.push({ id: 'embers', at: up(fire, -14) });
  if (chimney) fx.push({ id: o.chain === 'forge' ? 'smoke-wisp-b' : 'smoke-wisp-a', at: top, alpha: o.chain === 'forge' ? 0.55 : 0.45 });
  else if (fire && ['forge', 'cookhouse'].includes(o.chain)) fx.push({ id: 'smoke-wisp-b', at: up(fire, -6), alpha: 0.4 });
  return { working: fx, ...(fx.length ? {} : { workingNote: 'no fx: the crafters\' work clips are the activity' }) };
}
for (const o of WORKPLACES) if (rendered[o.id]?.done) o.extra = { ...o.extra, fx: workFx(o, rendered[o.id].done.im) };
// fort (10 x 10 tiles, 20 m): a Mycenaean citadel. A cyclopean ring on the line 1..8, round towers on the corners, the
// Lion Gate in the +y side, the megaron on its terrace inside. Parts drawn back to front by their south vertex.
const FORT = { id: 'fort', kind: 'fort', material: 'stone', burnable: false, footprint: [10, 10] };
function composeFort(state) {
  const parts = [], solid = new Set(), cellsW = new Set(), K = (x, y) => `${x},${y}`;
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { parts.push({ ...rendered['stone-tower-round'][state], x, y, fw: 2, fh: 2 }); for (const d of [[0, 0], [1, 0], [0, 1], [1, 1]]) solid.add(K(x + d[0], y + d[1])); }
  parts.push({ ...rendered['stone-gate-x'][state], x: 4, y: 8, fw: 2, fh: 1 }); solid.add(K(4, 8)); solid.add(K(5, 8));
  for (let t = 2; t <= 7; t++) { cellsW.add(K(t, 1)); cellsW.add(K(1, t)); cellsW.add(K(8, t)); if (t < 4 || t > 5) cellsW.add(K(t, 8)); }
  const frames = kitFrames16('stone-wall', state), g = LK('stone-wall'), has = (x, y) => cellsW.has(K(x, y)) || solid.has(K(x, y));
  for (const c of cellsW) { const [x, y] = c.split(',').map(Number), m = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0); parts.push({ im: frames[m], tileOrigin: { x: g.w / 2, y: g.y0 }, x, y, fw: 1, fh: 1 }); }
  parts.push({ ...renderModel(megaronBoxes(state, 4, 2.6), 4, 4, 8.5, state === 'damaged' ? (im) => soot(im, 4) : null), x: 3, y: 2, fw: 4, fh: 4 }); // the citadel's terrace: 2.6 m
  parts.sort((a, b) => a.x + a.fw + a.y + a.fh - (b.x + b.fw + b.y + b.fh) || a.x - b.x);
  const sx = (x, y) => (x - y) * 32, sy = (x, y) => (x + y) * 16;
  const pos = parts.map((p) => ({ p, X: Math.round(sx(p.x, p.y) - p.tileOrigin.x), Y: Math.round(sy(p.x, p.y) - p.tileOrigin.y) }));
  const x0 = Math.min(...pos.map((q) => q.X)), y0 = Math.min(...pos.map((q) => q.Y)), x1 = Math.max(...pos.map((q) => q.X + q.p.im.w)), y1 = Math.max(...pos.map((q) => q.Y + q.p.im.h));
  const im = blank(x1 - x0, y1 - y0); for (const q of pos) paste(im, q.p.im, q.X - x0, q.Y - y0);
  const box = alphaBox(im, 1);
  return { im: crop(im, box), tileOrigin: { x: -x0 - box.x, y: -y0 - box.y } };
}
rendered.fort = {}; for (const s of STATES) rendered.fort[s] = composeFort(s);

// sprites + metadata
const all = [...PROC, ...BUILDINGS, FORT, BRAZIER, ...PROPS];
for (const o of all) {
  if (!rendered[o.id]) continue; const states = {};
  for (const [s, r] of Object.entries(rendered[o.id])) {
    const sid = `${o.id}-${s}`, a = footOf(r.im);
    const base = Math.min((o.footprint[0] + o.footprint[1]) * 16, r.im.h - 4), metres = +((r.im.h - base) / PPM).toFixed(2); // flat states (a field, a pitched-down camp) draw less than the diamond
    sprites.push({ file: `${sid}.png`, im: r.im, meta: { id: sid, kind: o.kind, file: `${sid}.png`, w: r.im.w, h: r.im.h, metres: Math.max(0.05, metres), basePx: base, anchor: a, tileOrigin: r.tileOrigin, footprint: o.footprint, blocksMovement: s !== 'foundation' && s !== 'destroyed' && o.kind !== 'farm', building: o.id, state: s, material: o.material, burnable: !!o.burnable, source: o.source ?? 'renderer' } });
    states[s] = sid;
  }
  for (const [a, s] of Object.entries(o.alias ?? {})) states[a] = states[s];
  buildings.push({ id: o.id, kind: o.kind, material: o.material, burnable: !!o.burnable, footprint: o.footprint, ...(o.axis && { axis: o.axis }), ...(o.deep && { deep: o.deep }), ...(o.inline && { inline: o.inline }), ...(o.heightM && { heightM: o.heightM }), ...(o.platformM && { platformM: o.platformM, platformPx: Math.round(o.platformM * PPM) }), ...(o.chain && { chain: o.chain, level: o.level, ...(o.upgrade && { upgrade: o.upgrade }), ...(o.from && { upgradeOf: o.from }) }), ...(o.variantOf && { variantOf: o.variantOf }), ...o.extra, states });
}
// palette + write
const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
// the 2-deep gates and the corner posts are composed of the kits' own colours: they snap to the palette without picking it
const pal = extendPalette([...G.palette, ...GO.palette], sprites.filter((s) => !s.meta?.id.includes('-deep-') && !s.file.endsWith('-post.png')).map((s) => s.im), 64);
for (const s of sprites) writeImage(join(OUT, s.file), snapToPalette(s.im, pal));
const json = {
  pxPerMetre: PPM, tileMetres: 2, borderMax: 0.75,
  note: 'Build-mode art (W-22..W-28). objects[]: one sprite per building state; anchor = foot (bottom centre); tileOrigin = px of the top (north) vertex of the footprint\'s north tile: draw at that tile\'s top vertex minus tileOrigin; metres = height above the footprint (h = metres x 33 + basePx, basePx = (fw + fh) x 16). kits[]: one sheet per state, frames in rows of `columns` (frame n at column n % columns, row floor(n / columns)), tileOrigin = the top vertex of the NW tile in every frame. Palisade: frame = neighbour mask (+x 1, +y 2, -x 4, -y 8; a wall, gate or tower tile). Layered kits (layered: true; rampart, stone-wall, tower-stone, tower-wood) have two sheets per state: states[s] = BACK layer (faces, walk surface, the -x / -y parapets), front[s] = FRONT layer (the +x / +y parapets or rails, the wood tower\'s roof and front posts). Draw per tile: back, then the units standing on that tile (on the walk at walkwayPx above the ground, on a tower at platformPx), then front, all before anything on tiles further south. Walls: frame = frameOf[mask | open << 4]; post (done walls): one frame, drawn over the back of a tile whose -x and -y sides are joined but whose -x -y diagonal is not (closes the parapet of that inner corner); mask = sides with a wall or gate tile of the same walk (no face, no parapet there); open = exposed sides with no parapet (a stair top, a joined tower, a ladder head; the face stays). A wall is built 2 tiles deep (walkwayWidthM). Towers: frame = open mask (sides joined to a walk at platform height, or with a ladder). Stairs: pieces <axis><+/-><length tiles>, rising towards the wall at wallAt; a unit stands at topM x (distance from the low end / length). Ladder: pieces <target>-<side of the face it leans on (n -y, e +x, s +y, w -x)>, top at topM[target]. Bridges: axis kits (bridge-*): frame = piece, one tile each (deck-<axis>, end-<axis><0|1>; suffix .l / .h / .n = rails on the low side across only / the high side only / none, for 2- and 3-wide bridges). Diagonal kits (bridge-*-diag): one frame per row segment of a bridge along a grid diagonal, <h|v><width>-<deck|end+|end->; tileOrigin = the row centre on the ground; rowStepPx = screen px from one row to the next. States: buildOrder (foundation -> rising -> scaffold -> done), each shown from progress[state] (share of the labour done), then damaged; gates also have open (leaves swung in). A building\'s own buildOrder / progress override these (brazier: placed whole, done only). Brazier (W-35, 1 tile): states unlit (= done), lit, destroyed (= damaged: knocked over, does not block); it has no ground of its own, so it stands on the ground or on a wall walk (draw it at walkwayPx up, like a unit). fx[state]: siege fx (public/war/siege/objects.json fx[] ids) drawn with their anchor on sprite px `at` of that state\'s sprite (phase per instance, alpha when given): brazier fx.lit = the flames and embers in the bowl; pitch-kiln fx.working = over the done sprite while it works (smoke from the vent, a flame in the stoking mouth). Colours = tiles.json palette + objects.json palette + palette.',
  buildOrder: BUILD_ORDER, progress: PROGRESS,
  palette: pal.slice(G.palette.length), kits, buildings, objects: sprites.filter((s) => s.meta).map((s) => s.meta),
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`buildings: ${kits.length} kits, ${buildings.length} buildings, ${json.objects.length} sprites, palette +${pal.length - G.palette.length - GO.palette.length}`);
process.exit(runBuildingsQa().length ? 1 : 0);
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
