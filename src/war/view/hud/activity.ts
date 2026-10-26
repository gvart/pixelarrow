/**
 * What selected men are doing, in plain words (W-57), for the squad card and anyone else who shows it (the roster):
 * "Marching to the camp", "Building palisade (62%)", "Waiting for 6 wood", "Gathering wood", "Fighting", "Holding".
 * Read from a snapshot only (no scene), so any panel can use it.
 */
import type { BuildingSnap, NodeSnap, Snapshot, SquadSnap, UnitSnap } from '../../types';

/** A building type in words: stoneWall -> stone wall. */
const words = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());
/** How far (tiles) from a site's edge a builder still counts as at it; a march goal names a building this near it. */
const AT_SITE = 4, AT_GOAL = 3;

/** Why a site stands still in words ("Waiting for 6 wood, 2 stone", "Waiting: no store in reach", "No workers"), '' if it does not. */
export function waitText(b: BuildingSnap): string {
  const goods = Object.entries(b.waiting ?? {}).filter(([, n]) => (n ?? 0) > 0);
  if (goods.length) return `Waiting for ${goods.map(([r, n]) => `${n} ${r}`).join(', ')}`;
  if (b.stalled === 'noStore') return 'Waiting: no store in reach';
  if (b.stalled === 'noWorkers') return 'No workers';
  return '';
}

/** An unfinished site (or one under repair). */
const working = (b: BuildingSnap) => b.state === 'foundation' || b.state === 'scaffold' || !!b.mend;

/**
 * What a squad (or one man) is doing. nodes: the resource nodes (a gatherer's good when he carries none yet); goal: where
 * the last move order went (a building there names the march).
 */
export function activityText(who: SquadSnap | UnitSnap, snap: Snapshot, o: { nodes?: readonly NodeSnap[]; goal?: { x: number; y: number } | null } = {}): string {
  const one = 'cls' in who, sq = one ? snap.squads.find((q) => q.id === who.squad) : who;
  const ids = new Set(one ? [who.id] : who.units), men = snap.units.filter((u) => ids.has(u.id) && u.state !== 'dead');
  if (!men.length) return 'Fallen';
  const order = sq?.order ?? 'hold';
  if (men.some((u) => u.state === 'attack')) return 'Fighting';
  if (sq?.flee || men.some((u) => u.flee)) return 'Fleeing';
  const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cy = men.reduce((a, u) => a + u.y, 0) / men.length;
  const d = (x: number, y: number) => Math.hypot(x - cx, y - cy);
  if (order === 'build' || order === 'repairBuilding' || men.some((u) => u.state === 'build')) {
    let site: BuildingSnap | undefined;
    for (const b of snap.buildings ?? []) if (b.team === sq?.team && working(b) && (!site || d(b.x, b.y) < d(site.x, site.y))) site = b;
    // no site left (the work is done): what they do now, below
    if (site) {
      if (site.waiting || site.stalled === 'noStore') return waitText(site);
      const what = words(site.type), busy = men.some((u) => u.state === 'build' || u.carry);
      const verb = site.mend ? 'Repairing' : site.upgradeFrom ? 'Upgrading to' : 'Building';
      if (busy || d(site.x, site.y) <= Math.max(site.w, site.h) / 2 + AT_SITE) return `${verb} ${what} (${Math.round((site.mend ? site.hp / site.maxHp : site.progress) * 100)}%)`;
      if (men.some((u) => u.state === 'move')) return `Marching to the ${what} site`;
    }
  }
  if (order === 'gather') {
    let res = men.find((u) => u.carry)?.carry, best = Infinity;
    if (!res) for (const n of o.nodes ?? []) if (d(n.x, n.y) < best) (best = d(n.x, n.y)), (res = n.res);
    return `Gathering ${res ?? 'goods'}`;
  }
  if (order === 'civWork') return 'At work';
  if (men.some((u) => u.state === 'move')) {
    const verb = order === 'attackMove' ? 'Advancing' : order === 'attack' ? 'Closing in' : 'Marching';
    const g = o.goal, b = g && (snap.buildings ?? []).find((q) => q.state !== 'destroyed' && Math.abs(q.x - g.x) <= q.w / 2 + AT_GOAL && Math.abs(q.y - g.y) <= q.h / 2 + AT_GOAL);
    return b ? `${verb} to the ${words(b.type)}` : verb;
  }
  return 'Holding';
}
