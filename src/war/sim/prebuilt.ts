/**
 * M7a pre-built structures (docs/WAR.md "Living regions", "Pre-built structures"; W-47): the functions of a region's
 * town and landmark pieces. The pieces themselves are ordinary works buildings (./works.ts prebuild: done at the start,
 * owned by the holder of their claim point, else by the influence over them, else NEUTRAL_TEAM, or MOB_TEAM while a
 * bandit host holds the region; a piece brought to 0 hp is a ruin until its ground's owner rebuilds it).
 *
 * Only the owner (an alliance team, never neutral or mob) uses a piece's function:
 *  - houses, cottages, tents: population, the town's recruit pool an hour and its cap (the server's recruit pool) and
 *    room for as many more civilians on the field;
 *  - temples and shrines: a squad of the owner standing in the precinct BLESS.stand ticks is blessed BLESS.ticks
 *    (wounded share + BLESS.share, healing x BLESS.heal); favour (score an hour, the server);
 *  - statues: prestige (score an hour); favour and prestige together at most PRESTIGE_CAP an hour a team;
 *  - wells: own squads resting near pay upkeep x WELL.upkeep (the server asks upkeepAt), fires near are beaten out
 *    x WELL.douse faster; a foe standing beside one WELL.foul ticks fouls it for WELL.fouled ticks (no function);
 *  - stoas and warehouses: stores of the owner's network (a stoa has 2 stall sites), jetties: a food node, caches: two
 *    loads of the region's good anyone may carry off (gone once empty), boards: the price board (server).
 * A town (the pieces of one claim point) with TOWN_RUIN of its houses and its temple ruined is ruined: no pool, no favour.
 */
import type { BuildingType, TownSnap } from '../types';
import { NEUTRAL_TEAM } from './economy';
import type { Piece, Works } from './works';
import { empty } from './holders';

/** Per pre-built type: population (recruits an hour, pool cap), blessing radius (tiles from its centre), favour and prestige (score an hour), a well. */
export interface PreFn { pop?: number; cap?: number; bless?: number; favour?: number; prestige?: number; well?: true }
export const PREBUILT: Partial<Record<BuildingType, PreFn>> = {
  house: { pop: 0.5, cap: 2 },
  cottage: { pop: 0.25, cap: 1 },
  tent: { pop: 0.25, cap: 1 },
  temple: { bless: 6, favour: 0.25 },
  shrine: { bless: 8, favour: 0.1 },
  statue: { prestige: 0.1 },
  well: { well: true },
};
/** Blessing: ticks a squad stands in the precinct, ticks it lasts, wounded share added (FALL.cap still holds), heal multiplier. */
export const BLESS = { stand: 300, ticks: 9000, share: 0.05, heal: 1.15 };
/** Wells: upkeep relief within `rest` tiles; fire within `rest` beaten out x`douse`; a foe within `by` for `foul` ticks fouls it `fouled` ticks. */
export const WELL = { rest: 12, upkeep: 0.8, douse: 2, by: 1.5, foul: 300, fouled: 18000 };
/** Favour and prestige together, most score an hour a team. */
export const PRESTIGE_CAP = 2;
/** A town is ruined with this share of its houses (and its temple, if it has one) ruined. */
export const TOWN_RUIN = 0.75;
const EVERY = 10; // ticks between the function scans

export interface PreSquad { id: number; team: number; alive: number; cx: number; cy: number; civ: boolean }
export interface PreUnit { x: number; y: number; alive: boolean; civ: unknown; squad: { team: number } }
export interface PreHost { squads: readonly PreSquad[]; units: readonly PreUnit[]; mob: number }

/** A real owner: an alliance team (not neutral, not the mobs). */
const real = (team: number, mob: number) => team !== NEUTRAL_TEAM && team !== mob && team >= 0;
const up = (b: Piece) => b.state === 'done' || b.state === 'damaged';

