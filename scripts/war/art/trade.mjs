// Trade art (ART-T, WAR.md "Trade") -> public/war/trade/ (objects.json + PNGs): the handcart and the wagon (4 facings,
// halted, moving loop, burning, wrecked, burnt; cargo overlays per kind and load), the wagon's mule team, the chest, the
// strongbox, loot piles (3 sizes, gear-heavy and goods-heavy) and the agora price board. The stalls are the market-stall
// chain and the warehouse is a building (both in public/war/buildings). Prompts and lessons: PROMPTS_ART.md "Trade art".
// Usage: node scripts/war/art/trade.mjs [pixellab dir]   (raws in <dir>/trade/raw: trade-fetch.mjs)
//
// Carts, chests, the strongbox and the board are voxel models (implicit shapes sampled on a 1/16 m grid, 1/33 m up) drawn
// by the box renderer of buildings.mjs at true scale; a model is built once along +x and turned to its four facings (e +x,
// s +y, w -x, n -y), its materials reading local coordinates so the grain, spokes and boards turn with it.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette, resizeArea, resizeNearest } from '../../art/lib/ops.mjs';
import { PPM, MX, MY, TEX, hash, mul, clamp, renderBoxes, scorch, burn, loadTextures, extendPalette, footOf, hard, EMBER } from './buildings.mjs';
import { runTradeQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const RAW = join(PIX, 'trade/raw'), OUT = join(ROOT, 'public/war/trade');
const B = JSON.parse(readFileSync(join(ROOT, 'public/war/buildings/objects.json')));
const FACINGS = ['e', 's', 'w', 'n'];
loadTextures();

// ---- voxel models: fn(x, y, z, P) -> material key | null in local metres (x along the facing); P: pose parameters
const DXY = 1 / 16, DZ = 1 / 33;
const turn = (f, L) => (b) => (f === 'e' ? b : f === 'w' ? { ...b, x0: L - b.x1, x1: L - b.x0 } : f === 's' ? { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : { ...b, x0: b.y0, x1: b.y1, y0: L - b.x1, y1: L - b.x0 });
const turnPt = (f, L) => ([x, y]) => (f === 'e' ? [x, y] : f === 'w' ? [L - x, y] : f === 's' ? [y, x] : [y, L - x]);
const unturn = (f, L) => (x, y) => (f === 'e' ? [x, y] : f === 'w' ? [L - x, y] : f === 's' ? [y, x] : [L - y, x]);
// columns of runs of one material; bounds in local metres
function voxels(fn, [x0, x1, y0, y1, z1], M, f, L) {
  const out = [], T = turn(f, L), U = unturn(f, L);
  for (let x = x0; x < x1 - 1e-9; x += DXY) for (let y = y0; y < y1 - 1e-9; y += DXY) {
    let run = null; const cx = x + DXY / 2, cy = y + DXY / 2;
    for (let z = 0; z < z1 - 1e-9; z += DZ) {
      const k = fn(cx, cy, z + DZ / 2);
      if (k && run && run.k === k) { run.z1 = z + DZ; continue; }
      if (run) out.push(run); run = k ? { k, x0: x, x1: x + DXY, y0: y, y1: y + DXY, z0: z, z1: z + DZ } : null;
    }
    if (run) out.push(run);
  }
  return out.map((b) => { const m = M[b.k] ?? M.mark; return { ...T(b), mat: (face, X, Y, Z) => m(face, ...U(X, Y), Z) }; });
}
const PAD = 60;
const canvasOf = (Lx, Ly, Hm) => { const ox = Ly * MX + PAD, oy = Math.ceil(Hm * PPM) + PAD; return { W: (Lx + Ly) * MX + 2 * PAD, H: oy + (Lx + Ly) * MY + PAD, ox, oy }; };
const MARK = [255, 0, 255, 255];
const isMark = (d, i) => d[i + 3] && d[i + 1] === 0 && d[i] === d[i + 2] && d[i] > 100; // the marker after face shading
const unmark = (im) => { for (let i = 0; i < im.data.length; i += 4) if (isMark(im.data, i)) im.data[i + 3] = 0; return im; };
// crop a full-canvas image (or a set on one canvas) to its union; tileOrigin = px of world (0, 0, 0)
function cropSet(ims, C) {
  const bb = ims.map((im) => alphaBox(im, 1)).filter((b) => b.w > 0);
  const x0 = Math.min(...bb.map((b) => b.x)), y0 = Math.min(...bb.map((b) => b.y)), x1 = Math.max(...bb.map((b) => b.x + b.w)), y1 = Math.max(...bb.map((b) => b.y + b.h));
  return { ims: ims.map((im) => crop(im, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })), tileOrigin: { x: C.ox - x0, y: C.oy - y0 } };
}
const cropOne = (im, C) => { const r = cropSet([im], C); return { im: r.ims[0], tileOrigin: r.tileOrigin }; };
const strip = (ims) => { const s = blank(ims[0].w * ims.length, ims[0].h); ims.forEach((im, i) => paste(s, im, i * im.w, 0)); return s; };
const screenOf = (r, f, L) => ([x, y, z]) => { const [X, Y] = turnPt(f, L)([x, y]); return { x: Math.round(r.tileOrigin.x + (X - Y) * MX), y: Math.round(r.tileOrigin.y + (X + Y) * MY - z * PPM) }; };

// ---- materials (local coordinates)
const W = () => TEX.wood;
const grain = (i, k = 0, along = 'x') => (face, x, y, z) => { const a = along === 'x' ? y : x; const n = Math.floor(a * 9 + z * 3); return mul(W()[i], 0.86 + 0.2 * hash(n & 63, Math.floor((along === 'x' ? x : y) * 2), k)); };
const boards = (i, k = 0) => (face, x, y, z) => { if (face === 'top') return mul(W()[Math.min(4, i + 1)], 0.9 + 0.15 * hash(Math.floor(y * 8), Math.floor(x * 2), k)); const r = Math.floor(z * 8); const seam = (z * 8) % 1 < 0.14; return seam ? W()[0] : mul(W()[i], 0.88 + 0.16 * hash(r & 31, Math.floor((x + y) * 3), k)); };
const IRON = [[30, 30, 34, 255], [46, 46, 52, 255], [66, 66, 72, 255], [92, 90, 92, 255]];
const iron = (face) => IRON[face === 'top' ? 3 : 2];
const BRONZE = [[64, 48, 30, 255], [104, 78, 44, 255], [142, 108, 58, 255], [176, 140, 84, 255]];
const bronze = (face) => BRONZE[face === 'top' ? 3 : 2];
const ROPE = [[92, 78, 58, 255], [122, 104, 78, 255], [148, 128, 96, 255]];
const rope = (face, x, y, z) => ROPE[(Math.floor((x + z) * 14) + Math.floor(y * 14)) % 3];
const CANVAS = [[74, 62, 46], [102, 86, 64], [128, 110, 82], [152, 132, 100]].map((c) => [...c, 255]);
const CLAY = [[76, 40, 26], [108, 58, 34], [138, 78, 46], [164, 102, 64]].map((c) => [...c, 255]);
const ORE = [[34, 34, 38], [52, 50, 54], [72, 68, 70], [96, 80, 66]].map((c) => [...c, 255]);
const SILVER = [[90, 92, 96], [140, 142, 146], [190, 192, 194]].map((c) => [...c, 255]);
const WHITE = [[150, 144, 128], [178, 170, 152], [204, 196, 176]].map((c) => [...c, 255]); // whitewash (leukoma)
const PAINTC = { red: [120, 44, 32, 255], black: [32, 26, 22, 255], ochre: [160, 116, 52, 255], green: [66, 90, 52, 255], blue: [52, 72, 96, 255] };
const DARK = [24, 19, 16, 255];
const shade = (R, k) => (face, x, y, z) => mul(R[face === 'top' ? Math.min(R.length - 1, 2) : 1], 0.85 + 0.25 * hash(Math.floor(x * 12), Math.floor(y * 12) + Math.floor(z * 12), k));
const solid = (c) => () => c;
const M0 = { mark: solid(MARK), dark: solid(DARK), iron, bronze, rope, ember: solid(EMBER) };

// ---- shapes
const inBox = (x, y, z, x0, x1, y0, y1, z0, z1) => x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1;
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1;
const cylX = (x, y, z, x0, x1, cy, cz, r) => x >= x0 && x < x1 && (y - cy) ** 2 + (z - cz) ** 2 <= r * r;
// a wheel in the x-z plane at (cx, cz), y0..y1: rim, `spokes` spokes turned by `ph` (rad), a hub; solid: a disc of planks
function wheel(x, y, z, cx, cz, R, y0, y1, ph, spokes, solidDisc = false) {
  if (y < y0 || y >= y1) return null; const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz); if (r > R) return null;
  if (r < R * 0.16) return 'hub';
  if (r > R - 0.025) return 'tyre';
  if (r > R - 0.07) return 'rim';
  const a = Math.atan2(dz, dx) + ph;
  if (solidDisc) { const u = dx * Math.cos(ph) - dz * Math.sin(ph); return Math.abs(((u / 0.18) % 1 + 1) % 1) < 0.12 ? 'seam' : r > R - 0.13 ? 'rim' : 'disc'; } // planks rotate with the wheel
  const s = (2 * Math.PI) / spokes, m = ((a % s) + s) % s; return Math.min(m, s - m) * r < 0.045 ? 'spoke' : null;
}
const WHEEL_M = { tyre: (f) => IRON[f === 'top' ? 3 : 2], hub: (f) => mul(BRONZE[1], f === 'top' ? 1.2 : 1), rim: grain(1, 3, 'y'), spoke: grain(2, 4, 'y'), disc: grain(2, 5, 'y'), seam: solid(mul(W()[0], 0.8)) };

