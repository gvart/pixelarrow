/**
 * Map merchants (docs/DUELS.md "War-map shops on the map"): pure, shared by
 * the client (demo shard, price display) and the Worker (the authority).
 *
 * - Every town (capitals included) has a merchant. The map's trading posts
 *   (kind 'post': harbours on the coast, crossroads inland) carry rarer stock.
 * - Stock is generated from (shard seed, region, UTC day) and never stored:
 *   the consumables and some basic gear everywhere, the specialties of the
 *   merchant's realm (its nearest capital), and a daily rotating rare slot.
 * - Prices are in season gold; consumables also in Drachmae (the shortcut of
 *   DESIGN_V2.md). Gear is never sold for Drachmae (no paid power).
 * - The region's holder and their clan pay 10% less; the holder earns 5% of the
 *   list gold price of every sale to someone else, paid by the merchant.
 */
import { hashString } from '../sim/rng';
import { CONSUMABLE_IDS, CONSUMABLES, type ConsumableId } from '../data/consumables';
import { BASE_ITEMS, ITEMS, type Rarity } from '../data/items';
import { setPieces } from '../data/sets';
import { SOURCES } from '../game/sources';
import type { WorldGraph } from './world';

export const MERCHANT = {
  /** Holder (and clan) discount on gold and Drachmae prices. */
  ownerDiscount: 0.1,
  /** Share of the list gold price the merchant pays the region's holder per sale. */
  ownerCut: 0.05,
  /** Gold price of gear: item value x this, by rarity. */
  gearPrice: { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 } as Record<Rarity, number>,
  /** Daily caps per player (all merchants together) for gear, by slot. */
  gearCap: { base: 2, region: 1, rare: 1 },
  /** How many basic gear offers a merchant has each day. */
  baseGear: 3,
} as const;

export type PostKind = 'harbour' | 'crossroads';
export type MerchantKind = 'town' | PostKind;

/** Seven realms, one per capital (capitals in id order, repeating): what their merchants are known for. */
export type Region = 'attica' | 'thessaly' | 'thrace' | 'crete' | 'gaul' | 'phoenicia' | 'scythia';
export const REGIONS: Region[] = ['attica', 'thessaly', 'thrace', 'crete', 'gaul', 'phoenicia', 'scythia'];

/** Regional specialties (item def ids, src/data/items.ts). */
export const SPECIALTIES: Record<Region, string[]> = {
  attica: ['aspis', 'corinthian', 'cuirass', 'owl_amulet', 'sauroter_dory', 'spartan_aspis', 'crested_chalcidian', 'bell_cuirass', 'gorgoneion'],
  thessaly: ['xyston', 'boeotian', 'scale', 'sarissa', 'macedonian_aspis', 'iron_boeotian', 'iron_cuirass', 'horse_pendant'],
  thrace: ['rhomphaia', 'falx', 'thracian', 'pelte', 'sica', 'phrygian', 'gilded_thracian', 'spolas', 'wolf_tooth'],
  crete: ['cretan_bow', 'kopis', 'linothorax', 'labrys', 'self_bow', 'iron_xiphos', 'painted_linothorax', 'knucklebones'],
  gaul: ['longsword', 'celtic_shield', 'mail', 'montefortino', 'chieftain_sword', 'gaesum', 'bossed_shield', 'horned_helm', 'torc'],
  phoenicia: ['balearic_sling', 'falcata', 'scarab', 'tanit_eye', 'soliferrum', 'caetra', 'punic_shield', 'bes_amulet', 'eye_bead'],
  scythia: ['scythian_bow', 'scythian_hood', 'boar_tusk', 'gorytos_bow', 'sagaris', 'akinakes', 'kontos', 'persian_tiara', 'felt_coat'],
};

