/**
 * What the hex panel offers for a hex (march, attack, garrison, collect), and
 * why a button is disabled. Mirrors the server's checks (the server decides;
 * this only explains up front). Pure, unit-tested.
 */
import { ONLINE_RULES } from './rules';
import type { MarchPlan } from './marchPlan';

export type ActId = 'march' | 'attack' | 'garrison' | 'collect';

/** Why an action cannot be taken now (i18n key suffix: hex.why.<reason>). */
export type ActReason = 'notNext' | 'marching' | 'energy' | 'rival' | 'impassable' | 'noPath' | 'tooFar' | 'here' | 'home' | 'notHere' | 'locked' | 'noIncome' | 'unknown';

export interface Act {
  id: ActId;
  enabled: boolean;
  reason?: ActReason;
  /** Parameters of the reason text (energy have / need, ...). */
  params?: Record<string, number>;
  primary?: boolean;
}

export interface ActInput {
  /** The hex as the panel knows it. */
  owner: number | null;
  ours: boolean;
  mine: boolean;
  home: boolean;
  passable: boolean;
  locked: boolean;
  canAttack: boolean;
  canGarrison: boolean;
  /** Income waiting on this hex (sum of resources), when it is yours. */
  waiting: number;
  /** Your army stands on this hex (not marching). */
  here: boolean;
  /** Your army is next to it (distance 1). */
  adjacent: boolean;
  marching: boolean;
  energy: number;
  plan: MarchPlan;
}

export function hexActions(i: ActInput): Act[] {
  const out: Act[] = [];
  const marchAct = (): Act => {
    if (!i.passable) return { id: 'march', enabled: false, reason: 'impassable' };
    if (i.owner !== null && !i.ours) return { id: 'march', enabled: false, reason: 'rival' };
    const p = i.plan;
    if (!p.ok) {
      const reason: ActReason = p.reason === 'no_path' ? 'noPath' : p.reason === 'too_far' ? 'tooFar' : p.reason === 'unknown' ? 'unknown' : p.reason === 'here' ? 'here' : p.reason;
      return { id: 'march', enabled: false, reason, params: reason === 'tooFar' ? { n: ONLINE_RULES.maxMarch } : undefined };
    }
    if (i.energy < p.energy) return { id: 'march', enabled: false, reason: 'energy', params: { n: Math.floor(i.energy), need: p.energy } };
    return { id: 'march', enabled: true };
  };
  const attackAct = (): Act => {
    if (i.home) return { id: 'attack', enabled: false, reason: 'home' };
    if (i.locked) return { id: 'attack', enabled: false, reason: 'locked' };
    if (i.marching) return { id: 'attack', enabled: false, reason: 'marching' };
    if (!i.adjacent || !i.canAttack) return { id: 'attack', enabled: false, reason: 'notNext' };
    if (i.energy < ONLINE_RULES.energyPerAttack) return { id: 'attack', enabled: false, reason: 'energy', params: { n: Math.floor(i.energy), need: ONLINE_RULES.energyPerAttack } };
    return { id: 'attack', enabled: true };
  };
  if (i.ours) {
    if (!i.here) out.push(marchAct());
    if (i.mine) out.push(i.waiting >= 1 ? { id: 'collect', enabled: true } : { id: 'collect', enabled: false, reason: 'noIncome' });
    out.push(i.canGarrison ? { id: 'garrison', enabled: true } : { id: 'garrison', enabled: false, reason: i.marching ? 'marching' : 'notHere' });
  } else if (!i.passable) {
    out.push(marchAct());
  } else {
    if (!i.here) out.push(marchAct());
    out.push(attackAct());
  }
  // One primary action: attack when possible, else the first enabled one (march, collect, garrison).
  const primary = out.find((a) => a.id === 'attack' && a.enabled) ?? out.find((a) => a.enabled);
  if (primary) primary.primary = true;
  // The primary action goes last: at the right, under the thumb.
  return [...out.filter((a) => !a.primary), ...out.filter((a) => a.primary)];
}
