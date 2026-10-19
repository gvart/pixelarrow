// Fire FX v2 (PROMPTS_ART.md "Siege", fire redo): drawn procedurally, pixel by pixel, in the fire ramp (no PixelLab).
// Many small flame tongues that cling to the wood (3 sizes x 3 shapes, 12-frame loops), rising embers, a ground heat
// glow, drifting smoke wisps, a smouldering loop, legacy flame clusters (flame-s/m/l) and charring overlays for the
// wooden kits (light scorch -> charred -> smouldering), frame-matched to the kit sheets. Called by siege.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImage } from '../../art/lib/png.mjs';
import { blank, hexToRgb } from '../../art/lib/ops.mjs';

const C = (h) => [...hexToRgb(h), 255];
const DEEP = C('#370a09'), DR = C('#7a1410'), RED = C('#7a2a14'), OR1 = C('#b0461c'), OR2 = C('#d8762c'), AMB = C('#e5923d'), YEL = C('#eeae52'), CORE = C('#f6d48a');
const SMOKE = ['#2a292e', '#423f43', '#5c5c5f', '#837f7c'].map(C), CHAR = [C('#0a0908'), C('#141318'), C('#211e27'), C('#2b2026')];
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 10007) / 10007;
const TAU = Math.PI * 2, frac = (v) => v - Math.floor(v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, v) => v > BAYER[(y & 3) * 4 + (x & 3)];
const set = (im, x, y, c) => { if (x >= 0 && y >= 0 && x < im.w && y < im.h) im.data.set(c, (y * im.w + x) * 4); };
const strip = (ims) => { const w = ims[0].w, h = ims[0].h, out = blank(w * ims.length, h); ims.forEach((im, n) => { for (let y = 0; y < h; y++) out.data.set(im.data.subarray(y * w * 4, (y + 1) * w * 4), (y * out.w + n * w) * 4); }); return out; };

// ---- one flame tongue: a tapering, swaying column; heat from its axis and its base sets the colour; the core is a
// checker of the hottest colour and holes (the wood shows through: translucent with binary alpha)
const SIZES = { s: { H: 11, W: 2.2, A: 1.2 }, m: { H: 20, W: 3.4, A: 2.0 }, l: { H: 33, W: 5.2, A: 3.0 } };
const SHAPES = { a: { fork: 0, lean: 0, lick: 0.0, sway: 1 }, b: { fork: 1, lean: 0.1, lick: 0.5, sway: 0.8 }, c: { fork: 0, lean: -0.18, lick: 1, sway: 1.35 } };
const FR = 12;
function tongue(size, shape, n, seed) {
  const { H, W, A } = SIZES[size], S = SHAPES[shape], ph = n / FR;
  const fw = Math.ceil(2 * (W + A * S.sway + Math.abs(S.lean) * H * 0.3) + 4), fh = Math.ceil(H * 1.5), im = blank(fw, fh), cx0 = fw / 2, by = fh - 1;
  const h = H * (0.8 + 0.12 * Math.sin(TAU * (ph + seed)) + 0.08 * Math.sin(TAU * (2 * ph + seed * 3)));
  const axis = (t) => cx0 + S.lean * t * H * 0.3 + S.sway * (A * t ** 1.4 * Math.sin(TAU * (ph - t * 1.1 + seed)) + 0.45 * A * t * t * Math.sin(TAU * (2 * ph - 2.2 * t + seed * 2)));
  const half = (t) => W * (t < 0.18 ? 0.75 + 1.4 * t : (1 - (t - 0.18) / 0.82) ** 0.85);
  const heat = (e, t, x, y) => e * 0.7 + (1 - t) * 0.5 - 0.12 + (hash(x, y, n + seed * 97) - 0.5) * 0.18;
  const paint = (x, y, v, t, big) => {
    const c = v < 0.3 ? (t > 0.72 ? DEEP : DR) : v < 0.45 ? (t > 0.8 ? DR : RED) : v < 0.6 ? OR1 : v < 0.74 ? OR2 : v < 0.86 ? YEL : CORE;
    if (c === CORE && big && (x + y + n) % 2) return; // the translucent core
    set(im, x, y, c);
  };
  const big = size !== 's';
  for (let r = 0; r <= h; r++) {
    const t = r / h, c = axis(t), hw = half(t), y = by - r;
    for (let x = Math.floor(c - hw - 1); x <= Math.ceil(c + hw + 1); x++) {
      const d = Math.abs(x + 0.5 - c); if (d > hw) continue;
      if (S.fork && t > 0.55 && d < (t - 0.55) * W * 1.6) continue; // a forked tip
      paint(x, y, heat(1 - d / Math.max(hw, 0.6), t, x, y), t, big);
    }
  }
  if (S.lick) { // a lick tearing off the tip and rising away
    const u = frac(ph * 2 + seed); if (u < 0.55) {
      const ly = by - h * (0.88 + 0.55 * u), lx = axis(1) + S.lean * 2 * u, R = W * 0.55 * (1 - u * 1.4) * S.lick + 0.4;
      for (let y = Math.floor(ly - R * 1.6); y <= ly + R * 1.6; y++) for (let x = Math.floor(lx - R); x <= lx + R; x++) {
        const q = ((x + 0.5 - lx) / R) ** 2 + ((y + 0.5 - ly) / (R * 1.6)) ** 2; if (q <= 1) paint(x, y, (1 - q) * 0.55 + 0.05, 0.8, false);
      }
    }
  }
  return { im, anchor: { x: Math.round(cx0), y: by } };
}

