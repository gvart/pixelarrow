/**
 * Season map JSON (docs/MAP_V3.md "Data model"): the format of
 * `src/online/maps/<mapId>.json`, its RLE helpers and the validator. Pure TS,
 * shared by the client, the Worker and scripts/buildMap.ts.
 *
 * Layout: a hidden square grid of `w` x `h` cells, each `cell` map pixels
 * wide. Map pixel coordinates (labels, waypoints) run 0..w*cell, 0..h*cell.
 *
 * - `mask`: RLE of the region id of every cell, row-major (0 = no region).
 * - `terrain`: RLE of the terrain index (TERRAINS) of every cell, row-major.
 *   RLE = a flat number array of pairs `[run, value, run, value, ...]`; the
 *   runs add up to w * h.
 * - `regions`: every region (land plots, towns, forts, capitals, lairs,
 *   trading posts and sea areas). Region ids are integers >= 1 and are the
 *   `loc` of everything online.
 * - `edges`: the routes between regions armies can travel (undirected). Sea
 *   regions are impassable and have no edges; ships cross the sea on `naval`
 *   edges between two coastal regions. `waypoints` (map pixels) draw the
 *   dotted route: the first lies in region `a`, the last in region `b`.
 */
import { SITE_BASES, type BattleSite } from '../world/battlefield';

