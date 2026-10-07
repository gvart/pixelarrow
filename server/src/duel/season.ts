/**
 * Monthly ranked seasons and leaderboards (docs/DUELS.md "Matchmaking and
 * rating"). Shared rules: src/duel/season.ts.
 *
 * No cron: a rating row belongs to the season it was last rolled into, and
 * the first access in a later season (the hub, the queue, a settlement)
 * rolls it over once: the first statement moves `season` forward with a
 * fresh roll_nonce, and every other write (the reward row, its Glory, the
 * league cosmetic) is guarded by that nonce, so a season pays exactly once
 * however often or concurrently rollRatings runs.
 *
 * Leaderboards list the rows of the running season (players who played or
 * opened the duels since it began), placed, by rating.
 */
import { RANKED, leagueOf, placed, type League, type LeagueId } from '../../../src/duel/rating';
import { SEASON, bestLeague, seasonEnd, seasonId, seasonReward, seasonStart, softReset, type Ladder } from '../../../src/duel/season';
import { randomToken } from '../online/store';
import { playerNames } from '../online/store';
import { leagueText, rowLeague, type RatingRow } from './live';

/** Rolls the player's rating rows (live and async) into the season of `now`: soft reset and the past season's rewards. */
export async function rollRatings(db: D1Database, pid: number, now: number): Promise<void> {
  const cur = seasonId(now);
  const rows = (await db.prepare('SELECT * FROM duel_ratings WHERE player_id = ?1 AND season < ?2').bind(pid, cur).all<RatingRow & { ladder: Ladder }>()).results;
  for (const r of rows) {
    const nonce = randomToken(8);
    const next = softReset(r, cur - r.season);
    const reward = placed(r.games) ? seasonReward(r.peak, r.ladder) : null;
    const G = `EXISTS (SELECT 1 FROM duel_ratings WHERE player_id = ${pid | 0} AND ladder = '${r.ladder === 'async' ? 'async' : 'live'}' AND roll_nonce = '${nonce}')`;
    const stmts: D1PreparedStatement[] = [
      db
        .prepare('UPDATE duel_ratings SET rating = ?4, rd = ?5, peak = NULL, league = ?6, season = ?7, roll_nonce = ?8, updated_at = ?9 WHERE player_id = ?1 AND ladder = ?2 AND season = ?3')
        .bind(pid, r.ladder, r.season, next.rating, next.rd, leagueText(rowLeague({ rating: next.rating, games: r.games })), cur, nonce, now),
    ];
    if (reward) {
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO duel_season_rewards (player_id, season, ladder, league, peak, glory, cosmetic, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ${G}`,
          )
          .bind(pid, r.season, r.ladder, reward.league, r.peak, reward.glory, reward.cosmetic, now),
        db.prepare(`UPDATE duel_profiles SET glory = glory + ?2, rev = rev + 1, updated_at = ?3 WHERE player_id = ?1 AND ${G}`).bind(pid, reward.glory, now),
        db.prepare(`INSERT OR IGNORE INTO entitlements (player_id, product_id, purchase_id, granted_at) SELECT ?1, ?2, NULL, ?3 WHERE ${G}`).bind(pid, reward.cosmetic, now),
      );
    }
    await db.batch(stmts);
  }
}

export interface SeasonRewardView {
  season: number;
  ladder: Ladder;
  league: LeagueId;
  glory: number;
  cosmetic: string;
}

export interface SeasonView {
  now: number;
  season: { id: number; start: number; end: number };
  /** The league now and the best reached this season (null: not placed / no rated game this season). */
  live: { league: League | null; peak: League | null };
  async: { league: League | null; peak: League | null };
  /** The profile title: the best peak league of the last season that paid. */
  title: { league: LeagueId; season: number } | null;
  /** Rewards the player has not seen yet (the popup after a season ends). */
  rewards: SeasonRewardView[];
  /** What each league pays at the end of the season. */
  table: { league: LeagueId; glory: number; asyncGlory: number; cosmetic: string }[];
}

interface RewardRow {
  season: number;
  ladder: Ladder;
  league: LeagueId;
  glory: number;
  cosmetic: string;
  seen_at: number | null;
}

/** The player's title: the best peak league of the latest rewarded season. */
export function titleOf(rows: readonly Pick<RewardRow, 'season' | 'league'>[]): SeasonView['title'] {
  if (!rows.length) return null;
  const last = Math.max(...rows.map((r) => r.season));
  let best: LeagueId | null = null;
  for (const r of rows) if (r.season === last) best = bestLeague(best, r.league);
  return best ? { league: best, season: last } : null;
}

export async function seasonView(db: D1Database, pid: number, now: number): Promise<SeasonView> {
  await rollRatings(db, pid, now);
  const id = seasonId(now);
  const [ratings, rewards] = await Promise.all([
    db.prepare('SELECT ladder, rating, games, peak FROM duel_ratings WHERE player_id = ?1').bind(pid).all<{ ladder: Ladder; rating: number; games: number; peak: number | null }>(),
    db.prepare('SELECT season, ladder, league, glory, cosmetic, seen_at FROM duel_season_rewards WHERE player_id = ?1 ORDER BY season DESC, ladder LIMIT 20').bind(pid).all<RewardRow>(),
  ]);
  const card = (ladder: Ladder) => {
    const r = ratings.results.find((x) => x.ladder === ladder);
    if (!r) return { league: null, peak: null };
    return { league: rowLeague(r), peak: placed(r.games) && r.peak !== null ? leagueOf(r.peak) : null };
  };
  return {
    now,
    season: { id, start: seasonStart(id), end: seasonEnd(id) },
    live: card('live'),
    async: card('async'),
    title: titleOf(rewards.results),
    rewards: rewards.results.filter((r) => r.seen_at === null).map(({ season, ladder, league, glory, cosmetic }) => ({ season, ladder, league, glory, cosmetic })),
    table: RANKED.leagues.map((l) => ({ league: l.id, glory: SEASON.rewards[l.id].glory, asyncGlory: Math.round(SEASON.rewards[l.id].glory * SEASON.asyncShare), cosmetic: SEASON.rewards[l.id].cosmetic })),
  };
}

/** The reward popup was shown: those rewards no longer come back. */
export async function markRewardsSeen(db: D1Database, pid: number, now: number): Promise<void> {
  await db.prepare('UPDATE duel_season_rewards SET seen_at = ?2 WHERE player_id = ?1 AND seen_at IS NULL').bind(pid, now).run();
}

// ------------------------------------------------------------------ leaderboards

export type Board = 'live' | 'async' | 'legend';

export interface BoardRow {
  rank: number;
  pid: number;
  name: string;
  league: League;
  /** Exact rating: Legend only (hidden below it). */
  rating: number | null;
  games: number;
}

export interface LeaderboardView {
  board: Board;
  season: { id: number; end: number };
  rows: BoardRow[];
  /** The player's own place (null: not placed or no rated game this season). */
  me: BoardRow | null;
}

export const BOARD_SIZE = 50;

/** Top players of the running season: live, async, or Legend (live) only. */
export async function leaderboard(db: D1Database, board: Board, pid: number, now: number): Promise<LeaderboardView> {
  await rollRatings(db, pid, now);
  const id = seasonId(now);
  const ladder: Ladder = board === 'async' ? 'async' : 'live';
  const min = board === 'legend' ? RANKED.leagues[RANKED.leagues.length - 1].min : -1e9;
  const rows = (
    await db
      .prepare('SELECT player_id, rating, games FROM duel_ratings WHERE ladder = ?1 AND season = ?2 AND games >= ?3 AND rating >= ?4 ORDER BY rating DESC, player_id LIMIT ?5')
      .bind(ladder, id, RANKED.placements, min, BOARD_SIZE)
      .all<{ player_id: number; rating: number; games: number }>()
  ).results;
  const mine = await db.prepare('SELECT rating, games FROM duel_ratings WHERE player_id = ?1 AND ladder = ?2 AND season = ?3').bind(pid, ladder, id).first<{ rating: number; games: number }>();
  const names = await playerNames(db, [...rows.map((r) => r.player_id), pid]);
  const view = (rank: number, p: number, rating: number, games: number): BoardRow => {
    const league = leagueOf(rating);
    return { rank, pid: p, name: names.get(p) ?? `#${p}`, league, rating: league.id === 'legend' ? Math.round(rating) : null, games };
  };
  let me: BoardRow | null = null;
  if (mine && placed(mine.games) && mine.rating >= min) {
    const above = await db
      .prepare('SELECT COUNT(*) AS n FROM duel_ratings WHERE ladder = ?1 AND season = ?2 AND games >= ?3 AND (rating > ?4 OR (rating = ?4 AND player_id < ?5))')
      .bind(ladder, id, RANKED.placements, mine.rating, pid)
      .first<{ n: number }>();
    me = view((above?.n ?? 0) + 1, pid, mine.rating, mine.games);
  }
  return { board, season: { id, end: seasonEnd(id) }, rows: rows.map((r, i) => view(i + 1, r.player_id, r.rating, r.games)), me };
}
