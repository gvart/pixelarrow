/**
 * Read-only queries for the public boards (ADR-0010 §2). Nothing here writes:
 * unlike duel/season.ts leaderboard(), publicDuelTop never rolls ratings.
 */
import { RANKED, leagueOf } from '../../../src/duel/rating';
import type { Ladder } from '../../../src/duel/season';
import type { DuelRow } from './schema';

/** The players columns a public board needs (ADR-0009: V6-ACCT-02 and V6-LINK-01 add them). */
const NAME_COLUMNS = ['display_name', 'public_boards', 'deleted_at'] as const;

/**
 * SQL condition on `players p`: may this player appear on a public board?
 * Never deleted, never banned, not opted out, and named.
 */
export const ELIGIBLE = 'p.deleted_at IS NULL AND p.banned_at IS NULL AND p.public_boards = 1 AND p.display_name IS NOT NULL';

/**
 * Whether the players table has the public-name columns yet. Until the
 * display-name migration lands no public board may be served (ADR-0010,
 * "Ordering Note"), so the builder leaves every board empty.
 */
export async function publicNamesReady(db: D1Database): Promise<{ ready: boolean; deletedAt: boolean }> {
  const cols = new Set((await db.prepare("SELECT name FROM pragma_table_info('players')").all<{ name: string }>()).results.map((r) => r.name));
  return { ready: NAME_COLUMNS.every((c) => cols.has(c)), deletedAt: cols.has('deleted_at') };
}

/**
 * The top placed duelists of a ladder and season, by rating, eligible players
 * only. As in the game, only Legend shows a (rounded) rating; the others show
 * their league. Callers check publicNamesReady first.
 */
export async function publicDuelTop(db: D1Database, ladder: Ladder, season: number, limit: number): Promise<DuelRow[]> {
  const rows = (
    await db
      .prepare(
        `SELECT p.display_name AS name, d.rating, d.games FROM duel_ratings d JOIN players p ON p.id = d.player_id
         WHERE d.ladder = ?1 AND d.season = ?2 AND d.games >= ?3 AND ${ELIGIBLE}
         ORDER BY d.rating DESC, d.player_id LIMIT ?4`,
      )
      .bind(ladder, season, RANKED.placements, limit)
      .all<{ name: string; rating: number; games: number }>()
  ).results;
  return rows.map((r, i) => {
    const league = leagueOf(r.rating).id;
    return { rank: i + 1, name: r.name, league, rating: league === 'legend' ? Math.round(r.rating) : null, games: r.games };
  });
}
