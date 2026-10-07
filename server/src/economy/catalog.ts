/**
 * Data-driven economy catalogue: cosmetics and the season pass priced in
 * Drachmae, consumables (src/data/consumables.ts) in gold or Drachmae, and
 * the marketplace limits. Change prices here; nothing else hard-codes them.
 * Stars products (Drachmae packs) live in ../products.ts.
 */
import { LEGACY_RARITY, normalizeRarity, RARITIES } from '../../../src/data/items';
import { CONSUMABLE_IDS, CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';

export type CosmeticSlot = 'emblem' | 'banner' | 'cloak' | 'clan_flag' | 'army_skin' | 'table_theme';
export const COSMETIC_SLOTS: CosmeticSlot[] = ['emblem', 'banner', 'cloak', 'clan_flag', 'army_skin', 'table_theme'];

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  /** Price in Drachmae; null = not for sale (legacy Stars item or pass reward). */
  drachmae: number | null;
  /** Where else it comes from. */
  source?: 'legacy_stars' | 'season_pass';
}

const C = (id: string, slot: CosmeticSlot, name: string, drachmae: number | null, source?: Cosmetic['source']): Cosmetic => ({ id, slot, name, drachmae, ...(source ? { source } : {}) });

export const COSMETICS: Record<string, Cosmetic> = Object.fromEntries(
  [
    C('emblem_owl', 'emblem', 'Owl of Athena', 60),
    C('emblem_lambda', 'emblem', 'Lakedaimon lambda', 60),
    C('emblem_pegasus', 'emblem', 'Pegasus', 120),
    C('emblem_gorgon', 'emblem', 'Gorgoneion', 200),
    C('banner_crimson', 'banner', 'Crimson war banner', 80),
    C('banner_laurel', 'banner', 'Laurel banner', 150),
    C('supporter_banner', 'banner', 'Supporter banner', null, 'legacy_stars'),
    C('cloak_crimson', 'cloak', 'Spartan crimson cloak', 100),
    C('cloak_purple', 'cloak', 'Royal purple cloak', 200),
    C('flag_trireme', 'clan_flag', 'Trireme clan flag', 150),
    C('flag_lion', 'clan_flag', 'Lion of Amphipolis clan flag', 250),
    C('skin_bronze', 'army_skin', 'Polished bronze army', 300),
    C('skin_macedon', 'army_skin', 'Macedonian army', 300),
    C('table_marble', 'table_theme', 'Marble war table', 250),
    C('table_tent', 'table_theme', 'Campaign tent table', 200),
    C('emblem_pass_s', 'emblem', 'Season victor emblem', null, 'season_pass'),
    C('cloak_pass_s', 'cloak', 'Season victor cloak', null, 'season_pass'),
    C('banner_pass_s', 'banner', 'Season victor banner', null, 'season_pass'),
  ].map((c) => [c.id, c]),
);

export function getCosmetic(id: string): Cosmetic | undefined {
  return Object.prototype.hasOwnProperty.call(COSMETICS, id) ? COSMETICS[id] : undefined;
}

// ------------------------------------------------------------------ season pass

export type PassReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'drachmae'; amount: number }
  | { kind: 'consumable'; id: ConsumableId; qty: number }
  | { kind: 'cosmetic'; id: string };

export interface PassTier {
  tier: number;
  /** Total pass XP needed. */
  xp: number;
  free: PassReward;
  premium: PassReward;
}

export const PASS = {
  /** Drachmae price of the premium track (per season). */
  premiumDrachmae: 500,
  xpPerTier: 100,
  tiers: 30,
  /** Pass XP from verified server-side battle events. */
  xp: { attack: 10, attackWin: 15, capture: 25, duel: 10, duelWin: 10 },
} as const;

const BATTLE_ROTATION: ConsumableId[] = ['morale_wine', 'sharpening_stone', 'war_horn'];

