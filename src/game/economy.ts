/**
 * Pure logic of the economy screens (wallet, shop, season pass, marketplace;
 * server/README.md "Economy"): pass tier states and progress, the market fee
 * the seller sees, daily caps, price bounds, and how an API failure is shown.
 * The server stays the authority; these only decide what the UI says.
 * Unit-tested in tests/economy.test.ts.
 */
import type { ApiError, EconomyCatalog, MarketListing, PassReward, SeasonPassInfo } from '../platform/api';
import { normalizeRarity, RARITIES } from '../data/items';

// ------------------------------------------------------------------ season pass

export type Track = 'free' | 'premium';
export type TierState = 'claimed' | 'claimable' | 'locked' | 'premium';

/** State of one reward: claimed, claimable now, not reached yet, or reached but the premium track is not unlocked. */
export function tierState(p: Pick<SeasonPassInfo, 'tier' | 'premium' | 'claimed'>, tier: number, track: Track): TierState {
  if (p.claimed.some((c) => c.tier === tier && c.track === track)) return 'claimed';
  if (tier > p.tier) return 'locked';
  if (track === 'premium' && !p.premium) return 'premium';
  return 'claimable';
}

/** Rewards that can be claimed right now (both tracks). */
export function claimableCount(p: Pick<SeasonPassInfo, 'tier' | 'premium' | 'claimed' | 'tiers'>): number {
  let n = 0;
  for (const t of p.tiers) for (const tr of ['free', 'premium'] as Track[]) if (tierState(p, t.tier, tr) === 'claimable') n++;
  return n;
}

/** XP progress inside the current tier (0..1) and what is left to the next one. */
export function passProgress(p: Pick<SeasonPassInfo, 'xp' | 'tier' | 'xpPerTier' | 'tiers'>): { tier: number; into: number; need: number; frac: number; maxed: boolean } {
  const maxTier = p.tiers.length;
  const maxed = p.tier >= maxTier;
  const per = Math.max(1, p.xpPerTier);
  const into = maxed ? per : Math.max(0, p.xp - p.tier * per);
  return { tier: p.tier, into: Math.min(per, into), need: per, frac: Math.min(1, into / per), maxed };
}

/** The tier the pass list should open at: the first claimable one, else the next to reach. */
export function focusTier(p: Pick<SeasonPassInfo, 'tier' | 'premium' | 'claimed' | 'tiers'>): number {
  for (const t of p.tiers) if (tierState(p, t.tier, 'free') === 'claimable' || tierState(p, t.tier, 'premium') === 'claimable') return t.tier;
  return Math.min(p.tiers.length, p.tier + 1);
}

/** Apply a successful claim locally (the screen redraws without waiting for a refetch). */
export function withClaim<T extends Pick<SeasonPassInfo, 'claimed'>>(p: T, tier: number, track: Track): T {
  if (p.claimed.some((c) => c.tier === tier && c.track === track)) return p;
  return { ...p, claimed: [...p.claimed, { tier, track }] };
}

/** Short reward text parts: an icon subject id and an amount. */
export function rewardIcon(r: PassReward): { kind: 'resource' | 'consumable' | 'cosmetic'; id: string; qty: number } {
  if (r.kind === 'gold') return { kind: 'resource', id: 'gold', qty: r.amount };
  if (r.kind === 'drachmae') return { kind: 'resource', id: 'drachmae', qty: r.amount };
  if (r.kind === 'consumable') return { kind: 'consumable', id: r.id, qty: r.qty };
  return { kind: 'cosmetic', id: r.id, qty: 1 };
}

// ------------------------------------------------------------------ marketplace

export const DEFAULT_FEE_RATE = 0.1;

/** The fee burned on a sale: 10% rounded up (the server's rule, server/src/economy/catalog.ts). */
export function marketFee(price: number, rate = DEFAULT_FEE_RATE): number {
  return Math.ceil(Math.max(0, price) * rate);
}

/** What the seller receives for a listing priced `price`. */
export function sellerGets(price: number, rate = DEFAULT_FEE_RATE): number {
  return Math.max(0, price - marketFee(price, rate));
}

