/**
 * Escrowed hand-offs, contracts and letters of credit (M6g; docs/WAR.md "Hand-offs, contracts, letters"). Tables:
 * migrations/0031_war_contracts.sql; escrows are war_goods holders. The live hand-off window is the room's
 * (./room.ts handoff); sealed loads ride in packs and carts as sealed lots (src/war/sim/holders.ts `s`).
 *
 *  - Deal (Broker): posted at a broker's stall (a merchant with the Broker node, stall rented there) between parties
 *    a and b, each declaring its half. Each drops its half from his sites in the town when he can; once both are in,
 *    each half goes to the other's warehouse (at home: strongroom). Not both in by DEAL.ms: refunded.
 *  - Contracts (CONTRACT.open open a poster, Broker CONTRACT.broker; needs the Contracts node), posted at the
 *    poster's stall with the reward escrowed:
 *      carry:  his goods (`res` x n, declared `value`) leave his stall sealed; the carrier escrows CONTRACT.deposit of
 *              the value and loads them in town A (stow out, sealed under the contract), they unload only at B into
 *              the poster's warehouse (stow in); all delivered: reward and deposit to the carrier.
 *      supply: the taker delivers n of `res` into the poster's warehouse at B by the deadline: reward to him.
 *      escort: the poster's cart arrives at B with >= CONTRACT.escort of its declared loads: reward to the taker.
 *    Past the deadline: the reward goes back to the poster; a carry's deposit and any sealed goods not yet loaded too.
 *  - W-61 work contracts (no merchant node: any stall holder, CONTRACT.open of them), taken only by a member of the
 *    poster's alliance (his men must stand among the poster's on the field):
 *      build:  labour (`n` worker-seconds) by the taker's men on the poster's site `site` in `region`; the reward is
 *              released into the taker's strongroom pro rata as the room reports the labour (labourDone), the last of it
 *              when all is in.
 *      guard:  the taker holds the poster's town in `region` (its town-level ground) with at least `men` men for `n`
 *              hours: the room checks every LABOUR_EVERY ticks (guardCheck); each whole hour held pays reward / hours;
 *              out of bounds (or dead) past GUARD.grace seconds: broken, the rest back to the poster.
 *  - Letter (Banker, stall L3 in town A): the banker escrows coin at town B and offers a letter at A for his fee; the
 *    buyer pays amount + fee into the banker's stall at A and the letter is named to him: only he redeems it, once,
 *    at B, into his warehouse there. At most LETTER.max coin.
 */
import { heldNodes } from '../../../src/data/professions';
import { ApiError } from '../errors';
import { batch, guard, lotsOf, planTake, putLotsStmts, putStmt, strongroom, totalsOf, type GoodLot } from './holders';
import { intoOf, presentIn, site, stallId, townOf } from './market';
import { json } from './persons';
import { allianceOf } from './world/members';
import { contractPoints, peacePoints, statStmt } from './peace';
import { tallyStmt } from './tasks';
import type { Env } from '../env';
import { worldStub } from './world/routes';
import { logError } from '../telemetry/log';
import type { AllianceId } from '../../../src/war/world/types';

const HOUR = 3_600_000;
export const DEAL = { ms: 48 * HOUR };
export const CONTRACT = { open: 2, broker: 4, deposit: 0.5, escort: 0.75 };
/** W-61 guard contracts: seconds out of bounds before one breaks; most hours; most men asked. Build: most man-hours. */
export const GUARD = { grace: 120, hours: 24, men: 12 };
export const BUILD = { hours: 48 };
export const LETTER = { max: 500 };

type Goods = Record<string, number>;
const EPS = 1e-6;

async function nodes(db: D1Database, pid: number): Promise<Set<string>> {
  const rows = (await db.prepare("SELECT perks FROM war_persons WHERE player_id = ?1 AND cls = 'merchant' AND state NOT IN ('dead', 'retired')").bind(pid).all<{ perks: string }>()).results;
  const out = new Set<string>();
  for (const r of rows) for (const n of heldNodes('merchant', json<string[]>(r.perks, []))) out.add(n);
  return out;
}

