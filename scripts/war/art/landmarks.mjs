// Landmark structures (ART-L, WAR.md "Living regions" > Landmarks) -> public/war/landmarks/ (landmarks.json + PNGs).
// Prompts and lessons: docs/playbook/PROMPTS_ART.md "Landmarks (ART-L)" > 40a.
// Usage: node scripts/war/art/landmarks.mjs [pixellab dir]   (textures as buildings.mjs: <dir>/buildings/raw/tex, inits)
//
// Every piece is drawn by the box renderer of buildings.mjs (true scale: 1 m along a tile axis = 16 px across + 8 px
// down, 1 m up = 33 px; 1 tile = 2 m) with the walls' textures (cyclopean, isodomic, ashlar, Lion Gate, drawn roof
// tiles), so the landmarks read as one set with the build-mode forts. 0 PixelLab generations.
// A piece is one model (metres from the NW corner of its footprint, front = +y) drawn in four states:
//   intact   = as the season finds it (60% hp, gates shut): weathered, a few blocks gone from the tops, lichen
//   damaged  = wrecked: thrown down to about half height (smooth noise, whole courses), roofs fallen in, talus, soot
//   ruined   = a rubble footprint: stumps under 1.5 m, every roof gone, big rubble heaps, soot
//   restored = repaired after the restore rule: fresh, gates hung (iron-bound), banners on the tops, bronze polished
// Wall segments (8 m, the cyclopean texture's period) and the labyrinth kit join end to end in every state.
// QA: qa.mjs (qaLandmarks: object checks for every sprite, every piece has its four states, kit sheets and seams).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette } from '../../art/lib/ops.mjs';
import {
  PPM, MX, MY, TEX, hash, mul, clamp, renderBoxes, cells, heap, beam, roof, masonry, rubMat, rough, flags, planks, woodSolid, solid, soot,
  loadTextures, extendPalette, footOf, CHAR, EMBER, DOORDARK, cylinder, cone, pyramid, gateBoxes, gradeC, ao, lightOf, SHADE, PAINT,
} from './buildings.mjs';
import { runLandmarksQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'public/war/landmarks');
export const STATES = ['intact', 'damaged', 'ruined', 'restored'];

// ---- small helpers
const box = (x0, x1, y0, y1, z0, z1, mat, o = {}) => ({ x0, x1, y0, y1, z0, z1, mat, ...o });
const sm = (t) => t * t * (3 - 2 * t);
// value noise on a grid of 1 / f m; p: period in noise cells along x (0: none), so 8 m wall segments repeat seamlessly
function vn(x, y, k, f = 1, p = 0) {
  const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), u = sm(X - xi), v = sm(Y - yi);
  const w = (i) => (p ? ((i % p) + p) % p : i) & 255, h = (i, j) => hash(w(i), j & 255, k);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const swapF = { '+x': '+y', '+y': '+x', '-x': '-y', '-y': '-x', top: 'top' };
// the y-axis variant of a model built along x: mirror about x = y (faces and the mats' coordinates swapped with it)
const swapXY = (B) => B.map((b) => ({ ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1, mat: (f, x, y, z, u, r) => b.mat(swapF[f], y, x, z, u, r), ...(b.skip && { skip: new Set([...b.skip].map((f) => swapF[f])) }) }));
const shift = (B, dx, dy, dz = 0) => B.map((b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, z0: b.z0 + dz, z1: b.z1 + dz }));

// ---- materials (made after loadTextures)
let M;
function materials() {
  const cyc = masonry(TEX.cyclo, { mod: 160, top: rough }), iso = masonry(TEX.iso, { mod: 180 }), ash = masonry(TEX.ashlar, { mod: 120 });
  const big = (T, mod) => { const m = masonry(T, { mod, top: rough }); return (f, x, y, z, u, r) => m(f, x * 0.5, y * 0.5, z, Math.floor(u / 2), Math.floor(r / 2)); }; // blocks twice the size: the giants' walls
  const ramp = (cs) => cs.map((c) => [...c, 255]);
  const R = {
    mud: ramp([[50, 42, 35], [72, 61, 50], [94, 81, 67], [114, 100, 83], [132, 117, 97]]), // Ammon mudbrick, sun-dried, dulled
    rock: ramp([[20, 19, 23], [32, 30, 35], [46, 43, 49], [62, 58, 64], [84, 79, 84]]), // basalt of the Obsidian Hold
    glass: ramp([[10, 9, 14], [22, 20, 30], [40, 38, 54], [96, 94, 118]]),
    bone: ramp([[84, 78, 66], [118, 110, 92], [150, 141, 118], [178, 168, 142]]),
    slag: ramp([[16, 15, 15], [26, 23, 22], [38, 32, 29], [58, 40, 30]]),
    iron: ramp([[22, 22, 26], [34, 34, 40], [50, 50, 56], [72, 72, 80]]),
    water: ramp([[18, 30, 34], [26, 44, 48], [38, 60, 62]]), lethe: ramp([[12, 13, 15], [18, 21, 23], [28, 32, 34]]),
    red: ramp([[54, 20, 19], [82, 30, 25], [112, 42, 31]]), bronze: ramp([[46, 32, 20], [82, 56, 30], [126, 88, 44], [170, 126, 66]]),
    hide: ramp([[46, 33, 25], [68, 49, 36], [90, 68, 48]]), coal: ramp([[24, 18, 16], [62, 30, 20], [122, 58, 26]]),
  };
  const nz = (x, y, z, k, s = 9) => hash(Math.floor(x * s), Math.floor(y * s) + Math.floor(z * s) * 7, k);
  // mudbrick: courses 0.12 m, bricks 0.36 m, a mud render worn off in patches
  const mud = (f, x, y, z) => {
    if (f === 'top') return mul(R.mud[3], 0.9 + 0.12 * nz(x, y, 0, 3, 3));
    const a = f === '+y' || f === '-y' ? x : y, row = Math.floor(z / 0.12), b = (a + (row % 2) * 0.18) / 0.36, render = vn(a, z, 41, 1.3) > 0.45;
    if (render) return mul(R.mud[2 + (nz(a, 0, z, 5, 6) > 0.5 ? 1 : 0)], ao(z) * (0.94 + 0.08 * nz(a, 0, z, 6, 20)));
    if (z % 0.12 < 0.025 || b % 1 < 0.06) return mul(R.mud[0], ao(z));
    return mul(R.mud[1 + Math.floor(hash(Math.floor(b) & 255, row & 255, 7) * 2)], ao(z));
  };
  // basalt cut from the living rock: big angular facets, a few obsidian glints
  const rock = (f, x, y, z) => {
    const a = f === '+y' || f === '-y' ? x : f === 'top' ? x + y : y, fa = Math.floor(a * 0.45 + z * 0.3), fz = Math.floor(z * 0.42 - a * 0.2), q = hash(fa & 255, fz & 255, 11);
    if (hash(Math.floor(a * 20) & 255, Math.floor(z * 20) & 255, 12) < 0.006) return R.glass[3];
    const edge = ((a * 0.45 + z * 0.3) % 1 < 0.04) || ((z * 0.42 - a * 0.2 + 50) % 1 < 0.04);
    return mul(R.rock[edge ? 0 : 1 + Math.floor(q * 3)], (f === 'top' ? 1.05 : ao(z)) * (0.9 + 0.15 * nz(x, y, z, 13, 12)));
  };
  const ramped = (r, k = 0, s = 9) => (f, x, y, z) => mul(r[Math.min(r.length - 1, Math.floor(nz(x, y, z, k, s) * r.length))], f === 'top' ? 1.05 : 0.92);
  const tiers = (f, x, y, z) => mul(TEX.lime[f === 'top' ? 3 : 1 + (Math.floor(z * 8) % 2)], 0.9 + 0.12 * nz(x, y, z, 21, 3)); // seat steps
  return { cyc, iso, ash, bigCyc: big(TEX.cyclo, 160), R, mud, rock, ramped, tiers, nz, lime: (i = 3) => (f, x, y, z) => mul(TEX.lime[i], f === 'top' ? 1 : 0.95) };
}
const ironBound = (f, x, y, z) => { const a = f === '+x' || f === '-x' ? y : x, s = (a * 2) % 1 < 0.06 || (z * 2) % 1 < 0.06; return s ? M.R.iron[3] : M.R.iron[1 + Math.floor(hash(Math.floor(a * 2) & 255, Math.floor(z * 2) & 255, 9) * 2)]; };
const bronzeLeaf = (f, x, y, z) => { const a = f === '+x' || f === '-x' ? y : x; return (z * 3) % 1 < 0.1 || (a * 3) % 1 < 0.08 ? M.R.bronze[1] : M.R.bronze[(z * 3) % 1 > 0.8 ? 3 : 2]; };

// ---- building blocks (metres)
// a solid wall block to H with parapets on the given sides (paraH high, t thick)
function wallBlock(x0, x1, y0, y1, H, mat, { sides = ['+x', '-x', '+y', '-y'], paraH = 1, t = 0.45, top = flags } = {}) {
  const B = [box(x0, x1, y0, y1, 0, H, (f, ...a) => (f === 'top' ? top(f, a[0], a[1]) : mat(f, ...a)), { body: true })];
  const pm = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.lime[3], 0.97 + 0.08 * hash(Math.floor((x + y) * 1.7) & 255, 3, 7)) : mat(f, x, y, z, u, r + Math.round(H * PPM)));
  for (const s of sides) B.push(s === '+y' ? box(x0, x1, y1 - t, y1, H, H + paraH, pm) : s === '-y' ? box(x0, x1, y0, y0 + t, H, H + paraH, pm) : s === '+x' ? box(x1 - t, x1, y0, y1, H, H + paraH, pm) : box(x0, x0 + t, y0, y1, H, H + paraH, pm));
  return B;
}
// a dark opening (door, slit) on a face: a thin box proud of the face
function opening(face, a0, a1, at, z0, z1, mat = solid(DOORDARK)) {
  const d = 0.05; return face === '+y' ? box(a0, a1, at, at + d, z0, z1, mat) : face === '+x' ? box(at, at + d, a0, a1, z0, z1, mat) : face === '-y' ? box(a0, a1, at - d, at, z0, z1, mat) : box(at - d, at, a0, a1, z0, z1, mat);
}
// door leaves by state: intact plain timber, restored bronze or iron-bound
const leafMat = (st, kind = 'wood') => (st === 'restored' ? (kind === 'bronze' ? bronzeLeaf : ironBound) : (f, x, y, z) => { const a = f === '+x' || f === '-x' ? y : x, n = Math.floor(a * 3.3); return (z > 0.8 && z < 0.92) || (z > 2.3 && z < 2.42) ? mul(TEX.wood[0], 1.2) : n % 2 ? TEX.wood[1] : TEX.wood[2]; });
// a square tower: socle (cyclopean), body (isodomic), cornice, then a pyramid roof (roofed) or a parapet ring (flat)
function sqTower(x0, y0, S, H, { socle = 1.5, body = M.iso, base = M.cyc, roofed = true, rise = 1.2, slits = true, door = null, st, k = 1 } = {}) {
  const x1 = x0 + S, y1 = y0 + S, B = [box(x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.1, 0, socle, base, { body: true }), box(x0, x1, y0, y1, socle, H, body, { body: true }), box(x0 - 0.15, x1 + 0.15, y0 - 0.15, y1 + 0.15, H, H + 0.25, M.iso)];
  if (roofed) {
    const c = [x0 + S / 2, y0 + S / 2], h = S / 2 + 0.35, [f, d] = pyramid(c[0], c[1], h, H + 0.25, rise);
    B.push(...roof(c[0] - h, c[0] + h, c[1] - h, c[1] + h, f, d).map((b) => ({ ...b, roof: true })));
  } else B.push(...wallBlock(x0 - 0.15, x1 + 0.15, y0 - 0.15, y1 + 0.15, H + 0.25, body, { paraH: 1.0 }).slice(1));
  if (slits) for (const z of [H * 0.45, H * 0.75]) for (const a of [0.3, 0.7]) { B.push(opening('+y', x0 + S * a - 0.08, x0 + S * a + 0.08, y1, z, z + 0.8), opening('+x', y0 + S * a - 0.08, y0 + S * a + 0.08, x1, z, z + 0.8)); }
  if (door) B.push(opening(door, (door === '+y' ? x0 : y0) + S / 2 - 0.6, (door === '+y' ? x0 : y0) + S / 2 + 0.6, door === '+y' ? y1 : x1, socle * 0, 2.3, st === 'restored' ? ironBound : st === 'intact' ? leafMat(st) : solid(DOORDARK)));
  return B;
}
// round tower (cylinder) with a low cone roof or a parapet ring
function rdTower(cx, cy, R, H, { T = TEX.iso, socle = 1.5, roofed = true, rise = 1.1 } = {}) {
  const B = [...cylinder(cx, cy, R + 0.13, 0, socle, TEX.cyclo, { row0: 6, top: rough }), ...cylinder(cx, cy, R, socle, H, T, { mod: 160, slits: (th, z) => [Math.PI / 2, 0, Math.PI / 4].some((a) => Math.abs(th - a) < 0.04) && ((z > H * 0.4 && z < H * 0.4 + 1) || (z > H * 0.7 && z < H * 0.7 + 0.9)) }), ...cylinder(cx, cy, R + 0.15, H, H + 0.22, TEX.iso, { row0: 3 })];
  B.forEach((b) => (b.body = true));
  if (roofed) { const Rr = R + 0.42, [f, d] = cone(cx, cy, Rr, H + 0.22, rise); B.push(...roof(cx - Rr, cx + Rr, cy - Rr, cy + Rr, (x, y) => (Math.hypot(x - cx, y - cy) > Rr ? -9 : f(x, y)), d, { holes: (x, y) => Math.hypot(x - cx, y - cy) > Rr }).map((b) => ({ ...b, roof: true }))); }
  else B.push(...cells(cx - R - 0.15, cx + R + 0.15, cy - R - 0.15, cy + R + 0.15, (x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= R + 0.15 && d > R - 0.3 ? { z0: H + 0.22, z1: H + 1.2, mat: (f, xx, yy, z) => (f === 'top' ? M.lime(3)(f) : mul(TEX.lime[2], lightOf((xx - cx) / d, (yy - cy) / d) * 1.1)), lit: true } : null; }));
  return B;
}
// a gable roof over [x0, x1] x [y0, y1], ridge along y (pediments to +y and -y) or x, with a ridge cap and pediments
function gable(x0, x1, y0, y1, eave, rise, axis = 'y', { ped = true } = {}) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = axis === 'y' ? (x1 - x0) / 2 : (y1 - y0) / 2;
  const f = axis === 'y' ? (x, y) => eave + rise * (1 - Math.abs(x - cx) / hw) : (x, y) => eave + rise * (1 - Math.abs(y - cy) / hw);
  const d = axis === 'y' ? (x, y) => [y, Math.abs(x - cx)] : (x, y) => [x, Math.abs(y - cy)];
  const B = roof(x0, x1, y0, y1, f, d).map((b) => ({ ...b, roof: true }));
  const cap = (f2, x, y) => mul(TEX.tile[1], 0.9 + 0.2 * hash(Math.floor((x + y) * 3) & 255, 2, 2));
  B.push(axis === 'y' ? box(cx - 0.12, cx + 0.12, y0, y1, eave + rise - 0.05, eave + rise + 0.12, cap, { roof: true }) : box(x0, x1, cy - 0.12, cy + 0.12, eave + rise - 0.05, eave + rise + 0.12, cap, { roof: true }));
  if (ped) { // the triangular pediments, stepped in 1/16 m slices
    const pm = masonry(TEX.iso, { row0: 50 });
    for (const at of axis === 'y' ? [y0 + 0.15, y1 - 0.3] : [x0 + 0.15, x1 - 0.3]) B.push(...cells(axis === 'y' ? x0 + 0.25 : at, axis === 'y' ? x1 - 0.25 : at + 0.15, axis === 'y' ? at : y0 + 0.25, axis === 'y' ? at + 0.15 : y1 - 0.25, (x, y) => { const z = f(x, y) - 0.12; return z > eave ? { z0: eave, z1: z, mat: pm } : null; }));
  }
  return B;
}
// a peristyle temple: crepidoma (n steps of s m), columns (nx x ny, radius R, height Hc), entablature (E m), cella, gable roof
function templeBoxes(x0, y0, W, D, { steps = 3, s = 0.35, nx = 6, ny = 6, R = 0.45, Hc = 6, E = 1.2, rise = 1.8, cella = true, k = 1, frieze = true } = {}) {
  const B = [], x1 = x0 + W, y1 = y0 + D;
  for (let i = 0; i < steps; i++) B.push(box(x0 + i * s * 0.9, x1 - i * s * 0.9, y0 + i * s * 0.9, y1 - i * s * 0.9, i * s, (i + 1) * s, (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : mul(TEX.iso.px(u, 40 + r) ?? TEX.lime[2], ao(z + 1))), { body: true }));
  const P = steps * s, ix0 = x0 + steps * s * 0.9, iy0 = y0 + steps * s * 0.9, iW = W - 2 * steps * s * 0.9, iD = D - 2 * steps * s * 0.9;
  const m = R + 0.25, cxs = [...Array(nx)].map((_, i) => ix0 + m + ((iW - 2 * m) * i) / (nx - 1)), cys = [...Array(ny)].map((_, j) => iy0 + m + ((iD - 2 * m) * j) / (ny - 1));
  const colMat = mul(TEX.lime[3], 0.98);
  for (const cx of cxs) for (const cy of cys) if (cx === cxs[0] || cx === cxs[nx - 1] || cy === cys[0] || cy === cys[ny - 1]) B.push(...cylinder(cx, cy, R, P, P + Hc, null, { paint: colMat, top: () => TEX.lime[3] }).map((b) => ({ ...b, body: true })), box(cx - R - 0.12, cx + R + 0.12, cy - R - 0.12, cy + R + 0.12, P + Hc - 0.3, P + Hc, M.iso));
  if (cella) B.push(box(ix0 + m + R + 0.9, x1 - (steps * s * 0.9) - m - R - 0.9, iy0 + m + R + 0.9, y1 - (steps * s * 0.9) - m - R - 0.6, P, P + Hc, (f, x, y, z, u, r) => (f === '+y' && Math.abs(x - (x0 + W / 2)) < 0.8 && z < P + 3.2 ? DOORDARK : M.iso(f, x, y, z, u, r)), { body: true }));
  const ez = P + Hc, tri = (f, x, y, z, u, r) => { if (!frieze || f === 'top') return M.iso(f, x, y, z, u, r); const a = f === '+y' || f === '-y' ? x : y; return z > ez + E * 0.5 ? (a * 1.25 % 1 < 0.28 ? mul(TEX.lime[1], 0.85) : z > ez + E - 0.12 ? TEX.lime[3] : mul(PAINT, 0.8)) : TEX.lime[2 + (z > ez + E * 0.45 ? 1 : 0)]; };
  B.push(box(ix0 + 0.05, x1 - steps * s * 0.9 - 0.05, iy0 + 0.05, y1 - steps * s * 0.9 - 0.05, ez, ez + E, tri, { body: true }));
  B.push(...gable(ix0 - 0.2, x1 - steps * s * 0.9 + 0.2, iy0 - 0.2, y1 - steps * s * 0.9 + 0.2, ez + E, rise, 'y'));
  return B;
}
// a flat-roofed house of mudbrick with a parapet lip, a door to +y, small windows, roof beams poking out
function flatHouse(x0, y0, W, D, H, st, { mat = M.mud, door = '+y', beams = true } = {}) {
  const B = wallBlock(x0, x0 + W, y0, y0 + D, H, mat, { paraH: 0.35, t: 0.25, top: (f, x, y) => mul(M.R.mud[2], 0.85 + 0.1 * hash(Math.floor(x * 3) & 255, Math.floor(y * 3) & 255, 4)) });
  const dx = x0 + W * 0.35;
  B.push(opening(door, door === '+y' ? dx : y0 + D * 0.4, (door === '+y' ? dx : y0 + D * 0.4) + 1.0, door === '+y' ? y0 + D : x0 + W, 0, 2.0, st === 'restored' ? leafMat('intact') : solid(DOORDARK)));
  for (const a of [0.2, 0.75]) B.push(opening('+x', y0 + D * a, y0 + D * a + 0.45, x0 + W, H * 0.62, H * 0.62 + 0.55), opening('+y', x0 + W * a + 0.4, x0 + W * a + 0.85, y0 + D, H * 0.62, H * 0.62 + 0.55));
  if (beams) for (let i = 0; i < Math.floor(W / 0.9); i++) B.push(box(x0 + 0.4 + i * 0.9, x0 + 0.55 + i * 0.9, y0 + D, y0 + D + 0.35, H - 0.35, H - 0.2, woodSolid(1)));
  return B;
}
// a gabled stone house (oracle priestess, the rim keeper): fieldstone walls, a tiled roof, a door to +y
function gableHouse(x0, y0, W, D, H, st, { axis = 'x', porch = false } = {}) {
  const fs = masonry(TEX.cyclo, { mod: 160, row0: 30 });
  const B = [box(x0, x0 + W, y0, y0 + D, 0, H, (f, x, y, z, u, r) => (f === 'top' ? rough(f, x, y) : mul(fs(f, x * 2, y * 2, z, u * 2, r * 2) ?? TEX.lime[1], 0.95)), { body: true })];
  B.push(opening('+y', x0 + W / 2 - 0.5, x0 + W / 2 + 0.5, y0 + D, 0, 2.0, st === 'restored' || st === 'intact' ? leafMat('intact') : solid(DOORDARK)), opening('+x', y0 + D / 2 - 0.25, y0 + D / 2 + 0.25, x0 + W, H * 0.5, H * 0.5 + 0.6));
  B.push(...gable(x0 - 0.3, x0 + W + 0.3, y0 - 0.3, y0 + D + 0.3, H, Math.min(W, D) * 0.28, axis, { ped: false }));
  if (porch) { for (const x of [x0 + 0.4, x0 + W - 0.55]) B.push(box(x, x + 0.16, y0 + D + 1.2, y0 + D + 1.36, 0, H - 0.1, woodSolid(1), { body: true })); B.push(...roof(x0 - 0.1, x0 + W + 0.1, y0 + D, y0 + D + 1.6, (x, y) => H - 0.1 - (y - y0 - D) * 0.35, (x, y) => [x, y - y0 - D]).map((b) => ({ ...b, roof: true }))); }
  return B;
}
// a bronze tripod with a cauldron (Dodona) / a beacon basket
function tripod(cx, cy, z0 = 0, { H = 1.3, R = 0.36, coals = false } = {}) {
  const br = (f, x, y, z) => M.R.bronze[f === 'top' ? 3 : 1 + Math.floor(M.nz(x, y, z, 31, 14) * 2)];
  const B = [];
  for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3 + 0.4; for (let t = 0; t < 1; t += 0.08) { const r = R * 0.9 * (1 - t * 0.6) + 0.05, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; B.push(box(x - 0.04, x + 0.04, y - 0.04, y + 0.04, z0 + t * H, z0 + (t + 0.09) * H, br)); } }
  B.push(...cells(cx - R, cx + R, cy - R, cy + R, (x, y) => { const d = Math.hypot(x - cx, y - cy); if (d > R) return null; return { z0: z0 + H - 0.05 - 0.25 * Math.sqrt(1 - (d / R) ** 2), z1: z0 + H + (d > R - 0.08 ? 0.12 : coals ? 0.02 : 0), mat: d > R - 0.08 ? br : coals ? (f, xx, yy) => M.R.coal[Math.floor(hash(Math.floor(xx * 20) & 255, Math.floor(yy * 20) & 255, 2) * 3)] : (f) => mul(M.R.bronze[0], 0.8) }; }, 1 / 16));
  return B;
}
// a disc in the x-z plane (a water wheel), y from y0 to y1, spokes on its faces
const discXZ = (cx, cz, R, y0, y1, mat) => cells(cx - R, cx + R, y0, y1, (x) => { const h = Math.sqrt(Math.max(0, R * R - (x - cx) ** 2)); return h > 0.02 ? { z0: Math.max(0, cz - h), z1: cz + h, mat } : null; }, 1 / 16);