/** What a harbour or a crossroads adds on top of its region (harbours: sea trade; crossroads: Italian and mercenary gear). */
export const POST_GOODS: Record<PostKind, string[]> = {
  harbour: ['rhodian_sling', 'saunion', 'tanit_eye', 'achaean_sling', 'staff_sling', 'makhaira', 'persian_bow', 'serpent_ring', 'faravahar'],
  crossroads: ['xyston', 'chalcidian', 'laurel', 'herakles_knot', 'pilum', 'gladius', 'hasta', 'legion_scutum', 'triple_disc', 'dolabra', 'bulla'],
};

/**
 * The sets a realm's trading posts carry (docs/ITEMS.md "Where items come
 * from"): every piece of its rare set at rare, and one UTC day in
 * SOURCES.postSetDays its epic slot is a piece of its epic set.
 */
export const REALM_SETS: Record<Region, { rare: string | null; epic: string }> = {
  attica: { rare: 'agoge', epic: 'sacred_band' },
  thessaly: { rare: 'agoge', epic: 'sacred_band' },
  thrace: { rare: 'peltast', epic: 'brennus' },
  crete: { rare: 'cretan', epic: 'immortals' },
  gaul: { rare: null, epic: 'brennus' },
  phoenicia: { rare: 'cretan', epic: 'immortals' },
  scythia: { rare: 'peltast', epic: 'immortals' },
};

/** Basic gear every merchant may carry (a few each day). */
export const BASE_GEAR = [
  'dory', 'xiphos', 'longche', 'javelins', 'sling', 'hoplon', 'thureos', 'pilos', 'cap', 'leather', 'linothorax', 'pelte',
  'club', 'axe', 'buckler', 'ash_dory', 'shepherd_sling', 'ankyle', 'hide_shield', 'felt_pilos', 'quilted',
];

/** Candidates of the daily rare slot: every finer piece of gear (set pieces come only from REALM_SETS). */
export const RARE_POOL = BASE_ITEMS.filter((d) => d.tier >= 2).map((d) => d.id);

export interface Offer {
  /** Stable within a day: `c:<consumable>` or `i:<item def>:<rarity>`. */
  id: string;
  kind: 'consumable' | 'item';
  ref: string;
  rarity: Rarity;
  slot: 'base' | 'region' | 'rare';
  /** List prices (before the holder discount). */
  gold: number;
  drachmae: number | null;
  /** Most one player may buy per UTC day, across all merchants. */
  dailyCap: number;
}

// ------------------------------------------------------------------ places

/** The trading posts of a map: every region of kind 'post' (a harbour on the coast, else a crossroads). */
export function tradingPosts(world: WorldGraph): { loc: number; kind: PostKind }[] {
  return world
    .all()
    .filter((r) => r.kind === 'post')
    .map((r) => ({ loc: r.id, kind: r.coast ? 'harbour' : 'crossroads' }));
}

export function tradingPostAt(world: WorldGraph, loc: number): PostKind | null {
  if (!world.has(loc)) return null;
  const r = world.info(loc);
  return r.kind === 'post' ? (r.coast ? 'harbour' : 'crossroads') : null;
}

/** The merchant of a region: every town (capitals included) and every trading post. */
export function merchantAt(world: WorldGraph, loc: number): MerchantKind | null {
  if (!world.has(loc)) return null;
  return world.info(loc).town ? 'town' : tradingPostAt(world, loc);
}

const realmCache = new Map<string, Region>();

