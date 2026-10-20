/**
 * Compact region JSON (the generator's output for the 37 world regions; test-ridge keeps the plain layers):
 *  - `cells`: the sim layers as one run-length list [value, count, ...] row-major, value = height | terrain << 3 | water << 6
 *    (terrain as an index into TERRAIN);
 *  - `objs`: the objects as `ids` plus `data` triples [id index, dp, shade], where p = round(y * 10) * 10240 + round(x * 10) is
 *    the foot point in tenths of a tile, sent as the difference to the previous object's p, and shade is 0 (none) or
 *    round(shade * 100) + 1.
 * `expandRegion` turns either back into the plain RegionData fields before validation. Pure, no DOM, no extensionless imports.
 */
export const TERRAIN = ['grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt'] as const;
const P = 10240;

export function encodeCells(height: ArrayLike<number>, terrain: ArrayLike<string>, water: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < height.length; i++) {
    const t = TERRAIN.indexOf(terrain[i] as (typeof TERRAIN)[number]);
    if (t < 0) throw new Error(`unknown terrain ${terrain[i]} at ${i}`);
    const v = height[i] | (t << 3) | (water[i] << 6);
    if (out.length && out[out.length - 2] === v) out[out.length - 1]++;
    else out.push(v, 1);
  }
  return out;
}

export function decodeCells(rle: number[], n: number): { height: number[]; terrain: string[]; water: number[] } {
  const height = new Array<number>(n), terrain = new Array<string>(n), water = new Array<number>(n);
  let i = 0;
  for (let k = 0; k < rle.length; k += 2) {
    const v = rle[k], end = Math.min(n, i + rle[k + 1]);
    height.fill(v & 7, i, end);
    terrain.fill(TERRAIN[(v >> 3) & 7], i, end);
    water.fill(v >> 6, i, end);
    i = end;
  }
  if (i !== n) throw new Error(`cells have ${i} tiles, expected ${n}`);
  return { height, terrain, water };
}

export interface Obj { id: string; x: number; y: number; shade?: number }

export function encodeObjects(objects: Obj[]): { ids: string[]; data: number[] } {
  const ids: string[] = [], ix = new Map<string, number>(), data: number[] = [];
  let prev = 0;
  for (const o of objects) {
    let k = ix.get(o.id);
    if (k === undefined) ix.set(o.id, (k = ids.push(o.id) - 1));
    const p = Math.round(o.y * 10) * P + Math.round(o.x * 10);
    data.push(k, p - prev, o.shade === undefined ? 0 : Math.round(o.shade * 100) + 1);
    prev = p;
  }
  return { ids, data };
}

export function decodeObjects(c: { ids: string[]; data: number[] }): Obj[] {
  const out: Obj[] = [];
  let p = 0;
  for (let k = 0; k + 2 < c.data.length; k += 3) {
    p += c.data[k + 1];
    const o: Obj = { id: c.ids[c.data[k]], x: (p % P) / 10, y: Math.floor(p / P) / 10 };
    if (c.data[k + 2]) o.shade = (c.data[k + 2] - 1) / 100;
    out.push(o);
  }
  return out;
}

/** Plain RegionData fields from compact JSON (`cells`, `objs`); plain JSON passes through unchanged. */
export function expandRegion(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  const r = json as Record<string, unknown> & { w?: number; h?: number; cells?: { rle: number[] }; objs?: { ids: string[]; data: number[] } };
  if (!r.cells && !r.objs) return json;
  const { cells, objs, ...rest } = r;
  return { ...rest, ...(cells ? decodeCells(cells.rle, (r.w ?? 0) * (r.h ?? 0)) : {}), ...(objs ? { objects: decodeObjects(objs) } : {}) };
}