// ---- the states: one model, four looks. A model: (st) => { boxes, H (main mass), top?, banners: [[x, y, z]], seg?: L }
const roofKeep = (st, b, hf, H, loss = 0.1) => { // a roof cell: intact a few tiles gone, damaged mostly fallen (over standing walls only), ruined none
  const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  if (st === 'ruined') return false;
  if (st === 'damaged') return false; // a roof over walls thrown down to half height would float: it is in the rubble
  if (st === 'intact') return vn(c[0], c[1], 78, 0.9) > loss;
  return true;
};
// cut every body box to a height field (1/4 m columns), the cut tops rough broken stone
function cutTo(B, hf, step = 0.25) {
  const out = [];
  for (const b of B) {
    if (b.keep) { out.push(b); continue; }
    const nx = Math.max(1, Math.ceil((b.x1 - b.x0) / step - 1e-6)), ny = Math.max(1, Math.ceil((b.y1 - b.y0) / step - 1e-6));
    const sx = (b.x1 - b.x0) / nx, sy = (b.y1 - b.y0) / ny;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x0 = b.x0 + i * sx, y0 = b.y0 + j * sy, h = hf(x0 + sx / 2, y0 + sy / 2);
      if (h <= b.z0 + 0.04) continue;
      const cut = h < b.z1, z1 = cut ? Math.max(b.z0 + 0.05, Math.round(h / 0.15) * 0.15) : b.z1; // whole courses (lesson 12)
      if (z1 <= b.z0) continue;
      out.push({ ...b, x0, x1: x0 + sx, y0, y1: y0 + sy, z1, skip: undefined, mat: cut ? (f, ...a) => (f === 'top' ? rough(f, a[0], a[1]) : b.mat(f, ...a)) : b.mat });
    }
  }
  return out;
}
// rubble: heaps along the visible (+x, +y) faces and inside, sized by the state; segments keep them off their ends
function debris(fw, fh, H, st, k, seg = 0) {
  const W = fw * 2, D = fh * 2, B = [], n = st === 'intact' ? Math.round((fw + fh) / 3) : st === 'damaged' ? fw + fh + 1 : (fw + fh) * 2;
  const hm = st === 'intact' ? 0.35 : st === 'damaged' ? Math.min(1.1, 0.45 + H * 0.06) : Math.min(1.5, 0.6 + H * 0.08);
  for (let i = 0; i < n; i++) {
    const q = hash(i, k, 61), side = hash(i, k, 62), inside = st === 'ruined' && hash(i, k, 63) < 0.4;
    let x, y;
    if (inside) { x = 0.8 + q * (W - 1.6); y = 0.8 + hash(i, k, 64) * (D - 1.6); }
    else if (side < 0.5) { x = 0.6 + q * (W - 1.2); y = D - 0.1 + 0.3 * hash(i, k, 65); } else { x = W - 0.1 + 0.3 * hash(i, k, 65); y = 0.6 + q * (D - 1.2); }
    if (seg === 'x') x = Math.min(W - 1.0, Math.max(1.0, x)); if (seg === 'y') y = Math.min(D - 1.0, Math.max(1.0, y));
    const rx = (0.5 + 0.7 * hash(i, k, 66)) * (st === 'intact' ? 0.5 : 1), ry = rx * (0.6 + 0.5 * hash(i, k, 67));
    B.push(...heap(x, y, rx, ry, hm * (0.6 + 0.6 * hash(i, k, 68)), k + i * 3, rubMat(k + i, hash(i, k, 69) < 0.25 ? TEX.tile : TEX.lime)).map((b) => ({ ...b, keep: true })));
  }
  return B;
}
// banners on poles (restored): dark red cloth with a bronze band, hanging towards +y
function banner([x, y, z], k = 0) {
  const pole = box(x - 0.05, x + 0.05, y - 0.05, y + 0.05, z, z + 2.6, woodSolid(0), { keep: true });
  const cloth = (f, xx, yy, zz) => { if (zz > z + 2.25) return M.R.bronze[2]; const w = Math.sin((xx - x) * 7 + k) * 0.08; return mul(M.R.red[1 + (Math.floor((xx - x) * 6) % 2)], 0.95 + w); };
  return [pole, ...cells(x + 0.05, x + 0.8, y - 0.02, y + 0.02, (xx) => ({ z0: z + 1.1 + 0.18 * (xx - x) + 0.05 * Math.sin((xx - x) * 9 + k), z1: z + 2.4, mat: cloth, keep: true }), 1 / 16)];
}
function lichen(im, k) { // weathering: dark blotches with a grey-green cast, slightly duller overall
  const { w, h, data: d } = im;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!d[i + 3]) continue; const n = 0.6 * hash(x >> 3, y >> 3, k) + 0.4 * hash(x >> 1, y >> 1, k + 1), f = n < 0.22 ? 0.8 : 0.94; d[i] = clamp(d[i] * f * 0.97); d[i + 1] = clamp(d[i + 1] * f * (n < 0.22 ? 1.04 : 1)); d[i + 2] = clamp(d[i + 2] * f * 0.98); }
  return im;
}
const gradeIm = (im, g) => { for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const c = gradeC([im.data[i], im.data[i + 1], im.data[i + 2]], g); im.data.set(c.slice(0, 3), i); } return im; };
function stateBoxes(P, st) {
  const m = P.model(st), H = m.H, top = m.top ?? H + 1.2, k = P.k, W = P.fp[0] * 2, D = P.fp[1] * 2, seg = m.seg ?? 0;
  const sw = m.segAxis === 'y'; // periodic noise along the segment (x, or y for the -y variants)
  const n = (x, y, kk, f) => (sw ? vn(y, x, kk, seg ? Math.max(1, Math.round(f * seg)) / seg : f, seg ? Math.max(1, Math.round(f * seg)) : 0) : vn(x, y, kk, seg ? Math.max(1, Math.round(f * seg)) / seg : f, seg ? Math.max(1, Math.round(f * seg)) : 0));
  let hf;
  if (st === 'damaged') hf = (x, y) => H * (0.4 + 0.42 * n(x, y, k + 1, 0.3) + 0.06 * n(x, y, k + 2, 0.7));
  else if (st === 'ruined') hf = (x, y) => Math.min(H, 0.25 + Math.min(1.3, H * 0.2) * (0.4 + n(x, y, k + 3, 0.7)));
  else if (st === 'intact') hf = m.noNotch ? () => 1e9 : (x, y) => (n(x, y, k + 4, 0.9) > 0.84 ? top - 0.6 - 0.4 * n(x, y, k + 5, 2) : 1e9);
  else hf = () => 1e9;
  // W-48 dwellings (m.shell, hollow walls when damaged or ruined): ruined a roofless shell of 1-3 m wall stumps, damaged
  // the walls broken from half to full height and the roof kept only over the parts still standing whole
  const sd = (x, y) => 0.45 + 0.8 * n(x, y, k + 1, 0.35);
  if (m.shell && st === 'ruined') hf = (x, y) => Math.min(H, 1.0 + 2.0 * n(x, y, k + 3, 0.55));
  if (m.shell && st === 'damaged') hf = (x, y) => Math.min(H, H * sd(x, y));
  const keepRoof = (b) => (m.shell && st === 'damaged' ? sd((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) >= 0.97 : roofKeep(st, b, hf, H, m.roofLoss));
  const body = m.boxes.filter((b) => !b.roof), roofs = m.boxes.filter((b) => b.roof && keepRoof(b));
  let B = [...cutTo(body, hf), ...roofs];
  if (st !== 'restored') B.push(...debris(P.fp[0], P.fp[1], H, st, k + 9, seg ? (sw ? 'y' : 'x') : 0));
  if (st === 'damaged' && m.rafters) B.push(...m.rafters);
  if (st === 'restored') for (const [i, p] of (m.banners ?? []).entries()) B.push(...banner(p, i + k));
  return B;
}
// render: true scale, cropped; tileOrigin = px of the top vertex of the footprint's north tile
function renderModel(B, fw, fh, Hm) {
  const W = (fw + fh) * 32 + 80, ox = fh * 32 + 40, oy = Math.ceil(Hm * PPM) + 40, Ht = oy + (fw + fh) * 16 + 40;
  const im = renderBoxes(B, W, Ht, ox, oy), bx = alphaBox(im, 1);
  return { im: crop(im, bx), tileOrigin: { x: ox - bx.x, y: oy - bx.y } };
}
function renderPiece(P, st) {
  const r = renderModel(stateBoxes(P, st), P.fp[0], P.fp[1], (P.heightM ?? 12) + 4);
  if (st === 'intact') gradeIm(lichen(r.im, P.k), { sat: 0.92, val: 0.94 });
  if (st === 'damaged') soot(r.im, P.k);
  if (st === 'ruined') gradeIm(soot(r.im, P.k + 1), { sat: 0.9, val: 0.9 });
  if (st === 'restored') gradeIm(r.im, { sat: 1.04, val: 1.04 });
  return r;
}

// ---- the pieces. fp in tiles (2 m), model in metres; hp: the sim's (WAR.md), else the nearest town piece's
const PIECES = [];
const piece = (o) => PIECES.push(o);
const gate = (st) => (st === 'intact' ? 'done' : st === 'restored' ? 'done' : st === 'damaged' ? 'open' : 'damaged');
const gateOpt = (st) => (st === 'restored' ? { iron: true } : {});
// both axes of a linear piece built along x
const both = (o) => { piece({ ...o, id: `${o.id}-x`, axis: 'x' }); piece({ ...o, id: `${o.id}-y`, axis: 'y', fp: [o.fp[1], o.fp[0]], model: (st) => { const m = o.model(st); return { ...m, boxes: swapXY(m.boxes), banners: (m.banners ?? []).map(([x, y, z]) => [y, x, z]), segAxis: 'y' }; } }); };

// Drakon's Citadel (krios, depth 4): heavier and taller than the build-mode set: the curtain walk at 7 m
const CIT = { walk: 7, para: 1.2 };
piece({ landmark: 'citadel', id: 'citadel-keep', kind: 'keep', fp: [6, 6], hp: 8000, material: 'stone', heightM: 16, k: 11,
  note: 'the keep (6 x 6, 8000 hp): a cyclopean tower-house, a flat roof terrace (Drakon perches here in P2) behind a parapet, a roofed stair-house',
  model: (st) => {
    const S = 12, B = [box(0.1, S - 0.1, 0.1, S - 0.1, 0, 3.2, M.bigCyc, { body: true }), box(0.5, S - 0.5, 0.5, S - 0.5, 3.2, 13, M.iso, { body: true }), box(0.3, S - 0.3, 0.3, S - 0.3, 13, 13.3, M.iso, { body: true })];
    B.push(...wallBlock(0.3, S - 0.3, 0.3, S - 0.3, 13.3, M.iso, { paraH: 1.1, t: 0.5 }).slice(1));
    B.push(box(1.0, 3.6, 1.0, 3.6, 13.3, 15.3, M.iso, { body: true }), ...gable(0.8, 3.8, 0.8, 3.8, 15.3, 0.8, 'x', { ped: false })); // stair-house on the back corner
    for (const z of [6, 9.5]) for (const a of [2.5, 6, 9.5]) B.push(opening('+y', a - 0.1, a + 0.1, S - 0.5, z, z + 1.1), opening('+x', a - 0.1, a + 0.1, S - 0.5, z, z + 1.1));
    B.push(box(S / 2 - 1.3, S / 2 + 1.3, S - 0.1, S + 0.25, 0, 3.6, M.iso), opening('+y', S / 2 - 1.0, S / 2 + 1.0, S + 0.25, 0, 3.2, st === 'intact' ? leafMat(st) : st === 'restored' ? ironBound : solid(DOORDARK))); // the door frame and leaves
    return { boxes: B, H: 13.3, top: 15.3, banners: [[1.2, S - 1.0, 14.4], [S - 1.8, S - 1.0, 14.4], [S - 1.0, 1.4, 14.4]] };
  } });
both({ landmark: 'citadel', id: 'citadel-curtain', kind: 'wall', fp: [4, 2], hp: 3000, hpNote: 'a tile (cyclopean wall x2)', material: 'stone', heightM: 9, k: 12, segment: 8,
  note: '8 m of the curtain, 2 tiles deep: giant cyclopean blocks, the walk at 7 m behind a 1.2 m parapet; segments join end to end in every state',
  model: (st) => ({ boxes: wallBlock(0, 8, 0, 4, CIT.walk, M.bigCyc, { sides: ['+y', '-y'], paraH: CIT.para, t: 0.55 }), H: CIT.walk, top: CIT.walk + CIT.para, seg: 8, banners: [[3.6, 3.7, CIT.walk + CIT.para]] }) });
piece({ landmark: 'citadel', id: 'citadel-tower', kind: 'tower', fp: [3, 3], hp: 3500, material: 'stone', heightM: 13, k: 13, platformM: 10.5,
  note: 'a curtain tower (6 of them), 6 m square, a tiled roof over its fighting chamber; joins the curtain at walk height',
  model: (st) => ({ boxes: sqTower(0.2, 0.2, 5.6, 10.5, { socle: 3, base: M.bigCyc, rise: 1.6, st }), H: 10.5, top: 12.3, banners: [[2.9, 5.9, 10.75]] }) });
both({ landmark: 'citadel', id: 'citadel-gatehouse', kind: 'gate', fp: [6, 3], hp: 5000, material: 'stone', heightM: 13, k: 14,
  note: 'the twin gatehouse: two towers flanking a 4 m passage under a giant lintel, the leaves on the outer (+y) face, a walk between the towers at 7 m',
  model: (st) => {
    const B = [...sqTower(0, 0.2, 4, 10.5, { socle: 3, base: M.bigCyc, rise: 1.3, st, k: 1 }).map((b) => b), ...sqTower(8, 0.2, 4, 10.5, { socle: 3, base: M.bigCyc, rise: 1.3, st, k: 2 })];
    B.push(...shift(gateBoxes('stone', 'x', gate(st), 3, gateOpt(st)), 4, 2.1));
    B.push(...wallBlock(4, 8, 0.6, 4.4, CIT.walk, M.bigCyc, { sides: ['+y', '-y'], paraH: CIT.para }).map((b) => (b.body ? { ...b, z0: 5.97 } : b)));
    return { boxes: B, H: 10.5, top: 12, banners: [[1.8, 4.5, 10.75], [9.8, 4.5, 10.75]] };
  } });
piece({ landmark: 'citadel', id: 'citadel-bone-pit', kind: 'node', fp: [3, 3], hp: 600, material: 'stone', heightM: 3, k: 15, node: 'dragonbone',
  note: 'the bone pit (dragonbone node): a low ring of rough stones round a dark pit heaped with old bones, ribs and a drake skull',
  model: (st) => {
    const c = 3, B = cells(0, 6, 0, 6, (x, y) => { const d = Math.hypot(x - c, y - c); return d < 2.75 && d > 2.2 ? { z0: 0, z1: 0.5 + 0.25 * hash(Math.floor(Math.atan2(y - c, x - c) * 5) & 255, 3, 4), mat: rubMat(15), body: true } : d <= 2.2 ? { z0: 0, z1: 0.04, mat: solid(DOORDARK), keep: true } : null; }, 1 / 8);
    B.push(...heap(c, c, 1.6, 1.4, 0.9, 151, M.ramped(M.R.bone, 152, 7)).map((b) => ({ ...b, keep: true })));
    for (let i = 0; i < 5; i++) { const x = 1.6 + i * 0.6; B.push(...beam('y', 2.0, 4.2, x, 0.12, (xx, y) => 0.4 + 1.3 * Math.sin(((y - 2.0) / 2.2) * Math.PI), M.ramped(M.R.bone, 153)).map((b) => ({ ...b, keep: st !== 'ruined' }))); }
    B.push(box(3.9, 4.9, 3.4, 4.1, 0.3, 0.95, M.ramped(M.R.bone, 154, 5), { keep: true }), box(4.7, 5.3, 3.55, 3.95, 0.3, 0.7, M.ramped(M.R.bone, 155, 5), { keep: true })); // skull and jaw
    return { boxes: B, H: 0.75, top: 2 };
  } });

// Dead City of Ammon (ammon, depth 4): sun-dried mudbrick houses, the palace and the oracle temple; walls, gates and
// towers are the build-mode stone set
piece({ landmark: 'ammon', id: 'ammon-house-a', kind: 'house', fp: [3, 3], hp: 900, material: 'stone', heightM: 5, k: 21,
  note: 'a one-storey mudbrick house, flat roof with a lip, palm-trunk beam ends, a little roof room',
  model: (st) => ({ boxes: [...flatHouse(0.4, 0.4, 5.2, 5.0, 3.2, st), ...flatHouse(0.8, 0.8, 2.0, 1.8, 2.0, st, { beams: false }).map((b) => ({ ...b, z0: b.z0 + 3.2, z1: b.z1 + 3.2 }))], H: 3.2, top: 5.6, noNotch: true, banners: [[4.8, 4.8, 3.55]] }) });
piece({ landmark: 'ammon', id: 'ammon-house-b', kind: 'house', fp: [3, 3], hp: 900, material: 'stone', heightM: 7, k: 22,
  note: 'a two-storey mudbrick house on a stone footing, a roof terrace behind a parapet, a stair up its side',
  model: (st) => { const B = [box(0.3, 5.7, 0.3, 5.0, 0, 0.8, M.cyc, { body: true }), ...flatHouse(0.3, 0.3, 5.4, 4.7, 5.6, st).map((b) => (b.body ? { ...b, z0: 0.8 } : b))]; for (let i = 0; i < 8; i++) B.push(box(0.3 + i * 0.55, 0.85 + i * 0.55, 5.0, 5.8, 0, 0.7 * (i + 1), M.mud, { body: true })); return { boxes: B, H: 5.6, top: 6.0, noNotch: true, banners: [[5.2, 4.7, 5.95]] }; } });
piece({ landmark: 'ammon', id: 'ammon-palace', kind: 'keep', fp: [6, 6], hp: 6000, material: 'stone', heightM: 13, k: 23,
  note: 'the palace (keep, 6000 hp): a stone podium, a mudbrick hall behind a Greek portico of six red-shafted columns (Alexander\'s), a corner tower, flat roofs',
  model: (st) => {
    const B = [box(0.2, 11.8, 0.2, 11.8, 0, 1.6, M.bigCyc, { body: true }), ...[0.6, 1.1].map((z, i) => box(4.2, 7.8, 11.8, 12.4 - i * 0.3, 0, z, M.iso, { body: true }))];
    B.push(...shift(flatHouse(0.8, 0.8, 10.4, 7.2, 6.2, st, { beams: false }), 0, 0, 1.6));
    for (let i = 0; i < 6; i++) B.push(...cylinder(1.6 + i * 1.75, 10.6, 0.3, 1.6, 7.0, null, { paint: PAINT, top: () => TEX.lime[3] }).map((b) => ({ ...b, body: true })));
    B.push(box(0.9, 11.1, 9.9, 11.3, 7.0, 7.8, M.iso, { body: true }), ...roof(0.8, 11.2, 8.0, 11.4, (x, y) => 7.8 + 0.25 * (11.4 - y) / 3.4, (x, y) => [x, 11.4 - y]).map((b) => ({ ...b, roof: true })));
    B.push(...shift(sqTower(0, 0, 3.6, 10.5, { socle: 0.6, body: M.mud, base: M.cyc, roofed: false, st }), 0.8, 0.8, 1.6));
    return { boxes: B, H: 7.8, top: 13.4, banners: [[2.2, 4.0, 13.4], [11.0, 8.2, 7.8], [1.4, 11.2, 7.8]] };
  } });
piece({ landmark: 'ammon', id: 'ammon-temple', kind: 'temple', fp: [4, 6], hp: 3000, material: 'stone', heightM: 10, k: 24, oracle: true,
  note: 'the temple of Ammon (the oracle): an Egyptian pylon of battered limestone towers at the front, a flat-roofed hall with a cavetto cornice behind',
  model: (st) => {
    const lim = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.iso.px(Math.floor((x + y) * MX), Math.floor(z * PPM) % 180) ?? TEX.lime[2], 0.95) : M.iso(f, x, y, z, u, r));
    const batter = (x0, x1, y0, y1, H, s = 0.1) => cells(x0, x1, y0, y1, (x, y) => { const d = Math.min(x - x0, x1 - x, y - y0, y1 - y); return { z0: 0, z1: Math.min(H, d / s + 0.3), mat: lim, body: true }; }, 1 / 8);
    const B = [...batter(0.2, 3.4, 8.6, 11.8, 8.2), ...batter(4.6, 7.8, 8.6, 11.8, 8.2), box(3.3, 4.7, 9.6, 10.8, 0, 6.6, M.iso, { body: true })];
    B.push(box(3.4, 4.6, 10.8, 10.86, 0, 4.4, st === 'restored' ? bronzeLeaf : st === 'intact' ? leafMat(st) : solid(DOORDARK)));
    B.push(box(0.8, 7.2, 0.4, 8.6, 0, 5.4, M.iso, { body: true }), box(0.6, 7.4, 0.2, 8.7, 5.4, 6.0, (f, x, y, z) => mul(TEX.lime[z > 5.8 ? 3 : 2], f === 'top' ? 1 : z > 5.7 ? 1.05 : 0.8), { body: true }));
    for (const x of [1.8, 6.2]) B.push(...cylinder(x, 11.95, 0.12, 0, 9.5, null, { paint: TEX.wood[1] }).map((b) => ({ ...b, body: true }))); // the pylon's flag masts
    return { boxes: B, H: 8.2, top: 9.5, banners: [[1.9, 12.0, 7.2], [6.3, 12.0, 7.2]] };
  } });

