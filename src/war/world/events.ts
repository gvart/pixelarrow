/**
 * World events (W-62): every few hours something stirs somewhere on the map for a short while. The schedule is a pure
 * function of the season's seed and start, so the server (WarWorldDO: its alarm opens and closes each one) and any
 * client agree on it; the world snapshot carries the running ones and the next.
 *
 *  - bossWake: a region's guardian wakes: back now if slain or away (and the region unheld), its hp x WAKE.hp; its kill
 *    while the event runs drops its rare goods twice (server/src/war/room.ts).
 *  - caravanRush: a frontier market pays a bonus: every convoy that arrives there with cargo scores its alliance
 *    RUSH.perLoad a load, at most RUSH.cap an arrival (server/src/war/world/world.ts due).
 *  - soulStorm: souls wake in one region STORM.chance times as often, up to STORM.max at once, rolled twice as often
 *    (src/war/sim/souls.ts).
 *  - landmarkSiege: a landmark is open to take: its capture scores the captor SIEGE.capture, and its holder at the end
 *    with the landmark garrisoned SIEGE.held (world.ts report and eventTick).
 *
 * Roughly one event every EVENTS.every (± EVENTS.jitter), each EVENTS.minMs..maxMs long, never two at once; the kinds
 * come round in a shuffled cycle of four so each shows as often.
 */
import { Rng, hashString } from '../../sim/rng';
import { WAR_BOSSES } from '../../data/warBosses';
import { LANDMARKS } from '../../data/warLandmarks';
import { WORLD_REGIONS } from './regions';
import { FRONTIER_TOWNS } from './season';

export type WorldEventKind = 'bossWake' | 'caravanRush' | 'soulStorm' | 'landmarkSiege';
export const EVENT_KINDS: readonly WorldEventKind[] = ['bossWake', 'caravanRush', 'soulStorm', 'landmarkSiege'];

/** One scheduled event: `id` its index in the season's schedule. */
export interface WorldEvent { id: number; kind: WorldEventKind; region: string; startAt: number; endAt: number }

const MIN = 60_000;
export const EVENTS = { every: 180 * MIN, jitter: 45 * MIN, minMs: 20 * MIN, maxMs: 60 * MIN, first: 60 * MIN } as const;
export const WAKE = { hp: 1.5, loot: 2 } as const;
export const RUSH = { perLoad: 1, cap: 20 } as const;
export const STORM = { chance: 4, max: 10 } as const;
export const SIEGE = { capture: 20, held: 10 } as const;

/** Where each kind may happen. */
export const EVENT_REGIONS: Record<WorldEventKind, readonly string[]> = {
  bossWake: [...new Set(WAR_BOSSES.map((b) => b.region))],
  caravanRush: FRONTIER_TOWNS,
  soulStorm: WORLD_REGIONS.filter((r) => r.role !== 'home').map((r) => r.id),
  landmarkSiege: LANDMARKS.map((l) => l.region),
};

/** Names and the one-line rule each shows (world map card, region banner). */
export const EVENT_INFO: Record<WorldEventKind, { name: string; rule: string }> = {
  bossWake: { name: 'Boss wakes', rule: `its guardian is back and stronger (hp x${WAKE.hp}); slain now it drops its rare goods twice` },
  caravanRush: { name: 'Caravan rush', rule: `every convoy arriving with cargo scores ${RUSH.perLoad} a load (up to ${RUSH.cap})` },
  soulStorm: { name: 'Soul storm', rule: `souls wake ${STORM.chance}x as often, up to ${STORM.max} at once` },
  landmarkSiege: { name: 'Landmark siege', rule: `take the landmark for +${SIEGE.capture}; hold it garrisoned to the end for +${SIEGE.held}` },
};

/** The season's seed: from its id and start. */
export const seasonSeed = (id: number, startAt: number): number => hashString(`war-season:${id}:${startAt}`) >>> 0;

/** Every event of a season (seed, start, end), in order; the same inputs, the same schedule. */
export function seasonEvents(seed: number, startAt: number, endAt: number): WorldEvent[] {
  const rng = new Rng(seed || 1), out: WorldEvent[] = [];
  let cycle: WorldEventKind[] = [], last = '';
  let at = startAt + EVENTS.first + Math.round(rng.range(0, EVENTS.jitter));
  while (at < endAt) {
    if (!cycle.length) {
      cycle = [...EVENT_KINDS];
      for (let i = cycle.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
      }
    }
    const kind = cycle.shift()!, pool = EVENT_REGIONS[kind].filter((r) => r !== last);
    const region = pool[Math.floor(rng.next() * pool.length)];
    const len = Math.round(EVENTS.minMs + rng.next() * (EVENTS.maxMs - EVENTS.minMs));
    const endEv = Math.min(at + len, endAt);
    out.push({ id: out.length, kind, region, startAt: at, endAt: endEv });
    last = region;
    at = endEv + EVENTS.every - (EVENTS.minMs + EVENTS.maxMs) / 2 + Math.round(rng.range(-EVENTS.jitter, EVENTS.jitter));
  }
  return out;
}

/** The events running at `now`. */
export const activeEvents = (list: readonly WorldEvent[], now: number): WorldEvent[] => list.filter((e) => e.startAt <= now && now < e.endAt);
/** The first event still to start after `now` (null: none this season). */
export const nextEvent = (list: readonly WorldEvent[], now: number): WorldEvent | null => list.find((e) => e.startAt > now) ?? null;