export function createTowns(works: Works, host: PreHost) {
  const stand = new Map<number, number>(); // squad id -> ticks in a precinct of its team
  const blessed = new Map<number, number>(); // squad id -> blessed until tick
  let tick = 0;

  const pieces = () => works.prebuilt();
  const working = (b: Piece) => up(b) && !b.pre!.gone && real(b.team, host.mob);
  const wellOk = (b: Piece) => b.type === 'well' && working(b) && b.pre!.fouled <= tick;

  /** Towns: the pieces grouped by claim point (and owner, for those outside any). */
  const towns = (): TownSnap[] => {
    const by = new Map<string, Piece[]>();
    for (const b of pieces()) {
      if (b.pre!.gone) continue;
      const k = b.pre!.zone >= 0 ? `${b.pre!.zone}` : `-1:${b.team}`;
      let l = by.get(k);
      if (!l) by.set(k, (l = []));
      l.push(b);
    }
    const out: TownSnap[] = [];
    for (const list of by.values()) {
      const team = list[0].team, zone = list[0].pre!.zone;
      let houses = 0, standing = 0, pool = 0, cap = 0, favour = 0, prestige = 0, temples = 0, templesUp = 0;
      for (const b of list) {
        const f = PREBUILT[b.type];
        if (!f) continue;
        if (f.pop) {
          houses++;
          if (up(b)) (standing++, (pool += f.pop), (cap += f.cap ?? 0));
        }
        if (b.type === 'temple') (temples++, up(b) && templesUp++);
        if (up(b)) (favour += f.favour ?? 0), (prestige += f.prestige ?? 0);
      }
      const ruined = houses > 0 && houses - standing >= houses * TOWN_RUIN && (temples === 0 || templesUp === 0);
      out.push({ claim: zone, team, houses, standing, pool: ruined ? 0 : pool, cap: ruined ? 0 : cap, favour: ruined ? 0 : favour, prestige, ruined });
    }
    return out;
  };

  return {
    saveRoot: () => ({ stand, blessed, tick }),
    loadRoot: (o: { tick: number }) => void (tick = o.tick),
    towns,
    /** The recruit pool (an hour) and its cap the team's towns give. */
    population(team: number): { rate: number; cap: number } {
      let rate = 0, cap = 0;
      if (!real(team, host.mob)) return { rate, cap };
      for (const t of towns()) if (t.team === team) (rate += t.pool), (cap += t.cap);
      return { rate, cap };
    },
    /** Favour and prestige of the team's towns, score an hour (at most PRESTIGE_CAP). */
    prestige(team: number): number {
      let s = 0;
      if (!real(team, host.mob)) return 0;
      for (const t of towns()) if (t.team === team) s += t.favour + t.prestige;
      return Math.min(PRESTIGE_CAP, s);
    },
    /** Upkeep multiplier of a squad of `team` resting at (x,y): WELL.upkeep near a working own well. */
    upkeepAt(team: number, x: number, y: number): number {
      for (const b of pieces()) if (b.team === team && wellOk(b) && (b.x - x) ** 2 + (b.y - y) ** 2 <= WELL.rest ** 2) return WELL.upkeep;
      return 1;
    },
    /** How much faster men beat out the fire on b: a working well of its team near. */
    douse(b: Piece): number {
      for (const o of pieces()) if (o.team === b.team && wellOk(o) && (o.x - b.x) ** 2 + (o.y - b.y) ** 2 <= WELL.rest ** 2) return WELL.douse;
      return 1;
    },
    blessed: (squad: number) => (blessed.get(squad) ?? -1) > tick,
    tick(t: number) {
      tick = t;
      if (t % EVERY !== 0 || !pieces().length) return;
      // blessing: squads in an own precinct
      const seen = new Set<number>();
      for (const b of pieces()) {
        const r = PREBUILT[b.type]?.bless;
        if (!r || !working(b)) continue;
        for (const s of host.squads) {
          if (s.team !== b.team || s.alive === 0 || seen.has(s.id) || (s.cx - b.x) ** 2 + (s.cy - b.y) ** 2 > r * r) continue;
          seen.add(s.id);
          const n = (stand.get(s.id) ?? 0) + EVERY;
          if (n >= BLESS.stand) {
            blessed.set(s.id, t + BLESS.ticks);
            stand.delete(s.id);
          } else stand.set(s.id, n);
        }
      }
      for (const id of [...stand.keys()]) if (!seen.has(id)) stand.delete(id);
      for (const [id, until] of [...blessed]) if (until <= t) blessed.delete(id);
      for (const b of pieces()) {
        // wells: a foe standing by one fouls it
        if (b.type === 'well' && working(b)) {
          let foe = false;
          for (const u of host.units) if (u.alive && !u.civ && u.squad.team !== b.team && (u.x - b.x) ** 2 + (u.y - b.y) ** 2 <= WELL.by ** 2) (foe = true);
          const n = foe ? b.pre!.foulT + EVERY : 0;
          if (n >= WELL.foul) works.foul(b.id, 0, t + WELL.fouled);
          else works.foul(b.id, n);
        }
        // a town's cache, carried off: gone
        if (b.def.cache && up(b) && b.hold && empty(b.hold)) works.vanish(b.id);
      }
    },
  };
}
export type Towns = ReturnType<typeof createTowns>;