// Sunken Temple of Achelous (delta, depth 4): half sunk in the mud; the water is the terrain's
const SINK = 1.4;
const sunk = (B) => B.map((b) => ({ ...b, z0: Math.max(0, b.z0 - SINK), z1: b.z1 - SINK })).filter((b) => b.z1 > 0.02);
piece({ landmark: 'sunken', id: 'sunken-temple', kind: 'temple', fp: [4, 4], hp: 3000, material: 'stone', heightM: 8, k: 31,
  note: 'the half-sunk temple of Achelous (4 x 4, the sanctum): a peristyle sunk 1.4 m in the mud, its roof half fallen even intact',
  model: (st) => ({ boxes: sunk(templeBoxes(0.1, 0.1, 7.8, 7.8, { steps: 2, s: 0.4, nx: 4, ny: 4, R: 0.38, Hc: 5.2, E: 1.0, rise: 1.4 })), H: 5.2, top: 7.6, roofLoss: 0.45, banners: [[1.0, 7.3, 5.4], [6.6, 7.3, 5.4]] }) });
both({ landmark: 'sunken', id: 'sunken-colonnade', kind: 'wall', fp: [2, 1], hp: 1200, material: 'stone', heightM: 6, k: 32, segment: 4,
  note: 'the colonnade wall: 4 m of stylobate, two columns and the architrave, joining end to end',
  model: (st) => { const B = [box(0, 4, 0.3, 1.7, 0, 0.5, M.iso, { body: true })]; for (const x of [1, 3]) B.push(...cylinder(x, 1, 0.34, 0.5, 4.6, null, { paint: mul(TEX.lime[3], 0.97), top: () => TEX.lime[3] }).map((b) => ({ ...b, body: true }))); B.push(box(0, 4, 0.55, 1.45, 4.6, 5.4, (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : z > 5.2 ? TEX.lime[3] : M.iso(f, x, y, z, u, r)), { body: true })); return { boxes: B, H: 5.4, top: 5.4, seg: 4 }; } });
piece({ landmark: 'sunken', id: 'sunken-shrine', kind: 'shrine', fp: [2, 2], hp: 800, material: 'stone', heightM: 5, k: 33,
  note: 'a river shrine: a little distyle naiskos on a podium, a gable roof',
  model: (st) => ({ boxes: templeBoxes(0.3, 0.3, 3.4, 3.4, { steps: 2, s: 0.25, nx: 2, ny: 2, R: 0.2, Hc: 2.6, E: 0.5, rise: 0.7, cella: false }), H: 3.1, top: 4.4, banners: [[3.3, 3.5, 3.6]] }) });
piece({ landmark: 'sunken', id: 'sunken-jetty', kind: 'jetty', fp: [1, 4], hp: 1200, material: 'stone', heightM: 1.2, k: 34,
  note: 'the stone jetty: big slabs on rough piers, mooring bollards',
  model: (st) => { const B = []; for (let y = 0; y < 8; y += 2) B.push(box(0.3, 1.7, y + 0.5, y + 1.5, 0, 0.5, M.cyc, { body: true })); B.push(box(0.1, 1.9, 0, 8, 0.5, 0.8, (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : mul(TEX.lime[1], 0.9)), { body: true })); for (const y of [1.5, 5.5]) B.push(...cylinder(1.6, y, 0.12, 0.8, 1.25, null, { paint: TEX.lime[2] })); return { boxes: B, H: 0.8, top: 1.25 }; } });
piece({ landmark: 'sunken', id: 'sunken-causeway', kind: 'ford', fp: [1, 1], hp: 400, material: 'stone', heightM: 0.5, k: 35, kit: 'tile',
  note: 'a causeway tile between islands (a ford): big flat stones set in the shallows; lay tile by tile',
  model: (st) => ({ boxes: [[0.1, 0.9, 0.1, 0.95], [1.0, 1.9, 0.15, 0.9], [0.15, 0.95, 1.05, 1.9], [1.05, 1.9, 1.0, 1.85]].map(([a, b, c, d], i) => box(a, b, c, d, 0, 0.22 + 0.06 * i % 0.18, (f, x, y) => (f === 'top' ? mul(TEX.lime[2 + (i % 2)], 0.9) : mul(TEX.lime[1], 0.8)), { body: true })), H: 0.35, top: 0.4 }) });
piece({ landmark: 'sunken', id: 'achelous-spring', kind: 'well', fp: [2, 2], hp: 800, material: 'stone', heightM: 2.2, k: 36,
  note: 'the river god\'s spring: a rock basin of dark water under a stele with a horned head spout',
  model: (st) => { const B = cells(0, 4, 0, 4, (x, y) => { const d = Math.hypot((x - 2) / 1.7, (y - 2.2) / 1.5); return d < 1 && d > 0.78 ? { z0: 0, z1: 0.55, mat: rubMat(36), body: true } : d <= 0.78 ? { z0: 0, z1: 0.3, mat: M.ramped(M.R.water, 37, 3), keep: true } : null; }, 1 / 8); B.push(box(1.2, 2.8, 0.2, 0.7, 0, 2.0, M.iso, { body: true }), box(1.75, 2.25, 0.7, 1.0, 1.0, 1.5, M.lime(2), { body: true }), ...[[1.65, 1.8], [2.2, 2.35]].map(([a, b]) => box(a, b, 0.75, 0.9, 1.5, 1.75, M.ramped(M.R.bone, 38)))); return { boxes: B, H: 2.0, top: 2.0 }; } });

// Temple City of the Navel (omphalos, depth 4)
piece({ landmark: 'navel', id: 'navel-temple', kind: 'temple', fp: [8, 8], hp: 12000, material: 'stone', heightM: 14, k: 41,
  note: 'the great temple (8 x 8, 12000 hp): a Doric peripteros of 6 x 6 columns on a three-step crepidoma, a painted frieze, a tiled gable',
  model: (st) => ({ boxes: templeBoxes(0.2, 0.2, 15.6, 15.6, { steps: 3, s: 0.45, nx: 6, ny: 6, R: 0.62, Hc: 8.0, E: 1.6, rise: 2.4 }), H: 9.4, top: 13.4, banners: [[1.3, 15.0, 9.4], [14.2, 15.0, 9.4]],
    rafters: [2.5, 5.5, 9.5, 12.5].flatMap((x) => beam('y', 3, 13, x, 0.18, (xx, y) => 4.6 - ((y - 3) / 10) * 4.2, solid(CHAR)).map((b) => ({ ...b, keep: true }))) }) });