// ---- handcart: a two-wheeled box cart, 1.6 x 1.1 m bed on two 1.1 m spoked wheels, two shafts 1.6 m forward with a
// cross-bar, a prop leg at the back. Pulled by two men, one outside each shaft. Local: x forward over [0, L], y across.
const HC = { L: 4, Wd: 2, bed: [0.5, 2.1, 0.45, 1.55], floor: [0.62, 0.68], side: 0.3, wheel: { x: 1.3, R: 0.55, z: 0.55, y: [[0.3, 0.38], [1.62, 1.7]] }, Hm: 1.6 };
function handcartFn(P = {}) {
  const { ph = 0, wreck = false } = P, [bx0, bx1, by0, by1] = HC.bed, [f0, f1] = HC.floor, wh = HC.wheel;
  return (x, y, z0) => {
    let z = z0;
    if (wreck) { // the +y wheel broken off: the bed slews down onto its +y corner, the wheel lies flat beside it
      if (y > 1.75) { const d = Math.hypot(x - 1.0, y - 2.25); if (d < wh.R && z < 0.07) return d > wh.R - 0.07 ? 'rim' : d < 0.1 ? 'hub' : Math.abs(Math.sin((Math.atan2(y - 2.25, x - 1.0) + 0.3) * 3)) * d < 0.05 ? 'spoke' : null; return null; }
      z = z0 + Math.max(0, (y - 0.5)) * 0.42 + Math.max(0, x - 2.2) * 0.1;
      if (y > 1.55 && y < 1.75) return null;
    }
    for (const [a, b] of wh.y) { if (wreck && a > 1) continue; const w = wheel(x, y, z, wh.x, wh.z, wh.R, a, b, ph, 6); if (w) return w; }
    if (cylX(y, x, z, 0.38, 1.62, wh.x, wh.z, 0.05)) return 'iron'; // axle (along y: swapped args)
    if (inBox(x, y, z, bx0, bx1, by0, by1, f0, f1)) return 'floor';
    const sideTop = f1 + HC.side - (wreck ? 0.18 * hash(Math.floor(x * 4), 1, 7) : 0);
    if (inBox(x, y, z, bx0, bx1, by0, by0 + 0.05, f1, sideTop) || inBox(x, y, z, bx0, bx1, by1 - 0.05, by1, f1, sideTop)) return (x * 4) % 1 < 0.1 ? 'post' : 'side';
    if (inBox(x, y, z, bx0, bx0 + 0.05, by0, by1, f1, f1 + 0.3) || inBox(x, y, z, bx1 - 0.05, bx1, by0, by1, f1, f1 + 0.22)) return 'side';
    // shafts: from under the bed to the cross-bar at hand height (0.85 m)
    for (const sy of [0.6, 1.4]) { if (wreck && sy > 1 && x > 2.6) continue; const zc = f0 - 0.04 + Math.max(0, x - 1.6) * 0.1; if (x > 1.0 && x < 3.75 && Math.abs(y - sy) < 0.04 && Math.abs(z - zc) < 0.04) return 'shaft'; }
    if (!wreck && x > 3.6 && x < 3.68 && y > 0.56 && y < 1.44 && Math.abs(z - (f0 - 0.04 + 0.2)) < 0.035) return 'shaft';
    if (!wreck && x > bx0 + 0.05 && x < bx0 + 0.12 && Math.abs(y - 1) < 0.04 && z < f0) return 'shaft'; // prop leg
    return null;
  };
}
const CART_M = { ...M0, ...WHEEL_M, floor: grain(3, 6), side: boards(3, 7), post: grain(1, 8, 'y'), shaft: grain(3, 9) };

