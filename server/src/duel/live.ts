/**
 * D1 side of the live ranked and unranked duels (docs/DUELS.md "Ranked
 * live"): who may queue, the armies the server builds for a match, and the
 * settlement of a finished match (rating, Glory, account and hero XP,
 * abandons). Used by the MatchmakerDO and the DuelDO; shared rules in
 * src/duel/rating.ts.
 *
 * Settlement follows the ladder ticket convention: the first statement of the
 * batch moves duel_matches.status from 'live' with a fresh apply_nonce, every
 * other statement is guarded by that nonce (and bumps duel_profiles.rev), so a
 * match pays exactly once however often settleMatch runs.
 */
import type { Hero } from '../../../src/data/units';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from '../../../src/sim/types';
import { Rng } from '../../../src/sim/rng';
import { onlineBattleSetup } from '../../../src/online/battle';
import { randomSite } from '../../../src/world/battlefield';
import { DUEL_RULES, accountLevel, duelSpoils, teamProblem, utcDay } from '../../../src/duel/rules';
import { armyClasses } from '../../../src/game/sources';
import type { Item } from '../../../src/data/items';
import { idleRating, seasonId, type Ladder } from '../../../src/duel/season';
import { rollRatings } from './season';
import { duelHeroXp } from '../../../src/duel/ladder';
import {
  RANKED, glicko2, leagueOf, matchPay, placed, recordAbandon, scoreOf, type AbandonState, type DuelMode, type League, type LeagueId, type Rating,
} from '../../../src/duel/rating';
import type { LiveMatchRef, MatchEnd, MatchReport } from '../../../src/duel/protocol';
import { randomToken } from '../online/store';
import { duelPrefix, getDuelProfile, heroProgressStmts, loadDuelHeroes, loadoutFor, loadoutHeroes, type DuelProfileRow } from './store';
import type { FormationType } from '../../../src/sim/formation';

/** A live match row older than this is dead (its DuelDO is gone): it no longer blocks the queue. */
export const MATCH_STALE_MS = 15 * 60_000;

export interface RatingRow {
  player_id: number;
  rating: number;
  rd: number;
  vol: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  league: string | null;
  peak: number | null;
  /** The season the row belongs to (rolled over on first access in a later one: server/src/duel/season.ts). */
  season: number;
  played_at: number;
  defences: number;
  defence_wins: number;
}

/** A player's rating on a ladder (the start values before the first rated game). Roll the season first (rollRatings) where it matters. */
export async function getRating(db: D1Database, pid: number, ladder: Ladder = 'live', now = Date.now()): Promise<RatingRow> {
  const r = await db.prepare('SELECT * FROM duel_ratings WHERE player_id = ?1 AND ladder = ?2').bind(pid, ladder).first<RatingRow>();
  return r ?? { player_id: pid, ...RANKED.start, games: 0, wins: 0, losses: 0, draws: 0, league: null, peak: null, season: seasonId(now), played_at: now, defences: 0, defence_wins: 0 };
}

/** The league a rating row shows (null during placements). */
export function rowLeague(r: Pick<RatingRow, 'rating' | 'games'>): League | null {
  return placed(r.games) ? leagueOf(r.rating) : null;
}

export function leagueText(l: League | null): string | null {
  return l ? `${l.id}:${l.division ?? 0}` : null;
}

export function parseLeague(s: string | null): League | null {
  if (!s) return null;
  const [id, d] = s.split(':');
  return { id: id as LeagueId, division: Number(d) || null };
}

interface QueueStateRow {
  abandons: string;
  cooldown_until: number;
  strikes: number;
  strike_at: number;
}

export async function getQueueState(db: D1Database, pid: number): Promise<AbandonState> {
  const r = await db.prepare('SELECT abandons, cooldown_until, strikes, strike_at FROM duel_queue_state WHERE player_id = ?1').bind(pid).first<QueueStateRow>();
  if (!r) return { abandons: [], cooldownUntil: 0, strikes: 0, strikeAt: 0 };
  let abandons: number[] = [];
  try {
    abandons = (JSON.parse(r.abandons) as number[]).filter((x) => typeof x === 'number');
  } catch {
    abandons = [];
  }
  return { abandons, cooldownUntil: r.cooldown_until, strikes: r.strikes, strikeAt: r.strike_at };
}