piece({ landmark: 'navel', id: 'navel-arena', kind: 'arena', fp: [10, 10], hp: 6000, material: 'stone', heightM: 7, k: 42,
  note: 'the titan arena: a round of stepped stone seats (20 m) round a sand floor, an arched outer wall, the entrance to +y',
  model: (st) => {
    const c = 10, Ro = 9.7, Ri = 6.0, Hw = 5.6;
    const outer = (f, x, y, z, u, r) => { if (f === 'top') return M.tiers(f, x, y, z); const th = Math.atan2(y - c, x - c), a = ((th + Math.PI) / (2 * Math.PI)) * 2 * Math.PI * Ro, m = ((a % 3.2) + 3.2) % 3.2, arch = z > 0.4 && z < 2.6 + Math.sqrt(Math.max(0, 0.7 ** 2 - (m - 1.6) ** 2)) - 0.7 && Math.abs(m - 1.6) < 0.7; return arch ? DOORDARK : mul(TEX.iso.px(Math.floor(a * MX), Math.floor(z * PPM) % 180) ?? TEX.lime[2], lightOf((x - c) / Ro, (y - c) / Ro) * ao(z)); };
    const B = cells(0, 20, 0, 20, (x, y) => {
      const d = Math.hypot(x - c, y - c); if (d > Ro) return null;
      if (Math.abs(x - c) < 1.4 && y > c) return d > Ri ? { z0: 0, z1: 0.1, mat: flags, body: true } : null; // the entrance passage
      if (d > Ro - 0.6) return { z0: 0, z1: Hw, mat: outer, lit: true, body: true };
      if (d > Ri) return { z0: 0, z1: Math.max(0.5, Math.floor(((d - Ri) / (Ro - 0.6 - Ri)) * 9) * 0.55 + 0.5), mat: M.tiers, body: true };
      return { z0: 0, z1: 0.06, mat: (f, xx, yy) => mul([96, 82, 62, 255], 0.85 + 0.2 * hash(Math.floor(xx * 6) & 255, Math.floor(yy * 6) & 255, 5)), keep: true };
    }, 1 / 8);
    return { boxes: B, H: Hw, top: Hw, banners: [[c - 1.6, c + Ro - 0.3, Hw], [c + 1.4, c + Ro - 0.3, Hw]] };
  } });
piece({ landmark: 'navel', id: 'navel-omphalos', kind: 'statue', fp: [1, 1], hp: 400, material: 'stone', heightM: 2.6, k: 43,
  note: 'the omphalos: the navel stone of the world, an egg of grey stone under a carved net of fillets, on a stepped plinth',
  model: (st) => { const B = [box(0.15, 1.85, 0.15, 1.85, 0, 0.35, M.iso, { body: true }), box(0.35, 1.65, 0.35, 1.65, 0.35, 0.8, M.iso, { body: true })]; B.push(...cells(0.45, 1.55, 0.45, 1.55, (x, y) => { const d = Math.hypot(x - 1, y - 1) / 0.55; return d < 1 ? { z0: 0.8, z1: 0.8 + 1.6 * Math.sqrt(1 - d * d), mat: (f, xx, yy, z) => { const net = (Math.floor((xx + yy) * 6 + z * 4) % 3 === 0) !== (Math.floor((xx - yy) * 6 + z * 4) % 3 === 0); return mul(TEX.lime[net ? 3 : 2], 0.85); }, body: true } : null; }, 1 / 16)); return { boxes: B, H: 2.4, top: 2.4 }; } });
both({ landmark: 'navel', id: 'navel-ramp-gate', kind: 'gate', fp: [5, 2], hp: 2500, material: 'stone', heightM: 10, k: 44,
  note: 'a ramp gatehouse (4 of them): the Lion Gate between two square towers at the top of a ramp; the holder\'s stone gate once restored',
  model: (st) => { const B = [...sqTower(0, 0.2, 3, 8, { socle: 1.5, rise: 1.0, st }), ...sqTower(7, 0.2, 3, 8, { socle: 1.5, rise: 1.0, st }), ...shift(gateBoxes('stone', 'x', gate(st), 4, gateOpt(st)), 3, 1.1)]; return { boxes: B, H: 8, top: 9.2, banners: [[1.3, 3.4, 8.25], [8.3, 3.4, 8.25]] }; } });

// Cyclopean Gatehouse (saddle, depth 3): blocks twice the size of the build-mode cyclopean wall
piece({ landmark: 'cyclops', id: 'cyclops-gatehouse-x', axis: 'x', kind: 'gate', fp: [6, 3], hp: 6000, material: 'stone', heightM: 12, k: 51,
  note: 'the gatehouse of giant blocks astride the switchback road: two bastions, a passage under one monstrous lintel with its relieving triangle, a walk on top at 8 m (Brontes hurls from here)',
  model: (st) => {
    const B = [...wallBlock(0, 4.2, 0, 6, 8, M.bigCyc, { sides: ['+y', '-y', '-x'], paraH: 1.2, t: 0.6 }), ...wallBlock(7.8, 12, 0, 6, 8, M.bigCyc, { sides: ['+y', '-y', '+x'], paraH: 1.2, t: 0.6 })];
    B.push(box(3.6, 8.4, 0.6, 5.4, 4.6, 6.2, (f, x, y, z, u, r) => (f === 'top' ? rough(f, x, y) : mul(TEX.lime[2], (0.85 + 0.1 * hash(Math.floor(x * 2) & 255, Math.floor(z * 3) & 255, 4)) * ao(z))), { body: true })); // the lintel: one block
    B.push(...cells(4.2, 7.8, 5.2, 5.6, (x) => { const t = 1 - Math.abs(x - 6) / 1.8; return t > 0 ? { z0: 6.2, z1: 6.2 + 1.7 * t, mat: (f, xx, y, z) => mul(TEX.lime[1], 0.7 + 0.1 * Math.sin(xx * 9)), body: true } : null; }, 1 / 16)); // relieving triangle
    B.push(box(4.2, 7.8, 0.6, 5.4, 6.2, 8, M.bigCyc, { body: true }), ...wallBlock(4.2, 7.8, 0, 6, 8, M.bigCyc, { sides: ['+y', '-y'], paraH: 1.2, t: 0.6 }).slice(1));
    const lm = st === 'restored' ? ironBound : leafMat(st);
    if (st === 'intact' || st === 'restored') B.push(box(4.25, 7.75, 5.0, 5.15, 0, 4.6, lm, { keep: false }));
    else if (st === 'damaged') { B.push(box(4.3, 4.45, 3.2, 5.0, 0, 4.4, leafMat('intact')), box(7.55, 7.7, 3.2, 5.0, 0, 4.4, leafMat('intact'))); }
    return { boxes: B, H: 8, top: 9.2, banners: [[1.8, 5.6, 9.2], [10.2, 5.6, 9.2]] };
  } });
piece({ landmark: 'cyclops', id: 'cyclops-gatehouse-y', axis: 'y', kind: 'gate', fp: [3, 6], hp: 6000, material: 'stone', heightM: 12, k: 51, note: 'the gatehouse along y', model: (st) => { const m = PIECES.find((p) => p.id === 'cyclops-gatehouse-x').model(st); return { ...m, boxes: swapXY(m.boxes), banners: m.banners.map(([x, y, z]) => [y, x, z]) }; } });
both({ landmark: 'cyclops', id: 'cyclops-wall', kind: 'wall', fp: [4, 2], hp: 3000, hpNote: 'a tile', material: 'stone', heightM: 8, k: 52, segment: 8,
  note: '8 m of cyclopean wall of giant blocks, the walk at 6 m',
  model: (st) => ({ boxes: wallBlock(0, 8, 0, 4, 6, M.bigCyc, { sides: ['+y', '-y'], paraH: 1.2, t: 0.6 }), H: 6, top: 7.2, seg: 8 }) });
piece({ landmark: 'cyclops', id: 'cyclops-tower', kind: 'tower', fp: [3, 3], hp: 4000, material: 'stone', heightM: 10, k: 53, platformM: 8.2,
  note: 'a round bastion of giant blocks, open fighting top',
  model: (st) => ({ boxes: rdTower(3, 3, 2.75, 8, { T: TEX.cyclo, socle: 2, roofed: false }), H: 8, top: 9.2, banners: [[3, 5.6, 9.2]] }) });

// Oracle Grove (erymanthos, depth 3): the oaks are wood nodes of the region
piece({ landmark: 'oracle', id: 'oracle-shrine', kind: 'shrine', fp: [3, 3], hp: 800, material: 'stone', heightM: 6, k: 61,
  note: 'the oracle shrine: an Ionic naiskos with a red pediment and a ring of six bronze tripod cauldrons that ring in the wind (as at Dodona)',
  model: (st) => { const B = templeBoxes(1.4, 1.2, 3.2, 3.6, { steps: 2, s: 0.25, nx: 2, ny: 3, R: 0.2, Hc: 2.8, E: 0.55, rise: 0.8 }); for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * Math.PI + 0.5, x = 3 + Math.cos(a) * 2.55, y = 3 + Math.sin(a) * 2.55; B.push(box(x - 0.18, x + 0.18, y - 0.18, y + 0.18, 0, 0.5, M.iso, { body: true }), ...tripod(x, y, 0.5, { H: 0.9, R: 0.26 }).map((b) => ({ ...b, body: true }))); } return { boxes: B, H: 3.4, top: 4.6 }; } });
piece({ landmark: 'oracle', id: 'oracle-house', kind: 'house', fp: [3, 2], hp: 900, material: 'stone', heightM: 5, k: 62,
  note: 'the priestess\'s house: fieldstone walls, a tiled gable, a timber porch',
  model: (st) => ({ boxes: gableHouse(0.4, 0.3, 5.2, 2.2, 2.7, st, { axis: 'x', porch: true }), H: 2.7, top: 3.6, noNotch: true }) });
for (const [id, wat, name] of [['spring-memory', 'water', 'the Spring of Memory: clear dark water'], ['spring-lethe', 'lethe', 'the Spring of Lethe: black still water, a cypress-dark stele']]) piece({ landmark: 'oracle', id, kind: 'well', fp: [2, 2], hp: 800, material: 'stone', heightM: 2.4, k: id.length + 60,
  note: `${name}, a stepped basin under a stele with a lion-head spout`,
  model: (st) => { const B = [...wallBlock(0.2, 3.8, 0.4, 3.8, 0.5, M.iso, { paraH: 0.3, t: 0.3 }).slice(1).map((b) => ({ ...b, z0: 0, body: true })), box(0.5, 3.5, 0.7, 3.5, 0, 0.32, M.ramped(M.R[wat], 66, 3), { keep: true }), box(1.1, 2.9, 0.1, 0.5, 0, 2.2, (f, x, y, z, u, r) => (wat === 'lethe' ? mul(M.iso(f, x, y, z, u, r) ?? TEX.lime[1], 0.6) : M.iso(f, x, y, z, u, r)), { body: true }), box(1.8, 2.2, 0.5, 0.75, 1.1, 1.45, M.ramped(M.R.bronze, 67, 8), { body: true })]; for (const [i, x] of [1.4, 2.6].entries()) B.push(box(x - 0.3, x + 0.3, 3.8, 4.0 - i * 0.05, 0, 0.22, M.iso, { body: true })); return { boxes: B, H: 2.2, top: 2.2 }; } });

// Titan's Forge (gorge, depth 3)
piece({ landmark: 'forge', id: 'titan-anvil', kind: 'forge', fp: [3, 3], hp: 4000, material: 'stone', heightM: 4, k: 71,
  note: 'the great anvil (a forge L3+, 4000 hp): a dark iron anvil the size of a cart on a cyclopean plinth, a horn to +x, chains (Gyges is bound here), a hearth basin of coals',
  model: (st) => {
    const ir = (f, x, y, z) => M.R.iron[f === 'top' ? 3 : f === '+y' ? 2 : 1 + (M.nz(x, y, z, 72, 10) > 0.8 ? 1 : 0)];
    const B = [box(0.3, 5.7, 0.6, 5.0, 0, 1.0, M.bigCyc, { body: true }), box(1.8, 3.6, 2.1, 3.5, 1.0, 1.4, ir, { body: true }), box(2.1, 3.3, 2.3, 3.3, 1.4, 2.2, ir, { body: true }), box(1.2, 4.0, 1.9, 3.7, 2.2, 2.9, ir, { body: true })];
    B.push(...cells(4.0, 5.5, 2.3, 3.3, (x, y) => { const t = (x - 4.0) / 1.5, r = 0.48 * (1 - t); return Math.abs(y - 2.8) < r ? { z0: 2.9 - 0.7 * (1 - t) * 0.9, z1: 2.9 - 0.05 * t, mat: ir, body: true } : null; }, 1 / 16));
    for (const [ax, ay] of [[0.6, 5.0], [5.6, 4.8]]) for (let t = 0; t <= 1; t += 0.07) { const x = 2.2 + (ax - 2.2) * t, y = 3.4 + (ay - 3.4) * t; B.push(box(x - 0.09, x + 0.09, y - 0.09, y + 0.09, 1.0 + 0.2 * Math.sin(t * Math.PI), 1.18 + 0.2 * Math.sin(t * Math.PI), ir, { body: true })); }
    B.push(...cells(0.5, 2.0, 0.7, 2.0, (x, y) => { const d = Math.hypot(x - 1.25, y - 1.35); return d < 0.62 ? { z0: 1.0, z1: d > 0.48 ? 1.45 : 1.18, mat: d > 0.48 ? rubMat(73) : st === 'ruined' || st === 'damaged' ? M.ramped([CHAR, mul(CHAR, 1.4)], 74, 12) : M.ramped(M.R.coal, 74, 14), body: true } : null; }, 1 / 16));
    return { boxes: B, H: 2.9, top: 2.9 };
  } });
piece({ landmark: 'forge', id: 'titan-bellows', kind: 'workshop', fp: [2, 2], hp: 1200, material: 'wood', burnable: true, heightM: 4.5, k: 75,
  note: 'the water bellows: an undershot wheel turned by the falls drives a rocking beam over two great leather bellows',
  model: (st) => { const wm = (f, x, y, z) => { const r = Math.hypot(x - 1.2, z - 1.7), th = Math.atan2(z - 1.7, x - 1.2); return f === '+y' || f === '-y' ? (r < 0.2 ? TEX.wood[0] : r > 1.45 || Math.abs(Math.sin(th * 4)) < 0.16 ? TEX.wood[2] : mul(TEX.wood[1], 0.75)) : TEX.wood[1]; };
    const B = [...discXZ(1.2, 1.7, 1.6, 0.3, 0.75, wm).map((b) => ({ ...b, body: true })), box(1.0, 1.4, 0.2, 2.6, 1.55, 1.85, woodSolid(0), { body: true }), box(0.2, 0.45, 2.3, 2.6, 0, 2.0, woodSolid(1), { body: true })];
    for (const x of [1.8, 3.0]) B.push(box(x, x + 0.9, 1.6, 3.6, 0, 0.35, woodSolid(1), { body: true }), ...cells(x + 0.05, x + 0.85, 1.7, 3.5, (xx, y) => ({ z0: 0.35, z1: 0.35 + 0.75 * (1 - (y - 1.7) / 1.8) + 0.1 * Math.sin((xx - x) * 6), mat: M.ramped(M.R.hide, 76, 5), body: true }), 1 / 16));
    B.push(...beam('x', 1.2, 3.9, 2.5, 0.2, (x) => 2.0 + 0.1 * (x - 1.2), woodSolid(0)).map((b) => ({ ...b, body: true })), box(3.4, 3.6, 2.4, 2.6, 0, 2.4, woodSolid(1), { body: true }));
    return { boxes: B, H: 3.3, top: 3.4 }; } });
piece({ landmark: 'forge', id: 'titan-slag', kind: 'node', fp: [2, 2], hp: 300, material: 'stone', heightM: 2, k: 77, node: 'titan bronze (slag, 20 once)',
  note: 'the slag heap: glassy black slag and rusty cinder, a few bronze-green runs',
  model: (st) => ({ boxes: [...heap(2, 2.1, 1.8, 1.6, 1.7, 771, (f, x, y, z) => { const q = M.nz(x, y, z, 78, 8); return q > 0.93 ? mul([62, 92, 70, 255], 0.9) : M.R.slag[Math.floor(q * 4)]; }, 0.18).map((b) => ({ ...b, body: true }))], H: 1.6, top: 1.7 }) });
piece({ landmark: 'forge', id: 'titan-tower', kind: 'tower', fp: [2, 2], hp: 2500, material: 'stone', heightM: 9, k: 79, platformM: 7,
  note: 'a cliffside guard tower over the rock bridge (2 of them): rough cyclopean socle, square shaft, tiled roof',
  model: (st) => ({ boxes: sqTower(0.1, 0.1, 3.8, 7, { socle: 2.2, base: M.bigCyc, rise: 1.0, st }), H: 7, top: 8.2, banners: [[1.9, 4.0, 7.25]] }) });

