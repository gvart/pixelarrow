// Relief inits (ART-8 refine): draw a mountain piece or a mesa as a heightfield rendered in the game's iso projection
// (1 tile = 64 x 32 px, height in px), lit from the upper left, with rock strata, fractures, snow and talus. The PNG is the
// init image for PixelLab create_image_pixflux img2img, which keeps the geometry and paints it (PROMPTS_ART.md §28-29).
// Usage: node scripts/war/art/relief.mjs <out dir> [id ...]   -> <id>.png per piece + below.json (the foot polylines for
// base.below in the biome lists). The pieces are the RELIEFS table below.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank } from '../../art/lib/ops.mjs';
import { writeImage, readImage } from '../../art/lib/png.mjs';

const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, k) {
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fy);
  return (hash(X, Y, k) * (1 - u) + hash(X + 1, Y, k) * u) * (1 - v) + (hash(X, Y + 1, k) * (1 - u) + hash(X + 1, Y + 1, k) * u) * v;
}
const fbm = (x, y, k, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, k + i); a *= 0.5; f *= 2; } return s / (1 - 0.5 ** o); };
const ridged = (x, y, k, o = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f, y * f, k + i) - 1)); n += a; a *= 0.5; f *= 2.1; } return s / n; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Features in tile units: peak { u, v, h, r: [ru-, ru+, rv-, rv+], p }; ridge { a: [u, v, h], b: [u, v, h], w, p }; mesa { u, v, r, h }.
function peakH(f, u, v) {
  const du = u - f.u, dv = v - f.v, ru = du < 0 ? f.r[0] : f.r[1], rv = dv < 0 ? f.r[2] : f.r[3];
  const d = Math.hypot(du / ru, dv / rv); return f.h * Math.max(0, 1 - d) ** (f.p ?? 1.4);
}
function ridgeH(f, u, v) {
  const [au, av, ah] = f.a, [bu, bv, bh] = f.b, lu = bu - au, lv = bv - av, L2 = lu * lu + lv * lv;
  const t = clamp(((u - au) * lu + (v - av) * lv) / L2), d = Math.hypot(u - au - t * lu, v - av - t * lv);
  const top = ah + (bh - ah) * t, w = f.w * (1 - 0.35 * Math.abs(2 * t - 1) ** 2); // thinner towards the ends
  return top * Math.max(0, 1 - d / w) ** (f.p ?? 1.2);
}

const PAL = {
  rock: ['#1b1c20', '#2a2c31', '#3b3e44', '#50545a', '#686c71', '#83878b', '#a0a3a5'].map(hex),
  snow: ['#7d8893', '#a9b3bc', '#cdd5db', '#eef2f4'].map(hex),
  scree: ['#34332f', '#4a4842', '#625f57'].map(hex),
  red: ['#2a1410', '#47201a', '#6a2f22', '#8c432c', '#a85a36', '#c27a4a', '#d69a66'].map(hex),
  band: ['#8a4a2e', '#a86440', '#c08254', '#94502f', '#b4744a', '#cc9462'].map(hex),
  cap: ['#6e4a32', '#9a6c48', '#c09468', '#d8b488'].map(hex),
  talus: ['#3a2218', '#5a3424', '#7c4a32'].map(hex),
};
const ramp = (p, t) => { const x = clamp(t) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(x)); return mix(p[i], p[i + 1], x - i); };

