/**
 * Town marketplace (/api/online/market/*), docs/DESIGN_V2.md "Trading".
 *
 * - list:   from the season stash (an item), purse (food/wood/bronze) or
 *           consumables, in a town you or your clan hold or where your army
 *           stands on or next to. The goods go into escrow (the listing row)
 *           in the same batch. Price in gold or Drachmae, bounds per rarity.
 * - buy:    one D1 batch: the listing flips open -> sold (only one buyer can
 *           win it), the buyer pays, the seller gets price minus the 10% fee
 *           (the fee is burned), the goods move to the buyer, audit row.
 * - cancel: the seller takes the goods back.
 * - expiry: 48 h (never past the season end). Expired listings are resolved
 *           lazily (goods back to the seller) when the seller lists, looks at
 *           their listings or their profile.
 *
 * Listings belong to a season and a shard. When the season ends they are
 * simply left behind with the rest of the season (goods vanish with it; gold
 * dies with the season; Drachmae already paid to a seller stay theirs).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import { LEGACY_RARITY, normalizeItem, normalizeRarity, type Item } from '../../../src/data/items';
import { CONSUMABLE_IDS, CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';
import { hexDistance, inShard, type Axial } from '../../../src/online/hex';
import { MARKET, marketFee, priceBounds } from '../economy/catalog';
import { balanceSql, ensureWallet, walletMove } from '../economy/wallet';
import { addConsumable } from '../economy/routes';
import { limit, player, type PlayerCtx } from './context';
import { armyState, hexRow, playerNames, randomToken, revBatch, revGuard, staticHex, type Shard } from './store';
import { ev, later, notify } from '../notify/outbox';

export const market = new Hono<AppEnv>();
market.use('*', requireAuth);

type Currency = 'gold' | 'drachmae';
type Kind = 'item' | 'resource' | 'consumable';
type ResourceKey = (typeof MARKET.resources)[number];

export interface ListingRow {
  id: string;
  season_id: number;
  shard_id: number;
  seller_id: number;
  town_q: number;
  town_r: number;
  kind: Kind;
  ref: string;
  item: string | null;
  qty: number;
  rarity: string;
  currency: Currency;
  price: number;
  status: 'open' | 'sold' | 'cancelled' | 'expired';
  buyer_id: number | null;
  fee: number | null;
  created_at: number;
  expires_at: number;
  closed_at: number | null;
}

/** A short name of the goods for the seller's notification. */
function goodsName(l: ListingRow): string {
  let name = l.ref;
  if (l.kind === 'item' && l.item) {
    try {
      name = String((JSON.parse(l.item) as { name?: string }).name ?? l.ref);
    } catch {
      // keep the ref
    }
  } else if (l.kind === 'consumable') name = CONSUMABLES[l.ref as ConsumableId]?.name ?? l.ref;
  return (l.qty > 1 ? `${l.qty}× ${name}` : name).slice(0, 60);
}

function listingView(l: ListingRow, pid: number, names: Map<number, string>, now: number) {
  return {
    id: l.id,
    seller: { id: l.seller_id, name: names.get(l.seller_id) ?? null },
    town: { q: l.town_q, r: l.town_r },
    kind: l.kind,
    ref: l.ref,
    item: l.item ? normalizeItem(JSON.parse(l.item) as Item) : null,
    qty: l.qty,
    rarity: l.kind === 'item' ? normalizeRarity(l.rarity) : l.rarity,
    currency: l.currency,
    price: l.price,
    fee: l.fee ?? marketFee(l.price),
    status: l.status === 'open' && l.expires_at <= now ? 'expired' : l.status,
    mine: l.seller_id === pid,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    closedAt: l.closed_at,
  };
}

/** A town hex (type town, or a capital). */
function isTown(shard: Shard, h: Axial): boolean {
  const s = staticHex(shard, h);
  return s.type === 'town' || s.capital;
}

