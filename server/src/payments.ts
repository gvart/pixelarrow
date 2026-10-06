/** Telegram Stars purchase bookkeeping (D1). */
import { getPlayerByTelegramId, upsertPlayer } from './players';
import { getProduct, parsePayload } from './products';
import type { TelegramUser } from './telegramAuth';

export interface PreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

export interface RefundedPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

/** Returns null when the checkout may proceed, else a user-facing error message. */
export async function checkPreCheckout(db: D1Database, q: PreCheckoutQuery): Promise<string | null> {
  const p = parsePayload(q.invoice_payload);
  if (!p) return 'Unknown order.';
  const product = getProduct(p.productId);
  if (!product) return 'This item is no longer for sale.';
  if (q.currency !== 'XTR' || q.total_amount !== product.stars) return 'The price has changed, please reopen the shop.';
  const player = await getPlayerByTelegramId(db, q.from.id);
  if (!player || player.id !== p.playerId) return 'This invoice belongs to another player.';
  const owned = await db
    .prepare('SELECT 1 FROM entitlements WHERE player_id = ?1 AND product_id = ?2 AND revoked_at IS NULL')
    .bind(player.id, product.id)
    .first();
  if (owned && product.kind === 'entitlement') return 'You already own this item.';
  return null;
}

/**
 * Records a successful payment exactly once (keyed by telegram_payment_charge_id)
 * and grants the entitlement. Safe to call again for the same charge (webhook retries).
 * Returns false when the charge had already been recorded.
 */
export async function recordPayment(db: D1Database, from: TelegramUser, pay: SuccessfulPayment, now = Date.now()): Promise<boolean> {
  const parsed = parsePayload(pay.invoice_payload);
  const productId = parsed?.productId ?? 'unknown';
  const player = (await getPlayerByTelegramId(db, from.id)) ?? (await upsertPlayer(db, from, now));

  const ins = await db
    .prepare(
      `INSERT INTO purchases (telegram_payment_charge_id, player_id, product_id, currency, stars_amount, payload, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (telegram_payment_charge_id) DO NOTHING`,
    )
    .bind(pay.telegram_payment_charge_id, player.id, productId, pay.currency, pay.total_amount, pay.invoice_payload, now)
    .run();
  const fresh = ins.meta.changes === 1;

  // Grant (or re-grant after an earlier refund) — idempotent.
  if (getProduct(productId)) {
    await db
      .prepare(
        `INSERT INTO entitlements (player_id, product_id, purchase_id, granted_at)
         SELECT ?1, ?2, id, ?3 FROM purchases WHERE telegram_payment_charge_id = ?4 AND refunded = 0
         ON CONFLICT (player_id, product_id) DO UPDATE SET
           purchase_id = excluded.purchase_id, granted_at = excluded.granted_at, revoked_at = NULL
         WHERE entitlements.revoked_at IS NOT NULL`,
      )
      .bind(player.id, productId, now, pay.telegram_payment_charge_id)
      .run();
  }
  return fresh;
}

/** Marks a purchase refunded and revokes what it granted. Idempotent. */
export async function recordRefund(db: D1Database, refund: RefundedPayment, now = Date.now()): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE purchases SET refunded = 1, refunded_at = ?2 WHERE telegram_payment_charge_id = ?1 AND refunded = 0')
      .bind(refund.telegram_payment_charge_id, now),
    db
      .prepare(
        `UPDATE entitlements SET revoked_at = ?2
         WHERE revoked_at IS NULL AND purchase_id = (SELECT id FROM purchases WHERE telegram_payment_charge_id = ?1)`,
      )
      .bind(refund.telegram_payment_charge_id, now),
  ]);
}