// ---- embers: sparks rising with a drift, cooling yellow -> orange -> red, each on its own phase (seamless loop)
function embers(n, F, w, h, count, seed) {
  const im = blank(w, h);
  for (let i = 0; i < count; i++) {
    const u = frac(n / F + i / count + hash(i, 3, seed) * 0.3), x0 = w * (0.3 + 0.4 * hash(i, 1, seed)), life = 0.6 + 0.4 * hash(i, 2, seed);
    if (u > life) continue;
    const t = u / life, y = h - 1 - t * (h - 2) * (0.7 + 0.3 * hash(i, 4, seed)), x = x0 + t * t * w * 0.28 + Math.sin(TAU * (t * 1.5 + hash(i, 5, seed))) * 2.2;
    const c = t < 0.25 ? CORE : t < 0.5 ? YEL : t < 0.75 ? OR2 : OR1;
    set(im, Math.round(x), Math.round(y), c);
    if (t < 0.35 && hash(i, 6, seed) < 0.4) set(im, Math.round(x), Math.round(y) + 1, OR1); // a short streak on the hottest
  }
  return im;
}

// ---- smoke: puffs rising and widening, drifting downwind (+x), thinning as they go; ordered dither = translucency
function smoke(n, F, w, h, seed, ax, dark) {
  const im = blank(w, h), P = 20, puffs = [];
  for (let i = 0; i < P; i++) {
    const u = frac(n / F + i / P);
    puffs.push({ x: ax + u ** 1.5 * w * 0.45 + Math.sin(TAU * (u * 1.3 + hash(i, 1, seed))) * (2 + 4 * u), y: h - 2 - u * (h - 14), r: 4 + 24 * u, d: (u < 0.08 ? u / 0.08 : 1) * (1 - u) ** 0.9 * 1.5 });
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (const p of puffs) { const q = ((x - p.x) ** 2 + ((y - p.y) * 1.25) ** 2) / (p.r * p.r); if (q < 1) v += p.d * (1 - q) ** 1.5; }
    v = Math.min(1, v) * (0.85 + 0.3 * hash(x >> 1, y >> 1, seed + n));
    if (v > 0.06 && dither(x, y, v)) set(im, x, y, SMOKE[Math.max(0, Math.min(3, Math.floor((dark ? 0.2 : 0.9) + (1 - v) * 1.2 + (1 - y / h) * 1.6)))]);
  }
  return im;
}

// ---- flame sheet: the burning foot of one tile of wall, its base on the iso run line (x run: down-right 1:2, y run:
// down-left), a row of joined tongues whose peaks wander and flicker; the hot foot is a checker (translucent)
function flameSheet(axis, Hs, n, seed) {
  const cw = 34, fh = Hs + 20 + 2, im = blank(cw, fh), ph = n / FR, P = 5;
  const base = (c) => fh - 1 - (axis === 'x' ? cw - 1 - c : c) * 0.5;
  for (let c = 0; c < cw; c++) {
    let e = 0; for (let j = 0; j < P; j++) { const p = (cw * (j + 0.5)) / P + 2.5 * Math.sin(TAU * (ph + hash(j, 1, seed))), a = 0.7 + 0.3 * Math.sin(TAU * ((1 + (j % 2)) * ph + hash(j, 2, seed))); e = Math.max(e, a * Math.max(0, 1 - Math.abs(c + 0.5 - p) / 5) ** 0.9); }
    const h = Hs * (0.4 + 0.6 * e) * (0.85 + 0.3 * hash(c, n, seed)), by = base(c);
    for (let r = 0; r <= h; r++) {
      const t = r / h, x = c, y = Math.round(by - r), v = (1 - t) * 0.75 + e * 0.3 - 0.05 + (hash(x, y, n + seed * 31) - 0.5) * 0.2;
      const col = t > 0.9 || v < 0.25 ? (t > 0.95 ? DEEP : DR) : v < 0.45 ? RED : v < 0.6 ? OR1 : v < 0.75 ? OR2 : v < 0.88 ? YEL : CORE;
      if (col === CORE && (x + y + n) % 2) continue;
      set(im, x, y, col);
    }
  }
  return im;
}