/** Can this player trade in this town: it is theirs or their clan's, or their army stands on or next to it. */
async function canReachTown(pc: PlayerCtx, h: Axial): Promise<boolean> {
  if (!inShard(h, pc.shard.radius) || !isTown(pc.shard, h)) return false;
  const army = armyState(pc.profile, pc.now);
  if (hexDistance(army.pos, h) <= 1) return true;
  const row = await hexRow(pc.db, pc.shard, h);
  return !!row && (row.owner_id === pc.pid || (pc.clan !== null && row.clan_id === pc.clan.clanId));
}

// ------------------------------------------------------------------ escrow return

/** Statements giving a listing's goods back to its seller (only within the listing's season). */
function returnGoods(d: D1Database, l: ListingRow, guard: string, now: number): D1PreparedStatement[] {
  return giveGoods(d, l, l.seller_id, guard, now);
}

function giveGoods(d: D1Database, l: ListingRow, to: number, guard: string, now: number): D1PreparedStatement[] {
  if (l.kind === 'item' && l.item) {
    return [d.prepare(`INSERT OR IGNORE INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${guard}`).bind((JSON.parse(l.item) as Item).uid, l.season_id, to, l.item, now)];
  }
  if (l.kind === 'resource' && (MARKET.resources as readonly string[]).includes(l.ref)) {
    return [d.prepare(`UPDATE online_profiles SET ${l.ref} = ${l.ref} + ?3, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${guard}`).bind(l.season_id, to, l.qty, now)];
  }
  if (l.kind === 'consumable') return [addConsumable(d, l.season_id, to, l.ref, l.qty, guard)];
  return [];
}

function audit(d: D1Database, l: ListingRow, actor: number, action: string, guard: string, now: number, fee: number | null = null, detail: unknown = null): D1PreparedStatement {
  return d
    .prepare(
      `INSERT INTO market_audit (listing_id, season_id, actor_id, action, currency, price, fee, detail, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${guard}`,
    )
    .bind(l.id, l.season_id, actor, action, l.currency, l.price, fee, detail === null ? null : JSON.stringify(detail), now);
}

const listingGuard = (id: string, nonce: string) => `EXISTS (SELECT 1 FROM market_listings WHERE id = '${id}' AND nonce = '${nonce}')`;

/** Lazily closes a seller's expired listings in a season, returning the goods. Returns how many. */
export async function resolveExpired(d: D1Database, season: number, seller: number, now: number): Promise<number> {
  const due = await d
    .prepare("SELECT * FROM market_listings WHERE seller_id = ?1 AND season_id = ?2 AND status = 'open' AND expires_at <= ?3 LIMIT 25")
    .bind(seller, season, now)
    .all<ListingRow>();
  let n = 0;
  for (const l of due.results) {
    const nonce = randomToken(8);
    const G = listingGuard(l.id, nonce);
    const res = await d.batch([
      d.prepare("UPDATE market_listings SET status = 'expired', nonce = ?2, closed_at = ?3 WHERE id = ?1 AND status = 'open' AND expires_at <= ?3").bind(l.id, nonce, now),
      ...returnGoods(d, l, G, now),
      audit(d, l, seller, 'expire', G, now),
    ]);
    if (res[0].meta.changes === 1) n++;
  }
  return n;
}

// ------------------------------------------------------------------ search

const SearchQuery = z.object({
  kind: z.enum(['item', 'resource', 'consumable']).optional(),
  ref: z.string().max(40).optional(),
  rarity: z.string().max(20).optional(),
  currency: z.enum(['gold', 'drachmae']).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  townQ: z.coerce.number().int().optional(),
  townR: z.coerce.number().int().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'ending']).default('price_asc'),
  cursor: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Open listings of your shard, filtered and paginated (`cursor` = offset from the previous `next`). */
