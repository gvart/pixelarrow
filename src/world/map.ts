/**
 * Procedural overland map of an ancient Mediterranean coast (pure TS, seeded).
 * The map is never saved: the same seed always regenerates the same terrain,
 * rivers, roads and settlements, so a save only stores the seed.
 */
import { Rng } from '../sim/rng';
import type { Culture } from '../data/names';
import { fbm, hash3 } from './noise';
import { findPath, type Tile } from './path';

export const MAP_W = 112;
export const MAP_H = 112;

export const T = { deep: 0, sea: 1, beach: 2, grass: 3, scrub: 4, forest: 5, hills: 6, mountain: 7 } as const;
export type TerrainId = (typeof T)[keyof typeof T];
export const TERRAIN_NAMES = ['Deep sea', 'Sea', 'Shore', 'Plain', 'Scrubland', 'Forest', 'Hills', 'Mountains'];

export type SettlementKind = 'town' | 'village' | 'lair';
export type BandKind = 'bandits' | 'raiders' | 'mercs';

export interface SettlementDef {
  id: number;
  kind: SettlementKind;
  name: string;
  x: number;
  y: number;
  culture: Culture;
  coastal: boolean;
  /** Lairs: what kind of band they send out. */
  band?: BandKind;
}

export interface WorldMap {
  seed: number;
  w: number;
  h: number;
  terrain: Uint8Array;
  river: Uint8Array;
  road: Uint8Array;
  elev: Float32Array;
  settlements: SettlementDef[];
  /** Settlement the campaign starts in. */
  start: number;
}

const TOWN_NAMES = ['Neapolis', 'Taras', 'Kroton', 'Syrakousai', 'Akragas', 'Massalia', 'Rhegion', 'Kyme', 'Elea', 'Selinous', 'Himera', 'Gela', 'Lokroi', 'Sybaris'];
const VILLAGE_NAMES = ['Pylos', 'Assos', 'Aigai', 'Elatea', 'Kirrha', 'Oinoe', 'Halai', 'Phyle', 'Anthele', 'Dion', 'Skolos', 'Tanagra', 'Abai', 'Kalydon', 'Pheia', 'Krisa', 'Opous', 'Thisbe'];

export function isWater(t: number): boolean {
  return t === T.deep || t === T.sea;
}

export function inMap(m: WorldMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h;
}

export function terrainAt(m: WorldMap, x: number, y: number): number {
  return inMap(m, x, y) ? m.terrain[y * m.w + x] : T.deep;
}

export function passable(m: WorldMap, x: number, y: number): boolean {
  if (!inMap(m, x, y)) return false;
  const t = m.terrain[y * m.w + x];
  return !isWater(t) && t !== T.mountain;
}

/** Hours to cross one tile at base speed (Infinity = impassable). Roads are fast, forests and hills slow. */
export function travelCost(m: WorldMap, x: number, y: number): number {
  if (!passable(m, x, y)) return Infinity;
  const i = y * m.w + x;
  if (m.road[i]) return 0.55;
  const base = [Infinity, Infinity, 1.2, 1, 1.15, 1.8, 2.1, Infinity][m.terrain[i]];
  return base + (m.river[i] ? 1.4 : 0);
}

export const MIN_TRAVEL_COST = 0.55;

