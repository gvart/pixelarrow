/**
 * Client-side march estimate for the hex panel (ETA and energy before the
 * player commits). Mirrors the server's rule (server/src/online/routes.ts
 * POST /march): the cheapest path by march minutes over passable hexes not
 * held by a rival, at most ONLINE_RULES.maxMarch hexes, 1 energy per hex.
 * Only the hexes the client can see are known, so it is an estimate; the
 * server's answer is authoritative. Pure, unit-tested.
 */
import { HEX_DIRS, MARCH_MINUTES, hexId, type Axial, type HexType } from './hex';
import { ONLINE_RULES } from './rules';

export interface PlanHex extends Axial {
  type: HexType;
  /** Held by a rival (not you, not your clan): marches cannot cross it. */
  rival: boolean;
}

export type MarchPlan =
  | { ok: true; path: Axial[]; minutes: number; energy: number }
  | { ok: false; reason: 'here' | 'impassable' | 'rival' | 'no_path' | 'too_far' | 'unknown' };

export function planMarch(hexes: ReadonlyMap<string, PlanHex>, from: Axial, to: Axial, maxSteps = ONLINE_RULES.maxMarch): MarchPlan {
  if (from.q === to.q && from.r === to.r) return { ok: false, reason: 'here' };
  const target = hexes.get(hexId(to.q, to.r));
  if (!target) return { ok: false, reason: 'unknown' };
  if (!Number.isFinite(MARCH_MINUTES[target.type])) return { ok: false, reason: 'impassable' };
  if (target.rival) return { ok: false, reason: 'rival' };
  // Dijkstra over the known hexes (a few hundred at most).
  const dist = new Map<string, number>([[hexId(from.q, from.r), 0]]);
  const prev = new Map<string, Axial>();
  const open: { h: Axial; d: number }[] = [{ h: from, d: 0 }];
  const done = new Set<string>();
  const goal = hexId(to.q, to.r);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
    const { h, d } = open.splice(bi, 1)[0];
    const k = hexId(h.q, h.r);
    if (done.has(k)) continue;
    done.add(k);
    if (k === goal) break;
    for (const dir of HEX_DIRS) {
      const n = { q: h.q + dir.q, r: h.r + dir.r };
      const nk = hexId(n.q, n.r);
      const info = hexes.get(nk);
      if (!info || info.rival) continue;
      const cost = MARCH_MINUTES[info.type];
      if (!Number.isFinite(cost)) continue;
      const nd = d + cost;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, h);
        open.push({ h: n, d: nd });
      }
    }
  }
  if (!dist.has(goal)) return { ok: false, reason: 'no_path' };
  const path: Axial[] = [to];
  let k = goal;
  while (prev.has(k)) {
    const p = prev.get(k)!;
    path.push(p);
    k = hexId(p.q, p.r);
  }
  path.reverse();
  const steps = path.length - 1;
  if (steps > maxSteps) return { ok: false, reason: 'too_far' };
  return { ok: true, path, minutes: dist.get(goal)!, energy: steps * ONLINE_RULES.energyPerHex };
}
