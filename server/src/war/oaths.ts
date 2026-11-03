/**
 * W-150..W-159 the feudal chain inside one alliance (docs/WAR.md "Feudal hierarchy"; migrations/0054_war_oaths.sql).
 *
 *  - Ranks: King (the crown, ./crown.ts), Lord (rules a settlement; a fort founds one), Vassal (sworn to someone), Free.
 *  - Swearing: a player asks, the lord answers. One oath a player, inside his alliance, no cycles. Anyone may swear to a
 *    lord or the king; a lord swears only to the king; the king to nobody.
 *  - war_settlements.overlord_id and tribute_pct follow the oath (syncTies), so the W-63 readers stay as they are: fealty
 *    lines, an attack told up the chain, a garrison.
 *  - Tribute: the rate is the receiver's. On an owner's share the sim sets it aside in the building (the room's setLiege
 *    order, ../../../src/war/sim/holders.ts); on a sale it moves from the stall to `tr:<town>:<payer>` beside it. Nothing
 *    teleports: the receiver's men fetch it there or the payer carries it, sealed (./regionDO.ts stowTribute).
 *  - Breaking an oath: any time; a public mark on the alliance's roll and a bar on swearing again; what is set aside goes
 *    back to him. Nothing else.
 */
import { FEUDAL, type Rank } from '../../../src/data/warFeudal';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { ApiError } from '../errors';
import { linked } from './abuse';
import { batch, guard, HOME, lotsOf, planTake, putLotsStmts, putStmt, totalsOf } from './holders';
import { stallId } from './market';
import { json } from './persons';
import { allianceOf } from './world/members';

export interface OathRow { season: number; vassal_pid: number; lord_pid: number; alliance: number; state: 'asked' | 'sworn'; asked_at: number; since: number | null }

