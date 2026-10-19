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

for (const [name, im] of Object.entries({ palisade: palisade(), ashlar: ashlar(), arches: arches(), trestle: trestle() })) writeImage(join(OUT, `${name}.png`), im);
console.log('inits ->', OUT);
