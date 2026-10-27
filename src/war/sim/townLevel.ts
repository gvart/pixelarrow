/**
 * W-61 town level (docs/WAR.md "Town level"): a team's town in a region levels up from what it has built there. W-63:
 * every standing camp or fort a team built is a town centre (a team with none: its first store), so a team may hold
 * several towns in a region and each levels on its own. A town is the ground within TOWN.r tiles of its centre; a piece
 * counts for its team's nearest centre that near. Towns are keyed by centre piece id and measured every TOWN.every
 * ticks from the team's own standing pieces (pre-built pieces do not count: they were not built):
 *
 *  - variety: how many kinds of building stand (a forge of any level is one kind, every wall segment one, ...);
 *  - stone: the share of the built footprint that is stone;
 *  - closed: the walls close it: a walk from the centre over open ground (own gates count as shut, a wall's walkway
 *    is no way out) reaches neither the map's edge nor TOWN.area tiles, and the team has a wall piece in the town;
 *  - stoneWalls: every wall, gate and tower of the town is stone.
 *
 * Each level gives a small perk to the team's men and things inside the town (TOWN_PERKS, cumulative steps):
 * store size (its chests hold more), food (meals keep: hunger runs down slower), souls (sites near wake souls more
 * often) and repair speed. Deterministic: plain loops in id order; the levels are saved with the sim.
 */
import type { BuildingType, TownLevelSnap } from '../types';
import { NEUTRAL_TEAM } from './economy';
import type { Grid } from './grid';
import type { Piece } from './works';

export const TOWN = { r: 24, every: 50, area: 3000 };

/** What a level needs (index = level; level 0: no store). */
export const TOWN_LEVELS: readonly { name: string; variety: number; stone: number; closed: boolean; stoneWalls: boolean }[] = [
  { name: 'None', variety: 0, stone: 0, closed: false, stoneWalls: false },
  { name: 'Camp', variety: 0, stone: 0, closed: false, stoneWalls: false },
  { name: 'Hamlet', variety: 4, stone: 0, closed: false, stoneWalls: false },
  { name: 'Village', variety: 6, stone: 0.25, closed: false, stoneWalls: false },
  { name: 'Town', variety: 8, stone: 0.4, closed: true, stoneWalls: false },
  { name: 'City', variety: 10, stone: 0.6, closed: true, stoneWalls: true },
];
export const TOWN_MAX = TOWN_LEVELS.length - 1;

/** Perks by level: extra chest loads, hunger decay multiplier, soul chance multiplier, repair speed multiplier. */
export interface TownPerk { store: number; hunger: number; souls: number; repair: number }
export const TOWN_PERKS: readonly TownPerk[] = [
  { store: 0, hunger: 1, souls: 1, repair: 1 },
  { store: 0, hunger: 1, souls: 1, repair: 1 },
  { store: 2, hunger: 1, souls: 1, repair: 1.1 },
  { store: 2, hunger: 0.9, souls: 1.25, repair: 1.1 },
  { store: 4, hunger: 0.85, souls: 1.5, repair: 1.25 },
  { store: 6, hunger: 0.75, souls: 2, repair: 1.4 },
];
const NONE = TOWN_PERKS[0];

/** Pieces that are no kind of building for the town (tools, field works, a siege ladder). */
const SKIP = new Set<BuildingType>(['brazier', 'ladder', 'towerBridge', 'stakes', 'ditch']);
/** The kind a piece counts as: workplaces by their chain, wall pieces by their part, the rest by type. */
export function kindOf(type: BuildingType, d: Piece['def']): string {
  if (d.workplace) return d.workplace.kind;
  if (d.wall) return d.wall;
  if (d.access === 'stairs') return 'stairs';
  if (d.bridge) return 'bridge';
  return type;
}

export interface TownLevel { team: number; level: number; x: number; y: number; variety: number; stone: number; closed: boolean; stoneWalls: boolean; centre: number }

const up = (b: Piece) => !b.cancelled && (b.state === 'done' || b.state === 'damaged');

