/**
 * Pure logic of the economy screens (wallet, shop, season pass;
 * server/README.md "Economy"): pass tier states and progress, daily caps,
 * and how an API failure is shown.
 * The server stays the authority; these only decide what the UI says.
 * Also the campaign Smith's forge prices (EC-01) and gold with thousands separators.
 * Unit-tested in tests/economy.test.ts.
 */
import type { ApiError, PassReward, SeasonPassInfo } from '../platform/api';

// ------------------------------------------------------------------ season pass

export type Track = 'free' | 'premium';
type TierState = 'claimed' | 'claimable' | 'locked' | 'premium';

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
 * Where season pass XP comes from (the server's PASS.xp, server/src/economy/catalog.ts;
 * tests/economy.test.ts keeps the two equal): shown when the player taps the XP bar.
 */
export const PASS_XP = { attack: 10, attackWin: 15, capture: 25, duel: 10, duelWin: 10, perTier: 100 } as const;

// ------------------------------------------------------------------ the forge (EC-01, design/gdd/forge-reroll.md)

/** The Smith's prices live in gear.ts (no client API import there, so the server can typecheck it). */
export { FORGE, forgeCost } from './gear';

