/** Lazy income of held regions (computed from server time on read). */
import { accruedIncome, addResources, adjacencyBonus, friendlyNeighbours, regionIncome, type Resources } from '../../../src/online/rules';
import { regionRows, staticRegion, type RegionRow, type Shard } from './store';

/** Income waiting on every region the player holds (lazy accrual, server time). */
export async function pendingIncome(d: D1Database, shard: Shard, pid: number, clanId: number | null, now: number) {
  const mine = await d
    .prepare('SELECT * FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id = ?3')
    .bind(shard.season, shard.id, pid)
    .all<RegionRow>();
  if (mine.results.length === 0) return { total: zero(), regions: [] as { loc: number; income: Resources; bonus: number }[], rows: [] as RegionRow[] };
  const w = shard.world;
  const around = new Set<number>();
  for (const h of mine.results) if (w.has(h.loc)) for (const n of w.neighbours(h.loc)) around.add(n);
  const at = new Map([...mine.results, ...(await regionRows(d, shard, around))].map((h) => [h.loc, h]));
  const holder = (loc: number) => {
    const h = at.get(loc);
    return h ? { ownerId: h.owner_id, clanId: h.clan_id } : undefined;
  };
  let total = zero();
  const regions = mine.results
    .filter((h) => w.has(h.loc))
    .map((h) => {
      const bonus = adjacencyBonus(friendlyNeighbours(w, h.loc, holder, { ownerId: pid, clanId }));
      const income = accruedIncome(regionIncome(staticRegion(shard, h.loc)), h.accrued_at ?? now, now, bonus);
      total = addResources(total, income);
      return { loc: h.loc, income, bonus };
    });
  return { total, regions, rows: mine.results };
}

export function zero(): Resources {
  return { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
}
