// Landmark FX (ART-L, PROMPTS_ART.md "Landmarks"): drawn procedurally pixel by pixel like fire v2 (fire.mjs), no
// PixelLab. True scale (33 px/m on the ground's iso axes: 1 m along a tile axis = 16 px across + 8 px down).
//   breath-<se|ne>-ignite / -loop: Drakon's fire breath, a cone of flame 12 m long and ~6 m wide at its end, lying on the
//     ground plane towards the screen's lower right (se) or upper right (ne) iso axis; flipX for sw / nw. ignite = the jet
//     reaching out (8 frames, once), loop = the full cone (12 frames). Anchor = the dragon's mouth on the ground line.
//     Where the cone ends, ignite wood with fire v2's tongues (siege fx) and lay the siege `scorch` decal.
//   crash-dust: the dragon crashing down (P3): an iso dust ring 12 m across racing out, billows rising and thinning,
//     thrown stones (14 frames, once). Anchor = the impact point on the ground.
//   scylla-strike: a head snapping out of the sea: a split water column, a splash ring, spray droplets and foam
//     (12 frames, once). Anchor = the strike point on the water line.
// Usage: node scripts/war/art/landmark-fx.mjs [--sheet out.png]   (ends with the fx QA gate)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeImage } from '../../art/lib/png.mjs';
import { blank, hexToRgb, rgbToHex, paste } from '../../art/lib/ops.mjs';
import { runFxQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..'), OUT = join(ROOT, 'public/war/fx');
const C = (h) => [...hexToRgb(h), 255];
// fire v2's ramp (fire.mjs), dark to hot; dust from the ground ramps; sea and foam
const FIRE = ['#370a09', '#7a1410', '#7a2a14', '#b0461c', '#d8762c', '#e5923d', '#eeae52', '#f6d48a'].map(C);
const SMOKE = ['#2a292e', '#423f43', '#5c5c5f', '#837f7c'].map(C);
const DUST = ['#3b3328', '#544939', '#6e604b', '#8a7a60', '#a59478'].map(C);
const STONE = ['#2e2d2c', '#4a4744', '#6a655e'].map(C);
const SEA = ['#14232b', '#1f3640', '#2c4b55', '#3f646c', '#5d8289', '#86a6a8', '#b4c8c4', '#d9e3dc'].map(C);
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 10007) / 10007;
const TAU = Math.PI * 2, frac = (v) => v - Math.floor(v), clamp01 = (v) => Math.max(0, Math.min(1, v));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, v) => v > BAYER[(y & 3) * 4 + (x & 3)];
const set = (im, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < im.w && y < im.h) im.data.set(c, (y * im.w + x) * 4); };
const strip = (ims) => { const w = ims[0].w, h = ims[0].h, out = blank(w * ims.length, h); ims.forEach((im, n) => paste(out, im, n * w, 0)); return out; };
// iso ground axes in screen px per metre
const AX = { se: [16, 8], ne: [16, -8] }, PERP = { se: [16, -8], ne: [16, 8] };

// a soft blob with a dithered rim: v(x, y) in 0..1 picks the ramp step
function blob(im, cx, cy, rx, ry, ramp, heat, k, cut = 0.15) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (q > 1) continue;
    const e = 1 - q; if (e < cut && !dither(x, y, e / cut)) continue;
    const v = clamp01(heat * (0.55 + 0.6 * e) + (hash(x, y, k) - 0.5) * 0.16);
    set(im, x, y, ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))]);
  }
}

// a density field: puffs add density (a smooth bump) and carry a value (heat, lightness); a px is drawn where the density
// passes `thr` (a dithered band below it), coloured by the density-weighted value, lit from the upper left by the
// density gradient. Overlapping puffs merge into one mass instead of reading as balls.
class Field {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Float32Array(w * h); this.v = new Float32Array(w * h); }
  puff(cx, cy, rx, ry, val, wt = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, cx + rx); x++) {
      const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (q >= 1) continue;
      const b = wt * (1 - q) ** 2, i = y * this.w + x; this.d[i] += b; this.v[i] += b * val;
    }
  }
  draw(im, ramp, { thr = 0.35, band = 0.25, light = 0.18, k = 0, boost = 0.12 } = {}) {
    const { w, h, d, v } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, D = d[i]; if (D < thr - band) continue;
      if (D < thr && !dither(x, y, (D - thr + band) / band)) continue;
      const gx = (x > 0 ? d[i - 1] : 0) - (x < w - 1 ? d[i + 1] : 0), gy = (y > 0 ? d[i - w] : 0) - (y < h - 1 ? d[i + w] : 0);
      const val = clamp01(v[i] / D + boost * Math.min(1, D - thr) - light * Math.tanh((gx * 0.6 + gy) * 1.5) + (hash(x >> 1, y >> 1, k) - 0.5) * 0.08);
      set(im, x, y, ramp[Math.min(ramp.length - 1, Math.floor(val * ramp.length))]);
    }
  }
}

