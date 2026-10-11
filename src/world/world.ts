/**
 * Overland world simulation (pure TS, no Phaser): the player's party travels
 * along A* paths, roaming AI bands wander, chase and flee, lairs send out new
 * bands, and settlements keep recruit pools and market stock that refresh with
 * time. Time only passes when the scene calls `advance` (moving or waiting).
 *
 * Only `WorldSave` is persisted; the map itself is regenerated from the seed.
 */
import { bandBeast, beastEnemy } from '../game/beasts';
import { Rng, hashString } from '../sim/rng';
import type { Culture } from '../data/names';
import { BASE_ITEMS, RARITIES, itemValue, rarityRank, type Item, type ItemDef } from '../data/items';
import { RECRUIT_COST, type Hero } from '../data/units';
import { buildArmy, type ArmyMix, type EnemyArmy } from '../game/enemy';
import { makeHero, makeItem, rollRarity, setBotLevel, type IdSource } from '../game/heroes';
import { dedupeNames } from '../data/names';
import { heroPower, type CaptainMark } from '../sim/stats';
import { armyPick, bandSetPieces } from '../game/sources';
import { CLASSES, townClasses, type ClassId } from '../data/classes';
import {
  MIN_TRAVEL_COST, dangerAt, generateMap, passable, travelCost,
  type BandKind, type SettlementDef, type WorldMap,
} from './map';
import { findPath, type Tile } from './path';
import {
  EVENT_DECK, EVENT_RULES, EV_KEY, eligibleEvents, pickEvent,
  type BandMods, type EventBandKind, type EventCtx, type EventDef, type EventTrigger,
} from '../data/events';
import { DOCTRINE_IDS, type DoctrineId } from '../sim/types';
import { hash3 } from './noise';
import { GARRISON } from '../data/arc';
import {
  CAMP_RULES, FOOD_RULES, STRUCTURES, campBlocker, campEffects, campRefund, campZone, countBuilt, placeCheck,
  type CampState, type StructureId,
} from './camp';

export type PartyMode = 'wander' | 'chase' | 'flee';

/** A roaming band's kind: the map's band kinds, plus the endgame host (campaign-arc.md). */
export type PartyKind = BandKind | 'host';

export interface PartyState {
  id: number;
  kind: PartyKind;
  name: string;
  culture: Culture;
  x: number;
  y: number;
  size: number;
  /** Combat power of the band's army (sum of heroPower), for the strength indicator and AI. */
  power: number;
  level: number;
  tier: number;
  /** Seed of the band's army: the same heroes are generated at the encounter. */
  seed: number;
  /** Settlement it belongs to (a lair, or a town for mercenaries). */
  home: number;
  mode: PartyMode;
  tx: number;
  ty: number;
  /** Hours it stays put / leaves the player alone (after a fight or an escape). */
  idle: number;
  /** Times it retreated from a battle with the player (ai-doctrines.md R8), at most CAPTAIN_RULES.escapeCap; missing = 0. */
  escaped?: number;
  /** Its captain was killed or captured (ai-doctrines.md); missing = false. */
  captainDead?: boolean;
  /** Spawned by an event to hunt the player whatever the power ratio (campaign-events.md R2); missing = false. */
  hunts?: boolean;
  /** Multiplies its captain's bounty (campaign-events.md R2, 1..3); missing = 1. Read with bountyMultOf. */
  bountyMult?: number;
  /** A doctrine an event forced on it; missing = the one its mix and culture give. */
  doctrine?: DoctrineId;
}

/** Per-settlement state: which recruits / wares of the current stock epoch are gone. */
export interface SettlementState {
  epoch: number;
  bought: number[];
  sold: number[];
  /** A sacked settlement that has been rebuilt (campaign-arc.md); missing = false. */
  reborn?: boolean;
}

/** A lair's assault state (campaign-arc.md), keyed by settlement id. */
export interface LairState {
  fallen: boolean;
  /** Garrison men lost to assaults, and when (hours) the last one was lost. */
  lost: number;
  lostAt: number;
}

export type ArcStage = 'lairs' | 'host' | 'won' | 'post';
export const ARC_STAGES: readonly ArcStage[] = ['lairs', 'host', 'won', 'post'];

/** Where the campaign arc stands (campaign-arc.md). */
export interface ArcState {
  stage: ArcStage;
  /** The host's party id while it marches. */
  hostParty?: number;
  /** The start town is sacked until this time (hours). */
  sackedUntil?: number;
}

/** A campaign event drawn and saved before it is shown (campaign-events.md). */
export interface PendingEvent {
  id: string;
  seed: number;
}

/** Save size caps (campaign-events.md "Size"): flag keys, and journal entries (the most recent kept). */
export const FLAGS_CAP = 64;
export const JOURNAL_CAP = 20;

export interface WorldSave {
  seed: number;
  /** Hours since the campaign began. */
  time: number;
  /** Party position in tile units (tile centres at +0.5). */
  x: number;
  y: number;
  /** Travel goal (tile), and the settlement to enter on arrival (-1 = none). */
  dest: [number, number] | null;
  destSettlement: number;
  /** Party id the player is pursuing (-1 = none). */
  destParty: number;
  /** Settlement the party is inside (-1 = on the map). */
  inside: number;
  parties: PartyState[];
  places: SettlementState[];
  nextParty: number;
  rng: number;
  lastSpawn: number;
  /** No band may engage before this time (after an escape, a battle, leaving a town). */
  safeUntil: number;
  /** Explored tiles (fog of war), a base64 bitset; missing in old saves. */
  fog?: string;
  /** Settlements the party has discovered (ids). */
  found?: number[];
  /** Rations (one per hero per day) and supplies (camp building, the forge). */
  food?: number;
  supplies?: number;
  /** The field camp the party has pitched, if any. */
  camp?: CampState | null;
  // ---- v6 (ST-02, ADR-0002): declared for the v5 train, filled with defaults by the save migration
  /** Lairs assaulted so far, by settlement id. */
  lairs: Record<number, LairState>;
  arc: ArcState;
  /** Event flags (campaign-events.md), at most FLAGS_CAP keys. */
  flags: Record<string, number>;
  /** Event id -> the day it may next be drawn. */
  eventCd: Record<string, number>;
  /** [day, events drawn that day]. */
  eventsToday: [number, number];
  pendingEvent?: PendingEvent;
  /** Event ids and choice keys, the last JOURNAL_CAP. */
  journal: string[];
}

/** The v6 world fields of a campaign that has not touched them (new campaigns and migrated saves). */
export function v6WorldDefaults(): Pick<WorldSave, 'lairs' | 'arc' | 'flags' | 'eventCd' | 'eventsToday' | 'journal'> {
  return { lairs: {}, arc: { stage: 'lairs' }, flags: {}, eventCd: {}, eventsToday: [0, 0], journal: [] };
}

export type WorldEvent =
  | { type: 'encounter'; party: number; byPlayer: boolean }
  | { type: 'arrive'; settlement: number }
  /** A campaign event was drawn and is pending (campaign-events.md R4): the map stays paused until it is resolved. */
  | { type: 'event'; id: string };

export interface PlayerInfo {
  power: number;
  size: number;
  /** Heroes who eat (the whole roster, wounded too); defaults to size. */
  mouths?: number;
  /** The purse, for event conditions (`minGold`); missing = 0. */
  gold?: number;
}

export const WORLD_RULES = {
  /** Tiles per hour on open plain for a band of 1; bigger bands are slower. */
  speed: 3.2,
  sizeSlow: 0.012,
  vision: 7,
  contact: 0.8,
  chaseRatio: 1.1,
  fleeRatio: 0.8,
  surrenderRatio: 0.35,
  maxParties: 16,
  spawnEvery: 10,
  villageRefresh: 48,
  townRefresh: 72,
  /** Tiles the party sees around itself (fog of war). */
  sight: 6.5,
  /** Wound hours healed per hour: on the road, camping (open camp; structures add, see camp.ts), resting in a village / town. */
  healRoad: 1,
  healCamp: CAMP_RULES.heal,
  healVillage: 2.5,
  healTown: 3,
  healGoldPerHour: 1,
};

/**
 * The base of a bandit band's size (campaign-arc.md R1.3; GDD default 5, range 3-6).
 * Kept at 3: bandits spawn at their lair, where danger is 0.35 at least (0.66-1.0
 * on real maps), so every new bandit band already has 5 men or more, and a
 * bigger base only makes the opening's first fights worse (docs/v5/balance/AR-01.md).
 */
