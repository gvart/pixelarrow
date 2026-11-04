/**
 * W-140..W-143 an NPC town's books in D1 (the rules: src/war/net/npcMarket.ts; docs/WAR.md "NPC towns"; tables:
 * migrations/0056). Each read settles what time has done: stock drifts back to par, the purse mints its silver. Every
 * deal writes the settled state with a guard on what was read, so a deal on a stale read fails its batch and is tried
 * again. The goods and coin themselves are his men's: the region room takes them out of packs and carts (./regionDO.ts npc).
 */
import { NPC, NPC_CARTS, NPC_HIRE } from '../../../src/data/warNpcTowns';
import { buyable, costOf, npcDay, npcGoods, npcRuleNow, npcShown, payFor, purseAfter, sellable, stockAfter, type NpcView } from '../../../src/war/net/npcMarket';
import type { NpcMsg, ServerMsg } from '../../../src/war/net/protocol';
import { perLoad } from '../../../src/war/sim/holders';
import { makePerson } from '../../../src/war/sim/roster';
import { homeOf, isWorldRegion } from '../../../src/war/world/graph';
import { cartCap, workerCap } from '../../../src/war/world/start';
import type { Env } from '../env';
import { ApiError } from '../errors';
import { fill, room as freeLoads, takeOut, type Bundle, type Slot } from './cargo';
import { cappedStmts, FAVOUR_EARN } from './favour';
import { batch, ensureHolder, goodsOf, guard, HOME, lotsOf, planTake, putStmt, strongroom } from './holders';
import { tributeCut, tributePlace } from './oaths';
import { statStmt } from './peace';
import { claimForJoin, IN_ARMY, insertPerson, joinCheck, joinError, nameFor, newId, WORKER } from './persons';
import type { WarRoom } from './room';
import { pathOf } from './start';
import { tallyStmt } from './tasks';
import { allianceOf } from './world/members';

interface Purse { purse: number; read: number | null; day: number; minted: number }

/** The town's purse as it stands now (first touch of the season: NPC.purse.start). */
async function purseOf(db: D1Database, town: string, now: number): Promise<Purse> {
  const r = await db.prepare('SELECT purse, minted_day, minted FROM war_npc_towns WHERE town = ?1').bind(town).first<{ purse: number; minted_day: number; minted: number }>();
  const today = npcDay(now);
  if (!r) return { purse: NPC.purse.start, read: null, day: today, minted: 0 };
  const purse = purseAfter(r.purse, today - r.minted_day);
  return { purse, read: r.purse, day: today, minted: r.minted + purse - r.purse };
}

/** The stock of each good it deals in, now. */
async function stocksOf(db: D1Database, town: string, now: number): Promise<Map<string, { stock: number; read: number | null }>> {
  const rows = (await db.prepare('SELECT res, stock, at FROM war_npc_stock WHERE town = ?1').bind(town).all<{ res: string; stock: number; at: number }>()).results;
  const by = new Map(rows.map((r) => [r.res, r])), out = new Map<string, { stock: number; read: number | null }>();
  for (const g of npcGoods(town)) {
    const r = by.get(g.res);
    out.set(g.res, r ? { stock: stockAfter(r.stock, g.par, now - r.at), read: r.stock } : { stock: g.par, read: null });
  }
  return out;
}

/** The purse written back at `coin`, only if it still stands as read. */
function purseStmts(db: D1Database, town: string, p: Purse, coin: number): D1PreparedStatement[] {
  return [
    ...(p.read === null
      ? [guard(db, 'NOT EXISTS (SELECT 1 FROM war_npc_towns WHERE town = ?1)', town)]
      : [guard(db, '(SELECT purse FROM war_npc_towns WHERE town = ?1) = ?2', town, p.read)]),
    db.prepare('INSERT INTO war_npc_towns (town, purse, minted_day, minted) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (town) DO UPDATE SET purse = ?2, minted_day = ?3, minted = ?4').bind(town, coin, p.day, p.minted),
  ];
}

