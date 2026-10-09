/**
 * Economy API (/api/economy/*): the catalogue, the Drachmae wallet, shop
 * purchases (cosmetics, the season pass), the cosmetic loadout and the season
 * pass. Stars only buy Drachmae packs (/api/shop/invoice); everything here is
 * a server-side debit of Drachmae, atomic in one D1 batch and idempotent per
 * client request id. Consumables are bought from the map merchants
 * (/api/online/merchant, server/src/online/merchant.ts).
 */
import { emit } from '../telemetry/analytics';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, requireAuth } from '../middleware';
import { requireRate } from '../rateLimit';
import { currentSeason, getProfile, randomToken } from '../online/store';
import { isConsumableId } from '../../../src/data/consumables';
import { catalogView, COSMETIC_SLOTS, getCosmetic, PASS, PASS_TIERS, shopItem, type CosmeticSlot, type PassReward } from './catalog';
import { passTier } from './pass';
import { balance, balanceSql, ensureWallet, walletMove } from './wallet';
import { DRACHMAE_PACKS } from '../products';

export const economy = new Hono<AppEnv>();

/** Public catalogue: packs (Stars), cosmetics and the pass (Drachmae), consumables (gold or Drachmae), market rules. */
economy.get('/catalog', (c) => c.json({ packs: DRACHMAE_PACKS, ...catalogView() }));

economy.use('/*', requireAuth);

function limit(c: Context<AppEnv>, bucket: string, n: number): void {
  requireRate(`economy:${bucket}:${c.get('session').pid}`, n, 60_000);
}

/** UTC day of a server timestamp (daily caps). */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function ownedCosmetics(d: D1Database, pid: number): Promise<string[]> {
  const r = await d.prepare('SELECT product_id FROM entitlements WHERE player_id = ?1 AND revoked_at IS NULL ORDER BY granted_at').bind(pid).all<{ product_id: string }>();
  return r.results.map((x) => x.product_id).filter((id) => !!getCosmetic(id));
}

async function loadout(d: D1Database, pid: number): Promise<Record<string, string>> {
  const r = await d.prepare('SELECT slot, cosmetic_id FROM cosmetic_loadout WHERE player_id = ?1').bind(pid).all<{ slot: string; cosmetic_id: string }>();
  return Object.fromEntries(r.results.map((x) => [x.slot, x.cosmetic_id]));
}

economy.get('/wallet', async (c) => {
  const d = db(c.env);
  const pid = c.get('session').pid;
  const [drachmae, ledger, cosmetics, slots] = await Promise.all([
    balance(d, pid),
    d.prepare('SELECT delta, kind, ref, created_at AS at FROM drachmae_ledger WHERE player_id = ?1 ORDER BY id DESC LIMIT 50').bind(pid).all(),
    ownedCosmetics(d, pid),
    loadout(d, pid),
  ]);
  return c.json({ drachmae, canSpend: drachmae > 0, ledger: ledger.results, cosmetics, loadout: slots });
});

// ------------------------------------------------------------------ buying

const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const BuyBody = z.object({
  requestId: RequestId,
  item: z.string().min(1).max(64),
  currency: z.enum(['drachmae', 'gold']).default('drachmae'),
  qty: z.number().int().min(1).max(10).default(1),
});

interface OrderRow {
  item: string;
  qty: number;
  currency: string;
  price: number;
  season_id: number | null;
  created_at: number;
}

const orderView = (requestId: string, o: OrderRow) => ({ requestId, item: o.item, qty: o.qty, currency: o.currency, price: o.price, season: o.season_id, at: o.created_at });

/**
 * Buys a cosmetic or the season pass premium track (Drachmae).
 * Retrying with the same requestId never charges twice and answers the
 * stored order (`replayed: true`).
 */