const mustTown = (t: string) => {
  if (!townOf(t)) throw new ApiError(404, 'not_market', `${t} is no market town`);
};

/** Plan taking `goods` from the player's sites in town (warehouse, then stall). */
export async function fromSites(db: D1Database, pid: number, town: string, goods: Goods): Promise<{ stmts: D1PreparedStatement[]; taken: GoodLot[] }> {
  const out = { stmts: [] as D1PreparedStatement[], taken: [] as GoodLot[] };
  for (const [res, n] of Object.entries(goods)) {
    let left = n;
    for (const from of [intoOf(town, pid), stallId(town, pid)]) {
      if (left <= EPS) break;
      const lots = await lotsOf(db, from), k = Math.min(left, lots.filter((l) => l.res === res && !l.seal).reduce((a, l) => a + l.amount, 0));
      if (k <= EPS) continue;
      const p = planTake(db, from, lots, { [res]: k });
      out.stmts.push(...p.stmts);
      out.taken.push(...p.taken);
      left -= k;
    }
    if (left > EPS) throw new ApiError(409, `no_${res}`, `You lack ${Math.round(left * 1000) / 1000} ${res} in your sites in ${town}`);
  }
  return out;
}

/** Everything in escrow `esc` into holder `to` (statements). */
async function release(db: D1Database, esc: string, to: string): Promise<D1PreparedStatement[]> {
  const lots = await lotsOf(db, esc);
  if (!lots.length) return [];
  const p = planTake(db, esc, lots, totalsOf(lots.filter((l) => !l.seal)));
  const sealed = lots.filter((l) => l.seal);
  return [
    ...p.stmts, ...putLotsStmts(db, to, p.taken),
    ...sealed.flatMap((l) => [db.prepare('UPDATE war_goods SET amount = 0 WHERE place = ?1 AND res = ?2 AND origin = ?3 AND seal = ?4').bind(esc, l.res, l.origin, l.seal), putStmt(db, to, l.res, l.amount, l.origin)]),
  ];
}

// ---------------------------------------------------------------- deals (Broker)

interface DealRow { id: number; town: string; broker: number; player_a: number; player_b: number; give_a: string; give_b: string; in_a: number; in_b: number; state: string; expires_at: number }

export async function postDeal(db: D1Database, pid: number, town: string, broker: number, other: number, give: Goods, get: Goods, now: number): Promise<number> {
  mustTown(town);
  if (other === pid) throw new ApiError(400, 'bad_request', 'A deal is between two players');
  if (!(await nodes(db, broker)).has('broker')) throw new ApiError(409, 'no_broker', 'The broker needs the Broker node');
  if (!(await db.prepare('SELECT 1 FROM war_holders WHERE id = ?1').bind(stallId(town, broker)).first())) throw new ApiError(409, 'no_stall', 'The broker rents no stall here');
  const r = await db
    .prepare('INSERT INTO war_deals (town, broker, player_a, player_b, give_a, give_b, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id')
    .bind(town, broker, pid, other, JSON.stringify(give), JSON.stringify(get), now + DEAL.ms, now)
    .first<{ id: number }>();
  return r!.id;
}

async function deal(db: D1Database, id: number): Promise<DealRow> {
  const d = await db.prepare('SELECT * FROM war_deals WHERE id = ?1').bind(id).first<DealRow>();
  if (!d) throw new ApiError(404, 'not_found', 'No such deal');
  return d;
}

/** Refund an open deal past its time (lazily, on any touch); returns its state now. */
export async function settleDeal(db: D1Database, id: number, now: number): Promise<string> {
  const d = await deal(db, id);
  if (d.state !== 'open' || now < d.expires_at) return d.state;
  await batch(db, [
    db.prepare("UPDATE war_deals SET state = 'refunded' WHERE id = ?1 AND state = 'open'").bind(id),
    ...(d.in_a ? await release(db, `dl:${id}:a`, intoOf(d.town, d.player_a)) : []),
    ...(d.in_b ? await release(db, `dl:${id}:b`, intoOf(d.town, d.player_b)) : []),
  ]);
  return 'refunded';
}