// Obsidian Hold (canyons, depth 3): cut from the living basalt
both({ landmark: 'obsidian', id: 'obsidian-wall', kind: 'wall', fp: [4, 2], hp: 3000, hpNote: 'a tile; only stone throwers hurt it', material: 'rock', heightM: 9, k: 81, segment: 8,
  note: '8 m of rock-cut wall: the mesa\'s basalt left standing, a walk cut along its top at 7 m behind a ragged rock parapet; not burnable',
  model: (st) => { const B = [box(0, 8, 0, 4, 0, 7, M.rock, { body: true })]; for (const [y0, y1] of [[0, 0.7], [3.3, 4]]) B.push(...cells(0, 8, y0, y1, (x, y) => ({ z0: 7, z1: 7 + 0.8 + 0.45 * vn(x, y, 82, 1.5, 12), mat: M.rock, body: true }), 0.25)); return { boxes: B, H: 7, top: 8.2, seg: 8 }; } });
piece({ landmark: 'obsidian', id: 'obsidian-tower', kind: 'tower', fp: [3, 3], hp: 4000, material: 'rock', heightM: 12, k: 83, platformM: 9.5,
  note: 'a rock-cut tower: an irregular basalt pillar dressed square at the top, a fighting platform',
  model: (st) => ({ boxes: [...cells(0, 6, 0, 6, (x, y) => { const th = Math.atan2(y - 3, x - 3), R = 2.5 + 0.35 * vn(Math.cos(th) * 2 + 3, Math.sin(th) * 2 + 3, 84, 1.3); return Math.hypot(x - 3, y - 3) < R ? { z0: 0, z1: 9.5, mat: M.rock, body: true } : null; }, 0.25), ...cells(0.6, 5.4, 0.6, 5.4, (x, y) => (Math.max(Math.abs(x - 3), Math.abs(y - 3)) > 1.9 ? { z0: 9.5, z1: 10.6 + 0.3 * vn(x, y, 85, 2), mat: M.rock, body: true } : null), 0.25)], H: 9.5, top: 10.9, banners: [[3, 5.2, 10.6]] }) });
piece({ landmark: 'obsidian', id: 'obsidian-kiln', kind: 'kiln', fp: [3, 3], hp: 2000, material: 'stone', heightM: 5, k: 86,
  note: 'the vent kiln: a domed clay-and-stone kiln over a volcanic fissure in a black rock mound, glowing cracks; pitch without wood (fx: smoke from the vent)',
  model: (st) => {
    const live = st === 'intact' || st === 'restored', B = heap(3, 3, 2.9, 2.7, 1.3, 861, (f, x, y, z) => (live && vn(x, y, 87, 2.2) > 0.86 && f === 'top' ? EMBER : M.rock(f, x, y, z)), 0.2).map((b) => ({ ...b, body: true }));
    const clay = [[70, 48, 34], [102, 72, 50], [134, 98, 68]].map((c) => [...c, 255]);
    B.push(...cells(1.5, 4.5, 1.5, 4.5, (x, y) => { const d = Math.hypot(x - 3, y - 3) / 1.5; return d < 1 ? { z0: 0.6, z1: 1.2 + 2.2 * Math.sqrt(1 - d * d), mat: (f, xx, yy, z) => mul(clay[Math.floor(M.nz(xx, yy, z, 88, 6) * 3)], f === 'top' ? 1 : 0.9), body: true } : null; }, 1 / 16));
    B.push(...cylinder(3, 3, 0.35, 3.3, 4.2, null, { paint: clay[1] }).map((b) => ({ ...b, body: true })), opening('+y', 2.5, 3.5, 4.35, 0.8, 1.9, live ? M.ramped(M.R.coal, 89, 10) : solid(DOORDARK)));
    for (const [x, y] of [[4.9, 4.4], [5.3, 3.8], [1.0, 5.0]]) B.push(...cylinder(x, y, 0.22, 0, 0.6, null, { paint: clay[0], top: () => [14, 12, 12, 255] }));
    return { boxes: B, H: 3.4, top: 4.2 };
  } });
piece({ landmark: 'obsidian', id: 'obsidian-field', kind: 'node', fp: [2, 2], hp: 200, material: 'rock', heightM: 1.2, k: 90, node: 'obsidian',
  note: 'the obsidian glass field (node): black volcanic glass breaking out of the ground in sharp flakes',
  model: (st) => { const B = []; for (let i = 0; i < 22; i++) { const x = 0.3 + hash(i, 1, 91) * 3.4, y = 0.3 + hash(i, 2, 91) * 3.4, h = 0.2 + hash(i, 3, 91) * 0.9, w = 0.12 + hash(i, 4, 91) * 0.25; B.push(...cells(x - w, x + w, y - 0.08, y + 0.08, (xx) => ({ z0: 0, z1: h * (1 - Math.abs(xx - x) / w) + 0.05, mat: (f, a, b, z) => M.R.glass[f === 'top' ? 3 : f === '+y' ? (z > h * 0.6 ? 3 : 2) : 1], body: true }), 1 / 16)); } return { boxes: B, H: 1.0, top: 1.1 }; } });

// Rim Watchtower (siren, depth 4): the sea stack is terrain (h4)
piece({ landmark: 'rim', id: 'rim-beacon', kind: 'tower', fp: [3, 3], hp: 2500, material: 'stone', heightM: 14, k: 101, platformM: 11, platformCap: 12,
  note: 'the beacon tower on the sea stack (a stone tower, cap 12): a tall round ashlar tower, an open top with a bronze fire basket (fx: the beacon fire)',
  model: (st) => ({ boxes: [...rdTower(3, 3, 2.5, 11, { socle: 2, roofed: false }), ...tripod(3, 3, 11.22, { H: 1.4, R: 0.6, coals: st === 'intact' || st === 'restored' }).map((b) => ({ ...b, body: true }))], H: 11, top: 12.8, banners: [[3, 5.4, 12.2]] }) });
for (const [axis, sgn] of [['x', '+'], ['x', '-'], ['y', '+'], ['y', '-']]) piece({ landmark: 'rim', id: `rim-stair-${axis}${sgn}`, axis, kind: 'stair', fp: axis === 'x' ? [3, 1] : [1, 3], hp: 1500, material: 'stone', heightM: 5, k: 102, riseM: 3,
  note: 'the walled stair up the stack: 6 m of steps rising 3 m between parapet walls (lay end to end, each a level of 3 m higher)',
  model: (st) => { const B = []; for (let i = 0; i < 12; i++) { const a0 = i * 0.5, z = 0.25 * (i + 1); B.push(box(a0, a0 + 0.5, 0.35, 1.65, 0, z, (f, x, y, zz, u, r) => (f === 'top' ? flags(f, x, y) : M.iso(f, x, y, zz, u, r)), { body: true })); for (const [y0, y1] of [[0, 0.35], [1.65, 2]]) B.push(box(a0, a0 + 0.5, y0, y1, 0, z + 1.0, M.iso, { body: true })); } let bx = B; if (sgn === '-') bx = bx.map((b) => ({ ...b, x0: 6 - b.x1, x1: 6 - b.x0, mat: (f, x, y, z, u, r) => b.mat(f === '+x' ? '-x' : f === '-x' ? '+x' : f, 6 - x, y, z, u, r) })); return { boxes: axis === 'y' ? swapXY(bx) : bx, H: 3.5, top: 4.0 }; } });
piece({ landmark: 'rim', id: 'rim-keeper-house', kind: 'house', fp: [3, 2], hp: 900, material: 'stone', heightM: 5, k: 103,
  note: 'the keeper\'s house: a low fieldstone house with a tiled gable, salt-stained',
  model: (st) => ({ boxes: gableHouse(0.4, 0.4, 5.2, 3.0, 2.6, st, { axis: 'x' }), H: 2.6, top: 3.5, noNotch: true }) });

// ---- W-48 landmark architecture at scale: the city set (arch-*), Ammon's mudbrick city, and the larger landmarks'
// quarters. Dwellings are `shell` models: whole masses intact and restored, hollow walls round their rooms when damaged
// or ruined (stateBoxes), so a ruined quarter still reads as streets of roofless houses.
const WALL_T = 0.35, EARTH_C = [58, 48, 38, 255], FLOOR = (f, x, y) => mul(TEX.lime[1], 0.62 + 0.1 * hash(Math.floor(x * 3) & 255, Math.floor(y * 3) & 255, 5));
const whole = (st) => st === 'intact' || st === 'restored';
// rooms [x0, x1, y0, y1, h]: solid masses when whole; else four thin walls each (a door gap in the first room's +y wall), a floor
function rooms(R, st, mat, { door = 1.1, slab = null } = {}) {
  const B = [];
  R.forEach(([x0, x1, y0, y1, h], i) => {
    if (whole(st)) { B.push(box(x0, x1, y0, y1, 0, h, mat, { body: true })); return; }
    const t = WALL_T, cx = (x0 + x1) / 2;
    if (i === 0 && door) B.push(box(x0, cx - door / 2, y1 - t, y1, 0, h, mat, { body: true }), box(cx + door / 2, x1, y1 - t, y1, 0, h, mat, { body: true }));
    else B.push(box(x0, x1, y1 - t, y1, 0, h, mat, { body: true }));
    B.push(box(x0, x1, y0, y0 + t, 0, h, mat, { body: true }), box(x0, x0 + t, y0 + t, y1 - t, 0, h, mat, { body: true }), box(x1 - t, x1, y0 + t, y1 - t, 0, h, mat, { body: true }));
    B.push(box(x0 + t, x1 - t, y0 + t, y1 - t, 0, 0.05, FLOOR, { keep: true }));
    if (slab) B.push(box(x0, x1, y0, y1, h - 0.22, h, slab, { roof: true })); // a flat roof (damaged: kept where the walls stand)
  });
  return B;
}
// windows / doors only on a whole house: [face, a0, a1, at, z0, z1, mat?]
const holes = (st, list) => (whole(st) ? list.map((o) => opening(...o)) : []);
let PLASTER, HAY, CLAY, STRAW;
function archMats() {
  if (PLASTER) return;
  // limewashed rubble over an isodomic socle (0.9 m): Greek town houses
  PLASTER = (f, x, y, z, u, r) => { if (f === 'top') return rough(f, x, y); if (z < 0.9) return M.iso(f, x, y, z, u, r); const a = f === '+y' || f === '-y' ? x : y; return mul(TEX.lime[2 + (vn(a, z, 171, 1.4) > 0.7 ? 1 : 0)], ao(z) * (0.86 + 0.1 * vn(a * 3, z * 3, 172, 1) - (vn(a, z, 173, 0.8) > 0.8 ? 0.12 : 0))); };
  const r3 = (cs) => cs.map((c) => [...c, 255]);
  HAY = r3([[92, 76, 42], [122, 100, 56], [150, 126, 70]]); CLAY = r3([[70, 48, 34], [102, 72, 50], [134, 98, 68]]); STRAW = r3([[78, 66, 40], [104, 88, 52], [128, 110, 66]]);
}
const ramp3 = (R, kk, s = 8) => (f, x, y, z) => mul(R[Math.floor(M.nz(x, y, z, kk, s) * R.length) % R.length], f === 'top' ? 1.02 : 0.9);
// the Ammon house wall: a limestone footing (0.8 m) under mudbrick
const MUDH = (f, x, y, z, u, r) => (z < 0.8 && f !== 'top' ? M.iso(f, x, y, z, u, r) : M.mud(f, x, y, z, u, r));
const MUDSLAB = (f, x, y) => mul(M.R.mud[2], 0.88);
const lips = (x0, x1, y0, y1, h, mat = M.mud) => wallBlock(x0, x1, y0, y1, h, mat, { paraH: 0.32, t: 0.22 }).slice(1);
const batter = (x0, x1, y0, y1, H, mat, s = 0.1) => cells(x0, x1, y0, y1, (x, y) => { const d = Math.min(x - x0, x1 - x, y - y0, y1 - y); return { z0: 0, z1: Math.min(H, d / s + 0.3), mat, body: true }; }, 1 / 8);
const merlons = (x0, x1, y0, y1, z, h, mat, p = 1, w = 0.6) => { const B = []; for (let a = x0; a < x1 - 1e-6; a += p) B.push(box(a + (p - w) / 2, a + (p + w) / 2, y0, y1, z, z + h, mat, { body: true })); return B; };
const ring4 = (x0, x1, y0, y1, z, h, mat, t = 0.4) => [...merlons(x0, x1, y1 - t, y1, z, h, mat), ...merlons(x0, x1, y0, y0 + t, z, h, mat), ...swapXY(merlons(y0 + 1, y1 - 1, x0, x0 + t, z, h, mat)), ...swapXY(merlons(y0 + 1, y1 - 1, x1 - t, x1, z, h, mat))];
const leaves = (st) => (st === 'restored' ? ironBound : st === 'intact' ? leafMat(st) : solid(DOORDARK));

// the city set (arch-*): ashlar curtain, towers and gates, houses, barracks and the public buildings
both({ landmark: 'arch', id: 'arch-wall', kind: 'wall', fp: [4, 2], hp: 1500, hpNote: 'a tile', material: 'stone', heightM: 8, k: 161, segment: 8,
  note: '8 m of city curtain, 2 tiles deep: isodomic ashlar, the walk at 6 m behind a crenellated parapet (1 m merlons); segments join end to end in every state',
  model: (st) => ({ boxes: [box(0, 8, 0, 4, 0, 6, M.iso, { body: true }), box(0, 8, 3.5, 4, 6, 6.5, M.iso, { body: true }), box(0, 8, 0, 0.5, 6, 6.5, M.iso, { body: true }), ...merlons(0, 8, 3.5, 4, 6.5, 0.8, M.iso), ...merlons(0, 8, 0, 0.5, 6.5, 0.8, M.iso)], H: 6, top: 7.3, seg: 8, banners: [[3.6, 3.6, 6.5]] }) });
piece({ landmark: 'arch', id: 'arch-tower', kind: 'tower', fp: [3, 3], hp: 3000, material: 'stone', heightM: 10, k: 162, platformM: 8,
  note: 'a city wall tower: two storeys of isodomic ashlar on a cyclopean socle, a string course, a tiled pyramid roof over its fighting chamber',
  model: (st) => ({ boxes: [...sqTower(0.2, 0.2, 5.6, 8, { socle: 1.5, rise: 1.4, st }), box(0.12, 5.88, 0.12, 5.88, 4.2, 4.45, M.iso, { body: true })], H: 8, top: 9.6, banners: [[2.9, 5.9, 8.25]] }) });
both({ landmark: 'arch', id: 'arch-gate', kind: 'gate', fp: [6, 3], hp: 4000, material: 'stone', heightM: 11, k: 163,
  note: 'a city gate: two square towers flanking a 4 m passage, the leaves on the outer (+y) face, a crenellated walk between the towers at 7 m',
  model: (st) => {
    const B = [...sqTower(0, 0.6, 4, 9, { socle: 1.5, rise: 1.2, st, k: 1 }), ...sqTower(8, 0.6, 4, 9, { socle: 1.5, rise: 1.2, st, k: 2 }), ...shift(gateBoxes('stone', 'x', gate(st), 4, gateOpt(st)), 4, 2.1)];
    B.push(box(4, 8, 1.0, 4.4, 5.97, 7, M.iso, { body: true }), ...merlons(4, 8, 4.0, 4.4, 7, 0.8, M.iso), ...merlons(4, 8, 1.0, 1.4, 7, 0.8, M.iso));
    return { boxes: B, H: 9, top: 10.4, banners: [[1.8, 4.9, 9.25], [9.8, 4.9, 9.25]] };
  } });
both({ landmark: 'arch', id: 'arch-barbican', kind: 'gate', fp: [6, 4], hp: 5000, material: 'stone', heightM: 9, k: 164,
  note: 'a barbican: a forward gate court, two drum turrets either side of the outer gate (+y), short walls running back to the main gate',
  model: (st) => {
    const B = [...rdTower(2.2, 5.6, 2.0, 7.5, { socle: 1.5, roofed: false }), ...rdTower(9.8, 5.6, 2.0, 7.5, { socle: 1.5, roofed: false }), ...shift(gateBoxes('stone', 'x', gate(st), 5, gateOpt(st)), 4, 5.0)];
    for (const x0 of [0.6, 10.2]) B.push(box(x0, x0 + 1.2, 0, 4.0, 0, 5, M.iso, { body: true }), ...swapXY(merlons(0, 4, x0, x0 + 0.4, 5, 0.8, M.iso)), ...swapXY(merlons(0, 4, x0 + 0.8, x0 + 1.2, 5, 0.8, M.iso)));
    B.push(box(4, 8, 5.05, 6.95, 5.97, 6.5, M.iso, { body: true }), ...merlons(4, 8, 6.55, 6.95, 6.5, 0.8, M.iso));
    return { boxes: B, H: 7.5, top: 8.5, banners: [[2.2, 7.4, 8.5], [9.8, 7.4, 8.5]] };
  } });
