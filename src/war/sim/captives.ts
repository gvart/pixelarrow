/**
 * W-68 captives and dismissal (docs/WAR.md "Prisoners"): the pure rules the server (server/src/war/persons.ts) and the
 * roster share. A captured man leaves his owner's army at once; his captor holds him in a fort. After CAPTIVE.askMs the
 * captor may ask him to join: he refuses for good with refuseChance(level), fixed per man (refuses: seeded by his id),
 * else he joins with his level, class and record. Released (by the captor, or after CAPTIVE.holdMs unclaimed) or
 * dismissed by his owner, he wakes as a named soul at a shrine (src/war/sim/souls.ts spawnNamed) for CAPTIVE.soulMs; the
 * owner who dismissed him may not claim him for CAPTIVE.barMs.
 */
import { WORLD_REGIONS } from '../world/regions';

const HOUR = 3_600_000;

export const CAPTIVE = {
  /** Held this long before the captor may ask him to join. */
  askMs: 2 * HOUR,
  /** Unclaimed this long, he is released (a soul). */
  holdMs: 24 * HOUR,
  /** Refusal: base chance, plus this a level above 1. */
  refuse: 0.3,
  refusePerLevel: 0.05,
  /** A named soul waits this long before he fades (a plain soul: 10 min). */
  soulMs: 6 * HOUR,
  /** The owner who dismissed him may not claim his soul for this long. */
  barMs: 1 * HOUR,
} as const;

/** The chance he refuses to join his captor, by level. */
export const refuseChance = (level: number): number => Math.min(1, CAPTIVE.refuse + CAPTIVE.refusePerLevel * Math.max(0, level - 1));

/** FNV-1a of a string, as a fraction in [0, 1). */
function unit(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0x1_0000_0000;
}

/** Does this man refuse to join his captor? Fixed per man and level (asking again gives the same answer). */
export const refuses = (id: string, level: number): boolean => unit(`join:${id}`) < refuseChance(level);

/** May the captor ask him now? `until` is when he is released (capture + holdMs). */
export const askAt = (until: number): number => until - CAPTIVE.holdMs + CAPTIVE.askMs;

/**
 * Where his soul may wake, in order: this region, then the world regions nearest to it (a region without a shrine is
 * skipped); a region off the world map (a test region): the world regions nearest the centre.
 */
export function soulRegions(from: string): string[] {
  const at = WORLD_REGIONS.find((r) => r.id === from)?.pos ?? { x: 0, y: 0 };
  const rest = WORLD_REGIONS.filter((r) => r.id !== from).sort((a, b) => (a.pos.x - at.x) ** 2 + (a.pos.y - at.y) ** 2 - ((b.pos.x - at.x) ** 2 + (b.pos.y - at.y) ** 2) || a.id.localeCompare(b.id));
  return [from, ...rest.map((r) => r.id)];
}
