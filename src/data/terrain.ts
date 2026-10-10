/**
 * Battlefield terrain rules (data-driven). The simulation reads these through
 * src/sim/terrain.ts; the battlefield generator (src/world/battlefield.ts)
 * paints the grid; the renderer and the deployment tooltip show them.
 *
 * Every number is a multiplier or a chance; an open plain cell is neutral
 * (speed 1, no cover, no disorder), so a battle without terrain plays exactly
 * as before.
 */

export type TerrainKind =
  | 'open'
  | 'scrub'
  | 'forest'
  | 'water'
  | 'ford'
  | 'rough'
  | 'rocks'
  | 'sand'
  | 'sea'
  // field works (design/gdd/field-works.md R1): placed in deployment, or generated for lair assaults
  | 'stakes'
  | 'ditch'
  | 'laager'
  | 'palisade'
  | 'rampart';
export const TERRAIN_KINDS: TerrainKind[] = ['open', 'scrub', 'forest', 'water', 'ford', 'rough', 'rocks', 'sand', 'sea', 'stakes', 'ditch', 'laager', 'palisade', 'rampart'];

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
  /** Horses: speed and charge impact multipliers (trees, water and stones break a charge). */
  cavSpeed: number;
  cavCharge: number;
  /** Chariots: speed multiplier, and damage per second while driven fast over it (wheels and axles break). */
  chariotSpeed: number;
  chariotDamage: number;
}