// ---- heat glow on the ground: a dithered iso ellipse under the fire, flickering
function glow(n, F, w, h, seed) {
  const im = blank(w, h), k = 0.85 + 0.1 * Math.sin(TAU * (n / F + seed)) + 0.05 * Math.sin(TAU * (3 * n / F));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2, v = (1 - q / k) * 0.7;
    if (v > 0 && dither(x, y, v)) set(im, x, y, v > 0.55 ? RED : DR);
  }
  return im;
}

// ---- smouldering: a low bed of embers pulsing, sputtering stubs of flame (smoke: smoke-wisp at low alpha)
function smoulder(n, F, w, h, seed) {
  const im = blank(w, h), by = h - 1;
  for (let i = 0; i < 18; i++) { // ember bed along the base
    const x = Math.round(2 + hash(i, 1, seed) * (w - 4)), y = by - Math.round(hash(i, 2, seed) * 3), p = 0.5 + 0.5 * Math.sin(TAU * (n / F + hash(i, 3, seed)));
    set(im, x, y, p > 0.75 ? OR2 : p > 0.4 ? OR1 : RED);
  }
  for (let j = 0; j < 3; j++) { // sputtering stubs: alive a third of the loop each
    const u = frac(n / F + j / 3 + hash(j, 4, seed) * 0.2); if (u > 0.45) continue;
    const t = tongue('s', j === 1 ? 'b' : 'a', n, hash(j, 5, seed)), sx = Math.round(4 + hash(j, 6, seed) * (w - 8)) - t.anchor.x, k = Math.sin(Math.PI * u / 0.45), cut = Math.round(t.im.h * (1 - 0.55 * k));
    for (let y = 0; y < t.im.h; y++) for (let x = 0; x < t.im.w; x++) { const i = (y * t.im.w + x) * 4, yy = by - (t.im.h - 1 - y) + cut; if (t.im.data[i + 3] && yy <= by) set(im, sx + x, yy, t.im.data.subarray(i, i + 4)); } // sunk into the bed: only its tip shows
  }
  return im;
}

// ---- legacy clusters (flame-s/m/l: what the old one-sprite-per-tile placement draws): several tongues at varied
// heights over a short span, so even that placement reads as wood burning
function cluster(parts, w, h, n) {
  const im = blank(w, h);
  for (const [size, shape, dx, up, seed] of parts) {
    const t = tongue(size, shape, (n + Math.round(seed * 12)) % FR, seed), ox = Math.round(w / 2 + dx - t.anchor.x), oy = h - 1 - up - t.anchor.y;
    for (let y = 0; y < t.im.h; y++) for (let x = 0; x < t.im.w; x++) { const i = (y * t.im.w + x) * 4; if (t.im.data[i + 3]) set(im, ox + x, oy + y, t.im.data.subarray(i, i + 4)); }
  }
  return im;
}

