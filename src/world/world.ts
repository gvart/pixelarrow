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
import { ITEM_LIST, itemValue, type Item } from '../data/items';
import { RECRUIT_COST, type Hero } from '../data/units';
import { buildArmy, type ArmyMix, type EnemyArmy } from '../game/enemy';
import { makeHero, makeItem, rollRarity, type IdSource } from '../game/heroes';
import { CLASSES, townClasses, type ClassId } from '../data/classes';
import {
  MIN_TRAVEL_COST, dangerAt, generateMap, passable, travelCost,
  type BandKind, type SettlementDef, type WorldMap,
} from './map';
import { findPath, type Tile } from './path';

export type PartyMode = 'wander' | 'chase' | 'flee';

export interface PartyState {
  id: number;
  kind: BandKind;
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
}

/** Per-settlement state: which recruits / wares of the current stock epoch are gone. */
export interface SettlementState {
  epoch: number;
  bought: number[];
  sold: number[];
}

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
}

export type WorldEvent =
  | { type: 'encounter'; party: number; byPlayer: boolean }
  | { type: 'arrive'; settlement: number };

export interface PlayerInfo {
  power: number;
  size: number;
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
  /** Wound hours healed per hour: on the road, camping, resting in a village / town. */
  healRoad: 1,
  healCamp: 1.5,
  healVillage: 2.5,
  healTown: 3,
  healGoldPerHour: 1,
};