/** The player's unfinished match (to rejoin), if any. */
export async function liveMatchOf(db: D1Database, pid: number, now: number): Promise<LiveMatchRef | null> {
  const r = await db
    .prepare("SELECT id, mode FROM duel_matches WHERE (player_a = ?1 OR player_b = ?1) AND status = 'live' AND created_at > ?2 ORDER BY created_at DESC LIMIT 1")
    .bind(pid, now - MATCH_STALE_MS)
    .first<{ id: string; mode: DuelMode }>();
  return r ? { id: r.id, mode: r.mode } : null;
}

export interface DuelTeam {
  heroes: Hero[];
  formations: FormationType[];
}

/** The player's arena team (live matches and async attacks) as it would fight now (perfect gear), or why it cannot. */
export async function loadTeam(db: D1Database, pid: number, p?: DuelProfileRow | null): Promise<DuelTeam | { problem: 'no_team' | 'too_many' | 'over_budget' }> {
  const prof = p ?? (await getDuelProfile(db, pid));
  if (!prof) return { problem: 'no_team' };
  const l = await loadoutFor(db, prof, 'arena');
  const heroes = loadoutHeroes(l, await loadDuelHeroes(db, pid));
  const problem = teamProblem(heroes, DUEL_RULES.budget);
  if (problem) return { problem: problem === 'empty' ? 'no_team' : problem };
  return { heroes, formations: l.formations };
}

export type QueueRefusal = 'cooldown' | 'locked' | 'no_team' | 'over_budget' | 'too_many' | 'busy';

/** Whether a player may join a queue now: their rating to pair by, or the reason not. */
export async function queueCheck(db: D1Database, pid: number, mode: DuelMode, now: number): Promise<{ ok: true; rating: RatingRow } | { ok: false; reason: QueueRefusal; until?: number }> {
  const p = await getDuelProfile(db, pid);
  if (!p) return { ok: false, reason: 'no_team' };
  await rollRatings(db, pid, now);
  const [q, live, team, rating] = await Promise.all([getQueueState(db, pid), liveMatchOf(db, pid, now), loadTeam(db, pid, p), getRating(db, pid)]);
  if (q.cooldownUntil > now) return { ok: false, reason: 'cooldown', until: q.cooldownUntil };
  if (live) return { ok: false, reason: 'busy' };
  if (mode === 'ranked' && accountLevel(p.xp) < DUEL_RULES.rankedLevel) return { ok: false, reason: 'locked' };
  if ('problem' in team) return { ok: false, reason: team.problem };
  return { ok: true, rating };
}

/** What a DuelDO is started with (kept in its storage). */
export interface MatchInit {
  id: string;
  mode: DuelMode;
  seed: number;
  players: [number, number];
  names: [string, string];
  setup: BattleSetup;
  heroes: [Hero[], Hero[]];
  createdAt: number;
}

/**
 * Builds a match from both players' current duel teams (server-owned; the
 * field from the seed) and records it as live. Null with the players whose
 * team cannot fight any more.
 */