/** The stock written back at `stock`, only if it still stands as read. */
function stockStmts(db: D1Database, town: string, res: string, read: number | null, stock: number, now: number): D1PreparedStatement[] {
  return [
    read === null
      ? guard(db, 'NOT EXISTS (SELECT 1 FROM war_npc_stock WHERE town = ?1 AND res = ?2)', town, res)
      : guard(db, '(SELECT stock FROM war_npc_stock WHERE town = ?1 AND res = ?2) = ?3', town, res, read),
    db.prepare('INSERT INTO war_npc_stock (town, res, stock, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (town, res) DO UPDATE SET stock = ?3, at = ?4').bind(town, res, stock, now),
  ];
}

/** What the town shows now. */
export async function npcView(db: D1Database, town: string, now: number): Promise<NpcView> {
  const goods = npcGoods(town);
  if (!goods.length) throw new ApiError(404, 'no_town', `${town} is no town`);
  const [p, st] = await Promise.all([purseOf(db, town, now), stocksOf(db, town, now)]);
  return npcShown(town, Math.floor(p.purse), (res) => st.get(res)!.stock, p.purse, now);
}

export interface NpcDeal { n: number; coin: number; stmts: D1PreparedStatement[] }

const ruleOf = (town: string, res: string, now: number) => {
  const g = npcRuleNow(town, res, now);
  if (!g) throw new ApiError(409, 'not_traded', `This town does not deal in ${res}`);
  return g;
};

/** The town buys up to `want` of `res` as far as its purse pays: how many, for how much, and its books' statements. */
export async function planSell(db: D1Database, town: string, res: string, want: number, now: number): Promise<NpcDeal> {
  const g = ruleOf(town, res, now), [p, st] = await Promise.all([purseOf(db, town, now), stocksOf(db, town, now)]), s = st.get(res)!;
  const n = sellable(g, s.stock, want, p.purse), coin = payFor(g, s.stock, n, p.purse);
  if (!(n > 0) || !(coin > 0)) throw new ApiError(409, 'purse_empty', 'The town has no coin left to pay you');
  return { n, coin, stmts: [...purseStmts(db, town, p, p.purse - coin), ...stockStmts(db, town, res, s.read, s.stock + n, now)] };
}

/** The town sells up to `want` of `res` as far as its stock and `have` coin go. */
export async function planBuy(db: D1Database, town: string, res: string, want: number, have: number, now: number): Promise<NpcDeal> {
  const g = ruleOf(town, res, now), [p, st] = await Promise.all([purseOf(db, town, now), stocksOf(db, town, now)]), s = st.get(res)!;
  const n = buyable(g, s.stock, want, have), coin = costOf(g, s.stock, n);
  if (!(n > 0)) throw new ApiError(409, s.stock < 0.01 ? 'sold_out' : 'no_coin', s.stock < 0.01 ? 'The town has none left' : 'You carry too little coin');
  return { n, coin, stmts: [...purseStmts(db, town, p, p.purse + coin), ...stockStmts(db, town, res, s.read, s.stock - n, now)] };
}

/** `coin` paid into the town's purse (a hired man, a cart). */
export async function planPay(db: D1Database, town: string, coin: number, now: number): Promise<D1PreparedStatement[]> {
  const p = await purseOf(db, town, now);
  return purseStmts(db, town, p, p.purse + coin);
}

/**
 * W-187: a contract's pay out of the purse: never more than it holds. `pay` reads the purse as it stands now, so a thin purse
 * pays less; none left: nothing, and the books untouched.
 */
export async function planPayOut(db: D1Database, town: string, pay: (purse: number) => number, now: number): Promise<{ coin: number; stmts: D1PreparedStatement[] }> {
  const p = await purseOf(db, town, now), coin = Math.max(0, Math.min(p.purse, pay(p.purse)));
  return { coin, stmts: coin > 0 ? purseStmts(db, town, p, p.purse - coin) : [] };
}

/** W-185: a load that leaves or reaches the town under a contract: its stock moved, no coin. */
export async function planStock(db: D1Database, town: string, res: string, by: number, now: number): Promise<{ stock: number; stmts: D1PreparedStatement[] }> {
  const s = (await stocksOf(db, town, now)).get(res);
  if (!s) throw new ApiError(409, 'not_traded', `This town does not deal in ${res}`);
  if (s.stock + by < -1e-6) throw new ApiError(409, 'sold_out', 'The town has too little left to send');
  return { stock: s.stock, stmts: stockStmts(db, town, res, s.read, Math.max(0, s.stock + by), now) };
}

