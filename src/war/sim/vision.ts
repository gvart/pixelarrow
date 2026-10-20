/**
 * Fog of war (W-39): per-team vision on a coarse grid of VISION.cell x VISION.cell tiles, recomputed every VISION.every
 * ticks. Deterministic (no rng, fixed iteration order).
 *
 * Viewers: living units (radius by class: archers and slingers, scouts further), standing buildings of the team (towers
 * far, walls a little), lit braziers. A burning building lights its surroundings for every team (no line of sight).
 * Sight runs as rays from the viewer's cell to every cell on the rim of its square: a cell is seen when its top
 * (height + VISION.target) clears the steepest slope met so far along the ray (ridges, cliffs, raised walls block), and
 * the distance plus VISION.forest per forest cell crossed stays within the radius; looking down adds VISION.high tiles
 * per level of drop (up to VISION.highCap).
 *
 * Incremental: viewers are grouped by key (their cell and radius), each key's cells are counted into the team's grid
 * once; a key is recomputed only when it first appears (a unit stepped into a new cell), and dropped when nobody holds it.
 * Height changes (walls going up or falling) are polled every VISION.heightEvery ticks and recompute everything.
 *
 * Per team: state per cell (FOG_UNEXPLORED / FOG_EXPLORED / FOG_VISIBLE), version bumped on any change, and the last-seen
 * snapshot of every foreign building (refreshed while any of its cells is visible, forgotten when seen gone).
 */
import type { BuildingSnap, BuildingType, FogGrid } from '../types';
import { warStats } from './classes';
import { FOREST, type Grid } from './grid';
import { MOB_TEAM } from './mobs';

export const VISION = {
  cell: 2, // tiles per vision cell
  every: 4, // ticks between updates
  heightEvery: 25, // ticks between polls of the height grid
  eye: 0.8, // levels above the ground a viewer's eye stands
  target: 0.5, // levels above its ground a cell must show to be seen
  melee: 12, // radii in tiles
  ranged: 16,
  scout: 22,
  tower: 20,
  building: 10,
  wall: 6,
  brazier: 6,
  fire: 4, // a burning building lights this far round its centre for everyone
  high: 2, // tiles of extra sight per level the target lies below the viewer
  highCap: 8,
  forest: 4, // tiles of sight each forest cell along a ray costs
};
export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

/** What vision reads of a unit (src/war/sim/index.ts Unit). */
export interface Viewer { x: number; y: number; alive: boolean; cls: string; squad: { team: number } }

export interface Vision {
  /** Call every tick (after the sim's own step); updates every VISION.every ticks. */
  tick(t: number): void;
  visibleTo(team: number, x: number, y: number): boolean;
  explored(team: number, x: number, y: number): boolean;
  teamGrid(team: number): FogGrid;
  lastSeen(team: number): BuildingSnap[];
  /** Milliseconds the last update took (0 on ticks without one). */
  ms(): number;
}

interface Entry { cells: Int32Array; n: number }
interface Team { count: Uint16Array; fog: FogGrid; keys: Map<number, Entry>; seen: Map<number, BuildingSnap> }

const FLAT = 64; // key radius flag: a lit area, no line of sight
const TOWERS = new Set<BuildingType>(['woodTower', 'stoneTower']);
const OUTPOSTS = new Set<BuildingType>(['outpost', 'fort']);
const WALLS = new Set<BuildingType>(['palisade', 'rampart', 'stoneWall', 'woodGate', 'stoneGate']);
const BLIND = new Set<BuildingType>(['woodBridge', 'stoneBridge', 'woodStairs', 'stoneStairs', 'ladder', 'brazier']);

/** Sight radius (tiles) of a unit class. */
export function sightOf(cls: string): number {
  if (cls === 'scout') return VISION.scout;
  return warStats(cls).range > 0 ? Math.max(VISION.ranged, Math.ceil(warStats(cls).range) + 3) : VISION.melee;
}

