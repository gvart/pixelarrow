// Init images for the build-mode kit textures (Buildings, PROMPTS_ART.md): flat front elevations at 33 px/m, periodic
// with period 66 px (one 2 m tile), for create_image_pixflux img2img. The kit renderer (buildings.mjs) quilts the result
// back to an exact period and maps it onto the iso wall, gate, tower and bridge faces.
// Usage: node scripts/war/art/kit-inits.mjs <out dir>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeImage } from '../../art/lib/png.mjs';
import { blank, hexToRgb } from '../../art/lib/ops.mjs';

const OUT = process.argv[2]; if (!OUT) { console.error('usage: kit-inits.mjs <out dir>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
export const P = 66; // px per 2 m tile at 33 px/m
const hash = (x, y, k = 0) => ((((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000) / 1000;
const set = (im, x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= im.w || y >= im.h) return; const i = (y * im.w + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = a; };
const mul = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const WOOD = hexToRgb('#4a3626'), STONE = hexToRgb('#5d5952'), MORTAR = hexToRgb('#24221f'), ROPE = hexToRgb('#2a2018');

// Palisade: sharpened logs ~0.33 m thick, ~3 m tall, two lashing bands.
function palisade(w = 264, h = 128) {
  const im = blank(w, h), widths = [11, 12, 10, 11, 12, 10];
  for (let x0 = 0, k = 0; x0 < w; k++) {
    const lw = widths[k % widths.length], top = h - 99 - Math.round(6 * hash(k % 6, 1)), tip = 9 + Math.round(4 * hash(k % 6, 2));
    for (let x = x0; x < x0 + lw && x < w; x++) {
      const t = (x - x0 + 0.5) / lw, f = 0.62 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - (t > 0.85 ? 0.25 : 0);
      const tipY = top + Math.round(tip * Math.abs(t - 0.5) * 2);
      for (let y = tipY; y < h; y++) {
        let c = mul(WOOD, f * (0.92 + 0.16 * hash(x, (y / 7) | 0, 3)));
        if (y - tipY < 3) c = mul(c, 1.25); // pale cut tip
        if ((y === h - 80 || y === h - 79 || y === h - 26 || y === h - 25)) c = ROPE;
        if (x === x0 + lw - 1) c = mul(c, 0.55); // gap shadow
        set(im, x, y, c);
      }
    }
    x0 += lw;
  }
  return im;
}

// Ashlar wall: 4.3 m of coursed blocks + 0.8 m merlons (1.2 m merlon, 0.8 m crenel per 2 m).
function ashlar(w = 264, h = 176) {
  const im = blank(w, h), walk = h - 142, courses = [];
  for (let y = h, r = 0; y > walk; r++) { const ch = 18 + Math.round(6 * hash(r, 7)); courses.push([Math.max(walk, y - ch), y, r]); y -= ch; }
  const joints = (r) => { const o = Math.round(P * hash(r, 9)), out = []; for (let x = 0; x < P - 16; x += 22 + Math.round(20 * hash(r, x))) out.push((o + x) % P); return out; };
  for (const [y0, y1, r] of courses) {
    const J = joints(r).sort((a, b) => a - b);
    for (let x = 0; x < w; x++) {
      const px = x % P, bi = J.filter((j) => j <= px).length, block = (Math.floor(x / P) * 10 + bi) % J.length;
      const f = 0.85 + 0.3 * hash(block, r, 4);
      for (let y = y0; y < y1; y++) {
        let c = mul(STONE, f * (0.94 + 0.12 * hash(x, y, 5)));
        if (J.includes(px) || y === y0) c = MORTAR;
        else if (y === y0 + 1 || J.includes(px - 1)) c = mul(c, 1.18);
        else if (y === y1 - 1) c = mul(c, 0.75);
        set(im, x, y, c);
      }
    }
  }
  for (let x = 0; x < w; x++) { // merlons
    const px = x % P; if (px >= 40) continue;
    for (let y = walk - 26; y < walk; y++) { let c = mul(STONE, 0.95 + 0.1 * hash(x, y, 6)); if (px === 0 || px === 39 || y === walk - 26) c = MORTAR; else if (y === walk - 25) c = mul(c, 1.2); set(im, x, y, c); }
  }
  return im;
}

// Stone bridge side: a 2 m arch bay per tile (pier 0.55 m, opening 1.45 m), deck at 2.5 m, parapet to 3.3 m.
function arches(w = 264, h = 116) {
  const im = blank(w, h), deck = h - 82, r = 24;
  for (let x = 0; x < w; x++) {
    const px = x % P, cx = 18 + r; // pier 0..17, arch centre at 42
    for (let y = deck - 26; y < h; y++) {
      const dx = px - cx + 0.5, archTop = h - 46; // springing 46 px above the water line
      const inArch = px >= 18 && (y > archTop || Math.hypot(dx, (archTop - y) * 1.0) < r) && y > archTop - r;
      if (inArch) continue;
      const voussoir = px >= 18 && Math.hypot(dx, archTop - y) < r + 8 && y <= archTop;
      let c = mul(STONE, 0.9 + 0.15 * hash((x / 12) | 0, (y / 9) | 0, 8));
      if (voussoir) { const ang = Math.atan2(archTop - y, dx); c = Math.round(ang * 6) % 2 ? mul(c, 0.85) : c; if (Math.abs(Math.hypot(dx, archTop - y) - r - 8) < 1) c = MORTAR; }
      else if (y % 18 === 0 || (x + ((y / 18) | 0) * 23) % 31 === 0) c = MORTAR;
      if (y === deck || y === deck - 1) c = mul(STONE, 1.2);
      set(im, x, y, c);
    }
  }
  return im;
}

// Wooden trestle bridge side: a pile pair per tile with X bracing, a deck beam at 2 m, a post-and-rail railing to 3 m.
function trestle(w = 264, h = 104) {
  const im = blank(w, h), deck = h - 66;
  for (let x = 0; x < w; x++) {
    const px = x % P;
    for (let y = deck - 33; y < h; y++) {
      let c = null;
      const pile = px < 8 || (px >= 33 && px < 41), beam = y >= deck && y < deck + 10, post = (px < 5 || (px >= 33 && px < 38)) && y < deck, rail = y >= deck - 31 && y < deck - 26;
      const brace = y > deck + 10 && (Math.abs((px - 8) - (y - deck - 10) * 0.9) < 3 || Math.abs((32 - px) - (y - deck - 10) * 0.9) < 3) && px >= 8 && px < 33;
      if (pile || beam || post || rail || brace) c = mul(WOOD, (pile || post ? 0.9 : 1.05) * (0.9 + 0.2 * hash(x, (y / 6) | 0, 9)));
      if (c && (beam && (y === deck || y === deck + 9))) c = mul(c, 0.7);
      if (c && pile && (px === 7 || px === 40)) c = mul(c, 0.6);
      if (c) set(im, x, y, c);
    }
  }
  return im;
}

// ---- Greek set (Buildings, Greek redo). Long textures repeat every 4 tiles (264 px = 8 m) so the masonry does not
// repeat block for block every 2 m; they are drawn 400 px wide so the build can quilt 400 -> 264.
export const PL = 264;
const LIME = hexToRgb('#6a645a'), JOINT = hexToRgb('#1c1a17');
// Voronoi blocks, periodic in x (period pw), from seeds [{x, y, f}]; xs: x squash (wider blocks); returns per px
// { s: seed index, e: distance to the joint }. Each block is lit from the upper left and darkens towards its lower edge.
function blocks(im, seeds, pw, y0, y1, xs = 0.7, base = LIME, jw = 1.6) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < im.w; x++) {
    let d1 = 1e9, d2 = 1e9, s1 = -1;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]; let dx = Math.abs(((x % pw) - s.x)); dx = Math.min(dx, pw - dx) * xs; const dy = y - s.y, d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; s1 = i; } else if (d < d2) d2 = d;
    }
    const e = (d2 - d1) / 2, s = seeds[s1]; let dx = (x % pw) - s.x; if (dx > pw / 2) dx -= pw; if (dx < -pw / 2) dx += pw;
    let c = mul(base, s.f * (1 - 0.22 * (dx / s.r + (y - s.y) / s.r) * 0.5) * (0.93 + 0.14 * hash(x >> 1, y >> 1, 11)));
    if (e < jw) c = JOINT;
    else if (e < jw + 2.2) c = mul(c, y > s.y || dx > 0 ? 0.72 : 1.22); // bevel: lit top-left rim, shadowed lower-right rim
    set(im, x, y, c);
  }
}
function seedRows(pw, y0, y1, hMin, hMax, wMin, wMax, k) {
  const seeds = [];
  for (let y = y1, r = 0; y > y0; r++) {
    const ch = hMin + (hMax - hMin) * hash(r, k, 1); let x = pw * hash(r, k, 2);
    for (let n = 0; n < 40; n++) { const bw = wMin + (wMax - wMin) * hash(r, n, k + 3); seeds.push({ x: (x + bw / 2) % pw, y: y - ch / 2 + (hash(r, n, k + 4) - 0.5) * ch * 0.5, f: 0.78 + 0.4 * hash(r, n, k + 5), r: Math.max(bw, ch) / 2 }); x += bw; if (x >= pw * hash(r, k, 2) + pw - wMin * 0.6) break; }
    y -= ch;
  }
  return seeds;
}
// Cyclopean wall elevation: 5.0 m of huge irregular polygonal blocks (bigger low down) and a 0.9 m parapet of smaller
// stones with a capping course. Rows from the bottom: 0..164 wall, 165..196 parapet.
function cyclopean(w = 400, h = 200) {
  const im = blank(w, h), walk = h - 165, top = h - 197;
  blocks(im, seedRows(PL, walk, h, 34, 52, 50, 92, 21), PL, walk, h, 0.62);
  blocks(im, seedRows(PL, top + 6, walk, 24, 26, 34, 60, 23), PL, top + 6, walk, 0.7);
  for (let x = 0; x < w; x++) for (let y = top; y < top + 6; y++) set(im, x, y, y === top + 5 || (x % 59) === 0 ? JOINT : mul(LIME, (y === top ? 1.25 : 1.02) * (0.95 + 0.1 * hash(x >> 2, 1, 12))));
  return im;
}
// Isodomic ashlar (towers, the megaron, gate faces): even courses 0.55 m, blocks 0.9-1.6 m, drafted margins.
function isodomic(w = 400, h = 200) {
  const im = blank(w, h), ch = 18;
  for (let y0 = h, r = 0; y0 > 0; r++, y0 -= ch) {
    const J = []; for (let x = PL * hash(r, 31), n = 0; n < 12; n++) { J.push(Math.round(x) % PL); x += 30 + 22 * hash(r, n, 32); if (x >= PL * hash(r, 31) + PL - 26) break; }
    J.sort((a, b) => a - b);
    for (let x = 0; x < w; x++) {
      const px = x % PL, bi = J.filter((j) => j <= px).length, f = 0.8 + 0.35 * hash(bi, r, 33), dj = Math.min(...J.map((j) => Math.min(Math.abs(px - j), PL - Math.abs(px - j))));
      for (let y = Math.max(0, y0 - ch); y < y0; y++) {
        let c = mul(LIME, f * (0.94 + 0.12 * hash(x >> 1, y >> 1, 34)));
        if (dj === 0 || y === y0 - ch) c = JOINT;
        else if (dj <= 2 || y <= y0 - ch + 2) c = mul(c, 1.15); else if (y >= y0 - 2) c = mul(c, 0.75);
        set(im, x, y, c);
      }
    }
  }
  return im;
}
// Terracotta roof (seen square on): courses of flat pan tiles 0.3 m deep, round cover tiles every 0.4 m, eaves at the bottom.
function rooftiles(w = 264, h = 264) { // courses 0.45 m (15 px), cover tiles every 0.5 m (16.5 px), lit from the left
  const im = blank(w, h), TC = hexToRgb('#7b4a36');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cy = y % 15, row = Math.floor(y / 15), px = x % 16.5, k = row * 31 + Math.floor(x / 16.5);
    let c = mul(TC, (0.8 + 0.35 * hash(k, 41)) * (1.05 - cy * 0.02));
    if (px >= 11) { const t = (px - 11) / 5.5; c = mul(TC, (0.75 + 0.35 * hash(k, 42)) * (t < 0.3 ? 1.45 : t < 0.65 ? 1.15 : 0.7)); } // the half-round cover tile
    else if (px < 1.5) c = mul(TC, 0.5); // shadow of the cover tile on its right
    if (cy >= 13) c = mul(c, 0.5); // course shadow
    set(im, x, y, c);
  }
  return im;
}
// Lion Gate front (4 m wide x 5.9 m): two monolithic jambs, a 2.8 m x 3.2 m opening, a massive lintel, above it the
// relieving triangle filled with a relief slab of two rampant lions at a column, ashlar round it, the parapet on top.
function liongate(w = 132, h = 196) {
  const im = isodomic(w, h), base = h, open = [20, 112], oTop = h - 106, lin = [oTop - 30, oTop];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= open[0] && x < open[1] && y >= oTop) { set(im, x, y, [0, 0, 0], 0); continue; }
    if ((x < open[0] || x >= open[1]) && y >= oTop - 2) set(im, x, y, mul(LIME, (x < open[0] ? 1.1 - x * 0.006 : 0.85) * (0.95 + 0.1 * hash(x >> 1, y >> 2, 51)))); // monolith jambs
    if ((x === open[0] - 1 || x === open[1]) && y >= oTop) set(im, x, y, JOINT);
    if (y >= lin[0] && y < lin[1] && x >= 6 && x < w - 6) set(im, x, y, y === lin[0] || y === lin[1] - 1 ? JOINT : mul(LIME, 1.05 * (0.95 + 0.1 * hash(x >> 2, y >> 1, 52)))); // lintel
    const ty = lin[0] - y;
    if (ty > 0 && ty < 54 && Math.abs(x - w / 2) < 46 - ty * 0.85) { // relieving triangle with the relief slab
      const ax = x - w / 2, a = Math.abs(ax);
      const lion = (a > 12 && a < 22 && ty > 2 && ty < 22) || Math.hypot((a - 13) / 9, (ty - 24) / 6) < 1 || Math.hypot((a - 7) / 4.5, (ty - 32) / 4.5) < 1; // hind legs, body, head
      const col = (a < 3.5 && ty > 2 && ty < 28) || (a < 6 && ty >= 28 && ty < 31);
      let c = mul(LIME, 0.55 + 0.06 * hash(x >> 1, y >> 1, 53));
      if (lion) c = mul(LIME, (ax < 0 ? 1.15 : 0.95) * (1 - (ty - 2) * 0.004)); if (col) c = mul(LIME, 1.2);
      if (Math.abs(Math.abs(ax) - (46 - ty * 0.85)) < 1.2) c = JOINT;
      set(im, x, y, c);
    }
  }
  return im;
}

for (const [name, im] of Object.entries({ palisade: palisade(), ashlar: ashlar(), arches: arches(), trestle: trestle(), cyclopean: cyclopean(), isodomic: isodomic(), rooftiles: rooftiles(), liongate: liongate() })) writeImage(join(OUT, `${name}.png`), im);
console.log('inits ->', OUT);
