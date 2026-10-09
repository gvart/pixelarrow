/**
 * Server side of the item sources shared by the war map and the duels
 * (docs/ITEMS.md "Where items come from"): the bad-luck counter per player
 * and track (loot_pity, migration 0015). Rules: src/game/sources.ts.
 */

export type PityTrack = 'war' | 'duel';

/** A player's bad-luck counter on a track (0 without a row). */
export async function getPity(db: D1Database, pid: number, track: PityTrack): Promise<number> {
  const r = await db.prepare('SELECT count FROM loot_pity WHERE player_id = ?1 AND track = ?2').bind(pid, track).first<{ count: number }>();
  return r?.count ?? 0;
}

/** Sets the counter, guarded by `G` (the batch's apply guard). */
export function pityStmt(db: D1Database, pid: number, track: PityTrack, count: number, G: string, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO loot_pity (player_id, track, count, updated_at) SELECT ?1, ?2, ?3, ?4 WHERE ${G}
       ON CONFLICT (player_id, track) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`,
    )
    .bind(pid, track, count, now);
}
