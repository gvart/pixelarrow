/**
 * Greybox terrain baked into canvases: the base map in 16 px-per-tile chunks (terrain tint,
 * height shading with a NW light, contour lines between height levels, cliffs heavier, water
 * shallow vs deep), and the overlays at 1 px per tile (scaled up with nearest filtering).
 */
import type { RegionData, TerrainKind } from '../types';

export const TILE = 16;
export const CHUNK = 32; // tiles per chunk side

const TINT: Record<TerrainKind, [number, number, number]> = {
  grass: [118, 140, 84], forest: [62, 96, 58], sand: [196, 180, 128], marsh: [98, 112, 84],
  rock: [128, 122, 116], road: [168, 146, 108], snow: [226, 228, 232], dirt: [140, 118, 86],
};
const SHALLOW: [number, number, number] = [98, 150, 170];
const DEEP: [number, number, number] = [44, 82, 120];

/** Movement cost for the overlay (Infinity = impassable); a view-side guess until the sim exports one. */
export function moveCost(r: RegionData, i: number): number {
  if (r.water[i] === 2 || r.terrain[i] === 'rock') return Infinity;
  if (r.water[i] === 1) return 2.5;
  return { road: 0.7, grass: 1, dirt: 1, snow: 1.5, sand: 1.5, forest: 2, marsh: 2.5, rock: Infinity }[r.terrain[i]];
}

/** One chunk of the base map, cx/cy in chunks. */
export function bakeChunk(r: RegionData, cx: number, cy: number): HTMLCanvasElement {
  const tw = Math.min(CHUNK, r.w - cx * CHUNK), th = Math.min(CHUNK, r.h - cy * CHUNK);
  const cv = document.createElement('canvas');
  cv.width = tw * TILE;
  cv.height = th * TILE;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(cv.width, cv.height), px = img.data;
  const H = (x: number, y: number) => r.height[Math.max(0, Math.min(r.h - 1, y)) * r.w + Math.max(0, Math.min(r.w - 1, x))];
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const x = cx * CHUNK + tx, y = cy * CHUNK + ty, i = y * r.w + x, h = r.height[i];
      const wtr = r.water[i];
      const base = wtr === 2 ? DEEP : wtr === 1 ? SHALLOW : TINT[r.terrain[i]];
      // light from the NW: brighter where the ground rises toward the SE, plus altitude lift
      const slope = H(x + 1, y + 1) - H(x - 1, y - 1);
      const k = wtr ? 1 : 0.78 + h * 0.055 - slope * 0.07;
      // contours on the edges toward lower ground: 1 px per level step, 2 px + darker for a cliff
      const dn = [h - H(x, y - 1), h - H(x + 1, y), h - H(x, y + 1), h - H(x - 1, y)];
      for (let py = 0; py < TILE; py++) {
        for (let pxl = 0; pxl < TILE; pxl++) {
          let m = k;
          const edge = [py, TILE - 1 - pxl, TILE - 1 - py, pxl];
          for (let s = 0; s < 4; s++) {
            if (dn[s] >= 2 && edge[s] < 2) m = Math.min(m, 0.32);
            else if (dn[s] === 1 && edge[s] < 1) m = Math.min(m, k * 0.62);
          }
          if (r.terrain[i] === 'forest' && !wtr && ((pxl * 7 + py * 13 + x * 5 + y * 3) % 11 === 0)) m *= 0.7; // canopy speckle
          const o = ((ty * TILE + py) * cv.width + tx * TILE + pxl) * 4;
          px[o] = Math.min(255, base[0] * m);
          px[o + 1] = Math.min(255, base[1] * m);
          px[o + 2] = Math.min(255, base[2] * m);
          px[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** A 1 px-per-tile overlay: 'height' (blue low to red high) or 'cost' (green cheap to red, black blocked). */
export function bakeOverlay(r: RegionData, kind: 'height' | 'cost'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = r.w;
  cv.height = r.h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(r.w, r.h), px = img.data;
  for (let i = 0; i < r.w * r.h; i++) {
    let c: [number, number, number];
    if (kind === 'height') {
      const t = r.height[i] / 7;
      c = [255 * t, 80 + 60 * Math.sin(t * Math.PI), 255 * (1 - t)];
    } else {
      const m = moveCost(r, i);
      c = m === Infinity ? [0, 0, 0] : [Math.min(255, (m - 0.7) * 140), Math.max(0, 230 - (m - 0.7) * 100), 40];
    }
    px.set([c[0], c[1], c[2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
