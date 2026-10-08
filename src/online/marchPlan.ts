/**
 * Client-side march estimate for the region panel (ETA and energy before the
 * player commits). Mirrors the server's rule (server/src/online/routes.ts
 * POST /march): the quickest route by edge minutes through passable regions
 * not held by a rival, at most ONLINE_RULES.maxMarch routes, energyPerStep
 * per route. The client knows the whole map but only the owners in sight, so
 * it is an estimate; the server's answer is authoritative. Pure, unit-tested.
 */
import { ONLINE_RULES } from './rules';
import type { WorldGraph } from './world';

export type MarchPlan =
  | { ok: true; path: number[]; minutes: number; energy: number }
  | { ok: false; reason: 'here' | 'impassable' | 'rival' | 'no_path' | 'too_far' | 'unknown' };

/** `rival(loc)`: a region in sight held by a rival (not you, not your clan): marches cannot cross it. */
export function planMarch(world: WorldGraph, rival: (loc: number) => boolean, from: number, to: number, maxSteps = ONLINE_RULES.maxMarch): MarchPlan {
  if (from === to) return { ok: false, reason: 'here' };
  if (!world.has(to) || !world.has(from)) return { ok: false, reason: 'unknown' };
  if (!world.info(to).passable) return { ok: false, reason: 'impassable' };
  if (rival(to)) return { ok: false, reason: 'rival' };
  const p = world.path(from, to, (r) => !rival(r.id));
  if (!p) return { ok: false, reason: 'no_path' };
  const steps = p.path.length - 1;
  if (steps > maxSteps) return { ok: false, reason: 'too_far' };
  return { ok: true, path: p.path, minutes: p.minutes, energy: steps * ONLINE_RULES.energyPerStep };
}
