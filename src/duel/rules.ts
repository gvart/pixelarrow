/**
 * Duel mode rules shared by the client and the Worker (pure TS: no Phaser,
 * DOM, clocks or Math.random). docs/DUELS.md has the design.
 *
 * The duel army is separate from the war-map army and persistent: it is never
 * touched by season resets. Fairness comes from a point budget: every hero and
 * every item has a cost, and a team must fit the budget of the battle. Levels
 * make a hero stronger AND more expensive, so progression gives choice (a few
 * veterans or many recruits), not a free win.
 */
import { Rng } from '../sim/rng';
import { CLASSES, type ClassId } from '../data/classes';
import type { Culture } from '../data/names';
import { ITEM_LIST, itemDef, itemMods, itemValue, type Item, type Rarity, type Slot, type StatMods } from '../data/items';
import { ATTR_IDS, ATTR_MAX, PERKS, POINTS_PER_LEVEL, perkBlocker, type Attrs, type PerkId } from '../data/perks';
import type { Hero } from '../data/units';
import { makeHero, makeItem, type IdSource } from '../game/heroes';
import { itemModLines } from '../game/gear';
import { scopeHero } from '../online/rules';

export const DUEL_RULES = {
  /** Heroes a player may own in the duel roster. */
  rosterMax: 30,
  /** Heroes in one team (one battle). */
  teamMax: 10,
  /** Point budget of ranked and unranked duels (the ladder has its own per floor). */
  budget: 150,
  /** Glory a new duel profile starts with. */
  startGlory: 200,
  /** Glory from ladder replays (farming) per UTC day; first clears and XP are not capped. */
  farmGloryPerDay: 300,
  /** A ladder ticket must be submitted within this time. */
  ticketTtlMs: 10 * 60_000,
  battleTimeLimit: 300,
  /** Duel account level gating ranked play (docs/DUELS.md "Unlock"). */
  rankedLevel: 5,
  maxAccountLevel: 30,
  /** Respec price per hero level. */
  respecPerLevel: 20,
  /** Gear the duel shop sells from its fixed catalogue (rarer gear: the daily offers and the ladder). */
  shopRarities: ['common', 'uncommon', 'rare'] as Rarity[],
  /** Daily offers in the shop. */
  dailyOffers: 4,
  /** Saved team presets (loadouts) a player may keep, slots 1..presetsMax. */
  presetsMax: 5,
  /** Longest preset name (trimmed). */
  presetNameMax: 16,
};

// ------------------------------------------------------------------ presets

/** A preset's shown name: its own, or "Team <slot>". */
export function presetName(l: { slot: number; name: string | null }): string {
  return l.name?.trim() || `Team ${l.slot}`;
}

/** A preset name as stored: trimmed, at most presetNameMax, null for the default. */
export function cleanPresetName(name: string | null | undefined): string | null {
  const s = (name ?? '').trim();
  return s ? s.slice(0, DUEL_RULES.presetNameMax) : null;
}

// ------------------------------------------------------------------ costs

/** Budget points of an item by rarity (cosmetics cost nothing). */
export const RARITY_POINTS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 4, legendary: 6 };

/** Budget points of a class at level 1: a tenth of its recruitment price (hoplite 10, archer 5, companion 16). */
export function classPoints(cls: ClassId): number {
  return Math.max(1, Math.round(CLASSES[cls].cost / 10));
}

/** A hero's level cost: level 10 costs twice level 1. */
export function levelMult(level: number): number {
  return 1 + (Math.max(1, Math.min(10, level)) - 1) / 9;
}

export function itemPoints(it: Pick<Item, 'rarity'> | null | undefined): number {
  return it ? RARITY_POINTS[it.rarity] ?? 0 : 0;
}

/** Budget points of a hero with the gear he wears. */
export function heroPoints(h: Hero): number {
  const cls = (h.cls ?? 'militia') as ClassId;
  const base = Math.round((CLASSES[cls] ? classPoints(cls) : 6) * levelMult(h.level));
  return base + Object.values(h.equip).reduce((a, it) => a + itemPoints(it), 0);
}

export function teamPoints(heroes: readonly Hero[]): number {
  return heroes.reduce((a, h) => a + heroPoints(h), 0);
}

