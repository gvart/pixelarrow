/**
 * Offline field camp (pure TS, no Phaser): the party can pitch camp on open
 * land away from settlements. The camp claims a small blob of tiles (its
 * zone); inside it the player builds simple structures that speed up healing,
 * add foraging, keep bands out, repair gear and drill the men.
 *
 * Provisions: `food` is eaten on the march and in camp (one ration per hero
 * per day), `supplies` (timber, hides, tools) pay for camp structures and the
 * forge. Both are bought in villages and towns; a camp forages some food.
 */
import { T, inMap, passable, type WorldMap } from './map';
import { hash3 } from './noise';

export type StructureId = 'tent' | 'fire' | 'palisade' | 'forge' | 'training';

export interface StructureDef {
  id: StructureId;
  name: string;
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Supplies spent to build it. */
  cost: number;
  /** Game hours the work takes (time passes when it is built). */
  hours: number;
  /** How many a camp may hold. */
  max: number;
  icon: string;
  desc: string;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  tent: { id: 'tent', name: 'Tent', w: 1, h: 1, cost: 4, hours: 1, max: 3, icon: 'tent', desc: 'Shelter: faster healing' },
  fire: { id: 'fire', name: 'Campfire', w: 1, h: 1, cost: 2, hours: 0.5, max: 1, icon: 'fire', desc: 'Cooking: heal, forage' },
  palisade: { id: 'palisade', name: 'Palisade', w: 2, h: 1, cost: 8, hours: 3, max: 1, icon: 'wall', desc: 'Bands keep out' },
  forge: { id: 'forge', name: 'Forge', w: 2, h: 1, cost: 10, hours: 3, max: 1, icon: 'anvil', desc: 'Mend, temper gear' },
  training: { id: 'training', name: 'Drill yard', w: 2, h: 2, cost: 8, hours: 2, max: 1, icon: 'swords', desc: 'Novices gain XP' },
};
export const STRUCTURE_LIST: StructureDef[] = Object.values(STRUCTURES);

export interface Built {
  id: StructureId;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
}

export interface CampState {
  /** Tile the party camps on (the zone's heart). */
  x: number;
  y: number;
  /** Tile indices (y * w + x) of the camp zone. */
  zone: number[];
  built: Built[];
  /** Game time the camp was pitched. */
  since: number;
}

export const CAMP_RULES = {
  /** Zone radius in tiles (noisy blob). */
  radius: 3.2,
  minTiles: 16,
  /** Min Chebyshev distance of the camp's heart from a settlement, and of any zone tile (by kind). */
  clearance: { town: 7, village: 5, lair: 5 } as Record<string, number>,
  keepOut: { town: 4, village: 3, lair: 3 } as Record<string, number>,
  /** Wound-hours healed per hour: open camp, per tent (up to 2 count), campfire. */
  heal: 2,
  healTent: 0.3,
  healFire: 0.4,
  /** Food foraged per zone tile per hour, by terrain; the campfire multiplies it. */
  forage: { [T.grass]: 0.006, [T.scrub]: 0.005, [T.forest]: 0.014, [T.hills]: 0.004, [T.beach]: 0.008 } as Record<number, number>,
  forageFire: 1.5,
  /** Equipped gear condition mended per hour at the forge (while supplies last). */
  repairPerHour: 4,
  /** Supplies the forge burns per hour while it has work. */
  repairSupplies: 0.08,
  /** XP per hour for fit heroes in the drill yard, up to this level. */
  drillXp: 1.5,
  drillMaxLevel: 4,
  /** Share of the supplies given back when the camp is struck. */
  refund: 0.5,
};

export const FOOD_RULES = {
  /** Rations per hero per day. */
  perHeroDay: 1,
  /** Starving: marching speed and healing multipliers. */
  starveSpeed: 0.75,
  starveHeal: 0.25,
  cap: 240,
  supplyCap: 120,
  startFood: 24,
  startSupplies: 12,
  /** Gold per 10 rations / 10 supplies (village, town). */
  foodPrice: { village: 5, town: 6 },
  supplyPrice: { village: 14, town: 12 },
};

/** Why the party cannot camp at tile (tx, ty), or null if it can. */
export function campBlocker(m: WorldMap, tx: number, ty: number): string | null {
  if (!passable(m, tx, ty)) return 'No ground to camp on';
  for (const s of m.settlements) {
    if (Math.max(Math.abs(s.x - tx), Math.abs(s.y - ty)) < CAMP_RULES.clearance[s.kind]) return s.kind === 'lair' ? 'Too close to their camp' : `Too close to ${s.name}`;
  }
  const z = campZone(m, tx, ty);
  if (z.length < CAMP_RULES.minTiles) return 'Too cramped to camp here';
  return null;
}