// ---- wagon (hamaxa): a four-wheeled box wagon, 3.4 x 1.4 m bed on solid plank wheels (0.84 m), plank sides, a driver's
// bench, a 2.3 m pole to a yoke over a pair of mules. Local: the body over x 0.3..3.7, the team ahead to x 6.
const WG = { L: 6, Wd: 2, bed: [0.3, 3.7, 0.3, 1.7], floor: [0.82, 0.9], side: 0.34, wheels: [0.95, 3.05], R: 0.42, wy: [[0.12, 0.22], [1.78, 1.88]], Hm: 2.0 };
function wagonFn(P = {}) {
  const { ph = 0, wreck = false } = P, [bx0, bx1, by0, by1] = WG.bed, [f0, f1] = WG.floor;
  return (x, y, z0) => {
    let z = z0;
    if (wreck) {
      if (y > 1.9) { const d = Math.hypot(x - 3.3, y - 2.45); if (d < WG.R && z < 0.08) return d > WG.R - 0.07 ? 'rim' : d < 0.08 ? 'hub' : 'disc'; return null; }
      z = z0 + Math.max(0, x - 1.8) * 0.3 * Math.max(0, y - 0.4) * 0.9; // the front +y wheel gone: the corner down
      if (x > 2.5 && y > 1.72) return null;
    }
    for (const wx of WG.wheels) for (const [a, b] of WG.wy) { if (wreck && wx > 2 && a > 1) continue; const w = wheel(x, y, z, wx, WG.R, WG.R, a, b, ph, 0, true); if (w) return w; }
    for (const wx of WG.wheels) if (cylX(y, x, z, 0.22, 1.78, wx, WG.R, 0.05)) return 'iron';
    if (inBox(x, y, z, bx0 + 0.3, bx1 - 0.3, 0.85, 1.15, WG.R - 0.03, f0)) return 'post'; // perch beam
    if (inBox(x, y, z, bx0, bx1, by0, by1, f0, f1)) return 'floor';
    const st = f1 + WG.side - (wreck ? 0.3 * hash(Math.floor(x * 3), Math.floor(y), 9) : 0);
    if (inBox(x, y, z, bx0, bx1, by0, by0 + 0.05, f1, st) || inBox(x, y, z, bx0, bx1, by1 - 0.05, by1, f1, st)) return (x * 2.5) % 1 < 0.06 ? 'post' : 'side';
    if (inBox(x, y, z, bx0, bx0 + 0.05, by0, by1, f1, f1 + WG.side) || inBox(x, y, z, bx1 - 0.05, bx1, by0, by1, f1, f1 + WG.side)) return 'side';
    if (!wreck && inBox(x, y, z, bx1 - 0.45, bx1 - 0.1, by0 + 0.05, by1 - 0.05, f1 + 0.4, f1 + 0.47)) return 'bench';
    if (!wreck && inBox(x, y, z, bx1 - 0.45, bx1 - 0.4, by0 + 0.1, by0 + 0.15, f1, f1 + 0.4)) return 'post';
    if (!wreck && inBox(x, y, z, bx1 - 0.45, bx1 - 0.4, by1 - 0.15, by1 - 0.1, f1, f1 + 0.4)) return 'post';
    // pole: from the front axle to the yoke; the yoke across the mules' necks at 1.15 m
    if (!wreck && x > 2.9 && x < 6.0 && Math.abs(y - 1) < 0.05 && Math.abs(z - (0.62 + (x - 2.9) * 0.08)) < 0.05) return 'shaft';
    if (wreck && x > 2.9 && x < 4.6 && Math.abs(y - 1 - (x - 2.9) * 0.15) < 0.05 && z < 0.1) return 'shaft'; // the pole broken, on the ground
    if (!wreck && x > 5.55 && x < 5.65 && y > 0.25 && y < 1.75 && Math.abs(z - 1.12) < 0.05) return 'yoke';
    return null;
  };
}
const WAGON_M = { ...CART_M, bench: grain(3, 10), yoke: grain(3, 11, 'y') };

