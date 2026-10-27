/**
 * W-64 crown and council (docs/impl/global-war-rebuild.md W-64; migrations/0046_war_crown.sql; numbers, pure rules and
 * views: src/war/net/crown.ts). One crown per alliance and season; state moves lazily (`advance`, on every read and act).
 *
 *  - Realm power: the levels of the settlements a member rules (W-63), his vassals' levels and one per region held.
 *  - Election: when the crown is empty or the term is over, the top CROWN.candidates by power stand; members vote for
 *    CROWN.voteMs (weight 1 + a capped bonus by the level of their best settlement); the most weight wins, ties to the
 *    higher power. The winner reigns CROWN.termMs from the close; a new monarch's council is dismissed. While an
 *    election runs after a term the old monarch stays as regent (he still acts).
 *  - No confidence: a petition signed by CROWN.petitionShare of the active members (seen within CROWN.activeMs) within
 *    CROWN.petitionMs opens a vote of CROWN.voteMs; a weighted majority of yes removes the monarch (no regent) and a new
 *    election opens. A failed petition or vote: none again for CROWN.cooldownMs.
 *  - Council: the monarch appoints and dismisses the Marshal, Treasurer, Envoy and Quartermaster (members; one office
 *    each). The monarch may also use every office's tools.
 *  - Treasury (war_goods `cr:<season>:<alliance>`): members deposit coin; the alliance tax (Treasurer, 0..CROWN.taxMax %)
 *    takes its share of members' market sales (./tradeScore.ts fill hook) and tribute received (./settlements.ts levy);
 *    the Treasurer gives from it to works (./works.ts give) and tops up the reward of the alliance's taken build and
 *    guard contracts (at most their reward again per grant).
 *  - Orders are bounties, not control: the bounty is held from the treasury when posted. Marshal: attack and defend
 *    marks on a region (and a landmark or spot), paid at their close (by the Marshal or at expiry) to members whose men
 *    fought in that region while it stood (1 + kills each a share; the region DO's fight hook, `bookFight`); rally marks
 *    carry no bounty. Quartermaster: supply quests "bring n of a good to town X": a member hands it from his sites there
 *    (warehouse, stall; strongroom at home) into the treasury and is paid pro rata on each delivery. A fulfilled order
 *    scores CROWN.orderPts (war goals war, quests peace; the tasks' daily caps). Nothing left unearned is lost: back to
 *    the treasury.
 *  - Envoy: pacts and truces with another alliance, offered by one envoy and accepted by the other (records). An attack
 *    on a settlement of the other side by a member while one is active breaks it (`pactAttack`, the region DO), logged
 *    and announced to both alliances.
 *  - Season: the world's rollover (`crownSeason`) ends every term (the monarch regent until the new election closes),
 *    voids running votes and settles open orders.
 */
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import {
  candidatesOf, confidenceLost, CROWN, electionWinner, OFFICES, petitionNeed, realmPower, splitBounty, voteWeight,
  type Candidate, type CrownMember, type CrownOrder, type CrownPact, type CrownView, type Office, type OrderKind, type PactKind, type RealmSettlement,
} from '../../../src/war/net/crown';
import type { FightReport } from '../../../src/war/types';
import type { Env } from '../env';
import { ApiError } from '../errors';
import { linked } from './abuse';
import { contract, fromSites } from './contracts';
import { batch, goodsOf, guard, HOME, lotsOf, planTake, putLotsStmts, putStmt, strongroom, type Goods } from './holders';
import { townOf } from './market';
import { json, fightTally } from './persons';
import { scorePeace } from './peace';
import { WAR_REGIONS } from './regions';
import { payStmts } from './tasks';
import { give as giveWork } from './works';
import { allianceOf } from './world/members';

const EPS = 1e-6;
export const treasuryOf = (a: number, season = WAR_SEASON.id) => `cr:${season}:${a}`;
const cents = (n: number) => Math.floor(n * 100 + EPS) / 100;

interface CrownRow { season: number; alliance: number; monarch_pid: number | null; crowned_at: number | null; term_ends: number; tax_pct: number; taxed: number }
interface VoteRow { id: number; season: number; alliance: number; kind: 'election' | 'confidence'; state: 'petition' | 'open' | 'closed'; target_pid: number | null; candidates: string; opens_at: number; closes_at: number; result: string; winner_pid: number | null; created_at: number }
export interface OrderRow { id: number; season: number; alliance: number; kind: OrderKind; posted_by: number; region: string; target: string | null; x: number | null; y: number | null; res: string | null; n: number; delivered: number; bounty: number; paid: number; state: string; expires_at: number; closed_at: number | null; created_at: number }
interface PactRow { id: number; season: number; alliance_a: number; alliance_b: number; kind: PactKind; state: string; offered_by: number; answered_by: number | null; broken_by: number | null; expires_at: number; ends_at: number | null; created_at: number }