export const TERRAINS = ['sea', 'shelf', 'sand', 'land', 'forest', 'hills', 'mountain', 'marsh'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const REGION_KINDS = ['plot', 'town', 'fort', 'capital', 'sea', 'lair', 'post'] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

export type Tier = 1 | 2 | 3 | 4 | 5;

export interface MapRegion {
  id: number;
  name: string;
  kind: RegionKind;
  /** NPC strength / income class 1..5. */
  tier: Tier;
  /** Battlefield of fights here (src/world/battlefield). Optional for sea regions. */
  site?: BattleSite;
  /** A plot where new players may start (kind 'plot'). */
  spawn?: boolean;
  /** A coastal plot that may hold a forward camp. */
  campPlot?: boolean;
  /** Where the name is drawn and armies stand (map pixels). */
  label: [number, number];
  /** Pan the camera here when the region is first revealed. */
  revealPan?: boolean;
}

export interface MapEdge {
  a: number;
  b: number;
  /** March time along the edge. */
  minutes: number;
  /** A sea crossing (ships). */
  naval?: boolean;
  /** Polyline of the dotted route, map pixels: first in region a, last in region b. */
  waypoints: [number, number][];
}

export interface MapJson {
  id: string;
  version: number;
  /** Size of a mask cell in map pixels. */
  cell: number;
  w: number;
  h: number;
  /** RLE [run, regionId, ...] row-major (0 = no region). */
  mask: number[];
  /** RLE [run, terrainIndex, ...] row-major (index into TERRAINS). */
  terrain: number[];
  regions: MapRegion[];
  edges: MapEdge[];
}

// ------------------------------------------------------------------ RLE

/** Run-length encodes values into [run, value, run, value, ...]. */
export function rleEncode(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    let n = 1;
    while (i + n < values.length && values[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return out;
}

/** Decodes [run, value, ...] into `length` values; throws when the runs do not add up. */
export function rleDecode(rle: readonly number[], length: number): Int32Array {
  if (rle.length % 2 !== 0) throw new Error('RLE must have an even number of entries');
  const out = new Int32Array(length);
  let at = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const n = rle[i];
    const v = rle[i + 1];
    if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(v)) throw new Error(`bad RLE pair at ${i}`);
    if (at + n > length) throw new Error(`RLE runs exceed ${length}`);
    out.fill(v, at, at + n);
    at += n;
  }
  if (at !== length) throw new Error(`RLE runs cover ${at} of ${length}`);
  return out;
}

/** The region id of every cell (row-major). */
export function decodeMask(m: Pick<MapJson, 'mask' | 'w' | 'h'>): Int32Array {
  return rleDecode(m.mask, m.w * m.h);
}

/** The terrain index (into TERRAINS) of every cell (row-major). */
export function decodeTerrain(m: Pick<MapJson, 'terrain' | 'w' | 'h'>): Uint8Array {
  return Uint8Array.from(rleDecode(m.terrain, m.w * m.h));
}

/** The cell of a map pixel point, or -1 outside the grid. */
export function cellAt(m: Pick<MapJson, 'cell' | 'w' | 'h'>, x: number, y: number): number {
  const cx = Math.floor(x / m.cell);
  const cy = Math.floor(y / m.cell);
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return -1;
  return cy * m.w + cx;
}

// ------------------------------------------------------------------ validation

export interface ValidateOptions {
  /** Fewest spawn plots (default 1). */
  minSpawns?: number;
}

/**
 * Checks a map: shape of every field, RLE sizes, ids, edges (known land
 * regions, no duplicates, waypoints starting in `a` and ending in `b`), every
 * region present in the mask, all land connected, spawns on plots. Returns the
 * problems found (empty = valid).
 */
export function validateMap(raw: unknown, opts: ValidateOptions = {}): string[] {
  const errs: string[] = [];
  const m = raw as MapJson;
  if (!m || typeof m !== 'object') return ['map is not an object'];
  if (typeof m.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(m.id)) errs.push('id must be a short lowercase string');
  if (!Number.isInteger(m.version) || m.version < 1) errs.push('version must be an integer >= 1');
  for (const k of ['cell', 'w', 'h'] as const) if (!Number.isInteger(m[k]) || m[k] < 1 || m[k] > 4096) errs.push(`${k} must be an integer 1..4096`);
  if (!Array.isArray(m.regions) || !Array.isArray(m.edges) || !Array.isArray(m.mask) || !Array.isArray(m.terrain)) {
    errs.push('mask, terrain, regions and edges must be arrays');
    return errs;
  }
  if (errs.length) return errs;
  const W = m.w * m.cell;
  const H = m.h * m.cell;
  const inside = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)) && p[0] >= 0 && p[1] >= 0 && p[0] <= W && p[1] <= H;

  let mask: Int32Array | null = null;
  try {
    mask = decodeMask(m);
  } catch (e) {
    errs.push(`mask: ${(e as Error).message}`);
  }
  try {
    const t = decodeTerrain(m);
    if (t.some((v) => v >= TERRAINS.length)) errs.push('terrain: index out of range');
  } catch (e) {
    errs.push(`terrain: ${(e as Error).message}`);
  }

  const byId = new Map<number, MapRegion>();
  for (const r of m.regions) {
    const at = `region ${r?.id}`;
    if (!r || !Number.isInteger(r.id) || r.id < 1) {
      errs.push(`${at}: id must be an integer >= 1`);
      continue;
    }
    if (byId.has(r.id)) errs.push(`${at}: duplicate id`);
    byId.set(r.id, r);
    if (typeof r.name !== 'string' || !r.name.length || r.name.length > 60) errs.push(`${at}: name must be 1..60 chars`);
    if (!(REGION_KINDS as readonly string[]).includes(r.kind)) errs.push(`${at}: unknown kind ${r.kind}`);
    if (!Number.isInteger(r.tier) || r.tier < 1 || r.tier > 5) errs.push(`${at}: tier must be 1..5`);
    if (!inside(r.label)) errs.push(`${at}: label must be [x, y] inside the map`);
    if (r.kind !== 'sea') {
      const s = r.site;
      if (!s || !SITE_BASES.includes(s.base) || typeof s.river !== 'boolean' || typeof s.coast !== 'boolean' || typeof s.rocky !== 'boolean' || typeof s.woods !== 'number' || s.woods < 0 || s.woods > 1)
        errs.push(`${at}: site must be { base, river, coast, rocky, woods 0..1 }`);
    }
    if (r.spawn && r.kind !== 'plot') errs.push(`${at}: only plots can be spawns`);
    for (const f of ['spawn', 'campPlot', 'revealPan'] as const) if (r[f] !== undefined && typeof r[f] !== 'boolean') errs.push(`${at}: ${f} must be boolean`);
  }

  if (mask) {
    const cells = new Map<number, number>();
    for (const v of mask) if (v !== 0) cells.set(v, (cells.get(v) ?? 0) + 1);
    for (const id of cells.keys()) if (!byId.has(id)) errs.push(`mask: unknown region ${id}`);
    for (const r of byId.values()) if (!cells.has(r.id)) errs.push(`region ${r.id}: no cells in the mask`);
  }

  const seen = new Set<string>();
  const adj = new Map<number, number[]>();
  m.edges.forEach((e, i) => {
    const at = `edge ${i} (${e?.a}-${e?.b})`;
    const a = byId.get(e?.a);
    const b = byId.get(e?.b);
    if (!a || !b) {
      errs.push(`${at}: unknown region`);
      return;
    }
    if (e.a === e.b) {
      errs.push(`${at}: loops to itself`);
      return;
    }
    if (a.kind === 'sea' || b.kind === 'sea') errs.push(`${at}: sea regions have no edges (use a naval edge between coasts)`);
    const k = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
    if (seen.has(k)) errs.push(`${at}: duplicate`);
    seen.add(k);
    if (typeof e.minutes !== 'number' || !Number.isFinite(e.minutes) || e.minutes <= 0) errs.push(`${at}: minutes must be > 0`);
    if (e.naval !== undefined && typeof e.naval !== 'boolean') errs.push(`${at}: naval must be boolean`);
    if (!Array.isArray(e.waypoints) || !e.waypoints.every(inside)) errs.push(`${at}: waypoints must be [x, y] points inside the map`);
    else if (mask && e.waypoints.length) {
      const first = e.waypoints[0];
      const last = e.waypoints[e.waypoints.length - 1];
      if (mask[cellAt(m, first[0], first[1])] !== e.a) errs.push(`${at}: first waypoint is not in region ${e.a}`);
      if (mask[cellAt(m, last[0], last[1])] !== e.b) errs.push(`${at}: last waypoint is not in region ${e.b}`);
    }
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]);
  });

  // All land is one connected network.
  const land = [...byId.values()].filter((r) => r.kind !== 'sea');
  if (land.length) {
    const reach = new Set<number>([land[0].id]);
    const queue = [land[0].id];
    while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!reach.has(n)) reach.add(n), queue.push(n);
    const cut = land.filter((r) => !reach.has(r.id));
    if (cut.length) errs.push(`land is not connected: ${cut.slice(0, 8).map((r) => r.id).join(', ')}${cut.length > 8 ? '...' : ''} unreachable`);
  }
  const spawns = land.filter((r) => r.spawn).length;
  if (spawns < (opts.minSpawns ?? 1)) errs.push(`needs at least ${opts.minSpawns ?? 1} spawn plots (has ${spawns})`);
  if (!land.some((r) => r.kind === 'capital')) errs.push('needs at least one capital');
  return errs;
}

/** Validates and returns the map typed; throws with every problem otherwise. */
export function parseMap(raw: unknown, opts?: ValidateOptions): MapJson {
  const errs = validateMap(raw, opts);
  if (errs.length) throw new Error(`invalid map: ${errs.slice(0, 20).join('; ')}`);
  return raw as MapJson;
}
