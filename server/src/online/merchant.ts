/**
 * Map merchants (/api/online/merchant/*), docs/DUELS.md "War-map shops on
 * the map". Every town and a few seeded trading posts sell consumables and
 * gear; the stock is a pure function of (shard seed, hex, UTC day)
 * (src/online/merchants.ts), never stored.
 *
 * - GET  /:q/:r  the stock of a visible merchant hex, today's caps, prices for
 *                this player (holder discount) and whether it is in reach.
 * - POST /buy    { q, r, offer, currency, requestId }: one D1 batch keyed by
 *                the request id (a retry is answered from merchant_orders,
 *                never charged twice). The order row is inserted only while the
 *                buyer's profile rev is the one read, the funds suffice and the
 *                daily cap allows; every other statement is guarded by that
 *                row: the payment (gold, rev bump, or a Drachmae ledger row),
 *                the goods, the daily counter and the holder's cut.
 *
 * Reach is the marketplace rule (canReachHex): the hex is yours or your
 * clan's, or your army stands on or next to it. The hex's holder and their
 * clan pay MERCHANT.ownerDiscount less; the holder earns MERCHANT.ownerCut of
 * the list gold price of every sale to someone else, paid by the merchant
 * (gold credited in the same batch; nothing is taken from the buyer for it).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import { hexId, inShard, type Axial } from '../../../src/online/hex';
import { capKey, holderCut, merchantAt, merchantDay, merchantStock, MERCHANT, nextReset, offerPrice, regionOf, type Offer } from '../../../src/online/merchants';
import { makeItem } from '../../../src/game/heroes';
import { Rng, hashString } from '../../../src/sim/rng';
import type { Culture } from '../../../src/data/names';
import { balance, balanceSql, ensureWallet, walletMove } from '../economy/wallet';
import { addConsumable } from '../economy/routes';
import { limit, player, type PlayerCtx } from './context';
import { canReachHex } from './market';
import { visibility } from './routes';
import { getProfile, heroPrefix, hexRow, playerNames, randomToken, staticHex, type HexRow } from './store';

export const merchant = new Hono<AppEnv>();
merchant.use('*', requireAuth);

const coord = z.coerce.number().int().min(-200).max(200);

interface OrderRow {
  q: number;
  r: number;
  day: string;
  offer: string;
  currency: string;
  price: number;
  discount: number;
  item_uid: string | null;
  holder_id: number | null;
  holder_cut: number;
  created_at: number;
}

const orderView = (requestId: string, o: OrderRow) => ({
  requestId,
  hex: { q: o.q, r: o.r },
  day: o.day,
  offer: o.offer,
  currency: o.currency,
  price: o.price,
  discount: o.discount === 1,
  itemUid: o.item_uid,
  holderCut: o.holder_cut,
  at: o.created_at,
});

/** The merchant of a hex in this player's shard, or a 404. */
function merchantOf(pc: PlayerCtx, h: Axial) {
  if (!inShard(h, pc.shard.radius)) throw badRequest('Outside the map');
  const kind = merchantAt(pc.shard.seed, staticHex(pc.shard, h), pc.shard.radius);
  if (!kind) throw new ApiError(404, 'no_merchant', 'No merchant trades on that hex');
  return kind;
}

/** Does this player get the holder discount here (they or their clan hold the hex)? */
function discountFor(pc: PlayerCtx, row: HexRow | null): boolean {
  return !!row?.owner_id && (row.owner_id === pc.pid || (pc.clan !== null && row.clan_id === pc.clan.clanId));
}

/** Items from a region's merchant carry its paint. */
function cultureOf(h: Axial, radius: number): Culture {
  const r = regionOf(h, radius);
  return r === 'gaul' ? 'celtic' : r === 'phoenicia' ? 'phoenician' : 'greek';
}

/** Today's purchases of this player per cap key (consumables and gear). */
async function boughtToday(pc: PlayerCtx, day: string): Promise<Map<string, number>> {
  const [cons, gear] = await Promise.all([
    pc.db.prepare('SELECT consumable_id AS ref, bought FROM consumable_daily WHERE player_id = ?1 AND day = ?2').bind(pc.pid, day).all<{ ref: string; bought: number }>(),
    pc.db.prepare('SELECT ref, bought FROM merchant_daily WHERE player_id = ?1 AND day = ?2').bind(pc.pid, day).all<{ ref: string; bought: number }>(),
  ]);
  return new Map([...cons.results, ...gear.results].map((x) => [x.ref, x.bought]));
}

