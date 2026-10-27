/**
 * W-63 shared settlements (docs/impl/global-war-rebuild.md W-63; migrations/0045_war_settlements.sql). D1 is the
 * source of truth; region rooms report into it (a camp finished, its town level, its buildings, that it was tended).
 *
 *  - Found: a finished camp outside the homes makes a settlement round it (radius SETTLE.r), its builder the lord. Its
 *    centre must be at least r + other.r (2r for equal radii) from every settlement centre in the region; the caller's
 *    `mapOk` checks the map (claim points, landmarks, homes, region rules).
 *  - Settle: a player asks a settlement for a plot; its lord accepts with a rect inside r that overlaps no other plot,
 *    or refuses.
 *  - Terms: a lord whose men stand on another settlement's ground (the caller checks >= SETTLE.presence men) offers
 *    vassal (tribute at most SETTLE.tributeMax %, the offerer's settlement its overlord) or join (any player: on
 *    accept he becomes its lord, the old lord a citizen). Garrison: an overlord's lord asks to garrison his vassal.
 *  - Truce: between two settlements' lords, each escrowing `bond` coin from his strongroom; active SETTLE.truceMs. An
 *    attack logged by one side's lord on the other side (or on its vassal) breaks it: both bonds go to the victim's
 *    lord. Expired or ended: bonds back.
 *  - Tribute: the room passes a vassal's store gain since the last levy and its citizens' stall coin; the overlord's
 *    lord gets tribute_pct of it in his strongroom (the caller takes the same out of the vassal's store and stalls).
 *    Ties are exempt from abuse.ts's gift caps, but no tie forms (nor tribute flows) between linked accounts.
 *  - Rebel: a vassal's lord ends the tie (garrison out); logged. Attacks are logged; tellOf() is who must hear.
 *  - Season end: settlements at Town level (SETTLE.persistLevel) or tended within SETTLE.tendMs persist; the rest go.
 *
 * Offer states: open -> accepted | refused | cancelled | expired; a truce open -> active -> ended | broken.
 */
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { ApiError } from '../errors';
import { linked } from './abuse';
import { crownTax } from './crown';
import { batch, guard, lotsOf, planTake, putLotsStmts, putStmt, round, strongroom, totalsOf, type Goods } from './holders';

const HOUR = 3_600_000;
export const SETTLE = {
  r: 24, offerMs: 48 * HOUR, tributeMax: 30, presence: 6, truceMs: 7 * 24 * HOUR, bondMax: 5000,
  tendMs: 72 * HOUR, persistLevel: 4, nameMax: 32,
};

export type Role = 'lord' | 'citizen' | 'garrison';
export type OfferKind = 'settle' | 'vassal' | 'join' | 'garrison' | 'truce';
export interface Plot { x0: number; y0: number; x1: number; y1: number }
export interface Circle { x: number; y: number; r: number }
export interface Settlement extends Circle {
  id: number; region: string; centre_piece: number; name: string; lord_pid: number; level: number; overlord_id: number | null;
  tribute_pct: number; founded_season: number; tended_at: number; levied_at: number; persist: string;
}
export interface Member { settlement_id: number; player_id: number; role: Role; x0: number | null; y0: number | null; x1: number | null; y1: number | null; since: number }
export interface Offer {
  id: number; kind: OfferKind; from_pid: number; from_settlement: number | null; to_settlement: number; tribute_pct: number; bond: number;
  state: string; expires_at: number; ends_at: number | null; created_at: number;
}

/**
 * The region room's answer to "do this player's men (at least SETTLE.presence) stand on this settlement's ground?",
 * asked by the terms route. Wired by the room; until then no terms can be offered over REST.
 */
export const PRESENCE: { check: (pid: number, s: Settlement) => Promise<boolean> } = { check: async () => false };

// ---------------------------------------------------------------- pure rules

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Is a new settlement's circle far enough (r + other.r) from every other centre? */
export const farEnough = (c: Circle, others: readonly Circle[]) => others.every((o) => dist(c, o) >= c.r + o.r);

