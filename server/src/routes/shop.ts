import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import { randomNonce } from '../crypto';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db, requireSession, secret } from '../middleware';
import { getProduct, makePayload, PRODUCTS } from '../products';
import { callBot } from '../telegramApi';

const InvoiceBody = z.object({ productId: z.string().min(1).max(64) });

export const shop = new Hono<AppEnv>();

/** Public catalogue. */
shop.get('/products', (c) =>
  c.json({
    products: Object.values(PRODUCTS).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      stars: p.stars,
      kind: p.kind,
      ...(p.drachmae ? { drachmae: p.drachmae } : {}),
      ...(p.legacy ? { legacy: true } : {}),
    })),
  }),
);

/**
 * Creates a Telegram Stars invoice link for the caller. The client opens it with
 * Telegram.WebApp.openInvoice(link, cb); the purchase is granted when the bot
 * webhook receives `successful_payment`. Only the Mini App's own session (a
 * bearer token from Telegram initData) may ask: a web cookie session has no
 * payment sheet to open, so it is refused before any invoice exists (V6-073).
 */
shop.post('/invoice', requireSession, async (c) => {
  const s = c.get('session');
  if (s.transport !== 'bearer' || s.method !== 'telegram') throw new ApiError(403, 'payments_unavailable', 'Payments are only available in the Telegram app');
  const { productId } = await readJson(c, InvoiceBody, 1024);
  const product = getProduct(productId);
  if (!product) throw new ApiError(404, 'unknown_product', `No product "${productId}"`);
  const botToken = secret(c.env, 'TELEGRAM_BOT_TOKEN');
  const pid = s.pid;
  const owned = await db(c.env)
    .prepare('SELECT 1 FROM entitlements WHERE player_id = ?1 AND product_id = ?2 AND revoked_at IS NULL')
    .bind(pid, product.id)
    .first();
  if (owned && product.kind === 'entitlement') throw new ApiError(409, 'already_owned', 'You already own this item');

  const payload = makePayload(product.id, pid, randomNonce());
  const link = await callBot<string>(botToken, 'createInvoiceLink', {
    title: product.title,
    description: product.description,
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: product.title, amount: product.stars }],
  });
  return c.json({ link, productId: product.id, stars: product.stars });
});

export const entitlements = new Hono<AppEnv>();
entitlements.use('*', requireSession);

entitlements.get('/', async (c) => {
  const d = db(c.env);
  const pid = c.get('session').pid;
  const [ents, purchases] = await d.batch<Record<string, unknown>>([
    d.prepare('SELECT product_id, granted_at, revoked_at FROM entitlements WHERE player_id = ?1 ORDER BY granted_at').bind(pid),
    d
      .prepare('SELECT product_id, stars_amount, currency, created_at, refunded FROM purchases WHERE player_id = ?1 ORDER BY created_at DESC LIMIT 100')
      .bind(pid),
  ]);
  return c.json({
    entitlements: ents.results
      .filter((e) => e.revoked_at === null)
      .map((e) => ({ productId: e.product_id, grantedAt: e.granted_at })),
    purchases: purchases.results.map((p) => ({
      productId: p.product_id,
      stars: p.stars_amount,
      currency: p.currency,
      createdAt: p.created_at,
      refunded: p.refunded === 1,
    })),
  });
});
