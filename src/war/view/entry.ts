/**
 * Where a squad entering a region from the world map stands: the middle of its team's entry, by the live server's rule
 * (server/src/war/room.ts `entry`: team 0 N, 1 E, 2 S, 3 W; no entry on that side, the one nearest the middle of that
 * edge; no entries at all, the map's middle). The offline world entry spawns the player's squad there, and the camera
 * opens on the player's men (`ownCentre`) once they stand in the region.
 */
import type { RegionData, Snapshot } from '../types';

const SIDES = ['N', 'E', 'S', 'W'] as const;

export function entrySpot(r: Pick<RegionData, 'w' | 'h' | 'entries'>, team: number): { x: number; y: number } {
  const side = SIDES[team % SIDES.length], { w, h, entries } = r;
  const [mx, my] = side === 'N' ? [w / 2, 0] : side === 'S' ? [w / 2, h] : side === 'W' ? [0, h / 2] : [w, h / 2];
  const d = (e: RegionData['entries'][number]) => (e.x + e.w / 2 - mx) ** 2 + (e.y + e.h / 2 - my) ** 2;
  const e = entries.find((x) => x.side === side) ?? [...entries].sort((a, b) => d(a) - d(b))[0] ?? { x: 0, y: 0, w, h };
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

/** The middle of the player's (team 0) living men in a snapshot; null while he has none here. */
export function ownCentre(s: Pick<Snapshot, 'units' | 'squads'> | null): { x: number; y: number } | null {
  if (!s) return null;
  const mine = new Set(s.squads.filter((q) => q.team === 0).map((q) => q.id));
  const us = s.units.filter((u) => mine.has(u.squad) && u.state !== 'dead');
  if (!us.length) return null;
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
}