/** The realm of a region: the one of its nearest capital by routes (ties: the lower capital id). */
export function regionOf(world: WorldGraph, loc: number): Region {
  const key = `${world.id}:${loc}`;
  const hit = realmCache.get(key);
  if (hit) return hit;
  const caps = world.capitals();
  let best = 0;
  let bd = Infinity;
  caps.forEach((c, i) => {
    const d = world.hops(c, loc);
    if (d < bd) (bd = d), (best = i);
  });
  const out = REGIONS[best % REGIONS.length];
  realmCache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ stock

/** Gold price of a piece of gear at a rarity. */
export function gearPrice(def: string, rarity: Rarity): number {
  return Math.round(ITEMS[def].value * MERCHANT.gearPrice[rarity]);
}

/** `count` distinct entries of `list`, picked by a seeded shuffle (stable for the same key). */
function pickSome<T>(list: readonly T[], count: number, key: string): T[] {
  const scored = list.map((x, i) => ({ x, s: hashString(`${key}:${i}`) }));
  scored.sort((a, b) => a.s - b.s);
  return scored.slice(0, count).map((e) => e.x);
}

function gearOffer(def: string, rarity: Rarity, slot: Offer['slot']): Offer {
  return { id: `i:${def}:${rarity}`, kind: 'item', ref: def, rarity, slot, gold: gearPrice(def, rarity), drachmae: null, dailyCap: MERCHANT.gearCap[slot] };
}

/**
 * Everything a merchant sells on a UTC day (`day` = YYYY-MM-DD). Towns: the
 * consumables, `baseGear` basic pieces, two regional specialties (uncommon)
 * and one rare. Trading posts: the same consumables and basic gear, every
 * regional specialty plus their harbour or crossroads goods and the realm's
 * rare set (rare), and an epic in the rotating slot, one day in
 * SOURCES.postSetDays a piece of the realm's epic set. The stock is the same
 * for every player (no per-player state), so it does not follow the army.
 */
export function merchantStock(world: WorldGraph, seed: number, loc: number, kind: MerchantKind, day: string): Offer[] {
  const key = `${seed}:${loc}:${day}`;
  const out: Offer[] = CONSUMABLE_IDS.map((id: ConsumableId) => {
    const c = CONSUMABLES[id];
    return { id: `c:${id}`, kind: 'consumable', ref: id, rarity: c.use === 'battle' ? 'rare' : 'uncommon', slot: 'base', gold: c.gold ?? 0, drachmae: c.drachmae, dailyCap: c.dailyCap };
  });
  for (const def of pickSome(BASE_GEAR, MERCHANT.baseGear, `${key}:base`)) out.push(gearOffer(def, 'common', 'base'));
  const realm = regionOf(world, loc);
  const region = SPECIALTIES[realm];
  const post = kind !== 'town';
  const sets = REALM_SETS[realm];
  const specials = post ? [...new Set([...region, ...POST_GOODS[kind], ...(sets.rare ? setPieces(sets.rare) : [])])] : pickSome(region, 2, `${key}:region`);
  for (const def of specials) out.push(gearOffer(def, post ? 'rare' : 'uncommon', 'region'));
  const setDay = post && hashString(`${key}:setday`) % SOURCES.postSetDays === 0;
  const rare = pickSome(
    setDay ? setPieces(sets.epic) : RARE_POOL.filter((d) => !specials.includes(d)),
    1,
    `${key}:rare`,
  )[0];
  if (rare) out.push(gearOffer(rare, post ? 'epic' : 'rare', 'rare'));
  return out;
}

/** The price a buyer pays (the holder and their clan get the discount). */
export function offerPrice(o: Pick<Offer, 'gold' | 'drachmae'>, currency: 'gold' | 'drachmae', discount: boolean): number | null {
  const list = currency === 'gold' ? o.gold : o.drachmae;
  if (list === null) return null;
  return discount ? Math.max(1, Math.round(list * (1 - MERCHANT.ownerDiscount))) : list;
}

/** Gold the merchant pays the region's holder for one sale (of the list gold price). */
export function holderCut(o: Pick<Offer, 'gold'>): number {
  return Math.floor(o.gold * MERCHANT.ownerCut);
}

/** The daily counter key of an offer: consumables by id, gear by def and rarity. */
export function capKey(o: Pick<Offer, 'kind' | 'ref' | 'rarity'>): string {
  return o.kind === 'consumable' ? o.ref : `${o.ref}:${o.rarity}`;
}

/** UTC day of a timestamp (daily stock and caps). */
export function merchantDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** When today's stock and caps reset (the next UTC midnight). */
export function nextReset(now: number): number {
  return Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000;
}
