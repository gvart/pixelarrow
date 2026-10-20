/**
 * Civilian squads (M5f) on the command card (./hud.ts): they take work orders only, so the card shows Move, Hold, Stop
 * and their jobs instead of the attack orders: Work (stand at the nearest own done camp, storehouse or fort and work
 * there by class, the sim's civWork), Gather (the nearest node with something left) and Build (the nearest unfinished
 * own site). The head reads the class and what the squad is doing (at work, fleeing, fed).
 */
import { CIV_CLASSES, isCivClass } from '../../../data/classes';
import { BUILDINGS } from '../../sim/economy';
import type { BuildingSnap, NodeSnap, Order, SquadId } from '../../types';
import type { SandboxScene } from '../SandboxScene';

const TEAM = 0;

/** All the selected own squads are civilians (and there is one). */
export function allCivilians(s: SandboxScene, own: SquadId[]): boolean {
  return own.length > 0 && own.every((q) => s.sim.squads.get(q)?.civ);
}
/** Some selected own squad fights (attack-move and A apply to it). */
export function anySoldiers(s: SandboxScene, own: SquadId[]): boolean {
  return own.some((q) => !s.sim.squads.get(q)?.civ);
}

export const civName = (cls: string) => (isCivClass(cls) ? CIV_CLASSES[cls].name + 's' : undefined);

/** The squad's centre from its drawn men. */
const centre = (s: SandboxScene, q: SquadId): [number, number] | null => {
  let x = 0, y = 0, n = 0;
  for (const d of s.drawn) if (d.u.squad === q && d.u.state !== 'dead') (x += d.x), (y += d.y), n++;
  return n ? [x / n, y / n] : null;
};
const nearest = <T extends { x: number; y: number }>(xs: T[], p: [number, number]): T | undefined => {
  let best: T | undefined, bd = Infinity;
  for (const o of xs) {
    const d = (o.x - p[0]) ** 2 + (o.y - p[1]) ** 2;
    if (d < bd) (bd = d), (best = o);
  }
  return best;
};
const stores = (s: SandboxScene): BuildingSnap[] => (s.sim.cur?.buildings ?? []).filter((b) => b.team === TEAM && BUILDINGS[b.type].store && (b.state === 'done' || b.state === 'damaged'));
const sites = (s: SandboxScene): BuildingSnap[] => (s.sim.cur?.buildings ?? []).filter((b) => b.team === TEAM && b.state !== 'done' && b.state !== 'destroyed');
const nodes = (s: SandboxScene): NodeSnap[] => s.sim.nodes.filter((n) => n.amount > 0 && !n.guarded);

/** One order per selected civilian squad, to its nearest target (none: nothing sent). */
function each(s: SandboxScene, own: SquadId[], pick: (p: [number, number]) => ((q: SquadId) => Order) | undefined): boolean {
  let sent = false;
  for (const q of own) {
    const c = centre(s, q), f = c && pick(c);
    if (f) (s.sim.order(f(q)), (sent = true));
  }
  return sent;
}
export const civWork = (s: SandboxScene, own: SquadId[]) =>
  each(s, own, (c) => { const b = nearest(stores(s), c); return b && ((squad) => ({ kind: 'civWork', squad, building: b.id })); });
export const civGather = (s: SandboxScene, own: SquadId[]) =>
  each(s, own, (c) => { const n = nearest(nodes(s), c); return n && ((squad) => ({ kind: 'gather', squad, node: n.id })); });
export const civBuild = (s: SandboxScene, own: SquadId[]) =>
  each(s, own, (c) => { const b = nearest(sites(s), c); return b && ((squad) => ({ kind: 'build', squad, site: b.id })); });

/** Tooltips (the target each would pick), or why there is none. */
export function civTips(s: SandboxScene): { work: string; gather: string; build: string } {
  const st = stores(s).length, nd = nodes(s).length, si = sites(s).length;
  return {
    work: st ? 'work at the nearest camp, storehouse or fort by trade: cook, smith, merchant, physician' : 'no camp, storehouse or fort of yours stands',
    gather: nd ? 'gather at the nearest resource (foragers bring twice as much)' : 'no resource left in reach',
    build: si ? 'build the nearest site of yours (engineers half again as fast)' : 'no site to build',
  };
}

/** The head's info line for a civilian squad. */
export function civInfo(s: SandboxScene, q: SquadId): string {
  const sq = s.sim.squads.get(q);
  if (!sq) return '';
  const what = sq.flee ? 'fleeing' : sq.order === 'civWork' ? 'at work' : sq.order === 'gather' ? 'gathering' : sq.order === 'build' ? 'building' : sq.order;
  return `civilians · ${what}`;
}