market.get('/', async (c) => {
  limit(c, 'market_search', 60);
  const pc = await player(c);
  const parsed = SearchQuery.safeParse(c.req.query());
  if (!parsed.success) throw badRequest('Invalid query', { issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });
  const f = parsed.data;
  const where = ['season_id = ?1', 'shard_id = ?2', "status = 'open'", 'expires_at > ?3'];
  const binds: unknown[] = [pc.season.id, pc.shard.id, pc.now];
  const add = (sql: string, v: unknown) => {
    binds.push(v);
    where.push(sql.replace('?', `?${binds.length}`));
  };
  if (f.kind) add('kind = ?', f.kind);
  if (f.ref) add('ref = ?', f.ref);
  if (f.rarity) {
    // Listings made before the five tiers carry the old names (fine, heroic).
    const r = normalizeRarity(f.rarity);
    const names = [r, ...Object.keys(LEGACY_RARITY).filter((k) => LEGACY_RARITY[k] === r)];
    for (const n of names) binds.push(n);
    where.push(`rarity IN (${names.map((_, i) => `?${binds.length - names.length + 1 + i}`).join(', ')})`);
  }
  if (f.currency) add('currency = ?', f.currency);
  if (f.minPrice !== undefined) add('price >= ?', f.minPrice);
  if (f.maxPrice !== undefined) add('price <= ?', f.maxPrice);
  if (f.townQ !== undefined && f.townR !== undefined) {
    add('town_q = ?', f.townQ);
    add('town_r = ?', f.townR);
  }
  const order = { price_asc: 'price ASC, created_at ASC', price_desc: 'price DESC, created_at ASC', newest: 'created_at DESC', ending: 'expires_at ASC' }[f.sort];
  const rows = await pc.db
    .prepare(`SELECT * FROM market_listings WHERE ${where.join(' AND ')} ORDER BY ${order}, id LIMIT ${f.limit + 1} OFFSET ${f.cursor}`)
    .bind(...binds)
    .all<ListingRow>();
  const page = rows.results.slice(0, f.limit);
  const names = await playerNames(pc.db, page.map((l) => l.seller_id));
  return c.json({
    listings: page.map((l) => listingView(l, pc.pid, names, pc.now)),
    next: rows.results.length > f.limit ? f.cursor + f.limit : null,
  });
});

/** Your listings this season (expired ones are resolved first: goods back in your stash). */
market.get('/mine', async (c) => {
  const pc = await player(c);
  await resolveExpired(pc.db, pc.season.id, pc.pid, pc.now);
  const rows = await pc.db
    .prepare('SELECT * FROM market_listings WHERE seller_id = ?1 AND season_id = ?2 ORDER BY created_at DESC LIMIT 100')
    .bind(pc.pid, pc.season.id)
    .all<ListingRow>();
  const names = await playerNames(pc.db, [pc.pid]);
  const open = rows.results.filter((l) => l.status === 'open').length;
  return c.json({ listings: rows.results.map((l) => listingView(l, pc.pid, names, pc.now)), open, maxOpen: MARKET.maxOpenListings });
});

/** Towns where you can list right now. */
market.get('/towns', async (c) => {
  const pc = await player(c);
  const held = await pc.db
    .prepare('SELECT q, r FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND (owner_id = ?3 OR (?4 IS NOT NULL AND clan_id = ?4))')
    .bind(pc.season.id, pc.shard.id, pc.pid, pc.clan?.clanId ?? null)
    .all<{ q: number; r: number }>();
  const army = armyState(pc.profile, pc.now);
  const cands: Axial[] = [...held.results, army.pos];
  for (const d of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) cands.push({ q: army.pos.q + d[0], r: army.pos.r + d[1] });
  const seen = new Set<string>();
  const towns = cands.filter((h) => {
    const k = `${h.q},${h.r}`;
    if (seen.has(k) || !inShard(h, pc.shard.radius) || !isTown(pc.shard, h)) return false;
    seen.add(k);
    return true;
  });
  return c.json({ towns });
});

