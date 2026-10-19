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
  palisade: { material: 'wood', burnable: true, heightM: 3.0, thick: 0.4, source: 'pixflux 7eb5a5c5 (palisade elevation)' },
  'stone-wall': { material: 'stone', burnable: false, heightM: 5.97, walkM: 5.0, thick: 1.4, para: 0.45, source: 'pixflux 7055aa08 (cyclopean elevation)' },
};
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
  const H = wood ? K.heightM : K.walkM, B = [];
  const mat = wood ? palisadeMat() : masonry(TEX.cyclo, { top: state === 'done' ? flags : rough });
  const prof = state === 'scaffold' ? halfProf(H, mask, SCAF) : state === 'rising' ? halfProf(H, mask, RISE) : state === 'damaged' ? (wood ? stakeProf(H, mask + 7) : wreckProf(H, mask + 7)) : null;
  for (const r of rects) { const b = { ...r, z0: 0, z1: H, mat }; B.push(...(prof ? sliced(b, r.axis, prof) : [b])); }
  if (!wood && state === 'done') for (const e of edges) B.push(...parapet(e, K, TEX.cyclo, 165)); // damaged: the parapet is gone
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

// ---- towers (2 x 2 tiles, 4 m: inline on a wall line). Greek: a cyclopean socle, an ashlar shaft with arrow slits,
// an upper chamber with shuttered ports, a cornice and a terracotta roof (pyramidal / conical). Models in metres from
// the footprint's NW corner.
const TW = { S: 4, socle: 1.5, H: 7.2 }; // stocky, low-pitched roofs: Greek, not a castle
function sqTowerBoxes(state, k = 1) {
  const { S, socle, H } = TW, i0 = 0.3, i1 = S - 0.3, c = S / 2;
  if (state === 'foundation') return foundation(rectEdges(i0 - 0.1, i0 - 0.1, i1 + 0.1, i1 + 0.1), 'stone', k, 1.3);
  const iso = masonry(TEX.iso, { mod: 180, top: state === 'done' ? flags : rough });
  const shaft = (face, x, y, z, u, r) => {
    if (face !== 'top') { const a = along(face, x, y) - i0, w = i1 - i0; for (const p of [w * 0.3, w * 0.7]) if (Math.abs(a - p) < 0.07 && ((z > 2.3 && z < 3.3) || (z > 3.8 && z < 4.7))) return DOORDARK; for (const p of [w * 0.27, w * 0.73]) if (Math.abs(a - p) < 0.24 && z > 5.9 && z < 6.65) return Math.abs(a - p) > 0.17 || z > 6.58 ? mul(TEX.wood[1], 0.8) : DOORDARK; }
    return iso(face, x, y, z, u, r);
  };
  const B = [{ x0: i0 - 0.12, x1: i1 + 0.12, y0: i0 - 0.12, y1: i1 + 0.12, z0: 0, z1: socle, mat: masonry(TEX.cyclo, { row0: 6, top: rough }) }];
  const body = { x0: i0, x1: i1, y0: i0, y1: i1, z0: socle, z1: H, mat: shaft };
  if (state === 'done') {
    B.push(body, { x0: i0 - 0.14, x1: i1 + 0.14, y0: i0 - 0.14, y1: i1 + 0.14, z0: H, z1: H + 0.22, mat: masonry(TEX.iso, { row0: 3 }) });
    const [f, d] = pyramid(c, c, c - i0 + 0.42, H + 0.22, 1.0); B.push(...roof(i0 - 0.42, i1 + 0.42, i0 - 0.42, i1 + 0.42, f, d));
  } else if (state === 'rising') {
    B.push(...sliced(body, 'x', (a) => socle + halfProf(H - socle, k, 0.2)(a)), ...stack(1.0, S - 0.1, false, k), ...stack(S - 0.05, 1.2, false, k + 3));
  } else if (state === 'scaffold') {
    B.push(...sliced(body, 'x', (a) => socle + halfProf(H - socle, k, SCAF)(a)));
    const top = socle + (H - socle) * SCAF + 0.5; B.push(...scaffold('x', i0, i1, i1, 1, top), ...scaffold('y', i0, i1, i1, 1, top));
  } else { // wrecked: the shaft broken off unevenly, a corner gone, roof fallen in, charred beams, rubble and tiles at its foot
    B.push(...sliced(body, 'x', (a) => socle + (H - socle) * (0.3 + 0.35 * hash(Math.floor(a * 1.2), k, 3) * (a > c ? 1 : 0.7))));
    const ch = woodSolid(0); B.push({ x0: 1.2, x1: 1.34, y0: 2.6, y1: 2.74, z0: H * 0.55, z1: H * 0.8, mat: ch }, { x0: 2.7, x1: 2.84, y0: 1.0, y1: 1.14, z0: H * 0.6, z1: H * 0.9, mat: ch });
    B.push(...heap(c + 0.6, S + 0.15, 1.3, 0.55, 0.85, k + 40, rubMat(k)), ...heap(S + 0.15, c - 0.4, 0.55, 1.2, 0.7, k + 41, rubMat(k + 1)), ...heap(c - 0.7, S + 0.05, 0.7, 0.4, 0.4, k + 42, rubMat(k + 2, TEX.tile)));
  }
  return B;
}
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
function woodTowerBoxes(state, k = 2) {
  const S = 4, pal = palisadeMat(), i0 = 0.45, i1 = S - 0.45, skirt = 2.6, plat = 5.4, top = 7.4;
  if (state === 'foundation') return foundation(rectEdges(i0, i0, i1, i1), 'wood', k, 0.66);
  const skirtMat = (f, x, y, z, u, r) => (f === 'top' ? planks('x', 5)(f, x, y) : pal(f, x, y, z, u, palRow(r, skirt)));
  const sk = { x0: i0, x1: i1, y0: i0, y1: i1, z0: 0, z1: skirt, mat: skirtMat };
  const posts = [[i0, i0], [i1 - 0.34, i0], [i0, i1 - 0.34], [i1 - 0.34, i1 - 0.34]];
  if (state === 'rising') { const B = sliced(sk, 'x', halfProf(skirt, k, 0.35)); for (const [x, y] of posts.slice(0, 2)) B.push({ x0: x, x1: x + 0.34, y0: y, y1: y + 0.34, z0: 0, z1: 3.2, mat: woodSolid(2) }); B.push(...stack(0.6, S - 0.2, true, k), ...stack(S - 0.1, 0.8, true, k)); return B; }
  if (state === 'scaffold') { const B = [sk]; for (const [x, y] of posts) B.push({ x0: x, x1: x + 0.34, y0: y, y1: y + 0.34, z0: 0, z1: top, mat: woodSolid(2) }); B.push({ x0: i0 - 0.35, x1: (i0 + i1) / 2, y0: i0 - 0.35, y1: i1 + 0.35, z0: plat, z1: plat + 0.25, mat: planks('x', 6) }, ...scaffold('x', i0, i1, i1, 1, 3.6), ...scaffold('y', i0, i1, i1, 1, 3.6)); return B; }
  const dmg = state === 'damaged', B = [];
  B.push(...(dmg ? sliced(sk, 'x', stakeProf(skirt, k)) : [sk]));
  for (const [i, [x, y]] of posts.entries()) B.push({ x0: x, x1: x + 0.34, y0: y, y1: y + 0.34, z0: 0, z1: dmg ? [top, 3.4, top * 0.8, 2.2][i] : top, mat: woodSolid(1) });
  const pl = { x0: i0 - 0.35, x1: i1 + 0.35, y0: i0 - 0.35, y1: i1 + 0.35, z0: plat, z1: plat + 0.25, mat: planks('x', 6) };
  if (dmg) B.push({ ...pl, x1: (i0 + i1) / 2, y1: (i0 + i1) / 2 + 0.3 }); else B.push(pl); // half the platform hangs on
  const rail = (b) => B.push({ ...b, z0: plat + 0.25, z1: plat + 1.25, mat: (f, x, y, z, u, r) => (f === 'top' ? null : pal(f, x, y, z, u, palRow(r, 1.0))) });
  if (!dmg) { rail({ x0: pl.x0, x1: pl.x1, y0: pl.y1 - 0.12, y1: pl.y1 }); rail({ x0: pl.x1 - 0.12, x1: pl.x1, y0: pl.y0, y1: pl.y1 - 0.12 }); rail({ x0: pl.x0, x1: pl.x1, y0: pl.y0, y1: pl.y0 + 0.12 }); rail({ x0: pl.x0, x1: pl.x0 + 0.12, y0: pl.y0 + 0.12, y1: pl.y1 - 0.12 }); }
  else rail({ x0: pl.x0, x1: (i0 + i1) / 2, y0: pl.y0, y1: pl.y0 + 0.12 });
  if (!dmg) { const [f, d] = pyramid(S / 2, S / 2, S / 2 - i0 + 0.5, top, 1.5); B.push(...roof(i0 - 0.5, i1 + 0.5, i0 - 0.5, i1 + 0.5, f, d, { tex: shingles })); }
  else B.push(...wreckage('x', 0.4, k + 9, true, 0, S, S - 0.4), ...wreckage('y', 0.4, k + 11, true, 0, S, S - 0.4));
  return B;
}

