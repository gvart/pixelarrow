/** Lazy income of held hexes (computed from server time on read). */
import { hexId } from '../../../src/online/hex';
import { accruedIncome, addResources, adjacencyBonus, friendlyNeighbours, hexIncome, type Resources } from '../../../src/online/rules';
import { hexRowsIn, staticHex, type HexRow, type Shard } from './store';

/** Income waiting on every hex the player holds (lazy accrual, server time). */
export async function pendingIncome(d: D1Database, shard: Shard, pid: number, clanId: number | null, now: number) {
  const mine = await d
    .prepare('SELECT * FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND owner_id = ?3')
    .bind(shard.season, shard.id, pid)
    .all<HexRow>();
  if (mine.results.length === 0) return { total: zero(), hexes: [] as { q: number; r: number; income: Resources; bonus: number }[], rows: [] as HexRow[] };
  const qs = mine.results.map((h) => h.q);
  const rs = mine.results.map((h) => h.r);
  const around = await hexRowsIn(d, shard, Math.min(...qs) - 1, Math.max(...qs) + 1, Math.min(...rs) - 1, Math.max(...rs) + 1);
  const at = new Map(around.map((h) => [hexId(h.q, h.r), h]));
  const holder = (q: number, r: number) => {
    const h = at.get(hexId(q, r));
    return h ? { ownerId: h.owner_id, clanId: h.clan_id } : undefined;
  };
  let total = zero();
  const hexes = mine.results.map((h) => {
    const bonus = adjacencyBonus(friendlyNeighbours(h, holder, { ownerId: pid, clanId }));
    const income = accruedIncome(hexIncome(staticHex(shard, h)), h.accrued_at ?? now, now, bonus);
    total = addResources(total, income);
    return { q: h.q, r: h.r, income, bonus };
  });
  return { total, hexes, rows: mine.results };
}

export function zero(): Resources {
  return { gold: 0, food: 0, wood: 0, bronze: 0, recruits: 0 };
}