export async function createMatch(db: D1Database, mode: DuelMode, a: { pid: number; name: string }, b: { pid: number; name: string }, seed: number, now: number): Promise<{ init: MatchInit } | { bad: number[] }> {
  const teams = await Promise.all([loadTeam(db, a.pid), loadTeam(db, b.pid)]);
  const bad = [a, b].filter((_, i) => 'problem' in teams[i]).map((p) => p.pid);
  if (bad.length) return { bad };
  const [ta, tb] = teams as DuelTeam[];
  const setup = onlineBattleSetup(seed, { heroes: ta.heroes, formations: ta.formations, bot: false }, { heroes: tb.heroes, formations: tb.formations, bot: false }, randomSite(new Rng(seed ^ 0x2f6b9e1d)));
  const init: MatchInit = { id: randomToken(16), mode, seed, players: [a.pid, b.pid], names: [a.name, b.name], setup, heroes: [ta.heroes, tb.heroes], createdAt: now };
  await db
    .prepare('INSERT INTO duel_matches (id, mode, seed, player_a, player_b, setup, teams, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(init.id, mode, seed, a.pid, b.pid, JSON.stringify(setup), JSON.stringify(init.heroes), now)
    .run();
  return { init };
}

export interface MatchOutcome {
  end: MatchEnd;
  winner: Side | -1;
  verified: boolean;
  ticks: number;
  hash: string | null;
  /** The server's replay (a verified battle): kills for hero XP. */
  result?: Pick<BattleResult, 'units'> | null;
  log: LoggedOrder[];
  deployOrders: number;
  /** Sides that left and did not come back within the reconnect window. */
  abandoned: [boolean, boolean];
}

/**
 * Settles a finished match once: reports for both players (side 0, side 1).
 * A repeat returns the stored reports.
 */
export async function settleMatch(db: D1Database, m: MatchInit, o: MatchOutcome, now: number): Promise<[MatchReport, MatchReport]> {
  const row = await db.prepare('SELECT status, result FROM duel_matches WHERE id = ?1').bind(m.id).first<{ status: string; result: string | null }>();
  if (row && row.status !== 'live' && row.result) return JSON.parse(row.result) as [MatchReport, MatchReport];
  const sides = [0, 1] as Side[];
  if (m.mode === 'ranked') for (const p of m.players) await rollRatings(db, p, now);
  const [ratings, current] = await Promise.all([Promise.all(m.players.map((p) => getRating(db, p))), Promise.all(m.players.map((p) => loadDuelHeroes(db, p)))]);
  const queue = await Promise.all(m.players.map((p) => getQueueState(db, p)));
  const profiles = await Promise.all(m.players.map((p) => getDuelProfile(db, p)));
  const day = utcDay(now);
  const rated = m.mode === 'ranked' && o.end !== 'void';
  const nonce = randomToken(8);
  const G = `EXISTS (SELECT 1 FROM duel_matches WHERE id = '${m.id.replace(/[^0-9a-f]/g, '')}' AND apply_nonce = '${nonce}')`;
  const stmts: D1PreparedStatement[] = [];
  const reports: MatchReport[] = [];
  const deltas: (number | null)[] = [null, null];
  for (const side of sides) {
    const pid = m.players[side];
    const other = (1 - side) as Side;
    const score = o.end === 'void' ? null : scoreOf(o.winner, side);
    const abandoned = o.abandoned[side];
    const pay = score === null || abandoned ? { glory: 0, accountXp: 0 } : matchPay(m.mode, score);
    let xp: MatchReport['xp'] = [];
    if (score !== null && !abandoned) {
      const r = duelHeroXp(o.result ?? { units: [] }, m.heroes[side], score === 1, new Rng((m.seed ^ (0x51ed27 + side * 0x9e3779b1)) >>> 0 || 1), side);
      xp = r.xp;
      stmts.push(...heroProgressStmts(db, pid, m.heroes[side], r.heroes, new Map(current[side].map((h) => [h.hero.id, h.hero])), G, now));
    }
    if (score !== null) {
      stmts.push(
        db
          .prepare(`UPDATE duel_profiles SET glory = glory + ?2, xp = xp + ?3, battles = battles + 1, wins = wins + ?4, rev = rev + 1, updated_at = ?5 WHERE player_id = ?1 AND ${G}`)
          .bind(pid, pay.glory, pay.accountXp, score === 1 ? 1 : 0, now),
      );
    }
    // spoils of a won duel: the first ranked win of the UTC day always drops one
    let spoils: Item | null = null;
    if (score === 1 && !abandoned) {
      const firstWin = m.mode === 'ranked' && (profiles[side]?.spoils_day ?? -1) !== day;
      spoils = duelSpoils(m.seed, side, m.mode, firstWin, armyClasses(current[side].map((h) => h.hero)), `${duelPrefix(pid)}sp${m.id.slice(0, 12)}`);
      if (spoils) stmts.push(db.prepare(`INSERT OR IGNORE INTO duel_items (uid, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4 WHERE ${G}`).bind(spoils.uid, pid, JSON.stringify(spoils), now));
      if (firstWin) stmts.push(db.prepare(`UPDATE duel_profiles SET spoils_day = ?2 WHERE player_id = ?1 AND ${G}`).bind(pid, day));
    }
    let rating: MatchReport['rating'] = null;
    let league: MatchReport['league'] = null;
    let placements: MatchReport['placements'] = null;
    if (rated && score !== null) {
      const me = ratings[side];
      // a rating period per idle day widens the RD first (Glicko-2 inactivity)
      const next: Rating = glicko2(idleRating(me, me.played_at, now), idleRating(ratings[other], ratings[other].played_at, now), score);
      const games = me.games + 1;
      const before = rowLeague(me);
      const after = rowLeague({ rating: next.rating, games });
      const peak = placed(games) ? Math.max(me.peak ?? next.rating, next.rating) : null;
      deltas[side] = next.rating - me.rating;
      rating = { before: Math.round(me.rating), after: Math.round(next.rating) };
      league = { before, after };
      placements = { played: Math.min(games, RANKED.placements), of: RANKED.placements };
      stmts.push(
        db
          .prepare(
            `INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, wins, losses, draws, league, peak, last_match, updated_at, season, played_at)
             SELECT ?1, 'live', ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?11 WHERE ${G}
             ON CONFLICT (player_id, ladder) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, vol = excluded.vol, games = games + 1,
               wins = wins + excluded.wins, losses = losses + excluded.losses, draws = draws + excluded.draws, league = excluded.league,
               peak = excluded.peak, last_match = excluded.last_match, updated_at = excluded.updated_at, season = excluded.season, played_at = excluded.played_at`,
          )
          .bind(pid, next.rating, next.rd, next.vol, score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0, leagueText(after), peak, m.id, now, seasonId(now)),
      );
    }
    if (abandoned) {
      const q = recordAbandon(queue[side], now);
      stmts.push(
        db
          .prepare(
            `INSERT INTO duel_queue_state (player_id, abandons, cooldown_until, strikes, strike_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${G}
             ON CONFLICT (player_id) DO UPDATE SET abandons = excluded.abandons, cooldown_until = excluded.cooldown_until, strikes = excluded.strikes,
               strike_at = excluded.strike_at, updated_at = excluded.updated_at`,
          )
          .bind(pid, JSON.stringify(q.abandons), q.cooldownUntil, q.strikes, q.strikeAt, now),
      );
    }
    reports.push({
      match: m.id,
      mode: m.mode,
      side,
      names: m.names,
      winner: o.winner,
      end: o.end,
      verified: o.verified,
      ticks: o.ticks,
      abandoned,
      glory: pay.glory,
      accountXp: pay.accountXp,
      rating,
      league,
      placements,
      xp,
      spoils,
    });
  }
  const pair = reports as [MatchReport, MatchReport];
  const first = db
    .prepare(
      `UPDATE duel_matches SET status = ?2, apply_nonce = ?3, orders = ?4, deploy_orders = ?5, winner = ?6, ending = ?7, ticks = ?8, hash = ?9, verified = ?10,
         delta_a = ?11, delta_b = ?12, result = ?13, finished_at = ?14 WHERE id = ?1 AND status = 'live'`,
    )
    .bind(m.id, o.end === 'void' ? 'void' : 'done', nonce, JSON.stringify(o.log), o.deployOrders, o.winner, o.end, o.ticks, o.hash, o.verified ? 1 : 0, deltas[0], deltas[1], JSON.stringify(pair), now);
  const res = await db.batch([first, ...stmts]);
  if (res[0].meta.changes !== 1) {
    const again = await db.prepare('SELECT result FROM duel_matches WHERE id = ?1').bind(m.id).first<{ result: string | null }>();
    if (again?.result) return JSON.parse(again.result) as [MatchReport, MatchReport];
  }
  return pair;
}

/** The report of a settled match for one of its players, or null (not theirs, or still live). */
export async function matchReport(db: D1Database, id: string, pid: number): Promise<MatchReport | 'live' | null> {
  const r = await db.prepare('SELECT player_a, player_b, status, result FROM duel_matches WHERE id = ?1').bind(id).first<{ player_a: number; player_b: number; status: string; result: string | null }>();
  if (!r || (r.player_a !== pid && r.player_b !== pid)) return null;
  if (r.status === 'live' || !r.result) return 'live';
  return (JSON.parse(r.result) as MatchReport[])[r.player_a === pid ? 0 : 1];
}
