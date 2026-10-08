/**
 * Telegram Stars products (currency XTR, integer amounts). Stars buy only
 * Drachmae packs (docs/DESIGN_V2.md "Monetization and economy"); everything
 * premium is priced in Drachmae in src/economy/catalog.ts.
 *
 * - `drachmae` packs credit `drachmae` to the player's wallet on
 *   successful_payment (idempotent per charge) and debit it again on refund.
 * - `entitlement`: only the legacy `supporter_banner` (5 Stars, kept so the
 *   existing shop screen and the payment flow test keep working). It is owned
 *   forever (until refunded) and doubles as a banner cosmetic.
 */
export interface Product {
  id: string;
  title: string; // 1-32 chars (Bot API limit)
  description: string; // 1-255 chars
  stars: number;
  kind: 'entitlement' | 'drachmae';
  /** Drachmae credited by a pack (kind 'drachmae'). */
  drachmae?: number;
  legacy?: boolean;
}

/** Drachmae packs: Stars price -> Drachmae (bigger packs carry a bonus). */
export const DRACHMAE_PACKS: { id: string; stars: number; drachmae: number }[] = [
  { id: 'drachmae_100', stars: 100, drachmae: 100 },
  { id: 'drachmae_275', stars: 250, drachmae: 275 },
  { id: 'drachmae_600', stars: 500, drachmae: 600 },
  { id: 'drachmae_1300', stars: 1000, drachmae: 1300 },
];

export const PRODUCTS: Record<string, Product> = {
  ...Object.fromEntries(
    DRACHMAE_PACKS.map((p): [string, Product] => {
      const bonus = Math.round((p.drachmae / p.stars - 1) * 100);
      return [
        p.id,
        {
          id: p.id,
          title: `${p.drachmae} Drachmae`,
          description: `${p.drachmae} Drachmae for cosmetics, the season pass, consumables and the marketplace.${bonus > 0 ? ` Includes a ${bonus}% bonus.` : ''}`,
          stars: p.stars,
          kind: 'drachmae',
          drachmae: p.drachmae,
        },
      ];
    }),
  ),
  supporter_banner: {
    id: 'supporter_banner',
    title: 'Supporter banner',
    description: 'A golden supporter banner for your army. Thank you for backing Pixelarrow!',
    stars: 5,
    kind: 'entitlement',
    legacy: true,
  },
};

export function getProduct(id: string): Product | undefined {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : undefined;
}

/**
 * Invoice payload (max 128 bytes): binds the purchase to a player and product.
 * Format: `v1:<productId>:<playerId>:<nonce>`.
 */
export function makePayload(productId: string, playerId: number, nonce: string): string {
  return `v1:${productId}:${playerId}:${nonce}`;
}

export function parsePayload(payload: string): { productId: string; playerId: number; nonce: string } | null {
  const m = /^v1:([a-z0-9_]{1,40}):(\d{1,15}):([A-Za-z0-9_-]{4,40})$/.exec(payload);
  if (!m) return null;
  return { productId: m[1], playerId: Number(m[2]), nonce: m[3] };
}
