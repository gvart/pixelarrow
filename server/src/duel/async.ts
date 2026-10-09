/**
 * The async defence ladder, the defence log, ranked seasons and leaderboards
 * (docs/DUELS.md "Ranked async (defence ladder)" and "Matchmaking and
 * rating"); mounted on /api/duel by routes.ts. Shared rules:
 * src/duel/season.ts (ASYNC, SEASON).
 *
 * An attack is a ticket like a ladder floor: the server picks the seed and
 * both armies (the attacker's arena team, the defender's saved defence
 * snapshot played by the bot), the client submits its order log, and only
 * the server's replay counts. Settlement runs once: the first statement moves
 * the attack from `open` with a fresh apply_nonce, every other write (both
 * ratings, Glory, account and hero XP) is guarded by it. The row stays as the
 * defence log entry with what a replay needs (setup, orders).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db } from '../middleware';
import { LIMITS } from '../battle';
import { emitWithFirst, outcomeOf } from '../telemetry/analytics';
import { limit } from '../online/context';
import { playerNames, randomToken, randomU32 } from '../online/store';
import { ev, later, notify } from '../notify/outbox';
import { hashString } from '../../../src/sim/rng';
import { Rng } from '../../../src/sim/rng';
import type { Hero } from '../../../src/data/units';
import type { FormationType } from '../../../src/sim/formation';
import type { BattleSetup, LoggedOrder } from '../../../src/sim/types';
import { DUEL_RULES, accountLevel, utcDay } from '../../../src/duel/rules';
import { duelHeroXp } from '../../../src/duel/ladder';
import { RANKED, glicko2, leagueOf, placed, scoreOf, type League, type Score } from '../../../src/duel/rating';
import { ASYNC, asyncSetup, attackPay, defencePay, defenceRating, idleRating, pickCandidates, seasonId } from '../../../src/duel/season';
import type { AsyncReport } from '../../../src/duel/protocol';
import { getRating, leagueText, loadTeam, rowLeague, type RatingRow } from './live';
import { leaderboard, markRewardsSeen, rollRatings, seasonView, type Board } from './season';
import { duelCtx as ctx, duelProfileView, getDuelProfile, heroProgressStmts, loadDuelHeroes, syncDefence, type DuelCtx as Ctx } from './store';
import { SubmitBody, verifyBattle } from './verify';
import { requireOpenTicket, ticketPreamble } from '../tickets';

export const duelSeason = new Hono<AppEnv>();

const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ candidates

interface PoolRow {
  pid: number;
  rating: number;
  games: number;
  points: number;
  heroes: string;
}

export interface Candidate {
  pid: number;
  name: string;
  /** Null while the defender is in placements. */
  league: League | null;
  /** Exact rating: Legend only. */
  rating: number | null;
  points: number;
  heroes: number;
  /** Classes of the defence team (strongest first as saved). */
  classes: string[];
}

async function attacksToday(x: Ctx): Promise<number> {
  const r = await x.db.prepare('SELECT COUNT(*) AS n FROM duel_attacks WHERE attacker = ?1 AND day = ?2').bind(x.pid, utcDay(x.now)).first<{ n: number }>();
  return r?.n ?? 0;
}

/** The defenders offered to this attacker now (fixed until their next attack). */
async function candidates(x: Ctx, rating: number, used: number): Promise<(PoolRow & { name: string })[]> {
  const pool = (
    await x.db
      .prepare(
        `SELECT d.player_id AS pid, COALESCE(r.rating, ${RANKED.start.rating}) AS rating, COALESCE(r.games, 0) AS games, d.points AS points, d.heroes AS heroes
         FROM duel_defences d LEFT JOIN duel_ratings r ON r.player_id = d.player_id AND r.ladder = 'async'
         WHERE d.player_id != ?1 AND d.player_id NOT IN (SELECT defender FROM duel_attacks WHERE attacker = ?1 AND created_at > ?2)
         ORDER BY ABS(COALESCE(r.rating, ${RANKED.start.rating}) - ?3), d.player_id LIMIT ?4`,
      )
      .bind(x.pid, x.now - ASYNC.repeatMs, rating, ASYNC.pool)
      .all<PoolRow>()
  ).results;
  const picked = pickCandidates(rating, pool, hashString(`async:${x.pid}:${utcDay(x.now)}:${used}`));
  const names = await playerNames(x.db, picked.map((p) => p.pid));
  return picked.map((p) => ({ ...p, name: names.get(p.pid) ?? `#${p.pid}` }));
}