// ---- Drakon's breath: puffs streaming out along the cone; each puff i has its own phase, its lateral offset fixed;
// distance t along the jet grows with time, so the loop is seamless. Hot and tight at the mouth, wide, rising, red and
// smoky at the end. `reach` (0..1) clips the jet for the ignite frames.
const BR = { L: 12, W: 3.6, puffs: 280 };
function breath(dir, n, F, reach = 1) {
  const [ax, ay] = AX[dir], [px, py] = PERP[dir];
  const up = 80, w = Math.ceil(BR.L * ax + BR.W * Math.abs(px) + 40), hg = Math.ceil(BR.L * Math.abs(ay) + BR.W * Math.abs(py) + up + 40);
  const im = blank(w, hg), mx = 8, my = dir === 'se' ? up : hg - 30;
  const fire = new Field(w, hg), smoke = new Field(w, hg);
  for (let i = 0; i < BR.puffs; i++) {
    const t = frac(i / BR.puffs + n / F + hash(i, 1, 3) * 0.02); if (t > reach) continue;
    const s = (hash(i, 2, 7) + hash(i, 12, 7) - 1), lift = (10 + 34 * hash(i, 3, 9)) * t ** 1.5; // lateral -1..1 (peaked), rise px
    const wob = Math.sin(TAU * (t * 1.6 + hash(i, 4, 1))) * 0.3 * t;
    const X = mx + BR.L * t * ax + (BR.W * t ** 0.8 * s + wob) * px, Y = my + BR.L * t * ay + (BR.W * t ** 0.8 * s + wob) * py - lift;
    const r = 2.5 + 15 * t ** 0.85 * (0.7 + 0.6 * hash(i, 5, 2));
    if (t > 0.72 && hash(i, 6, 3) < 0.5) smoke.puff(X, Y - r * 0.8, r * 1.3, r, 0.75 - (t - 0.72) * 1.6, 0.9); // smoke off the tip
    else fire.puff(X, Y, r, r * 0.75, clamp01(1.08 - t * 1.0), 1);
  }
  for (let j = 0; j < 10; j++) { const t = (j / 10) * 0.2 * reach; fire.puff(mx + BR.L * t * ax, my + BR.L * t * ay, 3 + j * 0.6, 2.4 + j * 0.45, 1, 1.6); } // the white-hot jet
  smoke.draw(im, SMOKE, { thr: 0.4, band: 0.3, light: 0.25, k: n });
  fire.draw(im, FIRE, { thr: 0.3, band: 0.22, light: 0.12, k: n + 50, boost: 0.15 });
  return { im, anchor: { x: mx, y: my } };
}

