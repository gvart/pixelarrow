/**
 * M7c region depth (docs/WAR.md "Region lore and depth"): how far a region lies from the living halls, counted in
 * danger: 0 the homes, 1 the entries, 2 the frontier towns and inner pockets, 3 the gates, 4 the rim edges and Omphalos.
 * Depth scales a region's fauna (mob hp and damage), its lairs (authored counts), the claim channel (seconds, men and
 * players beside the banner), how long a cleared lair stays clear, and the yield of its nodes (rare goods excepted).
 */
import type { RegionData } from '../types';

export interface DepthRule {
  /** Mob hp and damage multiplier. */
  mob: number;
  /** Ticks a cleared lair stays clear (while its area is unclaimed it then comes back). */
  respawn: number;
  /** Claim channel: ticks, men of the claiming team beside the banner, distinct players among them. */
  claim: { ticks: number; men: number; players: number };
  /** Node yield multiplier (each node's max and regrowth). */
  yield: number;
  /** Lairs a region of this depth is authored with (the region checks; the sim spawns what is authored). */
  lairs: readonly [number, number];
  /** Score an hour of holding it (the server, M7f), frontier towns and Omphalos aside. */
  score: number;
}

export const DEPTH: readonly DepthRule[] = [
  { mob: 1, respawn: 6000, claim: { ticks: 300, men: 3, players: 1 }, yield: 1, lairs: [0, 0], score: 0 },
  { mob: 1, respawn: 6000, claim: { ticks: 300, men: 3, players: 1 }, yield: 1, lairs: [3, 5], score: 0 },
  { mob: 1.25, respawn: 12000, claim: { ticks: 600, men: 6, players: 1 }, yield: 1.25, lairs: [4, 6], score: 1 },
  { mob: 1.5, respawn: 18000, claim: { ticks: 900, men: 9, players: 2 }, yield: 1.5, lairs: [5, 7], score: 2 },
  { mob: 2, respawn: 36000, claim: { ticks: 1200, men: 12, players: 3 }, yield: 2, lairs: [6, 8], score: 1 },
];

/** Depth of every world region (src/war/world/regions.ts ids), as the WAR.md table. */
export const REGION_DEPTH: Readonly<Record<string, number>> = {
  dodona: 0, skythia: 0, kyrene: 0, elaia: 0,
  'dodona-n': 1, 'dodona-w': 1, 'dodona-e': 1, 'dodona-s': 1, 'skythia-n': 1, 'skythia-e': 1, 'skythia-w': 1, 'skythia-s': 1,
  'kyrene-n': 1, 'kyrene-e': 1, 'kyrene-s': 1, 'kyrene-w': 1, 'elaia-n': 1, 'elaia-w': 1, 'elaia-s': 1, 'elaia-e': 1,
  kleisoura: 2, stymphalia: 2, achelous: 2, ammos: 2, moors: 2, kimmeria: 2, savanna: 2, bacchae: 2,
  saddle: 3, erymanthos: 3, gorge: 3, canyons: 3,
  krios: 4, siren: 4, ammon: 4, delta: 4, omphalos: 4,
};

/** A region's depth: its own field, else the world table, else 1 (test and sandbox maps play as an entry). */
export const depthOf = (r: Pick<RegionData, 'id' | 'depth'>): number => Math.max(0, Math.min(4, r.depth ?? REGION_DEPTH[r.id] ?? 1));
export const depthRule = (r: Pick<RegionData, 'id' | 'depth'>): DepthRule => DEPTH[depthOf(r)];

/**
 * A bandit host (docs/WAR.md "Bandit host"): its captain (a bandit at hp x `captain.hp`, damage x `captain.dmg`) leads
 * the first squad of his lair, the rest an elite guard (x `guard`); the host's lairs keep the town's gates shut and man
 * its towers while he lives; every `raid.every` ticks `raid.men` of a host lair go for the nearest foe cart within
 * `raid.r` tiles.
 */
export const HOST = { captain: { hp: 3, dmg: 1.5 }, guard: { hp: 1.25, dmg: 1.25 }, raid: { every: 18000, men: 8, r: 80 } };