economy.post('/buy', async (c) => {
  limit(c, 'buy', 30);
  const d = db(c.env);
  const pid = c.get('session').pid;
  const now = Date.now();
  const body = await readJson(c, BuyBody, 1024);
  if (isConsumableId(body.item)) throw new ApiError(410, 'merchant_only', 'Consumables are sold by merchants on the war map (towns and trading posts)');
  const item = shopItem(body.item);
  if (!item) throw new ApiError(404, 'unknown_item', `Nothing called "${body.item}" is for sale`);

  const prior = await d.prepare('SELECT * FROM shop_orders WHERE player_id = ?1 AND request_id = ?2').bind(pid, body.requestId).first<OrderRow>();
  if (prior) {
    if (prior.item !== body.item) throw new ApiError(409, 'request_reused', 'That request id was used for another purchase');
    return c.json({ order: orderView(body.requestId, prior), replayed: true, drachmae: await balance(d, pid) });
  }

  const qty = 1;
  if (body.currency !== 'drachmae') throw badRequest('Only Drachmae buy this');
  const price = item.drachmae;

  const season = item.kind === 'cosmetic' ? null : await currentSeason(d, now);

  // ?1 pid, ?2 request id, ?3 item, ?4 qty, ?5 currency, ?6 price, ?7 season, ?8 nonce, ?9 now
  const conds: string[] = [`${balanceSql('?1')} >= ?6`];
  if (item.kind === 'cosmetic') conds.push('NOT EXISTS (SELECT 1 FROM entitlements WHERE player_id = ?1 AND product_id = ?3 AND revoked_at IS NULL)');
  if (item.kind === 'pass') conds.push('NOT EXISTS (SELECT 1 FROM pass_progress WHERE season_id = ?7 AND player_id = ?1 AND premium = 1)');

  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM shop_orders WHERE player_id = ${pid | 0} AND request_id = '${body.requestId}' AND nonce = '${nonce}')`;
  const stmts: D1PreparedStatement[] = [
    ensureWallet(d, pid, now),
    d
      .prepare(
        `INSERT INTO shop_orders (player_id, request_id, item, qty, currency, price, season_id, nonce, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${conds.join(' AND ')} ON CONFLICT DO NOTHING`,
      )
      .bind(pid, body.requestId, body.item, qty, body.currency, price, season?.id ?? null, nonce, now),
  ];
  stmts.push(...walletMove(d, pid, -price, 'spend', body.requestId, G, now));
  if (item.kind === 'cosmetic') stmts.push(grantCosmetic(d, pid, item.id, G, now));
  if (item.kind === 'pass') {
    stmts.push(
      d
        .prepare(
          `INSERT INTO pass_progress (season_id, player_id, xp, premium, premium_at, updated_at) SELECT ?1, ?2, 0, 1, ?3, ?3 WHERE ${G}
           ON CONFLICT (season_id, player_id) DO UPDATE SET premium = 1, premium_at = excluded.premium_at, updated_at = excluded.updated_at`,
        )
        .bind(season!.id, pid, now),
    );
  }
  const res = await d.batch(stmts);
  if (res[1].meta.changes !== 1) {
    const raced = await d.prepare('SELECT * FROM shop_orders WHERE player_id = ?1 AND request_id = ?2').bind(pid, body.requestId).first<OrderRow>();
    if (raced && raced.item === body.item) return c.json({ order: orderView(body.requestId, raced), replayed: true, drachmae: await balance(d, pid) });
    if (raced) throw new ApiError(409, 'request_reused', 'That request id was used for another purchase');
    // Why did it not go through?
    if (item.kind === 'cosmetic' && (await ownedCosmetics(d, pid)).includes(item.id)) throw new ApiError(409, 'already_owned', 'You already own this');
    if (item.kind === 'pass') {
      const pp = await d.prepare('SELECT premium FROM pass_progress WHERE season_id = ?1 AND player_id = ?2').bind(season!.id, pid).first<{ premium: number }>();
      if (pp?.premium === 1) throw new ApiError(409, 'already_owned', 'The premium track is already unlocked this season');
    }
    throw new ApiError(409, 'insufficient_funds', 'Not enough Drachmae', { price, currency: body.currency });
  }
  const order: OrderRow = { item: body.item, qty, currency: body.currency, price, season_id: season?.id ?? null, created_at: now };
  return c.json({ order: orderView(body.requestId, order), replayed: false, drachmae: await balance(d, pid) });
});

export function grantCosmetic(d: D1Database, pid: number, id: string, guard: string, now: number): D1PreparedStatement {
  return d
    .prepare(
      `INSERT INTO entitlements (player_id, product_id, purchase_id, granted_at) SELECT ?1, ?2, NULL, ?3 WHERE ${guard}
       ON CONFLICT (player_id, product_id) DO UPDATE SET purchase_id = NULL, granted_at = excluded.granted_at, revoked_at = NULL
       WHERE entitlements.revoked_at IS NOT NULL`,
    )
    .bind(pid, id, now);
}

export function addConsumable(d: D1Database, season: number, pid: number, id: string, qty: number, guard: string): D1PreparedStatement {
  return d
    .prepare(
      `INSERT INTO online_consumables (season_id, player_id, consumable_id, qty) SELECT ?1, ?2, ?3, ?4 WHERE ${guard}
       ON CONFLICT (season_id, player_id, consumable_id) DO UPDATE SET qty = qty + excluded.qty`,
    )
    .bind(season, pid, id, qty);
}

// ------------------------------------------------------------------ cosmetics

const EquipBody = z.object({ slot: z.enum(COSMETIC_SLOTS as [CosmeticSlot, ...CosmeticSlot[]]), id: z.string().max(64).nullable() });

/** Shows an owned cosmetic in its slot (id null clears the slot). */
economy.post('/cosmetics/equip', async (c) => {
  limit(c, 'equip', 60);
  const d = db(c.env);
  const pid = c.get('session').pid;
  const body = await readJson(c, EquipBody, 1024);
  if (body.id === null) {
    await d.prepare('DELETE FROM cosmetic_loadout WHERE player_id = ?1 AND slot = ?2').bind(pid, body.slot).run();
    return c.json({ loadout: await loadout(d, pid) });
  }
  const cos = getCosmetic(body.id);
  if (!cos) throw new ApiError(404, 'unknown_item', 'No such cosmetic');
  if (cos.slot !== body.slot) throw badRequest(`${cos.name} goes in the ${cos.slot} slot`);
  const ins = await d
    .prepare(
      `INSERT INTO cosmetic_loadout (player_id, slot, cosmetic_id, updated_at)
       SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM entitlements WHERE player_id = ?1 AND product_id = ?3 AND revoked_at IS NULL)
       ON CONFLICT (player_id, slot) DO UPDATE SET cosmetic_id = excluded.cosmetic_id, updated_at = excluded.updated_at`,
    )
    .bind(pid, body.slot, body.id, Date.now())
    .run();
  if (ins.meta.changes !== 1) throw new ApiError(403, 'not_owned', 'You do not own that cosmetic');
  return c.json({ loadout: await loadout(d, pid) });
});

// ------------------------------------------------------------------ season pass

economy.get('/pass', async (c) => {
  const d = db(c.env);
  const pid = c.get('session').pid;
  const season = await currentSeason(d);
  const [pp, claims] = await Promise.all([
    d.prepare('SELECT xp, premium FROM pass_progress WHERE season_id = ?1 AND player_id = ?2').bind(season.id, pid).first<{ xp: number; premium: number }>(),
    d.prepare('SELECT tier, track FROM pass_claims WHERE season_id = ?1 AND player_id = ?2 ORDER BY tier').bind(season.id, pid).all<{ tier: number; track: string }>(),
  ]);
  const xp = pp?.xp ?? 0;
  return c.json({
    season: { id: season.id, endsAt: season.endsAt },
    xp,
    tier: passTier(xp),
    premium: pp?.premium === 1,
    premiumDrachmae: PASS.premiumDrachmae,
    xpPerTier: PASS.xpPerTier,
    claimed: claims.results,
    tiers: PASS_TIERS,
  });
});

const ClaimBody = z.object({ tier: z.number().int().min(1).max(PASS.tiers), track: z.enum(['free', 'premium']) });

/** Claims one reward of the current season's pass. Claiming again answers `replayed: true` and grants nothing. */
economy.post('/pass/claim', async (c) => {
  limit(c, 'claim', 60);
  const d = db(c.env);
  const pid = c.get('session').pid;
  const now = Date.now();
  const body = await readJson(c, ClaimBody, 1024);
  const season = await currentSeason(d, now);
  const def = PASS_TIERS[body.tier - 1];
  const reward: PassReward = def[body.track];
  const seasonal = reward.kind === 'gold' || reward.kind === 'consumable';
  if (seasonal && !(await getProfile(d, season.id, pid))) throw new ApiError(409, 'no_profile', 'Join the online season first (POST /api/online/profile)');
  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM pass_claims WHERE season_id = ${season.id | 0} AND player_id = ${pid | 0} AND tier = ${body.tier | 0} AND track = '${body.track}' AND nonce = '${nonce}')`;
  const stmts: D1PreparedStatement[] = [
    ensureWallet(d, pid, now),
    d
      .prepare(
        `INSERT INTO pass_claims (season_id, player_id, tier, track, nonce, claimed_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM pass_progress WHERE season_id = ?1 AND player_id = ?2 AND xp >= ?7 AND (?4 = 'free' OR premium = 1))
           ${seasonal ? 'AND EXISTS (SELECT 1 FROM online_profiles WHERE season_id = ?1 AND player_id = ?2)' : ''}
         ON CONFLICT DO NOTHING`,
      )
      .bind(season.id, pid, body.tier, body.track, nonce, now, def.xp),
  ];
  if (reward.kind === 'gold') stmts.push(d.prepare(`UPDATE online_profiles SET gold = gold + ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`).bind(season.id, pid, reward.amount, now));
  if (reward.kind === 'consumable') stmts.push(addConsumable(d, season.id, pid, reward.id, reward.qty, G));
  if (reward.kind === 'drachmae') stmts.push(...walletMove(d, pid, reward.amount, 'pass', `${season.id}:${body.tier}:${body.track}`, G, now));
  if (reward.kind === 'cosmetic') stmts.push(grantCosmetic(d, pid, reward.id, G, now));
  const res = await d.batch(stmts);
  if (res[1].meta.changes !== 1) {
    const done = await d
      .prepare('SELECT claimed_at FROM pass_claims WHERE season_id = ?1 AND player_id = ?2 AND tier = ?3 AND track = ?4')
      .bind(season.id, pid, body.tier, body.track)
      .first();
    if (done) return c.json({ tier: body.tier, track: body.track, reward, replayed: true });
    throw new ApiError(409, 'locked', body.track === 'premium' ? 'Reach this tier with the premium track unlocked first' : 'Reach this tier first');
  }
  emit(c, 'pass_claim', { track: body.track, tier: body.tier });
  return c.json({ tier: body.tier, track: body.track, reward, replayed: false, drachmae: await balance(d, pid) });
});