/** The level a measure reaches. */
export function levelOf(m: { variety: number; stone: number; closed: boolean; stoneWalls: boolean }): number {
  let lv = 1;
  for (let k = 2; k <= TOWN_MAX; k++) {
    const need = TOWN_LEVELS[k];
    if (m.variety < need.variety || m.stone < need.stone - 1e-9 || (need.closed && !m.closed) || (need.stoneWalls && !m.stoneWalls)) break;
    lv = k;
  }
  return lv;
}

/** What the next level still needs, in words (empty at the top). */
export function nextNeeds(t: Pick<TownLevel, 'level' | 'variety' | 'stone' | 'closed' | 'stoneWalls'>): string[] {
  if (t.level >= TOWN_MAX || t.level < 1) return t.level < 1 ? ['a camp or store'] : [];
  const n = TOWN_LEVELS[t.level + 1], out: string[] = [];
  if (t.variety < n.variety) out.push(`${n.variety - t.variety} more kind${n.variety - t.variety > 1 ? 's' : ''} of building`);
  if (t.stone < n.stone - 1e-9) out.push(`${Math.round(n.stone * 100)}% stone (now ${Math.round(t.stone * 100)}%)`);
  if (n.closed && !t.closed) out.push('walls closed all round');
  if (n.stoneWalls && !t.stoneWalls) out.push('every wall, gate and tower stone');
  return out;
}