merchant.get('/:q/:r', async (c) => {
  limit(c, 'merchant', 60);
  const pc = await player(c);
  const q = coord.safeParse(c.req.param('q'));
  const r = coord.safeParse(c.req.param('r'));
  if (!q.success || !r.success) throw badRequest('Bad hex');
  const h = { q: q.data, r: r.data };
  const kind = merchantOf(pc, h);
  const { visible } = await visibility(pc);
  if (!visible.has(hexId(h.q, h.r))) throw new ApiError(404, 'fogged', 'That hex is hidden by the fog of war');
  const row = await hexRow(pc.db, pc.shard, h);
  const [reach, bought, drachmae, names] = await Promise.all([
    canReachHex(pc, h, row),
    boughtToday(pc, merchantDay(pc.now)),
    balance(pc.db, pc.pid),
    playerNames(pc.db, row?.owner_id ? [row.owner_id] : []),
  ]);
  const discount = discountFor(pc, row);
  const day = merchantDay(pc.now);
  let earned = 0;
  if (row?.owner_id === pc.pid) {
    const e = await pc.db
      .prepare('SELECT COALESCE(SUM(holder_cut), 0) AS g FROM merchant_orders WHERE season_id = ?1 AND holder_id = ?2 AND q = ?3 AND r = ?4')
      .bind(pc.season.id, pc.pid, h.q, h.r)
      .first<{ g: number }>();
    earned = e?.g ?? 0;
  }
  return c.json({
    hex: h,
    kind,
    region: regionOf(h, pc.shard.radius),
    day,
    now: pc.now,
    resetsAt: nextReset(pc.now),
    reach,
    discount,
    discountRate: MERCHANT.ownerDiscount,
    holderCutRate: MERCHANT.ownerCut,
    holder: row?.owner_id ? { id: row.owner_id, name: names.get(row.owner_id) ?? null, you: row.owner_id === pc.pid } : null,
    /** Gold this merchant has paid you this season (you hold the hex). */
    earned,
    gold: pc.profile.gold,
    drachmae,
    offers: merchantStock(pc.shard.seed, h, kind, day, pc.shard.radius).map((o) => ({
      ...o,
      price: { gold: offerPrice(o, 'gold', discount), drachmae: offerPrice(o, 'drachmae', discount) },
      bought: bought.get(capKey(o)) ?? 0,
    })),
  });
});