/** A party drops his half from his sites in the deal's town; once both are in, the halves cross. */
export async function dropHalf(db: D1Database, pid: number, id: number, now: number): Promise<string> {
  if ((await settleDeal(db, id, now)) !== 'open') throw new ApiError(409, 'closed', 'The deal is closed');
  const d = await deal(db, id);
  const side = pid === d.player_a ? 'a' : pid === d.player_b ? 'b' : null;
  if (!side) throw new ApiError(403, 'not_party', 'Not your deal');
  if (side === 'a' ? d.in_a : d.in_b) throw new ApiError(409, 'in_already', 'Your half is in');
  const give = json<Goods>(side === 'a' ? d.give_a : d.give_b, {});
  const p = await fromSites(db, pid, d.town, give);
  const other = side === 'a' ? d.in_b : d.in_a;
  const mark = db.prepare(`UPDATE war_deals SET in_${side} = 1, state = ?2 WHERE id = ?1 AND in_${side} = 0 AND state = 'open'`).bind(id, other ? 'done' : 'open');
  const stmts = [...p.stmts, mark, guard(db, `(SELECT in_${side} FROM war_deals WHERE id = ?1) = 1`, id)];
  if (!other) stmts.push(...putLotsStmts(db, `dl:${id}:${side}`, p.taken));
  else {
    // both in: this half straight to the other party, the other half out of escrow to this one
    const counterpart = side === 'a' ? d.player_b : d.player_a;
    stmts.push(...putLotsStmts(db, intoOf(d.town, counterpart), p.taken), ...(await release(db, `dl:${id}:${side === 'a' ? 'b' : 'a'}`, intoOf(d.town, pid))));
  }
  await batch(db, stmts);
  return other ? 'done' : 'open';
}

// ---------------------------------------------------------------- contracts

export type ContractKind = 'carry' | 'supply' | 'escort' | 'build' | 'guard';
export interface ContractRow { id: number; kind: ContractKind; town: string; to_town: string; poster: number; taker: number | null; reward: number; res: string | null; n: number; delivered: number; value: number; deposit: number; region: string | null; site: number | null; men: number; paid: number; away: number; state: string; deadline: number }
export interface ContractIn {
  kind: ContractKind; toTown: string; reward: number; res?: string; n?: number; value?: number; loads?: number; deadline: number;
  /** W-61 build and guard: the region; build: the site (building id) and man-hours; guard: hours and men. */
  region?: string; site?: number; hours?: number; men?: number;
}
const work = (k: string) => k === 'build' || k === 'guard';

