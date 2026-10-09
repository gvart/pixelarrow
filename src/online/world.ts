/**
 * The seasonal world of a shard (docs/DESIGN_V2.md "Engine"): a graph of
 * hand-authored regions built from a map JSON (src/online/maps/, format in
 * ./mapSchema.ts). Every location online is an integer `loc` = region id.
 * Pure and deterministic; shared by the client and the Worker.
 *
 * Static facts of a region (kind, tier, battlefield, coast, ...) come from
 * the map; D1 only keeps regions whose state changed (owner, garrison, NPC
 * losses), keyed by (season, shard, loc).
 */
import type { BattleSite } from '../world/battlefield';
import { decodeMask, decodeTerrain, parseMap, TERRAINS, type MapEdge, type MapJson, type RegionKind, type Tier } from './mapSchema';
import test30 from './maps/test30.json';
import westmed from './maps/westmed.json';

export interface RegionInfo {
  id: number;
  name: string;
  kind: RegionKind;
  tier: Tier;
  /** Battlefield of fights here. */
  site: BattleSite;
  /** Armies may enter (everything but the sea). */
  passable: boolean;
  /** Touches the sea (or has a naval route). */
  coast: boolean;
  fort: boolean;
  capital: boolean;
  /** A town or a capital (a merchant, the marketplace). */
  town: boolean;
  spawn: boolean;
  campPlot: boolean;
  revealPan: boolean;
  /** Where its name is drawn and armies stand (map pixels). */
  label: [number, number];
  /** 0 at the spawn plots .. 1 the furthest from any spawn (neutrals get stronger with depth). */
  depth: number;
}

export interface WorldPath {
  /** Locs from start to goal, both included. */
  path: number[];
  /** Sum of the edge minutes. */
  minutes: number;
}

const SEA_SITE: BattleSite = { base: 'beach', river: false, coast: true, rocky: false, woods: 0 };

export class WorldGraph {
  readonly id: string;
  readonly map: MapJson;
  /** Map size in map pixels. */
  readonly width: number;
  readonly height: number;
  private readonly infos = new Map<number, RegionInfo>();
  private readonly list: RegionInfo[];
  private readonly adj = new Map<number, number[]>();
  private readonly edges = new Map<string, MapEdge>();
  private maskCache: Int32Array | null = null;

