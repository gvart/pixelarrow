/**
 * Where set pieces and named legendaries come from, and the rules every item
 * source shares (docs/ITEMS.md "Where items come from"). Pure and seeded:
 * the campaign, the duel ladder, the war map and the Worker all use these.
 *
 * - Loot follows the army: a weapon, shield or armour a source picks fits a
 *   class of the player's army 70% of the time (`armyPick`).
 * - Set pieces: tier-3 campaign bands, beast hoards, ladder chapter chests,
 *   trading posts, world-boss chests and the ranked season reward.
 * - Named legendaries: beasts, world bosses and the ladder's boss floors.
 * - Bad-luck protection (`pityChest`): beast and world-boss chests that are
 *   not legendary count up; at `SOURCES.pity` the next one is legendary.
 */
import { BASE_ITEMS, ITEMS, itemDef, type Item, type ItemDef, type Rarity, type Slot } from '../data/items';
import { classGearBlocker } from '../data/gearRules';
import { SETS, setPieces } from '../data/sets';
import type { EncounterId } from '../data/beasts';
import type { Culture } from '../data/names';
import type { Hero } from '../data/units';
import { Rng, hashString } from '../sim/rng';

export const SOURCES = {
  /** Share of weapon, shield and armour picks that fit a class of the player's army. */
  armyShare: 0.7,
  /** Tier-3 campaign bands: share of the rare pieces they carry that are a piece of their set. */
  bandSet: 0.04,
  /** Beast hoards: share of epic drops that are an epic set piece, of legendary drops that are the beast's named item. */
  hoardSet: 0.25,
  hoardNamed: 0.2,
  /** Non-legendary beast or world-boss chests in a row after which the next one is legendary. */
  pity: 8,
  /** World-boss chests: the smallest damage share that earns one, and the odds of a set piece and of the named item. */
  bossChest: { minShare: 0.05, set: 0.4, named: 0.1 },
  /** Duel ladder boss floors 30 / 40 / 50: chance of the floor's named item on the first clear and on a won replay. */
  ladderNamed: { first: 0.25, replay: 0.02 },
  /** Trading posts: the epic slot is a piece of the realm's epic set one UTC day in this many. */
  postSetDays: 3,
};

/** The slots whose picks follow the army (helmets and trinkets fit every class). */
const ARMY_SLOTS: Slot[] = ['weapon', 'shield', 'armor'];

/** The distinct classes of an army, sorted (a stable input for seeded picks). */
export function armyClasses(heroes: readonly Pick<Hero, 'cls'>[]): string[] {
  return [...new Set(heroes.map((h) => h.cls).filter((c): c is NonNullable<typeof c> => !!c))].sort();
}

/** Can some class of the army use this item? Helmets and trinkets always fit. */
export function fitsArmy(def: ItemDef, classes: readonly string[]): boolean {
  return !ARMY_SLOTS.includes(def.slot) || classes.some((c) => classGearBlocker(c, def) === null);
}

/**
 * A pick from `pool` that follows the army: helmets and trinkets come up as
 * often as before; a weapon, shield or armour is, `SOURCES.armyShare` of the
 * time, re-picked among the pool's weapons, shields and armour the army can
 * use (an army of archers gets bows and armour, never a shield it cannot
 * carry). Without classes it is a plain `rng.pick` (same draws as before).
 */
export function armyPick(rng: Rng, pool: readonly ItemDef[], classes: readonly string[]): ItemDef {
  const d = rng.pick(pool);
  if (!classes.length || !ARMY_SLOTS.includes(d.slot) || !rng.chance(SOURCES.armyShare)) return d;
  const fit = pool.filter((x) => ARMY_SLOTS.includes(x.slot) && fitsArmy(x, classes));
  return fit.length ? rng.pick(fit) : d;
}

// ------------------------------------------------------------------ who drops what

/** Each beast's named legendaries (docs/ITEMS.md "Named legendaries"). */
export const BEAST_NAMED: Record<EncounterId, string[]> = {
  nemean_lion: ['herakles_club', 'nemean_pelt'],
  hydra: ['philoctetes_bow'],
  minotaur: ['minotaur_horn'],
  cyclops: ['cyclops_hammer'],
  harpies: ['harpy_helm'],
  chimera: ['chimera_cuirass'],
  kraken: ['poseidon_trident'],
  titan: ['aegis_of_zeus'],
};

/** The legendary set of each world boss. */
export const BOSS_SET: Partial<Record<EncounterId, string>> = { kraken: 'achilles', titan: 'alexander' };

/** The named item of the duel ladder's boss floors. */
export const LADDER_NAMED: Readonly<Record<number, string>> = { 30: 'harpe_of_perseus', 40: 'helm_of_hades', 50: 'golden_fleece' };

