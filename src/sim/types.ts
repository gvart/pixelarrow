import type { CombatStats } from './stats';
import type { Formation, FormationType } from './formation';

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
}

export interface BattleSetup {
  seed: number;
  armies: [ArmySpec, ArmySpec];
  width?: number;
  height?: number;
  /** Battle time limit in seconds. */
  timeLimit?: number;
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
}

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
  | { type: 'end'; tick: number; winner: Side | -1 };

export type Order =
  | { kind: 'form'; group: number; cx: number; cy: number; fx: number; fy: number; frontage: number; type?: FormationType }
  | { kind: 'preset'; group: number; type: FormationType }
  | { kind: 'order'; group: number; order: GroupOrder }
  | { kind: 'shieldwall'; group: number; on?: boolean }
  | { kind: 'loose'; group: number; on?: boolean }
  | { kind: 'detach'; unit: number }
  | { kind: 'rejoin'; unit: number }
  | { kind: 'assign'; unit: number; group: number };

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
  hp: number;
  maxHp: number;
  wear: Wear;
}

export interface BattleResult {
  winner: Side | -1;
  ticks: number;
  units: UnitResult[];
}