const cents = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
/** Tribute on sales, set aside at the payer's stall in `town`. */
export const tributePlace = (town: string, payer: number) => `tr:${town}:${payer}`;
const crownLog = (db: D1Database, season: number, a: number, kind: string, actor: number, detail: unknown, now: number) =>
  db.prepare('INSERT INTO war_crown_log (season, alliance, kind, actor_id, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(season, a, kind, actor, JSON.stringify(detail), now);
const nameOf = async (db: D1Database, pid: number) => (await db.prepare('SELECT display_name AS n FROM players WHERE id = ?1').bind(pid).first<{ n: string }>())?.n ?? `#${pid}`;

// ---------------------------------------------------------------- reads

export const isLord = async (db: D1Database, pid: number) => !!(await db.prepare('SELECT 1 FROM war_settlements WHERE lord_pid = ?1 LIMIT 1').bind(pid).first());
const monarchOf = async (db: D1Database, a: number, season: number) => (await db.prepare('SELECT monarch_pid AS m FROM war_crowns WHERE season = ?1 AND alliance = ?2').bind(season, a).first<{ m: number | null }>())?.m ?? null;
export const oathOf = (db: D1Database, pid: number, season = WAR_SEASON.id) => db.prepare('SELECT * FROM war_oaths WHERE season = ?1 AND vassal_pid = ?2').bind(season, pid).first<OathRow>();
/** Whom the player is sworn to (null: nobody; a request not yet answered is no oath). */
export async function liegeOf(db: D1Database, pid: number, season = WAR_SEASON.id): Promise<number | null> {
  const o = await oathOf(db, pid, season);
  return o?.state === 'sworn' ? o.lord_pid : null;
}
export const rateOf = async (db: D1Database, pid: number, season = WAR_SEASON.id) =>
  (await db.prepare('SELECT pct FROM war_oath_rates WHERE season = ?1 AND player_id = ?2').bind(season, pid).first<{ pct: number }>())?.pct ?? FEUDAL.rateDefault;
export const rankOf = (monarch: boolean, lord: boolean, sworn: boolean): Rank => (monarch ? 'king' : lord ? 'lord' : sworn ? 'vassal' : 'free');

/** Until when a broken oath bars him (0: no bar): from the roll itself. */
export async function barUntil(db: D1Database, a: number, pid: number, season = WAR_SEASON.id): Promise<number> {
  const r = await db.prepare("SELECT MAX(at) AS at FROM war_crown_log WHERE season = ?1 AND alliance = ?2 AND kind = 'oath_broken' AND actor_id = ?3").bind(season, a, pid).first<{ at: number | null }>();
  return r?.at ? r.at + FEUDAL.barMs : 0;
}

/** Every oath in force this season with its rate (the rooms' setLiege orders, the household). */
export async function sworn(db: D1Database, season = WAR_SEASON.id): Promise<{ vassal: number; lord: number; pct: number }[]> {
  return (await db
    .prepare(`SELECT o.vassal_pid AS vassal, o.lord_pid AS lord, coalesce(r.pct, ?2) AS pct FROM war_oaths o LEFT JOIN war_oath_rates r ON r.season = o.season AND r.player_id = o.lord_pid
              WHERE o.season = ?1 AND o.state = 'sworn' ORDER BY o.vassal_pid`)
    .bind(season, FEUDAL.rateDefault)
    .all<{ vassal: number; lord: number; pct: number }>()).results;
}

// ---------------------------------------------------------------- ties on the settlements

/** His settlements' overlord and tribute as his oath stands (the liege's oldest settlement; none: no fealty line). */
export async function syncTies(db: D1Database, pid: number, season = WAR_SEASON.id): Promise<void> {
  const lord = await liegeOf(db, pid, season);
  const seat = lord === null ? null : ((await db.prepare('SELECT id FROM war_settlements WHERE lord_pid = ?1 ORDER BY id LIMIT 1').bind(lord).first<{ id: number }>())?.id ?? null);
  await db.prepare('UPDATE war_settlements SET overlord_id = ?2, tribute_pct = ?3 WHERE lord_pid = ?1').bind(pid, seat, seat === null || lord === null ? 0 : await rateOf(db, lord, season)).run();
}

/** Statements: what is set aside on his sales back into his stalls. */
async function backToStalls(db: D1Database, payer: number): Promise<D1PreparedStatement[]> {
  const rows = (await db.prepare("SELECT DISTINCT place FROM war_goods WHERE place LIKE 'tr:%' AND place LIKE ?1 AND amount > 0").bind(`%:${payer}`).all<{ place: string }>()).results;
  const out: D1PreparedStatement[] = [];
  for (const { place } of rows) {
    const town = place.slice(3, place.lastIndexOf(':')), lots = await lotsOf(db, place), p = planTake(db, place, lots, totalsOf(lots));
    out.push(...p.stmts, ...putLotsStmts(db, stallId(town, payer), p.taken));
  }
  return out;
}

/** End his oath with no mark on him (the crown passed): ties clear, what is set aside goes back. */
export async function releaseStmts(db: D1Database, pid: number, season: number): Promise<D1PreparedStatement[]> {
  return [
    db.prepare('DELETE FROM war_oaths WHERE season = ?1 AND vassal_pid = ?2').bind(season, pid),
    db.prepare('UPDATE war_settlements SET overlord_id = NULL, tribute_pct = 0 WHERE lord_pid = ?1').bind(pid),
    ...(await backToStalls(db, pid)),
  ];
}

/**
 * The crown passes from `from` to `to` (W-154): the lords sworn to the old king are free (they swore to him; they may
 * swear to the new one), his plain vassals stay his, and the new king swears to nobody.
 */
export async function crownPassedStmts(db: D1Database, season: number, from: number | null, to: number | null): Promise<D1PreparedStatement[]> {
  const out: D1PreparedStatement[] = [];
  if (to !== null) out.push(...(await releaseStmts(db, to, season)));
  if (from !== null && from !== to) {
    const lords = (await db
      .prepare("SELECT vassal_pid AS pid FROM war_oaths WHERE season = ?1 AND lord_pid = ?2 AND state = 'sworn' AND vassal_pid IN (SELECT lord_pid FROM war_settlements)")
      .bind(season, from)
      .all<{ pid: number }>()).results;
    for (const l of lords) if (l.pid !== to) out.push(...(await releaseStmts(db, l.pid, season)));
  }
  return out;
}

// ---------------------------------------------------------------- swearing

/** Ask to swear to `lord`. Any request of his before is replaced. */
export async function swear(db: D1Database, pid: number, lord: number, now: number, season = WAR_SEASON.id): Promise<void> {
  const a = await allianceOf(db, pid, season);
  if (a === null) throw new ApiError(409, 'no_alliance', 'Join an alliance first');
  if (lord === pid) throw new ApiError(400, 'bad_request', 'Not to yourself');
  if ((await allianceOf(db, lord, season)) !== a) throw new ApiError(409, 'not_ally', 'Oaths stay inside your alliance');
  const king = await monarchOf(db, a, season);
  if (king === pid) throw new ApiError(409, 'king', 'The king swears to nobody');
  if ((await barUntil(db, a, pid, season)) > now) throw new ApiError(409, 'barred', 'You broke an oath: you cannot swear again yet');
  if ((await liegeOf(db, pid, season)) !== null) throw new ApiError(409, 'sworn', 'You are sworn already');
  const toKing = king === lord;
  if (!toKing && !(await isLord(db, lord))) throw new ApiError(409, 'not_lord', 'He rules no settlement');
  if (!toKing && (await isLord(db, pid))) throw new ApiError(409, 'lords_to_king', 'A lord swears only to the king');
  for (let cur: number | null = lord, n = 0; cur !== null && n < 16; n++) {
    if (cur === pid) throw new ApiError(409, 'cycle', 'He is sworn to you');
    cur = await liegeOf(db, cur, season);
  }
  if (await linked(db, pid, lord, now)) throw new ApiError(409, 'linked', 'These accounts shared an address or device: no tie between them');
  await db
    .prepare("INSERT INTO war_oaths (season, vassal_pid, lord_pid, alliance, state, asked_at) VALUES (?1, ?2, ?3, ?4, 'asked', ?5) ON CONFLICT (season, vassal_pid) DO UPDATE SET lord_pid = ?3, asked_at = ?5")
    .bind(season, pid, lord, a, now)
    .run();
}

/** The lord answers a request, or the asker withdraws it. Returns the new state. */
export async function answerOath(db: D1Database, pid: number, vassal: number, yes: boolean, now: number, season = WAR_SEASON.id): Promise<'sworn' | 'refused' | 'withdrawn'> {
  const o = await oathOf(db, vassal, season);
  if (!o || o.state !== 'asked' || o.asked_at + FEUDAL.askMs <= now) throw new ApiError(409, 'closed', 'No such request stands');
  if (pid !== o.lord_pid && pid !== vassal) throw new ApiError(403, 'not_party', 'Not your request');
  if (!yes || pid === vassal) {
    await db.prepare("DELETE FROM war_oaths WHERE season = ?1 AND vassal_pid = ?2 AND state = 'asked'").bind(season, vassal).run();
    return pid === vassal ? 'withdrawn' : 'refused';
  }
  await batch(db, [
    db.prepare("UPDATE war_oaths SET state = 'sworn', since = ?3 WHERE season = ?1 AND vassal_pid = ?2 AND state = 'asked'").bind(season, vassal, now),
    guard(db, "(SELECT state FROM war_oaths WHERE season = ?1 AND vassal_pid = ?2) = 'sworn'", season, vassal),
    crownLog(db, season, o.alliance, 'oath_sworn', vassal, { lord: await nameOf(db, pid) }, now),
  ]);
  await syncTies(db, vassal, season);
  return 'sworn';
}

/** He breaks his oath: the mark on the roll, the bar, his set-aside tribute back, the liege's garrison out. Returns when he may swear again. */
export async function breakOath(db: D1Database, pid: number, now: number, season = WAR_SEASON.id): Promise<number> {
  const o = await oathOf(db, pid, season);
  if (!o || o.state !== 'sworn') throw new ApiError(409, 'free', 'You are sworn to nobody');
  await batch(db, [
    ...(await releaseStmts(db, pid, season)),
    db.prepare("DELETE FROM war_settlement_members WHERE role = 'garrison' AND player_id = ?2 AND settlement_id IN (SELECT id FROM war_settlements WHERE lord_pid = ?1)").bind(pid, o.lord_pid),
    crownLog(db, season, o.alliance, 'oath_broken', pid, { lord: await nameOf(db, o.lord_pid), lordPid: o.lord_pid }, now),
  ]);
  return now + FEUDAL.barMs;
}

/** A lord or the king sets the rate on those sworn to him. */
export async function setRate(db: D1Database, pid: number, pct: number, now: number, season = WAR_SEASON.id): Promise<number> {
  const a = await allianceOf(db, pid, season);
  if (a === null) throw new ApiError(409, 'no_alliance', 'Join an alliance first');
  if (!Number.isInteger(pct) || pct < 0 || pct > FEUDAL.rateMax) throw new ApiError(400, 'bad_request', `Tribute 0 to ${FEUDAL.rateMax} %`);
  if ((await monarchOf(db, a, season)) !== pid && !(await isLord(db, pid))) throw new ApiError(403, 'not_lord', 'Only a lord or the king sets one');
  await db.batch([
    db.prepare('INSERT INTO war_oath_rates (season, player_id, pct) VALUES (?1, ?2, ?3) ON CONFLICT (season, player_id) DO UPDATE SET pct = ?3').bind(season, pid, pct),
    db.prepare("UPDATE war_settlements SET tribute_pct = ?3 WHERE lord_pid IN (SELECT vassal_pid FROM war_oaths WHERE season = ?1 AND lord_pid = ?2 AND state = 'sworn') AND overlord_id IS NOT NULL").bind(season, pid, pct),
    crownLog(db, season, a, 'oath_rate', pid, { pct }, now),
  ]);
  return pct;
}

// ---------------------------------------------------------------- tribute on sales

/** His liege's part of `coin` he earned from a sale (0: nobody's man, or a lord at 0%). */
export async function tributeCut(db: D1Database, seller: number, coin: number, season = WAR_SEASON.id): Promise<number> {
  const lord = coin > 0 ? await liegeOf(db, seller, season) : null;
  return lord === null ? 0 : cents((coin * (await rateOf(db, lord, season))) / 100);
}

/**
 * A seller's tribute on a sale (./tradeScore.ts fill hook): statements moving his liege's part of the coin aside at his
 * stall, in the fill's batch and after the credit. Nothing moves to the liege: his men come for it.
 */
export async function saleTribute(db: D1Database, seller: number, coin: number, town: string, season = WAR_SEASON.id): Promise<D1PreparedStatement[]> {
  if (!(coin > 0)) return [];
  const cut = await tributeCut(db, seller, coin, season);
  if (!(cut > 0)) return [];
  return [
    db.prepare("UPDATE war_goods SET amount = amount - ?3 WHERE place = ?1 AND res = 'coin' AND origin = ?2 AND seal = 0").bind(stallId(town, seller), HOME, cut),
    guard(db, '(SELECT changes()) = 1'),
    putStmt(db, tributePlace(town, seller), 'coin', cut),
  ];
}

// ---------------------------------------------------------------- what the rooms report

/** A room's report of the tribute set aside in its buildings replaces what it reported before. */
export async function reportHeld(db: D1Database, region: string, rows: readonly { building: number; type: string; payer: number; receiver: number; goods: Record<string, number> }[]): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM war_tribute_held WHERE region = ?1').bind(region),
    ...rows.map((r) => db.prepare('INSERT INTO war_tribute_held (region, building, type, payer_pid, receiver_pid, goods) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(region, r.building, r.type, r.payer, r.receiver, JSON.stringify(r.goods))),
  ]);
}

// ---------------------------------------------------------------- the view

export interface Owed { region: string; what: string; goods: Record<string, number> }

/** Everything `payer` has set aside: on his sales and in his buildings. */
export async function owedBy(db: D1Database, payer: number): Promise<Owed[]> {
  const rows = (await db.prepare("SELECT place, res, SUM(amount) AS n FROM war_goods WHERE place LIKE 'tr:%' AND place LIKE ?1 AND amount > 0 GROUP BY place, res ORDER BY place, res").bind(`%:${payer}`).all<{ place: string; res: string; n: number }>()).results;
  const out = new Map<string, Owed>();
  for (const r of rows) {
    const at = out.get(r.place) ?? { region: r.place.slice(3, r.place.lastIndexOf(':')), what: 'stall', goods: {} };
    at.goods[r.res] = r.n;
    out.set(r.place, at);
  }
  const held = (await db.prepare('SELECT region, type, goods FROM war_tribute_held WHERE payer_pid = ?1 ORDER BY region, building').bind(payer).all<{ region: string; type: string; goods: string }>()).results;
  return [...out.values(), ...held.map((h) => ({ region: h.region, what: h.type, goods: json<Record<string, number>>(h.goods, {}) }))];
}