export async function postContract(db: D1Database, pid: number, town: string, c: ContractIn, holder: number, now: number): Promise<number> {
  mustTown(town);
  if (!work(c.kind)) mustTown(c.toTown);
  const s = await site(db, pid, town, 'stall', holder, now);
  const ns = await nodes(db, pid);
  const cap = ns.has('broker') ? CONTRACT.broker : ns.has('contracts') || work(c.kind) ? CONTRACT.open : 0;
  if (!cap) throw new ApiError(409, 'no_contracts', 'Contracts need a merchant with the Contracts node');
  const open = (await db.prepare("SELECT COUNT(*) AS n FROM war_contracts WHERE poster = ?1 AND state IN ('open', 'taken')").bind(pid).first<{ n: number }>())?.n ?? 0;
  if (open >= cap) throw new ApiError(409, 'contracts_full', `At most ${cap} open contracts`);
  if (c.deadline <= now) throw new ApiError(400, 'bad_request', 'The deadline has passed');
  if (c.kind !== 'escort' && !work(c.kind) && (!c.res || !(c.n! > 0))) throw new ApiError(400, 'bad_request', 'A good and an amount');
  if (c.kind === 'carry' && !(c.value! > 0)) throw new ApiError(400, 'bad_request', 'A carry declares its value');
  if (c.kind === 'escort' && !(c.loads! > 0)) throw new ApiError(400, 'bad_request', 'An escort declares the cart\'s loads');
  if (work(c.kind)) {
    if (!c.region || !(c.hours! > 0)) throw new ApiError(400, 'bad_request', 'A region and the hours');
    if (c.kind === 'build' && (c.site === undefined || c.hours! > BUILD.hours)) throw new ApiError(400, 'bad_request', `A site and at most ${BUILD.hours} man-hours`);
    if (c.kind === 'guard' && (!(c.men! >= 1) || c.men! > GUARD.men || c.hours! > GUARD.hours)) throw new ApiError(400, 'bad_request', `1 to ${GUARD.men} men for at most ${GUARD.hours} hours`);
    if (c.kind === 'guard' && c.deadline < now + c.hours! * HOUR) throw new ApiError(400, 'bad_request', 'The deadline leaves no time to hold it');
  }
  const n = c.kind === 'escort' ? c.loads! : c.kind === 'build' ? c.hours! * 3600 : c.kind === 'guard' ? c.hours! : c.n!;
  const id = (await db
    .prepare("INSERT INTO war_contracts (kind, town, to_town, poster, reward, res, n, value, deposit, region, site, men, state, deadline, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'cancelled', ?13, ?14) RETURNING id")
    .bind(c.kind, town, work(c.kind) ? town : c.toTown, pid, c.reward, work(c.kind) ? null : (c.res ?? null), n, c.value ?? 0, c.kind === 'carry' ? Math.ceil(c.value! * CONTRACT.deposit) : 0, c.region ?? null, c.kind === 'build' ? c.site! : null, c.kind === 'guard' ? c.men! : 0, c.deadline, now)
    .first<{ id: number }>())!.id;
  const reward = planTake(db, s.id, await lotsOf(db, s.id), { coin: c.reward }, 'Your stall');
  const goods = c.kind === 'carry' ? planTake(db, s.id, (await lotsOf(db, s.id)).map((l) => (l.res === 'coin' ? { ...l, amount: Math.max(0, l.amount - c.reward) } : l)), { [c.res!]: c.n! }, 'Your stall') : null;
  await batch(db, [
    ...reward.stmts, ...putLotsStmts(db, `ct:${id}`, reward.taken),
    ...(goods ? [...goods.stmts, ...goods.taken.map((l) => putStmt(db, `ct:${id}:g`, l.res, l.amount, l.origin, id))] : []),
    db.prepare("UPDATE war_contracts SET state = 'open' WHERE id = ?1").bind(id),
  ]);
  return id;
}

export async function contract(db: D1Database, id: number): Promise<ContractRow> {
  const c = await db.prepare('SELECT * FROM war_contracts WHERE id = ?1').bind(id).first<ContractRow>();
  if (!c) throw new ApiError(404, 'not_found', 'No such contract');
  return c;
}

/** Expire a contract past its deadline (lazily): reward back to the poster; a carry's deposit and unloaded goods too. */
export async function settleContract(db: D1Database, id: number, now: number): Promise<ContractRow> {
  const c = await contract(db, id);
  if ((c.state !== 'open' && c.state !== 'taken') || now < c.deadline) return c;
  const back = intoOf(c.town, c.poster);
  await batch(db, [
    db.prepare("UPDATE war_contracts SET state = 'expired' WHERE id = ?1 AND state IN ('open', 'taken')").bind(id),
    guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'expired'", id),
    ...(await release(db, `ct:${id}`, back)),
    ...(await release(db, `ct:${id}:d`, back)),
    ...(await release(db, `ct:${id}:g`, back)),
  ]);
  return { ...c, state: 'expired' };
}

