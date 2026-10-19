/**
 * Map objects that block movement, by id, with their footprint in tiles (x, y): the sim's copy of
 * `blocksMovement` / `footprint` in public/war/objects/objects.json (tests/war/objects.test.ts keeps
 * them equal). Other objects (trees, bushes, reeds) are walkable.
 */
export const OBJECT_BLOCKS: Record<string, readonly [number, number]> = {
  'boulder-a': [1, 1],
  'boulder-b': [1, 1],
  'wall-ruin': [2, 1],
  watchtower: [2, 2],
};

/** The tiles an object with footprint (fw, fh) centred on its foot point (x, y) covers. */
export function footprintTiles(x: number, y: number, [fw, fh]: readonly [number, number]): [number, number][] {
  const x0 = Math.round(x - fw / 2), y0 = Math.round(y - fh / 2), out: [number, number][] = [];
  for (let ty = y0; ty < y0 + fh; ty++) for (let tx = x0; tx < x0 + fw; tx++) out.push([tx, ty]);
  return out;
}
