/**
 * Holders in D1 (M6e; docs/WAR.md "Trade", "Goods live in places"; migrations/0029_war_holders.sql). The places the
 * server keeps goods and items in: a player's home strongroom (never lootable), an alliance's strongbox at home, a town
 * holder's tax strongbox, rented stalls and warehouses, escrows. Region rooms keep their own holders (stores, chests,
 * carts, packs, piles) in their state; ./cargo.ts moves goods across.
 *
 *  - Goods are lots (good, origin, seal, amount). Takes go oldest origin first (by name: deterministic) and plan the
 *    exact rows they draw; the CHECK (amount >= 0) turns a race into a failed batch, so a payment is one atomic batch
 *    with whatever it buys.
 *  - Coin is a good like any other ("coin" lots; 200 a load). The game's own prices (training kit, ransom, respec,
 *    promotion) are coin from the strongroom.
 */
import type { Item } from '../../../src/data/items';
import { ApiError } from '../errors';

export type HolderKind = 'strongroom' | 'strongbox' | 'stall' | 'warehouse' | 'escrow';
export interface GoodLot { res: string; origin: string; seal: number; amount: number }
export type Goods = Record<string, number>;

/** Origin of goods the server grants (season start, refunds): the player's home. */
export const HOME = 'home';
const EPS = 1e-6;

export const strongroom = (pid: number) => `sr:${pid}`;
export const strongbox = (clan: number) => `sb:${clan}`;
export const taxBox = (town: string, alliance: number) => `tx:${town}:${alliance}`;

/** A holder row (INSERT OR IGNORE: an existing one keeps its state). */
export function ensureHolder(db: D1Database, id: string, kind: HolderKind, o: { pid?: number; clan?: number; town?: string; paidTo?: number } = {}, now = 0): D1PreparedStatement {
  return db
    .prepare('INSERT OR IGNORE INTO war_holders (id, kind, player_id, clan_id, town, paid_to, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, kind, o.pid ?? null, o.clan ?? null, o.town ?? null, o.paidTo ?? null, now);
}

export async function lotsOf(db: D1Database, holder: string): Promise<GoodLot[]> {
  return (await db.prepare('SELECT res, origin, seal, amount FROM war_goods WHERE place = ?1 AND amount > 0 ORDER BY res, origin, seal').bind(holder).all<GoodLot>()).results;
}

/** Totals by good (sealed lots included). */
export function totalsOf(lots: readonly GoodLot[]): Goods {
  const out: Goods = {};
  for (const l of lots) out[l.res] = round((out[l.res] ?? 0) + l.amount);
  return out;
}

export const round = (n: number) => Math.round(n * 1000) / 1000;

export async function goodsOf(db: D1Database, holder: string): Promise<Goods> {
  return totalsOf(await lotsOf(db, holder));
}

/** Put `n` of `res` (origin, seal) into holder. */
export function putStmt(db: D1Database, holder: string, res: string, n: number, origin = HOME, seal = 0): D1PreparedStatement {
  return db
    .prepare('INSERT INTO war_goods (place, res, origin, seal, amount) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (place, res, origin, seal) DO UPDATE SET amount = amount + ?5')
    .bind(holder, res, origin, seal, n);
}

/**
 * A statement that fails its batch (json() of a non-JSON string raises) unless `cond` (SQL, with the binds) holds:
 * a planned read is checked inside the batch, so the batch is all or nothing.
 */
export const guard = (db: D1Database, cond: string, ...binds: unknown[]): D1PreparedStatement =>
  db.prepare(`SELECT json(CASE WHEN ${cond} THEN '1' ELSE 'changed' END) AS ok`).bind(...binds);

/** Take a planned lot: the guard fails the batch when it is no longer there. */
function takeStmts(db: D1Database, holder: string, l: GoodLot): D1PreparedStatement[] {
  return [
    guard(db, 'coalesce((SELECT amount FROM war_goods WHERE place = ?1 AND res = ?2 AND origin = ?3 AND seal = ?4), 0) >= ?5 - 0.000001', holder, l.res, l.origin, l.seal, l.amount),
    db
      .prepare('UPDATE war_goods SET amount = CASE WHEN amount - ?5 < 0.000001 THEN 0 ELSE amount - ?5 END WHERE place = ?1 AND res = ?2 AND origin = ?3 AND seal = ?4')
      .bind(holder, l.res, l.origin, l.seal, l.amount),
  ];
}

/**
 * Plan taking `cost` (unsealed lots only, oldest origin name first) from `lots` of holder: the statements and the
 * lots taken; throws `no_<good>` when the holder lacks any of it.
 */
export function planTake(db: D1Database, holder: string, lots: readonly GoodLot[], cost: Goods, what = 'You'): { stmts: D1PreparedStatement[]; taken: GoodLot[] } {
  const stmts: D1PreparedStatement[] = [], taken: GoodLot[] = [];
  for (const [res, want] of Object.entries(cost)) {
    if (!(want > 0)) continue;
    let left = want;
    for (const l of lots) {
      if (l.res !== res || l.seal || left <= EPS) continue;
      const k = Math.min(l.amount, left);
      if (k <= EPS) continue;
      const t = { res, origin: l.origin, seal: 0, amount: k };
      stmts.push(...takeStmts(db, holder, t));
      taken.push(t);
      left -= k;
    }
    if (left > EPS) throw new ApiError(409, `no_${res}`, `${what} lack ${round(left)} ${res}`);
  }
  return { stmts, taken };
}

/** Move planned lots (taken from a holder) into another, keeping origin and seal. */
export function putLotsStmts(db: D1Database, holder: string, lots: readonly GoodLot[]): D1PreparedStatement[] {
  return lots.map((l) => putStmt(db, holder, l.res, l.amount, l.origin, l.seal));
}

/** A failed guard or CHECK: the batch's read is stale. */
export const isStale = (e: unknown) => /CHECK constraint failed|malformed JSON/.test(String(e));

/** Run a batch whose takes were planned on a read: a lot gone meanwhile (guard, CHECK) is a 409 to retry. */
export async function batch(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  if (!stmts.length) return;
  try {
    await db.batch(stmts);
  } catch (e) {
    if (isStale(e)) throw new ApiError(409, 'changed', 'Those goods moved meanwhile; try again');
    throw e;
  }
}

/** Pay `cost` from holder now (one batch with `with`); throws `no_<good>` when short. */
export async function pay(db: D1Database, holder: string, cost: Goods, with_: D1PreparedStatement[] = [], what = 'You'): Promise<GoodLot[]> {
  const plan = planTake(db, holder, await lotsOf(db, holder), cost, what);
  await batch(db, [...plan.stmts, ...with_]);
  return plan.taken;
}

/** M6e: a region room's player holders as saved (WarRoom.holdRows): the region's rows replaced in one batch. */
export async function saveRegionHolds(db: D1Database, region: string, rows: readonly { ref: string; kind: string; pid: number; team: number; goods: Record<string, number>; items: Item[] }[], now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM war_region_holds WHERE region = ?1').bind(region),
    ...rows.map((r) =>
      db
        .prepare('INSERT INTO war_region_holds (region, ref, kind, player_id, team, goods, items, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(region, r.ref, r.kind, r.pid, r.team, JSON.stringify(Object.fromEntries(Object.entries(r.goods).map(([k, v]) => [k, round(v)]))), JSON.stringify(r.items), now),
    ),
  ]);
}