const logStmt = (db: D1Database, season: number, a: number, kind: string, actor: number | null, detail: unknown, now: number) =>
  db.prepare('INSERT INTO war_crown_log (season, alliance, kind, actor_id, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(season, a, kind, actor, JSON.stringify(detail), now);

const nameOf = async (db: D1Database, pid: number) => (await db.prepare('SELECT display_name AS n FROM players WHERE id = ?1').bind(pid).first<{ n: string }>())?.n ?? `#${pid}`;

async function crownOf(db: D1Database, a: number, season: number): Promise<CrownRow> {
  await db.prepare('INSERT OR IGNORE INTO war_crowns (season, alliance) VALUES (?1, ?2)').bind(season, a).run();
  return (await db.prepare('SELECT * FROM war_crowns WHERE season = ?1 AND alliance = ?2').bind(season, a).first<CrownRow>())!;
}

async function mustMember(db: D1Database, pid: number, season: number): Promise<number> {
  const a = await allianceOf(db, pid, season);
  if (a === null) throw new ApiError(409, 'no_alliance', 'Join an alliance first');
  return a;
}

// ---------------------------------------------------------------- power and members

const realm = async (db: D1Database): Promise<RealmSettlement[]> =>
  (await db.prepare('SELECT id, region, lord_pid, level, overlord_id FROM war_settlements').all<RealmSettlement>()).results;

/** The alliance's members this season with their realm power and vote weight (by id). */
export async function membersOf(db: D1Database, a: number, season = WAR_SEASON.id): Promise<CrownMember[]> {
  const rows = (await db
    .prepare('SELECT m.player_id AS pid, p.display_name AS name FROM war_alliance_members m LEFT JOIN players p ON p.id = m.player_id WHERE m.season = ?1 AND m.alliance = ?2 ORDER BY m.player_id')
    .bind(season, a)
    .all<{ pid: number; name: string | null }>()).results;
  if (!rows.length) return [];
  const all = await realm(db);
  const best = new Map((await db
    .prepare("SELECT mm.player_id AS pid, MAX(s.level) AS lv FROM war_settlement_members mm JOIN war_settlements s ON s.id = mm.settlement_id WHERE mm.role != 'garrison' GROUP BY mm.player_id")
    .all<{ pid: number; lv: number }>()).results.map((r) => [r.pid, r.lv]));
  return rows.map((r) => ({ pid: r.pid, name: r.name ?? `#${r.pid}`, power: realmPower(r.pid, all), weight: voteWeight(best.get(r.pid) ?? 0) }));
}

// ---------------------------------------------------------------- the lazy clock

async function ballotsOf(db: D1Database, id: number, stage: 'sign' | 'ballot') {
  return (await db.prepare('SELECT player_id AS pid, choice, weight FROM war_crown_ballots WHERE vote_id = ?1 AND stage = ?2').bind(id, stage).all<{ pid: number; choice: number; weight: number }>()).results;
}

/** Close a vote whose time is up (an election crowns its winner; a lost confidence vote removes the monarch). */
async function closeVote(db: D1Database, v: VoteRow, season: number): Promise<void> {
  const at = v.closes_at, stmts: D1PreparedStatement[] = [guard(db, '(SELECT state FROM war_crown_votes WHERE id = ?1) = ?2', v.id, v.state)];
  const close = (result: unknown, winner: number | null = null) =>
    db.prepare("UPDATE war_crown_votes SET state = 'closed', result = ?2, winner_pid = ?3 WHERE id = ?1 AND state = ?4").bind(v.id, JSON.stringify(result), winner, v.state);
  const c = await crownOf(db, v.alliance, season);
  if (v.kind === 'election') {
    const cands = json<Candidate[]>(v.candidates, []), ballots = await ballotsOf(db, v.id, 'ballot'), w = electionWinner(cands, ballots);
    const votes = Object.fromEntries(cands.map((k) => [k.pid, ballots.filter((b) => b.choice === k.pid).reduce((x, b) => x + b.weight, 0)]));
    stmts.push(close({ votes }, w?.pid ?? null));
    if (w) {
      stmts.push(db.prepare('UPDATE war_crowns SET monarch_pid = ?3, crowned_at = ?4, term_ends = ?5 WHERE season = ?1 AND alliance = ?2').bind(season, v.alliance, w.pid, at, at + CROWN.termMs));
      if (w.pid !== c.monarch_pid) stmts.push(db.prepare('DELETE FROM war_crown_offices WHERE season = ?1 AND alliance = ?2').bind(season, v.alliance));
      stmts.push(logStmt(db, season, v.alliance, 'crowned', w.pid, { name: w.name, votes: votes[w.pid] ?? 0, again: w.pid === c.monarch_pid }, at));
    }
  } else if (v.state === 'petition') {
    stmts.push(close({ failed: 'signatures' }), logStmt(db, season, v.alliance, 'petition_failed', null, {}, at));
  } else {
    const ballots = await ballotsOf(db, v.id, 'ballot'), lost = confidenceLost(ballots);
    const yes = ballots.filter((b) => b.choice === 1).reduce((x, b) => x + b.weight, 0), no = ballots.filter((b) => b.choice === 0).reduce((x, b) => x + b.weight, 0);
    stmts.push(close({ yes, no, lost }));
    if (lost && c.monarch_pid !== null && c.monarch_pid === v.target_pid) {
      stmts.push(
        db.prepare('UPDATE war_crowns SET monarch_pid = NULL, term_ends = ?3 WHERE season = ?1 AND alliance = ?2 AND monarch_pid = ?4').bind(season, v.alliance, at, v.target_pid),
        db.prepare('DELETE FROM war_crown_offices WHERE season = ?1 AND alliance = ?2').bind(season, v.alliance),
        logStmt(db, season, v.alliance, 'deposed', v.target_pid, { yes, no }, at),
      );
    } else stmts.push(logStmt(db, season, v.alliance, 'confidence_held', v.target_pid, { yes, no }, at));
  }
  await batch(db, stmts).catch((e) => {
    if (!(e instanceof ApiError && e.code === 'changed')) throw e; // another read closed it first
  });
}

/** Open an election (none open yet): the top members by power stand; a running petition is void. */
async function openElection(db: D1Database, a: number, now: number, season: number): Promise<void> {
  const cands = candidatesOf(await membersOf(db, a, season)).map(({ pid, name, power }) => ({ pid, name, power }));
  if (!cands.length) return;
  const r = await db
    .prepare(
      `INSERT INTO war_crown_votes (season, alliance, kind, state, candidates, opens_at, closes_at, created_at)
       SELECT ?1, ?2, 'election', 'open', ?3, ?4, ?5, ?4 WHERE NOT EXISTS (SELECT 1 FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' AND state = 'open')`,
    )
    .bind(season, a, JSON.stringify(cands), now, now + CROWN.voteMs)
    .run();
  if (!r.meta.changes) return;
  await db.batch([
    db.prepare("UPDATE war_crown_votes SET state = 'closed', result = '{\"void\":\"election\"}' WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state IN ('petition', 'open')").bind(season, a),
    logStmt(db, season, a, 'election', null, { candidates: cands }, now),
  ]);
}

/** Bring alliance `a`'s crown up to `now`: votes due closed, orders and pacts due settled, an election opened when due. */
export async function advance(env: Env, a: number, now: number, season = WAR_SEASON.id): Promise<CrownRow> {
  const db = env.DB!;
  await crownOf(db, a, season);
  const due = (await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND state IN ('petition', 'open') AND closes_at <= ?3 ORDER BY closes_at, id").bind(season, a, now).all<VoteRow>()).results;
  for (const v of due) await closeVote(db, v, season);
  await settleOrders(env, a, now, season);
  await expirePacts(db, now, season);
  const c = await crownOf(db, a, season);
  const open = await db.prepare("SELECT 1 FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' AND state = 'open'").bind(season, a).first();
  if (!open && (c.monarch_pid === null || c.term_ends <= now)) await openElection(db, a, now, season);
  return crownOf(db, a, season);
}

/** May `pid` use office `o`'s tools (its holder, or the monarch, regent included)? */
async function holds(db: D1Database, a: number, pid: number, o: Office | 'crown', season: number): Promise<boolean> {
  const c = await crownOf(db, a, season);
  if (c.monarch_pid === pid) return true;
  if (o === 'crown') return false;
  return !!(await db.prepare('SELECT 1 FROM war_crown_offices WHERE season = ?1 AND alliance = ?2 AND office = ?3 AND player_id = ?4').bind(season, a, o, pid).first());
}
async function mustHold(db: D1Database, a: number, pid: number, o: Office | 'crown', season: number): Promise<void> {
  if (!(await holds(db, a, pid, o, season))) throw new ApiError(403, 'not_office', o === 'crown' ? 'Only the monarch may' : `Only the ${OFFICES.find((x) => x.id === o)!.name} or the monarch may`);
}

const weightOf = async (db: D1Database, a: number, pid: number, season: number) => (await membersOf(db, a, season)).find((m) => m.pid === pid)?.weight ?? 1;

// ---------------------------------------------------------------- votes

/** Vote (or change one's vote) in the running election. */
export async function vote(env: Env, pid: number, candidate: number, now: number, season = WAR_SEASON.id): Promise<void> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  const v = await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' AND state = 'open'").bind(season, a).first<VoteRow>();
  if (!v) throw new ApiError(409, 'no_election', 'No election runs');
  if (!json<Candidate[]>(v.candidates, []).some((c) => c.pid === candidate)) throw new ApiError(400, 'bad_request', 'Not a candidate');
  await db
    .prepare("INSERT INTO war_crown_ballots (vote_id, player_id, stage, choice, weight, at) VALUES (?1, ?2, 'ballot', ?3, ?4, ?5) ON CONFLICT (vote_id, player_id, stage) DO UPDATE SET choice = ?3, weight = ?4, at = ?5")
    .bind(v.id, pid, candidate, await weightOf(db, a, pid, season), now)
    .run();
}

const activeCount = async (db: D1Database, a: number, now: number, season: number) =>
  (await db.prepare('SELECT COUNT(*) AS n FROM war_alliance_members m JOIN players p ON p.id = m.player_id WHERE m.season = ?1 AND m.alliance = ?2 AND p.last_seen_at >= ?3').bind(season, a, now - CROWN.activeMs).first<{ n: number }>())?.n ?? 0;

/** Until when no petition may start: a failed petition or vote shuts it for CROWN.cooldownMs. */
async function cooldownOf(db: D1Database, a: number, season: number): Promise<number> {
  const r = await db
    .prepare("SELECT closes_at FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state = 'closed' AND (json_extract(result, '$.failed') IS NOT NULL OR json_extract(result, '$.lost') = 0) ORDER BY closes_at DESC LIMIT 1")
    .bind(season, a)
    .first<{ closes_at: number }>();
  return r ? r.closes_at + CROWN.cooldownMs : 0;
}

/** Sign the petition against the monarch (opening one when none runs); enough signatures open the vote. */
export async function sign(env: Env, pid: number, now: number, season = WAR_SEASON.id): Promise<{ signs: number; need: number; state: string }> {
  const db = env.DB!, a = await mustMember(db, pid, season), c = await advance(env, a, now, season);
  if (c.monarch_pid === null) throw new ApiError(409, 'no_monarch', 'The crown is empty');
  if (c.monarch_pid === pid) throw new ApiError(409, 'yours', 'You wear the crown');
  if (await db.prepare("SELECT 1 FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' AND state = 'open'").bind(season, a).first()) throw new ApiError(409, 'election', 'An election runs already');
  let v = await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state IN ('petition', 'open')").bind(season, a).first<VoteRow>();
  if (v?.state === 'open') throw new ApiError(409, 'voting', 'The vote is open: cast yours');
  if (!v) {
    if ((await cooldownOf(db, a, season)) > now) throw new ApiError(409, 'cooldown', 'A petition failed lately; wait');
    await db
      .prepare(
        `INSERT INTO war_crown_votes (season, alliance, kind, state, target_pid, opens_at, closes_at, created_at)
         SELECT ?1, ?2, 'confidence', 'petition', ?3, ?4, ?5, ?4 WHERE NOT EXISTS (SELECT 1 FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state IN ('petition', 'open'))`,
      )
      .bind(season, a, c.monarch_pid, now, now + CROWN.petitionMs)
      .run();
    v = (await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state IN ('petition', 'open')").bind(season, a).first<VoteRow>())!;
    await logStmt(db, season, a, 'petition', pid, {}, now).run();
  }
  await db.prepare("INSERT OR IGNORE INTO war_crown_ballots (vote_id, player_id, stage, choice, weight, at) VALUES (?1, ?2, 'sign', 1, 1, ?3)").bind(v.id, pid, now).run();
  const signs = (await ballotsOf(db, v.id, 'sign')).length, need = petitionNeed(await activeCount(db, a, now, season));
  if (v.state === 'petition' && signs >= need) {
    const u = await db.prepare("UPDATE war_crown_votes SET state = 'open', opens_at = ?2, closes_at = ?3 WHERE id = ?1 AND state = 'petition'").bind(v.id, now, now + CROWN.voteMs).run();
    if (u.meta.changes) await logStmt(db, season, a, 'confidence', c.monarch_pid, { signs, need }, now).run();
    return { signs, need, state: 'open' };
  }
  return { signs, need, state: v.state };
}

/** Vote yes (remove him) or no in the open no-confidence vote. */
export async function confidence(env: Env, pid: number, yes: boolean, now: number, season = WAR_SEASON.id): Promise<void> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  const v = await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'confidence' AND state = 'open'").bind(season, a).first<VoteRow>();
  if (!v) throw new ApiError(409, 'no_vote', 'No vote of confidence runs');
  await db
    .prepare("INSERT INTO war_crown_ballots (vote_id, player_id, stage, choice, weight, at) VALUES (?1, ?2, 'ballot', ?3, ?4, ?5) ON CONFLICT (vote_id, player_id, stage) DO UPDATE SET choice = ?3, weight = ?4, at = ?5")
    .bind(v.id, pid, yes ? 1 : 0, await weightOf(db, a, pid, season), now)
    .run();
}

// ---------------------------------------------------------------- council, tax, treasury

/** The monarch appoints `who` (a member, no other office) to `office`, or dismisses its holder (`who` null). */
export async function appoint(env: Env, pid: number, office: Office, who: number | null, now: number, season = WAR_SEASON.id): Promise<void> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, 'crown', season);
  if (who === null) {
    const r = await db.prepare('DELETE FROM war_crown_offices WHERE season = ?1 AND alliance = ?2 AND office = ?3 RETURNING player_id').bind(season, a, office).first<{ player_id: number }>();
    if (r) await logStmt(db, season, a, 'dismissed', pid, { office, pid: r.player_id, name: await nameOf(db, r.player_id) }, now).run();
    return;
  }
  if ((await allianceOf(db, who, season)) !== a) throw new ApiError(409, 'not_member', 'Not a member of your alliance');
  const other = await db.prepare('SELECT office FROM war_crown_offices WHERE season = ?1 AND alliance = ?2 AND player_id = ?3 AND office != ?4').bind(season, a, who, office).first<{ office: string }>();
  if (other) throw new ApiError(409, 'has_office', `Already the ${OFFICES.find((o) => o.id === other.office)?.name ?? other.office}`);
  await db.batch([
    db.prepare('INSERT INTO war_crown_offices (season, alliance, office, player_id, since) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (season, alliance, office) DO UPDATE SET player_id = ?4, since = ?5').bind(season, a, office, who, now),
    logStmt(db, season, a, 'appointed', pid, { office, pid: who, name: await nameOf(db, who) }, now),
  ]);
}

