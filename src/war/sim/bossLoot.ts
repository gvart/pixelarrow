/**
 * M7d: a slain guardian's loot as a pile's goods and items (W-45, W-46; docs/WAR.md "Loot piles"): the drop table of
 * src/data/warBosses.ts (bossLoot, by tier, a signature chance on the rim) made into items, and its landmark's rare good
 * (bossGoods) stamped with the region as origin. The region room does the same for the live game (server/src/war/bosses.ts
 * bossItems, keyed by its run); the sandbox worker drops this where the `bossSlain` event says the body fell.
 */
import { bossGoods, bossLoot, warBoss } from '../../data/warBosses';
import { makeItem } from '../../game/heroes';
import { Rng, hashString } from '../../sim/rng';
import type { Item } from '../../data/items';
import type { WarEvent } from '../types';
import type { Lot } from './holders';

export type BossSlain = Extract<WarEvent, { kind: 'bossSlain' }>;

/** The pile of a kill (the same kill, the same pile): `run` names the room or sandbox run. */
export function bossPile(region: string, run: string, e: BossSlain): { x: number; y: number; lots: Lot[]; items: Item[] } {
  if (!warBoss(e.boss)) return { x: e.x ?? 0, y: e.y ?? 0, lots: [], items: [] };
  const key = `${region}:${run}:${e.t}:${e.boss}`;
  const rng = new Rng(hashString(`${key}:items`) || 1), ids = { nextId: 0 };
  const items = bossLoot(e.boss, key).map((d, i) => ({ ...makeItem(rng, ids, d.def, d.rarity), uid: `boss:${key}:${i}` }));
  return { x: e.x ?? 0, y: e.y ?? 0, lots: bossGoods(e.boss).map((g) => ({ r: g.r, n: g.n, o: region })), items };
}