export const PASS_TIERS: PassTier[] = Array.from({ length: PASS.tiers }, (_, i) => {
  const tier = i + 1;
  const free: PassReward = tier % 5 === 0 ? { kind: 'consumable', id: BATTLE_ROTATION[(tier / 5) % 3], qty: 1 } : { kind: 'gold', amount: 40 + tier * 5 };
  let premium: PassReward;
  if (tier === 10) premium = { kind: 'cosmetic', id: 'emblem_pass_s' };
  else if (tier === 20) premium = { kind: 'cosmetic', id: 'banner_pass_s' };
  else if (tier === 30) premium = { kind: 'cosmetic', id: 'cloak_pass_s' };
  else if (tier % 3 === 0) premium = { kind: 'drachmae', amount: 15 };
  else premium = { kind: 'consumable', id: tier % 2 ? 'healing_salve' : 'march_rations', qty: 1 };
  return { tier, xp: tier * PASS.xpPerTier, free, premium };
});

// ------------------------------------------------------------------ shop items

export type ShopItem =
  | { kind: 'cosmetic'; id: string; drachmae: number }
  | { kind: 'pass'; id: 'season_pass'; drachmae: number }
  | { kind: 'consumable'; id: ConsumableId; drachmae: number | null; gold: number | null; dailyCap: number };

export function shopItem(id: string): ShopItem | null {
  if (id === 'season_pass') return { kind: 'pass', id, drachmae: PASS.premiumDrachmae };
  const c = getCosmetic(id);
  if (c) return c.drachmae === null ? null : { kind: 'cosmetic', id, drachmae: c.drachmae };
  if ((CONSUMABLE_IDS as string[]).includes(id)) {
    const d = CONSUMABLES[id as ConsumableId];
    return { kind: 'consumable', id: d.id, drachmae: d.drachmae, gold: d.gold, dailyCap: d.dailyCap };
  }
  return null;
}

// ------------------------------------------------------------------ marketplace

export const MARKET = {
  /** Share of every sale removed from the economy (burned). */
  feeRate: 0.1,
  listingHours: 48,
  maxOpenListings: 20,
  /**
   * Total listing price bounds per rarity (five tiers, src/data/items.ts) and
   * currency. Legacy names (fine, heroic) map to their new tier; unknown
   * rarities use `default`.
   */
  priceBounds: {
    gold: { common: [2, 5_000], uncommon: [5, 10_000], rare: [20, 20_000], epic: [50, 50_000], legendary: [200, 100_000], default: [2, 100_000] },
    drachmae: { common: [2, 500], uncommon: [2, 1_000], rare: [5, 2_000], epic: [10, 5_000], legendary: [40, 10_000], default: [2, 10_000] },
  } as Record<'gold' | 'drachmae', Record<string, [number, number]>>,
  /** Resources that can be listed (gold is a currency, recruits are people). */
  resources: ['food', 'wood', 'bronze'] as const,
  maxResourceQty: 100_000,
  maxConsumableQty: 20,
} as const;

/** Fee burned on a sale: 10%, rounded up (prices start at 2, so the seller always gets something). */
export function marketFee(price: number): number {
  return Math.ceil(price * MARKET.feeRate);
}

export function priceBounds(currency: 'gold' | 'drachmae', rarity: string): [number, number] {
  const t = MARKET.priceBounds[currency];
  const known = (RARITIES as string[]).includes(rarity) || rarity in LEGACY_RARITY;
  return (known ? t[normalizeRarity(rarity)] : undefined) ?? t.default;
}

/** Public catalogue for GET /api/economy/catalog. */
export function catalogView() {
  return {
    cosmetics: Object.values(COSMETICS),
    slots: COSMETIC_SLOTS,
    consumables: CONSUMABLE_IDS.map((id) => CONSUMABLES[id]),
    pass: { premiumDrachmae: PASS.premiumDrachmae, xpPerTier: PASS.xpPerTier, xp: PASS.xp, tiers: PASS_TIERS },
    market: { feeRate: MARKET.feeRate, listingHours: MARKET.listingHours, maxOpenListings: MARKET.maxOpenListings, priceBounds: MARKET.priceBounds, resources: MARKET.resources },
  };
}
