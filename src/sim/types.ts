import type { CombatStats } from './stats';
import type { Formation, FormationType } from './formation';
import type { AbilityId } from '../data/perks';
import type { TerrainGrid } from './terrain';
import type { ProcId } from './powers';

export type Side = 0 | 1;
export type UnitState = 'ready' | 'routing' | 'dead' | 'fled';
/**
 * Group orders. `feint` is sim train 2 (formations-orders.md R3, FO-02): an
 * ineligible group ignores it.
 */
export const GROUP_ORDERS = ['hold', 'advance', 'charge', 'fallback', 'feint'] as const;
export type GroupOrder = (typeof GROUP_ORDERS)[number];
export type GroupRole = 'main' | 'skirmish' | 'reserve' | 'flank';
export type HitDir = 'front' | 'side' | 'rear';

/** Bot doctrines (ai-doctrines.md R1); `steady` plays like today's AI. The records live in src/data/doctrines.ts (AI-01). */
export const DOCTRINE_IDS = ['steady', 'rush', 'hammer', 'swarm', 'fury'] as const;
export type DoctrineId = (typeof DOCTRINE_IDS)[number];
/** A setup without a doctrine plays the steady one. */
export const DEFAULT_DOCTRINE: DoctrineId = 'steady';

/** Field works placed in deployment with the `work` order (field-works.md R3). */
export const WORK_TYPES = ['stakes', 'ditch', 'laager'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
/** Most segments of one work type an army may carry (field-works.md R4, WORKS_MAX). */
export const WORKS_MAX = 3;
/** A side's works allowance, in segments. Missing = none. */
export type WorksAllowance = Record<WorkType, number>;

/** What the campaign layer hands the simulation for each soldier. */
export interface UnitSpec {
  heroId: string;
  name: string;
  level: number;
  group: number; // index into the side's group list
  stats: CombatStats;
  /** Starting HP when not full (world bosses carry their wounds between clan attacks; 0 = a severed head). Missing = full. */
  hp0?: number;
  /** The band's captain: a standard bearer (ai-doctrines.md R6, abilities.md R5). Missing = false. */
  captain?: boolean;
}

export interface GroupSpec {
  name: string;
  role: GroupRole;
  formation: FormationType;
}

export interface ArmySpec {
  units: UnitSpec[];
  groups: GroupSpec[];
  bot: boolean;
  /** War horns (a battle consumable): each sounds one army-wide rally. Missing = none. */
  horn?: number;
  /** The bot's doctrine (ai-doctrines.md). Missing = DEFAULT_DOCTRINE. */
  doctrine?: DoctrineId;
  /** The bot fights to the end: its doctrine's retreatAt is treated as 0 (ladder floors, V5-052). Missing = false. */
  holdField?: boolean;
  /** Field works this side may place in deployment (field-works.md R3). Missing = none. */
  works?: WorksAllowance;
}

export interface BattleSetup {
  seed: number;
  armies: [ArmySpec, ArmySpec];
  width?: number;
  height?: number;
  /** Battle time limit in seconds. */
  timeLimit?: number;
  /** Battlefield terrain (seeded from the world map). Missing = an open, flat plain. */
  terrain?: TerrainGrid;
}

export interface Wear {
  weapon: number;
  shield: number;
  helmet: number;
  armor: number;
}

export interface SimUnit {
  id: number;
  heroId: string;
  name: string;
  level: number;
  side: Side;
  group: number; // global group id
  homeGroup: number; // group to rejoin after detaching
  stats: CombatStats;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  hp: number;
  morale: number;
  stamina: number;
  ammo: number;
  state: UnitState;
  slotLat: number;
  slotDep: number;
  cooldown: number;
  targetId: number;
  engaged: boolean;
  momentum: number;
  stun: number;
  lastAttackTick: number;
  lastHitTick: number;
  lastBlockTick: number;
  lastShotTick: number;
  kills: number;
  dmgDealt: number;
  killedBy: number; // -1 = not killed, else side that killed
  wear: Wear;
  /** Struck down but only knocked out (state stays 'dead' for the battle). */
  ko: boolean;
  /** Abilities and their remaining cooldown in ticks (parallel arrays). */
  abil: AbilityId[];
  abilCd: number[];
  /** Ticks of berserk fury left. */
  berserk: number;
  /** Ticks dazed by a shield bash (cannot block, takes extra damage). */
  daze: number;
  /** Bitmask of auras currently affecting this unit (AURAS[id].bit). */
  aura: number;
  /** Body radius in field units (0.3 for a man; horses, chariots and bears are bigger). */
  rad: number;
  /** Riders: current speed along the facing, field units / s (a horse cannot stop at once). */
  spd: number;
  /** Tick this unit was last cut by chariot scythes. */
  lastScytheTick: number;
}

export interface SimGroup {
  id: number;
  side: Side;
  name: string;
  role: GroupRole;
  order: GroupOrder;
  formation: Formation;
  shieldWall: boolean;
  fireAtWill: boolean;
  /** Field units left to walk backwards while falling back. */
  fallbackLeft: number;
  contact: boolean;
  lastFlankEvent: number;
  routed: boolean;
  individual: boolean;
  disbanded: boolean;
  /** Focused enemy group id, -1 or missing = none (formations-orders.md R4; FO-01). */
  focus?: number;
  /** HUD state: focus set but no man of the group has a focused target in range (FO-01). */
  focusOutOfRange?: boolean;
  /** HUD state: seconds with shooting on and no enemy in range (FO-01). */
  noTargetS?: number;
}

export type ProjectileKind = 'javelin' | 'arrow' | 'stone';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  side: Side;
  shooterId: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t0: number;
  dur: number;
  dmg: number;
  done: boolean;
  hitId: number;
  /** Fraction of the target's armour this missile ignores (missing = none). */
  ap?: number;
}

