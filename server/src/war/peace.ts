/**
 * W-61 peaceful play: season stats, the peace score's daily caps and the season's titles (docs/WAR.md "Peaceful play";
 * migrations/0039_war_peace.sql; weights: src/war/world/season.ts PEACE).
 *
 *  - Stats per player and season (war_season_stats): coin sold at his stalls (every fill), contracts filled (as taker),
 *    labour (worker-seconds sold under build contracts, man-seconds given to works), guard seconds held.
 *  - Peace score (war_peace_score): per alliance, UTC day and kind, capped a day; the points also go to the world
 *    (WarWorldDO.addPeace) by the caller.
 *  - Titles: the season's leader in each stat, at least TITLE.min of it: Merchant Prince (coin sold), Master Builder
 *    (labour), Warden (guard hours), Warlord (kills of his men this season: war_player_stats, not the men's lifetime kills).
 */
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { PEACE } from '../../../src/war/world/season';
import type { AllianceId } from '../../../src/war/world/types';
import type { Env } from '../env';
import { logError } from '../telemetry/log';
import { worldStub } from './world/routes';

const DAY = 86_400_000;
export type Stat = 'sold' | 'contracts' | 'labour' | 'guard';
export type PeaceKind = 'volume' | 'contracts' | 'works';

/** Add `n` to stat `col` of the player this season (a statement). */
export function statStmt(db: D1Database, pid: number, col: Stat, n: number, season = WAR_SEASON.id): D1PreparedStatement {
  return db.prepare(`INSERT INTO war_season_stats (season, player_id, ${col}) VALUES (?1, ?2, ?3) ON CONFLICT (season, player_id) DO UPDATE SET ${col} = ${col} + ?3`).bind(season, pid, n);
}

const CAPS: Record<PeaceKind, number> = { volume: PEACE.volumeCap, contracts: PEACE.contractCap, works: Infinity };

/** Points of `kind` alliance `a` may still score today, and the statement that books `pts` of them. */
export async function peacePoints(db: D1Database, a: number, kind: PeaceKind, pts: number, now: number): Promise<{ pts: number; stmts: D1PreparedStatement[] }> {
  if (!(pts > 0)) return { pts: 0, stmts: [] };
  const day = Math.floor(now / DAY);
  const r = await db.prepare('SELECT points FROM war_peace_score WHERE season = ?1 AND alliance = ?2 AND day = ?3 AND kind = ?4').bind(WAR_SEASON.id, a, day, kind).first<{ points: number }>();
  const got = Math.min(pts, Math.max(0, CAPS[kind] - (r?.points ?? 0)));
  if (!(got > 0)) return { pts: 0, stmts: [] };
  return {
    pts: got,
    stmts: [db.prepare('INSERT INTO war_peace_score (season, alliance, day, kind, points) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (season, alliance, day, kind) DO UPDATE SET points = points + ?5').bind(WAR_SEASON.id, a, day, kind, got)],
  };
}

/** Book and send `pts` of `kind` to alliance `a` (capped a day): the world adds it to the season. */
export async function scorePeace(env: Env, a: number | null, kind: PeaceKind, pts: number, now: number): Promise<number> {
  const db = env.DB;
  if (!db || a === null || a < 0) return 0;
  const p = await peacePoints(db, a, kind, pts, now);
  if (!p.pts) return 0;
  await db.batch(p.stmts);
  try {
    await worldStub(env).addPeace(a as AllianceId, kind, p.pts);
  } catch (e) {
    logError('war_peace_failed', e, { kind });
  }
  return p.pts;
}

/** Points a filled contract scores (before the day's cap). */
export const contractPoints = (reward: number) => PEACE.contract + reward / PEACE.contractPer;

export const TITLE = { min: 1 };
export type TitleId = 'merchantPrince' | 'masterBuilder' | 'warden' | 'warlord';
export const TITLES: readonly { id: TitleId; name: string; of: string }[] = [
  { id: 'merchantPrince', name: 'Merchant Prince', of: 'coin sold at his stalls' },
  { id: 'masterBuilder', name: 'Master Builder', of: 'man-hours of labour sold or given' },
  { id: 'warden', name: 'Warden', of: 'hours held under guard contracts' },
  { id: 'warlord', name: 'Warlord', of: 'foes his men struck down' },
];
export interface Title { id: TitleId; name: string; pid: number; player: string; alliance: number; home: string | null; value: number }

/** The season's titles: the leader in each (ties: the lower player id). */
export async function titles(db: D1Database, season = WAR_SEASON.id): Promise<Title[]> {
  const q = async (sql: string): Promise<{ pid: number; v: number } | null> => db.prepare(sql).bind(season).first<{ pid: number; v: number }>();
  const top: Record<TitleId, { pid: number; v: number } | null> = {
    merchantPrince: await q('SELECT player_id AS pid, sold AS v FROM war_season_stats WHERE season = ?1 AND sold > 0 ORDER BY sold DESC, player_id LIMIT 1'),
    masterBuilder: await q('SELECT player_id AS pid, labour / 3600.0 AS v FROM war_season_stats WHERE season = ?1 AND labour > 0 ORDER BY labour DESC, player_id LIMIT 1'),
    warden: await q('SELECT player_id AS pid, guard / 3600.0 AS v FROM war_season_stats WHERE season = ?1 AND guard > 0 ORDER BY guard DESC, player_id LIMIT 1'),
    warlord: await q('SELECT player_id AS pid, kills AS v FROM war_player_stats WHERE season = ?1 AND kills > 0 ORDER BY kills DESC, player_id LIMIT 1'),
  };
  const out: Title[] = [];
  for (const t of TITLES) {
    const r = top[t.id];
    if (!r || r.v < TITLE.min) continue;
    const who = await db
      .prepare('SELECT pl.display_name AS name, m.alliance AS alliance, m.home AS home FROM players pl LEFT JOIN war_alliance_members m ON m.player_id = pl.id AND m.season = ?2 WHERE pl.id = ?1')
      .bind(r.pid, season)
      .first<{ name: string | null; alliance: number | null; home: string | null }>();
    out.push({ id: t.id, name: t.name, pid: r.pid, player: who?.name ?? `#${r.pid}`, alliance: who?.alliance ?? -1, home: who?.home ?? null, value: Math.round(r.v * 10) / 10 });
  }
  return out;
}

/** A player's stats this season (the roster's peace line). */
export async function statsOf(db: D1Database, pid: number, season = WAR_SEASON.id) {
  const r = await db.prepare('SELECT sold, contracts, labour, guard FROM war_season_stats WHERE season = ?1 AND player_id = ?2').bind(season, pid).first<{ sold: number; contracts: number; labour: number; guard: number }>();
  return { sold: r?.sold ?? 0, contracts: r?.contracts ?? 0, labourHours: (r?.labour ?? 0) / 3600, guardHours: (r?.guard ?? 0) / 3600 };
}
