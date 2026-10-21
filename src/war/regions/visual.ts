/**
 * The visual terrain layer of a region (RegionData.visual): the same land as the sim grid at twice
 * its resolution (1 m cells, 2 x 2 per sim tile), written by the generator from the same organic
 * shapes, so coasts and borders follow sub-tile curves. Visual only: the sim never reads it.
 * Each cell is one value z * 32 + kind (z = visual level, KINDS index), run-length encoded as
 * [value, count, value, count, ...] row-major. Impassable rock may stand far above the sim's 0..15
 * levels (up to ZVIS): mountains tower over the walkable ground (the renderer may draw it flat
 * under massif sprites instead, src/war/view/massifs.ts).
 * After the sim's terrains and water come the biome terrains (public/war/biomes/<name>/tiles.json):
 * drawn only with their biome's tile set (RegionData.biomes picks the set per tile).
 */
export const KINDS = [
  'grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt', 'shallow', 'deep',
  'scree', 'meadow', 'gravel', // mountains
  'dry', 'rossa', 'marble', 'grove', // elaia
  'dune', 'hardpan', 'redrock', 'reg', 'salt', 'oasis', // kyrene
  'paving', // W-48 landmark streets and plazas (flagstones; sim terrain road)
  'drift', 'rubble', 'ruin', // W-51 tile-art: snow drifted on rock (mountains), mudbrick rubble (kyrene), fallen stone (elaia)
] as const;
export type VisualKind = (typeof KINDS)[number];
/** Highest visual level. */
export const ZVIS = 44;

export function encodeVisual(kind: ArrayLike<number>, z: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < kind.length; i++) {
    const v = z[i] * 32 + kind[i];
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
    kind.fill(v & 31, i, end);
    z.fill(v >> 5, i, end);
    i = end;
  }
  if (i !== n) throw new Error(`visual layer has ${i} cells, expected ${n}`);
  return { kind, z };
}

/**
 * The biome layer of a region (RegionData.biomes): per sim tile an index into `names`, run-length
 * encoded as [value, count, ...] row-major. A name without a library under public/war/biomes/
 * ('global') draws with the global set only.
 */
export function encodeBiomes(idx: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < idx.length; i++) {
    if (out.length && out[out.length - 2] === idx[i]) out[out.length - 1]++;
    else out.push(idx[i], 1);
  }
  return out;
}

export function decodeBiomes(rle: number[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let i = 0;
  for (let k = 0; k < rle.length; k += 2) {
    const end = Math.min(n, i + rle[k + 1]);
    out.fill(rle[k], i, end);
    i = end;
  }
  if (i !== n) throw new Error(`biome layer has ${i} tiles, expected ${n}`);
  return out;
}
