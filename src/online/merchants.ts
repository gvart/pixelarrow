/**
 * Map merchants (docs/DUELS.md "War-map shops on the map"): pure, shared by
 * the client (demo shard, price display) and the Worker (the authority).
 *
 * - Every town hex (capitals included) has a merchant. A few seeded trading
 *   posts per shard (harbours on the coast, crossroads on river plains) carry
 *   rarer stock. Their places are a pure function of the shard seed.
 * - Stock is generated from (shard seed, hex, UTC day) and never stored: the
 *   consumables and some basic gear everywhere, the specialties of the hex's
 *   region (the nearest capital), and a daily rotating rare slot.
 * - Prices are in season gold; consumables also in Drachmae (the shortcut of
 *   DESIGN_V2.md). Gear is never sold for Drachmae (no paid power).
 * - The hex's holder and their clan pay 10% less; the holder earns 5% of the
 *   list gold price of every sale to someone else, paid by the merchant.
 */
import { hash3 } from '../world/noise';
import { hashString } from '../sim/rng';
import { CONSUMABLE_IDS, CONSUMABLES, type ConsumableId } from '../data/consumables';
import { ITEMS, type Rarity } from '../data/items';
import { capitals, hexDistance, hexInfo, hexesWithin, neighbours, SHARD_RADIUS, type Axial, type HexInfo } from './hex';
import { beastHex } from './lairs';

export const MERCHANT = {
  /** Holder (and clan) discount on gold and Drachmae prices. */
  ownerDiscount: 0.1,
  /** Share of the list gold price the merchant pays the hex's holder per sale. */
  ownerCut: 0.05,
  /** One trading post per this many hexes of the shard (~12 on a full shard). */
  hexesPerPost: 300,
  /** Trading posts keep at least this far apart. */
  postSpacing: 7,
  /** ...and this far from the capitals (homes keep 5 away too). */
  postCapitalGap: 5,
  /** Gold price of gear: item value x this, by rarity. */
  gearPrice: { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 } as Record<Rarity, number>,
  /** Daily caps per player (all merchants together) for gear, by slot. */
  gearCap: { base: 2, region: 1, rare: 1 },
  /** How many basic gear offers a merchant has each day. */
  baseGear: 3,
} as const;

export type PostKind = 'harbour' | 'crossroads';
export type MerchantKind = 'town' | PostKind;

/** Seven regions, one per capital (in `capitals()` order): what their merchants are known for. */
export type Region = 'attica' | 'thessaly' | 'thrace' | 'crete' | 'gaul' | 'phoenicia' | 'scythia';
export const REGIONS: Region[] = ['attica', 'thessaly', 'thrace', 'crete', 'gaul', 'phoenicia', 'scythia'];

/** Regional specialties (item def ids, src/data/items.ts). */
export const SPECIALTIES: Record<Region, string[]> = {
  attica: ['aspis', 'corinthian', 'cuirass', 'owl_amulet'],
  thessaly: ['xyston', 'boeotian', 'scale'],
  thrace: ['rhomphaia', 'falx', 'thracian', 'pelte'],
  crete: ['cretan_bow', 'kopis', 'linothorax'],
  gaul: ['longsword', 'celtic_shield', 'mail', 'montefortino'],
  phoenicia: ['balearic_sling', 'falcata', 'scarab', 'tanit_eye'],
  scythia: ['scythian_bow', 'scythian_hood', 'boar_tusk'],
};

/** What a harbour or a crossroads adds on top of its region. */
export const POST_GOODS: Record<PostKind, string[]> = {
  harbour: ['rhodian_sling', 'saunion', 'tanit_eye'],
  crossroads: ['xyston', 'chalcidian', 'laurel', 'herakles_knot'],
};

/** Basic gear every merchant may carry (a few each day). */
export const BASE_GEAR = ['dory', 'xiphos', 'longche', 'javelins', 'sling', 'hoplon', 'thureos', 'pilos', 'cap', 'leather', 'linothorax', 'pelte'];

/** Candidates of the daily rare slot: every finer piece of gear. */
export const RARE_POOL = Object.values(ITEMS)
  .filter((d) => d.tier >= 2)
  .map((d) => d.id);

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

const postCache = new Map<string, Map<string, PostKind>>();

/**
 * The trading posts of a shard: about one per MERCHANT.hexesPerPost hexes,
 * half harbours (passable coast) and half crossroads (plains or farmland on a
 * river with land all around), never on towns, forts, capitals, lairs, world
 * bosses or near the capitals (so never on a home either), spread apart.
 */
export function tradingPosts(seed: number, radius = SHARD_RADIUS): { q: number; r: number; kind: PostKind }[] {
  return [...postMap(seed, radius)].map(([k, kind]) => {
    const [q, r] = k.split('_').map(Number);
    return { q, r, kind };
  });
}