// ---- gates: 2 tiles along the wall line (the sim's), 4 m: a 2.8 m opening. Stone: the Lion Gate (monolithic jambs, a
// massive lintel, the relieving triangle with its relief), its block 1.7 m deep; wood: two heavy posts, a beam with a
// fighting walk, two log leaves. Modelled along u (the wall axis) / v (across), then mapped. state 'open': leaves swung in.
function gateBoxes(material, axis, state, k = 3) {
  const stone = material === 'stone', L = 4, out = [];
  const map = (b) => (axis === 'x' ? { ...b, x0: b.u0, x1: b.u1, y0: b.v0, y1: b.v1 } : { ...b, x0: b.v0, x1: b.v1, y0: b.u0, y1: b.u1 });
  const add = (b) => out.push(map(b)), uv = (b) => map({ ...b, u0: b.x0, u1: b.x1, v0: b.y0, v1: b.y1 });
  const front = (face) => (axis === 'x' ? face === '+y' || face === '-y' : face === '+x' || face === '-x');
  const ua = (face, x, y) => { const a = axis === 'x' ? x : y; return axis === 'x' ? a : L - a; }; // left to right as seen
  const v0 = stone ? 0.15 : 0.7, v1 = stone ? 1.85 : 1.3, o0 = stone ? 0.6 : 0.55, o1 = L - o0;
  if (state === 'foundation') return foundation(rectEdges(0, v0, L, v1), material, k, stone ? 1.3 : 1).map((b) => (axis === 'x' ? b : { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }));
  const half = state === 'scaffold' || state === 'rising', low = state === 'rising', dmg = state === 'damaged', open = state === 'open';
  const doorMat = (f, x, y, z) => { const a = (axis === 'x' ? x : y) + (axis === 'x' ? y : x), n = Math.floor(a * 3.3); if ((z > 0.8 && z < 0.92) || (z > 2.3 && z < 2.42)) return mul(TEX.wood[0], 1.2); if (stone && (z * 4) % 1 < 0.12 && n % 2) return [96, 78, 52, 255]; return n % 2 ? TEX.wood[1] : TEX.wood[2]; };
  const hinge = stone ? 1.45 : 1.3, dz = stone ? 3.2 : 3.0;
  const leaves = () => {
    if (open) { add({ u0: o0, u1: o0 + 0.14, v0: hinge - (o1 - o0) / 2, v1: hinge, z0: 0, z1: dz, mat: doorMat }); add({ u0: o1 - 0.14, u1: o1, v0: hinge - (o1 - o0) / 2, v1: hinge, z0: 0, z1: dz, mat: doorMat }); }
    else add({ u0: o0, u1: o1, v0: hinge - 0.14, v1: hinge, z0: 0, z1: dz, mat: (f, x, y, z, u, r) => (Math.abs((axis === 'x' ? x : y) - L / 2) < 0.03 ? DOORDARK : stone ? doorMat(f, x, y, z) : f === 'top' ? CHAR : palisadeMat()(f, x, y, z, u, palRow(r, dz))) });
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
      for (const e of [[0, v0, L, v0, '-y'], [0, v1, L, v1, '+y']]) { const [p, q, r, s, n] = e; out.push(...parapet(axis === 'x' ? e : [q, p, s, r, n === '-y' ? '-x' : '+x'], { walkM: walk, heightM: top, para: 0.45 }, TEX.cyclo, 165)); }
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
      for (const v of [[0.4, 0.52], [1.48, 1.6]]) add({ u0: -0.1, u1: L + 0.1, v0: v[0], v1: v[1], z0: bm + 0.42, z1: bm + 1.3, mat: (f, x, y, z, u, r) => (f === 'top' ? null : pal(f, x, y, z, u, palRow(r, 0.88))) });
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
  const dmg = state === 'damaged', half = state === 'scaffold' || state === 'rising', low = state === 'rising';
  if (!end) {
    if (stone) {
      const arch = (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : TEX.arches.px(u, r));
      const prof = null; // damaged: parapets broken, soot (a holed arch reads as a floating pier)
      const body = { u0: 0, u1: 2, v0: 0, v1: 2, z0: 0, z1: low ? 0.8 : half ? 1.5 : D, mat: arch };
      if (prof) out.push(...sliced(map(body), axis, prof)); else add(body);
      if (half && !low) { // timber centring under the arch and no parapets yet
        add({ u0: 0.6, u1: 1.9, v0: 0.1, v1: 1.9, z0: 0, z1: 1.2, mat: (f, x, y, z) => ((Math.floor(z * 4) + Math.floor((axis === 'x' ? x : y) * 4)) % 3 ? null : TEX.wood[1]) });
      }
      if (!half) for (const v of [[0, 0.3], [1.7, 2]]) { const pb = { u0: 0, u1: 2, v0: v[0], v1: v[1], z0: D, z1: D + 0.8, mat: (f, x, y, z, u, r) => (f === 'top' ? TEX.stone[3] : TEX.arches.px(u, r + Math.round(D * PPM))) }; if (dmg && v[0] > 0) out.push(...sliced(map(pb), axis, (a) => (a > 0.4 && a < 1.6 ? D : D + 0.8))); else add(pb); }
    } else {
      const tr = (f, x, y, z, u, r) => (f === 'top' ? TEX.wood[2] : TEX.trestle.px(u, r));
      for (const v of [[0.05, 0.2], [1.8, 1.95]]) {
        const sb = { u0: 0, u1: 2, v0: v[0], v1: v[1], z0: 0, z1: low ? D * 0.45 : half ? D - 0.3 : D + 1.0, mat: tr };
        if (dmg && v[0] > 1) out.push(...sliced(map(sb), axis, (a) => (a > 0.5 && a < 1.6 ? 1.2 : D + 1.0))); else add(sb);
      }
      const deck = { u0: 0, u1: 2, v0: 0.2, v1: 1.8, z0: D - 0.25, z1: D, mat: planks(axis === 'x' ? 'x' : 'y', 2) };
      if (low) { /* piles only */ } else if (half) add({ ...deck, u1: 1.0 }); else if (dmg) { add({ ...deck, u1: 0.7 }); add({ ...deck, u0: 1.45 }); } else add(deck);
    }
  } else {
    const prof = (a) => Math.max(0.05, ramp(a));
    const body = { u0: 0, u1: 2, v0: stone ? 0 : 0.2, v1: stone ? 2 : 1.8, z0: 0, z1: D, mat: stone ? (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : TEX.ashlar.px(u, r)) : (f, x, y, z, u, r) => (f === 'top' ? planks(axis === 'x' ? 'x' : 'y', 4)(f, x, y) : (z * 5) % 1 < 0.18 ? TEX.wood[0] : mul(TEX.wood[1 + (Math.floor(z * 5) % 2)], 0.92 + 0.16 * hash(Math.floor(u / 3), Math.floor(z * 5), 4))) };
    const p2 = low ? (a) => Math.min(prof(a), D * 0.22) : half && stone ? (a) => Math.min(prof(a), D * 0.45) : dmg ? (a) => prof(a) * (0.7 + 0.3 * hash(Math.floor(a * 5), k, 2)) : prof;
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
// procedural structures: towers, gates and the keep (true scale; footprints = the sim's, src/war/sim/economy.ts)
const PROC = [
  { id: 'stone-tower', kind: 'tower', material: 'stone', burnable: false, footprint: [2, 2], heightM: 8.5, inline: '2 x 2 on the wall line (its NW tile on the line)', boxes: sqTowerBoxes, source: 'renderer + cyclopean / isodomic elevations (pixflux 7055aa08, b1c53889)' },
  { id: 'stone-tower-round', kind: 'tower', material: 'stone', burnable: false, footprint: [2, 2], heightM: 8.6, inline: 'variant of stone-tower', boxes: rdTowerBoxes, source: 'renderer + cyclopean / isodomic elevations' },
  { id: 'wood-tower', kind: 'tower', material: 'wood', burnable: true, footprint: [2, 2], heightM: 9.4, inline: '2 x 2 on the wall line', boxes: woodTowerBoxes, source: 'renderer + palisade elevation' },
  { id: 'stone-gate-x', kind: 'gate', material: 'stone', burnable: false, footprint: [2, 1], axis: 'x', heightM: 6, inline: '2 wall tiles along x, opening along y', boxes: (s) => gateBoxes('stone', 'x', s), source: 'renderer + Lion Gate elevation (pixflux f1d20a40)' },
  { id: 'stone-gate-y', kind: 'gate', material: 'stone', burnable: false, footprint: [1, 2], axis: 'y', heightM: 6, inline: '2 wall tiles along y, opening along x', boxes: (s) => gateBoxes('stone', 'y', s), source: 'renderer + Lion Gate elevation (pixflux f1d20a40)' },
  { id: 'wood-gate-x', kind: 'gate', material: 'wood', burnable: true, footprint: [2, 1], axis: 'x', heightM: 4.9, inline: '2 wall tiles along x', boxes: (s) => gateBoxes('wood', 'x', s), source: 'renderer + palisade elevation' },
  { id: 'wood-gate-y', kind: 'gate', material: 'wood', burnable: true, footprint: [1, 2], axis: 'y', heightM: 4.9, inline: '2 wall tiles along y', boxes: (s) => gateBoxes('wood', 'y', s), source: 'renderer + palisade elevation' },
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
  const place = (im0) => { const im = crop(im0, alphaBox(im0, 1)), a = footOf(im); return { im, tileOrigin: { x: a.x - (o.footprint[0] - o.footprint[1]) * 32, y: im.h - (o.footprint[0] + o.footprint[1]) * 16 } }; };
  const [fw, fh] = o.footprint;
  rendered[o.id].foundation = renderModel(foundation([[0, 0, fw * 2, 0, '-y'], [0, fh * 2, fw * 2, fh * 2, '+y'], [0, 0, 0, fh * 2, '-x'], [fw * 2, 0, fw * 2, fh * 2, '+x']], o.material, o.id.length, 1), fw, fh, 1);
  rendered[o.id].done = place(done);
  for (const s of ['scaffold', 'damaged']) { const sf = loadState(o, s); const k = Math.min(1, 400 / done.h, 400 / done.w); rendered[o.id][s] = place(sf ? prepBuilding({ ...o, ground: [...(o.ground ?? []), 'green'], scale: 1 / k, charHoles: s === 'damaged' }, sf) : stateInit(done, s, o.id.length)); } // the state init was the done sprite, shrunk by k to fit pixflux
  rendered[o.id].rising = rising(rendered[o.id].scaffold, o);
}
// fort (10 x 10 tiles, 20 m): a Mycenaean citadel. A cyclopean ring on the line 1..8, round towers on the corners, the
// Lion Gate in the +y side, the megaron on its terrace inside. Parts drawn back to front by their south vertex.
const FORT = { id: 'fort', kind: 'fort', material: 'stone', burnable: false, footprint: [10, 10] };
function composeFort(state) {
  const parts = [], solid = new Set(), cellsW = new Set(), K = (x, y) => `${x},${y}`;
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { parts.push({ ...rendered['stone-tower-round'][state], x, y, fw: 2, fh: 2 }); for (const d of [[0, 0], [1, 0], [0, 1], [1, 1]]) solid.add(K(x + d[0], y + d[1])); }
  parts.push({ ...rendered['stone-gate-x'][state], x: 4, y: 8, fw: 2, fh: 1 }); solid.add(K(4, 8)); solid.add(K(5, 8));
  for (let t = 2; t <= 7; t++) { cellsW.add(K(t, 1)); cellsW.add(K(1, t)); cellsW.add(K(8, t)); if (t < 4 || t > 5) cellsW.add(K(t, 8)); }
  const frames = renderKit('stone-wall', state), has = (x, y) => cellsW.has(K(x, y)) || solid.has(K(x, y));
  for (const c of cellsW) { const [x, y] = c.split(',').map(Number), m = (has(x + 1, y) ? 1 : 0) | (has(x, y + 1) ? 2 : 0) | (has(x - 1, y) ? 4 : 0) | (has(x, y - 1) ? 8 : 0); parts.push({ im: frames[m], tileOrigin: { x: KIT_W / 2, y: KIT_Y0 }, x, y, fw: 1, fh: 1 }); }
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
  note: 'Build-mode art (W-22..W-24). objects[]: one sprite per building state; anchor = foot (bottom centre); tileOrigin = px of the top (north) vertex of the footprint\'s north tile: draw at that tile\'s top vertex minus tileOrigin; metres = height above the footprint (h = metres x 33 + basePx, basePx = (fw + fh) x 16). kits[]: walls and bridges, one sheet per state, frame per piece, tileOrigin = the tile\'s top vertex in every frame; wall frame index = neighbour mask (+x 1, +y 2, -x 4, -y 8; a neighbour is a wall, gate or tower tile); bridge frames = pieces. Towers and gates sit inline: walls run up to their footprint. States: buildOrder (foundation -> rising -> scaffold -> done), each shown from progress[state] (share of the labour done), then damaged; gates also have open (leaves swung in). Colours = tiles.json palette + objects.json palette + palette.',
  buildOrder: BUILD_ORDER, progress: PROGRESS,
  palette: pal.slice(G.palette.length), kits, buildings, objects: sprites.filter((s) => s.meta).map((s) => s.meta),
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`buildings: ${kits.length} kits, ${buildings.length} buildings, ${json.objects.length} sprites, palette +${pal.length - G.palette.length - GO.palette.length}`);
process.exit(runBuildingsQa().length ? 1 : 0);