export const BANDIT_MIN = 3;

/**
 * The starter zone (V5-054, campaign-arc.md R1.3): `count` bandit bands of
 * danger `danger`, `ring` tiles from the starting town, sized
 * `min + round(danger x 5) + int(0..2)` (the GDD's BANDIT_MIN 5) at level
 * 1 + round(danger x 2). Gear `tier` 2 (so a captain) puts the 8-man opening
 * at about 60% against them; tier 1 was 91% (docs/v5/balance/AR-01.md).
 */
export const STARTER_BANDS = { count: [2, 3] as [number, number], ring: [5, 11] as [number, number], danger: [0.1, 0.3] as [number, number], min: 5, tier: 2 };

/**
 * Volunteers (campaign-arc.md R1.4, R1.5). A destroyed army gets `destroyed`
 * raw men at the starting town. While the army has fewer than `floor` men,
 * the starting town and every village offer `floorOffer` raw volunteers at
 * `floorCost` on top of their stock (recruit indices from `floorIndex`).
 */
export const VOLUNTEER_RULES = { destroyed: 5, floor: 5, floorOffer: 3, floorCost: 20, floorIndex: 100 };

/** Band captains and escapes (design/gdd/ai-doctrines.md R6, R8 and Tuning Knobs). */
export const CAPTAIN_RULES = {
  /** Bands of this gear tier and up have a captain (CAPTAIN_MIN_TIER). */
  minTier: 2,
  /** His level over the band's, capped at MAX_LEVEL (CAPTAIN_LEVEL_BONUS). */
  levelBonus: 0,
  /** Hours a band that retreated stays away (ESCAPE_IDLE_H). */
  escapeIdleH: 3,
  /** `escaped` stops counting here (ESCAPE_CAP). */
  escapeCap: 3,
};

/** The largest and most seasoned a roaming band gets (campaign-arc.md R3; 18 / 8 before the arc). */
export const BAND_CAPS = { size: 22, level: 10 };

/**
 * Tier 3 and late scaling (campaign-arc.md R3, TIER3_DAY / TIER3_LAIRS). The
 * world's lair tier is 2 until `lairs` lairs have fallen or day `day`. From
 * then on a new band forms at gear tier 3 where danger is over `danger`, and,
 * once `lairs` lairs have fallen, whenever it is raiders or mercenaries.
 */
export const TIER3_RULES = { day: 50, lairs: 2, danger: 0.85 };

/** The world's lair tier (R3): 3 once TIER3_RULES.lairs lairs have fallen or from day TIER3_RULES.day, else 2. */
export function lairTier(days: number, lairsFallen: number): 2 | 3 {
  return lairsFallen >= TIER3_RULES.lairs || days >= TIER3_RULES.day ? 3 : 2;
}

/** Does a new band of `kind` forming at `danger` get gear tier 3 (R3)? Never while the lair tier is 2. */
export function tier3Band(kind: BandKind, danger: number, days: number, lairsFallen: number): boolean {
  if (lairTier(days, lairsFallen) < 3) return false;
  return danger > TIER3_RULES.danger || (lairsFallen >= TIER3_RULES.lairs && (kind === 'raiders' || kind === 'mercs'));
}

/**
 * A new band's men, level and gear tier by kind, the danger where it forms,
 * the date and the lairs fallen (draws from `r`; the tier-3 rule draws
 * nothing, so the world's random sequence is what it was before R3).
 */
function bandShape(kind: BandKind, danger: number, days: number, lairsFallen: number, r: Rng): { size: number; level: number; tier: number } {
  const shape =
    kind === 'bandits'
      ? { size: BANDIT_MIN + Math.round(danger * 5) + r.int(0, 2), level: 1 + Math.round(danger * 2 + days * 0.04), tier: danger > 0.7 ? 2 : 1 }
      : kind === 'raiders'
        ? { size: 5 + Math.round(danger * 7) + r.int(0, 3), level: 1 + Math.round(danger * 3 + days * 0.05), tier: danger > 0.5 ? 2 : 1 }
        : { size: 6 + Math.round(danger * 6) + r.int(0, 4), level: 2 + Math.round(danger * 2 + days * 0.05), tier: 2 };
  if (tier3Band(kind, danger, days, lairsFallen)) shape.tier = 3;
  return shape;
}

/** The roll rate of each trigger (R3); a due flag event always fires. */
function eventRate(t: EventTrigger): number {
  const r = EVENT_RULES.rate;
  return t === 'march' ? r.march : t === 'camp' ? r.camp : t === 'after_battle' ? r.afterBattle : t === 'flag' ? 1 : r.arrive;
}

function clampBountyMult(m: number): number {
  return Number.isFinite(m) ? Math.max(1, Math.min(3, m)) : 1;
}

/** A band's bounty multiplier (campaign-events.md R2), 1 unless an event set one; a malformed save value reads as 1. */
export function bountyMultOf(p: Pick<PartyState, 'bountyMult'>): number {
  return typeof p.bountyMult === 'number' ? clampBountyMult(p.bountyMult) : 1;
}

/** The band's main-line class, which its captain fights as. */
function captainClass(p: PartyState): ClassId {
  if (p.kind === 'bandits') return 'thureophoros';
  return p.culture === 'celtic' ? 'celt_sword' : 'hoplite';
}

const BAND_NAMES: Record<BandKind, string> = { bandits: 'Bandits', raiders: 'Galatae raiders', mercs: 'Mercenaries' };
// The host's army is AR-04's; until then a host band (never spawned yet) fields raiders.
const BAND_MIX: Record<PartyKind, ArmyMix> = { bandits: 'bandits', raiders: 'raiders', mercs: 'mercs', host: 'raiders' };

export function partySpeed(size: number): number {
  return WORLD_RULES.speed * Math.max(0.7, 1 - WORLD_RULES.sizeSlow * size);
}

/** Strength ratio band power / player power, bucketed for the coloured indicator. */
export function threatLevel(ratio: number): 0 | 1 | 2 | 3 | 4 {
  if (ratio < 0.5) return 0;
  if (ratio < 0.85) return 1;
  if (ratio < 1.15) return 2;
  if (ratio < 1.7) return 3;
  return 4;
}

export const THREAT_LABEL = ['Weak', 'Weaker', 'Even', 'Strong', 'Deadly'];
export const THREAT_COLOR = [0x6fae5a, 0xb8c460, 0xe0b860, 0xd8743a, 0xc03028];

export class World {
  readonly map: WorldMap;
  s: WorldSave;
  rng: Rng;
  /** Remaining waypoints of the player's route (tile centres). */
  route: { x: number; y: number }[] = [];
  private aiRoutes = new Map<number, { x: number; y: number }[]>();
  private aiThink = new Map<number, number>();
  /** The event deck draws come from (campaign-events.md); tests swap in their own. */
  deck: readonly EventDef[] = EVENT_DECK;

  /** Explored tiles (1 = no fog). */
  readonly explored: Uint8Array;
  /** Tiles revealed since the scene last drained it (for the fog dissolve). */
  revealLog: number[] = [];
  /** Settlements discovered since the scene last drained it (toast + camera pan). */
  discoveries: number[] = [];
  private fogDirty = false;

  constructor(save: WorldSave, map?: WorldMap) {
    this.s = save;
    this.map = map ?? generateMap(save.seed);
    this.rng = new Rng(save.rng);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    // Older saves have no provisions, fog or camp: start them stocked, with the home country known.
    if (typeof save.food !== 'number' || !isFinite(save.food)) save.food = FOOD_RULES.startFood;
    if (typeof save.supplies !== 'number' || !isFinite(save.supplies)) save.supplies = FOOD_RULES.startSupplies;
    if (!Array.isArray(save.found)) save.found = [];
    if (save.camp && (!Array.isArray(save.camp.zone) || !Array.isArray(save.camp.built))) save.camp = null;
    if (typeof save.fog === 'string' && decodeBits(save.fog, this.explored)) {
      // ok
    } else {
      const st = this.map.settlements[this.map.start];
      this.reveal(st.x + 0.5, st.y + 0.5, WORLD_RULES.sight + 4);
      this.reveal(save.x, save.y, WORLD_RULES.sight + 1);
      this.revealLog = [];
      this.discoveries = [];
      this.fogDirty = true;
    }
    if (save.dest) this.setDestination(save.dest[0], save.dest[1], save.destSettlement, save.destParty);
  }