/** What the town has made itself so far (tests: the only coin it ever added to the world); its purse now. */
export async function npcBooks(db: D1Database, town: string, now: number): Promise<{ purse: number; minted: number }> {
  const p = await purseOf(db, town, now);
  return { purse: p.purse, minted: p.minted };
}

/** How much plain (unsealed) `res` the slots hold. */
const held = (slots: readonly Slot[], res: string) => slots.reduce((a, s) => a + s.hold.lots.filter((l) => l.r === res && l.s === undefined).reduce((b, l) => b + l.n, 0), 0);

/**
 * His coin for a deal, W-143: from the packs and carts standing at the town, and at home (his strongroom is there) from
 * it too. What came out of the packs, to put back if the batch fails.
 */
async function takeCoin(db: D1Database, slots: Slot[], coin: number, home: boolean, pid: number): Promise<{ stmts: D1PreparedStatement[]; taken: Bundle | null }> {
  const pack = Math.min(coin, held(slots, 'coin')), rest = coin - pack;
  if (rest > 1e-6 && !home) throw new ApiError(409, 'no_coin', `It costs ${coin} coin: your men carry ${Math.floor(pack)}`);
  const id = strongroom(pid), stmts = rest > 1e-6 ? planTake(db, id, await lotsOf(db, id), { coin: rest }, 'Your strongroom').stmts : [];
  return { stmts, taken: pack > 0 ? takeOut(slots, { coin: pack }) : null };
}

/** Is this his home (his strongroom's there)? A place off the world map counts, for tools. */
export async function isHomeOf(db: D1Database, pid: number, town: string): Promise<boolean> {
  const a = await allianceOf(db, pid);
  return !isWorldRegion(town) || (a !== null && homeOf(a) === town);
}

export interface NpcResult { done: Extract<ServerMsg, { t: 'npcDone' }>; welcome?: ServerMsg | null }

/**
 * A deal of `pid` with the town of `room`'s region, his men and carts standing there (W-87, W-88): goods out of their packs
 * and carts for coin from the purse, or back. Coin earned lands where the goods stood; at home in his strongroom. The
 * books and the player's side move in one batch; the room's side is put back if it fails.
 */