export type MythAct =
  | 'hurl' | 'boulder' | 'stomp' | 'quake'
  | 'sever' | 'regrow' | 'seal' | 'grab'
  | 'dive' | 'strike' | 'climb'
  | 'pounce' | 'land' | 'immune'
  | 'charge' | 'trample' | 'balk' | 'enrage'
  | 'breath' | 'goat' | 'tail'
  | 'roar';

export type SimEvent =
  | { type: 'contact'; tick: number; side: Side; group: number }
  | { type: 'flanked'; tick: number; side: Side; group: number }
  | { type: 'rout'; tick: number; side: Side; group: number }
  | { type: 'unitRout'; tick: number; unit: number }
  | { type: 'rally'; tick: number; unit: number }
  | { type: 'death'; tick: number; unit: number; by: number }
  | { type: 'hit'; tick: number; unit: number; by: number; dmg: number; dir: HitDir; ranged: boolean }
  | { type: 'block'; tick: number; unit: number; by: number }
  | { type: 'shot'; tick: number; unit: number; proj: number }
  | { type: 'impact'; tick: number; unit: number; by: number }
  | { type: 'land'; tick: number; proj: number; hit: boolean }
  | { type: 'retreat'; tick: number; side: Side; caught: number; pursuit: number }
  /** An ability was used; targets = units affected (stunned, shooters, rallied...). */
  | { type: 'ability'; tick: number; unit: number; ability: AbilityId; targets: number[] }
  /** A mythical beast's signature move (src/sim/myth.ts); (x, y) where, (tx, ty) towards, dur in ticks for things in flight. */
  | { type: 'myth'; tick: number; unit: number; act: MythAct; x: number; y: number; tx: number; ty: number; dur: number; targets: number[] }
  /** An item power or a set special fired (src/sim/powers.ts); targets = units it touched. */
  | { type: 'proc'; tick: number; unit: number; power: ProcId; targets: number[] }
  /** The war horn: the whole army rallies. */
  | { type: 'horn'; tick: number; side: Side; targets: number[] }
  /** Sim train 2 events (output only, never hashed). */
  /** A group's rout shook its own men and the units near it (formations-orders.md R5). */
  | { type: 'cohesion'; tick: number; side: Side; group: number; targets: number[] }
  /** A group drawn by a feint is disordered until untilTick (formations-orders.md R3). */
  | { type: 'disordered'; tick: number; group: number; untilTick: number }
  /** A side's army broke (formations-orders.md R6). */
  | { type: 'armyBreak'; tick: number; side: Side }
  /** A charge broke on a stakes cell at (x, y) (field-works.md R2). */
  | { type: 'stakesBreak'; tick: number; unit: number; x: number; y: number }
  /** A side's standard bearer fell (abilities.md R5). */
  | { type: 'standardLost'; tick: number; side: Side; unit: number }
  | { type: 'end'; tick: number; winner: Side | -1 };

export type Order =
  | { kind: 'form'; group: number; cx: number; cy: number; fx: number; fy: number; frontage: number; type?: FormationType }
  | { kind: 'preset'; group: number; type: FormationType }
  | { kind: 'order'; group: number; order: GroupOrder }
  | { kind: 'shieldwall'; group: number; on?: boolean }
  | { kind: 'loose'; group: number; on?: boolean }
  | { kind: 'detach'; unit: number }
  | { kind: 'rejoin'; unit: number }
  | { kind: 'assign'; unit: number; group: number }
  /** A hero uses an active ability (validated: ready, off cooldown, a target if it needs one). */
  | { kind: 'ability'; unit: number; ability: AbilityId }
  /** The whole side quits the field: the battle ends as its defeat (see Battle.retreat). */
  | { kind: 'retreat' }
  /** Sound the war horn (if the army carries one): every man rallies at once. */
  | { kind: 'horn' }
  /*
   * Sim train 2 orders. Until each feature lands the sim has no case for it:
   * the order is logged (orderLog) and otherwise ignored, so hashes are unchanged.
   */
  /** Turn a group to (fx, fy) and keep its order (formations-orders.md R1; FO-01). */
  | { kind: 'face'; group: number; fx: number; fy: number }
  /** Missile men fire at enemy group `target` first; -1 clears (formations-orders.md R4; FO-01). */
  | { kind: 'focus'; group: number; target: number }
  /** Place a work segment at cell (x, y), across (fx, fy); deployment only (field-works.md R3). */
  | { kind: 'work'; type: WorkType; x: number; y: number; fx: number; fy: number }
  /** Remove the segment at cell (x, y); deployment only (field-works.md R3). */
  | { kind: 'unwork'; x: number; y: number };

export interface LoggedOrder {
  tick: number;
  side: Side;
  order: Order;
}

export interface UnitResult {
  heroId: string;
  side: Side;
  state: UnitState;
  kills: number;
  killedBy: number;
  /** Struck down but survived, wounded. */
  ko: boolean;
  hp: number;
  maxHp: number;
  wear: Wear;
}

export interface BattleResult {
  winner: Side | -1;
  /** The side that ordered a retreat, if the battle ended that way. */
  retreated?: Side | null;
  ticks: number;
  units: UnitResult[];
}
