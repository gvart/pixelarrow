/**
 * Overland events (design/gdd/campaign-events.md): the event definition, the
 * closed effect vocabulary (R2), the trigger rates and pacing knobs (R3) and
 * the pure parts of the draw. The world draws (src/world/world.ts), the
 * campaign resolves (src/game/campaign.ts). Offline only: no effect touches
 * the sim; `nextBattle` bonuses are post-battle rewards (src/game/loot.ts).
 *
 * The deck itself is content (EV-02, src/data/eventDeck.ts). Until it lands
 * EVENT_DECK is empty and the engine draws nothing.
 */
import type { ClassId } from './classes';
import type { Rarity, Slot } from './items';
import type { DoctrineId } from '../sim/types';
import { Rng, hashString } from '../sim/rng';

export type EventTrigger = 'march' | 'arrive_village' | 'arrive_town' | 'camp' | 'after_battle' | 'flag';
export type EventTarget = 'all' | 'one_random' | 'lowest';
export type NextBattleBonus = 'pick' | 'xp' | 'gold';
export type EventBandKind = 'bandits' | 'raiders' | 'mercs';
/** A settlement an effect names: an id, or the one the party is in or arrived at. */
export type PlaceRef = number | 'here';
export type ArcStageRef = 'lairs' | 'host' | 'won' | 'post';
/** Who an event recruits: a class, or a raw levy. */
export type RecruitClass = ClassId | 'raw';

/** The closed effect vocabulary (R2). A new effect needs a GDD update. */
export type Effect =
  | { k: 'gold'; n: number }
  | { k: 'food'; n: number }
  | { k: 'supplies'; n: number }
  | { k: 'recruit'; cls: RecruitClass; level: number; n: number }
  | { k: 'xp'; target: EventTarget; n: number }
  | { k: 'wound'; target: EventTarget; hours: number }
  | { k: 'heal' }
  | { k: 'item'; rarity: Rarity; slot?: Slot }
  | { k: 'spawnBand'; kind: EventBandKind; mods: BandMods }
  | { k: 'weakenGarrison'; lair: number | 'nearest'; n: number }
  | { k: 'reveal'; at: number | 'nearest' | { radius: number } }
  | { k: 'retrain' }
  | { k: 'priceMod'; place: PlaceRef; pct: number; days: number }
  | { k: 'closeSettlement'; place: PlaceRef; days: number }
  | { k: 'nextBattle'; bonus: NextBattleBonus }
  | { k: 'setFlag'; name: string; value?: number }
  | { k: 'clearFlag'; name: string };

/** spawnBand mods (R2): size x, level +, a captain, hunting, a doctrine, the bounty multiplier. */
export interface BandMods {
  size?: number;
  level?: number;
  captain?: boolean;
  hunts?: boolean;
  doctrine?: DoctrineId;
  /** Multiplies the ai-doctrines.md F3 bounty; default 1, clamped to 1..3. */
  bountyMult?: number;
}

/** Effect constructors in the GDD's notation: `fx.gold(30)`, `fx.setFlag('ares_angry')`. */
export const fx = {
  gold: (n: number): Effect => ({ k: 'gold', n }),
  food: (n: number): Effect => ({ k: 'food', n }),
  supplies: (n: number): Effect => ({ k: 'supplies', n }),
  recruit: (cls: RecruitClass, level: number, n: number): Effect => ({ k: 'recruit', cls, level, n }),
  xp: (target: EventTarget, n: number): Effect => ({ k: 'xp', target, n }),
  wound: (target: EventTarget, hours: number): Effect => ({ k: 'wound', target, hours }),
  heal: (): Effect => ({ k: 'heal' }),
  item: (rarity: Rarity, slot?: Slot): Effect => ({ k: 'item', rarity, slot }),
  spawnBand: (kind: EventBandKind, mods: BandMods = {}): Effect => ({ k: 'spawnBand', kind, mods }),
  weakenGarrison: (lair: number | 'nearest', n: number): Effect => ({ k: 'weakenGarrison', lair, n }),
  reveal: (at: number | 'nearest' | { radius: number }): Effect => ({ k: 'reveal', at }),
  retrain: (): Effect => ({ k: 'retrain' }),
  priceMod: (place: PlaceRef, pct: number, days: number): Effect => ({ k: 'priceMod', place, pct, days }),
  closeSettlement: (place: PlaceRef, days: number): Effect => ({ k: 'closeSettlement', place, days }),
  nextBattle: (bonus: NextBattleBonus): Effect => ({ k: 'nextBattle', bonus }),
  setFlag: (name: string, value?: number): Effect => ({ k: 'setFlag', name, value }),
  clearFlag: (name: string): Effect => ({ k: 'clearFlag', name }),
};

export interface EventChoice {
  /** The i18n key suffix and the journal's choice key. */
  key: string;
  /** Paid first; a cost the army can't pay disables the choice (R4.4). */
  cost?: Effect[];
  effects: Effect[];
  /** Rolled from the pending event's seed: below `p` the effects apply, otherwise `fail`. */
  chance?: { p: number; fail: Effect[] };
}

export interface EventCond {
  minDay?: number;
  maxDay?: number;
  /** Danger at the party's position, inclusive. */
  danger?: [number, number];
  flags?: string[];
  notFlags?: string[];
  minMen?: number;
  minGold?: number;
  arcStage?: ArcStageRef[];
  /** Some band on the map has escaped from the player at least this often (ai-doctrines.md R8; `rival_returns`). */
  escaped?: number;
}

