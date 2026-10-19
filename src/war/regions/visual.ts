/**
 * The visual terrain layer of a region (RegionData.visual): the same land as the sim grid at twice
 * its resolution (1 m cells, 2 x 2 per sim tile), written by the generator from the same organic
 * shapes, so coasts and borders follow sub-tile curves. Visual only: the sim never reads it.
 * Each cell is one value z * 16 + kind (z = visual level, KINDS index), run-length encoded as
 * [value, count, value, count, ...] row-major. Impassable rock may stand far above the sim's 0..7
 * levels (up to ZVIS): mountains tower over the walkable ground.
 */
export const KINDS = ['grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt', 'shallow', 'deep'] as const;
export type VisualKind = (typeof KINDS)[number];
/** Highest visual level. */
export const ZVIS = 44;

export function encodeVisual(kind: ArrayLike<number>, z: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < kind.length; i++) {
    const v = z[i] * 16 + kind[i];
    if (out.length && out[out.length - 2] === v) out[out.length - 1]++;
    else out.push(v, 1);
  }
  return out;
}

export function decodeVisual(rle: number[], n: number): { kind: Uint8Array; z: Uint8Array } {
  const kind = new Uint8Array(n), z = new Uint8Array(n);
  let i = 0;
  for (let k = 0; k < rle.length; k += 2) {
    const v = rle[k], end = Math.min(n, i + rle[k + 1]);
    kind.fill(v & 15, i, end);
    z.fill(v >> 4, i, end);
    i = end;
  }
  if (i !== n) throw new Error(`visual layer has ${i} cells, expected ${n}`);
  return { kind, z };
}