function candidateView(p: PoolRow & { name: string }): Candidate {
  const heroes = JSON.parse(p.heroes) as Hero[];
  const league = placed(p.games) ? leagueOf(p.rating) : null;
  return { pid: p.pid, name: p.name, league, rating: league?.id === 'legend' ? Math.round(p.rating) : null, points: p.points, heroes: heroes.length, classes: heroes.map((h) => h.cls ?? 'militia') };
}

// ------------------------------------------------------------------ the async card

/** The async card: rating, today's attacks, the defence and the candidates. */
duelSeason.get('/async', async (c) => {
  const x = await ctx(c);
  await rollRatings(x.db, x.pid, x.now);
  const [r, used, open, def] = await Promise.all([
    getRating(x.db, x.pid, 'async', x.now),
    attacksToday(x),
    openAttack(x),
    x.db.prepare('SELECT points, heroes, updated_at FROM duel_defences WHERE player_id = ?1').bind(x.pid).first<{ points: number; heroes: string; updated_at: number }>(),
  ]);
  const level = accountLevel(x.p.xp);
  const unlocked = level >= DUEL_RULES.rankedLevel;
  const league = rowLeague(r);
  const offer = unlocked && used < ASYNC.attacksPerDay ? (await candidates(x, r.rating, used)).map(candidateView) : [];
  return c.json({
    now: x.now,
    level,
    unlockLevel: DUEL_RULES.rankedLevel,
    unlocked,
    league,
    rating: league?.id === 'legend' ? Math.round(r.rating) : null,
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    defences: r.defences,
    defenceWins: r.defence_wins,
    placements: { played: Math.min(r.games, RANKED.placements), of: RANKED.placements },
    attacks: { used, cap: ASYNC.attacksPerDay, left: Math.max(0, ASYNC.attacksPerDay - used) },
    defence: def ? { points: def.points, heroes: (JSON.parse(def.heroes) as unknown[]).length, updatedAt: def.updated_at } : null,
    candidates: offer,
    open: open ? { ticket: open.id, defender: open.defender } : null,
  });
});

// ------------------------------------------------------------------ attacks

interface AttackRow {
  id: string;
  attacker: number;
  defender: number;
  day: number;
  seed: number;
  setup: string;
  team: string;
  defence: string;
  status: 'open' | 'used' | 'rejected' | 'abandoned';
  claim: string | null;
  orders: string | null;
  deploy_orders: number | null;
  winner: number | null;
  ticks: number | null;
  delta_a: number | null;
  delta_d: number | null;
  glory_a: number | null;
  glory_d: number | null;
  result: string | null;
  created_at: number;
  expires_at: number;
  finished_at: number | null;
}

async function openAttack(x: Ctx): Promise<AttackRow | null> {
  return x.db
    .prepare("SELECT * FROM duel_attacks WHERE attacker = ?1 AND status = 'open' AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1")
    .bind(x.pid, x.now)
    .first<AttackRow>();
}

async function attackView(x: Ctx, a: AttackRow, extra: Record<string, unknown> = {}) {
  const setup = JSON.parse(a.setup) as BattleSetup;
  const def = await x.db.prepare("SELECT rating, games FROM duel_ratings WHERE player_id = ?1 AND ladder = 'async'").bind(a.defender).first<{ rating: number; games: number }>();
  const names = await playerNames(x.db, [a.defender]);
  return {
    ticket: a.id,
    defender: { pid: a.defender, name: names.get(a.defender) ?? `#${a.defender}`, league: def && placed(def.games) ? leagueOf(def.rating) : null },
    expiresAt: a.expires_at,
    setup,
    team: JSON.parse(a.team) as Hero[],
    enemies: JSON.parse(a.defence) as Hero[],
    ...extra,
  };
}