/** The Treasurer sets the alliance tax (whole %, 0..CROWN.taxMax). */
export async function setTax(env: Env, pid: number, pct: number, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, 'treasurer', season);
  if (!Number.isInteger(pct) || pct < 0 || pct > CROWN.taxMax) throw new ApiError(400, 'bad_request', `Tax 0 to ${CROWN.taxMax} %`);
  await db.batch([
    db.prepare('UPDATE war_crowns SET tax_pct = ?3 WHERE season = ?1 AND alliance = ?2').bind(season, a, pct),
    logStmt(db, season, a, 'tax', pid, { pct }, now),
  ]);
  return pct;
}

/**
 * The alliance tax on coin a member earns (a fill's sale, tribute received), held in `from` (lot origin `origin`):
 * statements moving its share into the treasury, in the same batch as the credit and after it (nothing when untaxed).
 */
export async function crownTax(db: D1Database, pid: number, coin: number, from: string, origin = HOME, season = WAR_SEASON.id): Promise<D1PreparedStatement[]> {
  if (!(coin > 0)) return [];
  const a = await allianceOf(db, pid, season);
  if (a === null) return [];
  const c = await db.prepare('SELECT tax_pct FROM war_crowns WHERE season = ?1 AND alliance = ?2').bind(season, a).first<{ tax_pct: number }>();
  const pct = Math.max(0, Math.min(CROWN.taxMax, c?.tax_pct ?? 0)), cut = cents((coin * pct) / 100);
  if (!(cut > 0)) return [];
  return [
    // an UPDATE, not a negative put: the insert's CHECK (amount >= 0) is tested before its conflict is
    db.prepare("UPDATE war_goods SET amount = amount - ?3 WHERE place = ?1 AND res = 'coin' AND origin = ?2 AND seal = 0").bind(from, origin, cut),
    guard(db, "(SELECT changes()) = 1"),
    putStmt(db, treasuryOf(a, season), 'coin', cut, origin),
    db.prepare('UPDATE war_crowns SET taxed = taxed + ?3 WHERE season = ?1 AND alliance = ?2').bind(season, a, cut),
  ];
}