// ---- cargo per kind, in a bed [x0, x1, y0, y1] on a floor at z0; level 1 = half, 2 = full. Fn returns cargo keys.
const CARGO = ['sacks', 'crates', 'amphorae', 'logs', 'ore', 'strongbox'];
function cargoFn(kind, lvl, [x0, x1, y0, y1], z0, k = 1) {
  const L = x1 - x0, Wd = y1 - y0, back = x0 + 0.08, side = y0 + 0.07;
  if (kind === 'sacks') { const items = []; const nx = Math.max(1, Math.floor((L - 0.1) / 0.55)), ny = Math.max(1, Math.floor((Wd - 0.1) / 0.45)); for (let l = 0; l < lvl; l++) for (let i = 0; i < (l ? nx - 1 : lvl === 1 ? Math.ceil(nx / 2) : nx); i++) for (let j = 0; j < (l ? ny - 0 : ny); j++) items.push([back + 0.28 + i * 0.55 + l * 0.27, side + 0.2 + j * ((Wd - 0.54) / Math.max(1, ny - 1)), z0 + 0.15 + l * 0.24, hash(i, j, l + k)]); return (x, y, z) => { for (const [cx, cy, cz, h] of items) if (ell(x, y, z, cx, cy, cz, 0.3, 0.22 + 0.03 * h, 0.16)) return z > cz + 0.1 && Math.abs(x - cx) < 0.05 ? 'twine' : h > 0.5 ? 'sack' : 'sack2'; return null; }; }
  if (kind === 'crates') { const items = []; const nx = Math.floor((L - 0.1) / 0.55), ny = Math.max(1, Math.floor((Wd - 0.1) / 0.5)); for (let l = 0; l < lvl; l++) for (let i = 0; i < (lvl === 1 ? Math.ceil(nx / 2) : l ? nx - 1 : nx); i++) for (let j = 0; j < ny; j++) items.push([back + i * 0.55 + l * 0.27, side + j * 0.5, z0 + l * 0.42]); return (x, y, z) => { for (const [cx, cy, cz] of items) if (inBox(x, y, z, cx, cx + 0.5, cy, cy + 0.46, cz, cz + 0.4)) { const ex = Math.min(x - cx, cx + 0.5 - x), ey = Math.min(y - cy, cy + 0.46 - y), ez = Math.min(z - cz, cz + 0.4 - z); return Math.min(ex, ey) < 0.04 || ez < 0.04 ? 'slat' : 'crate'; } return null; }; }
  if (kind === 'amphorae') { const items = []; const nx = Math.floor((L - 0.05) / 0.36), ny = Math.floor((Wd - 0.05) / 0.36); for (let i = 0; i < (lvl === 1 ? Math.ceil(nx / 2) : nx); i++) for (let j = 0; j < ny; j++) items.push([back + 0.18 + i * 0.36 + (j % 2) * 0.06, side + 0.18 + j * 0.36]); const H = 0.62; return (x, y, z) => { for (const [cx, cy] of items) { const t = (z - z0) / H; if (t < 0 || t > 1) continue; const r = t < 0.15 ? 0.06 + t * 0.7 : t < 0.7 ? 0.17 - (t - 0.42) ** 2 * 0.6 : t < 0.85 ? 0.07 : t < 0.92 ? 0.09 : 0; if (Math.hypot(x - cx, y - cy) <= r) return t > 0.85 ? 'clay2' : 'clay'; } return null; }; }
  if (kind === 'logs') { const rows = lvl === 1 ? [3] : [4, 3, 2], r = 0.13, out = []; rows.forEach((n, l) => { for (let j = 0; j < n; j++) out.push([side + r + j * 2 * r + l * r + (Wd - 0.14 - rows[0] * 2 * r) / 2, z0 + r + l * r * 1.75]); }); return (x, y, z) => { if (x < x0 + 0.02 || x > x1 + 0.35) return null; for (const [cy, cz] of out) { const d = Math.hypot(y - cy, z - cz); if (d <= r) return x > x1 + 0.3 || x < x0 + 0.05 ? (d < r * 0.6 ? 'logend' : 'bark') : 'bark'; } return null; }; }
  if (kind === 'ore') { const hm = lvl === 1 ? 0.22 : 0.42, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = L / 2 - 0.04, ry = Wd / 2 - 0.05; return (x, y, z) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d > 1 || z < z0) return null; const top = z0 + hm * (1 - d * 0.75) * (0.75 + 0.5 * hash(Math.floor(x * 11), Math.floor(y * 11), k + 3)); return z < top ? (hash(Math.floor(x * 14), Math.floor(y * 14) + Math.floor(z * 14), 5) > 0.93 ? 'rust' : 'ore') : null; }; }
  if (kind === 'strongbox') { const n = lvl, items = [...Array(n)].map((_, i) => [x0 + 0.15 + i * 0.85, (y0 + y1) / 2 - 0.25]); return (x, y, z) => { for (const [bx, by] of items) { const s = strongboxFn('closed', bx, by, z0)(x, y, z); if (s) return s; } return null; }; }
  return () => null;
}
const CARGO_M = { sack: shade(CANVAS, 21), sack2: (f, x, y, z) => mul(shade(CANVAS, 22)(f, x, y, z), 0.88), twine: solid(ROPE[1]), crate: (f, x, y, z) => mul(W()[f === 'top' ? 4 : 3], 0.92 + 0.14 * hash(Math.floor(x * 8), Math.floor(y * 8) + Math.floor(z * 8), 23)), slat: grain(2, 24), clay: shade(CLAY, 25), clay2: (f, x, y, z) => mul(CLAY[0], 1), bark: (f, x, y, z) => mul(W()[f === 'top' ? 3 : 2], 0.85 + 0.3 * hash(Math.floor(x * 6), Math.floor((y + z) * 14), 26)), logend: (f, x, y, z) => mul([196, 160, 112, 255], 1 - 0.25 * hash(Math.floor(y * 30), Math.floor(z * 30), 27)), ore: shade(ORE, 28), rust: solid(ORE[3]) };

// ---- strongbox: 0.7 x 0.5 x 0.42 m of dark oak, bronze-bound, studded, a lock plate on the front (+y); NW corner (bx, by)
function strongboxFn(state, bx = 0.65, by = 0.75, z0 = 0) {
  const X1 = bx + 0.7, Y1 = by + 0.5, ZL = z0 + 0.32, ZT = z0 + 0.42;
  return (x, y, z) => {
    const inBody = inBox(x, y, z, bx, X1, by, Y1, z0, ZL);
    if (inBody) {
      if (state !== 'closed' && x > bx + 0.05 && x < X1 - 0.05 && y > by + 0.05 && y < Y1 - 0.05 && z > z0 + 0.06) return state === 'open' && z < z0 + 0.27 ? (hash(Math.floor(x * 30), Math.floor(y * 30), 4) > 0.5 ? 'coin' : 'coin2') : state === 'open' ? null : z < z0 + 0.1 ? 'dark' : null;
      const band = Math.abs(x - bx - 0.12) < 0.035 || Math.abs(X1 - x - 0.12) < 0.035 || z > ZL - 0.04 || z < z0 + 0.04;
      if (y > Y1 - 0.02 && Math.abs(x - (bx + X1) / 2) < 0.06 && z > ZL - 0.16 && z < ZL - 0.02) return 'lock';
      if (band && hash(Math.floor(x * 25), Math.floor(z * 25), 12) > 0.82) return 'stud';
      return band ? 'bronze' : 'oak';
    }
    if (state === 'closed' && inBox(x, y, z, bx, X1, by, Y1, ZL, ZT) && ((x - bx) ** 2 * 0 + ((y - (by + Y1) / 2) / 0.25) ** 2 + ((z - ZL) / 0.1) ** 2 <= 1.25)) return Math.abs(x - bx - 0.12) < 0.035 || Math.abs(X1 - x - 0.12) < 0.035 ? 'bronze' : 'oak';
    if (state === 'open' && inBox(x, y, z, bx, X1, by - 0.1, by, ZL, ZL + 0.45)) return Math.abs(x - bx - 0.12) < 0.035 || Math.abs(X1 - x - 0.12) < 0.035 ? 'bronze' : 'oak'; // lid up behind
    if (state === 'looted' && inBox(x, y, z, bx + 0.35, X1 + 0.3, Y1 + 0.05, Y1 + 0.55, 0, 0.08)) return 'oak'; // lid thrown down
    if (state === 'looted' && z < 0.03 && hash(Math.floor(x * 20), Math.floor(y * 20), 13) > 0.97 && Math.hypot(x - (X1 + 0.1), y - (Y1 + 0.2)) < 0.5) return 'coin';
    return null;
  };
}
const BOX_M = { ...M0, oak: (f, x, y, z) => mul(W()[f === 'top' ? 2 : 1], 0.95 + 0.2 * hash(Math.floor(z * 10), Math.floor((x + y) * 5), 31)), bronze, stud: solid(BRONZE[3]), lock: solid(IRON[3]), coin: solid(SILVER[2]), coin2: solid(SILVER[1]) };