const BAND_NAMES: Record<BandKind, string> = { bandits: 'Bandits', raiders: 'Galatae raiders', mercs: 'Mercenaries' };
const BAND_MIX: Record<BandKind, ArmyMix> = { bandits: 'bandits', raiders: 'raiders', mercs: 'mercs' };

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

  constructor(save: WorldSave, map?: WorldMap) {
    this.s = save;
    this.map = map ?? generateMap(save.seed);
    this.rng = new Rng(save.rng);
    if (save.dest) this.setDestination(save.dest[0], save.dest[1], save.destSettlement, save.destParty);
  }

  /** A new world: the party stands in the starting town; a few bands roam. */
  static fresh(seed: number): WorldSave {
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
    };
    const w = new World(s, map);
    for (let i = 0; i < 9; i++) w.spawnParty(i % 4 === 3 ? 'town' : 'lair');
    w.sync();
    return s;
  }

  sync(): WorldSave {
    this.s.rng = this.rng.state;
    return this.s;
  }

  get days(): number {
    return this.s.time / 24;
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
    const goal = this.nearestPassable(tx, ty);
    if (!goal) return false;
    const from = this.tileOf(this.s.x, this.s.y);
    const p = this.path(from, goal);
    if (!p) return false;
    p.shift(); // we are already on the first tile
    this.route = p;
    if (p.length === 0) this.route = [{ x: goal.x + 0.5, y: goal.y + 0.5 }];
    this.s.dest = [goal.x, goal.y];
    this.s.destSettlement = settlement;
    this.s.destParty = party;
    return true;
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
    let done = 0;
    const STEP = 0.05;
    while (done < hours - 1e-9 && events.length === 0) {
      const h = Math.min(STEP, hours - done);
      done += h;
      this.s.time += h;
      if (!waiting) this.movePlayer(h, player, events);
      if (events.length) break;
      this.updateParties(h, player);
      this.checkContact(player, events);
      if (this.s.time - this.s.lastSpawn >= WORLD_RULES.spawnEvery) {
        this.s.lastSpawn = this.s.time;
        if (this.s.parties.length < Math.min(WORLD_RULES.maxParties, 9 + Math.floor(this.days / 2))) this.spawnParty(this.rng.chance(0.25) ? 'town' : 'lair');
      }
    }
    this.sync();
    return { events, hours: done };
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
    let budget = h * partySpeed(player.size);
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
    const visible = d < WORLD_RULES.vision && this.s.inside < 0 && this.s.time >= this.s.safeUntil;
    let mode: PartyMode = 'wander';
    if (visible && ratio >= WORLD_RULES.chaseRatio) mode = 'chase';
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
    if (p.kind === 'mercs' && this.rng.chance(0.6)) {
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

  /** A lair (or a town, for mercenaries) sends out a new band, sized by local danger and the date. */
  spawnParty(from: 'lair' | 'town'): PartyState | null {
    const homes = this.map.settlements.filter((s) => (from === 'lair' ? s.kind === 'lair' : s.kind === 'town' && s.id !== this.map.start));
    if (homes.length === 0) return null;
    const home = this.rng.pick(homes);
    const kind: BandKind = from === 'town' ? 'mercs' : home.band ?? 'bandits';
    const at = this.nearestPassable(home.x + this.rng.int(-2, 2), home.y + this.rng.int(-2, 2), 4);
    if (!at) return null;
    const danger = dangerAt(this.map, home.x, home.y);
    const days = this.days;
    const r = this.rng;
    let size: number;
    let level: number;
    let tier: number;
    if (kind === 'bandits') {
      size = 3 + Math.round(danger * 5) + r.int(0, 2);
      level = 1 + Math.round(danger * 2 + days * 0.04);
      tier = danger > 0.7 ? 2 : 1;
    } else if (kind === 'raiders') {
      size = 5 + Math.round(danger * 7) + r.int(0, 3);
      level = 1 + Math.round(danger * 3 + days * 0.05);
      tier = danger > 0.5 ? 2 : 1;
    } else {
      size = 6 + Math.round(danger * 6) + r.int(0, 4);
      level = 2 + Math.round(danger * 2 + days * 0.05);
      tier = 2;
    }
    const p: PartyState = {
      id: this.s.nextParty++,
      kind,
      name: home.name === 'Pirate cove' ? 'Pirates' : BAND_NAMES[kind],
      culture: kind === 'raiders' ? 'celtic' : kind === 'mercs' ? r.pick(['greek', 'phoenician', 'celtic'] as const) : home.culture,
      x: at.x + 0.5,
      y: at.y + 0.5,
      size: Math.min(18, size),
      power: 0,
      level: Math.min(8, level),
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

  removeParty(id: number): void {
    this.s.parties = this.s.parties.filter((p) => p.id !== id);
    this.aiRoutes.delete(id);
    this.aiThink.delete(id);
    if (this.s.destParty === id) this.stop();
  }

  /** A band that lost men in a fight it won: smaller, and it rests a while. */
  weakenParty(id: number, lost: number, idleHours: number): void {
    const p = this.party(id);
    if (!p) return;
    p.size -= lost;
    if (p.size <= 0) {
      this.removeParty(id);
      return;
    }
    p.seed = (p.seed * 1664525 + 1013904223) >>> 0 || 1;
    p.power = partyArmy(p, { nextId: 1 }).power;
    p.idle = idleHours;
    this.aiRoutes.delete(id);
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
    if (!def || def.kind === 'lair') return [];
    const st = this.placeState(id);
    const base = `${this.s.seed}:${id}:${st.epoch}`;
    const count = def.kind === 'village' ? 1 + Math.floor(hashFrac(base + ':n') * 3) : 2 + Math.floor(hashFrac(base + ':n') * 3);
    const out: Recruit[] = [];
    for (let i = 0; i < count; i++) {
      if (st.bought.includes(i)) continue;
      out.push({ index: i, ...makeRecruit(def, `${base}:r${i}`, { nextId: 1 }, roster) });
    }
    return out;
  }

  /** Hire volunteer `index`: returns the hero (with real ids) and its price, or null. */
  hire(id: number, index: number, ids: IdSource, roster: readonly Hero[]): { hero: Hero; price: number } | null {
    const def = this.map.settlements[id];
    const st = this.placeState(id);
    if (!def || st.bought.includes(index)) return null;
    const r = makeRecruit(def, `${this.s.seed}:${id}:${st.epoch}:r${index}`, ids, roster);
    st.bought.push(index);
    return r;
  }

  /** Market wares in a town (deterministic per stock epoch). */
  wares(id: number): Ware[] {
    const def = this.map.settlements[id];
    if (!def || def.kind !== 'town') return [];
    const st = this.placeState(id);
    const rng = new Rng(hashString(`${this.s.seed}:${id}:${st.epoch}:market`));
    const pool = ITEM_LIST.filter((d) => d.tier <= 2 || rng.chance(0.3));
    const out: Ware[] = [];
    const ids = { nextId: 1 };
    for (let i = 0; i < 10; i++) {
      const d = rng.pick(pool);
      const item = makeItem(rng, ids, d.id, rollRarity(rng, 2), rng.range(70, 100), def.culture);
      item.uid = `w${id}_${st.epoch}_${i}`;
      if (st.sold.includes(i)) continue;
      out.push({ index: i, item, price: Math.round(itemValue(item) * 1.5) });
    }
    return out;
  }

  /** Mark ware `index` as bought; returns it with a fresh uid. */
  buy(id: number, index: number, ids: IdSource): Ware | null {
    const w = this.wares(id).find((x) => x.index === index);
    if (!w) return null;
    this.placeState(id).sold.push(index);
    w.item.uid = `i${(ids.nextId++).toString(36)}`;
    return w;
  }
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

/** The band's army, generated from its seed (identical at every call). */
export function partyArmy(p: PartyState, ids: IdSource): EnemyArmy {
  // Now and then a lair's band is a mythical beast (src/game/beasts.ts): a rare encounter.
  const beast = p.kind !== 'mercs' ? bandBeast(p.seed) : null;
  if (beast) return beastEnemy(beast, Math.max(2, p.level + 1), p.seed, ids);
  return buildArmy(new Rng(p.seed), ids, { culture: p.culture, count: p.size, level: p.level, tier: p.tier, targetPower: 0, mix: BAND_MIX[p.kind], tune: false });
}