export function generateMap(seed: number): WorldMap {
  const w = MAP_W;
  const h = MAP_H;
  const rng = new Rng(seed ^ 0x2545f491);
  const n = w * h;
  const elev = new Float32Array(n);
  const terrain = new Uint8Array(n);
  const river = new Uint8Array(n);
  const road = new Uint8Array(n);

  // ---- elevation: a sea basin opening to the south-west, noise, mountain ridges
  const bx = w * rng.range(0.15, 0.4);
  const by = h * rng.range(0.95, 1.15);
  const br = w * 0.7;
  const s1 = (seed * 7 + 11) | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.sqrt(((x - bx) / br) ** 2 + ((y - by) / br) ** 2);
      const base = fbm(x, y, 36, s1, 4);
      const ridge = 1 - Math.abs(2 * fbm(x + 500, y + 500, 44, s1 + 77, 3) - 1);
      let e = base * 0.62 + Math.min(1.3, d) * 0.5 - 0.17 + Math.max(0, ridge - 0.62) * 0.9;
      // a western coast too: the land rises to the east
      e += (x / w - 0.5) * 0.12;
      elev[y * w + x] = e;
    }
  }
  // Thresholds by percentile so every seed gets a similar mix: ~36% sea, ~9% hills, ~8% mountains.
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const SEA = sorted[Math.floor(n * 0.36)];
  const HILL = sorted[Math.floor(n * 0.83)];
  const MOUNT = sorted[Math.floor(n * 0.92)];
  const moistSeed = (seed * 13 + 5) | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = elev[i];
      const border = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      let t: number;
      if (e < SEA) t = T.sea;
      else if (border || e > MOUNT) t = T.mountain;
      else if (e > HILL) t = T.hills;
      else {
        const m = fbm(x, y, 22, moistSeed, 3);
        t = m > 0.6 ? T.forest : m < 0.4 ? T.scrub : T.grass;
      }
      if (border && e < SEA) t = T.deep;
      terrain[i] = t;
    }
  }
  // deep water away from the coast; beaches on low shores
  const near = (x: number, y: number, r: number, pred: (t: number) => boolean) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (pred(terrain[yy * w + xx])) return true;
    }
    return false;
  };
  const copy = terrain.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = copy[i];
      if (t === T.sea && !near(x, y, 3, (q) => !isWater(q))) terrain[i] = T.deep;
      else if (!isWater(t) && t !== T.mountain && elev[i] < SEA + 0.02 && near(x, y, 1, isWater)) terrain[i] = T.beach;
    }
  }

  // ---- rivers: from the high ground downhill to the sea
  const sources: Tile[] = [];
  for (let tries = 0; tries < 400 && sources.length < 6; tries++) {
    const x = rng.int(4, w - 5);
    const y = rng.int(4, h - 5);
    const t = terrain[y * w + x];
    if (t !== T.hills) continue;
    if (sources.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 18)) continue;
    sources.push({ x, y });
  }
  for (const src of sources) {
    let x = src.x;
    let y = src.y;
    const seen = new Set<number>();
    const course: number[] = [];
    let reachedSea = false;
    for (let step = 0; step < 220; step++) {
      const i = y * w + x;
      seen.add(i);
      course.push(i);
      let best = -1;
      let be = Infinity;
      let sea = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const j = yy * w + xx;
        if (isWater(terrain[j])) sea = true;
        if (seen.has(j) || terrain[j] === T.mountain) continue;
        const e = elev[j] + hash3(xx, yy, seed) * 0.01;
        if (e < be) {
          be = e;
          best = j;
        }
      }
      if (sea) {
        reachedSea = true;
        break;
      }
      if (best < 0 || river[best]) {
        reachedSea = best >= 0; // joined another river
        if (best >= 0) course.push(best);
        break;
      }
      x = best % w;
      y = (best - x) / w;
    }
    if (reachedSea && course.length > 6) for (const i of course) if (!isWater(terrain[i])) river[i] = 1;
  }

  // ---- settlements, all on the largest connected landmass
  const comp = largestComponent(w, h, (x, y) => !isWater(terrain[y * w + x]) && terrain[y * w + x] !== T.mountain);
  const coastal = (x: number, y: number) => near(x, y, 2, isWater);
  const settlements: SettlementDef[] = [];
  const far = (x: number, y: number, d: number) => settlements.every((s) => (s.x - x) ** 2 + (s.y - y) ** 2 >= d * d);
  const place = (kind: SettlementKind, count: number, spacing: number, ok: (x: number, y: number, t: number) => boolean, score: (x: number, y: number) => number) => {
    for (let pass = 0; pass < 3; pass++) {
      const cands: { x: number; y: number; s: number }[] = [];
      for (let y = 4; y < h - 4; y += 1) {
        for (let x = 4; x < w - 4; x += 1) {
          const i = y * w + x;
          if (!comp[i] || river[i]) continue;
          if (!ok(x, y, terrain[i])) continue;
          cands.push({ x, y, s: score(x, y) + rng.next() });
        }
      }
      cands.sort((a, b) => b.s - a.s);
      for (const c of cands) {
        if (settlements.filter((s) => s.kind === kind).length >= count) break;
        if (!far(c.x, c.y, spacing)) continue;
        settlements.push({ id: settlements.length, kind, name: '', x: c.x, y: c.y, culture: 'greek', coastal: coastal(c.x, c.y) });
      }
      if (settlements.filter((s) => s.kind === kind).length >= count) break;
      spacing *= 0.8;
    }
  };
  const flat = (t: number) => t === T.grass || t === T.scrub || t === T.beach;
  place('town', 4, 30, (_x, _y, t) => flat(t) && t !== T.beach, (x, y) => (coastal(x, y) ? 0.8 : 0));
  const startTown = settlements[0];
  place('village', 9, 13, (_x, _y, t) => flat(t) || t === T.forest, () => 0);
  const dStart = (x: number, y: number) => Math.sqrt((x - startTown.x) ** 2 + (y - startTown.y) ** 2);
  place('lair', 6, 15, (x, y, t) => dStart(x, y) > 26 && (t === T.hills || t === T.forest || t === T.scrub || t === T.beach), (x, y) => dStart(x, y) / w);

  const townNames = rng.shuffle([...TOWN_NAMES]);
  const villageNames = rng.shuffle([...VILLAGE_NAMES]);
  let ti = 0;
  let vi = 0;
  for (const s of settlements) {
    const t = terrain[s.y * w + s.x];
    if (s.kind === 'town') {
      s.name = townNames[ti++ % townNames.length];
      s.culture = rng.chance(0.35) ? 'phoenician' : 'greek';
    } else if (s.kind === 'village') {
      s.name = villageNames[vi++ % villageNames.length];
      s.culture = rng.chance(0.15) ? 'celtic' : 'greek';
    } else if (s.coastal) {
      s.name = 'Pirate cove';
      s.band = 'bandits';
      s.culture = rng.pick(['phoenician', 'greek'] as const);
    } else if (t === T.hills || rng.chance(0.4)) {
      s.name = 'Galatae camp';
      s.band = 'raiders';
      s.culture = 'celtic';
    } else {
      s.name = 'Bandit camp';
      s.band = 'bandits';
      s.culture = rng.pick(['greek', 'phoenician', 'celtic'] as const);
    }
  }

  // ---- roads: a spanning tree over towns and villages, plus a few loops
  const linked = settlements.filter((s) => s.kind !== 'lair');
  const edges: [number, number][] = [];
  const inTree = new Set<number>([linked[0].id]);
  while (inTree.size < linked.length) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const a of linked) {
      if (!inTree.has(a.id)) continue;
      for (const b of linked) {
        if (inTree.has(b.id)) continue;
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d < bd) {
          bd = d;
          best = [a.id, b.id];
        }
      }
    }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  const towns = linked.filter((s) => s.kind === 'town');
  for (let i = 0; i < towns.length; i++) {
    const others = towns.filter((t) => t !== towns[i]).sort((a, b) => (a.x - towns[i].x) ** 2 + (a.y - towns[i].y) ** 2 - ((b.x - towns[i].x) ** 2 + (b.y - towns[i].y) ** 2));
    if (others[0] && !edges.some(([a, b]) => (a === towns[i].id && b === others[0].id) || (b === towns[i].id && a === others[0].id))) edges.push([towns[i].id, others[0].id]);
  }
  const roadCost = (x: number, y: number) => {
    const i = y * w + x;
    const t = terrain[i];
    if (isWater(t) || t === T.mountain) return Infinity;
    if (road[i]) return 0.3;
    return [Infinity, Infinity, 1.5, 1, 1.2, 2.4, 3, Infinity][t] + (river[i] ? 5 : 0);
  };
  for (const [a, b] of edges) {
    const A = settlements[a];
    const B = settlements[b];
    const p = findPath(w, h, roadCost, A.x, A.y, B.x, B.y, 0.3, 60000);
    if (p) for (const q of p) road[q.y * w + q.x] = 1;
  }

  return { seed, w, h, terrain, river, road, elev, settlements, start: startTown.id };
}

