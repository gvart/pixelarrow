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
import { ApiError } from '../errors';
import { duelPrefix } from './store';
import { SETS, setPieces } from '../../../src/data/sets';
import type { Item } from '../../../src/data/items';
import { makeItem } from '../../../src/game/heroes';
import { Rng, hashString } from '../../../src/sim/rng';
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
            `INSERT OR IGNORE INTO duel_season_rewards (player_id, season, ladder, league, peak, glory, cosmetic, created_at, pick) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${G}`,
          )
          .bind(pid, r.season, r.ladder, reward.league, r.peak, reward.glory, reward.cosmetic, now, reward.pick),
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
  /** A set to pick one piece of (POST /season/pick), while not picked yet; null otherwise. */
  pick: string | null;
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
  pick: string | null;
  picked: string | null;
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
    db.prepare('SELECT season, ladder, league, glory, cosmetic, seen_at, pick, picked FROM duel_season_rewards WHERE player_id = ?1 ORDER BY season DESC, ladder LIMIT 20').bind(pid).all<RewardRow>(),
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
    // a reward with a piece still to pick comes back until it is picked
    rewards: rewards.results
      .filter((r) => r.seen_at === null || (r.pick && !r.picked))
      .map(({ season, ladder, league, glory, cosmetic, pick, picked }) => ({ season, ladder, league, glory, cosmetic, pick: pick && !picked ? pick : null })),
    table: RANKED.leagues.map((l) => ({ league: l.id, glory: SEASON.rewards[l.id].glory, asyncGlory: Math.round(SEASON.rewards[l.id].glory * SEASON.asyncShare), cosmetic: SEASON.rewards[l.id].cosmetic })),
  };
}

/** The reward popup was shown: those rewards no longer come back. */
export async function markRewardsSeen(db: D1Database, pid: number, now: number): Promise<void> {
  await db.prepare('UPDATE duel_season_rewards SET seen_at = ?2 WHERE player_id = ?1 AND seen_at IS NULL').bind(pid, now).run();
}

/**
 * Picks the set piece of a season reward (Strategos and Legend: a Sacred
 * Band piece of the player's choice) into the duel stash, once: the reward
 * row records the item, and a repeat answers with it (`replayed`).
 */
export async function pickSeasonPiece(db: D1Database, pid: number, season: number, ladder: Ladder, def: string, now: number): Promise<{ item: Item; replayed: boolean }> {
  const where = 'player_id = ?1 AND season = ?2 AND ladder = ?3';
  const row = await db.prepare(`SELECT pick, picked FROM duel_season_rewards WHERE ${where}`).bind(pid, season, ladder).first<{ pick: string | null; picked: string | null }>();
  if (row?.picked) return { item: JSON.parse(row.picked) as Item, replayed: true };
  if (!row?.pick) throw new ApiError(404, 'no_pick', 'That season reward has no piece to pick');
  if (!setPieces(row.pick).includes(def)) throw new ApiError(400, 'not_in_set', 'Pick a piece of the reward\'s set');
  const item = makeItem(new Rng(hashString(`${pid}:${season}:${ladder}:pick`) || 1), { nextId: 1 }, def, SETS[row.pick].rarity, 100);
  item.uid = `${duelPrefix(pid)}ss${season}${ladder === 'live' ? 'l' : 'a'}`;
  const json = JSON.stringify(item);
  await db.batch([
    db.prepare(`UPDATE duel_season_rewards SET picked = ?4, seen_at = COALESCE(seen_at, ?5) WHERE ${where} AND picked IS NULL`).bind(pid, season, ladder, json, now),
    db
      .prepare(`INSERT OR IGNORE INTO duel_items (uid, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM duel_season_rewards WHERE player_id = ?2 AND season = ?5 AND ladder = ?6 AND picked = ?3)`)
      .bind(item.uid, pid, json, now, season, ladder),
  ]);
  const after = await db.prepare(`SELECT picked FROM duel_season_rewards WHERE ${where}`).bind(pid, season, ladder).first<{ picked: string | null }>();
  const got = after?.picked ? (JSON.parse(after.picked) as Item) : item;
  return { item: got, replayed: after?.picked !== json };
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