function buildingSight(b: BuildingSnap): number {
  if (b.state === 'destroyed' || b.state === 'foundation' || b.state === 'scaffold' || b.rubble) return 0;
  if (b.type === 'brazier') return b.lit ? VISION.brazier : 0;
  if (BLIND.has(b.type)) return 0;
  if (TOWERS.has(b.type)) return VISION.tower;
  if (WALLS.has(b.type)) return VISION.wall;
  return OUTPOSTS.has(b.type) ? VISION.building + 4 : VISION.building;
}

export function createVision(grid: Grid, src: { units(): Iterable<Viewer>; buildings(): BuildingSnap[] }): Vision {
  const C = VISION.cell;
  const cw = Math.ceil(grid.w / C), ch = Math.ceil(grid.h / C), n = cw * ch;
  const cellH = new Uint8Array(n); // highest tile of the cell
  const cellF = new Uint8Array(n); // half or more of its tiles forest
  const stamp = new Int32Array(n);
  let stampN = 0;
  const teams = new Map<number, Team>();
  let lastMs = 0;
  let heightsAt = -Infinity;

  /** Recompute the cell heights; true when any changed. */
  const heights = (): boolean => {
    let changed = false;
    for (let cy = 0; cy < ch; cy++)
      for (let cx = 0; cx < cw; cx++) {
        let h = 0, f = 0, k = 0;
        for (let y = cy * C; y < Math.min(grid.h, cy * C + C); y++)
          for (let x = cx * C; x < Math.min(grid.w, cx * C + C); x++) {
            const t = y * grid.w + x;
            if (grid.height[t] > h) h = grid.height[t];
            if (grid.ground[t] === FOREST) f++;
            k++;
          }
        const c = cy * cw + cx, ff = f * 2 >= k ? 1 : 0;
        if (cellH[c] !== h || cellF[c] !== ff) (changed = true), (cellH[c] = h), (cellF[c] = ff);
      }
    return changed;
  };

  const team = (t: number): Team => {
    let v = teams.get(t);
    if (!v) {
      v = { count: new Uint16Array(n), fog: { team: t, w: cw, h: ch, cell: C, state: new Uint8Array(n), version: 0 }, keys: new Map(), seen: new Map() };
      teams.set(t, v);
    }
    return v;
  };

  const out: number[] = [];
  const mark = (c: number) => {
    if (stamp[c] !== stampN) (stamp[c] = stampN), out.push(c);
  };

  /** The cells a viewer at cell c with sight r (tiles) sees. */
  const compute = (c: number, r: number): Int32Array => {
    stampN++;
    out.length = 0;
    const cx = c % cw, cy = (c / cw) | 0;
    if (r & FLAT) {
      const rr = r & (FLAT - 1), rc = Math.ceil(rr / C);
      for (let y = Math.max(0, cy - rc); y <= Math.min(ch - 1, cy + rc); y++)
        for (let x = Math.max(0, cx - rc); x <= Math.min(cw - 1, cx + rc); x++)
          if (((x - cx) ** 2 + (y - cy) ** 2) * C * C <= rr * rr) mark(y * cw + x);
      return Int32Array.from(out);
    }
    mark(c);
    const ground = cellH[c], eye = ground + VISION.eye;
    const far = r + VISION.highCap, rc = Math.ceil(far / C);
    const ray = (px: number, py: number) => {
      const dx = px - cx, dy = py - cy, steps = Math.max(Math.abs(dx), Math.abs(dy));
      let slope = -Infinity, cost = 0;
      for (let i = 1; i <= steps; i++) {
        const fx = (dx * i) / steps, fy = (dy * i) / steps;
        const x = cx + Math.round(fx), y = cy + Math.round(fy);
        if (x < 0 || y < 0 || x >= cw || y >= ch) return;
        const k = y * cw + x, d = Math.sqrt(fx * fx + fy * fy) * C, h = cellH[k];
        if (d + cost > far) return;
        const drop = ground - h, reach = r + (drop > 0 ? Math.min(VISION.highCap, drop * VISION.high) : 0);
        if (d + cost <= reach && (h + VISION.target - eye) / d >= slope) mark(k);
        const s = (h - eye) / d;
        if (s > slope) slope = s;
        if (cellF[k]) cost += VISION.forest;
      }
    };
    for (let k = -rc; k < rc; k++) {
      ray(cx + k, cy - rc);
      ray(cx + rc, cy + k);
      ray(cx - k, cy + rc);
      ray(cx - rc, cy - k);
    }
    return Int32Array.from(out);
  };

  const add = (v: Team, cells: Int32Array): boolean => {
    let ch = false;
    for (const c of cells) if (v.count[c]++ === 0) (v.fog.state[c] = FOG_VISIBLE), (ch = true);
    return ch;
  };
  const remove = (v: Team, cells: Int32Array): boolean => {
    let ch = false;
    for (const c of cells) if (--v.count[c] === 0) (v.fog.state[c] = FOG_EXPLORED), (ch = true);
    return ch;
  };
  const cellAt = (x: number, y: number) => {
    const cx = Math.min(cw - 1, Math.max(0, Math.floor(x / C))), cy = Math.min(ch - 1, Math.max(0, Math.floor(y / C)));
    return cy * cw + cx;
  };
  const visibleB = (v: Team, b: BuildingSnap) => {
    for (let i = 0; i < b.tiles.length; i += 2) if (v.count[cellAt(b.tiles[i], b.tiles[i + 1])]) return true;
    return v.count[cellAt(b.x, b.y)] > 0;
  };

  const update = (t: number) => {
    if (t - heightsAt >= VISION.heightEvery) {
      heightsAt = t;
      if (heights())
        for (const v of teams.values()) {
          for (const e of v.keys.values()) remove(v, e.cells);
          v.keys.clear();
          v.fog.version++;
        }
    }
    const want = new Map<number, Map<number, number>>();
    const hold = (tm: number, key: number) => {
      let m = want.get(tm);
      if (!m) want.set(tm, (m = new Map()));
      m.set(key, (m.get(key) ?? 0) + 1);
    };
    for (const u of src.units()) {
      if (!u.alive || u.squad.team === MOB_TEAM) continue;
      hold(u.squad.team, cellAt(u.x, u.y) * 128 + sightOf(u.cls));
    }
    const blds = src.buildings();
    for (const b of blds) {
      if (b.burning && b.state !== 'destroyed') for (const tm of teams.keys()) hold(tm, cellAt(b.x, b.y) * 128 + FLAT + VISION.fire);
      if (b.team === MOB_TEAM) continue;
      const r = buildingSight(b);
      if (r > 0) hold(b.team, cellAt(b.x, b.y) * 128 + r);
    }
    for (const tm of want.keys()) team(tm);
    for (const [tm, v] of teams) {
      const m = want.get(tm) ?? new Map<number, number>();
      let changed = false;
      for (const [key, e] of v.keys)
        if (!m.has(key)) {
          changed = remove(v, e.cells) || changed;
          v.keys.delete(key);
        }
      for (const [key, k] of m) {
        let e = v.keys.get(key);
        if (!e) {
          e = { cells: compute(Math.floor(key / 128), key % 128), n: 0 };
          v.keys.set(key, e);
          changed = add(v, e.cells) || changed;
        }
        e.n = k;
      }
      // last-seen foreign buildings: refreshed while seen, forgotten once their ground is seen empty
      const here = new Set<number>();
      for (const b of blds) {
        if (b.team === tm) continue;
        here.add(b.id);
        if (visibleB(v, b)) v.seen.set(b.id, b);
      }
      for (const [id, b] of v.seen) if (!here.has(id) && visibleB(v, b)) v.seen.delete(id);
      if (changed) v.fog.version++;
    }
  };

  return {
    tick(t) {
      if (t % VISION.every !== 0) return void (lastMs = 0);
      const t0 = performance.now();
      update(t);
      lastMs = performance.now() - t0;
    },
    visibleTo(tm, x, y) {
      const v = teams.get(tm);
      return !!v && v.count[cellAt(x, y)] > 0;
    },
    explored(tm, x, y) {
      const v = teams.get(tm);
      return !!v && v.fog.state[cellAt(x, y)] !== FOG_UNEXPLORED;
    },
    teamGrid: (tm) => team(tm).fog,
    lastSeen: (tm) => [...team(tm).seen.values()],
    ms: () => lastMs,
  };
}