function largestComponent(w: number, h: number, ok: (x: number, y: number) => boolean): Uint8Array {
  const label = new Int32Array(w * h).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const x0 = i % w;
    const y0 = (i - x0) / w;
    if (label[i] >= 0 || !ok(x0, y0)) continue;
    const l = next++;
    let size = 0;
    label[i] = l;
    stack.push(i);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const cx = c % w;
      const cy = (c - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] >= 0 || !ok(nx, ny)) continue;
        label[j] = l;
        stack.push(j);
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = l;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] === bestLabel) out[i] = 1;
  return out;
}

/** 0 (safe home country) .. 1 (wild frontier near the lairs). */
export function dangerAt(m: WorldMap, x: number, y: number): number {
  const s = m.settlements[m.start];
  const dStart = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2) / (m.w * 0.8);
  let dLair = Infinity;
  for (const l of m.settlements) if (l.kind === 'lair') dLair = Math.min(dLair, Math.sqrt((x - l.x) ** 2 + (y - l.y) ** 2));
  const lair = Math.max(0, 1 - dLair / 16);
  return Math.max(0.05, Math.min(1, dStart * 0.75 + lair * 0.35));
}

export function regionName(m: WorldMap, x: number, y: number): string {
  const tx = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  const i = ty * m.w + tx;
  if (m.road[i]) return 'Road';
  if (m.river[i]) return 'River ford';
  return TERRAIN_NAMES[m.terrain[i]];
}
