import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRODUCTS } from '../src/products';
import { api, devLogin, mockTelegram, webhook } from './helpers';

afterEach(() => vi.restoreAllMocks());

const product = PRODUCTS.supporter_banner;

describe('telegram webhook', () => {
  it('rejects a missing or wrong secret token', async () => {
    const calls = mockTelegram();
    expect((await webhook({ update_id: 1 }, 'wrong')).status).toBe(401);
    expect((await webhook({ update_id: 1 }, '')).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('answers /start with a web_app button', async () => {
    const calls = mockTelegram();
    const res = await webhook({ update_id: 2, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555 }, text: '/start' } });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[0].params).toMatchObject({
      chat_id: 555,
      reply_markup: { inline_keyboard: [[{ web_app: { url: 'https://pixelarrow.app' } }]] },
    });
  });
});

describe('Stars purchase flow', () => {
  it('creates an invoice, validates pre-checkout, records the payment once and grants the entitlement', async () => {
    const tgId = 900001;
    const { token, playerId } = await devLogin(tgId);
    const calls = mockTelegram({ createInvoiceLink: 'https://t.me/$invoice-test' });

    // 1. Invoice
    const inv = await api('/api/shop/invoice', { method: 'POST', token, json: { productId: product.id } });
    expect(inv.status).toBe(200);
    expect(await inv.json()).toMatchObject({ link: 'https://t.me/$invoice-test', stars: product.stars });
    const created = calls.find((c) => c.method === 'createInvoiceLink')!;
    expect(created.params).toMatchObject({ currency: 'XTR', provider_token: '', prices: [{ amount: product.stars }] });
    const payload = created.params.payload as string;
    expect(payload).toMatch(new RegExp(`^v1:${product.id}:${playerId}:`));

    // 2. Pre-checkout: good, wrong price, wrong user
    const pcq = (id: string, from: number, amount = product.stars) =>
      webhook({ update_id: 10, pre_checkout_query: { id, from: { id: from }, currency: 'XTR', total_amount: amount, invoice_payload: payload } });
    await pcq('q-ok', tgId);
    await pcq('q-price', tgId, 1);
    await devLogin(900002);
    await pcq('q-user', 900002);
    const answers = calls.filter((c) => c.method === 'answerPreCheckoutQuery').map((c) => c.params);
    expect(answers[0]).toEqual({ pre_checkout_query_id: 'q-ok', ok: true });
    expect(answers[1]).toMatchObject({ pre_checkout_query_id: 'q-price', ok: false });
    expect(answers[2]).toMatchObject({ pre_checkout_query_id: 'q-user', ok: false });

    // 3. successful_payment, delivered twice (webhook retry)
    const paid = {
      update_id: 11,
      message: {
        message_id: 2,
        chat: { id: tgId, type: 'private' },
        from: { id: tgId },
        successful_payment: { currency: 'XTR', total_amount: product.stars, invoice_payload: payload, telegram_payment_charge_id: 'charge-abc' },
      },
    };
    expect((await webhook(paid)).status).toBe(200);
    expect((await webhook(paid)).status).toBe(200);
    const n = await env.DB!.prepare('SELECT COUNT(*) AS n FROM purchases WHERE telegram_payment_charge_id = ?').bind('charge-abc').first<{ n: number }>();
    expect(n?.n).toBe(1);

    const ents = await (await api('/api/entitlements', { token })).json<{ entitlements: { productId: string }[]; purchases: { stars: number }[] }>();
    expect(ents.entitlements.map((e) => e.productId)).toEqual([product.id]);
    expect(ents.purchases).toHaveLength(1);
    expect(ents.purchases[0].stars).toBe(product.stars);

    // Owning it blocks a second invoice and a second checkout.
    expect((await api('/api/shop/invoice', { method: 'POST', token, json: { productId: product.id } })).status).toBe(409);
    await pcq('q-again', tgId);
    expect(calls.filter((c) => c.method === 'answerPreCheckoutQuery').at(-1)!.params).toMatchObject({ ok: false });

    // 4. Refund revokes.
    await webhook({
      update_id: 12,
      message: {
        message_id: 3,
        chat: { id: tgId, type: 'private' },
        from: { id: tgId },
        refunded_payment: { currency: 'XTR', total_amount: product.stars, invoice_payload: payload, telegram_payment_charge_id: 'charge-abc' },
      },
    });
    const after = await (await api('/api/entitlements', { token })).json<{ entitlements: unknown[]; purchases: { refunded: boolean }[] }>();
    expect(after.entitlements).toHaveLength(0);
    expect(after.purchases[0].refunded).toBe(true);
  });

  it('rejects unknown products and unauthenticated invoice requests', async () => {
    mockTelegram();
    const { token } = await devLogin(900003);
    expect((await api('/api/shop/invoice', { method: 'POST', token, json: { productId: 'nope' } })).status).toBe(404);
    expect((await api('/api/shop/invoice', { method: 'POST', json: { productId: product.id } })).status).toBe(401);
  });
});