/** Why a team cannot fight a battle of `budget` points, or null. */
export function teamProblem(heroes: readonly Hero[], budget: number): 'empty' | 'too_many' | 'over_budget' | null {
  if (heroes.length === 0) return 'empty';
  if (heroes.length > DUEL_RULES.teamMax) return 'too_many';
  if (teamPoints(heroes) > budget) return 'over_budget';
  return null;
}

// ------------------------------------------------------------------ account level

/** Total duel XP needed to reach `level` (level 2 at 50, level 5 at 500, level 10 at 2250). */
export function xpForLevel(level: number): number {
  return 25 * level * (level - 1);
}

export function accountLevel(xp: number): number {
  let l = 1;
  while (l < DUEL_RULES.maxAccountLevel && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Progress inside the current account level. */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = accountLevel(xp);
  if (level >= DUEL_RULES.maxAccountLevel) return { level, into: 0, need: 0 };
  return { level, into: xp - xpForLevel(level), need: xpForLevel(level + 1) - xpForLevel(level) };
}

// ------------------------------------------------------------------ recruiting

/** Classes the duel shop recruits, with the account level that unlocks each. Beasts are never recruited. */
export const DUEL_CLASSES: { cls: ClassId; level: number }[] = [
  { cls: 'militia', level: 1 },
  { cls: 'hoplite', level: 1 },
  { cls: 'thureophoros', level: 1 },
  { cls: 'celt_sword', level: 1 },
  { cls: 'archer', level: 1 },
  { cls: 'slinger', level: 1 },
  { cls: 'javelineer', level: 1 },
  { cls: 'peltast', level: 1 },
  { cls: 'rhomphaia', level: 3 },
  { cls: 'falx', level: 3 },
  { cls: 'gallic', level: 3 },
  { cls: 'fanatic', level: 3 },
  { cls: 'horse_archer', level: 5 },
  { cls: 'thessalian', level: 5 },
  { cls: 'royal_guard', level: 8 },
  { cls: 'sacred_band', level: 8 },
  { cls: 'companion', level: 10 },
  { cls: 'chariot', level: 12 },
];

export function classUnlockLevel(cls: ClassId): number | null {
  return DUEL_CLASSES.find((c) => c.cls === cls)?.level ?? null;
}

/** Glory price of a level-1 recruit: the class's recruitment price. */
export function recruitPrice(cls: ClassId): number {
  return CLASSES[cls].cost;
}

function cultureOf(cls: ClassId, rng: Rng): Culture {
  const c = CLASSES[cls].cultures;
  return c.length ? rng.pick(c) : 'greek';
}

/** A level-1 duel recruit of a class with common starting gear. */
export function duelRecruit(seed: number, ids: IdSource, prefix: string, cls: ClassId, roster: readonly Hero[]): Hero {
  const rng = new Rng(seed >>> 0 || 1);
  const h = makeHero(rng, ids, cultureOf(cls, rng), cls, 1, 1, undefined, roster);
  for (const it of Object.values(h.equip)) if (it) {
    it.rarity = 'common';
    it.cond = 100;
  }
  delete h.equip.trinket;
  return scopeHero(h, prefix);
}

/** The roster a new duel profile starts with: 2 hoplites, 2 archers, a peltast and a slinger. */
export const STARTER_CLASSES: ClassId[] = ['hoplite', 'hoplite', 'archer', 'archer', 'peltast', 'slinger'];

export function starterDuelRoster(seed: number, ids: IdSource, prefix: string): Hero[] {
  const rng = new Rng(seed >>> 0 || 1);
  const out: Hero[] = [];
  for (const cls of STARTER_CLASSES) out.push(duelRecruit(rng.int(1, 0x7fffffff), ids, prefix, cls, out));
  return out;
}

/** Duel heroes keep their gear in perfect condition: no wear in duels. */
export function freshGear(h: Hero): Hero {
  for (const it of Object.values(h.equip)) if (it) it.cond = 100;
  return h;
}

// ------------------------------------------------------------------ development

/**
 * Attribute points and perks a player chose for a hero, checked against the
 * hero's level, points and class tree (the server applies exactly this).
 * Returns the developed copy or an error code.
 */
export function developHero(h: Hero, add: Partial<Attrs>, perks: readonly string[]): Hero | 'no_points' | 'attr_max' | 'bad_perk' {
  const out = JSON.parse(JSON.stringify(h)) as Hero;
  let spend = 0;
  for (const k of ATTR_IDS) {
    const n = Math.max(0, Math.floor(add[k] ?? 0));
    if (out.attrs[k] + n > ATTR_MAX) return 'attr_max';
    out.attrs[k] += n;
    spend += n;
  }
  if (spend > out.points) return 'no_points';
  out.points -= spend;
  for (const id of perks) {
    if (!(id in PERKS) || perkBlocker(out, id as PerkId) !== null) return 'bad_perk';
    out.perks.push(id as PerkId);
  }
  return out;
}

/** Respec: the attributes the hero was recruited with, all points back, no perks. */
export function respecHero(h: Hero, base: Attrs): Hero {
  const out = JSON.parse(JSON.stringify(h)) as Hero;
  out.attrs = { ...base };
  out.points = (out.level - 1) * POINTS_PER_LEVEL;
  out.perks = [];
  return out;
}

export function respecPrice(h: Pick<Hero, 'level'>): number {
  return DUEL_RULES.respecPerLevel * h.level;
}

// ------------------------------------------------------------------ the duel shop

/** Glory price multiplier of gear by rarity. */
export const RARITY_PRICE: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 14 };

