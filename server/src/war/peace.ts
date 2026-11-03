/**
 * W-61 season stats per player (war_season_stats, migrations/0039_war_peace.sql): coin sold at his stalls (every fill),
 * contracts filled (as taker), labour (worker-seconds sold under build contracts, man-seconds given to works), guard
 * seconds held. The stats' season is the world's (STAT_SEASON: one past the last roll in war_season_results), not
 * WAR_SEASON.id. They are a record: titles are the ladders' first places now (./ladders.ts, W-166).
 */
import { WAR_SEASON } from '../../../src/war/world/alliances';

export type Stat = 'sold' | 'contracts' | 'labour' | 'guard';

/**
 * SQL for the world season the stats count in: the one after the last finished (its board is written at the rollover
 * before the next season starts), WAR_SEASON.id before any. `COALESCE(?n, STAT_SEASON)` with a null binding: this one.
 */
export const STAT_SEASON = `COALESCE((SELECT MAX(season) + 1 FROM war_season_results), ${WAR_SEASON.id})`;

/** Add `n` to stat `col` of the player this season (a statement; `season`: the stats' season by default). */
export function statStmt(db: D1Database, pid: number, col: Stat, n: number, season?: number): D1PreparedStatement {
  return db.prepare(`INSERT INTO war_season_stats (season, player_id, ${col}) VALUES (COALESCE(?1, ${STAT_SEASON}), ?2, ?3) ON CONFLICT (season, player_id) DO UPDATE SET ${col} = ${col} + ?3`).bind(season ?? null, pid, n);
}

/** A player's stats this season (the roster's peace line). */
export async function statsOf(db: D1Database, pid: number, season?: number) {
  const r = await db.prepare(`SELECT sold, contracts, labour, guard FROM war_season_stats WHERE season = COALESCE(?1, ${STAT_SEASON}) AND player_id = ?2`).bind(season ?? null, pid).first<{ sold: number; contracts: number; labour: number; guard: number }>();
  return { sold: r?.sold ?? 0, contracts: r?.contracts ?? 0, labourHours: (r?.labour ?? 0) / 3600, guardHours: (r?.guard ?? 0) / 3600 };
}
