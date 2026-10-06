/** Deterministic hash noise for world generation (no Math.random, no Phaser). */

export function hash3(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise2(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash3(ix, iy, seed);
  const b = hash3(ix + 1, iy, seed);
  const c = hash3(ix, iy + 1, seed);
  const d = hash3(ix + 1, iy + 1, seed);
  const u = s(tx);
  const v = s(ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1). */
export function fbm(x: number, y: number, scale: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let sc = scale;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x, y, sc, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    sc /= 2;
  }
  return sum / norm;
}