// ---- crash dust: a ring rolling out on the ground (iso ellipse 2:1), billows rising and thinning, thrown stones
const CR = { R: 6, F: 14 };
function crash(n) {
  const F = CR.F, u = n / (F - 1), W = Math.ceil(CR.R * 2 * 16 * 2 * 1.08) + 20, H = 300, im = blank(W, H), cx = W / 2, cy = H - 116;
  const R = (0.25 + 0.75 * (1 - (1 - u) ** 2.2)) * CR.R * 32, fade = 1 - u ** 1.6; // ring radius in px (along screen x)
  // billows along the ring: back half first, then the front half over the impact
  const N = 150, dust = new Field(W, H);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + hash(i, 1, 5) * 0.1, rr = R * (0.8 + 0.28 * hash(i, 2, 5));
    const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr * 0.5, rise = (10 + 46 * hash(i, 3, 5)) * u ** 0.7;
    const r = (8 + 13 * hash(i, 4, 5)) * (0.55 + 1.0 * u);
    dust.puff(X, Y - rise, r, r * 0.72, 0.35 + 0.55 * fade * (Math.sin(a) > 0 ? 1 : 0.75), fade * 0.8 + 0.25);
  }
  // the central column of dust thrown up by the body, sinking back
  for (let j = 0; j < 24; j++) { const h = (30 + 70 * hash(j, 7, 2)) * Math.sin(Math.PI * Math.min(1, u * 1.3)), a = hash(j, 8, 2) * TAU, r = 12 + 16 * hash(j, 9, 2) * (0.5 + u); dust.puff(cx + Math.cos(a) * R * 0.4, cy - h * 0.6 + Math.sin(a) * R * 0.2, r, r * 0.75, 0.3 + 0.5 * fade, fade * 0.7 + 0.2); }
  dust.draw(im, DUST, { thr: 0.32 + 0.25 * u, band: 0.28, light: 0.2, k: n });
  // ground shock line: a thin dark ellipse at the ring's foot (first half)
  if (u < 0.6) for (let a = 0; a < TAU; a += 0.01) { const X = cx + Math.cos(a) * R * 1.02, Y = cy + Math.sin(a) * R * 0.51; if (dither(Math.round(X), Math.round(Y), 1 - u / 0.6)) set(im, X, Y, DUST[0]); }
  // stones thrown out on arcs
  for (let s = 0; s < 18; s++) {
    const a = hash(s, 1, 11) * TAU, v = 0.6 + 0.6 * hash(s, 2, 11), d = R * 1.15 * v * Math.min(1, u * 1.3), z = 120 * v * (u * 1.3) * (1 - u * 1.3); if (u * 1.3 > 1) continue;
    const X = cx + Math.cos(a) * d, Y = cy + Math.sin(a) * d * 0.5 - Math.max(0, z), sz = 1 + Math.floor(hash(s, 3, 11) * 3);
    for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz + 1; xx++) set(im, X + xx, Y + yy, STONE[yy === 0 ? 2 : xx === sz ? 0 : 1]);
  }
  return { im, anchor: { x: Math.round(cx), y: Math.round(cy) } };
}

// ---- Scylla's strike: a split water column bursting up and falling back, a splash ring on the water, droplets, foam
const SC = { F: 12, W: 150, H: 170 };
function strike(n) {
  const u = n / (SC.F - 1), im = blank(SC.W, SC.H), cx = SC.W / 2, cy = SC.H - 26;
  const colH = 120 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.8, spread = 6 + 26 * u;
  // the splash ring (behind, then in front)
  const R = 10 + 52 * (1 - (1 - u) ** 2);
  const ring = (front) => { for (let a = 0; a < TAU; a += 0.02) { const s = Math.sin(a); if ((s > 0) !== front) continue; const X = cx + Math.cos(a) * R, Y = cy + s * R * 0.5, hgt = (8 + 10 * hash(Math.round(a * 30), 1, 4)) * (1 - u) ** 0.7; for (let z = 0; z < hgt; z++) { const v = 1 - z / Math.max(1, hgt); if (dither(Math.round(X), Math.round(Y - z), 0.25 + 0.75 * (1 - u))) set(im, X, Y - z, SEA[Math.min(7, 3 + Math.floor(v * 4.9))]); } } };
  ring(false);
  // the column: two lobes of water mass, white at the crest
  const water = new Field(SC.W, SC.H);
  for (let k = 0; k < 3; k++) for (let i = 0; i < 30; i++) {
    const t = i / 29, side = k - 1, X = cx + side * (2 + spread * t ** 1.5) + Math.sin(i * 1.7 + n + k) * 2, Y = cy - colH * t * [0.82, 0.55, 1][k];
    const r = (7 + 9 * (1 - t) + 5 * t) * (1 - 0.3 * u);
    water.puff(X, Y, r, r * 1.1, clamp01(0.4 + 0.6 * t - 0.25 * u), 1);
  }
  water.draw(im, SEA, { thr: 0.35, band: 0.25, light: 0.22, k: n, boost: 0.1 });
  // falling droplets and spray
  for (let d = 0; d < 46; d++) {
    const a = (hash(d, 1, 8) - 0.5) * 2.4, v = 0.5 + 0.7 * hash(d, 2, 8), tt = u * 1.1;
    const X = cx + Math.sin(a) * 70 * v * tt, Y = cy - colH * 0.8 * v + 160 * (tt * tt) * (0.5 + hash(d, 3, 8)) - 50 * v * tt; if (Y > cy + 4 || u < 0.08) continue;
    set(im, X, Y, SEA[5 + Math.floor(hash(d, 4, 8) * 3)]); if (hash(d, 5, 8) < 0.4) set(im, X, Y + 1, SEA[4]);
  }
  ring(true);
  // foam on the water where it falls back
  if (u > 0.35) for (let f = 0; f < 70; f++) { const a = hash(f, 1, 6) * TAU, r = R * 0.9 * Math.sqrt(hash(f, 2, 6)), X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r * 0.5; if (hash(f, 3, 6) < 1.2 - u) { set(im, X, Y, SEA[6 + (f % 2)]); set(im, X + 1, Y, SEA[5]); } }
  return { im, anchor: { x: Math.round(cx), y: Math.round(cy) } };
}