/** A member puts coin of his home strongroom into the treasury. Returns the treasury's coin after. */
export async function deposit(env: Env, pid: number, coin: number, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  const take = planTake(db, strongroom(pid), await lotsOf(db, strongroom(pid)), { coin }, 'You');
  await batch(db, [...take.stmts, ...putLotsStmts(db, treasuryOf(a, season), take.taken), logStmt(db, season, a, 'deposit', pid, { coin }, now)]);
  return (await goodsOf(db, treasuryOf(a, season))).coin ?? 0;
}

/** The Treasurer gives treasury goods to one of the alliance's works (at most what it lacks). Returns what went in. */
export async function fundWork(env: Env, pid: number, work: string, goods: Goods, now: number, season = WAR_SEASON.id): Promise<Goods> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, 'treasurer', season);
  const given = await giveWork(env, pid, work, goods, now, season, treasuryOf(a, season));
  await logStmt(db, season, a, 'fund_work', pid, { work, goods: given }, now).run();
  return given;
}

/** The Treasurer adds treasury coin to a taken build or guard contract of a member (at most its reward per grant). */
export async function fundContract(env: Env, pid: number, id: number, coin: number, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, 'treasurer', season);
  const c = await contract(db, id);
  if (c.kind !== 'build' && c.kind !== 'guard') throw new ApiError(409, 'not_work', 'Only build and guard contracts');
  if (c.state !== 'taken') throw new ApiError(409, 'not_taken', 'Only a contract someone took');
  if ((await allianceOf(db, c.poster, season)) !== a) throw new ApiError(409, 'not_member', 'Its poster is not of your alliance');
  if (c.poster === pid || c.taker === pid) throw new ApiError(409, 'yours', 'Not your own contract');
  if (!(coin > 0) || coin > c.reward + EPS) throw new ApiError(400, 'bad_request', `At most ${c.reward} coin (its reward)`);
  const t = treasuryOf(a, season), take = planTake(db, t, await lotsOf(db, t), { coin }, 'The treasury');
  await batch(db, [
    guard(db, "(SELECT state FROM war_contracts WHERE id = ?1) = 'taken'", id),
    ...take.stmts, ...putLotsStmts(db, `ct:${id}`, take.taken),
    db.prepare('UPDATE war_contracts SET reward = reward + ?2 WHERE id = ?1').bind(id, coin),
    logStmt(db, season, a, 'fund_contract', pid, { contract: id, coin }, now),
  ]);
  return coin;
}