export async function npcDeal(env: Pick<Env, 'DB'>, room: WarRoom, pid: number, m: Omit<NpcMsg, 't'>, now: number): Promise<NpcResult> {
  const db = env.DB!, town = room.region.id;
  if (!npcGoods(town).length) throw new ApiError(404, 'no_town', 'There is no town here');
  const slots = room.npcSlots(pid);
  if (!slots.length) throw new ApiError(409, 'not_present', 'Your men must stand at the town');
  const home = await isHomeOf(db, pid, town);

  if (m.op === 'sell') {
    const res = m.res!, have = held(slots, res), want = Math.min(m.n ?? have, have);
    if (!(want > 1e-6)) throw new ApiError(409, 'no_goods', `Your men carry no ${res}`);
    const plan = await planSell(db, town, res, want, now), b = takeOut(slots, { [res]: plan.n })!;
    // W-111, W-147: only goods carried in from another land pay his level; a town's own goods sold back to it do not
    const far = b.lots.filter((l) => l.o !== town && !(home && l.o === HOME)).reduce((t, l) => t + l.n, 0), abroad = Math.floor((plan.coin * far) / plan.n);
    // W-153: a sale is sale income: his liege's part stays at this town under his name until someone's men fetch it (./regionDO.ts stowTribute)
    const cut = await tributeCut(db, pid, plan.coin), kept = plan.coin - cut;
    try {
      await batch(db, [
        ...plan.stmts, statStmt(db, pid, 'sold', plan.coin), ...(abroad > 0 ? [tallyStmt(db, pid, 'townSale', abroad, now), ...(await cappedStmts(db, pid, abroad * FAVOUR_EARN.sold, 'sold', now))] : []),
        ...(home ? [ensureHolder(db, strongroom(pid), 'strongroom', { pid }, now), putStmt(db, strongroom(pid), 'coin', kept, town)] : []),
        ...(cut > 0 ? [putStmt(db, tributePlace(town, pid), 'coin', cut)] : []),
      ]);
    } catch (e) {
      fill(slots.map((s) => ({ ...s, cap: Infinity })), b);
      throw e;
    }
    if (!home) npcGive(room, slots, { lots: [{ r: 'coin', n: kept, o: town }], items: [] });
    room.storyTrade(pid, 'sell', plan.coin, abroad);
    return { done: { t: 'npcDone', op: 'sell', coin: plan.coin, res, n: plan.n, ...(cut > 0 ? { tribute: cut } : {}) } };
  }

  if (m.op === 'buy') {
    const res = m.res!, roomFor = freeLoads(slots) * perLoad(res), want = Math.min(m.n ?? roomFor, roomFor);
    if (!(want > 1e-6)) throw new ApiError(409, 'no_room', 'Your men and carts here have no room');
    const bank = home ? ((await goodsOf(db, strongroom(pid))).coin ?? 0) : 0;
    const plan = await planBuy(db, town, res, want, held(slots, 'coin') + bank, now);
    const pay = await takeCoin(db, slots, plan.coin, home, pid);
    try {
      await batch(db, [...plan.stmts, ...pay.stmts]);
    } catch (e) {
      if (pay.taken) fill(slots.map((s) => ({ ...s, cap: Infinity })), pay.taken);
      throw e;
    }
    npcGive(room, slots, { lots: [{ r: res as never, n: plan.n, o: town }], items: [] });
    room.storyTrade(pid, 'buy', plan.coin, 0);
    return { done: { t: 'npcDone', op: 'buy', coin: plan.coin, res, n: plan.n } };
  }

  if (m.op === 'hire') {
    const cls = m.cls!, cost = NPC_HIRE[cls];
    if (cost === undefined) throw new ApiError(400, 'bad_request', `Nobody here hires out as ${cls}`);
    const why = await joinCheck(db, pid, cls);
    if (why) throw joinError(why, 'A worker');
    const pay = await takeCoin(db, slots, cost, home, pid), id = newId(pid), p = makePerson(id, cls);
    const man = { ...p, hero: { ...p.hero, name: nameFor(cls, new Set(), now % 97) } };
    try {
      await batch(db, [
        guard(db, `(SELECT COUNT(*) FROM war_persons WHERE player_id = ?1 AND ${IN_ARMY} AND ${WORKER}) < ?2`, pid, (await workerRoom(db, pid))),
        ...pay.stmts, ...(await planPay(db, town, cost, now)),
        insertPerson(db, pid, man, 'active', null, now),
        db.prepare('UPDATE war_persons SET region = ?2 WHERE id = ?1').bind(id, town),
      ]);
    } catch (e) {
      if (pay.taken) fill(slots.map((s) => ({ ...s, cap: Infinity })), pay.taken);
      throw e;
    }
    const got = await claimForJoin(db, pid, town, [[id]], room.personsHere(), now);
    const fell = typeof got === 'string' ? null : room.hired(pid, got[0]); // no room now: he waits off the field for the next poll
    room.storyTrade(pid, 'hire', cost, 0);
    return { done: { t: 'npcDone', op: 'hire', coin: cost }, welcome: fell?.msg };
  }

  const type = m.cart!, cost = NPC_CARTS[type];
  const way = await pathOf(db, pid);
  if (room.cartsOf(pid).length >= cartCap(way.path)) throw new ApiError(409, 'carts_full', 'You keep as many carts as your path allows');
  const pay = await takeCoin(db, slots, cost, home, pid);
  try {
    await batch(db, [...pay.stmts, ...(await planPay(db, town, cost, now))]);
  } catch (e) {
    if (pay.taken) fill(slots.map((s) => ({ ...s, cap: Infinity })), pay.taken);
    throw e;
  }
  room.giveCart(pid, type);
  room.storyTrade(pid, 'cart', cost, 0);
  return { done: { t: 'npcDone', op: 'cart', coin: cost } };
}

/** His workers' cap (W-103), for the guard on a hire's insert. */
async function workerRoom(db: D1Database, pid: number): Promise<number> {
  return workerCap((await pathOf(db, pid)).path);
}

/** A bundle into the packs and carts at the town; what will not fit is set down at their feet. */
export function npcGive(room: WarRoom, slots: readonly (Slot & { x: number; y: number })[], b: Bundle): void {
  const rest = fill(slots, b);
  if (rest.lots.length) room.sim.dropPile(slots[0].x, slots[0].y, rest.lots, []);
}