// ---- chest: a 1.0 x 0.6 m plank chest with a rounded lid, iron bands and corner straps, a hasp; closed / open (lid up,
// goods inside) / looted (lid half torn off and askew, a front board stove in, empty, scraps spilt)
function chestFn(state) {
  const X0 = 0.5, X1 = 1.5, Y0 = 0.7, Y1 = 1.3, ZB = 0.45, R = 0.3;
  const bandX = (x) => Math.abs(x - X0 - 0.15) < 0.04 || Math.abs(X1 - x - 0.15) < 0.04;
  return (x, y, z) => {
    if (inBox(x, y, z, X0, X1, Y0, Y1, 0, ZB)) {
      const inner = x > X0 + 0.05 && x < X1 - 0.05 && y > Y0 + 0.05 && y < Y1 - 0.05 && z > 0.06;
      if (state !== 'closed' && inner) return state === 'open' && z < ZB - 0.06 ? (Math.hypot(x - 0.8, y - 1) < 0.22 ? 'sack' : hash(Math.floor(x * 12), Math.floor(y * 12), 3) > 0.55 ? 'clay' : 'dark') : state === 'open' ? null : z < 0.12 ? 'dark' : null;
      if (state === 'looted' && y > Y1 - 0.06 && x > 0.85 && x < 1.2 && z > 0.12 && z < 0.38) return null; // stove-in board
      if (y > Y1 - 0.02 && Math.abs(x - 1) < 0.05 && z > ZB - 0.14) return 'lock';
      if (bandX(x) || z > ZB - 0.035 || z < 0.04) return 'ironb';
      return 'plank';
    }
    if (state === 'closed') { const dy = y - (Y0 + Y1) / 2, dz = z - ZB; if (x >= X0 && x < X1 && dz >= 0 && (dy / R) ** 2 + (dz / 0.16) ** 2 <= 1) return bandX(x) ? 'ironb' : 'plank'; }
    if (state === 'open') { if (inBox(x, y, z, X0, X1, Y0 - 0.12, Y0, ZB, ZB + 0.58)) return bandX(x) ? 'ironb' : 'plank'; }
    if (state === 'looted') { // the lid hanging down the back from one hinge, tilted
      const t = (x - X0) / (X1 - X0); if (x >= X0 && x < X1 - 0.25 && y >= Y0 - 0.14 - t * 0.2 && y < Y0 - 0.02 - t * 0.2 && z >= ZB - 0.35 + t * 0.3 && z < ZB + 0.2 + t * 0.1) return bandX(x) ? 'ironb' : 'plank';
      if (z < 0.05 && Math.hypot(x - 1.55, y - 1.55) < 0.3 && hash(Math.floor(x * 9), Math.floor(y * 9), 6) > 0.7) return hash(Math.floor(x * 9), Math.floor(y * 9), 7) > 0.5 ? 'plank' : 'clay';
    }
    return null;
  };
}
const CHEST_M = { ...M0, plank: boards(2, 41), ironb: iron, lock: solid(IRON[3]), sack: shade(CANVAS, 42), clay: shade(CLAY, 43) };

// ---- price board: a whitewashed board (leukoma) framed in oak on two posts over a two-step limestone base, under a small
// tiled pent roof; painted rows on both faces (+y and +x see the market): a coloured mark for the good, black tallies for
// ask / bid, a red rule under the header. Damaged: the board split and hanging, the roof down, soot.
const BD = { W: 1.5, H: 1.0, z0: 1.05 };
function boardFn(state) {
  const dmg = state === 'damaged';
  return (x, y, z) => {
    if (inBox(x, y, z, 0.15, 1.85, 0.55, 1.45, 0, 0.16) || inBox(x, y, z, 0.3, 1.7, 0.7, 1.3, 0.16, 0.3)) return dmg && z > 0.2 && hash(Math.floor(x * 6), Math.floor(y * 6), 2) > 0.7 ? null : 'lime';
    for (const px of [0.2, 1.75]) if (inBox(x, y, z, px, px + 0.07, 0.95, 1.05, 0.3, dmg && px > 1 ? 1.4 : 2.2)) return 'post';
    const bz0 = BD.z0, bz1 = BD.z0 + BD.H;
    let zz = z; if (dmg && x > 1.0) zz = z + (x - 1.0) * 0.9; // the right half sagging off its post
    if (x >= 0.27 && x < 1.75 && y >= 0.95 && y < 1.05 && zz >= bz0 && zz < bz1) {
      if (dmg && Math.abs(x - 1.0) < 0.03) return null;
      const fx = Math.min(x - 0.27, 1.75 - x), fz = Math.min(zz - bz0, bz1 - zz); if (fx < 0.05 || fz < 0.05) return 'frame';
      return 'board';
    }
    if (!dmg && inBox(x, y, z, 0.1, 1.9, 0.8, 1.2, 2.18, 2.28)) return 'roof';
    if (dmg && inBox(x, y, z, 1.9, 2.3, 0.4, 1.7, 0, 0.12)) return 'roof'; // fallen roof boards
    return null;
  };
}
// the painted face: u along the board (0..1.48 m), v down from its top (0..1 m)
function boardFace(u, v) {
  if (v > 0.07 && v < 0.15) return u > 0.1 && u < 1.38 && Math.floor(u * 22) % 3 !== 2 ? PAINTC.black : null; // header letters
  if (v > 0.17 && v < 0.19 && u > 0.07 && u < 1.41) return PAINTC.red;
  const row = Math.floor((v - 0.22) / 0.12), fv = ((v - 0.22) / 0.12) % 1; if (row < 0 || row > 5 || fv < 0.3 || fv > 0.75) return null;
  const goods = [PAINTC.ochre, PAINTC.green, PAINTC.red, PAINTC.blue, SILVER[1], PAINTC.black];
  if (u > 0.08 && u < 0.18) return goods[row];
  if (u > 0.26 && u < 0.66 && Math.floor(u * 40) % 3 === 0 && hash(row, Math.floor(u * 40), 5) > 0.25) return PAINTC.black; // ask tallies
  if (u > 0.78 && u < 1.36 && Math.floor(u * 40) % 3 === 0 && hash(row, Math.floor(u * 40), 6) > 0.4) return PAINTC.red; // bid tallies
  return null;
}
const BOARD_M = { ...M0, lime: (f, x, y, z) => mul(TEX.lime[f === 'top' ? 3 : 2], 0.9 + 0.15 * hash(Math.floor(x * 7), Math.floor(y * 7) + Math.floor(z * 7), 51)), post: grain(1, 52, 'y'), frame: grain(1, 53), roof: (f, x, y) => mul(TEX.tile[1 + (Math.floor(x * 5) % 2)], 1),
  board: (f, x, y, z) => { const v = BD.z0 + BD.H - z, c = f === '+y' || f === '-y' || f === 'top' ? boardFace(x - 0.27, v) : null; return c ?? mul(WHITE[1 + Math.floor(hash(Math.floor(x * 9), Math.floor(z * 9), 54) * 2)], 1); } };

