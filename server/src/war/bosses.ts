/**
 * Region boss kills in D1 (W-45; drop tables src/data/warBosses.ts; migrations/0028_war_boards.sql).
 *
 * A `bossSlain` event of a region room is written once (war_boss_kills, keyed by region, room run and tick): the kill,
 * the last blow's player and alliance and a boss tally for every killer (war_player_stats). M6e (W-44, W-46): the loot
 * is physical: the room drops bossItems() as a loot pile where the boss fell (WarRoom.tick), for anyone to carry off;
 * nothing is minted.
 */
import { warBoss, bossLoot } from '../../../src/data/warBosses';
import { makeItem } from '../../../src/game/heroes';
import { Rng, hashString } from '../../../src/sim/rng';
import type { WarEvent } from '../../../src/war/types';
import type { Item } from '../../../src/data/items';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { addStats, ownerPid } from './persons';

export type BossSlain = Extract<WarEvent, { kind: 'bossSlain' }>;

export const bossKillKey = (region: string, run: string, e: BossSlain) => `${region}:${run}:${e.t}:${e.boss}`;

/** The boss's loot as items, the same for the same kill (uids `boss:<key>:<i>`). */
export function bossItems(region: string, run: string, e: BossSlain): Item[] {
  if (!warBoss(e.boss)) return [];
  const id = bossKillKey(region, run, e);
  const rng = new Rng(hashString(`${id}:items`) || 1), ids = { nextId: 0 };
  return bossLoot(e.boss, id).map((d, i) => ({ ...makeItem(rng, ids, d.def, d.rarity), uid: `boss:${id}:${i}` }));
}

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
  try {
    await db.batch(stmts);
    return true;
  } catch (err) {
    if (/UNIQUE constraint failed: war_boss_kills\.id/.test(String(err))) return false;
    throw err;
  }
}