/** Every corner of the plot inside the circle? */
export const plotInside = (c: Circle, p: Plot) => p.x0 <= p.x1 && p.y0 <= p.y1 && [[p.x0, p.y0], [p.x0, p.y1], [p.x1, p.y0], [p.x1, p.y1]].every(([x, y]) => dist(c, { x, y }) <= c.r);

/** Do two plots (inclusive tile rects) share a tile? */
export const overlaps = (a: Plot, b: Plot) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** Why a plot may not be given (null: it may). */
export function plotRefusal(c: Circle, p: Plot, taken: readonly Plot[]): string | null {
  if (![p.x0, p.y0, p.x1, p.y1].every(Number.isInteger)) return 'A plot is whole tiles';
  if (!plotInside(c, p)) return 'The plot must lie inside the settlement';
  if (taken.some((t) => overlaps(p, t))) return 'The plot overlaps another';
  return null;
}

/** Tribute on a store gain plus stall coin at `pct` (capped at SETTLE.tributeMax). */
export function tributeOf(pct: number, gain: Goods, stallCoin: number): Goods {
  const k = Math.max(0, Math.min(SETTLE.tributeMax, pct)) / 100, out: Goods = {};
  for (const [res, n] of Object.entries({ ...gain, coin: (gain.coin ?? 0) + Math.max(0, stallCoin) })) {
    const t = round(Math.max(0, n) * k);
    if (t > 0) out[res] = t;
  }
  return out;
}

/** Does a settlement persist over the season's end? */
export const keeps = (s: Pick<Settlement, 'level' | 'tended_at'>, now: number) => s.level >= SETTLE.persistLevel || now - s.tended_at < SETTLE.tendMs;

const plotOf = (m: Member): Plot | null => (m.x0 === null ? null : { x0: m.x0, y0: m.y0!, x1: m.x1!, y1: m.y1! });

// ---------------------------------------------------------------- reads

export async function settlement(db: D1Database, id: number): Promise<Settlement> {
  const s = await db.prepare('SELECT * FROM war_settlements WHERE id = ?1').bind(id).first<Settlement>();
  if (!s) throw new ApiError(404, 'not_found', 'No such settlement');
  return s;
}

export async function members(db: D1Database, id: number): Promise<Member[]> {
  return (await db.prepare('SELECT * FROM war_settlement_members WHERE settlement_id = ?1 ORDER BY since, player_id').bind(id).all<Member>()).results;
}

/** Settlements of a region (or the world), with the lord's name and the member count. */
export async function settlementsOf(db: D1Database, region?: string) {
  const rows = await db
    .prepare(
      `SELECT s.id, s.region, s.x, s.y, s.r, s.name, s.lord_pid, p.display_name AS lord, s.level, s.overlord_id, s.tribute_pct,
              (SELECT COUNT(*) FROM war_settlement_members m WHERE m.settlement_id = s.id AND m.role != 'garrison') AS people
       FROM war_settlements s LEFT JOIN players p ON p.id = s.lord_pid WHERE ?1 IS NULL OR s.region = ?1 ORDER BY s.region, s.id`,
    )
    .bind(region ?? null)
    .all();
  return rows.results;
}

/** A settlement with its members (names). */
export async function settlementView(db: D1Database, id: number) {
  const s = await settlement(db, id);
  const ms = (await db
    .prepare('SELECT m.player_id AS pid, p.display_name AS name, m.role, m.x0, m.y0, m.x1, m.y1, m.since FROM war_settlement_members m LEFT JOIN players p ON p.id = m.player_id WHERE m.settlement_id = ?1 ORDER BY m.since, m.player_id')
    .bind(id)
    .all()).results;
  const { persist: _p, ...rest } = s;
  return { ...rest, members: ms };
}

async function offer(db: D1Database, id: number): Promise<Offer> {
  const o = await db.prepare('SELECT * FROM war_settlement_offers WHERE id = ?1').bind(id).first<Offer>();
  if (!o) throw new ApiError(404, 'not_found', 'No such offer');
  return o;
}

