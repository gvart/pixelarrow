import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASS, PASS_TIERS } from '../src/economy/catalog';
import { PRODUCTS } from '../src/products';
import { currentSeason } from '../src/online/store';
import { api, devLogin, mockTelegram, webhook } from './helpers';
import { DB, fresh, getJson, giveDrachmae, join, post } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

let rid = 0;
const reqId = () => `req-${Date.now().toString(36)}-${rid++}`;

interface Wallet {
  drachmae: number;
  canSpend: boolean;
  cosmetics: string[];
  loadout: Record<string, string>;
  ledger: { delta: number; kind: string }[];
}

async function wallet(token: string): Promise<Wallet> {
  return (await getJson<Wallet>('/api/economy/wallet', token)).body;
}

/** Buys a Drachmae pack through the real invoice -> pre-checkout -> successful_payment flow. */
async function buyPack(tgId: number, token: string, productId: string, charge: string) {
  const calls = mockTelegram({ createInvoiceLink: 'https://t.me/$inv' });
  const inv = await api('/api/shop/invoice', { method: 'POST', token, json: { productId } });
  expect(inv.status).toBe(200);
  const payload = calls.find((c) => c.method === 'createInvoiceLink')!.params.payload as string;
  const p = PRODUCTS[productId];
  await webhook({ update_id: 1, pre_checkout_query: { id: `q-${charge}`, from: { id: tgId }, currency: 'XTR', total_amount: p.stars, invoice_payload: payload } });
  expect(calls.find((c) => c.method === 'answerPreCheckoutQuery')!.params).toMatchObject({ ok: true });
  const paid = {
    update_id: 2,
    message: { message_id: 1, chat: { id: tgId, type: 'private' }, from: { id: tgId }, successful_payment: { currency: 'XTR', total_amount: p.stars, invoice_payload: payload, telegram_payment_charge_id: charge } },
  };
  return { payload, paid, calls };
}