/** Glory price of an item def at a rarity (half its market value times the rarity factor, at least 5). */
export function gearPrice(defId: string, rarity: Rarity): number {
  return Math.max(5, Math.round((itemDef(defId).value / 2) * RARITY_PRICE[rarity]));
}

export interface ShopOffer {
  /** Stable id of the offer (the client sends it back to buy). */
  id: string;
  def: string;
  rarity: Rarity;
  price: number;
}

/** The fixed catalogue: every item at the shop rarities. */
export function catalogue(): ShopOffer[] {
  const out: ShopOffer[] = [];
  for (const d of ITEM_LIST) for (const r of DUEL_RULES.shopRarities) out.push({ id: `${d.id}:${r}`, def: d.id, rarity: r, price: gearPrice(d.id, r) });
  return out;
}

/** UTC day number of a timestamp (the daily offers and the farm cap reset at 00:00 UTC). */
export function utcDay(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

/** Today's offers: three rare items and one epic, 20% off, the same for everyone on a UTC day. */
export function dailyOffers(day: number): ShopOffer[] {
  const rng = new Rng((day * 2654435761) >>> 0 || 1);
  const pool = ITEM_LIST.filter((d) => d.value >= 25);
  const picked = new Set<string>();
  const out: ShopOffer[] = [];
  while (out.length < DUEL_RULES.dailyOffers && picked.size < pool.length) {
    const d = rng.pick(pool);
    if (picked.has(d.id)) continue;
    picked.add(d.id);
    const rarity: Rarity = out.length === DUEL_RULES.dailyOffers - 1 ? 'epic' : 'rare';
    out.push({ id: `day${day}:${d.id}:${rarity}`, def: d.id, rarity, price: Math.round(gearPrice(d.id, rarity) * 0.8) });
  }
  return out;
}

/** The offer an id names today (catalogue or daily), or null. */
export function findOffer(id: string, day: number): ShopOffer | null {
  return catalogue().find((o) => o.id === id) ?? dailyOffers(day).find((o) => o.id === id) ?? null;
}

/** The Glory a stash item sells back for: a quarter of its shop price at its rarity. */
export function sellPrice(it: Pick<Item, 'def' | 'rarity'>): number {
  return Math.max(1, Math.floor(gearPrice(it.def, it.rarity) / 4));
}

/** An item bought in the shop (perfect condition). */
export function shopItem(seed: number, ids: IdSource, prefix: string, offer: ShopOffer): Item {
  const rng = new Rng(seed >>> 0 || 1);
  const it = makeItem(rng, ids, offer.def, offer.rarity, 100, rng.pick(['greek', 'phoenician', 'celtic'] as const));
  it.uid = `${prefix}${it.uid}`;
  return it;
}

// ------------------------------------------------------------------ shop compare

export interface OfferStatLine {
  /** The modifier (translate with the item card's labels). */
  key: keyof StatMods;
  /** The offer's value (rarity applied, perfect condition) and its card text ("+8.5", "12%"). */
  value: number;
  text: string;
  /** Offer minus the compared item (0 where it lacks the stat; the full value when nothing is equipped). */
  delta: number;
  /** Delta formatted with its sign ("+1.2", "-5%"); "" when unchanged. */
  deltaText: string;
  /** The compared item has no such stat (the delta is the whole value: shown as "new", not twice). */
  isNew?: boolean;
  /** Better for the wearer, worse, or null when unchanged. */
  better: boolean | null;
}

export interface OfferSummary {
  slot: Slot;
  /** The best item (by value) the given heroes wear in that slot, compared against; null when none. */
  vs: Item | null;
  /** Who wears `vs`. */
  vsHeroId: string | null;
  /** The 2-3 main stats of the offer. */
  lines: OfferStatLine[];
}

/** Lower is better for these (attack and shot times). */
const LOWER_BETTER: (keyof StatMods)[] = ['atkTime', 'shotTime'];
const PCT_MODS: (keyof StatMods)[] = ['accuracy', 'block', 'blockPierce', 'armorPierce', 'speed', 'xpBonus'];

function fmtDelta(key: keyof StatMods, d: number): string {
  if (Math.abs(d) < 0.005) return '';
  const pct = PCT_MODS.includes(key);
  const v = pct ? d * 100 : d;
  const dp = pct || key === 'ammo' || key === 'hp' || key === 'morale' || key === 'stamina' ? 0 : key === 'reach' || key === 'atkTime' || key === 'shotTime' || key === 'chargeBonus' || key === 'moraleShock' ? 2 : 1;
  const num = dp === 0 ? `${Math.round(v)}` : v.toFixed(dp).replace(/\.?0+$/, '');
  if (num === '0' || num === '-0') return '';
  return `${v > 0 ? '+' : ''}${num}${pct ? '%' : ''}`;
}

/**
 * The shop card's compare data: the offer's main stats (at most `max`, the
 * item card's order) and the change against the best item the `heroes` (the
 * player's current team) wear in the same slot.
 */
export function offerSummary(offer: Pick<ShopOffer, 'def' | 'rarity'>, heroes: readonly Hero[], max = 3, against?: string | null): OfferSummary {
  const def = itemDef(offer.def);
  const slot = def.slot;
  const it: Item = { uid: 'offer', def: offer.def, rarity: offer.rarity, cond: 100 };
  let vs: Item | null = null;
  let vsHeroId: string | null = null;
  // one hero picked by the player: against what he wears there (nothing: the full values)
  const one = against ? heroes.find((h) => h.id === against) : undefined;
  if (one) {
    vs = one.equip[slot] ?? null;
    vsHeroId = one.id;
  } else
    for (const h of heroes) {
      const e = h.equip[slot];
      if (e && (!vs || itemValue(e) > itemValue(vs))) {
        vs = e;
        vsHeroId = h.id;
      }
    }
  const other: StatMods = vs ? itemMods({ ...vs, cond: 100 }) : {};
  const lines = itemModLines(it).slice(0, Math.max(0, max)).map((l): OfferStatLine => {
    const delta = Math.round((l.value - (other[l.key] ?? 0)) * 100) / 100;
    const deltaText = fmtDelta(l.key, delta);
    const better = deltaText === '' ? null : (delta > 0) !== LOWER_BETTER.includes(l.key);
    return { key: l.key, value: l.value, text: l.text, delta, deltaText, better, isNew: !(l.key in other) || (other[l.key] ?? 0) === 0 };
  });
  return { slot, vs, vsHeroId, lines };
}

/** Seconds, not points: these modifiers are times. */
const TIME_MODS: (keyof StatMods)[] = ['atkTime', 'shotTime'];

/**
 * How a compare line is drawn (docs/UI_KIT.md "Stat deltas"): the arrow follows
 * the number (up when it grows), the colour follows the verdict (better /
 * worse), the text carries its unit ("+0.2 s") and, for times, the word that
 * says what it means ("slower"). Null when nothing changes.
 */
export function deltaParts(l: Pick<OfferStatLine, 'key' | 'delta' | 'deltaText' | 'better'>): { up: boolean; better: boolean; text: string; note: 'slower' | 'faster' | null } | null {
  if (!l.deltaText || l.better === null) return null;
  const time = TIME_MODS.includes(l.key);
  return { up: l.delta > 0, better: l.better, text: time ? `${l.deltaText} s` : l.deltaText, note: time ? (l.delta > 0 ? 'slower' : 'faster') : null };
}