/** The settlement's overlords, nearest first (no cycles: vassal accept refuses them). */
async function overlords(db: D1Database, s: Settlement): Promise<Settlement[]> {
  const out: Settlement[] = [];
  for (let cur = s; cur.overlord_id !== null && out.length < 16; ) {
    const o = await db.prepare('SELECT * FROM war_settlements WHERE id = ?1').bind(cur.overlord_id).first<Settlement>();
    if (!o || out.some((x) => x.id === o.id)) break;
    out.push((cur = o));
  }
  return out;
}

/** Who must hear of an attack on a settlement: its lord and its overlords' lords. */
export async function tellOf(db: D1Database, id: number): Promise<number[]> {
  const s = await settlement(db, id);
  return [...new Set([s.lord_pid, ...(await overlords(db, s)).map((o) => o.lord_pid)])];
}

// ---------------------------------------------------------------- found, report

export interface FoundIn { region: string; centre: number; x: number; y: number; r?: number; name?: string; lord: number }

/**
 * A room reports a finished camp: found a settlement round it, the builder its lord (the same camp twice: its id).
 * `mapOk` answers for the map (claim points, landmarks, homes): null when the spot is allowed, else why not.
 */
export async function found(db: D1Database, f: FoundIn, mapOk: (c: Circle) => string | null, now: number): Promise<number> {
  const had = await db.prepare('SELECT id FROM war_settlements WHERE region = ?1 AND centre_piece = ?2').bind(f.region, f.centre).first<{ id: number }>();
  if (had) return had.id;
  const c = { x: Math.round(f.x), y: Math.round(f.y), r: f.r ?? SETTLE.r };
  const others = (await db.prepare('SELECT x, y, r FROM war_settlements WHERE region = ?1').bind(f.region).all<Circle>()).results;
  if (!farEnough(c, others)) throw new ApiError(409, 'too_close', 'Too close to another settlement');
  const why = mapOk(c);
  if (why) throw new ApiError(409, 'bad_spot', why);
  const name = (f.name ?? '').trim().slice(0, SETTLE.nameMax) || 'Camp';
  const r = await db
    .prepare('INSERT INTO war_settlements (region, centre_piece, x, y, r, name, lord_pid, founded_season, tended_at, levied_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) RETURNING id')
    .bind(f.region, f.centre, c.x, c.y, c.r, name, f.lord, WAR_SEASON.id, now)
    .first<{ id: number }>();
  await db.prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'lord', ?3)").bind(r!.id, f.lord, now).run();
  return r!.id;
}

/** A room reports a settlement's town level, what persists of it (buildings, JSON) and that it was tended now. */
export async function report(db: D1Database, id: number, r: { level?: number; persist?: unknown; tended?: boolean }, now: number): Promise<void> {
  await db
    .prepare('UPDATE war_settlements SET level = coalesce(?2, level), persist = coalesce(?3, persist), tended_at = CASE WHEN ?4 THEN ?5 ELSE tended_at END WHERE id = ?1')
    .bind(id, r.level ?? null, r.persist === undefined ? null : JSON.stringify(r.persist), r.tended ? 1 : 0, now)
    .run();
}

// ---------------------------------------------------------------- offers

const escrow = (id: number, side: 'from' | 'to') => `tb:${id}:${side}`;

/** Everything in an escrow back into a strongroom (statements). */
async function releaseStmts(db: D1Database, from: string, to: string): Promise<D1PreparedStatement[]> {
  const lots = await lotsOf(db, from);
  if (!lots.length) return [];
  const p = planTake(db, from, lots, totalsOf(lots));
  return [...p.stmts, ...putLotsStmts(db, to, p.taken)];
}

const lordOf = async (db: D1Database, id: number | null) => (id === null ? null : ((await db.prepare('SELECT lord_pid FROM war_settlements WHERE id = ?1').bind(id).first<{ lord_pid: number }>())?.lord_pid ?? null));