// ---- main
const fx = [], sheets = [];
const add = (id, frs, meta) => { const file = `fx-${id}.png`; sheets.push({ file, im: strip(frs.map((f) => f.im)) }); fx.push({ id, file, frames: frs.length, fps: meta.fps ?? 12, loop: !!meta.loop, frame: { w: frs[0].im.w, h: frs[0].im.h }, anchor: frs[0].anchor, ...meta, source: 'procedural (landmark-fx.mjs)' }); };
for (const dir of ['se', 'ne']) {
  add(`breath-${dir}-ignite`, [...Array(8)].map((_, n) => breath(dir, n, 12, (n + 1) / 8)), { fps: 16, blend: 'normal', lengthM: BR.L, then: `breath-${dir}-loop`, use: `Drakon's fire breath starting: the jet reaching out towards the ${dir === 'se' ? 'lower' : 'upper'} right on the ground plane (flipX: ${dir === 'se' ? 'sw' : 'nw'}); anchor = the mouth on the ground line; then the loop` });
  add(`breath-${dir}-loop`, [...Array(12)].map((_, n) => breath(dir, n, 12)), { fps: 14, loop: true, blend: 'normal', lengthM: BR.L, widthM: BR.W * 2, use: `Drakon's fire breath, the full cone 12 m long (flipX: ${dir === 'se' ? 'sw' : 'nw'}); anchor = the mouth on the ground line; wood in the cone ignites: fire v2 tongues (siege fx) on it, siege scorch decal under the cone's end` });
}
add('crash-dust', [...Array(CR.F)].map((_, n) => crash(n)), { fps: 14, blend: 'normal', radiusM: CR.R, use: 'Drakon crashing down from the keep roof (P3): dust ring racing out 6 m, billows, thrown stones; play once, camera shake on frame 0; anchor = the impact point on the ground' });
add('scylla-strike', [...Array(SC.F)].map((_, n) => strike(n)), { fps: 14, blend: 'normal', use: 'a Scylla head snapping out of the sea (every snatch, 1 per 6 s): split water column, splash ring, spray, foam; play once; anchor = the strike point on the water line' });

mkdirSync(OUT, { recursive: true });
const used = new Set();
for (const s of sheets) { writeImage(join(OUT, s.file), s.im); const d = s.im.data; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) used.add(rgbToHex([d[i], d[i + 1], d[i + 2]])); }
const json = {
  pxPerMetre: 33,
  note: 'Landmark FX (ART-L): horizontal strips (frame n at x = n * frame.w), binary alpha; anchor = the world point the effect sits on (see use). loop false: play once (ignite clips chain into `then`). Draw at scale 1. Colours = tiles.json palette + palette.',
  palette: [...used].sort(), fx, objects: [],
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`landmark fx: ${fx.length} strips, ${used.size} colours`);
if (process.argv.includes('--sheet')) { // first, middle and last frames of every strip (a look, not committed)
  const W = Math.max(...fx.map((f) => f.frame.w * 3 + 16)), H = fx.reduce((a, f) => a + f.frame.h + 8, 0), out = blank(W, H);
  for (let i = 0; i < out.data.length; i += 4) out.data.set([40, 44, 40, 255], i);
  let y = 0; fx.forEach((f, k) => { [0, Math.floor(f.frames / 2), f.frames - 1].forEach((n, j) => { const fr = blank(f.frame.w, f.frame.h); for (let yy = 0; yy < f.frame.h; yy++) fr.data.set(sheets[k].im.data.subarray((yy * sheets[k].im.w + n * f.frame.w) * 4, (yy * sheets[k].im.w + (n + 1) * f.frame.w) * 4), yy * f.frame.w * 4); paste(out, fr, j * (f.frame.w + 8), y); }); y += f.frame.h + 8; });
  writeImage(process.argv[process.argv.indexOf('--sheet') + 1], out);
}
process.exit(runFxQa().length ? 1 : 0);
