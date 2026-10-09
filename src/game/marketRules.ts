/**
 * Marketplace rules shared by the client (src/game/economy.ts) and the server
 * (server/src/economy/catalog.ts, which stays the authority and passes its own
 * MARKET table and fee rate). Kept free of client-only imports so the Worker
 * can import it.
 */
import { LEGACY_RARITY, normalizeRarity, RARITIES } from '../data/items';

export const DEFAULT_FEE_RATE = 0.1;

/** The fee burned on a sale: 10% rounded up (prices start at 2, so the seller always gets something). */
export function marketFee(price: number, rate = DEFAULT_FEE_RATE): number {
  return Math.ceil(Math.max(0, price) * rate);
}

/**
 * Bounds for `rarity` from one currency's table: current and legacy rarities
 * (fine, heroic) map to their tier, unknown ones use `default`.
 */
export function rarityBounds(t: Readonly<Record<string, [number, number]>>, rarity: string): [number, number] | undefined {
  const known = (RARITIES as string[]).includes(rarity) || rarity in LEGACY_RARITY;
  return (known ? t[normalizeRarity(rarity)] : undefined) ?? t.default;
}
