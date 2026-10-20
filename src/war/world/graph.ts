/**
 * The world graph over WORLD_REGIONS: lookups, border crossings (which entry side of each region faces which
 * neighbour) and travel times, all derived from the regions' places on the strategic map.
 *
 *  - Crossing side: the dominant axis of the direction to the neighbour (|dy| >= |dx|: N or S, else E or W). Several
 *    neighbours may share a side (an entry of 5 neighbours); a home's four entries are exactly its N/E/S/W.
 *  - Travel time: EDGE_MS_PER_UNIT per world unit of distance, rounded to whole seconds (an entry to its home 100 s).
 */
import { ALLIANCES } from './alliances';
import { WORLD_REGIONS } from './regions';
import type { AllianceId, Side, WorldEdge, WorldRegion } from './types';

export const EDGE_MS_PER_UNIT = 40_000;

const BY_ID = new Map(WORLD_REGIONS.map((r) => [r.id, r]));

export const worldRegion = (id: string): WorldRegion | undefined => BY_ID.get(id);
export const isWorldRegion = (id: string): boolean => BY_ID.has(id);
export const WORLD_IDS: readonly string[] = WORLD_REGIONS.map((r) => r.id);

export function adjacent(a: string, b: string): boolean {
  return BY_ID.get(a)?.adj.includes(b) ?? false;
}

function sideTo(from: WorldRegion, to: WorldRegion): Side {
  const dx = to.pos.x - from.pos.x, dy = to.pos.y - from.pos.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'N' : 'S';
  return dx < 0 ? 'W' : 'E';
}

/** The border between adjacent `a` and `b` (null when they do not touch). */
export function edge(a: string, b: string): WorldEdge | null {
  const ra = BY_ID.get(a), rb = BY_ID.get(b);
  if (!ra || !rb || !ra.adj.includes(b)) return null;
  const d = Math.hypot(rb.pos.x - ra.pos.x, rb.pos.y - ra.pos.y);
  return { a, b, sideA: sideTo(ra, rb), sideB: sideTo(rb, ra), ms: Math.round((d * EDGE_MS_PER_UNIT) / 1000) * 1000 };
}

/** Every border once (a < b). */
export const WORLD_EDGES: readonly WorldEdge[] = WORLD_REGIONS.flatMap((r) => r.adj.filter((b) => r.id < b).map((b) => edge(r.id, b)!));

/** The home region of an alliance. */
export const homeOf = (a: AllianceId): string => ALLIANCES[a].home;

/** Fewest transfers from `a` to `b` (Infinity when cut off). */
export function hops(a: string, b: string): number {
  if (a === b) return 0;
  const seen = new Set([a]);
  let front = [a];
  for (let n = 1; front.length; n++) {
    const next: string[] = [];
    for (const id of front)
      for (const nb of BY_ID.get(id)?.adj ?? []) {
        if (nb === b) return n;
        if (!seen.has(nb)) seen.add(nb), next.push(nb);
      }
    front = next;
  }
  return Infinity;
}
