/**
 * Stars invoices only for the Telegram Mini App's session (V6-073, PAY-01):
 * a web cookie session is refused before any invoice exists, whatever the
 * client shows. Defence in depth behind the client's payments.status().
 */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/auth/sessions';
import { PRODUCTS } from '../src/products';
import { api, devLogin, mockTelegram } from './helpers';

afterEach(() => vi.restoreAllMocks());

const pack = Object.values(PRODUCTS).find((p) => p.kind === 'drachmae')!;
const invoice = (auth: { token?: string; cookie?: string }) => api('/api/shop/invoice', { method: 'POST', ...auth, json: { productId: pack.id } });

describe('Stars invoices need the Telegram app', () => {
  it('creates one for a Telegram bearer session', async () => {
    const calls = mockTelegram({ createInvoiceLink: 'https://t.me/$invoice-web' });
    const { token } = await devLogin(910001);
    expect((await invoice({ token })).status).toBe(200);
    expect(calls.filter((c) => c.method === 'createInvoiceLink')).toHaveLength(1);
  });

  for (const method of ['password', 'email_link', 'telegram'] as const) {
    it(`refuses a web cookie session (${method}) before creating an invoice`, async () => {
      const calls = mockTelegram({ createInvoiceLink: 'https://t.me/$invoice-web' });
      const { playerId } = await devLogin(910010 + method.length);
      const { token } = await createSession(env.DB!, playerId, 'cookie', method, 'Chrome on macOS');
      const res = await invoice({ cookie: token });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'payments_unavailable' } });
      expect(calls.filter((c) => c.method === 'createInvoiceLink')).toHaveLength(0);
    });
  }
});