const StartBody = z.object({ defender: z.number().int().min(1) });

/**
 * Starts an attack on one of the offered defenders with the arena team: the
 * daily cap, the 24-hour repeat rule and the budget are checked here. An open
 * attack on the same defender is resumed (same seed); one on another is given
 * up (it still counts towards the cap).
 */
duelSeason.post('/async/start', async (c) => {
  limit(c, 'duel_async', 20);
  const x = await ctx(c);
  const body = await readJson(c, StartBody, 1024);
  if (accountLevel(x.p.xp) < DUEL_RULES.rankedLevel) throw new ApiError(409, 'locked', `Raids unlock at duel level ${DUEL_RULES.rankedLevel}`, { level: DUEL_RULES.rankedLevel });
  const open = await openAttack(x);
  if (open && open.defender === body.defender) return c.json(await attackView(x, open, { resumed: true }));
  if (open) await x.db.prepare("UPDATE duel_attacks SET status = 'abandoned', finished_at = ?2 WHERE id = ?1 AND status = 'open'").bind(open.id, x.now).run();
  const used = await attacksToday(x);
  if (used >= ASYNC.attacksPerDay) throw new ApiError(409, 'attack_cap', `At most ${ASYNC.attacksPerDay} raids a day`, { cap: ASYNC.attacksPerDay });
  const recent = await x.db
    .prepare('SELECT 1 FROM duel_attacks WHERE attacker = ?1 AND defender = ?2 AND created_at > ?3 LIMIT 1')
    .bind(x.pid, body.defender, x.now - ASYNC.repeatMs)
    .first();
  if (recent) throw new ApiError(409, 'attacked_recently', 'You raided this player less than 24 hours ago');
  await rollRatings(x.db, x.pid, x.now);
  const me = await getRating(x.db, x.pid, 'async', x.now);
  const offer = await candidates(x, me.rating, used);
  const target = offer.find((p) => p.pid === body.defender);
  if (!target) throw new ApiError(409, 'not_offered', 'That defender is not among your opponents now');
  const team = await loadTeam(x.db, x.pid, x.p);
  if ('problem' in team) throw new ApiError(409, team.problem, team.problem === 'over_budget' ? `Your arena team is over the ${DUEL_RULES.budget}-point budget` : 'Pick your arena team first', { budget: DUEL_RULES.budget });
  const def = await x.db.prepare('SELECT heroes, formations FROM duel_defences WHERE player_id = ?1').bind(body.defender).first<{ heroes: string; formations: string }>();
  if (!def) throw new ApiError(409, 'not_offered', 'That defender has no defence');
  // an attacker without a defence defends with their arena team from now on (the pool fills itself)
  await syncDefence(x.db, x.pid, x.now, !(await x.db.prepare('SELECT 1 FROM duel_defences WHERE player_id = ?1').bind(x.pid).first()));
  const defence = JSON.parse(def.heroes) as Hero[];
  const id = randomToken(16);
  const seed = randomU32();
  const setup = asyncSetup(seed, team.heroes, team.formations, defence, JSON.parse(def.formations) as FormationType[]);
  await x.db
    .prepare('INSERT INTO duel_attacks (id, attacker, defender, day, seed, setup, team, defence, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
    .bind(id, x.pid, body.defender, utcDay(x.now), seed, JSON.stringify(setup), JSON.stringify(team.heroes), def.heroes, x.now, x.now + ASYNC.ticketTtlMs)
    .run();
  const a = (await x.db.prepare('SELECT * FROM duel_attacks WHERE id = ?1').bind(id).first<AttackRow>())!;
  return c.json(await attackView(x, a));
});

async function loadAttack(x: Ctx, id: string): Promise<AttackRow> {
  const a = await x.db.prepare('SELECT * FROM duel_attacks WHERE id = ?1 AND attacker = ?2').bind(id, x.pid).first<AttackRow>();
  if (!a) throw new ApiError(404, 'not_found', 'No such raid');
  return a;
}

async function closeAttack(x: Ctx, a: AttackRow, status: 'rejected' | 'abandoned', claim?: string): Promise<void> {
  await x.db
    .prepare("UPDATE duel_attacks SET status = ?2, finished_at = ?3, claim = COALESCE(?4, claim) WHERE id = ?1 AND status = 'open'")
    .bind(a.id, status, x.now, claim ?? null)
    .run();
}

function ratingUpsert(d: D1Database, pid: number, r: RatingRow, G: string, now: number, played: boolean): D1PreparedStatement {
  return d
    .prepare(
      `INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, wins, losses, draws, league, peak, last_match, updated_at, season, played_at, defences, defence_wins)
       SELECT ?1, 'async', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16 WHERE ${G}
       ON CONFLICT (player_id, ladder) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, vol = excluded.vol, games = excluded.games, wins = excluded.wins,
         losses = excluded.losses, draws = excluded.draws, league = excluded.league, peak = excluded.peak, updated_at = excluded.updated_at, season = excluded.season,
         played_at = ${played ? 'excluded.played_at' : 'played_at'}, defences = excluded.defences, defence_wins = excluded.defence_wins,
         last_match = COALESCE(excluded.last_match, last_match)`,
    )
    .bind(pid, r.rating, r.rd, r.vol, r.games, r.wins, r.losses, r.draws, r.league, r.peak, played ? 'async' : null, now, r.season, r.played_at, r.defences, r.defence_wins);
}

/** Verifies an attack by replay and settles it once: both ratings (the defender's at half rate), Glory, account and hero XP. */
duelSeason.post('/async/submit', async (c) => {
  limit(c, 'duel_async_submit', 20);
  const x = await ctx(c);
  const body = await readJson(c, SubmitBody, LIMITS.maxBodyBytes);
  const a = await loadAttack(x, body.ticket);
  const claimJson = JSON.stringify(body.claim);
  const replay = await ticketPreamble(a, claimJson, x.now, 'raid', () => closeAttack(x, a, 'abandoned'));
  if (replay) return c.json({ report: JSON.parse(replay) as AsyncReport, replayed: true, profile: await duelProfileView(x.db, x.pid, x.now) });
  const out = await verifyBattle(JSON.parse(a.setup) as BattleSetup, body, (claim) => closeAttack(x, a, 'rejected', claim));
  const s = out.summary;

  await rollRatings(x.db, x.pid, x.now);
  await rollRatings(x.db, a.defender, x.now);
  const cur = seasonId(x.now);
  const [me, foe, names, current] = await Promise.all([
    getRating(x.db, x.pid, 'async', x.now),
    getRating(x.db, a.defender, 'async', x.now),
    playerNames(x.db, [x.pid, a.defender]),
    loadDuelHeroes(x.db, x.pid),
  ]);
  const scoreA = scoreOf(s.winner, 0);
  const scoreD = (1 - scoreA) as Score;
  const meNow = idleRating(me, me.played_at, x.now);
  const foeNow = idleRating(foe, foe.played_at, x.now);
  const nextA = glicko2(meNow, foeNow, scoreA);
  const nextD = defenceRating(foeNow, meNow, scoreD);
  const games = me.games + 1;
  const afterA: RatingRow = {
    ...me,
    ...nextA,
    games,
    wins: me.wins + (scoreA === 1 ? 1 : 0),
    losses: me.losses + (scoreA === 0 ? 1 : 0),
    draws: me.draws + (scoreA === 0.5 ? 1 : 0),
    league: leagueText(rowLeague({ rating: nextA.rating, games })),
    peak: placed(games) ? Math.max(me.peak ?? nextA.rating, nextA.rating) : null,
    season: cur,
    played_at: x.now,
  };
  const afterD: RatingRow = {
    ...foe,
    ...nextD,
    league: leagueText(rowLeague({ rating: nextD.rating, games: foe.games })),
    peak: placed(foe.games) ? Math.max(foe.peak ?? nextD.rating, nextD.rating) : foe.peak,
    season: cur,
    defences: foe.defences + 1,
    defence_wins: foe.defence_wins + (scoreD === 1 ? 1 : 0),
  };
  const pay = attackPay(scoreA);
  const dayStart = utcDay(x.now) * DAY_MS;
  const earned = await x.db.prepare('SELECT COALESCE(SUM(glory_d), 0) AS g FROM duel_attacks WHERE defender = ?1 AND finished_at >= ?2').bind(a.defender, dayStart).first<{ g: number }>();
  const gloryD = defencePay(scoreD, earned?.g ?? 0);
  const team = JSON.parse(a.team) as Hero[];
  const xp = duelHeroXp(out.result, team, scoreA === 1, new Rng((a.seed ^ 0x3a5c7e91) >>> 0 || 1), 0);
  const report: AsyncReport = {
    attack: a.id,
    defender: { pid: a.defender, name: names.get(a.defender) ?? `#${a.defender}` },
    winner: s.winner,
    ticks: s.ticks,
    verified: true,
    glory: pay.glory,
    accountXp: pay.accountXp,
    rating: { before: Math.round(me.rating), after: Math.round(nextA.rating) },
    league: { before: rowLeague(me), after: rowLeague({ rating: nextA.rating, games }) },
    placements: { played: Math.min(games, RANKED.placements), of: RANKED.placements },
    xp: xp.xp,
  };

  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM duel_attacks WHERE id = '${a.id}' AND apply_nonce = '${nonce}')`;
  const stmts: D1PreparedStatement[] = [
    x.db
      .prepare(
        `UPDATE duel_attacks SET status = 'used', apply_nonce = ?2, claim = ?3, orders = ?4, deploy_orders = ?5, winner = ?6, ticks = ?7, delta_a = ?8, delta_d = ?9,
           glory_a = ?10, glory_d = ?11, result = ?12, finished_at = ?13 WHERE id = ?1 AND status = 'open'`,
      )
      .bind(a.id, nonce, claimJson, JSON.stringify(body.orders), body.deployOrders ?? null, s.winner, s.ticks, nextA.rating - me.rating, nextD.rating - foe.rating, pay.glory, gloryD, JSON.stringify(report), x.now),
    x.db
      .prepare(`UPDATE duel_profiles SET glory = glory + ?2, xp = xp + ?3, battles = battles + 1, wins = wins + ?4, rev = rev + 1, updated_at = ?5 WHERE player_id = ?1 AND ${G}`)
      .bind(x.pid, pay.glory, pay.accountXp, scoreA === 1 ? 1 : 0, x.now),
    ...heroProgressStmts(x.db, x.pid, team, xp.heroes, new Map(current.map((h) => [h.hero.id, h.hero])), G, x.now),
    ratingUpsert(x.db, x.pid, afterA, G, x.now, true),
    ratingUpsert(x.db, a.defender, afterD, G, x.now, false),
  ];
  if (gloryD > 0) stmts.push(x.db.prepare(`UPDATE duel_profiles SET glory = glory + ?2, rev = rev + 1, updated_at = ?3 WHERE player_id = ?1 AND ${G}`).bind(a.defender, gloryD, x.now));
  const res = await x.db.batch(stmts);
  if (res[0].meta.changes !== 1) {
    const again = await loadAttack(x, a.id);
    if (again.status === 'used' && again.result && again.claim === claimJson) return c.json({ report: JSON.parse(again.result) as AsyncReport, replayed: true, profile: await duelProfileView(x.db, x.pid, x.now) });
    throw new ApiError(409, 'ticket_used', 'This raid was already reported');
  }
  later(c, notify(c.env, [ev(a.defender, 'duel_defence', `raid:${a.id}`, { by: names.get(x.pid) ?? 'A commander', held: scoreD === 1 })], { now: x.now }));
  await emitWithFirst(c, 'battle_result', { mode: 'async', result: outcomeOf(s.winner), ticks: s.ticks }, 'first_battle', { mode: 'async' });
  return c.json({ report, profile: await duelProfileView(x.db, x.pid, x.now) });
});

duelSeason.post('/async/abandon', async (c) => {
  const x = await ctx(c);
  const body = await readJson(c, z.object({ ticket: z.string().regex(/^[0-9a-f]{32}$/) }), 1024);
  const a = await loadAttack(x, body.ticket);
  requireOpenTicket(a, 'raid');
  await closeAttack(x, a, 'abandoned');
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ the defence log

export interface LogEntry {
  id: string;
  at: number;
  /** attack: you raided them; defence: they raided your defence. */
  role: 'attack' | 'defence';
  pid: number;
  name: string;
  /** From your side: 1 won, 0.5 draw, 0 lost. */
  score: Score;
  /** Your rating change (rounded). */
  delta: number;
  glory: number;
}

/** Your recent raids and the raids on your defence, newest first. */
duelSeason.get('/async/log', async (c) => {
  const x = await ctx(c);
  const rows = (
    await x.db
      .prepare(
        `SELECT id, attacker, defender, winner, delta_a, delta_d, glory_a, glory_d, finished_at FROM duel_attacks
         WHERE (attacker = ?1 OR defender = ?1) AND status = 'used' ORDER BY finished_at DESC LIMIT 30`,
      )
      .bind(x.pid)
      .all<{ id: string; attacker: number; defender: number; winner: number; delta_a: number; delta_d: number; glory_a: number; glory_d: number; finished_at: number }>()
  ).results;
  const names = await playerNames(x.db, rows.map((r) => (r.attacker === x.pid ? r.defender : r.attacker)));
  const entries: LogEntry[] = rows.map((r) => {
    const mine = r.attacker === x.pid;
    const other = mine ? r.defender : r.attacker;
    return {
      id: r.id,
      at: r.finished_at,
      role: mine ? 'attack' : 'defence',
      pid: other,
      name: names.get(other) ?? `#${other}`,
      score: scoreOf(r.winner as 0 | 1 | -1, mine ? 0 : 1),
      delta: Math.round(mine ? r.delta_a : r.delta_d),
      glory: mine ? r.glory_a : r.glory_d,
    };
  });
  return c.json({ now: x.now, entries });
});