// ---- render helpers
const sprites = [], sheets = [];
function sprite(id, kind, r, fp, extra = {}) {
  const a = footOf(r.im), base = Math.min((fp[0] + fp[1]) * 16, r.im.h - 4);
  sprites.push({ im: r.im, meta: { id, kind, file: `${id}.png`, w: r.im.w, h: r.im.h, metres: Math.max(0.05, +((r.im.h - base) / PPM).toFixed(2)), basePx: base, anchor: a, tileOrigin: r.tileOrigin, footprint: fp, blocksMovement: false, ...extra } });
  return id;
}
const render = (fn, bounds, M, f, L, C) => renderBoxes(voxels(fn, bounds, M, f, L), C.W, C.H, C.ox, C.oy);
// cargo drawn with the cart as an occluder (the cart in the marker colour, then dropped): only the visible cargo stays
const both = (a, b) => (x, y, z) => a(x, y, z) ?? b(x, y, z);

// ---- carts
const carts = [];
const PH8 = [...Array(8)].map((_, i) => (i * Math.PI) / 24); // 6-spoke wheel: one spoke step (60 deg) over 8 frames ... 8 x 7.5 deg
for (const C0 of [
  { id: 'handcart', kind: 'cart', S: HC, fn: handcartFn, M: CART_M, loads: 6, bed: [HC.bed[0] + 0.05, HC.bed[1] - 0.05, HC.bed[2] + 0.05, HC.bed[3] - 0.05], floor: HC.floor[1], ph: PH8, crew: [[3.0, 0.3], [3.0, 1.7]], crewNote: 'two pullers, one outside each shaft, facing the way the cart faces (any class; WAR.md: one alone x0.5)', fire: [[1.3, 1.0, 0.9], [0.8, 0.5, 0.95], [1.8, 1.5, 0.95], [1.3, 0.34, 0.6]] },
  { id: 'wagon', kind: 'wagon', S: WG, fn: wagonFn, M: WAGON_M, loads: 12, bed: [WG.bed[0] + 0.05, WG.bed[1] - 0.5, WG.bed[2] + 0.05, WG.bed[3] - 0.05], floor: WG.floor[1], ph: [...Array(8)].map((_, i) => (i * Math.PI) / 16), crew: [[4.2, -0.35]], crewNote: 'the driver walks at the near mule\'s head on the -y side, leading the team (WAR.md: a driver within 2 tiles)', team: [[4.75, 0.55], [4.75, 1.45]], fire: [[2.0, 1.0, 1.3], [1.0, 0.4, 1.35], [3.0, 1.6, 1.35], [0.95, 0.15, 0.5]] },
]) {
  const { S } = C0, e = { id: C0.id, kind: C0.kind, material: 'wood', burnable: true, loads: C0.loads, facings: FACINGS, heightM: S.Hm, footprint: {}, crew: {}, crewNote: C0.crewNote, ...(C0.team && { team: {}, teamNote: 'two mules side by side under the yoke: draw mule sprites (trade.mules) at these tile offsets (their feet) before the wagon when the team is behind it on screen (facing w, n), after it otherwise' }), states: {}, moving: {}, cargo: {}, fx: {}, stateNote: '' };
  for (const f of FACINGS) {
    const L = S.L, fp = f === 'e' || f === 'w' ? [S.L / 2, S.Wd / 2] : [S.Wd / 2, S.L / 2], [Lx, Ly] = f === 'e' || f === 'w' ? [L, S.Wd] : [S.Wd, L], C = canvasOf(Lx + 1, Ly + 1, S.Hm), bounds = [-0.4, L + 0.4, -0.4, S.Wd + 0.8, S.Hm];
    e.footprint[f] = fp;
    const tp = (pts) => pts.map(turnPt(f, L)).map(([x, y]) => [+(x / 2).toFixed(2), +(y / 2).toFixed(2)]);
    e.crew[f] = tp(C0.crew); if (C0.team) e.team[f] = tp(C0.team);
    const halted = render(C0.fn({ ph: 0 }), bounds, C0.M, f, L, C), moving = C0.ph.map((ph) => render(C0.fn({ ph }), bounds, C0.M, f, L, C));
    const wreck = render(C0.fn({ wreck: true }), bounds, C0.M, f, L, C);
    const k = 60 + FACINGS.indexOf(f) + C0.id.length, cp = (im) => ({ w: im.w, h: im.h, data: new Uint8Array(im.data) });
    const shots = { halted, burning: scorch(cp(halted), k, 0.6), wrecked: scorch(cp(wreck), k + 1, 0.35), burnt: burn(cp(wreck), k + 2) };
    const set = cropSet(moving, C), rs = {};
    e.states[f] = {}; for (const [s, im] of Object.entries(shots)) { rs[s] = cropOne(im, C); e.states[f][s] = sprite(`${C0.id}-${f}-${s}`, C0.kind, rs[s], fp, { blocksMovement: false, material: 'wood', burnable: true, cart: C0.id, facing: f, state: s, source: 'renderer (voxel model)' }); }
    const mv = set.ims, file = `${C0.id}-${f}-moving.png`; sheets.push({ file, im: strip(mv) });
    e.moving[f] = { file, frames: mv.length, fps: 10, frame: { w: mv[0].w, h: mv[0].h }, tileOrigin: set.tileOrigin, note: 'wheel loop at ~1 m/s (a man walking); speed it with the cart' };
    // fire anchors on the burning sprite (siege fx ids, fire v2): tongues on the bed and a wheel, a wisp of smoke, embers
    const sc = screenOf(rs.burning, f, L);
    e.fx[f] = { burning: [{ id: 'tongue-m-a', at: sc(C0.fire[0]) }, { id: 'tongue-s-b', at: sc(C0.fire[1]) }, { id: 'tongue-s-c', at: sc(C0.fire[2]) }, { id: 'tongue-s-a', at: sc(C0.fire[3]) }, { id: 'embers', at: sc([C0.fire[0][0], C0.fire[0][1], C0.fire[0][2] + 0.6]) }, { id: 'smoke-wisp-a', at: sc([C0.fire[0][0], C0.fire[0][1], C0.fire[0][2] + 0.9]), alpha: 0.5 }], burnt: [{ id: 'smoulder', at: screenOf(rs.burnt, f, L)([C0.fire[0][0], C0.fire[0][1], 0.3]) }] };
    // cargo overlays: drawn over any standing state of this facing at the same tileOrigin; the near sides hide the load
    e.cargo[f] = {};
    for (const kind of CARGO) for (const [lvl, name] of [[1, 'half'], [2, 'full']]) {
      const cf = cargoFn(kind, lvl, C0.bed, C0.floor, k), occ = C0.fn({ ph: 0 }), occM = Object.fromEntries(Object.keys(C0.M).map((q) => [q, solid(MARK)]));
      const M = { ...occM, ...CARGO_M, ...BOX_M, mark: solid(MARK) };
      const im = unmark(render((x, y, z) => { const c = cf(x, y, z); if (c) return c; const o = occ(x, y, z); return o ? `occ-${o}` : null; }, bounds, { ...M, ...Object.fromEntries(Object.keys(C0.M).map((q) => [`occ-${q}`, solid(MARK)])) }, f, L, C));
      const box = alphaBox(im, 1); if (!box.w) continue;
      const r = { im: crop(im, box), tileOrigin: { x: C.ox - box.x, y: C.oy - box.y } };
      e.cargo[f][`${kind}-${name}`] = sprite(`${C0.id}-${f}-cargo-${kind}-${name}`, 'cargo', r, fp, { cart: C0.id, facing: f, cargo: kind, level: name, overlay: true, source: 'renderer (voxel model)' });
    }
  }
  e.stateNote = 'halted = standing, moving = the wheel strip (same tileOrigin as halted), burning = halted scorched + fx.burning (siege fire v2 fx ids at sprite px), wrecked = 0 HP (a wheel off, the bed down on that corner; cargo goes to a loot pile), burnt = wrecked by fire + fx.burnt. cargo[facing][<kind>-<half|full>]: an overlay drawn over halted / moving / burning at that sprite\'s tileOrigin (empty = none); kinds ' + CARGO.join(', ') + '.';
  carts.push(e);
}