const BuyBody = z.object({
  q: z.number().int().min(-200).max(200),
  r: z.number().int().min(-200).max(200),
  offer: z.string().min(3).max(64),
  currency: z.enum(['gold', 'drachmae']),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

merchant.post('/buy', async (c) => {
  limit(c, 'merchant_buy', 30);
  const pc = await player(c);
  const body = await readJson(c, BuyBody, 1024);
  const { pid, db: d, now } = pc;

  const prior = await d.prepare('SELECT * FROM merchant_orders WHERE player_id = ?1 AND request_id = ?2').bind(pid, body.requestId).first<OrderRow>();
  if (prior) {
    if (prior.offer !== body.offer || prior.q !== body.q || prior.r !== body.r) throw new ApiError(409, 'request_reused', 'That request id was used for another purchase');
    return c.json({ order: orderView(body.requestId, prior), replayed: true, gold: pc.profile.gold, drachmae: await balance(d, pid) });
  }

  const h = { q: body.q, r: body.r };
  const kind = merchantOf(pc, h);
  const row = await hexRow(d, pc.shard, h);
  if (!(await canReachHex(pc, h, row))) throw new ApiError(403, 'out_of_reach', 'Trade where you hold the hex, or where your army stands on or next to it');
  const day = merchantDay(now);
  const offer: Offer | undefined = merchantStock(pc.shard.seed, h, kind, day, pc.shard.radius).find((o) => o.id === body.offer);
  if (!offer) throw new ApiError(404, 'no_offer', 'This merchant does not sell that today');
  const discount = discountFor(pc, row);
  const price = offerPrice(offer, body.currency, discount);
  if (price === null) throw badRequest(`This cannot be bought with ${body.currency}`);
  const holder = row?.owner_id && row.owner_id !== pid ? row.owner_id : null;
  const cut = holder ? holderCut(offer) : 0;
  const key = capKey(offer);
  const consumable = offer.kind === 'consumable';
  const item = consumable ? null : { ...makeItem(new Rng(hashString(body.requestId) || 1), { nextId: 1 }, offer.ref, offer.rarity, 100, cultureOf(h, pc.shard.radius)), uid: `${heroPrefix(pc.season.id, pid)}m${body.requestId}` };

  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM merchant_orders WHERE player_id = ${pid | 0} AND request_id = '${body.requestId}' AND nonce = '${nonce}')`;
  // ?1 pid ... ?16 now; ?17 rev read, ?18 cap key, ?19 daily cap
  const revOk = 'EXISTS (SELECT 1 FROM online_profiles WHERE season_id = ?3 AND player_id = ?1 AND rev = ?17' + (body.currency === 'gold' ? ' AND gold >= ?10)' : ')');
  const funds = body.currency === 'drachmae' ? ` AND ${balanceSql('?1')} >= ?10` : '';
  const cap = consumable
    ? 'COALESCE((SELECT bought FROM consumable_daily WHERE player_id = ?1 AND day = ?7 AND consumable_id = ?18), 0) + 1 <= ?19'
    : 'COALESCE((SELECT bought FROM merchant_daily WHERE player_id = ?1 AND day = ?7 AND ref = ?18), 0) + 1 <= ?19';
  const stmts: D1PreparedStatement[] = [
    ensureWallet(d, pid, now),
    d
      .prepare(
        `INSERT INTO merchant_orders (player_id, request_id, season_id, shard_id, q, r, day, offer, currency, price, discount, item_uid, holder_id, holder_cut, nonce, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16 WHERE ${revOk}${funds} AND ${cap} ON CONFLICT DO NOTHING`,
      )
      .bind(pid, body.requestId, pc.season.id, pc.shard.id, h.q, h.r, day, offer.id, body.currency, price, discount ? 1 : 0, item?.uid ?? null, holder, cut, nonce, now, pc.profile.rev, key, offer.dailyCap),
    d
      .prepare(`UPDATE online_profiles SET gold = gold - ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`)
      .bind(pc.season.id, pid, body.currency === 'gold' ? price : 0, now),
  ];
  if (body.currency === 'drachmae') stmts.push(...walletMove(d, pid, -price, 'merchant', body.requestId, G, now));
  if (item) stmts.push(d.prepare(`INSERT INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${G}`).bind(item.uid, pc.season.id, pid, JSON.stringify(item), now));
  else stmts.push(addConsumable(d, pc.season.id, pid, offer.ref, 1, G));
  stmts.push(
    consumable
      ? d
          .prepare(
            `INSERT INTO consumable_daily (player_id, day, consumable_id, bought) SELECT ?1, ?2, ?3, 1 WHERE ${G}
             ON CONFLICT (player_id, day, consumable_id) DO UPDATE SET bought = bought + 1`,
          )
          .bind(pid, day, key)
      : d
          .prepare(
            `INSERT INTO merchant_daily (player_id, day, ref, bought) SELECT ?1, ?2, ?3, 1 WHERE ${G}
             ON CONFLICT (player_id, day, ref) DO UPDATE SET bought = bought + 1`,
          )
          .bind(pid, day, key),
  );
  if (holder && cut > 0) {
    stmts.push(d.prepare(`UPDATE online_profiles SET gold = gold + ?3, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`).bind(pc.season.id, holder, cut, now));
  }
  const res = await d.batch(stmts);
  if (res[1].meta.changes !== 1) {
    const raced = await d.prepare('SELECT * FROM merchant_orders WHERE player_id = ?1 AND request_id = ?2').bind(pid, body.requestId).first<OrderRow>();
    if (raced && raced.offer === body.offer && raced.q === h.q && raced.r === h.r) return c.json({ order: orderView(body.requestId, raced), replayed: true, gold: (await getProfile(d, pc.season.id, pid))?.gold ?? 0, drachmae: await balance(d, pid) });
    if (raced) throw new ApiError(409, 'request_reused', 'That request id was used for another purchase');
    // Why did it not go through?
    const bought = (await boughtToday(pc, day)).get(key) ?? 0;
    if (bought + 1 > offer.dailyCap) throw new ApiError(409, 'daily_cap', `At most ${offer.dailyCap} a day`, { cap: offer.dailyCap, bought });
    const fresh = await getProfile(d, pc.season.id, pid);
    if (fresh && fresh.rev !== pc.profile.rev) throw new ApiError(409, 'conflict', 'Your army changed meanwhile; try again');
    throw new ApiError(409, 'insufficient_funds', body.currency === 'drachmae' ? 'Not enough Drachmae' : 'Not enough gold', { price, currency: body.currency });
  }
  const order: OrderRow = { q: h.q, r: h.r, day, offer: offer.id, currency: body.currency, price, discount: discount ? 1 : 0, item_uid: item?.uid ?? null, holder_id: holder, holder_cut: cut, created_at: now };
  return c.json({
    order: orderView(body.requestId, order),
    replayed: false,
    item,
    gold: pc.profile.gold - (body.currency === 'gold' ? price : 0),
    drachmae: await balance(d, pid),
  });
});