piece({ landmark: 'arch', id: 'arch-house-a', kind: 'house', fp: [3, 3], hp: 900, material: 'stone', heightM: 5, k: 101,
  note: 'a small Greek town house: limewashed rubble on an ashlar socle, a tiled gable, a walled front yard; ruined a roofless shell',
  model: (st) => {
    archMats();
    const B = [...rooms([[0.5, 5.5, 0.4, 3.9, 3.3]], st, PLASTER), ...gable(0.2, 5.8, 0.1, 4.2, 3.3, 1.2, 'x', { ped: false })];
    B.push(box(0.5, 0.8, 3.9, 5.7, 0, 1.7, PLASTER, { body: true }), box(5.2, 5.5, 3.9, 5.7, 0, 1.7, PLASTER, { body: true }), box(0.5, 2.4, 5.4, 5.7, 0, 1.7, PLASTER, { body: true }), box(3.5, 5.5, 5.4, 5.7, 0, 1.7, PLASTER, { body: true }));
    B.push(box(0.8, 5.2, 3.9, 5.4, 0, 0.04, (f, x, y) => mul(EARTH_C, 0.9 + 0.15 * hash(Math.floor(x * 5) & 255, Math.floor(y * 5) & 255, 3)), { keep: true }));
    B.push(...holes(st, [['+y', 2.6, 3.5, 3.9, 0, 2.0, leafMat('intact')], ['+y', 1.2, 1.7, 3.9, 1.9, 2.5], ['+y', 4.2, 4.7, 3.9, 1.9, 2.5], ['+x', 1.6, 2.1, 5.5, 1.9, 2.5]]));
    return { boxes: B, H: 3.3, top: 4.5, noNotch: true, shell: true, banners: [[5.0, 5.5, 1.7]] };
  } });
piece({ landmark: 'arch', id: 'arch-house-b', kind: 'house', fp: [4, 4], hp: 1100, material: 'stone', heightM: 5.5, k: 102,
  note: 'a courtyard (pastas) house: four wings of rooms round a small paved court, tiled lean-to roofs falling into the court; ruined a roofless shell',
  model: (st) => {
    archMats();
    const B = rooms([[0.4, 7.6, 5.4, 7.6, 3.0], [0.4, 7.6, 0.4, 3.0, 3.8], [0.4, 2.8, 3.0, 5.4, 3.2], [5.2, 7.6, 3.0, 5.4, 3.2]], st, PLASTER);
    const lean = (x0, x1, y0, y1, f, d) => roof(x0, x1, y0, y1, f, d).map((b) => ({ ...b, roof: true }));
    B.push(...lean(0.1, 7.9, 0.1, 3.3, (x, y) => 3.8 + 1.0 * (3.3 - y) / 3.2, (x, y) => [x, 3.3 - y]), ...lean(0.1, 7.9, 5.1, 7.9, (x, y) => 3.0 + 0.9 * (y - 5.1) / 2.8, (x, y) => [x, y - 5.1]));
    B.push(...lean(0.1, 3.1, 3.3, 5.1, (x, y) => 3.2 + 0.8 * (3.1 - x) / 3.0, (x, y) => [y, 3.1 - x]), ...lean(4.9, 7.9, 3.3, 5.1, (x, y) => 3.2 + 0.8 * (x - 4.9) / 3.0, (x, y) => [y, x - 4.9]));
    B.push(box(2.8, 5.2, 3.0, 5.4, 0, 0.06, flags, { keep: true }), box(3.7, 4.3, 3.9, 4.5, 0.06, 0.8, M.iso, { body: true })); // the court and its altar
    B.push(...holes(st, [['+y', 3.5, 4.5, 7.6, 0, 2.0, leafMat('intact')], ['+y', 1.4, 1.8, 7.6, 1.8, 2.4], ['+y', 6.2, 6.6, 7.6, 1.8, 2.4], ['+x', 1.2, 1.6, 7.6, 2.4, 3.0], ['+x', 4.0, 4.4, 7.6, 1.8, 2.4]]));
    return { boxes: B, H: 3.8, top: 4.8, noNotch: true, shell: true, banners: [[7.2, 7.7, 3.9]] };
  } });
piece({ landmark: 'arch', id: 'arch-tenement', kind: 'house', fp: [4, 3], hp: 1200, material: 'stone', heightM: 10.5, k: 103,
  note: 'a three-storey tenement block (synoikia): limewashed walls on an ashlar socle, small windows, a timber balcony, a tiled gable; ruined a roofless shell',
  model: (st) => {
    archMats();
    const H = 8.4, B = [...rooms([[0.4, 4.0, 0.4, 5.4, H], [4.0, 7.6, 0.4, 5.4, H]], st, PLASTER), ...gable(0.1, 7.9, 0.1, 5.7, H, 1.5, 'x', { ped: false })];
    const w = [];
    for (const z of [1.2, 4.0, 6.8]) { for (const a of [1.0, 3.0, 5.2, 6.6]) if (!(z < 2 && a < 3.5)) w.push(['+y', a, a + 0.45, 5.4, z, z + 0.7]); for (const a of [1.2, 3.6]) w.push(['+x', a, a + 0.45, 7.6, z, z + 0.7]); }
    B.push(...holes(st, [['+y', 1.7, 2.7, 5.4, 0, 2.1, leafMat('intact')], ...w]));
    if (whole(st)) B.push(box(4.6, 7.2, 5.4, 5.95, 3.1, 3.25, planks('x', 3), { body: true }), ...[4.7, 5.9, 7.05].map((x) => box(x, x + 0.1, 5.85, 5.95, 3.25, 4.1, woodSolid(1), { body: true })), box(4.6, 7.2, 5.85, 5.95, 4.0, 4.1, woodSolid(1), { body: true }));
    return { boxes: B, H, top: 9.9, noNotch: true, shell: true, banners: [[7.2, 5.6, 8.4]] };
  } });
piece({ landmark: 'arch', id: 'arch-workshop', kind: 'workshop', fp: [4, 3], hp: 900, material: 'stone', heightM: 6, k: 104,
  note: 'an open-front workshop: a gabled back room, a tiled awning on timber posts over the street front, a potter\'s kiln and its brick chimney; ruined a roofless shell',
  model: (st) => {
    archMats();
    const B = [...rooms([[0.4, 7.6, 0.4, 3.6, 3.4]], st, PLASTER, { door: 2.4 }), ...gable(0.1, 7.9, 0.1, 3.9, 3.4, 1.1, 'x', { ped: false })];
    for (const x of [0.6, 3.9, 7.2]) B.push(box(x, x + 0.18, 5.3, 5.48, 0, 2.5, woodSolid(1), { body: true }));
    B.push(...roof(0.3, 7.7, 3.6, 5.7, (x, y) => 2.95 - (y - 3.6) * 0.24, (x, y) => [x, y - 3.6]).map((b) => ({ ...b, roof: true })));
    B.push(box(6.0, 7.0, 0.9, 1.9, 0, 5.4, (f, x, y, z) => (f === 'top' ? DOORDARK : mul(M.R.red[1 + ((Math.floor(z / 0.18) + Math.floor((x + y) / 0.4)) % 2)], ao(z))), { body: true }));
    B.push(...cells(0.6, 2.6, 3.8, 5.6, (x, y) => { const d = Math.hypot(x - 1.6, y - 4.7) / 0.9; return d < 1 ? { z0: 0, z1: 0.3 + 1.2 * Math.sqrt(1 - d * d), mat: ramp3(CLAY, 175, 6), body: true } : null; }, 1 / 16));
    B.push(box(3.0, 5.4, 4.2, 4.8, 0, 0.9, planks('x', 5), { body: true }));
    B.push(...holes(st, [['+y', 2.4, 4.8, 3.6, 0, 2.4]]));
    return { boxes: B, H: 3.4, top: 5.4, noNotch: true, shell: true };
  } });
piece({ landmark: 'arch', id: 'arch-barracks', kind: 'barracks', fp: [6, 4], hp: 2500, material: 'stone', heightM: 7, k: 105,
  note: 'a barracks: a long ashlar hall on a cyclopean socle, a tiled gable, a Doric portico along its front',
  model: (st) => {
    const B = [box(0.5, 11.5, 0.5, 5.8, 0, 1.0, M.cyc, { body: true }), box(0.6, 11.4, 0.6, 5.7, 1.0, 4.2, M.iso, { body: true }), ...gable(0.2, 11.8, 0.2, 6.1, 4.2, 1.7, 'x', { ped: false })];
    B.push(box(0.5, 11.5, 5.8, 7.7, 0, 0.3, (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : M.iso(f, x, y, z, u, r)), { body: true }));
    for (let i = 0; i < 7; i++) B.push(...cylinder(1.2 + i * 1.6, 7.1, 0.22, 0.3, 3.7, null, { paint: mul(TEX.lime[3], 0.97), top: () => TEX.lime[3] }).map((b) => ({ ...b, body: true })));
    B.push(box(0.6, 11.4, 6.7, 7.5, 3.7, 4.1, M.iso, { body: true }), ...roof(0.4, 11.6, 5.8, 7.7, (x, y) => 4.45 - (y - 5.8) * 0.18, (x, y) => [x, y - 5.8]).map((b) => ({ ...b, roof: true })));
    for (const a of [2.5, 5.4, 9.0]) B.push(opening('+y', a, a + 1.1, 5.7, 1.0, 3.1, leaves(st)));
    return { boxes: B, H: 4.2, top: 5.9, banners: [[1.0, 7.6, 4.4], [11.0, 7.6, 4.4]] };
  } });
piece({ landmark: 'arch', id: 'arch-stables', kind: 'stable', fp: [6, 3], hp: 1500, material: 'stone', heightM: 4.5, k: 106,
  note: 'stables: a stone back wall and end walls, timber stalls with mangers and hay under a tiled lean-to on posts',
  model: (st) => {
    archMats();
    const B = [box(0.3, 11.7, 0.3, 1.1, 0, 3.4, M.iso, { body: true }), box(0.3, 0.9, 1.1, 4.9, 0, 2.9, M.iso, { body: true }), box(11.1, 11.7, 1.1, 4.9, 0, 2.9, M.iso, { body: true })];
    for (let x = 2.9; x < 11; x += 2.2) B.push(box(x, x + 0.12, 1.1, 4.2, 0, 1.4, planks('y', 6), { body: true }));
    for (let x = 0.9; x < 11.1; x += 2.2) B.push(box(x + 0.2, x + 1.9, 1.1, 1.6, 0.6, 1.0, woodSolid(1), { body: true }), ...heap(x + 1.1, 2.4, 0.8, 0.6, 0.5, 177 + Math.round(x), ramp3(HAY, 178, 10)).map((b) => ({ ...b, keep: true })));
    for (let x = 0.6; x < 11.5; x += 2.2) B.push(box(x + 0.2, x + 0.38, 4.6, 4.78, 0, 2.6, woodSolid(1), { body: true }));
    B.push(...roof(0.1, 11.9, 0.1, 5.4, (x, y) => 3.6 - (y - 0.1) * 0.2, (x, y) => [x, y - 0.1]).map((b) => ({ ...b, roof: true })));
    B.push(...heap(10.4, 5.4, 0.9, 0.5, 0.9, 179, ramp3(HAY, 180, 10)).map((b) => ({ ...b, keep: true })));
    return { boxes: B, H: 3.4, top: 3.7, banners: [[0.6, 5.4, 2.9]] };
  } });
piece({ landmark: 'arch', id: 'arch-forge', kind: 'forge2', fp: [4, 3], hp: 1500, material: 'stone', heightM: 7, k: 107,
  note: 'a smithy: three ashlar walls open to the street, a tiled gable, a hearth under a big chimney, the anvil and the quench trough out front',
  model: (st) => {
    const live = whole(st), B = [box(0.4, 5.6, 0.4, 1.0, 0, 3.4, M.iso, { body: true }), box(0.4, 1.0, 1.0, 5.2, 0, 3.4, M.iso, { body: true }), box(5.0, 5.6, 1.0, 5.2, 0, 3.4, M.iso, { body: true }), box(1.0, 5.0, 1.0, 5.2, 0, 0.04, FLOOR, { keep: true })];
    B.push(...gable(0.1, 5.9, 0.1, 5.5, 3.4, 1.0, 'x', { ped: false }), box(1.4, 3.0, 1.1, 2.4, 0, 0.9, M.iso, { body: true }), box(1.6, 2.8, 1.3, 2.2, 0.9, 0.95, live ? M.ramped(M.R.coal, 181, 14) : solid(CHAR), { body: true }));
    B.push(box(1.6, 2.8, 1.0, 2.2, 3.4, 6.6, M.iso, { body: true }), box(1.5, 2.9, 0.9, 2.3, 6.6, 6.8, M.iso, { body: true }));
    const ir = (f, x, y, z) => M.R.iron[f === 'top' ? 3 : 1 + (M.nz(x, y, z, 182, 10) > 0.7 ? 1 : 0)];
    B.push(box(6.4, 7.2, 3.7, 4.2, 0, 0.6, M.cyc, { body: true }), box(6.2, 7.5, 3.75, 4.15, 0.6, 0.85, ir, { body: true }), box(6.2, 7.6, 1.2, 2.0, 0, 0.6, M.iso, { body: true }), box(6.35, 7.45, 1.35, 1.85, 0.5, 0.58, M.ramped(M.R.water, 183, 4), { keep: true }));
    return { boxes: B, H: 3.4, top: 6.8, banners: [[5.4, 5.3, 3.4]] };
  } });
piece({ landmark: 'arch', id: 'arch-cistern', kind: 'cistern', fp: [3, 3], hp: 1200, material: 'stone', heightM: 3, k: 108,
  note: 'a cistern house: a low ashlar vault under a flat flagged roof, a well-head with its windlass over the draw hole, steps down at the front',
  model: (st) => {
    const B = [box(0.4, 5.6, 0.4, 5.6, 0, 1.5, M.iso, { body: true }), ...cylinder(3, 3, 0.55, 1.5, 2.1, TEX.iso, { row0: 20 }).map((b) => ({ ...b, body: true }))];
    B.push(...cells(2.6, 3.4, 2.6, 3.4, (x, y) => (Math.hypot(x - 3, y - 3) < 0.36 ? { z0: 2.1, z1: 2.12, mat: solid(DOORDARK), body: true } : null), 1 / 16));
    if (st !== 'ruined') B.push(box(2.3, 2.42, 2.9, 3.1, 2.1, 3.0, woodSolid(1), { body: true }), box(3.58, 3.7, 2.9, 3.1, 2.1, 3.0, woodSolid(1), { body: true }), box(2.3, 3.7, 2.94, 3.06, 2.75, 2.87, woodSolid(0), { body: true }));
    B.push(opening('+y', 2.2, 3.8, 5.6, 0, 1.2), ...[0, 1, 2].map((i) => box(2.2, 3.8, 5.6 + i * 0.12, 5.72 + i * 0.12, 0, 0.36 - i * 0.12, M.iso, { body: true })));
    return { boxes: B, H: 1.5, top: 3.0, banners: [[5.2, 5.4, 1.5]] };
  } });
piece({ landmark: 'arch', id: 'arch-chapel', kind: 'chapel', fp: [3, 4], hp: 1000, material: 'stone', heightM: 6, k: 109,
  note: 'a chapel: a small distyle temple on a three-step podium, a painted frieze, a tiled gable, an altar before it',
  model: (st) => ({ boxes: [...templeBoxes(0.4, 0.3, 5.2, 6.4, { steps: 3, s: 0.3, nx: 2, ny: 2, R: 0.24, Hc: 3.4, E: 0.7, rise: 0.9 }), box(2.4, 3.6, 6.9, 7.7, 0, 0.9, M.iso, { body: true })], H: 5.0, top: 5.9, banners: [[0.9, 6.4, 4.3]] }) });
piece({ landmark: 'arch', id: 'arch-treasury', kind: 'treasury', fp: [3, 4], hp: 1500, material: 'stone', heightM: 7.5, k: 110,
  note: 'a treasury (as the Athenians\' at Delphi): a Doric temple-house in antis on a high ashlar podium, a painted frieze',
  model: (st) => ({ boxes: [box(0.3, 5.7, 0.3, 7.7, 0, 1.0, M.iso, { body: true }), ...shift(templeBoxes(0.5, 0.5, 5.0, 7.0, { steps: 2, s: 0.25, nx: 2, ny: 2, R: 0.26, Hc: 3.6, E: 1.0, rise: 1.0 }), 0, 0, 1.0)], H: 6.1, top: 7.1, banners: [[0.9, 7.3, 5.6], [5.1, 7.3, 5.6]] }) });
