/**
 * A small built-in greybox region for the sandbox when `src/war/regions/<id>.json` is missing:
 * hills and a ridge, a north-south river with a ford and a road across it, forest patches,
 * sand banks, marsh in the low ground, rock on the peaks, entry bands on W and E.
 */
import type { RegionData, TerrainKind, WaterKind } from '../types';

/** Smooth value noise in 0..1 (bilinear over a hashed lattice). */
function noise(x: number, y: number, seed: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

export function fakeRegion(w = 160, h = 112): RegionData {
  const height: number[] = [], terrain: TerrainKind[] = [], water: WaterKind[] = [];
  const hills = [
    { x: 40, y: 30, r: 22, a: 6.5 },
    { x: 118, y: 78, r: 26, a: 7.5 },
    { x: 125, y: 24, r: 14, a: 4 },
    { x: 30, y: 88, r: 16, a: 3.5 },
  ];
  // the river's centre line x(y), and a ford where the road crosses
  const riverX = (y: number) => 80 + Math.sin(y / 14) * 9 + Math.sin(y / 5.3) * 2;
  const fordY = 56;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let e = 0.8 + noise(x / 9, y / 9, 1) * 1.4;
      for (const k of hills) e += k.a * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (k.r * k.r));
      // a ridge running SW-NE from the west hill, cut by a narrow pass
      const d = Math.abs((x - 20) * 0.6 - (y - 70) * -0.8) / 1;
      if (x > 14 && x < 70 && Math.abs(x - 46) > 2) e += Math.max(0, 3.2 - d * 0.55);
      const dx = Math.abs(x - riverX(y));
      e *= Math.min(1, 0.25 + dx / 14); // the valley
      let hgt = Math.max(0, Math.min(7, Math.floor(e)));
      let wtr: WaterKind = 0;
      const ford = Math.abs(y - fordY) <= 2;
      if (dx < 1.8) wtr = ford ? 1 : 2;
      else if (dx < 3) wtr = 1;
      if (wtr) hgt = 0;
      let t: TerrainKind = 'grass';
      const n = noise(x / 6, y / 6, 7);
      if (wtr) t = dx < 3 ? 'sand' : 'grass';
      else if (dx < 4.5) t = 'sand';
      else if (hgt >= 6) t = 'rock';
      else if (hgt <= 1 && n > 0.62) t = 'marsh';
      else if (n < 0.3 && hgt >= 1 && hgt <= 4) t = 'forest';
      else if (noise(x / 3, y / 3, 3) > 0.82) t = 'dirt';
      if (Math.abs(y - fordY) <= 0 && !(wtr === 2)) t = 'road';
      height.push(hgt);
      terrain.push(t);
      water.push(wtr);
    }
  }
  return {
    id: 'fake',
    name: 'Fake valley',
    w,
    h,
    height,
    terrain,
    water,
    entries: [
      { side: 'W', x: 0, y: 46, w: 6, h: 20 },
      { side: 'E', x: w - 6, y: 46, w: 6, h: 20 },
    ],
    noBuild: [
      { x: 0, y: 40, w: 14, h: 32 },
      { x: w - 14, y: 40, w: 14, h: 32 },
    ],
  };
}
