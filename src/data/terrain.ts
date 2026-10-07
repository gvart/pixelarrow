/**
 * Battlefield terrain rules (data-driven). The simulation reads these through
 * src/sim/terrain.ts; the battlefield generator (src/world/battlefield.ts)
 * paints the grid; the renderer and the deployment tooltip show them.
 *
 * Every number is a multiplier or a chance; an open plain cell is neutral
 * (speed 1, no cover, no disorder), so a battle without terrain plays exactly
 * as before.
 */

export type TerrainKind = 'open' | 'scrub' | 'forest' | 'water' | 'ford' | 'rough' | 'rocks' | 'sand' | 'sea';
export const TERRAIN_KINDS: TerrainKind[] = ['open', 'scrub', 'forest', 'water', 'ford', 'rough', 'rocks', 'sand', 'sea'];

export interface TerrainDef {
  kind: TerrainKind;
  /** One character in the serialized grid (BattleSetup.terrain.cells). */
  code: string;
  name: string;
  /** Short effect summary for the deployment tooltip. */
  desc: string;
  /** Movement speed multiplier. */
  speed: number;
  /** Nobody can stand here (rocks, the sea). */
  blocked: boolean;
  /** Chance that a missile aimed at a man standing here hits a tree instead. */
  cover: number;
  /** Formation cohesion lost: slots scatter by up to this many paces. */
  scatter: number;
  /** Block chance multiplier (footing, branches, wading). */
  blockMult: number;
  /** A shield wall cannot form here (its block, shove and brace bonuses are lost). */
  noWall: boolean;
  /** Multiplier on the braced-spear bonus against chargers. */
  braceMult: number;
}

const defs: TerrainDef[] = [
  { kind: 'open', code: '.', name: 'Open ground', desc: 'No effect.', speed: 1, blocked: false, cover: 0, scatter: 0, blockMult: 1, noWall: false, braceMult: 1 },
  { kind: 'scrub', code: ',', name: 'Scrub', desc: 'A little slower, light cover.', speed: 0.88, blocked: false, cover: 0.1, scatter: 0.15, blockMult: 1, noWall: false, braceMult: 1 },
  { kind: 'forest', code: 'f', name: 'Forest', desc: 'Slow, ranks break up, cover from missiles, no spear wall.', speed: 0.62, blocked: false, cover: 0.38, scatter: 0.45, blockMult: 0.85, noWall: false, braceMult: 0.35 },
  { kind: 'water', code: 'w', name: 'River', desc: 'Very slow wading, disordered, no shield wall.', speed: 0.32, blocked: false, cover: 0, scatter: 0.3, blockMult: 0.55, noWall: true, braceMult: 0 },
  { kind: 'ford', code: 'o', name: 'Ford', desc: 'Slow, disordered, no shield wall.', speed: 0.55, blocked: false, cover: 0, scatter: 0.15, blockMult: 0.7, noWall: true, braceMult: 0 },
  { kind: 'rough', code: 'r', name: 'Rough ground', desc: 'Stony: slower, worse footing.', speed: 0.78, blocked: false, cover: 0.05, scatter: 0.2, blockMult: 0.92, noWall: false, braceMult: 0.8 },
  { kind: 'rocks', code: 'R', name: 'Rocks', desc: 'Impassable.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0 },
  { kind: 'sand', code: 's', name: 'Beach', desc: 'Soft sand: a little slower.', speed: 0.85, blocked: false, cover: 0, scatter: 0, blockMult: 1, noWall: false, braceMult: 1 },
  { kind: 'sea', code: '~', name: 'Sea', desc: 'Impassable.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0 },
];

export const TERRAIN: Record<TerrainKind, TerrainDef> = Object.fromEntries(defs.map((d) => [d.kind, d])) as Record<TerrainKind, TerrainDef>;
export const TERRAIN_LIST: readonly TerrainDef[] = defs;

/** Terrain kind for a grid character (unknown characters are open ground). */
export function terrainByCode(c: string): TerrainDef {
  for (const d of defs) if (d.code === c) return d;
  return TERRAIN.open;
}

/**
 * High ground. Heights are whole levels 0..MAX_HEIGHT; the difference between
 * attacker and target (capped at maxDiff) scales these effects.
 */
export const HEIGHT_RULES = {
  maxHeight: 3,
  maxDiff: 2,
  /** Melee damage dealt per level above the target (and taken less per level below). */
  meleeDown: 0.25,
  meleeUp: 0.2,
  /** Charge impact bonus per level when charging downhill. */
  chargeDown: 0.15,
  /** Missile damage per level above the target. */
  missileDown: 0.12,
  /** Extra missile range per level above the target ("better sight"). */
  rangeDown: 0.8,
  /** Movement speed multiplier when climbing to a higher level. */
  uphillSpeed: 0.7,
  /** Extra stamina per second spent climbing. */
  climbStamina: 3,
};