/** A finished raid as a replay (seed + armies in the setup, the order log): shareable, any signed-in player may watch it. */
duelSeason.get('/async/replay/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f]{32}$/.test(id)) throw badRequest('Bad raid id');
  const d = db(c.env);
  const a = await d.prepare("SELECT * FROM duel_attacks WHERE id = ?1 AND status = 'used'").bind(id).first<AttackRow>();
  if (!a) throw new ApiError(404, 'not_found', 'No such raid');
  const names = await playerNames(d, [a.attacker, a.defender]);
  return c.json({
    id: a.id,
    names: [names.get(a.attacker) ?? `#${a.attacker}`, names.get(a.defender) ?? `#${a.defender}`],
    setup: JSON.parse(a.setup) as BattleSetup,
    orders: JSON.parse(a.orders ?? '[]') as LoggedOrder[],
    deployOrders: a.deploy_orders,
    winner: a.winner,
    ticks: a.ticks,
    at: a.finished_at,
  });
});

// ------------------------------------------------------------------ seasons and leaderboards

/** The running season (time left, league and peak on both ladders), the title and unseen rewards. */
duelSeason.get('/season', async (c) => {
  const x = await ctx(c);
  return c.json(await seasonView(x.db, x.pid, x.now));
});

/** The season reward popup was shown. */
duelSeason.post('/season/seen', async (c) => {
  const x = await ctx(c);
  await markRewardsSeen(x.db, x.pid, x.now);
  return c.json({ ok: true });
});

/** Top live, top async or the Legend board of the running season, with the player's own place. */
duelSeason.get('/leaderboard', async (c) => {
  limit(c, 'duel_board', 60);
  const d = db(c.env);
  const pid = c.get('session').pid;
  const board = (c.req.query('board') ?? 'live') as Board;
  if (!['live', 'async', 'legend'].includes(board)) throw badRequest('board: live, async or legend');
  if (!(await getDuelProfile(d, pid))) throw new ApiError(409, 'no_duel_profile', 'Open the duel mode first (POST /api/duel/profile)');
  return c.json(await leaderboard(d, board, pid, Date.now()));
});