/** The camp's zone: open tiles in a noisy blob around (tx, ty), connected to it. */
export function campZone(m: WorldMap, tx: number, ty: number): number[] {
  const R = CAMP_RULES.radius;
  const ok = (x: number, y: number) => {
    if (!inMap(m, x, y) || !passable(m, x, y)) return false;
    const i = y * m.w + x;
    if (m.river[i]) return false;
    for (const s of m.settlements) if (Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < CAMP_RULES.keepOut[s.kind]) return false;
    const d = Math.hypot(x - tx, (y - ty) * 1.1);
    const wob = (hash3(x, y, m.seed ^ 0x6a09) - 0.5) * 1.1;
    return d <= R + wob;
  };
  if (!ok(tx, ty)) return [];
  const seen = new Set<number>([ty * m.w + tx]);
  const stack = [ty * m.w + tx];
  while (stack.length) {
    const c = stack.pop()!;
    const cx = c % m.w;
    const cy = (c - cx) / m.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const j = ny * m.w + nx;
      if (seen.has(j) || !ok(nx, ny)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function footprint(id: StructureId, x: number, y: number): [number, number][] {
  const d = STRUCTURES[id];
  const out: [number, number][] = [];
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) out.push([x + i, y + j]);
  return out;
}

/** Tiles taken by the camp's structures and the party's own spot. */
function occupied(c: CampState): Set<string> {
  const s = new Set<string>([`${c.x},${c.y}`]);
  for (const b of c.built) for (const [x, y] of footprint(b.id, b.x, b.y)) s.add(`${x},${y}`);
  return s;
}

/** Can structure `id` go with its top-left tile at (x, y)? Per-tile validity for the placement ghost. */
export function placeCheck(m: WorldMap, c: CampState, id: StructureId, x: number, y: number): { ok: boolean; tiles: { x: number; y: number; ok: boolean }[] } {
  const zone = new Set(c.zone);
  const occ = occupied(c);
  const tiles = footprint(id, x, y).map(([tx, ty]) => ({ x: tx, y: ty, ok: inMap(m, tx, ty) && zone.has(ty * m.w + tx) && !occ.has(`${tx},${ty}`) }));
  return { ok: tiles.every((t) => t.ok), tiles };
}

export function countBuilt(c: CampState, id: StructureId): number {
  return c.built.filter((b) => b.id === id).length;
}

export function hasBuilt(c: CampState | null | undefined, id: StructureId): boolean {
  return !!c && c.built.some((b) => b.id === id);
}

/**
 * A free spot for a structure, or null: scanning outward from the camp heart,
 * it first looks for room to breathe (no structure or the party's spot right
 * beside the footprint, so the camp reads as tents and yards with paths
 * between them; the palisade's gate wants the zone's edge), then takes the
 * first fit.
 */
export function freeSpot(m: WorldMap, c: CampState, id: StructureId): { x: number; y: number } | null {
  const cands = c.zone.map((i) => ({ x: i % m.w, y: Math.floor(i / m.w) }));
  cands.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  const zone = new Set(c.zone);
  const occ = occupied(c);
  const fp = (t: { x: number; y: number }) => footprint(id, t.x, t.y);
  const roomy = (t: { x: number; y: number }) => {
    const own = new Set(fp(t).map(([x, y]) => `${x},${y}`));
    return fp(t).every(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => own.has(`${x + dx},${y + dy}`) || !occ.has(`${x + dx},${y + dy}`)));
  };
  const onEdge = (t: { x: number; y: number }) => fp(t).some(([x, y]) => !zone.has((y + 1) * m.w + x));
  const fits = cands.filter((t) => placeCheck(m, c, id, t.x, t.y).ok);
  const pick =
    (id === 'palisade' ? fits.find((t) => roomy(t) && onEdge(t)) ?? fits.find(onEdge) : undefined) ??
    fits.find(roomy) ??
    fits[0];
  return pick ?? null;
}

export interface CampEffects {
  /** Wound-hours healed per hour. */
  heal: number;
  /** Food foraged per hour. */
  forage: number;
  forge: boolean;
  drill: boolean;
  /** Bands do not attack the camp. */
  fortified: boolean;
}

export function campEffects(m: WorldMap, c: CampState): CampEffects {
  const tents = Math.min(2, countBuilt(c, 'tent'));
  const fire = hasBuilt(c, 'fire');
  let forage = 0;
  for (const i of c.zone) forage += CAMP_RULES.forage[m.terrain[i]] ?? 0;
  if (fire) forage *= CAMP_RULES.forageFire;
  return {
    heal: CAMP_RULES.heal + tents * CAMP_RULES.healTent + (fire ? CAMP_RULES.healFire : 0),
    forage,
    forge: hasBuilt(c, 'forge'),
    drill: hasBuilt(c, 'training'),
    fortified: hasBuilt(c, 'palisade'),
  };
}

/** Supplies given back when the camp is struck. */
export function campRefund(c: CampState): number {
  return Math.floor(c.built.reduce((a, b) => a + STRUCTURES[b.id].cost, 0) * CAMP_RULES.refund);
}
