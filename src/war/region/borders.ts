/**
 * Shared borders of the world regions (docs/WAR.md "World"): the check that every exit lines up with its neighbour's
 * entry, run by scripts/war/regions/build.ts (via ./checks.ts there) and tests/war/worldRegions.test.ts.
 */
/** A built region's entries as the JSON carries them (`entries` in the order of `meta.adjacent`). */
export interface Borders { id: string; entries: { side: string; x: number; y: number; w: number; h: number }[]; meta: { adjacent: { id: string; side: string }[] } }
const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Shared borders line up: for every pair of neighbours, A's entry toward B is on the side opposite B's entry toward A
 * and at the same place along it (within `tol` tiles), so a transfer leaves one map where it enters the next.
 */
export function mirrorChecks(regions: Borders[], tol = 2): string[] {
  const by = new Map(regions.map((r) => [r.id, r])), bad: string[] = [];
  const along = (e: Borders['entries'][number]) => (e.side === 'N' || e.side === 'S' ? e.x + e.w / 2 : e.y + e.h / 2);
  for (const a of regions) a.meta.adjacent.forEach((adj, n) => {
    const b = by.get(adj.id);
    if (!b || a.id > b.id) return;
    const m = b.meta.adjacent.findIndex((x) => x.id === a.id);
    if (m < 0) return void bad.push(`${a.id} -> ${b.id}: ${b.id} has no entry back`);
    const ea = a.entries[n], eb = b.entries[m];
    if (OPPOSITE[ea.side] !== eb.side) bad.push(`${a.id} ${ea.side} - ${b.id} ${eb.side}: not opposite sides`);
    else if (Math.abs(along(ea) - along(eb)) > tol) bad.push(`${a.id} ${ea.side} at ${along(ea)} - ${b.id} ${eb.side} at ${along(eb)}: not lined up`);
  });
  return bad;
}