/** Take an open contract (not one's own): a carry escrows its deposit from the taker's sites in the contract's town. */
export async function takeContract(db: D1Database, pid: number, id: number, now: number): Promise<void> {
  const c = await settleContract(db, id, now);
  if (c.state !== 'open') throw new ApiError(409, 'closed', `The contract is ${c.state}`);
  if (c.poster === pid) throw new ApiError(409, 'own_contract', 'Your own contract');
  if (work(c.kind)) {
    const [a, b] = await Promise.all([allianceOf(db, pid), allianceOf(db, c.poster)]);
    if (a === null || a !== b) throw new ApiError(409, 'not_ally', 'Only a man of the same alliance works or guards his town');
  }
  const dep = c.kind === 'carry' ? await fromSites(db, pid, c.town, { coin: c.deposit }) : { stmts: [], taken: [] };
  await batch(db, [
    db.prepare("UPDATE war_contracts SET state = 'taken', taker = ?2 WHERE id = ?1 AND state = 'open'").bind(id, pid),
    guard(db, '(SELECT taker FROM war_contracts WHERE id = ?1) = ?2', id, pid),
    ...dep.stmts, ...putLotsStmts(db, `ct:${id}:d`, dep.taken),
  ]);
}

/** A carry's sealed goods for its carrier to load at town A (the room puts them in his packs): planned out of escrow. */
export async function sealedFor(db: D1Database, pid: number, id: number, town: string, now: number): Promise<{ lots: GoodLot[]; stmts: D1PreparedStatement[] }> {
  const c = await settleContract(db, id, now);
  if (c.kind !== 'carry' || c.state !== 'taken' || c.taker !== pid) throw new ApiError(409, 'not_carrier', 'Not a carry you hold');
  if (town !== c.town) throw new ApiError(409, 'wrong_town', `Its goods wait in ${c.town}`);
  const lots = await lotsOf(db, `ct:${id}:g`);
  const stmts = lots.flatMap((l) => [guard(db, 'coalesce((SELECT amount FROM war_goods WHERE place = ?1 AND res = ?2 AND origin = ?3 AND seal = ?4), 0) >= ?5 - 0.000001', `ct:${id}:g`, l.res, l.origin, l.seal, l.amount), db.prepare('UPDATE war_goods SET amount = 0 WHERE place = ?1 AND res = ?2 AND origin = ?3 AND seal = ?4').bind(`ct:${id}:g`, l.res, l.origin, l.seal)]);
  return { lots, stmts };
}

/**
 * Goods delivered under contract `id` at `town` by `pid` (the room took them out of his packs or cart: sealed lots
 * under a carry, plain goods for a supply): into the poster's warehouse; all of it in: the reward (and a carry's
 * deposit) to the taker. Returns the statements to run with the delivery and whether it completes.
 */
export async function deliver(db: D1Database, pid: number, id: number, town: string, lots: readonly GoodLot[], now: number): Promise<{ stmts: D1PreparedStatement[]; done: boolean; refused?: string }> {
  const c = await settleContract(db, id, now);
  if (c.state !== 'taken' || c.taker !== pid || c.kind === 'escort' || work(c.kind)) return { stmts: [], done: false, refused: 'not a contract you hold' };
  if (town !== c.to_town) return { stmts: [], done: false, refused: `it is delivered in ${c.to_town}` };
  const n = lots.filter((l) => l.res === c.res).reduce((a, l) => a + l.amount, 0);
  if (n <= EPS || lots.some((l) => l.res !== c.res)) return { stmts: [], done: false, refused: `only ${c.res}` };
  const into = intoOf(c.to_town, c.poster), total = c.delivered + n, done = total >= c.n - EPS;
  const stmts = [
    ...lots.map((l) => putStmt(db, into, l.res, l.amount, l.origin)),
    db.prepare('UPDATE war_contracts SET delivered = delivered + ?2 WHERE id = ?1').bind(id, n),
  ];
  if (done) stmts.push(...(await payOut(db, c, pid, now)));
  return { stmts, done };
}