// ---- the mule team: PixelLab pro quadruped (horse template), 4 diagonal rows like the soldier sheets; halted = the
// rotation, walk = the template walk (8 frames). Shrunk to true scale (a 1.35 m mule: ~45 px to the withers line).
const MULE_DIRS = ['south-east', 'north-east', 'south-west', 'north-west'], mules = {};
{
  const md = join(RAW, 'mule'), have = existsSync(join(md, 'rotations'));
  if (!have) console.error('missing mule raws (trade-fetch.mjs)');
  else {
    const rot = Object.fromEntries(MULE_DIRS.map((d) => [d, readImage(join(md, 'rotations', `${d}.png`))]));
    const walk = Object.fromEntries(MULE_DIRS.map((d) => { const dir = join(md, 'walk', d); return [d, existsSync(dir) ? readdirSync(dir).filter((q) => q.endsWith('.png')).sort().map((q) => readImage(join(dir, q))) : []]; }));
    const box0 = alphaBox(rot['south-east'], 1), k = 56 / box0.h; // the side-on view stands ~56 px from hooves to ear tips (1.7 m)
    const shrink = (im) => hard(resizeArea(im, Math.round(im.w * k), Math.round(im.h * k)));
    const frames = [], rows = [];
    const hOf = (im) => alphaBox(im, 1).h;
    for (const d of MULE_DIRS) { const ws = walk[d].length ? walk[d] : [rot[d]], med = ws.map(hOf).sort((p, q) => p - q)[ws.length >> 1], kr = hOf(rot[d]) / med; // the SW template walk came on a smaller scale
      rows.push([shrink(rot[d]), ...ws.map((im) => (Math.abs(kr - 1) > 0.05 ? hard((k * kr > 1 ? resizeNearest : resizeArea)(im, Math.round(im.w * k * kr), Math.round(im.h * k * kr))) : shrink(im)))]); }
    const fw = Math.max(...rows.flat().map((im) => im.w)), fh = Math.max(...rows.flat().map((im) => im.h)), n = Math.max(...rows.map((r) => r.length));
    const sheet = blank(fw * n, fh * MULE_DIRS.length), anchors = {};
    rows.forEach((r, j) => { r.forEach((im, i) => paste(sheet, im, i * fw + Math.floor((fw - im.w) / 2), j * fh + (fh - im.h))); const b = alphaBox(crop(sheet, { x: 0, y: j * fh, w: fw, h: fh }), 1); anchors[MULE_DIRS[j]] = { x: Math.round(fw / 2), y: b.y + b.h - 3 }; });
    sheets.push({ file: 'mule.png', im: sheet });
    Object.assign(mules, { file: 'mule.png', frame: { w: fw, h: fh }, rows: MULE_DIRS, anims: { halted: { col: 0, frames: 1 }, walk: { col: 1, frames: n - 1, fps: 10 } }, anchors, facingRow: { e: 'south-east', s: 'south-west', w: 'north-west', n: 'north-east' }, source: 'PixelLab create_character pro (quadruped horse, style H4) + walk-8-frames template', scale: +k.toFixed(3) });
  }
}