/** Close open offers past their time and truces past their end, bonds back (lazily, on any touch). */
export async function expireOffers(db: D1Database, now: number): Promise<void> {
  const rows = (await db.prepare("SELECT * FROM war_settlement_offers WHERE (state = 'open' AND expires_at <= ?1) OR (state = 'active' AND ends_at <= ?1)").bind(now).all<Offer>()).results;
  for (const o of rows) {
    const open = o.state === 'open';
    const stmts = [db.prepare('UPDATE war_settlement_offers SET state = ?2 WHERE id = ?1 AND state = ?3').bind(o.id, open ? 'expired' : 'ended', o.state)];
    if (o.kind === 'truce') {
      stmts.unshift(guard(db, '(SELECT state FROM war_settlement_offers WHERE id = ?1) = ?2', o.id, o.state));
      stmts.push(...(await releaseStmts(db, escrow(o.id, 'from'), strongroom(open ? o.from_pid : ((await lordOf(db, o.from_settlement)) ?? o.from_pid)))));
      const to = await lordOf(db, o.to_settlement);
      if (!open && to !== null) stmts.push(...(await releaseStmts(db, escrow(o.id, 'to'), strongroom(to))));
    }
    await batch(db, stmts);
  }
}

async function mustLord(db: D1Database, pid: number, id: number): Promise<Settlement> {
  const s = await settlement(db, id);
  if (s.lord_pid !== pid) throw new ApiError(403, 'not_lord', 'You are not its lord');
  return s;
}

async function noLink(db: D1Database, a: number, b: number, now: number): Promise<void> {
  if (await linked(db, a, b, now)) throw new ApiError(409, 'linked', 'These accounts shared an address or device: no tie between them');
}

async function insertOffer(db: D1Database, o: { kind: OfferKind; from: number; fromS: number | null; to: number; pct?: number; bond?: number; state?: string }, now: number): Promise<number> {
  const dup = await db.prepare("SELECT 1 FROM war_settlement_offers WHERE kind = ?1 AND from_pid = ?2 AND to_settlement = ?3 AND state IN ('open', 'active')").bind(o.kind, o.from, o.to).first();
  if (dup) throw new ApiError(409, 'pending', 'You have one open already');
  return (await db
    .prepare('INSERT INTO war_settlement_offers (kind, from_pid, from_settlement, to_settlement, tribute_pct, bond, state, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id')
    .bind(o.kind, o.from, o.fromS, o.to, o.pct ?? 0, o.bond ?? 0, o.state ?? 'open', now + SETTLE.offerMs, now)
    .first<{ id: number }>())!.id;
}

/** Ask a settlement for a plot. */
export async function requestSettle(db: D1Database, pid: number, id: number, now: number): Promise<number> {
  await settlement(db, id);
  if (await db.prepare("SELECT 1 FROM war_settlement_members WHERE settlement_id = ?1 AND player_id = ?2 AND role != 'garrison'").bind(id, pid).first()) throw new ApiError(409, 'member', 'You live there already');
  return insertOffer(db, { kind: 'settle', from: pid, fromS: null, to: id }, now);
}

/**
 * Offer terms to a settlement whose ground the offerer's men stand on (`present`, the room's check): vassal (the
 * offerer's settlement `from` its overlord, tribute `pct`) or join (the offerer its lord).
 */
export async function offerTerms(db: D1Database, pid: number, kind: 'vassal' | 'join', to: number, from: number | null, pct: number, present: boolean, now: number): Promise<number> {
  if (!present) throw new ApiError(409, 'not_present', `At least ${SETTLE.presence} of your men must stand on its ground`);
  const t = await settlement(db, to);
  if (t.lord_pid === pid) throw new ApiError(409, 'yours', 'It is yours');
  if (kind === 'vassal') {
    if (from === null || from === to) throw new ApiError(400, 'bad_request', 'Your settlement to be its overlord');
    await mustLord(db, pid, from);
    if (!Number.isInteger(pct) || pct < 0 || pct > SETTLE.tributeMax) throw new ApiError(400, 'bad_request', `Tribute 0 to ${SETTLE.tributeMax} %`);
    if (t.overlord_id !== null) throw new ApiError(409, 'vassal', 'It has an overlord');
  }
  await noLink(db, pid, t.lord_pid, now);
  return insertOffer(db, { kind, from: pid, fromS: kind === 'vassal' ? from : null, to, pct: kind === 'vassal' ? pct : 0 }, now);
}