export function render(R) {
  const { W, H, fu, fv, seed = 1, kind = 'mountain' } = R, res = 32, BG = hex('#1e1510');
  const ox = R.ox ?? fv * 32 + (W - (fu + fv) * 32) / 2, oy = R.oy ?? H - 4 - (fu + fv) * 16;
  const nu = Math.round(fu * res), nv = Math.round(fv * res), hf = new Float32Array((nu + 1) * (nv + 1)), df = new Float32Array((nu + 1) * (nv + 1)); // df: a mesa's signed distance to its rim
  const at = (i, j) => hf[clamp(j, 0, nv) * (nu + 1) + clamp(i, 0, nu)], atD = (i, j) => df[clamp(j, 0, nv) * (nu + 1) + clamp(i, 0, nu)];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    let u = i / res, v = j / res;
    const wu = u + (fbm(u * 0.5, v * 0.5, seed + 11) - 0.5) * (R.warp ?? 1.2), wv = v + (fbm(u * 0.5, v * 0.5, seed + 17) - 0.5) * (R.warp ?? 1.2);
    let h = 0;
    if (kind === 'mesa') {
      for (const m of R.mesas) { // caprock outline = a noisy circle; sheer wall; a talus apron below
        const a = Math.atan2(wv - m.v, wu - m.u), ca = Math.cos(a), sa = Math.sin(a);
        const rr = m.r * (0.84 + 0.3 * fbm(ca * 1.5 + 5, sa * 1.5 + 5, seed + 3, 3) + 0.05 * (fbm(ca * 4 + 9, sa * 4 + 9, seed + 4, 2) - 0.5)); // lobes, a few soft buttresses (sharp ones come back as plaid)
        const q = m.q ?? 4, d = (Math.abs((wu - m.u) / (m.ru ?? 1)) ** q + Math.abs((wv - m.v) / (m.rv ?? 1)) ** q) ** (1 / q) - rr;
        const top = m.h, apron = m.apron ?? 1.6; // profile: flat caprock, sheer cliff to 0.55 h, a steep banded slope to 0.25 h, a talus skirt
        const hm = d <= 0 ? top : d < 0.08 ? top * (1 - (d / 0.08) * 0.45) : d < 0.5 ? top * (0.55 - 0.3 * ((d - 0.08) / 0.42) ** 0.8) : d < apron ? top * 0.25 * (1 - (d - 0.5) / (apron - 0.5)) ** 1.5 : 0;
        if (hm > h) df[j * (nu + 1) + i] = d;
        h = Math.max(h, hm);
      }
      h = h >= R.mesas[0].h - 0.5 ? h : h * (0.94 + 0.12 * fbm(u * 6, v * 6, seed + 7));
    } else {
      // a broad massif body under the summits (else separate cones read as teeth), then the summits and ridges
      const top = Math.max(0, ...(R.peaks ?? []).map((f) => f.h), ...(R.ridges ?? []).map((f) => Math.max(f.a[2], f.b[2])));
      if (R.body !== 0) h = peakH({ u: fu / 2, v: fv / 2, h: top * (R.body ?? 0.45), r: [fu * 0.48, fu * 0.48, fv * 0.48, fv * 0.48], p: 0.75 }, wu, wv);
      for (const f of R.peaks ?? []) h = Math.max(h, peakH(f, wu, wv));
      for (const f of R.ridges ?? []) h = Math.max(h, ridgeH(f, wu, wv));
      const e = ridged(u * (R.rough ?? 1.6), v * (R.rough ?? 1.6), seed + 23, 5);
      h = h * (0.8 + 0.24 * e) - (R.sink ?? 6);
      for (const f of R.lumps ?? []) h = Math.max(h, peakH(f, wu, wv) * (0.85 + 0.3 * fbm(u * 3, v * 3, seed + 29)));
    }
    const edge = Math.min(u, v, fu - u, fv - v) / 0.7; // fade to the ground at the footprint's border (no cut walls)
    hf[j * (nu + 1) + i] = Math.max(0, h * clamp(edge) ** 0.8 - (edge < 1 ? 3 * (1 - edge) : 0));
  }
  const L = [-0.55, 0.62, 0.75], Ln = Math.hypot(...L);
  // texMesa: reproject the approved ART-7 mesa raw (one front-facing wall) onto both faces: wall texture by (screen x, depth
  // below the rim), so its strata follow each face in perspective; cap and talus by screen position. Mirror-wrapped.
  const TM = R.texMesa && readImage(R.texMesa.file), pp = (t, n) => { t = ((t % (2 * n)) + 2 * n) % (2 * n); return t < n ? t : 2 * n - 1 - t; };
  const tm = (rect, x, y) => { const [rx, ry, rw, rh] = rect, q = ((ry + pp(Math.round(y), rh)) * TM.w + rx + pp(Math.round(x), rw)) * 4; return [TM.data[q], TM.data[q + 1], TM.data[q + 2]]; };
  const img = blank(W, H), zb = new Float32Array(W * H).fill(-1e9);
  for (let i = 0; i < W * H; i++) img.data.set([...BG, 255], i * 4);
  const below = new Array(W).fill(-1);
  for (let s = 0; s <= nu + nv; s++) for (let i = Math.max(0, s - nv); i <= Math.min(nu, s); i++) {
    const j = s - i, h = at(i, j); if (h < 1) continue;
    const u = i / res, v = j / res, X = Math.round(ox + (u - v) * 32), Y0 = oy + (u + v) * 16, Yt = Math.round(Y0 - h);
    const hu = (at(i + 1, j) - at(i - 1, j)) * res / 2 / 32, hv = (at(i, j + 1) - at(i, j - 1)) * res / 2 / 32; // slope in px per px
    const n = [-hu, -hv, 1], nl = Math.hypot(...n), lit0 = clamp((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl / Ln), steep = 1 - 1 / nl;
    const k5 = 9, Hu = kind === 'mesa' ? atD(i - 4, j) - atD(i + 4, j) : (at(i + k5, j) - at(i - k5, j)) * res / (2 * k5) / 32;
    const Hv = kind === 'mesa' ? atD(i, j - 4) - atD(i, j + 4) : (at(i, j + k5) - at(i, j - k5)) * res / (2 * k5) / 32; // a mesa wall faces along its rim's normal (smooth)
    const wl = Math.hypot(Hu, Hv) || 1, litW = clamp(0.5 + 0.62 * ((-Hu / wl) * L[0] + (-Hv / wl) * L[1]) / Math.hypot(L[0], L[1])); // a wall's facing (wide gradient)
    const lap = (at(i + 2, j) + at(i - 2, j) + at(i, j + 2) + at(i, j - 2) - 4 * h) / 4; // > 0: a gully
    for (let Y = Yt; Y <= Math.round(Y0); Y++) {
      if (Y < 0 || Y >= H) continue;
      const z = h - (Y - Yt), depth = Y - Yt, lit = depth > 1 ? litW * 0.85 : lit0; let c;
      if (kind === 'mesa') {
        const m = R.mesas[0], cap = depth < 2 && z > m.h * 0.9;
        if (TM) { // the texture path: face light only (the raw carries its own shading)
          const T = R.texMesa, wallTop = m.h, wallBot = m.h * 0.25;
          if (cap) c = tm(T.cap, X, Y * 2);
          else if (z > wallBot) c = tm(T.wall, X, ((wallTop - z) / (wallTop - wallBot)) * T.wall[3]).map((q) => q * (0.35 + 0.8 * lit) * (wallTop - z < 3 ? 0.6 : 1));
          else c = tm(T.talus, X, Y * 1.4).map((q) => q * (0.55 + 0.5 * lit));
        } else if (cap) c = ramp(PAL.cap, 0.3 + 0.35 * fbm(u * 3, v * 3, seed + 41) + (hash(X, Y, seed) > 0.96 ? -0.3 : 0));
        else if (z > m.h * 0.25) { // the wall and the slope below it: horizontal sedimentary bands by height, lit by facing
          const zb2 = z + 10 * fbm(z * 0.04, 0.5, seed + 44, 2) + 4 * (fbm(X * 0.03, z * 0.02, seed + 43) - 0.5), bi = Math.floor(zb2 / (m.bandPx ?? 9)), fr = zb2 / (m.bandPx ?? 9) - bi;
          const b = mix(PAL.band[((bi % PAL.band.length) + PAL.band.length) % PAL.band.length], PAL.band[(((bi + 1) % PAL.band.length) + PAL.band.length) % PAL.band.length], clamp((zb2 / (m.bandPx ?? 9) - bi - 0.8) * 5)).map((q) => q * (m.h - z < 4 ? 0.55 : 1) * (fr > 0.88 ? 1.25 : fr < 0.1 ? 0.8 : 1)); // ledge tops lit, undercuts dark
          const crack = 1;
          c = b.map((q) => q * (0.22 + 1.0 * lit) * crack * (z < m.h * 0.55 ? 0.82 : 1));
        } else c = mix(ramp(PAL.talus, 0.2 + 0.7 * lit), PAL.red[3], 0.25 * fbm(X * 0.2, Y * 0.2, seed + 49)); // talus
        if (!TM && z < m.h * 0.3) { const bx = X >> 3, by = Y >> 2, r = hash(bx, by, seed); if (r > 0.82) { const cx = (bx << 3) + 4, cy = (by << 2) + 2, e = Math.hypot((X - cx) / 3.5, (Y - cy) / 2); if (e < 1) c = c.map((q) => q * (Y < cy ? 1.45 : 0.75)); } } // talus boulders: lit tops, shaded bottoms
      } else {
        const strata = 0.88 + 0.24 * fbm((z + 0.5 * X) * 0.06, X * 0.015, seed + 31, 3); // soft tilted bedding (no lines: pixflux turns line grids into bricks)
        let t = 0.12 + 0.85 * lit ** 1.3 - 0.25 * clamp(lap * 0.4) + 0.12 * (fbm(X * 0.3, Y * 0.3, seed + 39) - 0.5);
        c = ramp(PAL.rock, t).map((q) => q * strata);
        const snowLine = R.snow ?? 1e9, snowy = z > snowLine + 18 * (fbm(X * 0.06, z * 0.06, seed + 53) - 0.5);
        if (snowy && depth < 4 + 10 * clamp(lap) && (steep < 0.6 || lap > 0.4)) c = ramp(PAL.snow, 0.25 + 0.75 * lit);
        if (z < (R.scree ?? 14)) c = mix(c, ramp(PAL.scree, lit + 0.2 * hash(X, Y, seed)), 0.6);
      }
      for (let dx = 0; dx < 2; dx++) {
        const x = X + dx; if (x < 0 || x >= W) continue;
        const k = Y * W + x, d = s + dx * 0.001; if (d < zb[k]) continue; zb[k] = d;
        img.data.set([...c.map((q) => clamp(Math.round(q), 0, 255)), 255], k * 4);
        if (Y > below[x]) below[x] = Y;
      }
    }
  }
  // texture: modulate by the luminance of a painted rock source (the Gemini Kleisoura art), for its fractures and snow streaks
  if (R.tex) {
    const T = readImage(R.tex.file), { x: tx, y: ty, w: tw, h: th } = R.tex, lumT = (x, y) => { const q = ((ty + y) * T.w + tx + x) * 4; return 0.3 * T.data[q] + 0.59 * T.data[q + 1] + 0.11 * T.data[q + 2]; };
    let mean = 0; for (let y = 0; y < th; y += 3) for (let x = 0; x < tw; x += 3) mean += lumT(x, y); mean /= Math.ceil(th / 3) * Math.ceil(tw / 3);
    const sx = R.tex.at?.[0] ?? 0, sy = R.tex.at?.[1] ?? 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (below[x] < 0 || zb[y * W + x] === -1e9) continue; const k = (y * W + x) * 4;
      const pp = (t, n) => { t %= 2 * n; return t < n ? t : 2 * n - 1 - t; }; // mirror wrap: no seams
      const f = clamp((lumT(pp(x + sx, tw), pp(y + sy, th)) / mean) ** (R.tex.k ?? 0.5), 0.72, 1.3);
      for (let c = 0; c < 3; c++) img.data[k + c] = clamp(Math.round(img.data[k + c] * f), 0, 255);
    }
  }
  // two soft blur passes inside the silhouette: hide the column streaks and dots of the splatting (pixflux reads them as grain)
  for (let pass = 0; pass < (R.blur ?? (R.tex ? 1 : 2)); pass++) {
    const src = new Uint8Array(img.data);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (below[x] < 0) continue; const k = (y * W + x) * 4; let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = ((y + dy) * W + x + dx) * 4; r += src[q]; g += src[q + 1]; b += src[q + 2]; n++; }
      img.data[k] = r / n; img.data[k + 1] = g / n; img.data[k + 2] = b / n;
    }
  }
  // foot polyline for base.below: the lowest drawn pixel per column (+2), sampled every 10 px
  const pts = []; for (let x = 0; x < W; x += 10) { const ys = below.slice(x, x + 10).filter((y) => y >= 0); pts.push([x, ys.length ? Math.max(...ys) + 2 : 0]); }
  return { img, below: pts.filter(([, y]) => y > 0) };
}

