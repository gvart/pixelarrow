/**
 * Market towns (M6f; docs/WAR.md "Trade towns", "Stalls, offers and the board"; W-44: the game buys and sells nothing,
 * every price is a player's). Tables: war_holders / war_goods (sites), war_offers, war_fills (migrations/0030).
 *
 *  - Sites: in a market town (the four frontier towns, Omphalos's Great Fair, an alliance's home agora) a player rents
 *    one stall and one warehouse (`st:<town>:<pid>`, `wh:<town>:<pid>`), up to the town's count of each. Rent is coin a
 *    day to the town's holder (the alliance that holds the region): the first day from the home strongroom, then
 *    lazily from the site's own coin (else the strongroom). Three days unpaid: locked (no offers, fills or fetching),
 *    never confiscated. An unheld town and a home agora charge nothing; at home the warehouse is the strongroom.
 *  - Offers: a sell offer escrows goods (or one item) out of the seller's stall into `of:<id>`; a buy order escrows
 *    its coin. Cancelled: all of it back to the stall. Open offers per stall: STALL.offers[level] (L1 4, L2 8, L3 12)
 *    and, with the Trader node, STALL.standing more standing offers, which re-arm from the stall when filled out.
 *  - Fill: the taker (with men in the town) takes n of an offer: goods into the buyer's warehouse, coin (less the
 *    holder's tax) into the seller's stall, tax into the holder's tax strongbox; one D1 batch led by the war_fills row
 *    keyed by the taker's key, so a retried fill changes nothing and returns the first.
 *  - Board: per good the best ask, best bid, depth each side and the last 10 fills, from player offers only.
 */
import { heldNodes } from '../../../src/data/professions';
import { CARRY } from '../../../src/war/sim/economy';
import { ITEMS_PER_LOAD } from '../../../src/war/sim/holders';
import { ALLIANCES } from '../../../src/war/world/alliances';
import { FRONTIER_TOWNS, OMPHALOS } from '../../../src/war/world/season';
import { ApiError } from '../errors';
import { batch, ensureHolder, guard, isStale, lotsOf, moveItems, planTake, putLotsStmts, putStmt, round, strongroom, taxBox, totalsOf, type GoodLot } from './holders';
import { json } from './persons';

const DAY = 86_400_000;
const EPS = 1e-6;

export interface Town { rent: number; tax: number; stalls: number; warehouses: number; safe: boolean; home: number | null }
/** Market towns: rent (coin a day a site), tax (share of a fill), sites, a safe court, the alliance whose home agora it is. */
export function townOf(id: string): Town | null {
  if (FRONTIER_TOWNS.includes(id)) return { rent: 10, tax: 0.05, stalls: 6, warehouses: 6, safe: true, home: null };
  if (id === OMPHALOS) return { rent: 20, tax: 0.08, stalls: 10, warehouses: 4, safe: false, home: null };
  const a = ALLIANCES.find((x) => x.home === id);
  if (a) return { rent: 0, tax: 0, stalls: 12, warehouses: 0, safe: false, home: a.id };
  return null;
}

export const STALL = { offers: [0, 4, 8, 12], standing: 2, upgrade: [{}, {}, { coin: 200 }, { coin: 400, silver: 10 }] as Record<string, number>[] };
/** A warehouse's size in loads; days unpaid before a site locks. */
export const SITE = { loads: 20, lockDays: 3 };

export type SiteKind = 'stall' | 'warehouse';
export const stallId = (town: string, pid: number) => `st:${town}:${pid}`;
export const warehouseId = (town: string, pid: number) => `wh:${town}:${pid}`;
export const escrowId = (offer: number) => `of:${offer}`;

/** Where goods bought in `town` go: the warehouse (at home: the strongroom). */
export const intoOf = (town: string, pid: number) => (townOf(town)?.home !== null ? strongroom(pid) : warehouseId(town, pid));

const mustTown = (town: string): Town => {
  const t = townOf(town);
  if (!t) throw new ApiError(404, 'not_market', `${town} is no market town`);
  return t;
};

