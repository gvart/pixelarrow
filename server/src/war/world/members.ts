/**
 * Alliance membership in D1 (M4, migrations/0026_war_world.sql): per war season, a player serves one of the four
 * alliances; clans are sub-groups inside one (a clan's alliance is set by its first member to join, the rest follow).
 * Joining is dev-only for now (the season's assignment rules come later); a player with men in the field or on the road
 * cannot change sides.
 */
import { WAR_SEASON } from '../../../../src/war/world/alliances';
import type { AllianceId } from '../../../../src/war/world/types';
import { ApiError } from '../../errors';
import { currentSeason, membership } from '../store';

export async function allianceOf(db: D1Database, pid: number, season = WAR_SEASON.id): Promise<AllianceId | null> {
  const r = await db.prepare('SELECT alliance FROM war_alliance_members WHERE season = ?1 AND player_id = ?2').bind(season, pid).first<{ alliance: number }>();
  return r ? (r.alliance as AllianceId) : null;
}

export async function joinAlliance(db: D1Database, pid: number, alliance: AllianceId, now: number, season = WAR_SEASON.id): Promise<void> {
  const cur = await allianceOf(db, pid, season);
  if (cur === alliance) return;
  if (cur !== null) {
    const out = await db.prepare('SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND region IS NOT NULL').bind(pid).first<{ n: number }>();
    if (out?.n) throw new ApiError(409, 'deployed', 'Your men are in the field or on the road');
  }
  const clan = await membership(db, (await currentSeason(db, now)).id, pid);
  if (clan) {
    await db.prepare('INSERT OR IGNORE INTO war_alliance_clans (season, clan_id, alliance) VALUES (?1, ?2, ?3)').bind(season, clan.clanId, alliance).run();
    const bound = await db.prepare('SELECT alliance FROM war_alliance_clans WHERE season = ?1 AND clan_id = ?2').bind(season, clan.clanId).first<{ alliance: number }>();
    if (bound && bound.alliance !== alliance) throw new ApiError(409, 'clan_alliance', 'Your clan serves another alliance');
  }
  await db
    .prepare('INSERT INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (season, player_id) DO UPDATE SET alliance = ?3, joined_at = ?4')
    .bind(season, pid, alliance, now)
    .run();
}

/** Members and clans per alliance. */
export async function allianceCounts(db: D1Database, season = WAR_SEASON.id): Promise<{ members: number[]; clans: number[] }> {
  const [m, c] = await Promise.all([
    db.prepare('SELECT alliance, COUNT(*) AS n FROM war_alliance_members WHERE season = ?1 GROUP BY alliance').bind(season).all<{ alliance: number; n: number }>(),
    db.prepare('SELECT alliance, COUNT(*) AS n FROM war_alliance_clans WHERE season = ?1 GROUP BY alliance').bind(season).all<{ alliance: number; n: number }>(),
  ]);
  const members = [0, 0, 0, 0], clans = [0, 0, 0, 0];
  for (const r of m.results) members[r.alliance] = r.n;
  for (const r of c.results) clans[r.alliance] = r.n;
  return { members, clans };
}