/** An overlord's lord asks to garrison his vassal. */
export async function offerGarrison(db: D1Database, pid: number, from: number, to: number, now: number): Promise<number> {
  await mustLord(db, pid, from);
  const t = await settlement(db, to);
  if (t.overlord_id !== from) throw new ApiError(409, 'not_vassal', 'It is not your vassal');
  return insertOffer(db, { kind: 'garrison', from: pid, fromS: from, to }, now);
}

/** A lord offers a truce between his settlement and another, escrowing `bond` coin from his strongroom. */
export async function offerTruce(db: D1Database, pid: number, from: number, to: number, bond: number, now: number): Promise<number> {
  if (from === to) throw new ApiError(400, 'bad_request', 'A truce is between two settlements');
  if (!Number.isInteger(bond) || bond < 1 || bond > SETTLE.bondMax) throw new ApiError(400, 'bad_request', `A bond of 1 to ${SETTLE.bondMax} coin`);
  await mustLord(db, pid, from);
  const t = await settlement(db, to);
  if (t.lord_pid === pid) throw new ApiError(409, 'yours', 'Both are yours');
  await noLink(db, pid, t.lord_pid, now);
  const take = planTake(db, strongroom(pid), await lotsOf(db, strongroom(pid)), { coin: bond });
  const id = await insertOffer(db, { kind: 'truce', from: pid, fromS: from, to, bond, state: 'cancelled' }, now);
  await batch(db, [...take.stmts, ...putLotsStmts(db, escrow(id, 'from'), take.taken), db.prepare("UPDATE war_settlement_offers SET state = 'open' WHERE id = ?1").bind(id)]);
  return id;
}

const isOpen = (db: D1Database, id: number) => guard(db, "(SELECT state FROM war_settlement_offers WHERE id = ?1) = 'open'", id);
const markStmt = (db: D1Database, id: number, state: string, endsAt: number | null = null) =>
  db.prepare("UPDATE war_settlement_offers SET state = ?2, ends_at = ?3 WHERE id = ?1 AND state = 'open'").bind(id, state, endsAt);