const defs: TerrainDef[] = [
  { kind: 'open', code: '.', name: 'Open ground', desc: 'No effect.', speed: 1, blocked: false, cover: 0, scatter: 0, blockMult: 1, noWall: false, braceMult: 1, cavSpeed: 1, cavCharge: 1, chariotSpeed: 1, chariotDamage: 0 },
  { kind: 'scrub', code: ',', name: 'Scrub', desc: 'A little slower, light cover.', speed: 0.88, blocked: false, cover: 0.1, scatter: 0.15, blockMult: 1, noWall: false, braceMult: 1, cavSpeed: 0.85, cavCharge: 0.85, chariotSpeed: 0.7, chariotDamage: 0.6 },
  { kind: 'forest', code: 'f', name: 'Forest', desc: 'Slow, ranks break up, cover from missiles, no spear wall. Horses slowed, chariots wreck.', speed: 0.62, blocked: false, cover: 0.38, scatter: 0.45, blockMult: 0.85, noWall: false, braceMult: 0.35, cavSpeed: 0.42, cavCharge: 0.35, chariotSpeed: 0.25, chariotDamage: 7 },
  { kind: 'water', code: 'w', name: 'River', desc: 'Very slow wading, disordered, no shield wall.', speed: 0.32, blocked: false, cover: 0, scatter: 0.3, blockMult: 0.55, noWall: true, braceMult: 0, cavSpeed: 0.3, cavCharge: 0.3, chariotSpeed: 0.2, chariotDamage: 5 },
  { kind: 'ford', code: 'o', name: 'Ford', desc: 'Slow, disordered, no shield wall.', speed: 0.55, blocked: false, cover: 0, scatter: 0.15, blockMult: 0.7, noWall: true, braceMult: 0, cavSpeed: 0.5, cavCharge: 0.5, chariotSpeed: 0.4, chariotDamage: 2 },
  { kind: 'rough', code: 'r', name: 'Rough ground', desc: 'Stony: slower, worse footing. Bad for horses and chariots.', speed: 0.78, blocked: false, cover: 0.05, scatter: 0.2, blockMult: 0.92, noWall: false, braceMult: 0.8, cavSpeed: 0.6, cavCharge: 0.6, chariotSpeed: 0.4, chariotDamage: 4.5 },
  { kind: 'rocks', code: 'R', name: 'Rocks', desc: 'Impassable.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0, cavSpeed: 0, cavCharge: 0, chariotSpeed: 0, chariotDamage: 0 },
  { kind: 'sand', code: 's', name: 'Beach', desc: 'Soft sand: a little slower.', speed: 0.85, blocked: false, cover: 0, scatter: 0, blockMult: 1, noWall: false, braceMult: 1, cavSpeed: 0.8, cavCharge: 0.85, chariotSpeed: 0.7, chariotDamage: 0 },
  { kind: 'sea', code: '~', name: 'Sea', desc: 'Impassable.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0, cavSpeed: 0, cavCharge: 0, chariotSpeed: 0, chariotDamage: 0 },
  // Field works (field-works.md R1). Appended after the old kinds, so every old grid keeps its cell indices.
  { kind: 'stakes', code: 'x', name: 'Stakes', desc: 'Breaks charges: a charge that crosses it loses its momentum, and riders are impaled. Slow, no shield wall.', speed: 0.7, blocked: false, cover: 0, scatter: 0.15, blockMult: 0.9, noWall: true, braceMult: 0, cavSpeed: 0.3, cavCharge: 0, chariotSpeed: 0.2, chariotDamage: 6 },
  { kind: 'ditch', code: 'd', name: 'Ditch', desc: 'Very slow, disordered, no shield wall. Men in it take x1.2 from blows struck from the lip.', speed: 0.45, blocked: false, cover: 0, scatter: 0.3, blockMult: 0.75, noWall: true, braceMult: 0, cavSpeed: 0.35, cavCharge: 0.2, chariotSpeed: 0.15, chariotDamage: 5 },
  { kind: 'laager', code: 'L', name: 'Wagon laager', desc: 'Impassable wall of wagons.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0, cavSpeed: 0, cavCharge: 0, chariotSpeed: 0, chariotDamage: 0 },
  { kind: 'palisade', code: 'P', name: 'Palisade', desc: 'Impassable timber wall.', speed: 0, blocked: true, cover: 0, scatter: 0, blockMult: 1, noWall: true, braceMult: 0, cavSpeed: 0, cavCharge: 0, chariotSpeed: 0, chariotDamage: 0 },
  { kind: 'rampart', code: 'p', name: 'Rampart', desc: 'Earthen bank behind a palisade: cover from missiles, a better brace.', speed: 0.9, blocked: false, cover: 0.35, scatter: 0, blockMult: 1.1, noWall: false, braceMult: 1.2, cavSpeed: 0.8, cavCharge: 0.6, chariotSpeed: 0.6, chariotDamage: 0 },
];

export const TERRAIN: Record<TerrainKind, TerrainDef> = Object.fromEntries(defs.map((d) => [d.kind, d])) as Record<TerrainKind, TerrainDef>;
export const TERRAIN_LIST: readonly TerrainDef[] = defs;

/** Terrain kind for a grid character (unknown characters are open ground). */
export function terrainByCode(c: string): TerrainDef {
  for (const d of defs) if (d.code === c) return d;
  return TERRAIN.open;
}

/**
 * Field works knobs (design/gdd/field-works.md "Tuning Knobs"). The sim reads
 * the segment lengths, the ground a work may stand on, DITCH_MULT and
 * IMPALE_MULT; the campaign reads the costs and the caps.
 */
export const WORKS = {
  /** Cells per segment, laid across the facing (R3). */
  length: { stakes: 3, ditch: 3, laager: 2 },
  /** Ground a work may be placed on (R3). */
  ground: ['open', 'scrub', 'sand', 'rough'] as TerrainKind[],
  /** A melee blow from outside a ditch on a man in it (F1); never above the high-ground cap. */
  ditchMult: 1.2,
  /** A rider entering stakes takes this share of his own charge blow (F2). */
  impaleMult: 0.5,
  /** Supplies per segment (R4, F3). */
  cost: { stakes: 6, ditch: 8, laager: 15 },
  /** Segments per encounter, and when a band caught the player (R4.2). */
  max: 3,
  caught: 1,
  /** Free stakes segments of every lair garrison (R4.4, V5-024). */
  garrisonStakes: 2,
};

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