// ---- chest, strongbox, board (one facing: the front to +y)
const objectsT = [];
const one = (fn, M, Hm, post) => { const C = canvasOf(3, 3, Hm); let im = render(fn, [-0.5, 2.5, -0.5, 2.5, Hm], M, 'e', 2, C); if (post) im = post(im); return cropOne(im, C); };
const things = [
  { id: 'chest', kind: 'chest', material: 'wood', burnable: true, states: ['closed', 'open', 'looted'], fn: chestFn, M: CHEST_M, Hm: 1.2, note: '1 x 1 building (WAR.md: wood 10, 8 loads, owner-only); open while its owner or a looter takes from it, looted once empty after a raid' },
  { id: 'strongbox', kind: 'strongbox', material: 'wood', burnable: true, states: ['closed', 'open', 'looted'], fn: (s) => strongboxFn(s), M: BOX_M, Hm: 1.0, note: 'coin holder (200 coin a load): a store\'s or a stall\'s coin, the court\'s tax box; cargo kind strongbox on carts' },
  { id: 'price-board', kind: 'board', material: 'wood', burnable: false, states: ['done', 'damaged'], fn: boardFn, M: BOARD_M, Hm: 2.5, post: { damaged: (im) => scorch(im, 77, 0.5) }, note: 'the agora price board (WAR.md "Stalls, offers and the board"): a whitewashed notice board on a limestone base, painted rows on the +y and +x faces; placed whole (buildOrder done)' },
];
for (const t of things) {
  const states = {};
  for (const s of t.states) { const r = one(t.fn(s), t.M, t.Hm, t.post?.[s]); states[s] = sprite(`${t.id}-${s}`, t.kind, r, [1, 1], { blocksMovement: t.kind !== 'chest' || true, material: t.material, burnable: t.burnable, object: t.id, state: s, source: 'renderer (voxel model)' }); }
  objectsT.push({ id: t.id, kind: t.kind, footprint: [1, 1], material: t.material, burnable: t.burnable, states, note: t.note });
}

// ---- loot piles: PixelLab map objects, graded to the war palette's darkness and scaled to their size on a 1 x 1 tile
const piles = [];
const PILE_W = { s: 30, m: 44, l: 60 }; // px across: ~0.9 / 1.4 / 1.9 m of heap
for (const v of ['gear', 'goods']) for (const sz of ['s', 'm', 'l']) {
  const f = join(RAW, `pile-${v}-${sz}.png`); if (!existsSync(f)) { console.error('missing', f); continue; }
  let im = readImage(f); for (let i = 0; i < im.data.length; i += 4) { const l = 0.3 * im.data[i] + 0.59 * im.data[i + 1] + 0.11 * im.data[i + 2]; for (let c = 0; c < 3; c++) im.data[i + c] = clamp((l + (im.data[i + c] - l) * 0.62) * 0.8); }
  im = hard(im); im = crop(im, alphaBox(im, 1)); const kk = PILE_W[sz] / im.w; im = hard(resizeArea(im, Math.round(im.w * kk), Math.round(im.h * kk))); im = crop(im, alphaBox(im, 1));
  const a = footOf(im), r = { im, tileOrigin: { x: a.x, y: im.h - 16 - 2 } }; // the heap's foot on the tile centre
  const id = `pile-${v}-${sz}`; piles.push({ id, variant: v, size: { s: 'small', m: 'medium', l: 'large' }[sz], loads: { s: '1-2', m: '3-5', l: '6-8' }[sz], sprite: sprite(id, 'pile', r, [1, 1], { blocksMovement: false, material: 'mixed', burnable: false, source: `map_object ${JSON.parse(readFileSync(join(ROOT, 'scripts/war/art/trade-jobs.json'))).objects[id].slice(0, 8)}` }) });
}

// ---- palette + write
const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const pal = extendPalette([...G.palette, ...GO.palette, ...B.palette], [...sprites.map((s) => s.im), ...sheets.map((s) => s.im)], 48);
mkdirSync(OUT, { recursive: true });
for (const s of sprites) writeImage(join(OUT, s.meta.file), snapToPalette(s.im, pal));
for (const s of sheets) writeImage(join(OUT, s.file), snapToPalette(s.im, pal));
const stalls = B.buildings.filter((b) => b.chain === 'market-stall').map((b) => ({ level: b.level, building: b.id }));
const json = {
  pxPerMetre: PPM, tileMetres: 2, borderMax: 0.75,
  note: 'Trade art (ART-T, WAR.md "Trade"). objects[]: every single sprite (anchor = foot; tileOrigin = px of world (0, 0, 0), the footprint\'s top vertex: draw at that tile\'s top vertex minus tileOrigin). carts[]: handcart and wagon per facing (e +x, s +y, w -x, n -y: the way it is pulled), see stateNote; crew / team = tile offsets from the footprint NW corner. mules: the wagon team sheet (rows by screen direction, facingRow maps a cart facing to a row; anchors = feet). things[]: chest, strongbox, price board (one facing). piles[]: loot piles (WAR.md "Loot piles"): small / medium / large by loads, gear-heavy (mostly items) or goods-heavy (mostly loads). stalls: the market-stall chain in public/war/buildings (L1-L3); the warehouse is building `warehouse` there. Colours = tiles.json palette + palette.',
  palette: pal.slice(G.palette.length), carts, mules, things: objectsT, piles, stalls, warehouse: 'warehouse',
  objects: sprites.map((s) => s.meta),
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`trade: ${carts.length} carts, ${objectsT.length} things, ${piles.length} piles, ${sprites.length} sprites, ${sheets.length} sheets, palette +${pal.length - G.palette.length - GO.palette.length - B.palette.length}`);
process.exit(runTradeQa().length ? 1 : 0);