piece({ landmark: 'arch', id: 'arch-theatre', kind: 'theatre', fp: [14, 10], hp: 5000, material: 'stone', heightM: 6.5, k: 111,
  note: 'a Greek theatre: a semicircular cavea of stone seat rows rising to the back (-y), stairways, the round orchestra, a low skene with a columned proskenion along +y',
  model: (st) => {
    const cx = 14, cy = 14.2, Ri = 4.6, Ro = 13.6, R0 = Ri + 0.6, rows = (Ro - 0.5 - R0) / 0.8;
    const aisle = (f, x, y, z) => mul(TEX.lime[1 + (Math.floor(z / 0.21) % 2)], f === 'top' ? 0.95 : 0.8);
    const B = cells(0, 28, 0, 20, (x, y) => {
      const d = Math.hypot(x - cx, y - cy); if (d > Ro || y > cy + 1.2) return null;
      if (d <= Ri) return { z0: 0, z1: 0.06, mat: (f, xx, yy) => mul(EARTH_C, 1.3 + 0.2 * hash(Math.floor(xx * 4) & 255, Math.floor(yy * 4) & 255, 6)), keep: true };
      if (d <= R0) return { z0: 0, z1: 0.5, mat: M.iso, body: true };
      if (d > Ro - 0.5) return { z0: 0, z1: 0.45 + Math.ceil(rows) * 0.42 + 0.7, mat: M.iso, body: true };
      const th = Math.atan2(cy - y, x - cx), step = (d - R0) / 0.8;
      if ([1, 2, 3, 4, 5].some((j) => Math.abs(th - (j * Math.PI) / 6) * d < 0.5)) return { z0: 0, z1: 0.45 + Math.floor(step * 2) * 0.21, mat: aisle, body: true };
      return { z0: 0, z1: 0.45 + Math.floor(step) * 0.42, mat: M.tiers, body: true };
    }, 1 / 8);
    B.push(box(5.5, 22.5, 17.0, 19.6, 0, 3.3, M.iso, { body: true }), box(5.5, 22.5, 15.8, 17.0, 0, 2.4, (f, x, y, z, u, r) => (f === 'top' ? planks('x', 7)(f, x, y, z, u, r) : M.iso(f, x, y, z, u, r)), { body: true }));
    for (const a of [9.0, 13.4, 17.8]) B.push(opening('-y', a, a + 1.2, 17.0, 2.4, 3.2));
    for (let x = 6.2; x < 22.2; x += 1.6) B.push(...cylinder(x, 15.6, 0.16, 0, 2.4, null, { paint: mul(TEX.lime[3], 0.95) }).map((b) => ({ ...b, body: true })));
    return { boxes: B, H: 5.6, top: 5.9, banners: [[5.8, 19.4, 3.3], [22.2, 19.4, 3.3]] };
  } });
piece({ landmark: 'arch', id: 'arch-tomb-a', kind: 'tomb', fp: [2, 2], hp: 400, material: 'stone', heightM: 3, k: 112,
  note: 'a grave plot: a carved stele with a pediment behind a lidded sarcophagus on a plinth',
  model: (st) => {
    const lime = (f, x, y, z) => mul(TEX.lime[f === 'top' ? 3 : 2], f === 'top' ? 1 : ao(z) * 0.95);
    const B = [box(0.3, 3.7, 0.5, 3.5, 0, 0.45, M.iso, { body: true }), box(0.9, 3.1, 1.4, 2.8, 0.45, 1.3, lime, { body: true }), box(0.8, 3.2, 1.3, 2.9, 1.3, 1.45, lime, { body: true }), box(0.8, 3.2, 1.95, 2.25, 1.45, 1.6, lime, { body: true })];
    B.push(box(1.55, 2.45, 0.6, 0.85, 0.45, 2.6, lime, { body: true }), ...cells(1.5, 2.5, 0.58, 0.87, (x) => ({ z0: 2.6, z1: 2.6 + 0.35 * (1 - Math.abs(x - 2) / 0.5), mat: lime, body: true }), 1 / 16));
    return { boxes: B, H: 1.6, top: 2.95 };
  } });
piece({ landmark: 'arch', id: 'arch-tomb-b', kind: 'tomb', fp: [3, 3], hp: 800, material: 'stone', heightM: 6, k: 113,
  note: 'a mausoleum: a square ashlar chamber with a false door on a three-step base, a stepped pyramid roof',
  model: (st) => {
    const lime = (f, x, y, z) => mul(TEX.lime[f === 'top' ? 3 : 2], f === 'top' ? 1 : ao(z) * 0.92);
    const B = [];
    for (let i = 0; i < 3; i++) B.push(box(0.3 + i * 0.35, 5.7 - i * 0.35, 0.3 + i * 0.35, 5.7 - i * 0.35, i * 0.35, (i + 1) * 0.35, (f, x, y, z, u, r) => (f === 'top' ? flags(f, x, y) : M.iso(f, x, y, z, u, r)), { body: true }));
    B.push(box(1.4, 4.6, 1.4, 4.6, 1.05, 3.4, M.iso, { body: true }), opening('+y', 2.5, 3.5, 4.6, 1.05, 2.7));
    for (let i = 0; i < 6; i++) B.push(box(1.25 + i * 0.25, 4.75 - i * 0.25, 1.25 + i * 0.25, 4.75 - i * 0.25, 3.4 + i * 0.3, 3.7 + i * 0.3, lime, { body: true }));
    B.push(box(2.8, 3.2, 2.8, 3.2, 5.2, 5.6, lime, { body: true }));
    return { boxes: B, H: 3.4, top: 5.6 };
  } });

// Ammon: the mudbrick city (battered walls on limestone footings, flat roofs, palm beams)
both({ landmark: 'ammon', id: 'ammon-wall', kind: 'wall', fp: [4, 2], hp: 1500, hpNote: 'a tile', material: 'stone', heightM: 7, k: 121, segment: 8,
  note: '8 m of the city wall: battered mudbrick in three set-backs on a limestone footing, the walk at 5 m between merlons; segments join end to end',
  model: (st) => ({ boxes: [box(0, 8, 0, 4, 0, 1.2, M.iso, { body: true }), box(0, 8, 0.2, 3.8, 1.2, 2.6, M.mud, { body: true }), box(0, 8, 0.4, 3.6, 2.6, 4.0, M.mud, { body: true }), box(0, 8, 0.6, 3.4, 4.0, 5.0, M.mud, { body: true }), ...merlons(0, 8, 3.0, 3.4, 5.0, 0.9, M.mud), ...merlons(0, 8, 0.6, 1.0, 5.0, 0.9, M.mud)], H: 5, top: 5.9, seg: 8, banners: [[3.6, 3.2, 5.0]] }) });
piece({ landmark: 'ammon', id: 'ammon-tower', kind: 'tower', fp: [3, 3], hp: 3000, material: 'stone', heightM: 9, k: 122, platformM: 7.5,
  note: 'a wall tower: battered mudbrick in set-backs on a limestone footing, slit windows, a flat crenellated fighting top',
  model: (st) => {
    const B = [box(0, 6, 0, 6, 0, 1.2, M.iso, { body: true }), box(0.2, 5.8, 0.2, 5.8, 1.2, 3.5, M.mud, { body: true }), box(0.45, 5.55, 0.45, 5.55, 3.5, 6.0, M.mud, { body: true }), box(0.7, 5.3, 0.7, 5.3, 6.0, 7.5, M.mud, { body: true }), ...ring4(0.7, 5.3, 0.7, 5.3, 7.5, 0.9, M.mud)];
    for (const z of [4.4, 6.4]) for (const a of [2.0, 3.6]) B.push(opening('+y', a, a + 0.18, z < 6 ? 5.55 : 5.3, z, z + 0.8), opening('+x', a, a + 0.18, z < 6 ? 5.55 : 5.3, z, z + 0.8));
    return { boxes: B, H: 7.5, top: 8.4, banners: [[3, 5.1, 7.5]] };
  } });
both({ landmark: 'ammon', id: 'ammon-gate', kind: 'gate', fp: [6, 3], hp: 4000, material: 'stone', heightM: 10, k: 123,
  note: 'a pylon gate: two battered mudbrick towers on limestone footings, the passage between under a mudbrick lintel with a cavetto cornice, flag masts',
  model: (st) => {
    const B = [box(0, 4.1, 0.3, 5.7, 0, 1.0, M.iso, { body: true }), box(7.9, 12, 0.3, 5.7, 0, 1.0, M.iso, { body: true }), ...batter(0.1, 4.0, 0.4, 5.6, 8.0, M.mud), ...batter(8.0, 11.9, 0.4, 5.6, 8.0, M.mud)];
    B.push(...shift(gateBoxes('stone', 'x', gate(st), 6, gateOpt(st)), 4, 2.1), box(4, 8, 1.0, 5.0, 5.97, 7.0, M.mud, { body: true }), box(3.9, 8.1, 0.9, 5.1, 7.0, 7.4, (f, x, y, z) => mul(TEX.lime[z > 7.25 ? 3 : 2], f === 'top' ? 1 : 0.85), { body: true }));
    for (const x of [1.0, 11.0]) B.push(...cylinder(x, 5.75, 0.1, 0, 9.6, null, { paint: TEX.wood[1] }).map((b) => ({ ...b, body: true })));
    return { boxes: B, H: 8, top: 9.6, banners: [[1.1, 5.8, 7.6], [11.1, 5.8, 7.6]] };
  } });
piece({ landmark: 'ammon', id: 'ammon-tenement', kind: 'house', fp: [4, 3], hp: 1200, material: 'stone', heightM: 10, k: 124,
  note: 'a three-storey mudbrick tenement on a limestone footing: tiny windows, palm-beam ends, a roof terrace with a roof room; ruined a roofless shell',
  model: (st) => {
    const H = 7.6, B = rooms([[0.4, 4.0, 0.4, 5.4, H], [4.0, 7.6, 0.4, 5.4, H]], st, MUDH, { slab: MUDSLAB });
    if (whole(st)) {
      B.push(...lips(0.4, 7.6, 0.4, 5.4, H), box(0.8, 3.0, 0.8, 2.6, H, H + 2.0, M.mud, { body: true }), ...lips(0.8, 3.0, 0.8, 2.6, H + 2.0));
      for (let i = 0; i < 8; i++) for (const z of [2.6, 5.2]) B.push(box(0.6 + i * 0.9, 0.75 + i * 0.9, 5.4, 5.7, z, z + 0.15, woodSolid(1)));
    }
    const w = [];
    for (const z of [1.3, 3.8, 6.3]) { for (const a of [1.2, 2.8, 5.0, 6.4]) if (!(z < 2 && a > 1 && a < 3)) w.push(['+y', a, a + 0.4, 5.4, z, z + 0.55]); for (const a of [1.3, 3.7]) w.push(['+x', a, a + 0.4, 7.6, z, z + 0.55]); }
    B.push(...holes(st, [['+y', 1.7, 2.7, 5.4, 0, 2.0, leafMat('intact')], ...w]));
    return { boxes: B, H, top: 9.9, noNotch: true, shell: true, banners: [[7.2, 5.2, 7.9]] };
  } });
piece({ landmark: 'ammon', id: 'ammon-house-c', kind: 'house', fp: [4, 4], hp: 1100, material: 'stone', heightM: 7, k: 125,
  note: 'a mudbrick courtyard house: one- and two-storey wings round a court with a stair to the roofs, flat roofs behind lips; ruined a roofless shell',
  model: (st) => {
    const R = [[0.4, 7.6, 5.4, 7.6, 3.2], [0.4, 7.6, 0.4, 3.0, 5.4], [0.4, 2.8, 3.0, 5.4, 3.2], [5.2, 7.6, 3.0, 5.4, 3.2]];
    const B = rooms(R, st, MUDH, { slab: MUDSLAB });
    if (whole(st)) for (const r of R) B.push(...lips(r[0], r[1], r[2], r[3], r[4]));
    B.push(box(2.8, 5.2, 3.0, 5.4, 0, 0.05, (f, x, y) => mul(M.R.mud[3], 0.8 + 0.1 * hash(Math.floor(x * 4) & 255, Math.floor(y * 4) & 255, 7)), { keep: true }));
    for (let i = 0; i < 7; i++) B.push(box(4.4, 5.2, 3.0 + i * 0.3, 3.3 + i * 0.3, 0, 0.6 + i * 0.68, M.mud, { body: true })); // the stair up to the north wing's roof
    B.push(...holes(st, [['+y', 3.5, 4.5, 7.6, 0, 2.0, leafMat('intact')], ['+y', 1.4, 1.75, 7.6, 1.8, 2.3], ['+y', 6.2, 6.55, 7.6, 1.8, 2.3], ['+x', 1.2, 1.55, 7.6, 3.6, 4.1], ['+x', 4.0, 4.35, 7.6, 1.8, 2.3]]));
    return { boxes: B, H: 5.4, top: 5.8, noNotch: true, shell: true, banners: [[7.2, 2.6, 5.7]] };
  } });
piece({ landmark: 'ammon', id: 'ammon-workshop', kind: 'workshop', fp: [4, 3], hp: 900, material: 'stone', heightM: 5.5, k: 126,
  note: 'a mudbrick workshop: a flat-roofed back room, a reed awning on palm posts over the street, a domed kiln and its jars; ruined a roofless shell',
  model: (st) => {
    archMats();
    const B = rooms([[0.4, 7.6, 0.4, 3.6, 3.2]], st, MUDH, { door: 2.4, slab: MUDSLAB });
    if (whole(st)) B.push(...lips(0.4, 7.6, 0.4, 3.6, 3.2));
    for (const x of [0.6, 3.9, 7.2]) B.push(box(x, x + 0.2, 5.3, 5.5, 0, 2.5, woodSolid(1), { body: true }));
    B.push(box(0.3, 7.7, 3.6, 5.7, 2.5, 2.62, ramp3(STRAW, 185, 12), { roof: true }));
    B.push(...cells(5.4, 7.4, 3.8, 5.6, (x, y) => { const d = Math.hypot(x - 6.4, y - 4.7) / 0.95; return d < 1 ? { z0: 0, z1: 0.3 + 1.3 * Math.sqrt(1 - d * d), mat: ramp3(CLAY, 186, 6), body: true } : null; }, 1 / 16));
    for (const [x, y] of [[1.2, 4.6], [1.9, 5.1], [2.6, 4.5]]) B.push(...cylinder(x, y, 0.24, 0, 0.7, null, { paint: CLAY[1], top: () => DOORDARK }));
    B.push(...holes(st, [['+y', 2.4, 4.8, 3.6, 0, 2.3]]));
    return { boxes: B, H: 3.2, top: 3.6, noNotch: true, shell: true };
  } });
piece({ landmark: 'ammon', id: 'ammon-tomb', kind: 'tomb', fp: [3, 3], hp: 800, material: 'stone', heightM: 3.5, k: 127,
  note: 'a mastaba tomb of the necropolis: a battered limestone bench in three set-backs, a false door and an offering table on its front',
  model: (st) => {
    const lime = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.lime[2], 0.95) : M.iso(f, x, y, z, u, r));
    const B = [box(0.5, 5.5, 0.6, 5.4, 0, 1.0, lime, { body: true }), box(0.7, 5.3, 0.8, 5.2, 1.0, 2.0, lime, { body: true }), box(0.9, 5.1, 1.0, 5.0, 2.0, 2.8, lime, { body: true })];
    B.push(box(2.3, 3.7, 5.4, 5.55, 0, 2.2, (f, x, y, z) => mul(TEX.lime[3], 0.95), { body: true }), opening('+y', 2.7, 3.3, 5.55, 0.2, 1.9), box(2.6, 3.4, 5.6, 5.95, 0, 0.4, M.iso, { body: true }));
    return { boxes: B, H: 2.8, top: 2.8 };
  } });

// the larger landmarks' quarters
piece({ landmark: 'sunken', id: 'sunken-house', kind: 'house', fp: [3, 3], hp: 900, material: 'stone', heightM: 4, k: 131,
  note: 'a drowned house of the sunken quarter: fieldstone walls sunk 1.4 m in the mud, river-stained, a tiled gable; ruined a roofless shell',
  model: (st) => {
    const fs = masonry(TEX.cyclo, { mod: 160, row0: 30 }), wet = (f, x, y, z, u, r) => (f === 'top' ? rough(f, x, y) : mul(fs(f, x * 2, y * 2, z, u * 2, r * 2) ?? TEX.lime[1], z < 1.9 ? 0.62 : 0.92));
    const B = [...rooms([[0.5, 5.5, 0.5, 5.0, 3.8]], st, wet), ...gable(0.2, 5.8, 0.2, 5.3, 3.8, 1.2, 'x', { ped: false }), ...holes(st, [['+y', 2.4, 3.4, 5.0, 0, 3.4], ['+x', 2.4, 2.9, 5.5, 2.4, 3.0]])];
    return { boxes: sunk(B), H: 3.8 - SINK, top: 3.6, noNotch: true, shell: true };
  } });
both({ landmark: 'obsidian', id: 'obsidian-gate', kind: 'gate', fp: [6, 3], hp: 5000, material: 'rock', heightM: 10, k: 141,
  note: 'a rock-cut gate: the passage hewn between two basalt masses, a rock bridge over it with a ragged parapet, the leaves on the outer (+y) face; not burnable',
  model: (st) => {
    const mass = (x0, x1) => cells(x0, x1, 0, 6, (x, y) => ({ z0: 0, z1: 8.2 + 0.6 * vn(x, y, 142, 1.2), mat: M.rock, body: true }), 0.25);
    const B = [...mass(0, 4.4), ...mass(7.6, 12), box(4.4, 7.6, 0.6, 5.4, 4.6, 8.2, M.rock, { body: true })];
    for (const [y0, y1] of [[0.6, 1.2], [4.8, 5.4]]) B.push(...cells(4.4, 7.6, y0, y1, (x, y) => ({ z0: 8.2, z1: 8.9 + 0.4 * vn(x, y, 143, 1.5), mat: M.rock, body: true }), 0.25));
    if (whole(st)) B.push(box(4.45, 7.55, 5.0, 5.15, 0, 4.6, st === 'restored' ? ironBound : leafMat(st)));
    else if (st === 'damaged') B.push(box(4.5, 4.65, 3.2, 5.0, 0, 4.4, leafMat('intact')), box(7.35, 7.5, 3.2, 5.0, 0, 4.4, leafMat('intact')));
    return { boxes: B, H: 8.2, top: 9.3, banners: [[2.0, 5.6, 8.8], [10.0, 5.6, 8.8]] };
  } });
