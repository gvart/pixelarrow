/** Season pass XP (written by verified battle events, inside their guarded batches). */
import { PASS } from './catalog';

/** Adds pass XP for a season when `guard` (SQL boolean) holds. */
export function passXpStmt(db: D1Database, season: number, pid: number, xp: number, guard: string, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO pass_progress (season_id, player_id, xp, premium, updated_at) SELECT ?1, ?2, ?3, 0, ?4 WHERE ${guard}
       ON CONFLICT (season_id, player_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = excluded.updated_at`,
    )
    .bind(season, pid, xp, now);
}

/** Pass XP of a verified attack. */
export function attackXp(won: boolean, captured: boolean): number {
  return PASS.xp.attack + (won ? PASS.xp.attackWin : 0) + (captured ? PASS.xp.capture : 0);
}

/** Highest tier reached with this much XP. */
export function passTier(xp: number): number {
  return Math.min(PASS.tiers, Math.floor(xp / PASS.xpPerTier));
}
