/**
 * W-73 the wild's solo deeds and region mastery on the server (rules: src/war/net/mastery.ts; migration 0052).
 *
 *  - Each deed of the wild a room tick found (WarRoom.tick `wild`: lairs cleared, chiefs slain, hidden quests done)
 *    adds to the player's task tally (metrics lair, chief, secret: ./tasks.ts) and, when the region was built with it,
 *    to his mastery of the region (war_mastery, once per deed: a respawned lair adds nothing).
 *  - The last missing deed masters the region (war_mastery_done, once): MASTERY.favour divine favour (reason
 *    'mastery'), the region's banner deed (src/war/sim/deeds.ts masteryDeed) on his men standing in the region, and the
 *    `mastery` message with done set (the chip's badge and the toast).
 *  - On join the room sends his progress here (`mastery` message).
 */
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { MASTERY, countsFor, masteryNeed, masteryView, type MasteryView, type WildDeed, type WildKind } from '../../../src/war/net/mastery';
import { DEEDS_MAX, masteryDeed } from '../../../src/war/sim/deeds';
import type { RegionData } from '../../../src/war/types';
import type { Env } from '../env';
import { addFavour } from './favour';
import { tallyStmt } from './tasks';

/** His mastery of the region now. */
export async function masteryOf(db: D1Database, pid: number, region: RegionData, season = WAR_SEASON.id): Promise<MasteryView> {
  const rows = (await db.prepare('SELECT kind, key FROM war_mastery WHERE season = ?1 AND player_id = ?2 AND region = ?3').bind(season, pid, region.id).all<{ kind: WildKind; key: string }>()).results;
  return masteryView(region.id, masteryNeed(region), rows);
}

/** The regions he mastered this season (the map badges). */
export async function masteredOf(db: D1Database, pid: number, season = WAR_SEASON.id): Promise<string[]> {
  return (await db.prepare('SELECT region FROM war_mastery_done WHERE season = ?1 AND player_id = ?2 ORDER BY at').bind(season, pid).all<{ region: string }>()).results.map((r) => r.region);
}

/**
 * One player's deeds of the wild in a region: the tallies, the mastery rows, and when the region is newly mastered the
 * favour and the banner. Returns his progress when it changed (null: nothing new for mastery).
 */
export async function recordWild(env: Pick<Env, 'DB'>, pid: number, region: RegionData, deeds: readonly Pick<WildDeed, 'kind' | 'key'>[], now: number, season = WAR_SEASON.id): Promise<MasteryView | null> {
  const db = env.DB;
  if (!db || !deeds.length) return null;
  const need = masteryNeed(region), mine = deeds.filter((d) => countsFor(need, d));
  const stmts = [
    ...deeds.map((d) => tallyStmt(db, pid, d.kind, 1, now, season)),
    ...mine.map((d) => db.prepare('INSERT OR IGNORE INTO war_mastery (season, player_id, region, kind, key, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(season, pid, region.id, d.kind, d.key, now)),
  ];
  const res = await db.batch(stmts);
  if (!res.slice(deeds.length).some((r) => r.meta.changes)) return null;
  const v = await masteryOf(db, pid, region, season);
  if (!v.done) return v;
  const won = await db.prepare('INSERT OR IGNORE INTO war_mastery_done (season, player_id, region, at) VALUES (?1, ?2, ?3, ?4)').bind(season, pid, region.id, now).run();
  if (!won.meta.changes) return v;
  await addFavour(env, pid, MASTERY.favour, 'mastery', now);
  const deed = masteryDeed(region.id, region.name);
  await db
    .prepare(`UPDATE war_persons SET deeds = json_insert(deeds, '$[#]', json(?3)) WHERE player_id = ?1 AND region = ?2 AND state = 'active'
      AND json_array_length(deeds) < ${DEEDS_MAX} AND NOT EXISTS (SELECT 1 FROM json_each(deeds) WHERE json_extract(value, '$.id') = ?4)`)
    .bind(pid, region.id, JSON.stringify(deed), deed.id)
    .run();
  return v;
}