  constructor(map: MapJson) {
    this.map = map;
    this.id = map.id;
    this.width = map.w * map.cell;
    this.height = map.h * map.cell;
    for (const r of map.regions) this.adj.set(r.id, []);
    for (const e of map.edges) {
      this.adj.get(e.a)?.push(e.b);
      this.adj.get(e.b)?.push(e.a);
      this.edges.set(edgeKey(e.a, e.b), e);
    }
    for (const l of this.adj.values()) l.sort((a, b) => a - b);
    // coast: a region touching sea water (or a sea region) in the mask, or with a naval route
    const mask = this.mask();
    const terrain = decodeTerrain(map);
    const water = new Set([TERRAINS.indexOf('sea'), TERRAINS.indexOf('shelf')]);
    const seaRegion = new Set(map.regions.filter((r) => r.kind === 'sea').map((r) => r.id));
    const coast = new Set<number>();
    for (const e of map.edges) if (e.naval) coast.add(e.a), coast.add(e.b);
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        const a = mask[i];
        if (!a || seaRegion.has(a)) continue;
        for (const j of [x > 0 ? i - 1 : -1, x + 1 < map.w ? i + 1 : -1, y > 0 ? i - map.w : -1, y + 1 < map.h ? i + map.w : -1]) {
          if (j < 0) continue;
          if (seaRegion.has(mask[j]) || (mask[j] !== a && water.has(terrain[j]))) coast.add(a);
        }
      }
    // depth: hops from the nearest spawn plot
    const hopsFromSpawn = this.bfs(map.regions.filter((r) => r.spawn).map((r) => r.id));
    const maxHops = Math.max(1, ...[...hopsFromSpawn.values()]);
    for (const r of map.regions) {
      const info: RegionInfo = {
        id: r.id,
        name: r.name,
        kind: r.kind,
        tier: r.tier,
        site: { ...(r.site ?? SEA_SITE) },
        passable: r.kind !== 'sea',
        coast: coast.has(r.id),
        fort: r.kind === 'fort',
        capital: r.kind === 'capital',
        town: r.kind === 'town' || r.kind === 'capital',
        spawn: !!r.spawn,
        campPlot: !!r.campPlot,
        revealPan: !!r.revealPan,
        label: [r.label[0], r.label[1]],
        depth: r.kind === 'sea' ? 0 : Math.min(1, (hopsFromSpawn.get(r.id) ?? maxHops) / maxHops),
      };
      this.infos.set(r.id, info);
    }
    this.list = [...this.infos.values()].sort((a, b) => a.id - b.id);
  }

  /** Every region (sea included), by id. */
  all(): readonly RegionInfo[] {
    return this.list;
  }

  has(id: number): boolean {
    return this.infos.has(id);
  }

  /** Static facts of a region; throws for an unknown id. */
  info(id: number): RegionInfo {
    const r = this.infos.get(id);
    if (!r) throw new Error(`no region ${id} on map ${this.id}`);
    return r;
  }

  /** Is there a route (edge) between a and b? */
  adjacent(a: number, b: number): boolean {
    return this.edges.has(edgeKey(a, b));
  }

  /** The edge between a and b, if any. */
  edge(a: number, b: number): MapEdge | undefined {
    return this.edges.get(edgeKey(a, b));
  }

  /** Regions one route away (sorted by id). */
  neighbours(id: number): readonly number[] {
    return this.adj.get(id) ?? [];
  }

  /** Every region at most `hops` routes from `id` (itself included), nearest first. */
  within(id: number, hops: number): number[] {
    if (!this.has(id)) return [];
    return [...this.bfs([id], hops).keys()];
  }

  /** Routes between a and b (fewest edges); Infinity when unconnected. */
  hops(a: number, b: number): number {
    if (a === b) return this.has(a) ? 0 : Infinity;
    return this.bfs([a], Infinity, b).get(b) ?? Infinity;
  }

  /**
   * Quickest route (Dijkstra on edge minutes) from `from` to `to` through
   * passable regions that `ok` allows (the goal too; not the start). null
   * when there is none.
   */
  path(from: number, to: number, ok: (r: RegionInfo) => boolean = () => true): WorldPath | null {
    if (!this.has(from) || !this.has(to)) return null;
    if (from === to) return { path: [from], minutes: 0 };
    const goal = this.info(to);
    if (!goal.passable || !ok(goal)) return null;
    const dist = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>();
    const done = new Set<number>();
    const open: { id: number; d: number }[] = [{ id: from, d: 0 }];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d || (open[i].d === open[bi].d && open[i].id < open[bi].id)) bi = i;
      const { id, d } = open.splice(bi, 1)[0];
      if (done.has(id)) continue;
      done.add(id);
      if (id === to) break;
      for (const n of this.neighbours(id)) {
        if (done.has(n)) continue;
        const ni = this.info(n);
        if (!ni.passable || !ok(ni)) continue;
        const nd = d + this.edge(id, n)!.minutes;
        if (nd < (dist.get(n) ?? Infinity)) {
          dist.set(n, nd);
          prev.set(n, id);
          open.push({ id: n, d: nd });
        }
      }
    }
    if (!done.has(to)) return null;
    const path = [to];
    while (path[path.length - 1] !== from) path.push(prev.get(path[path.length - 1])!);
    path.reverse();
    return { path, minutes: dist.get(to)! };
  }

  /** Minutes along one route (Infinity when not adjacent). */
  minutes(a: number, b: number): number {
    return this.edge(a, b)?.minutes ?? Infinity;
  }

  /** Where a region's armies stand and its name is drawn (map pixels). */
  pos(id: number): { x: number; y: number } {
    const l = this.info(id).label;
    return { x: l[0], y: l[1] };
  }

  /** The region under a map pixel point (0: none). */
  regionAt(x: number, y: number): number {
    const cx = Math.floor(x / this.map.cell);
    const cy = Math.floor(y / this.map.cell);
    if (cx < 0 || cy < 0 || cx >= this.map.w || cy >= this.map.h) return 0;
    return this.mask()[cy * this.map.w + cx];
  }

  /** Decoded region id per mask cell (row-major). */
  mask(): Int32Array {
    if (!this.maskCache) this.maskCache = decodeMask(this.map);
    return this.maskCache;
  }

  capitals(): number[] {
    return this.list.filter((r) => r.capital).map((r) => r.id);
  }

  spawns(): number[] {
    return this.list.filter((r) => r.spawn).map((r) => r.id);
  }

  /** Hops from the nearest of `sources` (multi-source BFS), up to `max`; stops early at `stop`. */
  private bfs(sources: number[], max = Infinity, stop?: number): Map<number, number> {
    const d = new Map<number, number>();
    const queue: number[] = [];
    for (const s of sources) if (this.adj.has(s) && !d.has(s)) d.set(s, 0), queue.push(s);
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const dc = d.get(cur)!;
      if (cur === stop) break;
      if (dc >= max) continue;
      for (const n of this.adj.get(cur) ?? []) if (!d.has(n)) d.set(n, dc + 1), queue.push(n);
    }
    return d;
  }
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ------------------------------------------------------------------ map registry

/**
 * Season maps bundled with the game (src/online/maps/*.json). Add a map by
 * importing its JSON here; the newest season map becomes the default.
 */
const MAPS: Record<string, unknown> = { test30, westmed };

/** The map new shards get. */
export const DEFAULT_MAP_ID: string = 'westmed' in MAPS ? 'westmed' : 'test30';

const graphs = new Map<string, WorldGraph>();

export function mapIds(): string[] {
  return Object.keys(MAPS);
}

export function hasMap(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MAPS, id);
}

/** The world graph of a bundled map (validated once, cached); throws for an unknown id. */
export function getMap(id: string = DEFAULT_MAP_ID): WorldGraph {
  let g = graphs.get(id);
  if (g) return g;
  if (!hasMap(id)) throw new Error(`unknown map ${id}`);
  g = new WorldGraph(parseMap(MAPS[id]));
  graphs.set(id, g);
  return g;
}