interface SiteRow { id: string; kind: SiteKind; player_id: number; town: string; level: number; paid_to: number | null }

/**
 * Rent a stall or warehouse in `town` for the first day (from the home strongroom, to the holder `holder`, -1: none).
 * One of each a player a town, up to the town's count.
 */
export async function rentSite(db: D1Database, pid: number, town: string, kind: SiteKind, holder: number, now: number): Promise<string> {
  const t = mustTown(town);
  if (kind === 'warehouse' && t.home !== null) throw new ApiError(409, 'no_warehouse', 'At home your goods are in your strongroom');
  const id = kind === 'stall' ? stallId(town, pid) : warehouseId(town, pid);
  if (await db.prepare('SELECT 1 FROM war_holders WHERE id = ?1').bind(id).first()) throw new ApiError(409, 'rented', `You rent a ${kind} here already`);
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM war_holders WHERE town = ?1 AND kind = ?2').bind(town, kind).first<{ n: number }>())?.n ?? 0;
  if (n >= (kind === 'stall' ? t.stalls : t.warehouses)) throw new ApiError(409, 'no_site', `Every ${kind} in ${town} is taken`);
  const rent = holder >= 0 && t.home === null ? t.rent : 0;
  const plan = planTake(db, strongroom(pid), await lotsOf(db, strongroom(pid)), rent ? { coin: rent } : {});
  await batch(db, [...plan.stmts, ...(rent ? [putStmt(db, taxBox(town, holder), 'coin', rent)] : []), ensureHolder(db, id, kind, { pid, town, paidTo: now + DAY }, now)]);
  return id;
}

/**
 * Rent of a site settled up to `now`: each whole day due is paid from the site's coin, else the strongroom, to the
 * holder; an unheld town (or a home agora) charges nothing. Returns whether it is locked (SITE.lockDays unpaid).
 */