function postMap(seed: number, radius: number): Map<string, PostKind> {
  const key = `${seed}:${radius}`;
  const hit = postCache.get(key);
  if (hit) return hit;
  const caps = capitals(radius);
  const all = hexesWithin({ q: 0, r: 0 }, radius, radius).map((h) => hexInfo(seed, h.q, h.r, radius));
  const byId = new Map(all.map((h) => [h.id, h]));
  const towns = all.filter((h) => h.type === 'town');
  const ok = (h: HexInfo) =>
    h.passable &&
    h.type !== 'town' &&
    !h.fort &&
    !h.capital &&
    hexDistance(h, { q: 0, r: 0 }) <= radius - 2 &&
    !caps.some((c) => hexDistance(c, h) < MERCHANT.postCapitalGap) &&
    !towns.some((t) => hexDistance(t, h) <= 1) &&
    !beastHex(seed, h, radius);
  const score = (h: HexInfo) => hash3(h.q, h.r, seed + 41);
  const harbours = all.filter((h) => h.coast && ok(h)).sort((a, b) => score(a) - score(b));
  const crossroads = all
    .filter((h) => !h.coast && (h.type === 'plains' || h.type === 'farmland') && h.site.river && neighbours(h, radius).every((n) => byId.get(`${n.q}_${n.r}`)?.passable) && ok(h))
    .sort((a, b) => score(a) - score(b));
  const n = Math.max(1, Math.round(all.length / MERCHANT.hexesPerPost));
  const picked: { h: HexInfo; kind: PostKind }[] = [];
  const free = (h: HexInfo) => picked.every((p) => hexDistance(p.h, h) >= MERCHANT.postSpacing);
  const take = (list: HexInfo[], kind: PostKind, want: number) => {
    let got = 0;
    for (const h of list) {
      if (got >= want || picked.length >= n) break;
      if (!free(h)) continue;
      picked.push({ h, kind });
      got++;
    }
  };
  take(harbours, 'harbour', Math.ceil(n / 2));
  take(crossroads, 'crossroads', n - picked.length);
  // Too few of one kind (an inland or an island shard): fill up with the other.
  take(harbours, 'harbour', n);
  const out = new Map(picked.map((p) => [p.h.id, p.kind] as [string, PostKind]));
  postCache.set(key, out);
  return out;
}

export function tradingPostAt(seed: number, h: Axial, radius = SHARD_RADIUS): PostKind | null {
  return postMap(seed, radius).get(`${h.q}_${h.r}`) ?? null;
}

/** The merchant of a hex: every town (capitals included) and every trading post. */
export function merchantAt(seed: number, h: Pick<HexInfo, 'q' | 'r' | 'type' | 'capital'>, radius = SHARD_RADIUS): MerchantKind | null {
  if (h.type === 'town' || h.capital) return 'town';
  return tradingPostAt(seed, h, radius);
}

/** The region of a hex: the one of its nearest capital (ties: the first in order). */
export function regionOf(h: Axial, radius = SHARD_RADIUS): Region {
  const caps = capitals(radius);
  let best = 0;
  for (let i = 1; i < caps.length; i++) if (hexDistance(caps[i], h) < hexDistance(caps[best], h)) best = i;
  return REGIONS[best];
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
 * regional specialty plus their harbour or crossroads goods (rare) and an
 * epic in the rotating slot.
 */
export function merchantStock(seed: number, h: Axial, kind: MerchantKind, day: string, radius = SHARD_RADIUS): Offer[] {
  const key = `${seed}:${h.q}_${h.r}:${day}`;
  const out: Offer[] = CONSUMABLE_IDS.map((id: ConsumableId) => {
    const c = CONSUMABLES[id];
    return { id: `c:${id}`, kind: 'consumable', ref: id, rarity: c.use === 'battle' ? 'rare' : 'uncommon', slot: 'base', gold: c.gold ?? 0, drachmae: c.drachmae, dailyCap: c.dailyCap };
  });
  for (const def of pickSome(BASE_GEAR, MERCHANT.baseGear, `${key}:base`)) out.push(gearOffer(def, 'common', 'base'));
  const region = SPECIALTIES[regionOf(h, radius)];
  const post = kind !== 'town';
  const specials = post ? [...new Set([...region, ...POST_GOODS[kind]])] : pickSome(region, 2, `${key}:region`);
  for (const def of specials) out.push(gearOffer(def, post ? 'rare' : 'uncommon', 'region'));
  const rare = pickSome(
    RARE_POOL.filter((d) => !specials.includes(d)),
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

/** Gold the merchant pays the hex's holder for one sale (of the list gold price). */
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