// ------------------------------------------------------------------ list

const ListBody = z.object({
  town: z.object({ q: z.number().int().min(-200).max(200), r: z.number().int().min(-200).max(200) }),
  kind: z.enum(['item', 'resource', 'consumable']),
  /** item uid (kind item), resource key (food|wood|bronze) or consumable id. */
  ref: z.string().min(1).max(80),
  qty: z.number().int().min(1).max(MARKET.maxResourceQty).default(1),
  currency: z.enum(['gold', 'drachmae']),
  price: z.number().int().min(1).max(1_000_000),
});

market.post('/list', async (c) => {
  limit(c, 'market_list', 20);
  const pc = await player(c);
  const body = await readJson(c, ListBody, 2048);
  if (!(await canReachTown(pc, body.town))) throw new ApiError(403, 'town_unreachable', 'List in a town you hold, or where your army stands on or next to');
  await resolveExpired(pc.db, pc.season.id, pc.pid, pc.now);

  let item: Item | null = null;
  let ref = body.ref;
  let qty = body.qty;
  let rarity = 'common';
  const p = pc.profile;
  // First statement: bump the profile rev (taking a resource out of the purse) if the goods are there and the cap allows.
  // ?5 (ref) and ?6 (qty) are always bound; the always-true terms keep both referenced for every kind.
  const conds = [`(SELECT COUNT(*) FROM market_listings WHERE seller_id = ?2 AND season_id = ?1 AND status = 'open') < ${MARKET.maxOpenListings}`, '?5 IS NOT NULL', '?6 > 0'];
  let take = '';
  if (body.kind === 'item') {
    const r = await pc.db.prepare('SELECT data FROM online_items WHERE uid = ?1 AND season_id = ?2 AND player_id = ?3').bind(body.ref, pc.season.id, pc.pid).first<{ data: string }>();
    if (!r) throw new ApiError(404, 'not_found', 'No such item in your stash');
    item = JSON.parse(r.data) as Item;
    ref = item.def;
    qty = 1;
    rarity = normalizeRarity(item.rarity);
    conds.push('EXISTS (SELECT 1 FROM online_items WHERE uid = ?5 AND season_id = ?1 AND player_id = ?2)');
  } else if (body.kind === 'resource') {
    if (!(MARKET.resources as readonly string[]).includes(body.ref)) throw badRequest(`Only ${MARKET.resources.join(', ')} can be sold`);
    const key = body.ref as ResourceKey;
    if (p[key] < qty) throw new ApiError(409, 'cannot_afford', `Not enough ${key}`);
    conds.push(`${key} >= ?6`);
    take = `, ${key} = ${key} - ?6`;
  } else {
    if (!(CONSUMABLE_IDS as string[]).includes(body.ref)) throw badRequest('No such consumable');
    if (qty > MARKET.maxConsumableQty) throw badRequest(`At most ${MARKET.maxConsumableQty} per listing`);
    conds.push('EXISTS (SELECT 1 FROM online_consumables WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?5 AND qty >= ?6)');
  }
  const [min, max] = priceBounds(body.currency, rarity);
  if (body.price < min || body.price > max) throw new ApiError(400, 'price_out_of_bounds', `Price must be between ${min} and ${max} ${body.currency}`, { min, max });

  const id = randomToken(12);
  const expiresAt = Math.min(pc.now + MARKET.listingHours * 3_600_000, pc.season.endsAt);
  const g = revGuard(pc.season.id, pc.pid, p.rev + 1);
  const listing: ListingRow = {
    id,
    season_id: pc.season.id,
    shard_id: pc.shard.id,
    seller_id: pc.pid,
    town_q: body.town.q,
    town_r: body.town.r,
    kind: body.kind,
    ref,
    item: item ? JSON.stringify(item) : null,
    qty,
    rarity,
    currency: body.currency,
    price: body.price,
    status: 'open',
    buyer_id: null,
    fee: null,
    created_at: pc.now,
    expires_at: expiresAt,
    closed_at: null,
  };
  const stmts: D1PreparedStatement[] = [
    pc.db
      .prepare(`UPDATE online_profiles SET rev = rev + 1, updated_at = ?3${take} WHERE season_id = ?1 AND player_id = ?2 AND rev = ?4 AND ${conds.join(' AND ')}`)
      .bind(pc.season.id, pc.pid, pc.now, p.rev, body.ref, qty),
  ];
  if (body.kind === 'item') stmts.push(pc.db.prepare(`DELETE FROM online_items WHERE uid = ?1 AND player_id = ?2 AND ${g}`).bind(body.ref, pc.pid));
  if (body.kind === 'consumable') {
    stmts.push(pc.db.prepare(`UPDATE online_consumables SET qty = qty - ?4 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3 AND ${g}`).bind(pc.season.id, pc.pid, body.ref, qty));
  }
  stmts.push(
    pc.db
      .prepare(
        `INSERT INTO market_listings (id, season_id, shard_id, seller_id, town_q, town_r, kind, ref, item, qty, rarity, currency, price, created_at, expires_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15 WHERE ${g}`,
      )
      .bind(id, pc.season.id, pc.shard.id, pc.pid, body.town.q, body.town.r, body.kind, ref, listing.item, qty, rarity, body.currency, body.price, pc.now, expiresAt),
    audit(pc.db, listing, pc.pid, 'list', g, pc.now),
  );
  try {
    await revBatch(pc.db, stmts);
  } catch (e) {
    const open = await pc.db.prepare("SELECT COUNT(*) AS n FROM market_listings WHERE seller_id = ?1 AND season_id = ?2 AND status = 'open'").bind(pc.pid, pc.season.id).first<{ n: number }>();
    if ((open?.n ?? 0) >= MARKET.maxOpenListings) throw new ApiError(409, 'listing_cap', `At most ${MARKET.maxOpenListings} open listings`);
    if (body.kind === 'consumable') throw new ApiError(409, 'none_left', `You do not have ${qty} ${CONSUMABLES[body.ref as ConsumableId].name.toLowerCase()}`);
    throw e;
  }
  const names = await playerNames(pc.db, [pc.pid]);
  return c.json({ listing: listingView(listing, pc.pid, names, pc.now) });
});