// ---------------------------------------------------------------- orders

export interface OrderIn { kind: OrderKind; region: string; target?: string; x?: number; y?: number; res?: string; n?: number; bounty: number; hours: number }
const WAR_GOAL = (k: string) => k === 'attack' || k === 'defend';
const officeFor = (k: OrderKind): Office => (k === 'supply' ? 'quartermaster' : 'marshal');

/** The Marshal (war goals, rallies) or the Quartermaster (supply quests) posts an order, its bounty held from the treasury. */
export async function postOrder(env: Env, pid: number, o: OrderIn, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, officeFor(o.kind), season);
  if (!WAR_REGIONS.includes(o.region)) throw new ApiError(400, 'bad_request', 'No such region');
  if (!Number.isInteger(o.hours) || o.hours < 1 || o.hours > CROWN.orderHoursMax) throw new ApiError(400, 'bad_request', `1 to ${CROWN.orderHoursMax} hours`);
  const bounty = o.kind === 'rally' ? 0 : cents(o.bounty);
  if (o.kind !== 'rally' && (!(bounty >= 1) || bounty > CROWN.bountyMax)) throw new ApiError(400, 'bad_request', `A bounty of 1 to ${CROWN.bountyMax} coin`);
  if (o.kind === 'supply') {
    if (!townOf(o.region)) throw new ApiError(400, 'bad_request', 'Supply goes to a market town');
    if (!o.res || o.res === 'coin' || !(o.n! > 0)) throw new ApiError(400, 'bad_request', 'A good and an amount');
  }
  const open = (await db.prepare("SELECT COUNT(*) AS n FROM war_crown_orders WHERE season = ?1 AND alliance = ?2 AND state = 'open'").bind(season, a).first<{ n: number }>())?.n ?? 0;
  if (open >= CROWN.ordersMax) throw new ApiError(409, 'orders_full', `At most ${CROWN.ordersMax} open orders`);
  const t = treasuryOf(a, season), take = bounty > 0 ? planTake(db, t, await lotsOf(db, t), { coin: bounty }, 'The treasury') : { stmts: [], taken: [] };
  const id = (await db
    .prepare("INSERT INTO war_crown_orders (season, alliance, kind, posted_by, region, target, x, y, res, n, bounty, state, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'cancelled', ?12, ?13) RETURNING id")
    .bind(season, a, o.kind, pid, o.region, o.target?.slice(0, 40) ?? null, o.x ?? null, o.y ?? null, o.kind === 'supply' ? o.res : null, o.kind === 'supply' ? o.n : 0, bounty, now + o.hours * 3_600_000, now)
    .first<{ id: number }>())!.id;
  await batch(db, [...take.stmts, db.prepare("UPDATE war_crown_orders SET state = 'open' WHERE id = ?1").bind(id), logStmt(db, season, a, 'order', pid, { id, kind: o.kind, region: o.region, bounty }, now)]);
  return id;
}

/**
 * Close an open order as `state`: a war goal pays its bounty out by shares, a quest gives back what it has not paid; the
 * rest to the treasury. Returns the coin paid now.
 */
async function closeOrder(env: Env, o: OrderRow, state: 'done' | 'expired' | 'cancelled', now: number): Promise<number> {
  const db = env.DB!, t = treasuryOf(o.alliance, o.season);
  const stmts: D1PreparedStatement[] = [guard(db, "(SELECT state FROM war_crown_orders WHERE id = ?1) = 'open'", o.id)];
  let paid = 0, rest = Math.max(0, cents(o.bounty - o.paid));
  if (WAR_GOAL(o.kind)) {
    const shares = (await db.prepare('SELECT player_id AS pid, share FROM war_crown_shares WHERE order_id = ?1 ORDER BY player_id').bind(o.id).all<{ pid: number; share: number }>()).results;
    const s = splitBounty(rest, shares);
    for (const [pid, k] of s.pay) {
      stmts.push(...payStmts(db, pid, { coin: k }, now), db.prepare('UPDATE war_crown_shares SET paid = paid + ?3 WHERE order_id = ?1 AND player_id = ?2').bind(o.id, pid, k));
      paid += k;
    }
    rest = s.rest;
    if (paid > 0) state = 'done';
  }
  if (rest > 0) stmts.push(putStmt(db, t, 'coin', rest));
  stmts.push(
    db.prepare('UPDATE war_crown_orders SET state = ?2, paid = paid + ?3, closed_at = ?4 WHERE id = ?1').bind(o.id, state, cents(paid), now),
    logStmt(db, o.season, o.alliance, 'order_closed', null, { id: o.id, kind: o.kind, state, paid: cents(paid), back: rest }, now),
  );
  try {
    await batch(db, stmts);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'changed') return 0; // closed meanwhile
    throw e;
  }
  if (paid > 0) await scorePeace(env, o.alliance, 'feats', CROWN.orderPts, now);
  return paid;
}

/** Orders past their time closed (lazily): war goals pay out, quests give back the rest. */
async function settleOrders(env: Env, a: number, now: number, season: number): Promise<void> {
  const rows = (await env.DB!.prepare("SELECT * FROM war_crown_orders WHERE season = ?1 AND alliance = ?2 AND state = 'open' AND expires_at <= ?3 ORDER BY id").bind(season, a, now).all<OrderRow>()).results;
  for (const o of rows) await closeOrder(env, o, 'expired', now);
}