/** A finished contract: state done, the reward (and a carry's deposit) to the taker's warehouse at B (at home: strongroom). */
async function payOut(db: D1Database, c: ContractRow, taker: number, now: number): Promise<D1PreparedStatement[]> {
  const to = (await db.prepare('SELECT 1 FROM war_holders WHERE id = ?1').bind(intoOf(c.to_town, taker)).first()) ? intoOf(c.to_town, taker) : strongroom(taker);
  return [
    db.prepare("UPDATE war_contracts SET state = 'done' WHERE id = ?1 AND state = 'taken'").bind(c.id),
    guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'done'", c.id),
    ...(await release(db, `ct:${c.id}`, to)),
    ...(await release(db, `ct:${c.id}:d`, to)),
    statStmt(db, taker, 'contracts', 1), // W-61: contracts filled (titles)
    tallyStmt(db, taker, 'contract', 1, now), // E7 tasks
  ];
}

/** The poster's cart arrived at `town` with `loads` (he stowed from it there): his escort contracts there are paid when it is >= CONTRACT.escort of the declared. */
export async function cartArrived(db: D1Database, poster: number, town: string, loads: number, now: number): Promise<number> {
  const rows = (await db.prepare("SELECT id FROM war_contracts WHERE poster = ?1 AND to_town = ?2 AND kind = 'escort' AND state = 'taken'").bind(poster, town).all<{ id: number }>()).results;
  let paid = 0;
  for (const { id } of rows) {
    const c = await settleContract(db, id, now);
    if (c.state !== 'taken' || loads < c.n * CONTRACT.escort - EPS) continue;
    await batch(db, await payOut(db, c, c.taker!, now));
    paid++;
  }
  return paid;
}

export async function contractsIn(db: D1Database, town: string, now: number) {
  const rows = (await db.prepare("SELECT id FROM war_contracts WHERE (town = ?1 OR to_town = ?1) AND state IN ('open', 'taken') ORDER BY id").bind(town).all<{ id: number }>()).results;
  const out: ContractRow[] = [];
  for (const r of rows) out.push(await settleContract(db, r.id, now));
  return out.filter((c) => c.state === 'open' || c.state === 'taken');
}

// ---------------------------------------------------------------- W-61 build and guard contracts

/** Coin `k` out of the reward escrow into the taker's strongroom (statements; nothing when k is ~0). */
async function payShare(db: D1Database, c: ContractRow, k: number): Promise<D1PreparedStatement[]> {
  if (!(k > EPS) || !c.taker) return [];
  const lots = await lotsOf(db, `ct:${c.id}`), have = lots.filter((l) => l.res === 'coin' && !l.seal).reduce((a, l) => a + l.amount, 0);
  const n = Math.min(k, have);
  if (!(n > EPS)) return [];
  const p = planTake(db, `ct:${c.id}`, lots, { coin: n });
  return [...p.stmts, ...putLotsStmts(db, strongroom(c.taker), p.taken), db.prepare('UPDATE war_contracts SET paid = paid + ?2 WHERE id = ?1').bind(c.id, n)];
}

/** A work contract filled: the taker's stats and his alliance's peace score (capped a day; the world adds it). */
async function filled(env: Env, c: ContractRow, now: number): Promise<D1PreparedStatement[]> {
  const db = env.DB!, a = await allianceOf(db, c.taker!);
  const out = [statStmt(db, c.taker!, 'contracts', 1), tallyStmt(db, c.taker!, 'contract', 1, now)];
  if (a === null) return out;
  const p = await peacePoints(db, a, 'contracts', contractPoints(c.reward), now);
  if (p.pts > 0) worldStub(env).addPeace(a as AllianceId, 'contracts', p.pts).catch((e) => logError('war_peace_failed', e));
  return [...out, ...p.stmts];
}

/** Taken build and guard contracts in a region (the room watches them). */
export async function workContracts(db: D1Database, region: string, now: number): Promise<ContractRow[]> {
  const rows = (await db.prepare("SELECT id FROM war_contracts WHERE region = ?1 AND kind IN ('build', 'guard') AND state = 'taken' ORDER BY id").bind(region).all<{ id: number }>()).results;
  const out: ContractRow[] = [];
  for (const r of rows) {
    const c = await settleContract(db, r.id, now);
    if (c.state === 'taken') out.push(c);
  }
  return out;
}

