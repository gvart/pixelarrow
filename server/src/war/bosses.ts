/**
 * Region boss kills in D1 (W-45; drop tables src/data/warBosses.ts; migrations/0028_war_boards.sql).
 *
 * A `bossSlain` event of a region room is written once (war_boss_kills, keyed by region, room run and tick): the kill,
 * the last blow's player and alliance, a boss tally for every killer (war_player_stats), and the boss's loot.
 *
 * TODO(W-44): the economy is physical: the loot should fall as a chest at the boss's spot and be carried away. Until
 * the chest exists it is minted into the killers' stashes, the last blow first, then in turn.
 */
import { warBoss, bossLoot } from '../../../src/data/warBosses';
import { makeItem } from '../../../src/game/heroes';
import { Rng, hashString } from '../../../src/sim/rng';
import type { WarEvent } from '../../../src/war/types';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { addStats, ownerPid } from './persons';

export type BossSlain = Extract<WarEvent, { kind: 'bossSlain' }>;

export const bossKillKey = (region: string, run: string, e: BossSlain) => `${region}:${run}:${e.t}:${e.boss}`;

/** Writes one boss kill; false when it was written already (or names no boss / no player). */
export async function applyBossKill(db: D1Database, region: string, run: string, e: BossSlain, now: number): Promise<boolean> {
  if (!warBoss(e.boss)) return false;
  const pids = [...new Set(e.killers.map(ownerPid).filter((p): p is number => p !== null))];
  if (!pids.length) return false;
  const id = bossKillKey(region, run, e);
  const last = pids[0];
  const ally = await db.prepare('SELECT alliance FROM war_alliance_members WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, last).first<{ alliance: number }>();
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO war_boss_kills (id, season, region, boss, alliance, player_id, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(id, WAR_SEASON.id, region, e.boss, ally?.alliance ?? null, last, now),
    ...pids.map((p) => addStats(db, p, { bosses: 1 })),
  ];
  const rng = new Rng(hashString(`${id}:items`) || 1), ids = { nextId: 0 };
  bossLoot(e.boss, id).forEach((d, i) => {
    const item = { ...makeItem(rng, ids, d.def, d.rarity), uid: `boss:${id}:${i}` };
    stmts.push(db.prepare('INSERT INTO war_items (uid, player_id, item, created_at) VALUES (?1, ?2, ?3, ?4)').bind(item.uid, pids[i % pids.length], JSON.stringify(item), now));
  });
  try {
    await db.batch(stmts);
    return true;
  } catch (err) {
    if (/UNIQUE constraint failed: war_boss_kills\.id/.test(String(err))) return false;
    throw err;
  }
}