const orderOf = async (db: D1Database, id: number) => {
  const o = await db.prepare('SELECT * FROM war_crown_orders WHERE id = ?1').bind(id).first<OrderRow>();
  if (!o) throw new ApiError(404, 'not_found', 'No such order');
  return o;
};

/** Its office (or the monarch) ends an open order now: a war goal pays out, a quest or rally is called off. */
export async function endOrder(env: Env, pid: number, id: number, now: number, season = WAR_SEASON.id): Promise<{ state: string; paid: number }> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  const o = await orderOf(db, id);
  if (o.alliance !== a || o.season !== season) throw new ApiError(404, 'not_found', 'No such order');
  if (o.state !== 'open') throw new ApiError(409, 'closed', 'The order is closed');
  await mustHold(db, a, pid, officeFor(o.kind), season);
  const paid = await closeOrder(env, o, WAR_GOAL(o.kind) || o.kind === 'rally' ? 'done' : 'cancelled', now);
  return { state: (await orderOf(db, id)).state, paid };
}

/**
 * A member delivers `n` of a supply quest's good from his sites in its town into the treasury; paid pro rata (the last
 * delivery: the rest). Not the poster, nor an account linked to him. Returns the coin paid.
 */
export async function deliver(env: Env, pid: number, id: number, n: number, now: number, season = WAR_SEASON.id): Promise<{ n: number; paid: number; done: boolean }> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  const o = await orderOf(db, id);
  if (o.alliance !== a || o.season !== season || o.kind !== 'supply') throw new ApiError(404, 'not_found', 'No such quest');
  if (o.state !== 'open') throw new ApiError(409, 'closed', 'The quest is closed');
  if (o.posted_by === pid) throw new ApiError(409, 'yours', 'Not your own quest');
  if (await linked(db, pid, o.posted_by, now)) throw new ApiError(409, 'linked', 'These accounts shared an address or device');
  const k = Math.min(n, o.n - o.delivered);
  if (!(k > EPS)) throw new ApiError(409, 'full', 'Nothing more is needed');
  const done = o.delivered + k >= o.n - EPS, pay = done ? cents(o.bounty - o.paid) : cents((o.bounty * k) / o.n);
  const from = await fromSites(db, pid, o.region, { [o.res!]: k });
  await batch(db, [
    guard(db, "(SELECT state FROM war_crown_orders WHERE id = ?1) = 'open' AND (SELECT delivered FROM war_crown_orders WHERE id = ?1) = ?2", id, o.delivered),
    ...from.stmts, ...putLotsStmts(db, treasuryOf(a, season), from.taken),
    db.prepare("UPDATE war_crown_orders SET delivered = delivered + ?2, paid = paid + ?3, state = CASE WHEN ?4 THEN 'done' ELSE state END, closed_at = CASE WHEN ?4 THEN ?5 ELSE closed_at END WHERE id = ?1").bind(id, k, pay, done ? 1 : 0, now),
    db.prepare('INSERT INTO war_crown_shares (order_id, player_id, share, paid) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (order_id, player_id) DO UPDATE SET share = share + ?3, paid = paid + ?4').bind(id, pid, k, pay),
    ...payStmts(db, pid, { coin: pay }, now),
    ...(done ? [logStmt(db, season, a, 'quest_done', pid, { id, res: o.res, n: o.n, bounty: o.bounty }, now)] : []),
  ]);
  if (done) await scorePeace(env, a, 'tasks', CROWN.orderPts, now);
  return { n: k, paid: pay, done };
}

/** The region DO's fight hook: members whose men fought in a region with an open war goal of their alliance get shares. */
export async function bookFight(db: D1Database, region: string, r: FightReport, now: number, season = WAR_SEASON.id): Promise<void> {
  const orders = (await db.prepare("SELECT id, alliance FROM war_crown_orders WHERE region = ?1 AND season = ?2 AND state = 'open' AND kind IN ('attack', 'defend') AND expires_at > ?3").bind(region, season, now).all<{ id: number; alliance: number }>()).results;
  if (!orders.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (const [pid, s] of fightTally(r)) {
    const a = await allianceOf(db, pid, season);
    for (const o of orders) if (o.alliance === a) stmts.push(db.prepare('INSERT INTO war_crown_shares (order_id, player_id, share) VALUES (?1, ?2, ?3) ON CONFLICT (order_id, player_id) DO UPDATE SET share = share + ?3').bind(o.id, pid, 1 + s.kills));
  }
  if (stmts.length) await db.batch(stmts);
}

// ---------------------------------------------------------------- pacts

async function expirePacts(db: D1Database, now: number, season: number): Promise<void> {
  await db.batch([
    db.prepare("UPDATE war_crown_pacts SET state = 'expired' WHERE season = ?1 AND state = 'offered' AND expires_at <= ?2").bind(season, now),
    db.prepare("UPDATE war_crown_pacts SET state = 'ended' WHERE season = ?1 AND state = 'active' AND ends_at <= ?2").bind(season, now),
  ]);
}

const pactOf = async (db: D1Database, id: number) => {
  const p = await db.prepare('SELECT * FROM war_crown_pacts WHERE id = ?1').bind(id).first<PactRow>();
  if (!p) throw new ApiError(404, 'not_found', 'No such pact');
  return p;
};

/** The Envoy offers alliance `to` a pact or a truce (one offered or active per pair). */
export async function offerPact(env: Env, pid: number, to: number, kind: PactKind, now: number, season = WAR_SEASON.id): Promise<number> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  await mustHold(db, a, pid, 'envoy', season);
  if (!ALLIANCES.some((x) => x.id === to) || to === a) throw new ApiError(400, 'bad_request', 'Another alliance');
  const dup = await db
    .prepare("SELECT 1 FROM war_crown_pacts WHERE season = ?1 AND state IN ('offered', 'active') AND ((alliance_a = ?2 AND alliance_b = ?3) OR (alliance_a = ?3 AND alliance_b = ?2))")
    .bind(season, a, to)
    .first();
  if (dup) throw new ApiError(409, 'pending', 'One stands between you already');
  const id = (await db
    .prepare('INSERT INTO war_crown_pacts (season, alliance_a, alliance_b, kind, offered_by, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id')
    .bind(season, a, to, kind, pid, now + CROWN.offerMs, now)
    .first<{ id: number }>())!.id;
  await db.batch([logStmt(db, season, a, 'pact_offered', pid, { id, kind, other: to }, now), logStmt(db, season, to, 'pact_offered', pid, { id, kind, other: a }, now)]);
  return id;
}

