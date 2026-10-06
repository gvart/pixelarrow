/**
 * Shop catalogue. Prices are in Telegram Stars (currency XTR, integer amounts).
 * `entitlement` products are bought once and owned forever (until refunded).
 */
export interface Product {
  id: string;
  title: string; // 1-32 chars (Bot API limit)
  description: string; // 1-255 chars
  stars: number;
  kind: 'entitlement';
}

export const PRODUCTS: Record<string, Product> = {
  supporter_banner: {
    id: 'supporter_banner',
    title: 'Supporter banner',
    description: 'A golden supporter banner for your army. Thank you for backing Pixelarrow!',
    stars: 5,
    kind: 'entitlement',
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