export async function settleRent(db: D1Database, site: SiteRow, holder: number, now: number): Promise<boolean> {
  const t = mustTown(site.town);
  let paid = site.paid_to ?? now;
  if (holder < 0 || t.home !== null || t.rent <= 0) {
    if (paid < now) await db.prepare('UPDATE war_holders SET paid_to = ?2 WHERE id = ?1').bind(site.id, now).run();
    return false;
  }
  while (paid < now) {
    let ok = false;
    for (const from of [site.id, strongroom(site.player_id)]) {
      try {
        const plan = planTake(db, from, await lotsOf(db, from), { coin: t.rent });
        await batch(db, [...plan.stmts, putStmt(db, taxBox(site.town, holder), 'coin', t.rent), db.prepare('UPDATE war_holders SET paid_to = ?2 WHERE id = ?1 AND paid_to = ?3').bind(site.id, paid + DAY, paid)]);
        ok = true;
        break;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
    }
    if (!ok) break;
    paid += DAY;
  }
  return now - paid > SITE.lockDays * DAY;
}

/** The player's open site of `kind` in town (rent settled); throws when he rents none or it is locked. */
export async function site(db: D1Database, pid: number, town: string, kind: SiteKind, holder: number, now: number): Promise<SiteRow> {
  mustTown(town);
  const id = kind === 'stall' ? stallId(town, pid) : intoOf(town, pid);
  if (id.startsWith('sr:')) return { id, kind, player_id: pid, town, level: 1, paid_to: null };
  const row = await db.prepare('SELECT id, kind, player_id, town, level, paid_to FROM war_holders WHERE id = ?1').bind(id).first<SiteRow>();
  if (!row) throw new ApiError(409, `no_${kind}`, `You rent no ${kind} in ${town}`);
  if (await settleRent(db, row, holder, now)) throw new ApiError(409, 'locked', `Your ${kind} in ${town} is locked: its rent is unpaid`);
  return row;
}

/** Loads a holder fills (goods and items). */
export async function loadsIn(db: D1Database, holder: string): Promise<number> {
  const g = totalsOf(await lotsOf(db, holder));
  const items = (await db.prepare('SELECT COUNT(*) AS n FROM war_items WHERE place = ?1').bind(holder).first<{ n: number }>())?.n ?? 0;
  return Object.values(g).reduce((a, n) => a + n, 0) / CARRY + items / ITEMS_PER_LOAD;
}

/** Upgrade the player's stall in town to the next level (STALL.upgrade, paid from the stall). */
export async function upgradeStall(db: D1Database, pid: number, town: string, holder: number, now: number): Promise<number> {
  const s = await site(db, pid, town, 'stall', holder, now);
  if (s.level >= 3) throw new ApiError(409, 'max_level', 'The stall is at its best');
  const cost = STALL.upgrade[s.level + 1];
  const plan = planTake(db, s.id, await lotsOf(db, s.id), cost, 'Your stall');
  await batch(db, [...plan.stmts, db.prepare('UPDATE war_holders SET level = ?2 WHERE id = ?1 AND level = ?3').bind(s.id, s.level + 1, s.level)]);
  return s.level + 1;
}

export interface OfferIn { side: 'sell' | 'buy'; res?: string; uid?: string; n: number; price: number; standing?: boolean }
interface OfferRow { id: number; town: string; player_id: number; side: 'sell' | 'buy'; res: string | null; item_uid: string | null; n: number; left: number; price: number; standing: number; state: string }

/** Does the player have a merchant with this node (perks)? */
async function hasNode(db: D1Database, pid: number, node: string): Promise<boolean> {
  const rows = (await db.prepare("SELECT perks FROM war_persons WHERE player_id = ?1 AND cls = 'merchant' AND state NOT IN ('dead', 'retired')").bind(pid).all<{ perks: string }>()).results;
  return rows.some((r) => heldNodes('merchant', json<string[]>(r.perks, [])).has(node));
}

/** The escrow of an offer: a sell's goods or item, a buy's coin. */
function escrowOf(o: { side: 'sell' | 'buy'; res?: string | null; n: number; price: number }): Record<string, number> {
  return o.side === 'buy' ? { coin: o.n * o.price } : o.res ? { [o.res]: o.n } : {};
}

/** List an offer at the player's stall in town; its escrow leaves the stall. Returns the offer id. */
export async function listOffer(db: D1Database, pid: number, town: string, o: OfferIn, holder: number, now: number): Promise<number> {
  const s = await site(db, pid, town, 'stall', holder, now);
  if (!!o.res === !!o.uid || (o.uid && (o.side !== 'sell' || o.n !== 1))) throw new ApiError(400, 'bad_request', 'A good and an amount, or one item to sell');
  if (o.res === 'coin') throw new ApiError(400, 'bad_request', 'Coin is the price, not the ware');
  const open = (await db.prepare("SELECT standing, COUNT(*) AS n FROM war_offers WHERE town = ?1 AND player_id = ?2 AND state = 'open' GROUP BY standing").bind(town, pid).all<{ standing: number; n: number }>()).results;
  const count = (st: number) => open.find((r) => r.standing === st)?.n ?? 0;
  if (o.standing) {
    if (!(await hasNode(db, pid, 'trader'))) throw new ApiError(409, 'no_trader', 'Standing offers need a merchant with the Trader node');
    if (count(1) >= STALL.standing) throw new ApiError(409, 'offers_full', `At most ${STALL.standing} standing offers`);
  } else if (count(0) >= STALL.offers[s.level]) throw new ApiError(409, 'offers_full', `A level ${s.level} stall holds ${STALL.offers[s.level]} offers`);
  const id = (await db
    .prepare("INSERT INTO war_offers (town, player_id, side, res, item_uid, n, left, price, standing, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, 'cancelled', ?9, ?9) RETURNING id")
    .bind(town, pid, o.side, o.res ?? null, o.uid ?? null, o.n, o.price, o.standing ? 1 : 0, now)
    .first<{ id: number }>())!.id;
  const plan = planTake(db, s.id, await lotsOf(db, s.id), escrowOf(o), 'Your stall');
  await batch(db, [
    ...plan.stmts, ...putLotsStmts(db, escrowId(id), plan.taken),
    ...(o.uid ? await moveItems(db, s.id, escrowId(id), pid, [o.uid]) : []),
    db.prepare("UPDATE war_offers SET state = 'open' WHERE id = ?1").bind(id),
  ]);
  return id;
}

async function offer(db: D1Database, id: number): Promise<OfferRow> {
  const o = await db.prepare('SELECT id, town, player_id, side, res, item_uid, n, left, price, standing, state FROM war_offers WHERE id = ?1').bind(id).first<OfferRow>();
  if (!o) throw new ApiError(404, 'not_found', 'No such offer');
  return o;
}

/** Cancel the player's open offer: its escrow goes back to his stall. */
export async function cancelOffer(db: D1Database, pid: number, id: number, now: number): Promise<void> {
  const o = await offer(db, id);
  if (o.player_id !== pid) throw new ApiError(403, 'not_yours', 'Not your offer');
  if (o.state !== 'open') throw new ApiError(409, 'closed', `The offer is ${o.state}`);
  const esc = escrowId(id), lots = await lotsOf(db, esc);
  const all = totalsOf(lots);
  const plan = planTake(db, esc, lots, all);
  await batch(db, [
    db.prepare("UPDATE war_offers SET state = 'cancelled', updated_at = ?2 WHERE id = ?1 AND state = 'open'").bind(id, now),
    guard(db, "(SELECT state FROM war_offers WHERE id = ?1) = 'cancelled'", id),
    ...plan.stmts, ...putLotsStmts(db, stallId(o.town, pid), plan.taken),
    ...(o.item_uid && o.left > EPS ? await moveItems(db, esc, stallId(o.town, pid), pid, [o.item_uid]) : []),
  ]);
}

/** Is the player present in town (men of his deployed there)? */
export async function presentIn(db: D1Database, pid: number, town: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 FROM war_persons WHERE player_id = ?1 AND region = ?2 AND state IN ('active', 'reserve') LIMIT 1").bind(pid, town).first());
}

export interface FillResult { id: string; offer: number; n: number; price: number; tax: number; seller: number; buyer: number; score: number }
/** Extra statements and the trade score of a fill (M6h; M6i checks), given the goods moved. */
export type FillHook = (f: { town: string; seller: number; buyer: number; lots: GoodLot[]; coin: number; now: number }) => Promise<{ score: number; stmts: D1PreparedStatement[] }>;

/**
 * Take n of offer `id` (the taker `pid`, present in its town): a sell offer is bought, a buy order is sold into. One
 * batch led by the war_fills row `<pid>:<key>`: a retried fill returns the first and changes nothing.
 */
export async function fill(db: D1Database, pid: number, id: number, n: number, key: string, holder: number, now: number, hook?: FillHook): Promise<FillResult> {
  const fid = `${pid}:${key}`;
  const done = async () => {
    const f = await db.prepare('SELECT id, offer_id, n, price, tax, seller, buyer, score FROM war_fills WHERE id = ?1').bind(fid).first<{ id: string; offer_id: number; n: number; price: number; tax: number; seller: number; buyer: number; score: number }>();
    return f ? { id: f.id, offer: f.offer_id, n: f.n, price: f.price, tax: f.tax, seller: f.seller, buyer: f.buyer, score: f.score } : null;
  };
  const again = await done();
  if (again) return again;
  const o = await offer(db, id);
  if (o.state !== 'open') throw new ApiError(409, 'closed', `The offer is ${o.state}`);
  if (o.player_id === pid) throw new ApiError(409, 'own_offer', 'Your own offer');
  if (o.item_uid) n = 1;
  if (!(n > EPS) || n > o.left + EPS) throw new ApiError(409, 'too_many', `${round(o.left)} left`);
  if (!(await presentIn(db, pid, o.town))) throw new ApiError(409, 'not_present', `Your men must be in ${o.town}`);
  const t = mustTown(o.town);
  const seller = o.side === 'sell' ? o.player_id : pid, buyer = o.side === 'sell' ? pid : o.player_id;
  const total = n * o.price, ally = holder >= 0 && t.home === null ? holder : -1, tax = ally >= 0 ? round(total * t.tax) : 0;
  const into = intoOf(o.town, buyer), esc = escrowId(id);
  if (o.side === 'sell') await site(db, buyer, o.town, 'warehouse', holder, now);
  else if (!into.startsWith('sr:') && !(await db.prepare('SELECT 1 FROM war_holders WHERE id = ?1').bind(into).first())) throw new ApiError(409, 'no_warehouse', 'The buyer has no warehouse here');
  const sellerStall = await site(db, seller, o.town, 'stall', holder, now).catch((e) => {
    if (o.side === 'sell') return { id: stallId(o.town, seller) } as SiteRow; // his stall is locked: the coin still lands there
    throw e;
  });
  const goods: Record<string, number> = o.res ? { [o.res]: n } : {};
  if (o.res && (await loadsIn(db, into)) + n / CARRY > SITE.loads + EPS && !into.startsWith('sr:')) throw new ApiError(409, 'warehouse_full', `A warehouse holds ${SITE.loads} loads`);
  const stmts: D1PreparedStatement[] = [];
  let moved: GoodLot[] = [];
  if (o.side === 'sell') {
    // the buyer pays from his warehouse, then his stall; the escrowed goods go to his warehouse
    let left = total;
    for (const from of [into, stallId(o.town, buyer)]) {
      if (left <= EPS) break;
      const lots = await lotsOf(db, from), have = totalsOf(lots).coin ?? 0, k = Math.min(have, left);
      if (k > EPS) stmts.push(...planTake(db, from, lots, { coin: k }).stmts);
      left -= k;
    }
    if (left > EPS) throw new ApiError(409, 'no_coin', `It costs ${total} coin, in your warehouse or stall here`);
    const g = planTake(db, esc, await lotsOf(db, esc), goods);
    moved = g.taken;
    stmts.push(...g.stmts, ...putLotsStmts(db, into, g.taken));
    if (o.item_uid) stmts.push(...(await moveItems(db, esc, into, buyer, [o.item_uid])));
  } else {
    // the seller delivers from his stall, then his warehouse; the escrowed coin pays him
    let left = n;
    for (const from of [sellerStall.id, warehouseId(o.town, pid)]) {
      if (left <= EPS) break;
      const lots = await lotsOf(db, from), have = lots.filter((l) => l.res === o.res && !l.seal).reduce((a, l) => a + l.amount, 0), k = Math.min(have, left);
      if (k <= EPS) continue;
      const g = planTake(db, from, lots, { [o.res!]: k });
      moved.push(...g.taken);
      stmts.push(...g.stmts, ...putLotsStmts(db, into, g.taken));
      left -= k;
    }
    if (left > EPS) throw new ApiError(409, `no_${o.res}`, `You lack ${round(left)} ${o.res} in your stall or warehouse here`);
    stmts.push(...planTake(db, esc, await lotsOf(db, esc), { coin: total }).stmts);
  }
  stmts.push(putStmt(db, sellerStall.id, 'coin', total - tax));
  if (tax > 0) stmts.push(putStmt(db, taxBox(o.town, ally), 'coin', tax));
  const extra = hook ? await hook({ town: o.town, seller, buyer, lots: moved, coin: total, now }) : { score: 0, stmts: [] };
  const left = o.left - n <= EPS ? 0 : o.left - n;
  try {
    await db.batch([
      db.prepare('INSERT INTO war_fills (id, offer_id, town, res, item_uid, n, price, tax, seller, buyer, ally, score, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)')
        .bind(fid, id, o.town, o.res, o.item_uid, n, o.price, tax, seller, buyer, ally >= 0 ? ally : null, extra.score, now),
      guard(db, "(SELECT left FROM war_offers WHERE id = ?1 AND state = 'open') >= ?2 - 0.000001", id, n),
      db.prepare("UPDATE war_offers SET left = ?2, state = CASE WHEN ?2 <= 0 THEN 'done' ELSE 'open' END, updated_at = ?3 WHERE id = ?1").bind(id, left, now),
      ...stmts, ...extra.stmts,
    ]);
  } catch (e) {
    if (/UNIQUE constraint failed: war_fills\.id/.test(String(e))) return (await done())!;
    if (isStale(e)) throw new ApiError(409, 'changed', 'The offer or your goods changed meanwhile; try again');
    throw e;
  }
  if (left <= 0 && o.standing) await rearm(db, o, now).catch(() => undefined);
  return { id: fid, offer: id, n, price: o.price, tax, seller, buyer, score: extra.score };
}

/** A standing offer filled out lists itself again from its owner's stall, as far as the stall still has its escrow. */
async function rearm(db: D1Database, o: OfferRow, now: number): Promise<void> {
  const s = stallId(o.town, o.player_id), lots = await lotsOf(db, s), have = totalsOf(lots);
  const n = o.side === 'buy' ? Math.min(o.n, Math.floor((have.coin ?? 0) / o.price)) : Math.min(o.n, have[o.res!] ?? 0);
  if (!(n > EPS) || o.item_uid) return;
  const plan = planTake(db, s, lots, escrowOf({ side: o.side, res: o.res, n, price: o.price }));
  await batch(db, [...plan.stmts, ...putLotsStmts(db, escrowId(o.id), plan.taken), db.prepare("UPDATE war_offers SET left = ?2, n = ?2, state = 'open', updated_at = ?3 WHERE id = ?1 AND state = 'done'").bind(o.id, n, now)]);
}

export interface Board { town: string; goods: Record<string, { ask: number | null; bid: number | null; askDepth: number; bidDepth: number }>; items: { offer: number; uid: string; price: number }[]; fills: { res: string | null; n: number; price: number; at: number }[] }

/** The town's price board: from open player offers and the last 10 fills, nothing else. */
export async function board(db: D1Database, town: string): Promise<Board> {
  mustTown(town);
  const [offers, fills] = await Promise.all([
    db.prepare("SELECT id, side, res, item_uid, left, price FROM war_offers WHERE town = ?1 AND state = 'open'").bind(town).all<{ id: number; side: 'sell' | 'buy'; res: string | null; item_uid: string | null; left: number; price: number }>(),
    db.prepare('SELECT res, n, price, at FROM war_fills WHERE town = ?1 ORDER BY at DESC, id DESC LIMIT 10').bind(town).all<{ res: string | null; n: number; price: number; at: number }>(),
  ]);
  const goods: Board['goods'] = {}, items: Board['items'] = [];
  for (const o of offers.results) {
    if (o.item_uid) {
      items.push({ offer: o.id, uid: o.item_uid, price: o.price });
      continue;
    }
    const g = (goods[o.res!] ??= { ask: null, bid: null, askDepth: 0, bidDepth: 0 });
    if (o.side === 'sell') (g.ask = g.ask === null ? o.price : Math.min(g.ask, o.price)), (g.askDepth = round(g.askDepth + o.left));
    else (g.bid = g.bid === null ? o.price : Math.max(g.bid, o.price)), (g.bidDepth = round(g.bidDepth + o.left));
  }
  return { town, goods, items, fills: fills.results };
}

/** The player's sites, offers and what each site holds in town. */
export async function mySites(db: D1Database, pid: number, town: string) {
  mustTown(town);
  const ids = [stallId(town, pid), intoOf(town, pid)];
  const sites = await Promise.all(ids.map(async (id) => ({ id, row: await db.prepare('SELECT kind, level, paid_to FROM war_holders WHERE id = ?1').bind(id).first<{ kind: string; level: number; paid_to: number | null }>(), goods: totalsOf(await lotsOf(db, id)) })));
  const offers = (await db.prepare("SELECT id, side, res, item_uid, n, left, price, standing FROM war_offers WHERE town = ?1 AND player_id = ?2 AND state = 'open' ORDER BY id").bind(town, pid).all()).results;
  return { sites: sites.filter((s) => s.row).map((s) => ({ id: s.id, ...s.row!, goods: s.goods })), offers };
}