// ---------------------------------------------------------------- items

const blank: Item = { uid: '', def: '', rarity: 'common', cond: 0 };
const parse = (s: string): Item => {
  try {
    return (JSON.parse(s) as Item) ?? blank;
  } catch {
    return blank;
  }
};

/** Items lying in holder (oldest first). */
export async function itemsIn(db: D1Database, holder: string): Promise<Item[]> {
  const rows = (await db.prepare('SELECT item FROM war_items WHERE place = ?1 ORDER BY created_at, uid').bind(holder).all<{ item: string }>()).results;
  return rows.map((r) => parse(r.item));
}

/** Put an item (a new row, or an existing one moved) in holder for player pid. */
export const placeItemStmt = (db: D1Database, pid: number, holder: string, item: Item, now: number): D1PreparedStatement =>
  db
    .prepare('INSERT INTO war_items (uid, player_id, item, created_at, place) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (uid) DO UPDATE SET player_id = ?2, item = ?3, place = ?5, region = NULL')
    .bind(item.uid, pid, JSON.stringify(item), now, holder);

/** Move items `uids` out of holder `from` into `to` (owner pid); throws when any is not there (and the batch fails if one went meanwhile). */
export async function moveItems(db: D1Database, from: string, to: string, pid: number, uids: readonly string[]): Promise<D1PreparedStatement[]> {
  if (!uids.length) return [];
  const list = JSON.stringify([...new Set(uids)]);
  const count = 'SELECT COUNT(*) FROM war_items WHERE place = ?1 AND uid IN (SELECT value FROM json_each(?2))';
  const n = (await db.prepare(`${count.replace('COUNT(*)', 'COUNT(*) AS n')}`).bind(from, list).first<{ n: number }>())?.n ?? 0;
  if (n !== new Set(uids).size) throw new ApiError(409, 'no_item', 'An item is not there');
  return [
    guard(db, `(${count}) = ?3`, from, list, n),
    db.prepare('UPDATE war_items SET place = ?2, player_id = ?3 WHERE place = ?1 AND uid IN (SELECT value FROM json_each(?4))').bind(from, to, pid, list),
  ];
}