/** The lord of the asked settlement accepts (a settle request with the plot to give). */
export async function accept(db: D1Database, pid: number, id: number, plot: Plot | null, now: number): Promise<string> {
  await expireOffers(db, now);
  const o = await offer(db, id);
  if (o.state !== 'open') throw new ApiError(409, 'closed', 'The offer is closed');
  const s = await mustLord(db, pid, o.to_settlement);
  const ms = await members(db, s.id);
  const stmts: D1PreparedStatement[] = [isOpen(db, id)];
  if (o.kind !== 'settle') await noLink(db, o.from_pid, pid, now);
  if (o.kind === 'settle') {
    if (!plot) throw new ApiError(400, 'bad_request', 'Give a plot');
    const why = plotRefusal(s, plot, ms.filter((m) => m.player_id !== o.from_pid).map(plotOf).filter((p): p is Plot => !!p));
    if (why) throw new ApiError(409, 'bad_plot', why);
    stmts.push(
      db
        .prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, x0, y0, x1, y1, since) VALUES (?1, ?2, 'citizen', ?3, ?4, ?5, ?6, ?7) ON CONFLICT (settlement_id, player_id) DO UPDATE SET role = 'citizen', x0 = ?3, y0 = ?4, x1 = ?5, y1 = ?6")
        .bind(s.id, o.from_pid, plot.x0, plot.y0, plot.x1, plot.y1, now),
      markStmt(db, id, 'accepted'),
    );
  } else if (o.kind === 'vassal') {
    if (s.overlord_id !== null) throw new ApiError(409, 'vassal', 'It has an overlord');
    const over = await settlement(db, o.from_settlement!);
    if (over.lord_pid !== o.from_pid) throw new ApiError(409, 'changed', 'The offerer no longer rules that settlement');
    if (over.id === s.id || (await overlords(db, over)).some((x) => x.id === s.id)) throw new ApiError(409, 'cycle', 'Your own overlord cannot be your vassal');
    stmts.push(db.prepare('UPDATE war_settlements SET overlord_id = ?2, tribute_pct = ?3, levied_at = ?4 WHERE id = ?1 AND overlord_id IS NULL').bind(s.id, over.id, o.tribute_pct, now), markStmt(db, id, 'accepted'));
  } else if (o.kind === 'join') {
    stmts.push(
      db.prepare("UPDATE war_settlement_members SET role = 'citizen' WHERE settlement_id = ?1 AND player_id = ?2").bind(s.id, pid),
      db.prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'lord', ?3) ON CONFLICT (settlement_id, player_id) DO UPDATE SET role = 'lord'").bind(s.id, o.from_pid, now),
      db.prepare('UPDATE war_settlements SET lord_pid = ?2 WHERE id = ?1').bind(s.id, o.from_pid),
      markStmt(db, id, 'accepted'),
    );
  } else if (o.kind === 'garrison') {
    if (s.overlord_id !== o.from_settlement) throw new ApiError(409, 'not_vassal', 'No longer a vassal of theirs');
    stmts.push(
      db.prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'garrison', ?3) ON CONFLICT (settlement_id, player_id) DO NOTHING").bind(s.id, o.from_pid, now),
      markStmt(db, id, 'accepted'),
    );
  } else {
    const take = planTake(db, strongroom(pid), await lotsOf(db, strongroom(pid)), { coin: o.bond });
    stmts.push(...take.stmts, ...putLotsStmts(db, escrow(id, 'to'), take.taken), markStmt(db, id, 'active', now + SETTLE.truceMs));
  }
  await batch(db, stmts);
  return o.kind === 'truce' ? 'active' : 'accepted';
}

/** The asked lord refuses, or the offerer withdraws (an open truce's bond back to him). */
export async function refuse(db: D1Database, pid: number, id: number, now: number): Promise<string> {
  await expireOffers(db, now);
  const o = await offer(db, id);
  if (o.state !== 'open') throw new ApiError(409, 'closed', 'The offer is closed');
  const state = o.from_pid === pid ? 'cancelled' : (await lordOf(db, o.to_settlement)) === pid ? 'refused' : null;
  if (!state) throw new ApiError(403, 'not_party', 'Not your offer');
  await batch(db, [isOpen(db, id), markStmt(db, id, state), ...(o.kind === 'truce' ? await releaseStmts(db, escrow(id, 'from'), strongroom(o.from_pid)) : [])]);
  return state;
}

/** Requests and offers that concern the player: to settlements he rules (open), his own (open), truces of his. */
export async function inbox(db: D1Database, pid: number, now: number) {
  await expireOffers(db, now);
  const cols = 'o.id, o.kind, o.from_pid, p.display_name AS from_name, o.from_settlement, o.to_settlement, s.name AS to_name, o.tribute_pct, o.bond, o.state, o.expires_at, o.ends_at';
  const base = `FROM war_settlement_offers o JOIN war_settlements s ON s.id = o.to_settlement LEFT JOIN players p ON p.id = o.from_pid`;
  const q = async (where: string) => (await db.prepare(`SELECT ${cols} ${base} WHERE ${where} ORDER BY o.created_at`).bind(pid).all()).results;
  return {
    incoming: await q("o.state = 'open' AND s.lord_pid = ?1"),
    outgoing: await q("o.state = 'open' AND o.from_pid = ?1"),
    truces: await q("o.kind = 'truce' AND o.state = 'active' AND (s.lord_pid = ?1 OR o.from_settlement IN (SELECT id FROM war_settlements WHERE lord_pid = ?1))"),
  };
}