/**
 * Labour by player `pid`'s men on site `site` in `region` (worker-seconds, the room's count): his build contracts there
 * grow by it (up to their need), the reward is released pro rata, and a full one is done. Returns coin paid.
 */
export async function labourDone(env: Env, pid: number, region: string, site: number, secs: number, now: number): Promise<number> {
  const db = env.DB!;
  const rows = (await db.prepare("SELECT id FROM war_contracts WHERE kind = 'build' AND state = 'taken' AND taker = ?1 AND region = ?2 AND site = ?3 ORDER BY id").bind(pid, region, site).all<{ id: number }>()).results;
  let left = secs, coin = 0;
  for (const { id } of rows) {
    const c = await settleContract(db, id, now);
    if (c.state !== 'taken' || !(left > EPS)) continue;
    const add = Math.min(left, c.n - c.delivered);
    if (!(add > EPS)) continue;
    left -= add;
    const total = c.delivered + add, done = total >= c.n - EPS;
    const owed = done ? Infinity : (c.reward * total) / c.n - c.paid;
    const pay = await payShare(db, c, owed);
    coin += done ? c.reward - c.paid : Math.max(0, owed);
    await batch(db, [
      db.prepare("UPDATE war_contracts SET delivered = ?2 WHERE id = ?1 AND state = 'taken'").bind(id, total),
      guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'taken'", id),
      ...pay, statStmt(db, pid, 'labour', add), tallyStmt(db, pid, 'labour', add, now),
      ...(done ? [db.prepare("UPDATE war_contracts SET state = 'done' WHERE id = ?1").bind(id), ...(await filled(env, c, now))] : []),
    ]);
  }
  return coin;
}

/**
 * A guard check (the room, every LABOUR_EVERY ticks): did the taker hold the poster's town with his men for `secs`?
 * Held: the time counts and each whole hour pays its share (all hours: done). Not held: past GUARD.grace it is broken
 * and the rest of the reward goes back to the poster. Returns the contract's state.
 */
export async function guardCheck(env: Env, id: number, held: boolean, secs: number, now: number): Promise<string> {
  const db = env.DB!;
  const c = await settleContract(db, id, now);
  if (c.kind !== 'guard' || c.state !== 'taken') return c.state;
  if (!held) {
    const away = c.away + secs;
    if (away < GUARD.grace) {
      await db.prepare("UPDATE war_contracts SET away = ?2 WHERE id = ?1 AND state = 'taken'").bind(id, away).run();
      return 'taken';
    }
    await batch(db, [
      db.prepare("UPDATE war_contracts SET state = 'broken', away = ?2 WHERE id = ?1 AND state = 'taken'").bind(id, away),
      guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'broken'", id),
      ...(await release(db, `ct:${id}`, intoOf(c.town, c.poster))),
    ]);
    return 'broken';
  }
  const total = Math.min(c.n * 3600, c.delivered + secs), done = total >= c.n * 3600 - EPS;
  const owed = done ? Infinity : (c.reward * Math.floor(total / 3600 + EPS)) / c.n - c.paid;
  await batch(db, [
    db.prepare("UPDATE war_contracts SET delivered = ?2, away = 0 WHERE id = ?1 AND state = 'taken'").bind(id, total),
    guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'taken'", id),
    ...(await payShare(db, c, owed)), statStmt(db, c.taker!, 'guard', total - c.delivered), tallyStmt(db, c.taker!, 'guard', total - c.delivered, now),
    ...(done ? [db.prepare("UPDATE war_contracts SET state = 'done' WHERE id = ?1").bind(id), ...(await filled(env, c, now))] : []),
  ]);
  return done ? 'done' : 'taken';
}

// ---------------------------------------------------------------- letters of credit (Banker)

interface LetterRow { id: number; banker: number; buyer: number | null; town: string; to_town: string; amount: number; fee: number; state: string }

