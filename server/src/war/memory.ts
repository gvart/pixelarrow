/**
 * M7f region memory (docs/WAR.md "Living regions"; W-47): what a region keeps once its room empties and its full state
 * is dropped (./regionDO.ts save): the pre-built pieces (hp, ruin, owner), the claim points' holders, the guardians (slain
 * or away and the ticks until they are back) and its landmark's capture and restore (src/war/types.ts RegionMemory).
 * Kept in DO storage on every save and in D1 (war_region_state) when it changes; a fresh room recalls it, the ticks since
 * it was written later, so a half-razed town, a restored landmark and a guardian's 24 h survive DO restarts. A memory of
 * another season is ignored: the season start finds every neutral as authored.
 */
import type { RegionMemory } from '../../../src/war/types';
import { WAR_SEASON } from '../../../src/war/world/alliances';

export const MEMORY_KEY = 'memory';
/** Ms a sim tick stands for (10 Hz). */
export const TICK_MS = 100;

export interface Remembered { season: number; at: number; mem: RegionMemory }

export const remembered = (mem: RegionMemory, now: number, season = WAR_SEASON.id): Remembered => ({ season, at: now, mem });

/** Ticks since it was written. */
export const elapsedTicks = (r: Remembered, now: number): number => Math.max(0, Math.floor((now - r.at) / TICK_MS));

export async function storeMemory(storage: DurableObjectStorage, r: Remembered): Promise<void> {
  await storage.put(MEMORY_KEY, r);
}

/** The region's memory of this season: DO storage, else D1; null when there is none (or of another season). */
export async function loadMemory(storage: DurableObjectStorage, db: D1Database | undefined, region: string, season = WAR_SEASON.id): Promise<Remembered | null> {
  let r = (await storage.get<Remembered>(MEMORY_KEY)) ?? null;
  if (!r && db) {
    const row = await db.prepare('SELECT season, memory, at FROM war_region_state WHERE region = ?1').bind(region).first<{ season: number; memory: string; at: number }>();
    if (row) r = { season: row.season, at: row.at, mem: JSON.parse(row.memory) as RegionMemory };
  }
  return r && r.season === season ? r : null;
}

export async function writeMemory(db: D1Database, region: string, r: Remembered): Promise<void> {
  await db
    .prepare('INSERT INTO war_region_state (region, season, memory, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (region) DO UPDATE SET season = ?2, memory = ?3, at = ?4')
    .bind(region, r.season, JSON.stringify(r.mem), r.at)
    .run();
}