describe('Drachmae packs (Stars)', () => {
  it('lists the packs; credits once per charge; a refund debits it again (balance may go negative and blocks spending)', async () => {
    const tgId = 950001;
    const { token, playerId } = await devLogin(tgId);
    const cat = await (await api('/api/economy/catalog')).json<{ packs: { id: string; stars: number; drachmae: number }[] }>();
    expect(cat.packs.map((p) => [p.stars, p.drachmae])).toEqual([
      [100, 100],
      [250, 275],
      [500, 600],
      [1000, 1300],
    ]);
    const products = await (await api('/api/shop/products')).json<{ products: { id: string; kind: string; drachmae?: number }[] }>();
    expect(products.products.find((p) => p.id === 'drachmae_275')).toMatchObject({ kind: 'drachmae', drachmae: 275 });

    const { paid, payload } = await buyPack(tgId, token, 'drachmae_100', 'charge-pack-1');
    expect((await webhook(paid)).status).toBe(200);
    expect((await webhook(paid)).status).toBe(200); // Telegram retry
    expect((await wallet(token)).drachmae).toBe(100);
    // A second pack of the same kind can be bought (packs are not "owned").
    expect((await api('/api/shop/invoice', { method: 'POST', token, json: { productId: 'drachmae_100' } })).status).toBe(200);

    // Spend 60 on a cosmetic, then the pack gets refunded: 100 back out -> -60.
    const buy = await post<{ drachmae: number }>('/api/economy/buy', token, { requestId: reqId(), item: 'emblem_owl' });
    expect(buy.status).toBe(200);
    expect(buy.body.drachmae).toBe(40);
    const refund = {
      update_id: 3,
      message: { message_id: 2, chat: { id: tgId, type: 'private' }, from: { id: tgId }, refunded_payment: { currency: 'XTR', total_amount: 100, invoice_payload: payload, telegram_payment_charge_id: 'charge-pack-1' } },
    };
    await webhook(refund);
    await webhook(refund);
    const w = await wallet(token);
    expect(w.drachmae).toBe(-60);
    expect(w.canSpend).toBe(false);
    expect(w.cosmetics).toContain('emblem_owl'); // what was bought stays
    const blocked = await post<{ error: { code: string } }>('/api/economy/buy', token, { requestId: reqId(), item: 'emblem_lambda' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('insufficient_funds');
    const ledger = await DB().prepare('SELECT kind, delta FROM drachmae_ledger WHERE player_id = ?1 ORDER BY id').bind(playerId).all<{ kind: string; delta: number }>();
    expect(ledger.results).toEqual([
      { kind: 'pack', delta: 100 },
      { kind: 'spend', delta: -60 },
      { kind: 'refund', delta: -100 },
    ]);
  });

  it('a payment retried after its refund credits nothing', async () => {
    const tgId = 950002;
    const { token } = await devLogin(tgId);
    const { paid, payload } = await buyPack(tgId, token, 'drachmae_275', 'charge-pack-2');
    // Out of order: the purchase row exists, is refunded, then the retry of successful_payment arrives.
    await webhook(paid);
    await webhook({ update_id: 9, message: { message_id: 3, chat: { id: tgId, type: 'private' }, from: { id: tgId }, refunded_payment: { currency: 'XTR', total_amount: 250, invoice_payload: payload, telegram_payment_charge_id: 'charge-pack-2' } } });
    await webhook(paid);
    expect((await wallet(token)).drachmae).toBe(0);
  });
});

describe('shop: cosmetics and the season pass with Drachmae', () => {
  it('buys a cosmetic once per request id, refuses a second copy, equips it', async () => {
    const { token, playerId } = await devLogin(950101);
    await giveDrachmae(playerId, 300);
    const id = reqId();
    const a = await post<{ replayed: boolean; drachmae: number; order: { price: number } }>('/api/economy/buy', token, { requestId: id, item: 'cloak_crimson' });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ replayed: false, drachmae: 200, order: { price: 100 } });
    // Same request again (a network retry): not charged twice.
    const b = await post<{ replayed: boolean; drachmae: number }>('/api/economy/buy', token, { requestId: id, item: 'cloak_crimson' });
    expect(b.body).toMatchObject({ replayed: true, drachmae: 200 });
    // Same id for something else: refused.
    expect((await post('/api/economy/buy', token, { requestId: id, item: 'emblem_owl' })).status).toBe(409);
    // A fresh request for the same cosmetic: already owned.
    const c = await post<{ error: { code: string } }>('/api/economy/buy', token, { requestId: reqId(), item: 'cloak_crimson' });
    expect(c.body.error.code).toBe('already_owned');
    // Not for sale / not for gold / insufficient funds.
    expect((await post('/api/economy/buy', token, { requestId: reqId(), item: 'emblem_pass_s' })).status).toBe(404);
    expect((await post('/api/economy/buy', token, { requestId: reqId(), item: 'emblem_owl', currency: 'gold' })).status).toBe(400);
    const poor = await post<{ error: { code: string } }>('/api/economy/buy', token, { requestId: reqId(), item: 'skin_bronze' });
    expect(poor.body.error.code).toBe('insufficient_funds');
    expect((await wallet(token)).drachmae).toBe(200);

    expect((await post('/api/economy/cosmetics/equip', token, { slot: 'banner', id: 'cloak_crimson' })).status).toBe(400);
    expect((await post('/api/economy/cosmetics/equip', token, { slot: 'cloak', id: 'cloak_purple' })).status).toBe(403);
    const eq = await post<{ loadout: Record<string, string> }>('/api/economy/cosmetics/equip', token, { slot: 'cloak', id: 'cloak_crimson' });
    expect(eq.body.loadout).toEqual({ cloak: 'cloak_crimson' });
    expect((await wallet(token)).loadout).toEqual({ cloak: 'cloak_crimson' });
  });

  it('soldier cosmetics (crest, aura, victory pose) are bought and worn like the rest', async () => {
    const { token, playerId } = await devLogin(950109);
    await giveDrachmae(playerId, 500);
    for (const item of ['crest_white', 'aura_embers', 'pose_salute']) expect((await post('/api/economy/buy', token, { requestId: reqId(), item })).status).toBe(200);
    // the slot must match the cosmetic
    expect((await post('/api/economy/cosmetics/equip', token, { slot: 'aura', id: 'crest_white' })).status).toBe(400);
    await post('/api/economy/cosmetics/equip', token, { slot: 'crest', id: 'crest_white' });
    await post('/api/economy/cosmetics/equip', token, { slot: 'aura', id: 'aura_embers' });
    const eq = await post<{ loadout: Record<string, string> }>('/api/economy/cosmetics/equip', token, { slot: 'pose', id: 'pose_salute' });
    expect(eq.body.loadout).toEqual({ crest: 'crest_white', aura: 'aura_embers', pose: 'pose_salute' });
    const off = await post<{ loadout: Record<string, string> }>('/api/economy/cosmetics/equip', token, { slot: 'aura', id: null });
    expect(off.body.loadout).toEqual({ crest: 'crest_white', pose: 'pose_salute' });
  });

  it('concurrent purchases cannot overspend', async () => {
    const { token, playerId } = await devLogin(950102);
    await giveDrachmae(playerId, 150);
    const items = ['emblem_owl', 'emblem_lambda', 'banner_crimson'];
    const res = await Promise.all(items.map((item) => post('/api/economy/buy', token, { requestId: reqId(), item })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(2); // 60 + 60 (or 60 + 80) fit in 150, three do not
    expect((await wallet(token)).drachmae).toBeGreaterThanOrEqual(0);
  });

  it('season pass: free claims once, premium needs Drachmae', async () => {
    const p = await join(950201);
    const season = await currentSeason(DB());
    await DB().prepare('INSERT INTO pass_progress (season_id, player_id, xp, updated_at) VALUES (?2, ?3, ?1, 0) ON CONFLICT (season_id, player_id) DO UPDATE SET xp = excluded.xp').bind(PASS.xpPerTier * 3, season.id, p.playerId).run();
    expect((await post('/api/economy/pass/claim', p.token, { tier: 4, track: 'free' })).status).toBe(409);
    const gold0 = (await getJson<{ resources: { gold: number } }>('/api/online/profile', p.token)).body.resources.gold;
    const c1 = await post<{ replayed: boolean; reward: { kind: string; amount: number } }>('/api/economy/pass/claim', p.token, { tier: 1, track: 'free' });
    expect(c1.status).toBe(200);
    expect(c1.body.replayed).toBe(false);
    const c2 = await post<{ replayed: boolean }>('/api/economy/pass/claim', p.token, { tier: 1, track: 'free' });
    expect(c2.body.replayed).toBe(true);
    const gold1 = (await getJson<{ resources: { gold: number } }>('/api/online/profile', p.token)).body.resources.gold;
    expect(gold1 - gold0).toBe((PASS_TIERS[0].free as { amount: number }).amount);

    // Premium: locked, then bought with Drachmae, then claimable (tier 3 gives Drachmae).
    expect((await post('/api/economy/pass/claim', p.token, { tier: 3, track: 'premium' })).status).toBe(409);
    await giveDrachmae(p.playerId, PASS.premiumDrachmae + 5);
    const unlock = await post<{ drachmae: number }>('/api/economy/buy', p.token, { requestId: reqId(), item: 'season_pass' });
    expect(unlock.status).toBe(200);
    expect(unlock.body.drachmae).toBe(5);
    expect((await post<{ error: { code: string } }>('/api/economy/buy', p.token, { requestId: reqId(), item: 'season_pass' })).body.error.code).toBe('already_owned');
    const pass = (await getJson<{ xp: number; tier: number; premium: boolean }>('/api/economy/pass', p.token)).body;
    expect(pass).toMatchObject({ premium: true, tier: 3 });
    const prem = await post<{ reward: { kind: string; amount: number } }>('/api/economy/pass/claim', p.token, { tier: 3, track: 'premium' });
    expect(prem.status).toBe(200);
    expect(prem.body.reward.kind).toBe('drachmae');
    await post('/api/economy/pass/claim', p.token, { tier: 3, track: 'premium' });
    expect((await wallet(p.token)).drachmae).toBe(5 + prem.body.reward.amount);
  });
});

describe('consumables', () => {
  it('the menu shop sells no consumables: they moved to the map merchants (server/test/merchant.test.ts)', async () => {
    const p = await join(950301);
    await giveDrachmae(p.playerId, 100);
    for (const currency of ['gold', 'drachmae']) {
      const r = await post<{ error: { code: string } }>('/api/economy/buy', p.token, { requestId: reqId(), item: 'sharpening_stone', currency });
      expect(r.status).toBe(410);
      expect(r.body.error.code).toBe('merchant_only');
    }
    expect((await wallet(p.token)).drachmae).toBe(100);
  });

  it('a healing salve shortens wounds', async () => {
    const p = await join(950303);
    const season = await currentSeason(DB());
    await DB().prepare("INSERT INTO online_consumables (season_id, player_id, consumable_id, qty) VALUES (?1, ?2, 'healing_salve', 1)").bind(season.id, p.playerId).run();
    const until = Date.now() + 90 * 60_000;
    await DB().prepare('UPDATE online_heroes SET wounded_until = ?1 WHERE id = ?2').bind(until, p.profile.heroes[0].hero.id).run();
    expect((await post('/api/online/consumables/use', p.token, { id: 'morale_wine' })).status).toBe(400);
    const u = await post<{ inventory: Record<string, number> }>('/api/online/consumables/use', p.token, { id: 'healing_salve' });
    expect(u.status).toBe(200);
    expect(u.body.inventory.healing_salve).toBeUndefined();
    const h = await DB().prepare('SELECT wounded_until FROM online_heroes WHERE id = ?1').bind(p.profile.heroes[0].hero.id).first<{ wounded_until: number }>();
    expect(h!.wounded_until).toBe(until - 60 * 60_000);
    expect((await post('/api/online/consumables/use', p.token, { id: 'healing_salve' })).status).toBe(409);
  });
});
