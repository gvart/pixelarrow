import type { CombatStats } from './stats';
import type { Formation, FormationType } from './formation';
import type { AbilityId } from '../data/perks';
import type { TerrainGrid } from './terrain';

export type Side = 0 | 1;
export type UnitState = 'ready' | 'routing' | 'dead' | 'fled';
export type GroupOrder = 'hold' | 'advance' | 'charge' | 'fallback';
export type GroupRole = 'main' | 'skirmish' | 'reserve' | 'flank';
export type HitDir = 'front' | 'side' | 'rear';

/** What the campaign layer hands the simulation for each soldier. */
export interface UnitSpec {
  heroId: string;
  name: string;
  level: number;
  group: number; // index into the side's group list
  stats: CombatStats;
  /** Starting HP when not full (world bosses carry their wounds between clan attacks; 0 = a severed head). Missing = full. */
  hp0?: number;
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
  /** The war horn: the whole army rallies. */
  | { type: 'horn'; tick: number; side: Side; targets: number[] }
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
  | { kind: 'horn' };

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
