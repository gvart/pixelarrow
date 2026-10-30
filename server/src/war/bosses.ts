/**
 * Region boss kills in D1 (W-45; drop tables src/data/warBosses.ts; migrations/0028_war_boards.sql).
 *
 * A `bossSlain` event of a region room is written once (war_boss_kills, keyed by region, room run and tick): the kill,
 * the last blow's player and alliance and a boss tally for every killer (war_player_stats). M6e (W-44, W-46): the loot
 * is physical: the room drops bossItems() as a loot pile where the boss fell (WarRoom.tick), for anyone to carry off;
 * nothing is minted. E3: every killer takes its trophy home (war_trophies, migrations/0041_war_veterans.sql), shown in his
 * home town (src/war/view/memorial.ts).
 */
import { asTrophy, bossTrophy, warBoss, bossLoot } from '../../../src/data/warBosses';
import { makeItem } from '../../../src/game/heroes';
import { Rng, hashString } from '../../../src/sim/rng';
import type { WarEvent } from '../../../src/war/types';
import type { Item } from '../../../src/data/items';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { addStats, ownerPid } from './persons';
import { FAVOUR_EARN, favourStmts } from './favour';

export type BossSlain = Extract<WarEvent, { kind: 'bossSlain' }>;

export const bossKillKey = (region: string, run: string, e: BossSlain) => `${region}:${run}:${e.t}:${e.boss}`;

/** The boss's loot as items, the same for the same kill (uids `boss:<key>:<i>`). */
export function bossItems(region: string, run: string, e: BossSlain): Item[] {
  if (!warBoss(e.boss)) return [];
  const id = bossKillKey(region, run, e);
  const rng = new Rng(hashString(`${id}:items`) || 1), ids = { nextId: 0 };
  return bossLoot(e.boss, id).map((d, i) => {
    const it = { ...makeItem(rng, ids, d.def, d.rarity), uid: `boss:${id}:${i}` };
    return d.trophy ? asTrophy(it, e.boss) : it; // W-73: the guardian's trophy
  });
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
    ...pids.flatMap((p) => favourStmts(db, p, FAVOUR_EARN.boss, 'boss', now)), // W-66 divine favour
    ...pids.map((p) => db.prepare('INSERT INTO war_trophies (kill_id, player_id, season, boss, region, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, p, WAR_SEASON.id, e.boss, region, now)),
  ];
  try {
    await db.batch(stmts);
    return true;
  } catch (err) {
    if (/UNIQUE constraint failed: war_boss_kills\.id/.test(String(err))) return false;
    throw err;
  }
}

/** E3: a guardian's trophy in a killer's home town. */
export interface Trophy { boss: string; name: string; region: string; at: number }

/** E3: the player's trophies, newest first. */
export async function trophies(db: D1Database, pid: number): Promise<Trophy[]> {
  const r = await db.prepare('SELECT boss, region, at FROM war_trophies WHERE player_id = ?1 ORDER BY at DESC, kill_id').bind(pid).all<{ boss: string; region: string; at: number }>();
  return r.results.map((x) => ({ boss: x.boss, name: bossTrophy(x.boss), region: x.region, at: x.at }));
}