// ------------------------------------------------------------------ buy & cancel

const IdBody = z.object({ listingId: z.string().regex(/^[0-9a-f]{24}$/) });

async function loadListing(d: D1Database, id: string): Promise<ListingRow> {
  const l = await d.prepare('SELECT * FROM market_listings WHERE id = ?1').bind(id).first<ListingRow>();
  if (!l) throw new ApiError(404, 'not_found', 'No such listing');
  return l;
}

function closedError(l: ListingRow, now: number): ApiError {
  if (l.status === 'sold') return new ApiError(409, 'sold', 'Someone bought it first');
  if (l.status === 'expired' || (l.status === 'open' && l.expires_at <= now)) return new ApiError(410, 'expired', 'This listing expired');
  return new ApiError(409, 'gone', 'This listing was withdrawn');
}

market.post('/buy', async (c) => {
  limit(c, 'market_buy', 30);
  const pc = await player(c);
  const body = await readJson(c, IdBody, 1024);
  const l = await loadListing(pc.db, body.listingId);
  if (l.season_id !== pc.season.id || l.shard_id !== pc.shard.id) throw new ApiError(404, 'not_found', 'No such listing in your shard');
  if (l.seller_id === pc.pid) throw new ApiError(403, 'self_buy', 'You cannot buy your own listing');
  if (l.status !== 'open' || l.expires_at <= pc.now) throw closedError(l, pc.now);

  const fee = marketFee(l.price);
  const nonce = randomToken(8);
  const G = listingGuard(l.id, nonce);
  const funds =
    l.currency === 'drachmae' ? `${balanceSql('?2')} >= ?5` : 'EXISTS (SELECT 1 FROM online_profiles WHERE season_id = ?6 AND player_id = ?2 AND gold >= ?5)';
  const stmts: D1PreparedStatement[] = [
    ensureWallet(pc.db, pc.pid, pc.now),
    ensureWallet(pc.db, l.seller_id, pc.now),
    pc.db
      .prepare(
        `UPDATE market_listings SET status = 'sold', buyer_id = ?2, fee = ?3, nonce = ?4, closed_at = ?7
         WHERE id = ?1 AND status = 'open' AND expires_at > ?7 AND seller_id <> ?2 AND price = ?5 AND season_id = ?6 AND ${funds}`,
      )
      .bind(l.id, pc.pid, fee, nonce, l.price, l.season_id, pc.now),
  ];
  if (l.currency === 'drachmae') {
    stmts.push(...walletMove(pc.db, pc.pid, -l.price, 'market_buy', l.id, G, pc.now));
    stmts.push(...walletMove(pc.db, l.seller_id, l.price - fee, 'market_sale', l.id, G, pc.now));
  } else {
    stmts.push(
      pc.db.prepare(`UPDATE online_profiles SET gold = gold - ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`).bind(l.season_id, pc.pid, l.price, pc.now),
      pc.db.prepare(`UPDATE online_profiles SET gold = gold + ?3, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${G}`).bind(l.season_id, l.seller_id, l.price - fee, pc.now),
    );
  }
  stmts.push(...giveGoods(pc.db, l, pc.pid, G, pc.now), audit(pc.db, l, pc.pid, 'buy', G, pc.now, fee, { seller: l.seller_id, sellerGets: l.price - fee }));
  const res = await pc.db.batch(stmts);
  if (res[2].meta.changes !== 1) {
    const now = await loadListing(pc.db, l.id);
    if (now.status !== 'open' || now.expires_at <= pc.now) throw closedError(now, pc.now);
    throw new ApiError(409, 'insufficient_funds', l.currency === 'drachmae' ? 'Not enough Drachmae' : 'Not enough gold', { price: l.price, currency: l.currency });
  }
  const names = await playerNames(pc.db, [l.seller_id]);
  later(c, notify(c.env, [ev(l.seller_id, 'market_sold', `sold:${l.id}`, { what: goodsName(l), price: l.price, currency: l.currency, gets: l.price - fee })], { shard: pc.shard }));
  return c.json({ listing: listingView({ ...l, status: 'sold', buyer_id: pc.pid, fee, closed_at: pc.now }, pc.pid, names, pc.now), paid: l.price, fee, sellerGets: l.price - fee });
});

market.post('/cancel', async (c) => {
  limit(c, 'market_cancel', 30);
  const pc = await player(c);
  const body = await readJson(c, IdBody, 1024);
  const l = await loadListing(pc.db, body.listingId);
  if (l.seller_id !== pc.pid) throw new ApiError(403, 'forbidden', 'Not your listing');
  if (l.status !== 'open') throw closedError(l, pc.now);
  const nonce = randomToken(8);
  const G = listingGuard(l.id, nonce);
  const res = await pc.db.batch([
    pc.db.prepare("UPDATE market_listings SET status = 'cancelled', nonce = ?3, closed_at = ?4 WHERE id = ?1 AND seller_id = ?2 AND status = 'open'").bind(l.id, pc.pid, nonce, pc.now),
    ...returnGoods(pc.db, l, G, pc.now),
    audit(pc.db, l, pc.pid, 'cancel', G, pc.now),
  ]);
  if (res[0].meta.changes !== 1) throw closedError(await loadListing(pc.db, l.id), pc.now);
  return c.json({ ok: true, returned: { kind: l.kind, ref: l.ref, qty: l.qty } });
});