/** Total price bounds for a listing (legacy and unknown rarities like the server). */
export function priceBounds(cat: Pick<EconomyCatalog, 'market'> | null, currency: 'gold' | 'drachmae', rarity: string): [number, number] {
  const t = cat?.market.priceBounds[currency];
  const fallback: [number, number] = currency === 'gold' ? [2, 100_000] : [2, 10_000];
  if (!t) return fallback;
  const known = (RARITIES as string[]).includes(rarity) || rarity === 'fine' || rarity === 'heroic';
  return (known ? t[normalizeRarity(rarity)] : undefined) ?? t.default ?? fallback;
}

export function clampPrice(price: number, bounds: [number, number]): number {
  return Math.max(bounds[0], Math.min(bounds[1], Math.round(price)));
}

/** A price stepper: bigger steps for bigger prices (1, 5, 10, 50, 100...). */
export function priceStep(price: number): number {
  if (price < 20) return 1;
  if (price < 100) return 5;
  if (price < 500) return 10;
  if (price < 2000) return 50;
  return 100;
}

/** A reasonable first asking price for an item or good worth `value` gold. */
export function suggestPrice(value: number, currency: 'gold' | 'drachmae', bounds: [number, number]): number {
  const v = currency === 'gold' ? value : Math.max(1, Math.round(value / 8));
  return clampPrice(v, bounds);
}

/** Time left on a listing, e.g. "2h 15m", "45m", "expired". */
export function timeLeft(expiresAt: number, now: number): { ms: number; text: string } {
  const ms = expiresAt - now;
  if (ms <= 0) return { ms: 0, text: '' };
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return { ms, text: `${m}m` };
  const h = Math.floor(m / 60);
  if (h < 24) return { ms, text: `${h}h ${m % 60}m` };
  return { ms, text: `${Math.floor(h / 24)}d ${h % 24}h` };
}

export type ListingAction = 'buy' | 'cancel' | 'none';

/** What the listing card offers: buy someone else's open listing, cancel your own open one. */
export function listingAction(l: Pick<MarketListing, 'status' | 'mine' | 'expiresAt'>, now: number): ListingAction {
  if (l.status !== 'open' || l.expiresAt <= now) return 'none';
  return l.mine ? 'cancel' : 'buy';
}

/** Can the player pay for it? (gold of the season profile, Drachmae of the wallet). */
export function canAfford(l: Pick<MarketListing, 'currency' | 'price'>, purse: { gold: number | null; drachmae: number | null }): boolean {
  const have = l.currency === 'gold' ? purse.gold : purse.drachmae;
  return have !== null && have >= l.price;
}

// ------------------------------------------------------------------ shop

/** Purchases left today for a consumable (null: unknown, e.g. no season profile yet). */
export function capLeft(caps: Record<string, { cap: number; bought: number }> | null | undefined, id: string, fallbackCap?: number): number | null {
  const c = caps?.[id];
  if (c) return Math.max(0, c.cap - c.bought);
  return fallbackCap ?? null;
}

// ------------------------------------------------------------------ availability

export type EconState = 'outside' | 'offline' | 'closed' | 'error';

/** How the screens present a failed call: outside Telegram, unreachable, not configured (503), or a real error. */
export function econState(e: unknown, available = true): EconState {
  if (!available) return 'outside';
  const a = e as Partial<ApiError> | null;
  if (a && typeof a.status === 'number') {
    if (a.status === 503) return 'closed';
    if (a.status === 0 || a.status === 404 || a.status === 405 || a.status >= 500) return 'offline';
    return 'error';
  }
  return 'error';
}

/**
 * The wallet's red warning: only a balance below zero (a refunded pack that
 * was already spent). `WalletInfo.canSpend` is also false at exactly 0, which
 * is normal and needs no warning (the old screen showed it at 0).
 */
export function walletOverdrawn(w: { drachmae: number }): boolean {
  return w.drachmae < 0;
}

/**
 * Which gold a season-pass reward pays: always the online war's gold (the
 * server credits online_profiles), never the offline campaign's, so the
 * reward and the shop say "War gold", not plain "gold" next to the
 * campaign's purse.
 */
export function passGoldKey(): 'res.gold.war' {
  return 'res.gold.war';
}