piece({ landmark: 'obsidian', id: 'obsidian-hall', kind: 'barracks', fp: [6, 4], hp: 3000, material: 'rock', heightM: 9, k: 143,
  note: 'a rock-cut hall: a basalt mass with a facade cut into it, four pilasters and an entablature round a dark doorway, a terrace of steps',
  model: (st) => {
    const B = [...cells(0, 12, 0, 6, (x, y) => ({ z0: 0, z1: 7.2 + 1.0 * vn(x, y, 144, 0.8), mat: M.rock, body: true }), 0.25)];
    for (const x of [2.2, 4.6, 6.6, 9.0]) B.push(box(x, x + 0.8, 6.0, 6.5, 0.5, 5.2, M.rock, { body: true }));
    B.push(box(1.6, 10.4, 6.0, 6.6, 5.2, 6.2, M.rock, { body: true }), opening('+y', 5.4, 6.6, 6.0, 0.5, 3.8), opening('+y', 3.2, 3.8, 6.0, 2.4, 3.6), opening('+y', 8.0, 8.6, 6.0, 2.4, 3.6));
    B.push(box(1.0, 11.0, 6.0, 7.8, 0, 0.25, M.rock, { body: true }), box(1.4, 10.6, 6.0, 7.2, 0.25, 0.5, M.rock, { body: true }));
    return { boxes: B, H: 7.2, top: 8.2, banners: [[1.8, 7.4, 6.2], [10.2, 7.4, 6.2]] };
  } });
piece({ landmark: 'forge', id: 'titan-furnace', kind: 'workshop', fp: [3, 3], hp: 1500, material: 'stone', heightM: 5, k: 151,
  note: 'a bloomery furnace: a stone shaft in three tiers, its mouth glowing, leather bellows at its side, slag at its foot',
  model: (st) => {
    const live = whole(st), B = [...cylinder(3, 3, 1.8, 0, 1.2, TEX.cyclo, { row0: 4 }), ...cylinder(3, 3, 1.5, 1.2, 3.0, TEX.iso, { row0: 9 }), ...cylinder(3, 3, 1.2, 3.0, 4.4, TEX.iso, { row0: 30 })].map((b) => ({ ...b, body: true }));
    B.push(...cells(2.3, 3.7, 2.3, 3.7, (x, y) => (Math.hypot(x - 3, y - 3) < 0.6 ? { z0: 4.4, z1: 4.42, mat: live ? M.ramped(M.R.coal, 152, 12) : solid(CHAR), body: true } : null), 1 / 16));
    B.push(box(2.6, 3.4, 4.75, 4.85, 0.3, 1.1, live ? M.ramped(M.R.coal, 153, 10) : solid(DOORDARK)), box(4.6, 5.8, 3.6, 4.6, 0, 0.7, M.ramped(M.R.hide, 154, 6), { body: true }));
    B.push(...heap(1.2, 4.9, 0.9, 0.7, 0.6, 155, (f, x, y, z) => M.R.slag[Math.floor(M.nz(x, y, z, 156, 8) * 4)]).map((b) => ({ ...b, keep: true })));
    return { boxes: B, H: 4.4, top: 4.45 };
  } });
piece({ landmark: 'forge', id: 'titan-hall', kind: 'barracks', fp: [6, 4], hp: 2500, material: 'stone', heightM: 7, k: 157,
  note: 'the forge-workers\' hall: rough cyclopean walls, a tiled gable, a smoke chimney',
  model: (st) => {
    const B = [box(0.5, 11.5, 0.5, 6.8, 0, 4.0, M.bigCyc, { body: true }), ...gable(0.2, 11.8, 0.2, 7.1, 4.0, 1.8, 'x', { ped: false }), box(9.0, 10.0, 1.5, 2.5, 4.0, 6.6, M.cyc, { body: true })];
    for (const a of [2.4, 7.6]) B.push(opening('+y', a, a + 1.2, 6.8, 0, 2.6, leaves(st)));
    return { boxes: B, H: 4.0, top: 6.6, banners: [[1.0, 7.4, 4.0], [11.0, 7.4, 4.0]] };
  } });

// ---- the labyrinth wall kit (Temple City): 16 frames by neighbour mask (+x 1, +y 2, -x 4, -y 8) x 4 states, one tile
// each, 3.4 m of ashlar (2 m period: runs join), a coping on top; the walled maze round the temple undercroft
const LAB = { H: 3.4, t: 0.9, w: 96, y0: 153, h: 153 + 56 };
function labBoxes(mask, st) {
  const c0 = 1 - LAB.t / 2, c1 = 1 + LAB.t / 2, R = [[c0, c1, c0, c1]];
  if (mask & 1) R.push([c1, 2, c0, c1]); if (mask & 4) R.push([0, c0, c0, c1]); if (mask & 2) R.push([c0, c1, c1, 2]); if (mask & 8) R.push([c0, c1, 0, c0]);
  const mat = (f, x, y, z, u, r) => (f === 'top' ? mul(TEX.lime[3], 0.95) : z > LAB.H - 0.22 ? mul(TEX.lime[3], 0.9) : M.ash(f, x, y, z, u, r));
  let B = R.map(([a, b, c, d]) => box(a, b, c, d, 0, LAB.H, mat, { body: true }));
  const k = 107; // tile-periodic damage: runs reuse one frame per mask
  const per = (x, y, kk) => vn(x, y, kk, 1, 2); // period 2 m = one tile
  if (st === 'damaged') B = cutTo(B, (x, y) => LAB.H * (0.45 + 0.35 * (0.5 * per(x, 0, k) + 0.5 * per(0, y, k + 1))));
  if (st === 'ruined') B = cutTo(B, (x, y) => 0.3 + 0.9 * (0.5 * per(x, 0, k + 2) + 0.5 * per(0, y, k + 3)));
  if (st === 'intact') B = cutTo(B, (x, y) => (0.5 * per(x, 0, k + 4) + 0.5 * per(0, y, k + 5) > 0.8 ? LAB.H - 0.45 : 1e9));
  return B;
}
function labFrames(st) {
  return [...Array(16)].map((_, m) => { let im = renderBoxes(labBoxes(m, st), LAB.w, LAB.h, LAB.w / 2, LAB.y0); if (st === 'intact') im = gradeIm(lichen(im, 107), { sat: 0.92, val: 0.94 }); if (st === 'damaged') im = soot(im, 107); if (st === 'ruined') im = gradeIm(soot(im, 108), { sat: 0.9, val: 0.9 }); if (st === 'restored') im = gradeIm(im, { sat: 1.04, val: 1.04 }); return im; });
}

// ---- layouts: where the pieces stand in each landmark (tile offsets from the landmark's NW corner), with the build-mode
// pieces it reuses (public/war/buildings ids). For region authors and the mock-ups; the region JSON places the real ones.
export const LANDMARKS = [
  { id: 'citadel', name: "Drakon's Citadel", region: 'krios', guardian: 'Drakon the White', rareGood: 'dragonbone', size: [22, 20],
    pieces: [['citadel-tower', 0, 0], ['citadel-curtain-x', 3, 0], ['citadel-curtain-x', 7, 0], ['citadel-tower', 11, 0], ['citadel-curtain-x', 14, 0], ['citadel-tower', 18, 0],
      ['citadel-curtain-y', 0, 3], ['citadel-curtain-y', 0, 7], ['citadel-curtain-y', 19, 3], ['citadel-curtain-y', 19, 7], ['citadel-tower', 0, 11], ['citadel-tower', 18, 11],
      ['citadel-curtain-x', 3, 12], ['citadel-gatehouse-x', 7, 11], ['citadel-curtain-x', 13, 12], ['citadel-curtain-x', 14, 12],
      ['citadel-keep', 8, 3], ['citadel-bone-pit', 3, 4], ['@barracks', 14, 3], ['@forge2', 15, 7], ['@well', 4, 9]] },
  { id: 'ammon', name: 'Dead City of Ammon', region: 'ammon', guardian: 'the Bandit King', rareGood: null, size: [24, 20],
    pieces: [['ammon-palace', 1, 1], ['ammon-temple', 9, 1], ['ammon-house-a', 15, 1], ['ammon-house-b', 19, 1], ['ammon-house-b', 15, 5], ['ammon-house-a', 19, 5],
      ['ammon-house-a', 1, 9], ['ammon-house-b', 5, 9], ['ammon-house-a', 9, 10], ['ammon-house-b', 13, 10], ['ammon-house-a', 17, 10], ['ammon-house-b', 1, 13], ['ammon-house-a', 5, 13],
      ['@stone-gate-x', 10, 17], ['@stone-tower-round', 7, 16], ['@stone-tower-round', 13, 16]] },
  { id: 'sunken', name: 'Sunken Temple of Achelous', region: 'delta', guardian: 'Achelous', rareGood: null, size: [16, 14], water: true,
    pieces: [['sunken-colonnade-x', 2, 1], ['sunken-colonnade-x', 4, 1], ['sunken-colonnade-x', 6, 1], ['sunken-colonnade-x', 8, 1], ['sunken-colonnade-y', 1, 2], ['sunken-colonnade-y', 1, 4], ['sunken-colonnade-y', 1, 6], ['sunken-colonnade-y', 10, 2], ['sunken-colonnade-y', 10, 4], ['sunken-colonnade-y', 10, 6],
      ['sunken-temple', 4, 3], ['sunken-shrine', 2, 9], ['sunken-shrine', 8, 9], ['achelous-spring', 5, 9], ['sunken-jetty', 12, 6], ['sunken-causeway', 12, 1], ['sunken-causeway', 13, 2], ['sunken-causeway', 14, 3]] },
  { id: 'navel', name: 'Temple City of the Navel', region: 'omphalos', guardian: 'the Titan and the Minotaur', rareGood: null, size: [30, 22], kit: 'navel-labyrinth',
    pieces: [['navel-arena', 0, 0], ['navel-temple', 13, 0], ['navel-omphalos', 16, 9], ['navel-ramp-gate-x', 13, 15], ['navel-ramp-gate-y', 24, 2], ['@stoa', 11, 11]], labyrinth: [[22, 10], [23, 10], [24, 10], [25, 10], [26, 10], [22, 11], [22, 12], [22, 13], [24, 12], [25, 12], [26, 12], [26, 13], [26, 14], [22, 14], [23, 14], [24, 14]] },
  { id: 'cyclops', name: 'Cyclopean Gatehouse', region: 'saddle', guardian: 'Brontes', rareGood: 'star iron', size: [26, 8],
    pieces: [['cyclops-tower', 0, 1], ['cyclops-wall-x', 3, 2], ['cyclops-wall-x', 7, 2], ['cyclops-gatehouse-x', 11, 1], ['cyclops-wall-x', 17, 2], ['cyclops-tower', 21, 1]] },
  { id: 'oracle', name: 'Oracle Grove', region: 'erymanthos', guardian: 'the Maenads and their Queen', rareGood: 'asphodel', size: [14, 10],
    pieces: [['oracle-shrine', 5, 2], ['oracle-house', 9, 1], ['spring-memory', 1, 5], ['spring-lethe', 10, 6], ['@oak', 0, 0], ['@oak', 12, 1]] },
  { id: 'forge', name: "Titan's Forge", region: 'gorge', guardian: 'Gyges the Hundred-Handed', rareGood: 'titan bronze', size: [14, 8],
    pieces: [['titan-tower', 0, 0], ['titan-anvil', 4, 2], ['titan-bellows', 2, 4], ['titan-slag', 8, 4], ['titan-tower', 11, 0]] },
  { id: 'obsidian', name: 'Obsidian Hold', region: 'canyons', guardian: 'the Chimera', rareGood: 'obsidian', size: [20, 12],
    pieces: [['obsidian-tower', 0, 0], ['obsidian-wall-x', 3, 0], ['obsidian-wall-x', 7, 0], ['obsidian-tower', 11, 0], ['obsidian-wall-y', 0, 3], ['obsidian-kiln', 4, 4], ['obsidian-field', 9, 5], ['obsidian-field', 12, 6]] },
  { id: 'rim', name: 'Rim Watchtower', region: 'siren', guardian: 'Scylla', rareGood: 'nereid pearl', size: [12, 10],
    pieces: [['rim-beacon', 6, 0], ['rim-keeper-house', 1, 1], ['rim-stair-y-', 7, 4], ['@stoa', 1, 5], ['@jetty', 10, 5]] },
];

// ======== main
function main() {
  loadTextures(); M = materials(); mkdirSync(OUT, { recursive: true });
  const sprites = [], pieces = [], t0 = Date.now();
  for (const P of PIECES) {
    const states = {};
    for (const st of STATES) {
      const r = renderPiece(P, st), sid = `${P.id}-${st}`, a = footOf(r.im), base = Math.min((P.fp[0] + P.fp[1]) * 16, r.im.h - 4);
      sprites.push({ file: `${sid}.png`, im: r.im, meta: { id: sid, kind: P.kind, file: `${sid}.png`, w: r.im.w, h: r.im.h, metres: Math.max(0.05, +((r.im.h - base) / PPM).toFixed(2)), basePx: base, anchor: a, tileOrigin: r.tileOrigin, footprint: P.fp, blocksMovement: st !== 'ruined', building: P.id, state: st, material: P.material, burnable: !!P.burnable, source: 'renderer (ART-L): box model + cyclopean / isodomic / ashlar / Lion Gate elevations, drawn roof tiles' } });
      states[st] = sid;
    }
    pieces.push({ id: P.id, landmark: P.landmark, kind: P.kind, footprint: P.fp, material: P.material, burnable: !!P.burnable, hp: P.hp, ...(P.hpNote && { hpNote: P.hpNote }), ...(P.axis && { axis: P.axis }), ...(P.segment && { segmentM: P.segment }), ...(P.platformM && { platformM: P.platformM, platformPx: Math.round(P.platformM * PPM) }), ...(P.platformCap && { platformCap: P.platformCap }), ...(P.riseM && { riseM: P.riseM }), ...(P.node && { node: P.node }), heightM: P.heightM, note: P.note, states });
  }
  // the labyrinth kit
  const kits = [], labStates = {};
  for (const st of STATES) { const fr = labFrames(st), sheet = blank(LAB.w * 16, LAB.h); fr.forEach((im, i) => paste(sheet, im, i * LAB.w, 0)); const file = `navel-labyrinth-${st}.png`; sprites.push({ file, im: sheet, sheet: true }); labStates[st] = file; }
  kits.push({ id: 'navel-labyrinth', landmark: 'navel', kind: 'wall', material: 'stone', burnable: false, hp: 1500, hpNote: 'a tile', heightM: LAB.H, frames: 16, columns: 16, frame: { w: LAB.w, h: LAB.h }, tileOrigin: { x: LAB.w / 2, y: LAB.y0 }, note: 'the labyrinth: a 0.9 m thick, 3.4 m ashlar wall, frame = neighbour mask (+x 1, +y 2, -x 4, -y 8)', states: labStates });
  const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
  const pal = extendPalette([...G.palette, ...GO.palette], sprites.filter((s) => s.meta).map((s) => s.im), 64);
  for (const s of sprites) { if (!(s.im.w > 0 && s.im.h > 0) || s.im.data.length !== s.im.w * s.im.h * 4) { console.error('bad sprite', s.file, s.im.w, s.im.h, s.im.data.length); continue; } writeImage(join(OUT, s.file), snapToPalette(s.im, pal)); }
  const json = {
    pxPerMetre: PPM, tileMetres: 2, borderMax: 0.75, states: STATES,
    note: 'Landmark structures (ART-L, WAR.md "Living regions"). pieces[]: one pre-built structure each (footprint in tiles, front = +y), states intact (as the season finds it: 60% hp, gates shut, weathered), damaged, ruined (a rubble footprint: slow x2, cover, no function) and restored (the restore rule done: fresh, gates iron-bound, banners); hp = WAR.md where it names one, else the nearest town piece (the sim owns hp). objects[]: one sprite per piece state, fields as public/war/buildings (anchor = foot, tileOrigin = px of the top vertex of the footprint\'s north tile, basePx = (fw + fh) x 16). <id>-x / <id>-y: the piece along that axis; segments (segmentM) join end to end in every state. kits[]: the labyrinth wall, 16 frames by neighbour mask (+x 1, +y 2, -x 4, -y 8) per state, tileOrigin = the tile top vertex in each frame. landmarks[]: the layout of each landmark in tiles from its NW corner ([piece, x, y]; @id = a build-mode piece from public/war/buildings or a town piece), for region authors and the mock-ups. Colours = tiles.json palette + objects.json palette + palette.',
    palette: pal.slice(G.palette.length), pieces, kits, landmarks: LANDMARKS, objects: sprites.filter((s) => s.meta).map((s) => s.meta),
  };
  writeFileSync(join(OUT, 'landmarks.json'), JSON.stringify(json, null, 1) + '\n');
  console.log(`landmarks: ${pieces.length} pieces x ${STATES.length} states, ${kits.length} kit, ${json.objects.length} sprites, palette +${pal.length - G.palette.length - GO.palette.length}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(runLandmarksQa().length ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