// ---------------------------------------------------------------- ties at work

const logStmt = (db: D1Database, id: number, kind: 'attack' | 'tribute' | 'rebellion' | 'truce_break', other: number | null, actor: number | null, detail: unknown, now: number) =>
  db.prepare('INSERT INTO war_settlement_log (settlement_id, kind, other_id, actor_id, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, kind, other, actor, JSON.stringify(detail), now);

/**
 * Levy a vassal's tribute: `gain` its store's goods gained since the last levy, `stallCoin` its citizens' stall coin
 * since then. The overlord's lord gets the tribute in his strongroom; returns it (null: no overlord, or linked lords),
 * for the caller to take out of the vassal's store and stalls (`extra`: statements that take the stalls' share, in the
 * same batch as the credit).
 */
export async function levy(db: D1Database, id: number, gain: Goods, stallCoin: number, now: number, extra: readonly D1PreparedStatement[] = []): Promise<{ overlord: number; lord: number; goods: Goods } | null> {
  const s = await settlement(db, id);
  if (s.overlord_id === null) return null;
  const ov = await settlement(db, s.overlord_id);
  if (await linked(db, s.lord_pid, ov.lord_pid, now)) return null;
  const goods = tributeOf(s.tribute_pct, gain, stallCoin);
  await db.batch([
    ...Object.entries(goods).map(([res, n]) => putStmt(db, strongroom(ov.lord_pid), res, n, s.region)),
    ...(await crownTax(db, ov.lord_pid, goods.coin ?? 0, strongroom(ov.lord_pid), s.region)), // W-64: the alliance tax on tribute
    db.prepare('UPDATE war_settlements SET levied_at = ?2 WHERE id = ?1').bind(id, now),
    logStmt(db, id, 'tribute', ov.id, s.lord_pid, { goods, pct: s.tribute_pct }, now),
    ...extra,
  ]);
  return { overlord: ov.id, lord: ov.lord_pid, goods };
}

/** A vassal's lord rebels: the tie ends, the overlord's garrison is out. Returns the old overlord. */
export async function rebel(db: D1Database, pid: number, id: number, now: number): Promise<number> {
  const s = await mustLord(db, pid, id);
  if (s.overlord_id === null) throw new ApiError(409, 'free', 'It has no overlord');
  await db.batch([
    db.prepare('UPDATE war_settlements SET overlord_id = NULL, tribute_pct = 0 WHERE id = ?1').bind(id),
    db.prepare("DELETE FROM war_settlement_members WHERE settlement_id = ?1 AND role = 'garrison'").bind(id),
    logStmt(db, id, 'rebellion', s.overlord_id, pid, {}, now),
  ]);
  return s.overlord_id;
}

/**
 * The room logs an attack by player `by` on settlement `victim`. An attack on a vassal is one on its overlords too:
 * active truces between a settlement `by` rules and the victim or an overlord of it break, both bonds to the lord of
 * the side attacked. Returns who must be told and the truces broken.
 */
export async function logAttack(db: D1Database, by: number, victim: number, now: number): Promise<{ tell: number[]; broken: number[] }> {
  await expireOffers(db, now);
  const v = await settlement(db, victim);
  const hit = [v, ...(await overlords(db, v))];
  const mine = (await db.prepare('SELECT id FROM war_settlements WHERE lord_pid = ?1').bind(by).all<{ id: number }>()).results.map((r) => r.id);
  const stmts: D1PreparedStatement[] = [logStmt(db, victim, 'attack', mine[0] ?? null, by, { overlords: hit.slice(1).map((h) => h.id) }, now)];
  const broken: number[] = [];
  if (mine.length) {
    const ids = JSON.stringify(hit.map((h) => h.id)), own = JSON.stringify(mine);
    const truces = (await db
      .prepare(
        `SELECT * FROM war_settlement_offers WHERE kind = 'truce' AND state = 'active' AND (
           (from_settlement IN (SELECT value FROM json_each(?2)) AND to_settlement IN (SELECT value FROM json_each(?1))) OR
           (to_settlement IN (SELECT value FROM json_each(?2)) AND from_settlement IN (SELECT value FROM json_each(?1))))`,
      )
      .bind(ids, own)
      .all<Offer>()).results;
    for (const t of truces) {
      const side = hit.find((h) => h.id === t.to_settlement || h.id === t.from_settlement)!;
      const to = strongroom(side.lord_pid);
      stmts.push(
        guard(db, "(SELECT state FROM war_settlement_offers WHERE id = ?1) = 'active'", t.id),
        db.prepare("UPDATE war_settlement_offers SET state = 'broken' WHERE id = ?1 AND state = 'active'").bind(t.id),
        ...(await releaseStmts(db, escrow(t.id, 'from'), to)),
        ...(await releaseStmts(db, escrow(t.id, 'to'), to)),
        logStmt(db, side.id, 'truce_break', side.id === t.to_settlement ? t.from_settlement : t.to_settlement, by, { truce: t.id, bond: t.bond }, now),
      );
      broken.push(t.id);
    }
  }
  await batch(db, stmts);
  return { tell: [...new Set(hit.map((h) => h.lord_pid))].filter((p) => p !== by), broken };
}

// ---------------------------------------------------------------- season end

/**
 * The season's end: settlements at Town level or tended within SETTLE.tendMs persist (with their buildings in
 * `persist` and their ties); the rest go, with their members, offers and log. Truce bonds of the gone go back;
 * vassals of a gone overlord are free.
 */
export async function seasonSweep(db: D1Database, now: number): Promise<{ kept: Settlement[]; removed: number[] }> {
  await expireOffers(db, now);
  const all = (await db.prepare('SELECT * FROM war_settlements ORDER BY id').all<Settlement>()).results;
  const kept = all.filter((s) => keeps(s, now)), removed = all.filter((s) => !keeps(s, now)).map((s) => s.id);
  if (!removed.length) return { kept, removed };
  const gone = JSON.stringify(removed), lord = new Map(all.map((s) => [s.id, s.lord_pid]));
  const ties = (await db
    .prepare("SELECT * FROM war_settlement_offers WHERE kind = 'truce' AND state IN ('open', 'active') AND (to_settlement IN (SELECT value FROM json_each(?1)) OR from_settlement IN (SELECT value FROM json_each(?1)))")
    .bind(gone)
    .all<Offer>()).results;
  const stmts: D1PreparedStatement[] = [];
  for (const t of ties) {
    stmts.push(...(await releaseStmts(db, escrow(t.id, 'from'), strongroom(t.state === 'open' ? t.from_pid : (lord.get(t.from_settlement!) ?? t.from_pid)))));
    const to = lord.get(t.to_settlement);
    if (to !== undefined) stmts.push(...(await releaseStmts(db, escrow(t.id, 'to'), strongroom(to))));
  }
  const inGone = 'IN (SELECT value FROM json_each(?1))';
  stmts.push(
    db.prepare(`DELETE FROM war_settlement_offers WHERE to_settlement ${inGone} OR from_settlement ${inGone}`).bind(gone),
    db.prepare(`DELETE FROM war_settlement_members WHERE settlement_id ${inGone}`).bind(gone),
    db.prepare(`DELETE FROM war_settlement_log WHERE settlement_id ${inGone}`).bind(gone),
    db.prepare(`UPDATE war_settlements SET overlord_id = NULL, tribute_pct = 0 WHERE overlord_id ${inGone}`).bind(gone),
    db.prepare(`DELETE FROM war_settlements WHERE id ${inGone}`).bind(gone),
  );
  await batch(db, stmts);
  return { kept: kept.map((s) => (s.overlord_id !== null && removed.includes(s.overlord_id) ? { ...s, overlord_id: null, tribute_pct: 0 } : s)), removed };
}