export interface EventDef {
  id: string;
  trigger: EventTrigger;
  /** Draw weight among the eligible events. */
  weight: number;
  cond: EventCond;
  /** Fires at most once per campaign. */
  unique?: boolean;
  /** Days before this event may be drawn again. */
  cooldownDays: number;
  /**
   * A `flag` event comes due `days` (a seeded pick in the range) after `flag`
   * was set (its value is the day it was set): the GDD's `flag:<name>@day`.
   */
  after?: { flag: string; days: [number, number] };
  /** 2-3 (R1); at least one costs nothing (R4.5). */
  choices: EventChoice[];
}

/** Trigger rates and pacing (R3, Tuning Knobs). */
export const EVENT_RULES = {
  rate: { march: 0.1, arrive: 0.25, camp: 0.2, afterBattle: 0.25 },
  /** A march check every this many game hours of travel. */
  marchEveryH: 12,
  /** Days before a settlement can raise another arrival event. */
  arriveCdDays: 3,
  /** EVENTS_PER_DAY and EVENT_MIN_GAP_H. Flag events ignore the gap but count toward the cap. */
  perDay: 1,
  minGapH: 24,
  /** eventCd of a used `unique` event: never again. */
  usedDay: 1e9,
};

/** `nextBattle` bonuses (R2): post-battle rewards only, never sim inputs. */
export const NEXT_BATTLE = { xp: 0.5, gold: 0.5, picks: 1 };

/**
 * Reserved keys (an '@' prefix: never an event id or a content flag). They
 * ride the v6 `flags` / `eventCd` maps, so they need no save field.
 */
export const EV_KEY = {
  /** eventCd: the day (fractional) the 24 h gap ends. */
  gap: '@gap',
  /** eventCd: a settlement's arrival cooldown. */
  arrive: (sid: number) => `@arrive:${sid}`,
  /** flags: a pending `nextBattle` bonus (1 = set). */
  next: (b: NextBattleBonus) => `@next:${b}`,
  /** flags: free perk retrains owed (abilities.md R7). */
  retrain: '@retrain',
  /** flags: a settlement's price change in %; eventCd: the day it ends. */
  price: (sid: number) => `@price:${sid}`,
  /** eventCd: a settlement is closed until this day. */
  closed: (sid: number) => `@closed:${sid}`,
};

/**
 * The starter deck (EV-02). Empty until that story lands, so the engine is
 * live but draws nothing. The card UI must ship before the deck does: a
 * pending event pauses the map.
 */
export const EVENT_DECK: readonly EventDef[] = [];

/** What an event's `cond` is checked against. */
export interface EventCtx {
  day: number;
  danger: number;
  flags: Readonly<Record<string, number>>;
  men: number;
  gold: number;
  arcStage: ArcStageRef;
  /** The highest `escaped` of any band on the map. */
  escaped: number;
}

export function condMet(c: EventCond, x: EventCtx): boolean {
  if (c.minDay !== undefined && x.day < c.minDay) return false;
  if (c.maxDay !== undefined && x.day > c.maxDay) return false;
  if (c.danger && (x.danger < c.danger[0] || x.danger > c.danger[1])) return false;
  if (c.flags && !c.flags.every((f) => f in x.flags)) return false;
  if (c.notFlags && c.notFlags.some((f) => f in x.flags)) return false;
  if (c.minMen !== undefined && x.men < c.minMen) return false;
  if (c.minGold !== undefined && x.gold < c.minGold) return false;
  if (c.arcStage && !c.arcStage.includes(x.arcStage)) return false;
  if (c.escaped !== undefined && x.escaped < c.escaped) return false;
  return true;
}

/** The day a `flag` event comes due, or null while its flag is unset. Seeded per world and flag value. */
export function dueDay(def: EventDef, flags: Readonly<Record<string, number>>, worldSeed: number): number | null {
  if (!def.after) return null;
  const set = flags[def.after.flag];
  if (set === undefined) return null;
  const [lo, hi] = def.after.days;
  return set + new Rng(hashString(`${worldSeed}:due:${def.id}:${set}`)).int(lo, Math.max(lo, hi));
}

/** Events of `trigger` that may be drawn now: cond met, off cooldown (which covers a used unique), due if a flag event. */
export function eligibleEvents(
  deck: readonly EventDef[], trigger: EventTrigger, ctx: EventCtx, eventCd: Readonly<Record<string, number>>, worldSeed: number,
): EventDef[] {
  return deck.filter((d) => {
    if (d.trigger !== trigger || d.weight <= 0) return false;
    if ((eventCd[d.id] ?? -Infinity) > ctx.day) return false;
    if (!condMet(d.cond, ctx)) return false;
    if (trigger === 'flag') {
      const due = dueDay(d, ctx.flags, worldSeed);
      if (due === null || ctx.day < due) return false;
    }
    return true;
  });
}

/** A weighted pick among `defs` (none -> null). */
export function pickEvent(defs: readonly EventDef[], rng: Rng): EventDef | null {
  if (defs.length === 0) return null;
  return rng.weighted(defs.map((d) => [d, d.weight] as const));
}

export function eventById(deck: readonly EventDef[], id: string): EventDef | undefined {
  return deck.find((d) => d.id === id);
}