// ---- charring overlays for a kit sheet: only the changed px; fire climbs from each column's foot, in vertical grain
const LEVELS = { scorch: 0.35, charred: 0.65, smoulder: 0.75 };
function charOverlay(sheet, fw, level, k) {
  const out = blank(sheet.w, sheet.h), d = sheet.data, reach = LEVELS[level];
  for (let x = 0; x < sheet.w; x++) {
    let foot = -1, top = -1; for (let y = 0; y < sheet.h; y++) if (d[(y * sheet.w + x) * 4 + 3]) { if (top < 0) top = y; foot = y; }
    if (foot < 0) continue;
    const span = Math.max(1, foot - top), edge = reach + (hash(x >> 2, 1, k) - 0.5) * 0.3 + (hash(x, 2, k) - 0.5) * 0.08; // a ragged burn line
    for (let y = top; y <= foot; y++) {
      const i = (y * sheet.w + x) * 4; if (!d[i + 3]) continue;
      const t = (foot - y) / span, v = (edge - t) / 0.25; // > 0 under the burn line, 1 well under it
      if (v <= 0 || (v < 1 && !dither(x, y, v))) continue;
      const deep = level === 'scorch' ? 0.62 : v > 1.6 ? 0.22 : 0.36, g = 0.85 + 0.3 * hash(x, Math.floor(y / 5), k + 1);
      out.data.set([Math.round(d[i] * deep * g), Math.round(d[i + 1] * deep * g * 0.82), Math.round(d[i + 2] * deep * g * 0.78), 255], i); // the wood darkened, its grain kept
      if (level === 'smoulder' && v > 0.8) { const c = hash(x, Math.floor((y + (x * 7) % 5) / 4), k + 3); if (c < 0.035) out.data.set(c < 0.012 ? OR2 : c < 0.024 ? OR1 : RED, i); } // short glowing cracks along the grain
    }
  }
  return out;
}

export function fireArt(ROOT) {
  const fx = [], sheets = [], add = (id, ims, anchor, meta) => { const file = `fx-${id}.png`; sheets.push({ file, im: strip(ims) }); fx.push({ id, file, frames: ims.length, fps: meta.fps ?? 12, loop: true, frame: { w: ims[0].w, h: ims[0].h }, anchor, ...meta, source: 'procedural (fire.mjs)' }); };
  const PER = { s: { tile: { low: 4, medium: 6, high: 6 }, m: 0.33 }, m: { tile: { low: 1, medium: 4, high: 5 }, m: 0.6 }, l: { tile: { low: 0, medium: 1, high: 4 }, m: 1.0 } };
  for (const size of ['s', 'm', 'l']) for (const shape of ['a', 'b', 'c']) {
    const seed = hash(size.charCodeAt(0), shape.charCodeAt(0), 1), fr = [...Array(FR)].map((_, n) => tongue(size, shape, n, seed));
    add(`tongue-${size}-${shape}`, fr.map((f) => f.im), fr[0].anchor, { blend: 'normal', sizeClass: size, heightM: PER[size].m, density: { perTile: PER[size].tile, note: 'per burning wall tile, split over the 3 shapes' }, use: `one flame tongue licking up the wood, ~${PER[size].m} m; anchor = its root on the wood face` });
  }
  add('embers', [...Array(FR)].map((_, n) => embers(n, FR, 28, 72, 9, 5)), { x: 10, y: 71 }, { blend: 'add', fps: 10, density: { perTile: { low: 0, medium: 0.5, high: 1 } }, use: 'sparks rising off a fire, ~2.2 m; anchor at the flames\' top' });
  for (const axis of ['x', 'y']) for (const [sz, Hs, m] of [['m', 10, 0.35], ['l', 20, 0.65]]) add(`fire-sheet-${axis}-${sz}`, [...Array(FR)].map((_, n) => flameSheet(axis, Hs, n, axis === 'x' ? 0.21 : 0.63)), { x: axis === 'x' ? 0 : 33, y: Hs + 4 }, { blend: 'normal', sizeClass: sz, heightM: m, density: { perTile: sz === 'm' ? { medium: 1 } : { high: 1 } }, use: `the burning foot of one wall tile running along ${axis} (its base on the run line), ~${m} m; anchor = the face's start (lower ${axis}) at the foot (z 0)` });
  add('heat-glow', [...Array(FR)].map((_, n) => glow(n, FR, 64, 26, 0.3)), { x: 32, y: 13 }, { blend: 'add', alpha: { low: 0.25, medium: 0.4, high: 0.55 }, decal: true, density: { perTile: { low: 1, medium: 1, high: 1 } }, use: 'ground heat glow under a burning tile (a tile-sized iso ellipse); anchor = tile centre' });
  for (const [v, seed, dark] of [['a', 11, false], ['b', 23, true]]) add(`smoke-wisp-${v}`, [...Array(20)].map((_, n) => smoke(n, 20, 100, 150, seed, 22, dark)), { x: 22, y: 148 }, { blend: 'normal', fps: 8, alpha: { low: 0.45, medium: 0.6, high: 0.75 }, sizeClass: 'l', heightM: 4.5, density: { perTile: { low: 0.34, medium: 0.5, high: 0.5 } }, use: 'translucent smoke drifting +x (downwind; flipX for -x wind) and widening, ~4.5 m; anchor at the flames\' top' });
  fx.push({ ...fx.find((f) => f.id === 'smoke-wisp-a'), id: 'smoke', legacy: true, use: 'legacy alias of smoke-wisp-a (the old renderer\'s plume id)' });
  add('smoulder', [...Array(FR)].map((_, n) => smoulder(n, FR, 40, 34, 0.4)), { x: 20, y: 33 }, { blend: 'normal', fps: 8, density: { perTile: { dying: 2 } }, use: 'dying fire: an ember bed and sputtering stubs on the wood\'s foot after the fire ends (with smoke-wisp-b at alpha 0.3 per 2 tiles)' });
  const CL = {
    s: [['s', 'a', -6, 0, 0.1], ['s', 'b', 1, 3, 0.5], ['s', 'c', 6, 1, 0.8]],
    m: [['s', 'a', -12, 0, 0.2], ['m', 'a', -5, 2, 0.6], ['s', 'c', 2, 9, 0.35], ['m', 'b', 7, 0, 0.9], ['s', 'b', 13, 4, 0.05]],
    l: [['m', 'c', -16, 0, 0.3], ['l', 'a', -7, 4, 0.7], ['s', 'b', -1, 18, 0.15], ['l', 'b', 6, 0, 0.45], ['m', 'a', 14, 7, 0.85], ['s', 'a', 18, 1, 0.55], ['s', 'c', -12, 14, 0.95]],
  };
  for (const [size, parts] of Object.entries(CL)) { const w = size === 's' ? 26 : size === 'm' ? 44 : 60, h = size === 's' ? 22 : size === 'm' ? 42 : 66; add(`flame-${size}`, [...Array(FR)].map((_, n) => cluster(parts, w, h, n)), { x: w / 2, y: h - 1 }, { blend: 'normal', sizeClass: size, legacy: true, use: 'legacy: a cluster of tongues for one-sprite-per-tile placement; prefer tongue-* emitters (fireNote)' }); }
  // charring overlays: the wooden kits whose sheets are single strips (palisade, wooden tower back + front)
  const BD = join(ROOT, 'public/war/buildings'), B = JSON.parse(readFileSync(join(BD, 'objects.json'))), char = [];
  for (const kid of ['palisade', 'tower-wood']) {
    const K = B.kits.find((k) => k.id === kid);
    for (const [layer, file] of [['back', K.states.done], ...(K.front?.done ? [['front', K.front.done]] : [])]) for (const level of Object.keys(LEVELS)) {
      const im = charOverlay(readImage(join(BD, file)), K.frame.w, level, kid.length * 7 + (layer === 'front' ? 3 : 0)), out = `char-${kid}-${level}${layer === 'front' ? '-front' : ''}.png`;
      sheets.push({ file: out, im }); char.push({ kit: kid, layer, level, file: out, frames: K.frames, frame: K.frame, tileOrigin: K.tileOrigin });
    }
  }
  return { fx, char, sheets };
}

