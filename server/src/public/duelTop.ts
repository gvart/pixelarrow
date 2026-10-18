/**
 * Read-only queries for the public boards (ADR-0010 §2). Nothing here writes:
 * unlike duel/season.ts leaderboard(), publicDuelTop never rolls ratings.
 */
import { RANKED, leagueOf } from '../../../src/duel/rating';
import type { Ladder } from '../../../src/duel/season';
import type { DuelRow } from './schema';

/**
 * SQL condition on `players p`: may this player appear on a public board?
 * Never deleted, never banned, not opted out, and named.
 */
export const ELIGIBLE = 'p.deleted_at IS NULL AND p.banned_at IS NULL AND p.public_boards = 1 AND p.display_name IS NOT NULL';

/**
 * The top placed duelists of a ladder and season, by rating, eligible players
 * only. As in the game, only Legend shows a (rounded) rating; the others show
 * their league.
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