// The pieces (tile units). Ridges run along the tile y axis (v), like ridge-a; build mirrors for the x axis.
const GEM = '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/gemini'; // the approved Gemini art (shots/ is not committed)
const TEX = { file: `${GEM}/region-pass/ART1_kleisoura_2.png`, x: 0, y: 0, w: 720, h: 360 }; // fractured rock and snow streaks
const MESA_TEX = { file: '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab/kyrene/raw/objects/mesa-end.png', wall: [170, 135, 230, 127], cap: [150, 62, 240, 46], talus: [50, 285, 340, 60] }; // pixflux 78bf3391 (ART-7)
export const RELIEFS = {
  // an asymmetric peak: summit pushed to the back, a long gentle shoulder down-left, a steep broken face to the right
  'peak-lean': { tex: { ...TEX, at: [371, 79] }, W: 400, H: 360, fu: 5.4, fv: 7, seed: 3, snow: 120, peaks: [{ u: 2.3, v: 2.5, h: 215, r: [2.2, 2.8, 2.4, 4.6], p: 1.05 }], ridges: [{ a: [2.3, 2.5, 190], b: [3.6, 6.4, 30], w: 1.6, p: 0.9 }] },
  // a horn: one tall narrow summit with three aretes
  'peak-horn': { tex: { ...TEX, at: [65, 185] }, W: 360, H: 400, fu: 5.6, fv: 5.6, seed: 5, snow: 140, rough: 2, peaks: [{ u: 2.8, v: 2.7, h: 250, r: [2.6, 2.6, 2.6, 2.6], p: 1.25 }], ridges: [{ a: [2.8, 2.7, 230], b: [0.7, 4.2, 25], w: 1.1, p: 0.9 }, { a: [2.8, 2.7, 230], b: [5.0, 4.0, 25], w: 1.1, p: 0.9 }, { a: [2.8, 2.7, 230], b: [2.6, 5.2, 35], w: 1.2, p: 0.9 }] },
  // a long saddle: two unequal summits joined by a low dipping ridge
  'saddle-long': { tex: { ...TEX, at: [259, 291] }, W: 400, H: 300, fu: 3.6, fv: 9, seed: 7, snow: 100, peaks: [{ u: 1.8, v: 1.9, h: 165, r: [1.8, 1.9, 1.8, 2.6], p: 1.0 }, { u: 1.9, v: 6.9, h: 130, r: [1.7, 1.7, 2.6, 2.0], p: 1.0 }], ridges: [{ a: [1.8, 1.9, 130], b: [1.9, 6.9, 105], w: 1.7, p: 0.85 }], sink: 0 },
  // a jagged knife ridge: a long serrated arete with many small teeth
  'ridge-jagged': { tex: { ...TEX, at: [110, 240] }, W: 400, H: 272, fu: 4.2, fv: 8.2, seed: 9, snow: 85, rough: 2.6, body: 0.3, ridges: [{ a: [2.1, 0.9, 85], b: [2.1, 7.4, 105], w: 2.0, p: 0.85 }], peaks: [{ u: 2.0, v: 5.2, h: 120, r: [1.7, 1.9, 2.0, 2.0], p: 1.05 }, { u: 2.2, v: 2.5, h: 105, r: [1.7, 1.8, 1.8, 1.8], p: 1.05 }] },
  // a spur: a shoulder falling from a high back end (joins a peak behind) to the foothills down-left
  'spur': { tex: { ...TEX, at: [147, 203] }, W: 400, H: 300, fu: 4.2, fv: 8, seed: 13, snow: 115, ridges: [{ a: [1.8, 0.9, 175], b: [2.6, 7.4, 15], w: 2.1, p: 1.0 }], peaks: [{ u: 1.9, v: 2.7, h: 150, r: [1.7, 2.0, 1.9, 2.4], p: 1.0 }] },
  // a broad shoulder: a wide rounded mass with a flat-ish crest, little snow
  'shoulder': { tex: { ...TEX, at: [341, 9] }, W: 400, H: 252, fu: 5, fv: 7.4, seed: 17, snow: 115, rough: 1.3, ridges: [{ a: [2.4, 1.3, 115], b: [2.6, 6.1, 100], w: 2.4, p: 0.75 }] },
  // foothills: low rounded lumps of rock and scree, no snow
  'foothill-a': { tex: { ...TEX, at: [35, 115] }, W: 300, H: 180, fu: 4, fv: 5, seed: 19, rough: 1.2, scree: 20, sink: 2, peaks: [{ u: 1.8, v: 2.0, h: 70, r: [1.7, 2.0, 1.7, 2.2], p: 0.9 }, { u: 2.6, v: 3.6, h: 48, r: [1.4, 1.4, 1.4, 1.4], p: 0.9 }] },
  'foothill-b': { tex: { ...TEX, at: [132, 168] }, W: 360, H: 192, fu: 3.4, fv: 7.4, seed: 23, rough: 1.4, scree: 18, sink: 2, ridges: [{ a: [1.6, 1.0, 62], b: [1.8, 6.4, 45], w: 1.6, p: 0.8 }], peaks: [{ u: 1.6, v: 2.6, h: 85, r: [1.5, 1.6, 1.6, 1.8], p: 1.0 }] },
  // broken crags: a low ragged field of tilted rock fins
  'crags': { tex: { ...TEX, at: [326, 274] }, W: 300, H: 212, fu: 4, fv: 5, seed: 29, rough: 3.5, sink: 0, scree: 16, peaks: [{ u: 1.4, v: 1.7, h: 105, r: [0.8, 1.1, 0.9, 1.2], p: 1.0 }, { u: 2.6, v: 2.4, h: 80, r: [0.9, 1.0, 0.9, 1.1], p: 1.0 }, { u: 1.8, v: 3.4, h: 70, r: [1.0, 1.0, 1.0, 1.0], p: 1.0 }, { u: 3.0, v: 3.8, h: 45, r: [0.8, 0.8, 0.8, 0.8], p: 1.0 }] },
  // the huge unique massifs: several summits on one broad base, filling a canvas
  'massif-great': { tex: { ...TEX, at: [20, 80] }, W: 400, H: 400, fu: 6.2, fv: 6.2, seed: 31, snow: 120, peaks: [{ u: 2.2, v: 2.3, h: 265, r: [2.2, 2.7, 2.3, 3.3], p: 1.1 }, { u: 4.3, v: 2.1, h: 190, r: [1.8, 2.0, 2.0, 2.4], p: 1.05 }, { u: 2.1, v: 4.6, h: 170, r: [2.0, 2.2, 2.0, 1.8], p: 1.05 }], ridges: [{ a: [2.2, 2.3, 220], b: [4.7, 5.4, 30], w: 1.6, p: 0.9 }] },
  'massif-wall': { tex: { ...TEX, at: [320, 60] }, W: 400, H: 360, fu: 5.6, fv: 6.8, seed: 37, snow: 110, rough: 2.0, ridges: [{ a: [2.6, 1.2, 140], b: [2.8, 5.8, 160], w: 2.7, p: 0.9 }], peaks: [{ u: 2.7, v: 4.6, h: 215, r: [2.3, 2.7, 2.6, 2.2], p: 1.05 }, { u: 2.5, v: 2.2, h: 180, r: [2.2, 2.6, 2.0, 2.2], p: 1.05 }] },
  // summits for the cores: a very tall top whose foot runs off the bottom of the canvas (oy pushed down), so only the upper
  // ~400 px are drawn; used only at the back of a composed core, where front pieces hide the cut
  'summit-a': { tex: { ...TEX, at: [60, 30] }, W: 384, H: 400, fu: 6, fv: 6, oy: 314, seed: 51, snow: 190, rough: 1.8, peaks: [{ u: 3, v: 3, h: 380, r: [3.2, 3.2, 3.2, 3.2], p: 1.2 }], ridges: [{ a: [3, 3, 340], b: [0.6, 4.6, 120], w: 1.4, p: 0.9 }, { a: [3, 3, 340], b: [5.2, 4.2, 130], w: 1.4, p: 0.9 }] },
  'summit-b': { tex: { ...TEX, at: [420, 200] }, W: 384, H: 400, fu: 6, fv: 6, oy: 314, seed: 53, snow: 180, rough: 2, peaks: [{ u: 2.4, v: 3.3, h: 370, r: [2.6, 3.0, 2.8, 2.8], p: 1.15 }, { u: 3.9, v: 2.6, h: 320, r: [2.4, 2.6, 2.6, 2.8], p: 1.15 }] },
  // a cliff: a long sheer rock wall (a fin with bulging steep sides, p < 1) with a ragged top, running along the tile y axis
  'cliff': { tex: { ...TEX, at: [200, 120] }, W: 320, H: 280, fu: 2.6, fv: 6.6, seed: 47, snow: 150, rough: 3, body: 0, sink: 0, scree: 12, ridges: [{ a: [1.3, 1.0, 150], b: [1.3, 5.6, 120], w: 1.0, p: 0.4 }], peaks: [{ u: 1.3, v: 2.4, h: 175, r: [0.9, 0.9, 1.2, 1.4], p: 0.5 }] },
  // Kyrene mesas: a flat caprock, sheer banded walls (SW face lit, SE face shaded), a talus apron
  'mesa-big': { kind: 'mesa', blur: 0, texMesa: MESA_TEX, W: 400, H: 320, fu: 6.4, fv: 6.4, seed: 41, warp: 0.5, mesas: [{ u: 3.2, v: 3.2, r: 1.75, ru: 1.2, rv: 0.85, q: 3.5, h: 120, apron: 1.3 }] },
  'mesa-butte': { kind: 'mesa', blur: 0, texMesa: MESA_TEX, W: 280, H: 300, fu: 4.2, fv: 4.2, seed: 43, warp: 0.4, mesas: [{ u: 2.1, v: 2.1, r: 0.95, q: 3.5, h: 150, apron: 1.1 }] },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, ...ids] = process.argv.slice(2); mkdirSync(out, { recursive: true });
  const feet = {};
  for (const id of ids.length ? ids : Object.keys(RELIEFS)) {
    const { img, below } = render(RELIEFS[id]); writeImage(join(out, `${id}.png`), img); feet[id] = below;
  }
  writeFileSync(join(out, 'below.json'), JSON.stringify(feet));
  console.log('inits ->', out);
}