export const FIRE_NOTE = 'Fire v2 (procedural, fire.mjs). Emitters, not stickers: a burning wall tile gets many tongue-<s|m|l>-<a|b|c> at their density.perTile[intensity] (low k < 0.34, medium < 0.67, high), each with a seed fixed per (piece, tile, i): shape = seed % 3, a spot u = rand along the tile\'s visible face (on the face plane, not the tile centre), height z = zMax * rand^2 (most at the foot, a few high: zMax = 0.25 / 0.6 / 0.95 of the wood\'s height at low / medium / high; at high 1-2 l tongues at the top edge), frame = (floor(now * fps / 1000) + seed * 5) % frames (phase offsets: never in step). Draw at scale 1 (intensity changes count and size, never scale), the anchor on the wood, depth just in front of the face. Per tile also: a fire-sheet-<run axis>-<m at medium | l at high> at the foot (anchor = the face start, z 0; drawn before the tongues), 1 heat-glow (ground, add), embers per density (add, at the flames\' top), smoke-wisp-a|b per density (alpha per intensity, flipX for wind -x). Building footprint: treat each visible face as a wall run of its tiles (heightM of the piece), plus 2-3 tongues on the roof/platform edge at high. Charring: char[] overlays drawn over the kit frame (same frame, tileOrigin): scorch at low, charred at medium, smoulder at high and while dying; after the fire: smoulder fx 2 per tile (+ smoke-wisp-b at alpha 0.3 per 2 tiles) for ~20 s with the smoulder overlay, then charred. Mock-up: fire-preview.mjs places exactly this. flame-s/m/l: legacy clusters for the old one-per-tile placement.';