/** The banker (Banker node, a level-3 stall at A) escrows `amount` coin from his sites at B and offers the letter at A. */
export async function offerLetter(db: D1Database, pid: number, town: string, toTown: string, amount: number, fee: number, holder: number, now: number): Promise<number> {
  mustTown(town);
  mustTown(toTown);
  if (amount > LETTER.max) throw new ApiError(409, 'letter_max', `A letter is at most ${LETTER.max} coin`);
  if (!(await nodes(db, pid)).has('banker')) throw new ApiError(409, 'no_banker', 'Letters need a merchant with the Banker node');
  const s = await site(db, pid, town, 'stall', holder, now);
  if (s.level < 3) throw new ApiError(409, 'stall_level', 'Letters need a level 3 stall');
  const id = (await db.prepare("INSERT INTO war_letters (banker, town, to_town, amount, fee, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'cancelled', ?6, ?6) RETURNING id").bind(pid, town, toTown, amount, fee, now).first<{ id: number }>())!.id;
  const p = await fromSites(db, pid, toTown, { coin: amount });
  await batch(db, [...p.stmts, ...putLotsStmts(db, `lc:${id}`, p.taken), db.prepare("UPDATE war_letters SET state = 'offered' WHERE id = ?1").bind(id)]);
  return id;
}

async function letter(db: D1Database, id: number): Promise<LetterRow> {
  const l = await db.prepare('SELECT * FROM war_letters WHERE id = ?1').bind(id).first<LetterRow>();
  if (!l) throw new ApiError(404, 'not_found', 'No such letter');
  return l;
}

/** Buy an offered letter at its town (present there): amount + fee into the banker's stall; it is named to the buyer. */
export async function buyLetter(db: D1Database, pid: number, id: number, now: number): Promise<void> {
  const l = await letter(db, id);
  if (l.state !== 'offered') throw new ApiError(409, 'closed', `The letter is ${l.state}`);
  if (l.banker === pid) throw new ApiError(409, 'own_letter', 'Your own letter');
  if (!(await presentIn(db, pid, l.town))) throw new ApiError(409, 'not_present', `Your men must be in ${l.town}`);
  const p = await fromSites(db, pid, l.town, { coin: l.amount + l.fee });
  await batch(db, [
    db.prepare("UPDATE war_letters SET state = 'sold', buyer = ?2, updated_at = ?3 WHERE id = ?1 AND state = 'offered'").bind(id, pid, now),
    guard(db, '(SELECT buyer FROM war_letters WHERE id = ?1) = ?2', id, pid),
    ...p.stmts, ...putLotsStmts(db, stallId(l.town, l.banker), p.taken),
  ]);
}

/** Redeem a letter: only its buyer, only at its town B (present there), once: its coin into his warehouse there. */
export async function redeemLetter(db: D1Database, pid: number, id: number, now: number): Promise<number> {
  const l = await letter(db, id);
  if (l.buyer !== pid) throw new ApiError(403, 'not_yours', 'The letter is named to another');
  if (l.state !== 'sold') throw new ApiError(409, 'closed', `The letter is ${l.state}`);
  if (!(await presentIn(db, pid, l.to_town))) throw new ApiError(409, 'not_present', `Redeem it in ${l.to_town}`);
  const to = (await db.prepare('SELECT 1 FROM war_holders WHERE id = ?1').bind(intoOf(l.to_town, pid)).first()) || townOf(l.to_town)?.home !== null ? intoOf(l.to_town, pid) : null;
  if (!to) throw new ApiError(409, 'no_warehouse', `You rent no warehouse in ${l.to_town}`);
  await batch(db, [
    db.prepare("UPDATE war_letters SET state = 'redeemed', updated_at = ?2 WHERE id = ?1 AND state = 'sold'").bind(id, now),
    guard(db, "(SELECT state FROM war_letters WHERE id = ?1) = 'redeemed'", id),
    ...(await release(db, `lc:${id}`, to)),
  ]);
  return l.amount;
}