/** The set of each ladder chapter's top chest (rare sets in 1-3, epic sets in 4-5). */
export const CHAPTER_SET: Readonly<Record<number, string>> = { 1: 'agoge', 2: 'peltast', 3: 'cretan', 4: 'brennus', 5: 'immortals' };

/** Epic sets that beast hoards hold. */
export const HOARD_SETS = ['brennus', 'immortals', 'sacred_band'];

/** The set a Strategos or Legend season reward lets the player pick a piece of. */
export const SEASON_SET = 'sacred_band';

/**
 * The rare set of a tier-3 campaign band's hero: archers carry Cretan
 * pieces, javelin men Peltast pieces, the rest of a Greek band Agoge pieces.
 */
export function bandSetOf(cls: string | undefined, culture: Culture): string | null {
  if (cls === 'archer') return 'cretan';
  if (cls === 'javelineer' || cls === 'peltast') return 'peltast';
  return culture === 'greek' ? 'agoge' : null;
}

/** Item defs of a set's pieces. */
export function pieceDefs(set: string): ItemDef[] {
  return setPieces(set).map(itemDef);
}

/** Every set piece and named legendary that some source here hands out (tests/itemSources.test.ts checks it covers them all). */
export function specialSourceIds(): string[] {
  const sets = new Set<string>([...Object.values(CHAPTER_SET), ...HOARD_SETS, SEASON_SET, ...Object.values(BOSS_SET).filter((s): s is string => !!s), 'agoge', 'peltast', 'cretan']);
  return [...[...sets].flatMap(setPieces), ...Object.values(BEAST_NAMED).flat(), ...Object.values(LADDER_NAMED)];
}

// ------------------------------------------------------------------ campaign bands

/**
 * Tier-3 bands now and then carry a piece of their set (`bandSetOf`): each
 * rare piece a hero wears is, `SOURCES.bandSet` of the time, swapped for the
 * set's piece of that slot (one the hero's class can use). Seeded by the
 * band's own seed, so the band stays the same at every call.
 */
export function bandSetPieces(heroes: Hero[], culture: Culture, tier: number, seed: number): void {
  if (tier < 3) return;
  const rng = new Rng(hashString(`${seed >>> 0}:bandset`) || 1);
  for (const h of heroes) {
    const set = bandSetOf(h.cls, culture);
    for (const slot of Object.keys(h.equip) as Slot[]) {
      const it = h.equip[slot];
      if (!it || it.rarity !== 'rare' || !rng.chance(SOURCES.bandSet) || !set) continue;
      const fits = pieceDefs(set).filter((d) => d.slot === slot && classGearBlocker(h.cls ?? '', d) === null);
      if (!fits.length) continue;
      h.equip[slot] = withDef(it, rng.pick(fits).id, SETS[set].rarity);
    }
  }
}

/** An item turned into another def at a rarity (its random stats and power then roll from its uid for the new def). */
export function withDef(it: Item, def: string, rarity: Rarity): Item {
  const out: Item = { ...it, def, rarity };
  delete out.aff;
  delete out.pow;
  if (out.paint && ITEMS[def].slot !== 'shield' && ITEMS[def].slot !== 'helmet') delete out.paint;
  return out;
}

// ------------------------------------------------------------------ bad-luck protection

/**
 * A beast or world-boss chest against the bad-luck counter `count`: a chest
 * with a legendary resets it; one without adds 1, unless the counter has
 * reached `SOURCES.pity`, when `upgrade` makes its first item legendary and
 * the counter resets. An empty chest changes nothing.
 */
export function pityChest(items: Item[], count: number, upgrade: (it: Item) => Item): { items: Item[]; count: number; forced: boolean } {
  if (!items.length) return { items, count, forced: false };
  if (items.some((it) => it.rarity === 'legendary')) return { items, count: 0, forced: false };
  if (count >= SOURCES.pity) return { items: [upgrade(items[0]), ...items.slice(1)], count: 0, forced: true };
  return { items, count: count + 1, forced: false };
}

/**
 * A hoard item made legendary by the bad-luck counter: the beast's named
 * item `SOURCES.hoardNamed` of the time, else the same piece at legendary (a
 * set piece, which has its own rarity, becomes a finer piece of its slot).
 */
export function legendaryHoard(it: Item, named: readonly string[], seed: string): Item {
  const rng = new Rng(hashString(`${seed}:pity`) || 1);
  if (named.length && rng.chance(SOURCES.hoardNamed)) return withDef(it, rng.pick(named), 'legendary');
  const def = ITEMS[it.def];
  if (!def.set && !def.named) return withDef(it, it.def, 'legendary');
  const pool = BASE_ITEMS.filter((d) => d.slot === def.slot && d.tier >= 2);
  return withDef(it, rng.pick(pool).id, 'legendary');
}