/** The other Envoy accepts or refuses an offer; the offering one withdraws it; either side ends an active one. */
export async function answerPact(env: Env, pid: number, id: number, act: 'accept' | 'refuse' | 'cancel' | 'end', now: number, season = WAR_SEASON.id): Promise<string> {
  const db = env.DB!, a = await mustMember(db, pid, season);
  await advance(env, a, now, season);
  const p = await pactOf(db, id);
  if (p.season !== season || (p.alliance_a !== a && p.alliance_b !== a)) throw new ApiError(404, 'not_found', 'No such pact');
  await mustHold(db, a, pid, 'envoy', season);
  const want = act === 'end' ? 'active' : 'offered';
  if (p.state !== want) throw new ApiError(409, 'closed', `The ${p.kind} is ${p.state}`);
  if ((act === 'accept' || act === 'refuse') && a !== p.alliance_b) throw new ApiError(403, 'not_party', 'The other side answers');
  if (act === 'cancel' && a !== p.alliance_a) throw new ApiError(403, 'not_party', 'Only the offering side withdraws');
  const state = act === 'accept' ? 'active' : act === 'refuse' ? 'refused' : act === 'cancel' ? 'cancelled' : 'ended';
  const ends = act === 'accept' ? now + (p.kind === 'pact' ? CROWN.pactMs : CROWN.truceMs) : p.ends_at;
  const u = await db.prepare('UPDATE war_crown_pacts SET state = ?2, answered_by = coalesce(answered_by, ?3), ends_at = ?4 WHERE id = ?1 AND state = ?5').bind(id, state, pid, ends, want).run();
  if (!u.meta.changes) throw new ApiError(409, 'changed', 'It changed meanwhile; try again');
  await db.batch([p.alliance_a, p.alliance_b].map((x) => logStmt(db, season, x, `pact_${state}`, pid, { id, kind: p.kind, other: x === p.alliance_a ? p.alliance_b : p.alliance_a }, now)));
  return state;
}

/** Active pacts and truces of the season (the world map, later). */
export async function pactsOf(db: D1Database, season = WAR_SEASON.id): Promise<PactRow[]> {
  return (await db.prepare("SELECT * FROM war_crown_pacts WHERE season = ?1 AND state = 'active' ORDER BY id").bind(season).all<PactRow>()).results;
}

/**
 * The region DO's attack hook: player `by` attacked settlement `victim`. Active pacts and truces between his alliance and
 * its lord's break, logged for both; returns them and whom to tell (every member of both alliances).
 */
export async function pactAttack(db: D1Database, by: number, victim: number, now: number, season = WAR_SEASON.id): Promise<{ broken: number[]; tell: number[]; text: string }> {
  const none = { broken: [], tell: [], text: '' };
  const lord = (await db.prepare('SELECT lord_pid FROM war_settlements WHERE id = ?1').bind(victim).first<{ lord_pid: number }>())?.lord_pid;
  if (lord === undefined) return none;
  const [va, vb] = [await allianceOf(db, by, season), await allianceOf(db, lord, season)];
  if (va === null || vb === null || va === vb) return none;
  const ps = (await db
    .prepare("SELECT * FROM war_crown_pacts WHERE season = ?1 AND state = 'active' AND ends_at > ?4 AND ((alliance_a = ?2 AND alliance_b = ?3) OR (alliance_a = ?3 AND alliance_b = ?2))")
    .bind(season, va, vb, now)
    .all<PactRow>()).results;
  if (!ps.length) return none;
  const who = await nameOf(db, by);
  const stmts = ps.flatMap((p) => [
    db.prepare("UPDATE war_crown_pacts SET state = 'broken', broken_by = ?2, ends_at = ?3 WHERE id = ?1 AND state = 'active'").bind(p.id, by, now),
    logStmt(db, season, va, 'pact_broken', by, { id: p.id, kind: p.kind, other: vb, name: who }, now),
    logStmt(db, season, vb, 'pact_broken', by, { id: p.id, kind: p.kind, other: va, name: who }, now),
  ]);
  await db.batch(stmts);
  const tell = (await db.prepare('SELECT player_id FROM war_alliance_members WHERE season = ?1 AND alliance IN (?2, ?3)').bind(season, va, vb).all<{ player_id: number }>()).results.map((r) => r.player_id);
  const kind = ps.some((p) => p.kind === 'pact') ? 'pact' : 'truce';
  return { broken: ps.map((p) => p.id), tell, text: `${who} of ${ALLIANCES[va].name} broke the ${kind} with ${ALLIANCES[vb].name}` };
}

// ---------------------------------------------------------------- season

/** The world's rollover: every term ends now (regents until the new elections), running votes are void, open orders settle. */
export async function crownSeason(env: Env, now: number, season = WAR_SEASON.id): Promise<void> {
  const db = env.DB!;
  await db.batch([
    db.prepare('UPDATE war_crowns SET term_ends = MIN(term_ends, ?2) WHERE season = ?1').bind(season, now),
    db.prepare("UPDATE war_crown_votes SET state = 'closed', result = '{\"void\":\"season\"}' WHERE season = ?1 AND state IN ('petition', 'open')").bind(season),
    db.prepare("UPDATE war_crown_orders SET expires_at = ?2 WHERE season = ?1 AND state = 'open' AND expires_at > ?2").bind(season, now),
  ]);
  for (const al of ALLIANCES) {
    await settleOrders(env, al.id, now, season);
    await logStmt(db, season, al.id, 'season', null, {}, now).run();
  }
}