  // ---------------------------------------------------------------- fog of war

  isExplored(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.map.w && ty < this.map.h && this.explored[ty * this.map.w + tx] === 1;
  }

  /** Clear the fog in a disc around (x, y) (tile units). Newly seen settlements are discovered. */
  reveal(x: number, y: number, r: number): number {
    const m = this.map;
    let n = 0;
    const R = r + 1;
    for (let ty = Math.max(0, Math.floor(y - R)); ty <= Math.min(m.h - 1, Math.ceil(y + R)); ty++) {
      for (let tx = Math.max(0, Math.floor(x - R)); tx <= Math.min(m.w - 1, Math.ceil(x + R)); tx++) {
        const i = ty * m.w + tx;
        if (this.explored[i]) continue;
        // a ragged edge: each tile's reach wobbles a little
        const rr = r + (hash3(tx, ty, m.seed ^ 0x5f3759df) - 0.5) * 1.8;
        if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 > rr * rr) continue;
        this.explored[i] = 1;
        this.revealLog.push(i);
        n++;
      }
    }
    if (n === 0) return 0;
    this.fogDirty = true;
    const found = this.s.found!;
    for (const st of m.settlements) {
      if (found.includes(st.id) || !this.explored[st.y * m.w + st.x]) continue;
      found.push(st.id);
      this.discoveries.push(st.id);
      // A town or village is seen whole: its surroundings come out of the fog with it.
      if (st.kind !== 'lair') this.reveal(st.x + 0.5, st.y + 0.5, st.kind === 'town' ? 5.5 : 3.5);
    }
    return n;
  }

  // ---------------------------------------------------------------- provisions & camp

  get food(): number {
    return this.s.food ?? 0;
  }

  get supplies(): number {
    return this.s.supplies ?? 0;
  }

  get starving(): boolean {
    return this.food <= 0;
  }

  get camp(): CampState | null {
    return this.s.camp ?? null;
  }

  addFood(n: number): void {
    this.s.food = Math.max(0, Math.min(FOOD_RULES.cap, this.food + n));
  }

  addSupplies(n: number): void {
    this.s.supplies = Math.max(0, Math.min(FOOD_RULES.supplyCap, this.supplies + n));
  }

  /** Days the rations last for `mouths` heroes. */
  foodDays(mouths: number): number {
    return this.food / Math.max(1, mouths * FOOD_RULES.perHeroDay);
  }

  /** Wound-hours healed per hour right now (on the road, or in camp with its structures; hunger slows it). */
  healRate(): number {
    const base = this.camp ? campEffects(this.map, this.camp).heal : WORLD_RULES.healRoad;
    return this.starving ? base * FOOD_RULES.starveHeal : base;
  }

  /** Why the party cannot pitch camp where it stands, or null. */
  campBlocker(): string | null {
    if (this.camp) return 'Already camped';
    if (this.s.inside >= 0) return 'Not inside a settlement';
    const t = this.tileOf(this.s.x, this.s.y);
    return campBlocker(this.map, t.x, t.y);
  }

  /** Pitch camp on the party's tile. Returns null or why it failed. */
  makeCamp(): string | null {
    const why = this.campBlocker();
    if (why) return why;
    this.stop();
    const t = this.tileOf(this.s.x, this.s.y);
    this.s.x = t.x + 0.5;
    this.s.y = t.y + 0.5;
    this.s.camp = { x: t.x, y: t.y, zone: campZone(this.map, t.x, t.y), built: [], since: this.s.time };
    return null;
  }

  /** Strike camp: the structures are left behind, half their supplies come back. Returns the refund. */
  breakCamp(): number {
    const c = this.camp;
    if (!c) return 0;
    const back = campRefund(c);
    this.addSupplies(back);
    this.s.camp = null;
    return back;
  }

  /** Why structure `id` cannot be built at (x, y), or null. */
  buildBlocker(id: StructureId, x: number, y: number): string | null {
    const c = this.camp;
    if (!c) return 'Make camp first';
    const d = STRUCTURES[id];
    if (countBuilt(c, id) >= d.max) return d.max === 1 ? `The camp has a ${d.name.toLowerCase()}` : `No room for more ${d.name.toLowerCase()}s`;
    if (this.supplies < d.cost) return `Needs ${d.cost} supplies`;
    if (!placeCheck(this.map, c, id, x, y).ok) return 'Build inside the camp, on free ground';
    return null;
  }

  /** Build a structure (spends supplies; the scene lets its hours pass). */
  build(id: StructureId, x: number, y: number): string | null {
    const why = this.buildBlocker(id, x, y);
    if (why) return why;
    this.s.supplies = this.supplies - STRUCTURES[id].cost;
    this.camp!.built.push({ id, x, y });
    return null;
  }

  /**
   * A new world: the party stands in the starting town; a few bands roam.
   * `starters` adds the starter zone (STARTER_BANDS): only a new campaign
   * asks for it, never a migrated save.
   */
  static fresh(seed: number, starters = false): WorldSave {
    const map = generateMap(seed);
    const st = map.settlements[map.start];
    const s: WorldSave = {
      seed,
      time: 8, // morning of the first day
      x: st.x + 0.5,
      y: st.y + 0.5,
      dest: null,
      destSettlement: -1,
      destParty: -1,
      inside: -1,
      parties: [],
      places: map.settlements.map(() => ({ epoch: -1, bought: [], sold: [] })),
      nextParty: 1,
      rng: (seed ^ 0x51ed270b) >>> 0 || 1,
      lastSpawn: 0,
      safeUntil: 0,
      ...v6WorldDefaults(),
    };
    const w = new World(s, map);
    for (let i = 0; i < 9; i++) w.spawnParty(i % 4 === 3 ? 'town' : 'lair');
    if (starters) w.spawnStarterBands();
    w.sync();
    return s;
  }

  sync(): WorldSave {
    this.s.rng = this.rng.state;
    if (this.fogDirty) {
      this.s.fog = encodeBits(this.explored);
      this.fogDirty = false;
    }
    return this.s;
  }

  get days(): number {
    return this.s.time / 24;
  }

  /** Lairs the player has destroyed (campaign-arc.md R2). */
  get lairsFallen(): number {
    return Object.values(this.s.lairs).filter((l) => l.fallen).length;
  }

  /** The world's lair tier now (campaign-arc.md R3). */
  get lairTier(): 2 | 3 {
    return lairTier(this.days, this.lairsFallen);
  }

  /** Hour of the day, 0..24. */
  get hour(): number {
    return this.s.time % 24;
  }

  settlement(id: number): SettlementDef | undefined {
    return this.map.settlements[id];
  }

  party(id: number): PartyState | undefined {
    return this.s.parties.find((p) => p.id === id);
  }

  tileOf(x: number, y: number): Tile {
    return { x: Math.max(0, Math.min(this.map.w - 1, Math.floor(x))), y: Math.max(0, Math.min(this.map.h - 1, Math.floor(y))) };
  }

  /** Nearest passable tile to (tx, ty) (spiral search), or null. */
  nearestPassable(tx: number, ty: number, r = 6): Tile | null {
    for (let d = 0; d <= r; d++) {
      let best: Tile | null = null;
      let bd = Infinity;
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (!passable(this.map, x, y)) continue;
          const dd = dx * dx + dy * dy;
          if (dd < bd) {
            bd = dd;
            best = { x, y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private path(from: Tile, to: Tile, maxNodes = 40000): { x: number; y: number }[] | null {
    const p = findPath(this.map.w, this.map.h, (x, y) => travelCost(this.map, x, y), from.x, from.y, to.x, to.y, MIN_TRAVEL_COST, maxNodes);
    return p ? p.map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 })) : null;
  }

  /** Plan the party's route to a tile. Returns false if it cannot be reached. */
  setDestination(tx: number, ty: number, settlement = -1, party = -1): boolean {
    if (this.camp) return false; // strike camp first
    const goal = this.nearestPassable(tx, ty);
    if (!goal) return false;
    const from = this.tileOf(this.s.x, this.s.y);
    const p = this.path(from, goal);
    if (!p) return false;
    p.shift(); // we are already on the first tile
    this.route = this.smooth(p);
    if (p.length === 0) this.route = [{ x: goal.x + 0.5, y: goal.y + 0.5 }];
    this.s.dest = [goal.x, goal.y];
    this.s.destSettlement = settlement;
    this.s.destParty = party;
    return true;
  }

  /**
   * Straighten a tile path (string pulling): drop a waypoint when the straight
   * line past it crosses no terrain worse than the path it replaces, so the
   * party walks smooth lines instead of tile steps.
   */
  private smooth(p: { x: number; y: number }[]): { x: number; y: number }[] {
    if (p.length < 3) return p;
    const cost = (x: number, y: number) => travelCost(this.map, Math.floor(x), Math.floor(y));
    const clear = (a: { x: number; y: number }, b: { x: number; y: number }, worst: number) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
      for (let k = 1; k < n; k++) {
        const c = cost(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
        if (!isFinite(c) || c > worst + 1e-9) return false;
      }
      return true;
    };
    const out: { x: number; y: number }[] = [];
    let a = { x: this.s.x, y: this.s.y };
    let i = 0;
    while (i < p.length) {
      let j = i;
      let worst = cost(p[i].x, p[i].y);
      // reach as far ahead as a clear straight line allows (at most 12 tiles per leg)
      for (let k = i + 1; k < p.length && k - i <= 12; k++) {
        const w = Math.max(worst, cost(p[k].x, p[k].y));
        if (!clear(a, p[k], w)) break;
        worst = w;
        j = k;
      }
      out.push(p[j]);
      a = p[j];
      i = j + 1;
    }
    return out;
  }

  stop(): void {
    this.route = [];
    this.s.dest = null;
    this.s.destSettlement = -1;
    this.s.destParty = -1;
  }

  get moving(): boolean {
    return this.route.length > 0;
  }

  /**
   * Advance the world by `hours` (the caller only does this while the party
   * moves or waits). Stops early at the first encounter or arrival.
   */
  advance(hours: number, player: PlayerInfo, waiting = false): { events: WorldEvent[]; hours: number } {
    const events: WorldEvent[] = [];
    // An event card is open (R4.2): no time passes until it is resolved.
    if (this.s.pendingEvent) return { events: [{ type: 'event', id: this.s.pendingEvent.id }], hours: 0 };
    let done = 0;
    const STEP = 0.05;
    while (done < hours - 1e-9 && events.length === 0) {
      const h = Math.min(STEP, hours - done);
      done += h;
      const t0 = this.s.time;
      this.s.time += h;
      const marching = !waiting && this.route.length > 0;
      if (!waiting) this.movePlayer(h, player, events);
      this.eat(h, player);
      if (events.length) {
        const a = events[0];
        if (a.type === 'arrive') this.arrivalEvent(a.settlement, player, events);
        break;
      }
      this.updateParties(h, player);
      this.checkContact(player, events);
      if (events.length === 0) this.timedEvents(t0, marching, waiting, player, events);
      if (this.s.time - this.s.lastSpawn >= WORLD_RULES.spawnEvery) {
        this.s.lastSpawn = this.s.time;
        if (this.s.parties.length < Math.min(WORLD_RULES.maxParties, 9 + Math.floor(this.days / 2))) this.spawnParty(this.rng.chance(0.25) ? 'town' : 'lair');
      }
    }
    this.sync();
    return { events, hours: done };
  }

  /** Rations eaten (and, in camp, foraged) over `h` hours. Nothing is eaten inside a settlement. */
  private eat(h: number, player: PlayerInfo): void {
    if (this.s.inside >= 0) return;
    const mouths = player.mouths ?? player.size;
    let d = -(mouths * FOOD_RULES.perHeroDay * h) / 24;
    if (this.camp) d += campEffects(this.map, this.camp).forage * h;
    this.s.food = Math.max(0, Math.min(FOOD_RULES.cap, this.food + d));
  }

  private movePlayer(h: number, player: PlayerInfo, events: WorldEvent[]): void {
    // Pursuing a band: re-aim at it as it moves.
    if (this.s.destParty >= 0) {
      const p = this.party(this.s.destParty);
      if (!p) this.stop();
      else if (this.route.length === 0 || Math.abs(p.x - (this.s.dest![0] + 0.5)) + Math.abs(p.y - (this.s.dest![1] + 0.5)) > 1.5) {
        this.setDestination(Math.floor(p.x), Math.floor(p.y), -1, p.id);
      }
    }
    if (this.route.length === 0) return;
    let budget = h * partySpeed(player.size) * (this.starving ? FOOD_RULES.starveSpeed : 1);
    const before = this.tileOf(this.s.x, this.s.y);
    while (budget > 0 && this.route.length > 0) {
      const wp = this.route[0];
      const t = this.tileOf(this.s.x, this.s.y);
      const cost = travelCost(this.map, t.x, t.y);
      const c = isFinite(cost) ? cost : 1;
      const dx = wp.x - this.s.x;
      const dy = wp.y - this.s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const can = budget / c;
      if (d <= can) {
        this.s.x = wp.x;
        this.s.y = wp.y;
        budget -= d * c;
        this.route.shift();
      } else {
        this.s.x += (dx / d) * can;
        this.s.y += (dy / d) * can;
        budget = 0;
      }
    }
    const after = this.tileOf(this.s.x, this.s.y);
    if (after.x !== before.x || after.y !== before.y) this.reveal(this.s.x, this.s.y, WORLD_RULES.sight);
    if (this.route.length === 0) {
      const sid = this.s.destSettlement;
      this.s.dest = null;
      this.s.destSettlement = -1;
      if (sid >= 0) events.push({ type: 'arrive', settlement: sid });
    }
  }

  private checkContact(_player: PlayerInfo, events: WorldEvent[]): void {
    if (this.s.inside >= 0) return;
    for (const p of this.s.parties) {
      const d = Math.sqrt((p.x - this.s.x) ** 2 + (p.y - this.s.y) ** 2);
      if (d > WORLD_RULES.contact) continue;
      const byPlayer = this.s.destParty === p.id;
      // A palisaded camp keeps the bands out.
      if (!byPlayer && this.camp && campEffects(this.map, this.camp).fortified) continue;
      // Bands keep their distance for a while after a fight or an escape (unless the player hunts them).
      if (!byPlayer && (p.idle > 0 || this.s.time < this.s.safeUntil)) continue;
      this.stop();
      events.push({ type: 'encounter', party: p.id, byPlayer });
      return;
    }
  }

  private updateParties(h: number, player: PlayerInfo): void {
    for (const p of this.s.parties) {
      if (p.idle > 0) {
        p.idle = Math.max(0, p.idle - h);
        continue;
      }
      const next = this.aiThink.get(p.id) ?? 0;
      if (this.s.time >= next) {
        this.aiThink.set(p.id, this.s.time + 0.25);
        this.thinkParty(p, player);
      }
      this.moveParty(p, h);
    }
  }

  private thinkParty(p: PartyState, player: PlayerInfo): void {
    const d = Math.sqrt((p.x - this.s.x) ** 2 + (p.y - this.s.y) ** 2);
    const ratio = p.power / Math.max(1, player.power);
    const walled = !!this.camp && campEffects(this.map, this.camp).fortified;
    const visible = d < WORLD_RULES.vision && this.s.inside < 0 && this.s.time >= this.s.safeUntil && !walled;
    // An event's hunters (campaign-events.md R2) chase whatever the power ratio, from farther off.
    const hunting = !!p.hunts && d < WORLD_RULES.vision * 2 && this.s.inside < 0 && this.s.time >= this.s.safeUntil && !walled;
    let mode: PartyMode = 'wander';
    if ((visible && ratio >= WORLD_RULES.chaseRatio) || hunting) mode = 'chase';
    else if (visible && ratio < WORLD_RULES.fleeRatio) mode = 'flee';
    else if (p.mode !== 'wander' && d < WORLD_RULES.vision + 2 && this.s.inside < 0 && this.s.time >= this.s.safeUntil) mode = p.mode;
    if (mode === 'chase') {
      p.mode = 'chase';
      const t = this.tileOf(this.s.x, this.s.y);
      p.tx = t.x;
      p.ty = t.y;
      const route = this.path(this.tileOf(p.x, p.y), t, 5000);
      this.aiRoutes.set(p.id, route ? route.slice(1) : [{ x: this.s.x, y: this.s.y }]);
      return;
    }
    if (mode === 'flee') {
      const route = this.aiRoutes.get(p.id);
      if (p.mode === 'flee' && route && route.length > 2) return;
      p.mode = 'flee';
      let ax = p.x - this.s.x;
      let ay = p.y - this.s.y;
      const l = Math.sqrt(ax * ax + ay * ay) || 1;
      ax /= l;
      ay /= l;
      const goal = this.nearestPassable(Math.floor(p.x + ax * 7 + this.rng.range(-2, 2)), Math.floor(p.y + ay * 7 + this.rng.range(-2, 2)), 4);
      const r = goal ? this.path(this.tileOf(p.x, p.y), goal, 3000) : null;
      this.aiRoutes.set(p.id, r ? r.slice(1) : []);
      return;
    }
    p.mode = 'wander';
    const route = this.aiRoutes.get(p.id);
    if (route && route.length > 0) return;
    // Pick a new place to go: around home for bands, between towns for mercenaries.
    const home = this.map.settlements[p.home];
    let goal: Tile | null = null;
    if (p.hunts) {
      // out of range, a hunter still heads for where the party is
      goal = this.nearestPassable(Math.floor(this.s.x) + this.rng.int(-3, 3), Math.floor(this.s.y) + this.rng.int(-3, 3), 3);
    } else if (p.kind === 'mercs' && this.rng.chance(0.6)) {
      const towns = this.map.settlements.filter((s) => s.kind !== 'lair');
      const t = this.rng.pick(towns);
      goal = this.nearestPassable(t.x + this.rng.int(-2, 2), t.y + this.rng.int(-2, 2), 3);
    } else if (home) {
      const r = p.kind === 'raiders' ? 14 : 10;
      goal = this.nearestPassable(home.x + this.rng.int(-r, r), home.y + this.rng.int(-r, r), 3);
    }
    if (!goal) return;
    const r = this.path(this.tileOf(p.x, p.y), goal, 8000);
    if (r) {
      // Linger a little between legs.
      if (this.rng.chance(0.3)) p.idle = this.rng.range(0.5, 2);
      this.aiRoutes.set(p.id, r.slice(1));
    }
  }

  private moveParty(p: PartyState, h: number): void {
    const route = this.aiRoutes.get(p.id);
    if (!route || route.length === 0) return;
    const mult = p.mode === 'chase' ? 1.05 : p.mode === 'flee' ? 1.0 : 0.75;
    let budget = h * partySpeed(p.size) * mult * (p.kind === 'raiders' ? 1.05 : 1);
    while (budget > 0 && route.length > 0) {
      const wp = route[0];
      const t = this.tileOf(p.x, p.y);
      const cost = travelCost(this.map, t.x, t.y);
      const c = isFinite(cost) ? cost : 1;
      const dx = wp.x - p.x;
      const dy = wp.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const can = budget / c;
      if (d <= can) {
        p.x = wp.x;
        p.y = wp.y;
        budget -= d * c;
        route.shift();
      } else {
        p.x += (dx / d) * can;
        p.y += (dy / d) * can;
        budget = 0;
      }
    }
  }

  /** A standing lair (or a town, for mercenaries) sends out a new band, sized by local danger and the date. A fallen lair sends none (campaign-arc.md R2.4). */
  spawnParty(from: 'lair' | 'town'): PartyState | null {
    const homes = this.map.settlements.filter((s) => (from === 'lair' ? s.kind === 'lair' && !this.lairFallen(s.id) : s.kind === 'town' && s.id !== this.map.start));
    if (homes.length === 0) return null;
    const home = this.rng.pick(homes);
    const kind: BandKind = from === 'town' ? 'mercs' : home.band ?? 'bandits';
    const at = this.nearestPassable(home.x + this.rng.int(-2, 2), home.y + this.rng.int(-2, 2), 4);
    if (!at) return null;
    const danger = dangerAt(this.map, home.x, home.y);
    const r = this.rng;
    const { size, level, tier } = bandShape(kind, danger, this.days, this.lairsFallen, r);
    const p: PartyState = {
      id: this.s.nextParty++,
      kind,
      name: home.name === 'Pirate cove' ? 'Pirates' : BAND_NAMES[kind],
      culture: kind === 'raiders' ? 'celtic' : kind === 'mercs' ? r.pick(['greek', 'phoenician', 'celtic'] as const) : home.culture,
      x: at.x + 0.5,
      y: at.y + 0.5,
      size: Math.min(BAND_CAPS.size, size),
      power: 0,
      level: Math.min(BAND_CAPS.level, level),
      tier,
      seed: (r.next() * 4294967296) >>> 0 || 1,
      home: home.id,
      mode: 'wander',
      tx: at.x,
      ty: at.y,
      idle: r.range(0, 1),
    };
    p.power = partyArmy(p, { nextId: 1 }).power;
    this.s.parties.push(p);
    return p;
  }

  /**
   * The starter zone (V5-054): small bandit bands of the GDD's danger 0.1-0.3
   * (campaign-arc.md R1.3) a few tiles from the starting town, independent of
   * the lairs. Their own seeded Rng, so the world's other bands are unchanged.
   * They roam around the starting town (home) and never respawn.
   */
  spawnStarterBands(): void {
    const B = STARTER_BANDS;
    const r = new Rng((this.s.seed ^ 0x3c6ef372) >>> 0 || 1);
    const home = this.map.settlements[this.map.start];
    const from = { x: home.x, y: home.y };
    const count = r.int(B.count[0], B.count[1]);
    for (let n = 0, tries = 0; n < count && tries < 60; tries++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(B.ring[0], B.ring[1]);
      const at = this.nearestPassable(Math.floor(home.x + Math.cos(a) * d), Math.floor(home.y + Math.sin(a) * d), 2);
      if (!at || Math.max(Math.abs(at.x - home.x), Math.abs(at.y - home.y)) < B.ring[0]) continue;
      if (this.s.parties.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 4)) continue;
      if (!this.path(from, at, 4000)) continue;
      const danger = r.range(B.danger[0], B.danger[1]);
      let seed = (r.next() * 4294967296) >>> 0 || 1;
      while (bandBeast(seed)) seed = (seed * 2654435761 + 1) >>> 0 || 1;
      const p: PartyState = {
        id: this.s.nextParty++,
        kind: 'bandits',
        name: BAND_NAMES.bandits,
        culture: home.culture,
        x: at.x + 0.5,
        y: at.y + 0.5,
        size: B.min + Math.round(danger * 5) + r.int(0, 2),
        power: 0,
        level: 1 + Math.round(danger * 2),
        tier: B.tier,
        seed,
        home: home.id,
        mode: 'wander',
        tx: at.x,
        ty: at.y,
        idle: r.range(0, 1),
      };
      p.power = partyArmy(p, { nextId: 1 }).power;
      this.s.parties.push(p);
      n++;
    }
  }

  removeParty(id: number): void {
    this.s.parties = this.s.parties.filter((p) => p.id !== id);
    this.aiRoutes.delete(id);
    this.aiThink.delete(id);
    if (this.s.destParty === id) this.stop();
  }

  /**
   * A band that lost men but kept the field (or got away): smaller, and it
   * rests a while. It stays the same band (MECH C4): same seed, so the same
   * beast or the same men, and the same captain while he lives.
   */
  weakenParty(id: number, lost: number, idleHours: number): void {
    const p = this.party(id);
    if (!p) return;
    p.size -= lost;
    if (p.size <= 0) {
      this.removeParty(id);
      return;
    }
    p.power = partyArmy(p, { nextId: 1 }).power;
    p.idle = idleHours;
    this.aiRoutes.delete(id);
  }

  // ---------------------------------------------------------------- events (campaign-events.md)

  /** Whole game days since the campaign began (day 0 is the first). */
  get today(): number {
    return Math.floor(this.s.time / 24);
  }

  /** What event conditions are checked against. */
  eventCtx(player: PlayerInfo): EventCtx {
    let escaped = 0;
    for (const p of this.s.parties) escaped = Math.max(escaped, p.escaped ?? 0);
    return {
      day: this.today,
      danger: dangerAt(this.map, this.s.x, this.s.y),
      flags: this.s.flags,
      men: player.mouths ?? player.size,
      gold: player.gold ?? 0,
      arcStage: this.s.arc.stage,
      escaped,
    };
  }

  /**
   * Check `trigger` (R3): within the pacing cap, a roll at the trigger's rate,
   * then a weighted pick among the eligible events. A hit is written to
   * `pendingEvent` at once, so the caller's next save holds it before the card
   * shows (R4.1). The roll is seeded by the world seed, the trigger and `key`
   * (where and when the check happens), not by frame timing: the same save and
   * the same actions draw the same events. Returns the event id or null.
   */
  tryEvent(trigger: EventTrigger, key: string, player: PlayerInfo): string | null {
    const s = this.s;
    if (s.pendingEvent || this.deck.length === 0) return null;
    const day = this.today;
    const drawn = s.eventsToday[0] === day ? s.eventsToday[1] : 0;
    if (drawn >= EVENT_RULES.perDay) return null;
    if (trigger !== 'flag' && (s.eventCd[EV_KEY.gap] ?? -Infinity) > s.time / 24) return null;
    const rng = new Rng(hashString(`${s.seed}:ev:${trigger}:${key}`));
    if (!rng.chance(eventRate(trigger))) return null;
    const def = pickEvent(eligibleEvents(this.deck, trigger, this.eventCtx(player), s.eventCd, s.seed), rng);
    if (!def) return null;
    s.pendingEvent = { id: def.id, seed: (rng.next() * 4294967296) >>> 0 || 1 };
    s.eventCd[def.id] = def.unique ? EVENT_RULES.usedDay : day + def.cooldownDays;
    s.eventsToday = [day, drawn + 1];
    s.eventCd[EV_KEY.gap] = (s.time + EVENT_RULES.minGapH) / 24;
    this.pruneCooldowns();
    return def.id;
  }

  /** Arriving at a village or town (R3): at most one arrival event per settlement per EVENT_RULES.arriveCdDays. */
  private arrivalEvent(sid: number, player: PlayerInfo, events: WorldEvent[]): void {
    const def = this.map.settlements[sid];
    if (!def || def.kind === 'lair' || this.deck.length === 0) return;
    const k = EV_KEY.arrive(sid);
    if ((this.s.eventCd[k] ?? -Infinity) > this.today) return;
    const id = this.tryEvent(def.kind === 'town' ? 'arrive_town' : 'arrive_village', `${sid}:${Math.round(this.s.time * 20)}`, player);
    if (!id) return;
    this.s.eventCd[k] = this.today + EVENT_RULES.arriveCdDays;
    events.push({ type: 'event', id });
  }

  /**
   * The checks of a step on the map (R3): a due flag event; a march check each
   * time the clock passes a multiple of EVENT_RULES.marchEveryH while the party
   * travels; a camp check each midnight spent in camp. Inside a settlement
   * nothing fires (only arrivals do).
   */
  private timedEvents(t0: number, marching: boolean, waiting: boolean, player: PlayerInfo, events: WorldEvent[]): void {
    if (this.deck.length === 0 || this.s.inside >= 0 || this.s.pendingEvent) return;
    const t1 = this.s.time;
    const crossed = (every: number) => Math.floor(t1 / every) > Math.floor(t0 / every);
    const flags = this.s.flags;
    let id: string | null = null;
    if (this.deck.some((d) => d.trigger === 'flag' && d.after && d.after.flag in flags)) id = this.tryEvent('flag', `d${this.today}`, player);
    if (!id && marching && !this.camp && crossed(EVENT_RULES.marchEveryH)) id = this.tryEvent('march', `m${Math.floor(t1 / EVENT_RULES.marchEveryH)}`, player);
    if (!id && waiting && this.camp && crossed(24)) id = this.tryEvent('camp', `c${this.today}`, player);
    if (id) events.push({ type: 'event', id });
  }

  /** Drop cooldowns that have run out (and the price changes that went with them), to keep the save small. */
  private pruneCooldowns(): void {
    const cd = this.s.eventCd;
    for (const [k, until] of Object.entries(cd)) {
      if (until > this.s.time / 24) continue;
      delete cd[k];
      if (k.startsWith('@price:')) delete this.s.flags[k];
    }
  }

  /** The event is resolved (or dropped): the map runs again. */
  clearPendingEvent(): void {
    delete this.s.pendingEvent;
  }

  /** Add a journal line (event id and choice key), keeping the last JOURNAL_CAP. */
  logJournal(line: string): void {
    this.s.journal.push(line);
    if (this.s.journal.length > JOURNAL_CAP) this.s.journal.splice(0, this.s.journal.length - JOURNAL_CAP);
  }

  hasFlag(name: string): boolean {
    return name in this.s.flags;
  }

  /**
   * Set a world flag (default value: today, which `flag` events count their
   * delay from). The arc sets `host_musters` this way (campaign-arc.md R5).
   * A new key past FLAGS_CAP is refused (false).
   */
  setFlag(name: string, value = this.today): boolean {
    const f = this.s.flags;
    if (!(name in f) && Object.keys(f).length >= FLAGS_CAP) return false;
    f[name] = value;
    return true;
  }

  clearFlag(name: string): void {
    delete this.s.flags[name];
  }

  /** The price factor an event put on a settlement's recruits and wares (priceMod); 1 when none. */
  priceMult(sid: number): number {
    const k = EV_KEY.price(sid);
    if ((this.s.eventCd[k] ?? -Infinity) <= this.s.time / 24) return 1;
    return Math.max(0, 1 + (this.s.flags[k] ?? 0) / 100);
  }

  /** Put a price change of `pct` % on a settlement for `days` (priceMod). */
  setPriceMod(sid: number, pct: number, days: number): void {
    const k = EV_KEY.price(sid);
    if (!this.setFlag(k, pct)) return;
    this.s.eventCd[k] = this.s.time / 24 + days;
  }

  /** A settlement an event closed (closeSettlement): no recruits, no market. */
  isClosed(sid: number): boolean {
    return (this.s.eventCd[EV_KEY.closed(sid)] ?? -Infinity) > this.s.time / 24;
  }

  closeSettlement(sid: number, days: number): void {
    this.s.eventCd[EV_KEY.closed(sid)] = this.s.time / 24 + days;
  }

  /** The nearest lair to the party: `standing` skips fallen ones, `unknown` prefers one still in the fog. */
  nearestLair(opts: { standing?: boolean; unknown?: boolean } = {}): SettlementDef | null {
    const lairs = this.map.settlements.filter((st) => st.kind === 'lair' && !(opts.standing && this.s.lairs[st.id]?.fallen));
    const fogged = opts.unknown ? lairs.filter((st) => !this.s.found!.includes(st.id)) : [];
    let best: SettlementDef | null = null;
    let bd = Infinity;
    for (const st of fogged.length ? fogged : lairs) {
      const d = Math.hypot(st.x + 0.5 - this.s.x, st.y + 0.5 - this.s.y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** A lair's garrison loses `n` men (weakenGarrison, campaign-arc.md R2): they count as lost now. */
  weakenGarrison(lairId: number, n: number): void {
    this.loseGarrison(lairId, n);
  }

  // ---------------------------------------------------------------- lair garrisons (campaign-arc.md R2, F1, F3)

  /** Whether lair `id` has fallen to an assault (R2.4). */
  lairFallen(id: number): boolean {
    return !!this.s.lairs[id]?.fallen;
  }

  /** The full strength of lair `id`'s garrison (F1): GARRISON.base + round(danger x GARRISON.danger). */
  garrisonFull(id: number): number {
    const st = this.map.settlements[id];
    return GARRISON.base + Math.round(dangerAt(this.map, st.x, st.y) * GARRISON.danger);
  }

  /** Men the garrison has lost and not yet regrown (F3): one comes back every GARRISON.regrowH hours since the last loss. */
  private garrisonLost(id: number): number {
    const l = this.s.lairs[id];
    if (!l) return 0;
    return Math.max(0, l.lost - Math.floor(Math.max(0, this.s.time - l.lostAt) / GARRISON.regrowH));
  }

  /** Men in lair `id`'s garrison now (F3); 0 for a fallen lair or a settlement that is not a lair. */
  garrisonSize(id: number): number {
    const st = this.map.settlements[id];
    if (!st || st.kind !== 'lair' || this.lairFallen(id)) return 0;
    return Math.max(0, this.garrisonFull(id) - this.garrisonLost(id));
  }

  /**
   * Lair `id`'s garrison loses `n` men (an assault's dead, or an event's
   * weakenGarrison; R2.5): what has regrown so far is kept, and the regrowth
   * clock restarts now. A new clock also re-rolls the garrison's men from a
   * new seed (garrison), so a captain who fell has been replaced by another.
   */
  loseGarrison(id: number, n: number): void {
    const st = this.map.settlements[id];
    if (!st || st.kind !== 'lair' || this.lairFallen(id) || !(n > 0)) return;
    this.s.lairs[id] = { fallen: false, lost: Math.min(this.garrisonFull(id), this.garrisonLost(id) + n), lostAt: this.s.time };
  }

  /** Lair `id` falls (R2.4): it sends out no more bands. Its bands already out stay on the map. */
  razeLair(id: number): void {
    const st = this.map.settlements[id];
    if (!st || st.kind !== 'lair') return;
    this.s.lairs[id] = { fallen: true, lost: this.garrisonFull(id), lostAt: this.s.time };
  }

  /**
   * Lair `id`'s garrison as a band (R2.1, F1, F3), for its power plate and its
   * army (partyArmy): the men it has now, at level GARRISON.level +
   * round(danger x levelDanger + days x levelDays), gear at the lair tier, so
   * it always has a captain. The lair's band kind and culture give its mix and
   * doctrine: bandit camps and pirate coves swarm, Galatae camps rush (R4).
   * It is never a beast. Its id is -1 - lair id (it isn't a party on the
   * map); its men come from the world seed, the lair and the time of its
   * last loss. Null for a fallen lair, a settlement that is not a lair, or
   * a garrison with no men left (it falls without a battle: razeLair).
   */
  garrison(id: number): PartyState | null {
    const st = this.map.settlements[id];
    const size = this.garrisonSize(id);
    if (!st || size <= 0) return null;
    const danger = dangerAt(this.map, st.x, st.y);
    let seed = hashString(`${this.s.seed}:garrison:${id}:${this.s.lairs[id]?.lostAt ?? 0}`) || 1;
    while (bandBeast(seed)) seed = (seed * 2654435761 + 1) >>> 0 || 1;
    const p: PartyState = {
      id: -1 - id,
      kind: st.band ?? 'bandits',
      name: st.name,
      culture: st.culture,
      x: st.x + 0.5,
      y: st.y + 0.5,
      size,
      power: 0,
      level: Math.min(BAND_CAPS.level, GARRISON.level + Math.round(danger * GARRISON.levelDanger + this.days * GARRISON.levelDays)),
      tier: this.lairTier,
      seed,
      home: id,
      mode: 'wander',
      tx: st.x,
      ty: st.y,
      idle: 0,
    };
    p.power = partyArmy(p, { nextId: 1 }).power * GARRISON.plate;
    return p;
  }

  /** Lift the fog over a settlement and its surroundings. */
  revealSettlement(sid: number): void {
    const st = this.map.settlements[sid];
    if (st) this.reveal(st.x + 0.5, st.y + 0.5, 3.5);
  }

  /**
   * A band an event sends (spawnBand, R2): 5-8 tiles from the party on a
   * reachable tile (else at the nearest lair or town), sized like a band of its
   * kind there, then scaled by `mods`. A hunting band chases the party
   * whatever the power ratio. Positions and men come from `rng` (the event's).
   */
  spawnEventBand(kind: EventBandKind, mods: BandMods, rng: Rng): PartyState | null {
    const me = this.tileOf(this.s.x, this.s.y);
    let at: Tile | null = null;
    for (let i = 0; i < 12 && !at; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(5, 8);
      const t = this.nearestPassable(Math.floor(this.s.x + Math.cos(a) * d), Math.floor(this.s.y + Math.sin(a) * d), 2);
      if (t && this.path(me, t, 4000)) at = t;
    }
    const homes = this.map.settlements.filter((st) => st.kind !== 'village');
    const dist = (st: SettlementDef) => Math.hypot(st.x - me.x, st.y - me.y);
    const home = homes.reduce((b, st) => (dist(st) < dist(b) ? st : b), homes[0]);
    if (!at) at = this.nearestPassable(home.x, home.y, 4);
    if (!at) return null;
    const shape = bandShape(kind, dangerAt(this.map, at.x, at.y), this.days, this.lairsFallen, rng);
    let seed = (rng.next() * 4294967296) >>> 0 || 1;
    while (mods.captain && kind !== 'mercs' && bandBeast(seed)) seed = (seed * 2654435761 + 1) >>> 0 || 1;
    const p: PartyState = {
      id: this.s.nextParty++,
      kind,
      name: BAND_NAMES[kind],
      culture: kind === 'raiders' ? 'celtic' : kind === 'mercs' ? rng.pick(['greek', 'phoenician', 'celtic'] as const) : home.culture,
      x: at.x + 0.5,
      y: at.y + 0.5,
      size: Math.max(1, Math.min(BAND_CAPS.size, Math.round(shape.size * (mods.size ?? 1)))),
      power: 0,
      level: Math.max(1, Math.min(BAND_CAPS.level, shape.level + (mods.level ?? 0))),
      tier: mods.captain ? Math.max(CAPTAIN_RULES.minTier, shape.tier) : shape.tier,
      seed,
      home: home.id,
      mode: mods.hunts ? 'chase' : 'wander',
      tx: at.x,
      ty: at.y,
      idle: 0,
    };
    if (mods.hunts) p.hunts = true;
    if (mods.bountyMult !== undefined) p.bountyMult = clampBountyMult(mods.bountyMult);
    if (mods.doctrine) p.doctrine = mods.doctrine;
    p.power = partyArmy(p, { nextId: 1 }).power;
    this.s.parties.push(p);
    return p;
  }

  // ---------------------------------------------------------------- settlements

  private placeState(id: number): SettlementState {
    const def = this.map.settlements[id];
    const len = def.kind === 'town' ? WORLD_RULES.townRefresh : WORLD_RULES.villageRefresh;
    const epoch = Math.floor(this.s.time / len);
    let st = this.s.places[id];
    if (!st) st = this.s.places[id] = { epoch, bought: [], sold: [] };
    if (st.epoch !== epoch) {
      st.epoch = epoch;
      st.bought = [];
      st.sold = [];
    }
    return st;
  }

  /** Hours until a settlement's recruits and wares refresh. */
  refreshIn(id: number): number {
    const def = this.map.settlements[id];
    const len = def.kind === 'town' ? WORLD_RULES.townRefresh : WORLD_RULES.villageRefresh;
    return len - (this.s.time % len);
  }

  /** Volunteers on offer (deterministic for the settlement and stock epoch). */
  recruits(id: number, roster: readonly Hero[]): Recruit[] {
    const def = this.map.settlements[id];
    if (!def || def.kind === 'lair' || this.isClosed(id)) return [];
    const st = this.placeState(id);
    const base = `${this.s.seed}:${id}:${st.epoch}`;
    const count = def.kind === 'village' ? 1 + Math.floor(hashFrac(base + ':n') * 3) : 2 + Math.floor(hashFrac(base + ':n') * 3);
    const out: Recruit[] = [];
    for (let i = 0; i < count; i++) {
      if (st.bought.includes(i)) continue;
      out.push({ index: i, ...makeRecruit(def, `${base}:r${i}`, { nextId: 1 }, roster) });
    }
    if (this.offersFloor(id, roster)) {
      for (let i = 0; i < VOLUNTEER_RULES.floorOffer; i++) {
        const index = VOLUNTEER_RULES.floorIndex + i;
        if (!st.bought.includes(index)) out.push({ index, ...makeFloorVolunteer(def, `${base}:f${i}`, { nextId: 1 }, roster) });
      }
    }
    const m = this.priceMult(id);
    if (m !== 1) for (const r of out) r.price = Math.round(r.price * m);
    return out;
  }

  /** The volunteer floor (R1.5): an army under VOLUNTEER_RULES.floor men, at the starting town or a village. */
  private offersFloor(id: number, roster: readonly Hero[]): boolean {
    const def = this.map.settlements[id];
    return roster.length < VOLUNTEER_RULES.floor && (def.kind === 'village' || id === this.map.start);
  }

  /** Hire volunteer `index`: returns the hero (with real ids) and its price, or null. */
  hire(id: number, index: number, ids: IdSource, roster: readonly Hero[]): { hero: Hero; price: number } | null {
    const def = this.map.settlements[id];
    const st = this.placeState(id);
    if (!def || st.bought.includes(index) || this.isClosed(id)) return null;
    const key = `${this.s.seed}:${id}:${st.epoch}`;
    const m = this.priceMult(id);
    const priced = (r: { hero: Hero; price: number }) => (m === 1 ? r : { hero: r.hero, price: Math.round(r.price * m) });
    if (index >= VOLUNTEER_RULES.floorIndex) {
      const i = index - VOLUNTEER_RULES.floorIndex;
      if (i >= VOLUNTEER_RULES.floorOffer || !this.offersFloor(id, roster)) return null;
      st.bought.push(index);
      return priced(makeFloorVolunteer(def, `${key}:f${i}`, ids, roster));
    }
    const r = makeRecruit(def, `${key}:r${index}`, ids, roster);
    st.bought.push(index);
    return priced(r);
  }

  /** Market wares in a town (deterministic per stock epoch and army: weapons, shields and armour follow its `classes`). */
  wares(id: number, classes: readonly string[] = []): Ware[] {
    const def = this.map.settlements[id];
    if (!def || def.kind !== 'town' || this.isClosed(id)) return [];
    const st = this.placeState(id);
    const m = this.priceMult(id);
    const rng = new Rng(hashString(`${this.s.seed}:${id}:${st.epoch}:market`));
    const pool = marketPool(rng);
    const out: Ware[] = [];
    const ids = { nextId: 1 };
    for (let i = 0; i < 10; i++) {
      const d = armyPick(rng, pool, classes);
      const item = makeItem(rng, ids, d.id, rollRarity(rng, 2), rng.range(70, 100), def.culture);
      item.uid = `w${id}_${st.epoch}_${i}`;
      if (st.sold.includes(i)) continue;
      out.push({ index: i, item, price: Math.round(itemValue(item) * 1.5 * m) });
    }
    return out;
  }

  /** Mark ware `index` as bought; returns it with a fresh uid. */
  buy(id: number, index: number, ids: IdSource, classes: readonly string[] = []): Ware | null {
    const w = this.wares(id, classes).find((x) => x.index === index);
    if (!w) return null;
    this.placeState(id).sold.push(index);
    w.item.uid = `i${(ids.nextId++).toString(36)}`;
    return w;
  }
}

/** What a town market may stock this epoch: all common and finer gear, each elite (tier-3) piece with a 30% chance. */
export function marketPool(rng: Rng): ItemDef[] {
  return BASE_ITEMS.filter((d) => d.tier <= 2 || rng.chance(0.3));
}

export interface Recruit {
  index: number;
  hero: Hero;
  price: number;
}

export interface Ware {
  index: number;
  item: Item;
  price: number;
}

function hashFrac(s: string): number {
  return hashString(s) / 4294967296;
}

function makeRecruit(def: SettlementDef, key: string, ids: IdSource, roster: readonly Hero[]): { hero: Hero; price: number } {
  const rng = new Rng(hashString(key));
  if (def.kind === 'village') {
    // Villages: farm levies, now and then a local slinger or javelin-man.
    const cls = rng.weighted<ClassId>([['militia', 8], ['slinger', 1], ['javelineer', 1]]);
    const hero = makeHero(rng, ids, def.culture, cls, 1, 1, undefined, roster);
    return { hero, price: cls === 'militia' ? RECRUIT_COST : CLASSES[cls].cost - 20 };
  }
  // Towns: the classes of their culture (cavalry and elites are rare and dear).
  const cls = rng.weighted(townClasses(def.culture));
  const level = rng.weighted([[1, 4], [2, 4], [3, 2]] as [number, number][]);
  const hero = makeHero(rng, ids, def.culture, cls, level, rng.chance(0.3) ? 2 : 1, undefined, roster);
  let gear = 0;
  for (const it of Object.values(hero.equip)) if (it) gear += itemValue(it);
  return { hero, price: CLASSES[cls].cost - 40 + 35 * (level - 1) + Math.round(gear / 3) };
}

/** A raw volunteer of the floor (R1.5): a level-1 levy of the place's people at VOLUNTEER_RULES.floorCost. */
function makeFloorVolunteer(def: SettlementDef, key: string, ids: IdSource, roster: readonly Hero[]): { hero: Hero; price: number } {
  return { hero: makeHero(new Rng(hashString(key)), ids, def.culture, 'raw', 1, 1, undefined, roster), price: VOLUNTEER_RULES.floorCost };
}

/** Whether the band fields a captain (ai-doctrines.md R6): tier 2 and up, a band of men, and he still lives. */
export function hasCaptain(p: PartyState): boolean {
  return p.tier >= CAPTAIN_RULES.minTier && !p.captainDead && !(p.kind !== 'mercs' && bandBeast(p.seed));
}

/**
 * The band's captain (ai-doctrines.md R6), or null when it has none. He comes
 * from the band's seed alone, apart from the rank and file, so he is the same
 * man however many of his band have fallen: a band that retreats comes back
 * with the same captain. He fights in the main line at the band's level (+ levelBonus),
 * with no item below uncommon (rare from tier 3), and carries the captain's
 * mark (src/sim/stats.ts CAPTAIN_STATS).
 */
export function bandCaptain(p: PartyState, ids: IdSource): Hero | null {
  if (!hasCaptain(p)) return null;
  const rng = new Rng((p.seed ^ 0x6a09e667) >>> 0 || 1);
  const h = makeHero(rng, ids, p.culture, captainClass(p), 1, p.tier, 0);
  setBotLevel(h, p.level + CAPTAIN_RULES.levelBonus);
  const floor = p.tier >= 3 ? 2 : 1;
  for (const it of Object.values(h.equip)) if (it && rarityRank(it.rarity) < floor) it.rarity = RARITIES[floor];
  (h as Hero & CaptainMark).captain = true;
  return h;
}

/**
 * The band's army, generated from its seed (identical at every call for the
 * same army `classes`, which a beast's hoard follows). Tier-3 bands now and
 * then carry a rare set piece (src/game/sources.ts bandSetPieces). A band with
 * a captain is the captain plus `size - 1` men.
 */
export function partyArmy(p: PartyState, ids: IdSource, classes: readonly string[] = []): EnemyArmy {
  // Now and then a lair's band is a mythical beast (src/game/beasts.ts): a rare encounter.
  const beast = p.kind !== 'mercs' ? bandBeast(p.seed) : null;
  if (beast) return beastEnemy(beast, Math.max(2, p.level + 1), p.seed, ids, classes);
  const captain = bandCaptain(p, ids);
  const forced = p.doctrine && (DOCTRINE_IDS as readonly string[]).includes(p.doctrine) ? { doctrine: p.doctrine } : {};
  const req = { culture: p.culture, level: p.level, tier: p.tier, targetPower: 0, mix: BAND_MIX[p.kind], tune: false, ...forced } as const;
  const count = p.size - (captain ? 1 : 0);
  const army = count > 0 ? buildArmy(new Rng(p.seed), ids, { ...req, count }) : { ...buildArmy(new Rng(p.seed), ids, { ...req, count: 1 }), heroes: [] };
  bandSetPieces(army.heroes, army.culture, p.tier, p.seed);
  if (!captain) return army;
  army.heroes.unshift(captain);
  // he keeps his name; a rank-and-file man who shares it takes another
  dedupeNames(army.heroes);
  army.power = army.targetPower = army.heroes.reduce((a, h) => a + heroPower(h), 0);
  return army;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 0/1 array -> base64 bitset (6 bits per char). */
export function encodeBits(bits: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let k = 0; k < 6; k++) if (bits[i + k]) v |= 1 << k;
    out += B64[v];
  }
  return out;
}

/** Inverse of encodeBits; false if the string does not fit. */
export function decodeBits(s: string, into: Uint8Array): boolean {
  if (s.length !== Math.ceil(into.length / 6)) return false;
  for (let c = 0; c < s.length; c++) {
    const v = B64.indexOf(s[c]);
    if (v < 0) return false;
    for (let k = 0; k < 6; k++) {
      const i = c * 6 + k;
      if (i < into.length) into[i] = (v >> k) & 1;
    }
  }
  return true;
}