export function createTownLevels(grid: Grid, pieces: () => readonly Piece[], mob: number) {
  /** W-63: the towns by centre piece id (teams ascending, centres in id order within a team). */
  const levels = new Map<number, TownLevel>();
  const { w, h } = grid;
  const seen = new Uint32Array(w * h);
  let stamp = 0;

  /** Do the walls close the town round tile c? A bounded flood over open ground; own gates and decks shut. */
  const closedAt = (c: number): boolean => {
    if (++stamp === 0xffffffff) (seen.fill(0), (stamp = 1));
    const q = [c];
    seen[c] = stamp;
    for (let i = 0; i < q.length; i++) {
      if (q.length > TOWN.area) return false;
      const t = q[i], x = t % w, y = (t / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return false;
      for (const o of [t - 1, t + 1, t - w, t + w]) {
        if (seen[o] === stamp) continue;
        seen[o] = stamp;
        if (grid.cost[o] <= 0 || grid.gate[o] !== 0 || grid.deck[o] !== 0) continue;
        q.push(o);
      }
    }
    return true;
  };

  const measure = () => {
    const all = pieces();
    // W-63: every standing camp or fort a team built is a town centre; a team with none has one round its first store
    const camps = new Map<number, Piece[]>(), stores = new Map<number, Piece>();
    for (const b of all) {
      if (!up(b) || b.pre || !b.def.store || b.team === NEUTRAL_TEAM || b.team === mob || b.team < 0) continue;
      if (b.type === 'camp' || b.type === 'fort') {
        const l = camps.get(b.team);
        if (l) l.push(b);
        else camps.set(b.team, [b]);
      } else if (!stores.has(b.team)) stores.set(b.team, b);
    }
    for (const [team, b] of stores) if (!camps.has(team)) camps.set(team, [b]);
    levels.clear();
    const towns: { c: Piece; kinds: Set<string>; stoneN: number; allN: number; walls: number; woodWalls: number }[] = [];
    const slots = new Map<number, { t: TownLevel; i: number }[]>();
    for (const team of [...camps.keys()].sort((a, b) => a - b))
      for (const c of camps.get(team)!.sort((a, b) => a.id - b.id)) {
        const t: TownLevel = { team, level: 0, x: c.x, y: c.y, centre: c.id, variety: 0, stone: 0, closed: false, stoneWalls: false };
        let l = slots.get(team);
        if (!l) slots.set(team, (l = []));
        l.push({ t, i: towns.length });
        towns.push({ c, kinds: new Set(), stoneN: 0, allN: 0, walls: 0, woodWalls: 0 });
      }
    // each piece counts for one town: its team's nearest centre within TOWN.r
    for (const b of all) {
      if (!up(b) || b.pre || SKIP.has(b.type)) continue;
      const l = slots.get(b.team);
      if (!l) continue;
      let k = -1, bd = TOWN.r * TOWN.r;
      for (const { t, i } of l) {
        const d = (b.x - t.x) ** 2 + (b.y - t.y) ** 2;
        if (d < bd || (d === bd && k < 0)) (bd = d), (k = i);
      }
      if (k < 0) continue;
      const m = towns[k], n = b.ti.length;
      m.kinds.add(kindOf(b.type, b.def));
      m.allN += n;
      if (b.def.material === 'stone') m.stoneN += n;
      if (b.def.wall) (m.walls++, b.def.material !== 'stone' && m.woodWalls++);
    }
    for (const l of slots.values())
      for (const { t, i } of l) {
        const { c, kinds, stoneN, allN, walls, woodWalls } = towns[i];
        const t0 = Math.floor(c.y) * w + Math.floor(c.x);
        // the flood starts beside the store (its own tiles are closed)
        let start = -1;
        for (let r = 1; r < 6 && start < 0; r++)
          for (const [dx, dy] of [[0, r], [r, 0], [0, -r], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
            const o = t0 + dy * w + dx;
            if (o >= 0 && o < w * h && grid.cost[o] > 0 && grid.gate[o] === 0 && grid.deck[o] === 0) {
              start = o;
              break;
            }
          }
        const closed = walls > 0 && start >= 0 && closedAt(start);
        const m = { variety: kinds.size, stone: allN ? stoneN / allN : 0, closed, stoneWalls: walls > 0 && woodWalls === 0 };
        Object.assign(t, { level: levelOf(m), ...m });
        levels.set(c.id, t);
      }
  };

  /** The town of `team` that holds (x,y): the nearest of its centres within TOWN.r (ties: the lower id), or null. */
  const at = (team: number, x: number, y: number): TownLevel | null => {
    let best: TownLevel | null = null, bd = TOWN.r * TOWN.r;
    for (const t of levels.values()) {
      if (t.team !== team) continue;
      const d = (t.x - x) ** 2 + (t.y - y) ** 2;
      if (d < bd || (d === bd && !best)) (bd = d), (best = t);
    }
    return best;
  };

  return {
    saveRoot: () => ({ levels }),
    tick(tick: number) {
      if (tick % TOWN.every === 0) measure();
    },
    /** Measure now (a scenario, a test). */
    measure,
    /** The best level of `team`'s towns here (0: none). */
    level(team: number) {
      let lv = 0;
      for (const t of levels.values()) if (t.team === team) lv = Math.max(lv, t.level);
      return lv;
    },
    /** W-63: the town of `team` that holds (x,y), or null. */
    townAt: at,
    /** W-63: the town whose centre is piece `centre`, or null. */
    town: (centre: number): TownLevel | null => levels.get(centre) ?? null,
    /** W-63: ids (ascending) of the built pieces of the centre's team that count for its town (sites and ruins too). */
    members(centre: number): number[] {
      const c = levels.get(centre), out: number[] = [];
      if (c) for (const b of pieces()) if (!b.cancelled && !b.pre && b.team === c.team && at(c.team, b.x, b.y) === c) out.push(b.id);
      return out.sort((a, b) => a - b);
    },
    /** The perks a man or thing of `team` at (x,y) enjoys: his town's if he stands in it, else none. */
    perkAt: (team: number, x: number, y: number): TownPerk => TOWN_PERKS[at(team, x, y)?.level ?? 0] ?? NONE,
    /** The best soul-chance multiplier of any town whose ground (x,y) is. */
    soulsAt(x: number, y: number): number {
      let k = 1;
      for (const t of levels.values()) if ((t.x - x) ** 2 + (t.y - y) ** 2 <= TOWN.r * TOWN.r) k = Math.max(k, TOWN_PERKS[t.level].souls);
      return k;
    },
    snaps: (): TownLevelSnap[] =>
      [...levels.values()].map((t) => ({ id: t.centre, team: t.team, level: t.level, name: TOWN_LEVELS[t.level].name, x: t.x, y: t.y, r: TOWN.r, variety: t.variety, stone: t.stone, closed: t.closed, stoneWalls: t.stoneWalls, next: nextNeeds(t) })),
  };
}
export type TownLevels = ReturnType<typeof createTownLevels>;