// ---------------------------------------------------------------- the view

/** The Crown panel's view for player `pid`. */
export async function crownView(env: Env, pid: number, now: number, season = WAR_SEASON.id): Promise<CrownView> {
  const db = env.DB!, a = await allianceOf(db, pid, season);
  const empty: CrownView = {
    alliance: null, now, monarch: null, regent: false, council: OFFICES.map((o) => ({ office: o.id, pid: null, name: null })), treasury: { goods: {}, tax: 0, taxed: 0 },
    election: null, petition: null, petitionCooldown: 0, orders: [], pacts: [], log: [], members: [], me: { pid, power: 0, weight: 1, offices: [], monarch: false },
  };
  if (a === null) return empty;
  const c = await advance(env, a, now, season);
  const members = await membersOf(db, a, season), byPid = new Map(members.map((m) => [m.pid, m]));
  const name = async (p: number) => byPid.get(p)?.name ?? (await nameOf(db, p));
  const offices = (await db.prepare('SELECT office, player_id AS pid FROM war_crown_offices WHERE season = ?1 AND alliance = ?2').bind(season, a).all<{ office: Office; pid: number }>()).results;
  const votes = (await db.prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND state IN ('petition', 'open')").bind(season, a).all<VoteRow>()).results;
  const el = votes.find((v) => v.kind === 'election'), pe = votes.find((v) => v.kind === 'confidence');
  let election: CrownView['election'] = null, petition: CrownView['petition'] = null;
  if (el) {
    const ballots = await ballotsOf(db, el.id, 'ballot');
    election = {
      id: el.id, closes: el.closes_at, mine: ballots.find((b) => b.pid === pid)?.choice ?? null,
      candidates: json<Candidate[]>(el.candidates, []).map((k) => ({ ...k, power: byPid.get(k.pid)?.power ?? k.power, votes: ballots.filter((b) => b.choice === k.pid).reduce((x, b) => x + b.weight, 0) })),
    };
  }
  if (pe) {
    const signs = await ballotsOf(db, pe.id, 'sign'), ballots = await ballotsOf(db, pe.id, 'ballot');
    petition = {
      id: pe.id, state: pe.state as 'petition' | 'open', signs: signs.length, need: petitionNeed(await activeCount(db, a, now, season)), closes: pe.closes_at, signed: signs.some((s) => s.pid === pid),
      yes: ballots.filter((b) => b.choice === 1).reduce((x, b) => x + b.weight, 0), no: ballots.filter((b) => b.choice === 0).reduce((x, b) => x + b.weight, 0), mine: ballots.find((b) => b.pid === pid)?.choice ?? null,
    };
  }
  const orderRows = (await db
    .prepare("SELECT * FROM war_crown_orders WHERE season = ?1 AND alliance = ?2 AND (state = 'open' OR closed_at >= ?3) ORDER BY state = 'open' DESC, id DESC LIMIT 20")
    .bind(season, a, now - 24 * 3_600_000)
    .all<OrderRow>()).results;
  const orders: CrownOrder[] = [];
  for (const o of orderRows) {
    const sh = (await db.prepare('SELECT player_id AS pid, share FROM war_crown_shares WHERE order_id = ?1').bind(o.id).all<{ pid: number; share: number }>()).results;
    orders.push({
      id: o.id, kind: o.kind, by: await name(o.posted_by), byPid: o.posted_by, region: o.region, target: o.target, x: o.x, y: o.y, res: o.res, n: o.n, delivered: o.delivered,
      bounty: o.bounty, paid: o.paid, state: o.state, expires: o.expires_at, shares: sh.reduce((x, s) => x + s.share, 0), mine: sh.find((s) => s.pid === pid)?.share ?? 0,
    });
  }
  const pactRows = (await db
    .prepare("SELECT * FROM war_crown_pacts WHERE season = ?1 AND (alliance_a = ?2 OR alliance_b = ?2) AND (state IN ('offered', 'active') OR coalesce(ends_at, expires_at) >= ?3) ORDER BY id DESC LIMIT 12")
    .bind(season, a, now - 72 * 3_600_000)
    .all<PactRow>()).results;
  const pacts: CrownPact[] = [];
  for (const p of pactRows) pacts.push({ id: p.id, kind: p.kind, a: p.alliance_a, b: p.alliance_b, state: p.state, by: await name(p.offered_by), expires: p.expires_at, ends: p.ends_at });
  const logRows = (await db
    .prepare('SELECT l.kind, l.actor_id, pl.display_name AS actor, l.detail, l.at FROM war_crown_log l LEFT JOIN players pl ON pl.id = l.actor_id WHERE l.season = ?1 AND l.alliance = ?2 ORDER BY l.at DESC, l.id DESC LIMIT 20')
    .bind(season, a)
    .all<{ kind: string; actor: string | null; detail: string; at: number }>()).results;
  const me = byPid.get(pid);
  return {
    alliance: a, now,
    monarch: c.monarch_pid === null ? null : { pid: c.monarch_pid, name: await name(c.monarch_pid), power: byPid.get(c.monarch_pid)?.power ?? 0, since: c.crowned_at, ends: c.term_ends },
    regent: c.monarch_pid !== null && !!el,
    council: OFFICES.map((o) => {
      const h = offices.find((x) => x.office === o.id);
      return { office: o.id, pid: h?.pid ?? null, name: h ? (byPid.get(h.pid)?.name ?? `#${h.pid}`) : null };
    }),
    treasury: { goods: await goodsOf(db, treasuryOf(a, season)), tax: c.tax_pct, taxed: cents(c.taxed) },
    election, petition, petitionCooldown: await cooldownOf(db, a, season),
    orders, pacts,
    log: logRows.map((l) => ({ kind: l.kind, actor: l.actor, detail: json<Record<string, unknown>>(l.detail, {}), at: l.at })),
    members,
    me: { pid, power: me?.power ?? 0, weight: me?.weight ?? 1, offices: offices.filter((o) => o.pid === pid).map((o) => o.office), monarch: c.monarch_pid === pid },
  };
}
