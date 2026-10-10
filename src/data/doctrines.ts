/**
 * Bot doctrines (design/gdd/ai-doctrines.md R1, R2, F1, F2): every timer and
 * threshold the battle bot uses, as data. Shared by the client and the
 * server replay, so any change here is a sim change (ADR-0001).
 */
import type { FormationType } from '../sim/formation';
import { DEFAULT_DOCTRINE, DOCTRINE_IDS, type DoctrineId } from '../sim/types';

export interface Doctrine {
  id: DoctrineId;
  /** Main line holds this long before it advances. */
  lineWaitS: number;
  /** The flank group starts its swing. */
  flankAtS: number;
  /** Earliest start of the idle-breaker press (bounded by F1 for small armies). */
  pressAfterS: number;
  /** Seconds with no combat before the bot presses. */
  pressIdleS: number;
  /** The reserve commits by this time if nothing else triggered it. */
  reserveAtS: number;
  /** The reserve commits when the engaged main line's mean morale share falls below this (0..1). */
  reserveWaver: number;
  /** A line on high ground holds it this long. */
  holdHillS: number;
  /** A line waits this long at a contested ford. */
  fordWaitS: number;
  /** Attacking a held hill: the main line refuses the climb and the flank swings round first. */
  hillFlank: boolean;
  /** Paces of melee threat at which skirmishers retire (riders: +SKIRMISH_RIDER_EXTRA). */
  skirmishRetire: number;
  /** The main line locks shields when shot at. */
  shieldwallWhenShot: boolean;
  /** Main-line shape at deploy; `line` keeps today's choice (a shield wall now and then). */
  preferShape: FormationType;
  /** Light groups may feint (formations-orders.md R3; used once FO-02 lands). */
  feint: boolean;
  /** Missile groups focus enemy missile groups (formations-orders.md R4; used once FO-01 lands). */
  focusMissiles: boolean;
  /** Fraction of own men lost (dead, routed, fled) at which a losing bot retreats; 0 = never. */
  retreatAt: number;
  /** ± fraction applied to every timer, drawn once per battle from the bot's seed (F2). */
  jitter: number;
}

/** F1: small armies press sooner. pressAfter = min(D.pressAfterS, PRESS_BASE_S + PRESS_PER_MAN_S × men). */
export const PRESS_BASE_S = 4;
export const PRESS_PER_MAN_S = 1.5;
/** Skirmishers see riders coming from further away than men on foot. */
export const SKIRMISH_RIDER_EXTRA = 4;
/** A retreating bot must also be losing: its share of the men still fighting is below this. */
export const RETREAT_SHARE = 0.45;

/**
 * The five doctrines (ai-doctrines.md R2). `steady` is today's AI exactly.
 * reserveWaver: the GDD's table gives steady 0.5, but today's ai.ts commits
 * the reserve below 0.65 mean morale; steady keeps 0.65 and every doctrine
 * is shifted by the same +0.15 so the gaps between them stay as designed.
 * swarm lineWaitS is 10, not the GDD's 3: its line lets the skirmishers work
 * first; at 3 the reference won only 29% against it (target 40-60%, AI-01).
 */
export const DOCTRINES: Record<DoctrineId, Doctrine> = {
  steady: {
    id: 'steady', lineWaitS: 5, flankAtS: 14, pressAfterS: 25, pressIdleS: 8, reserveAtS: 70, reserveWaver: 0.65,
    holdHillS: 50, fordWaitS: 55, hillFlank: false, skirmishRetire: 5, shieldwallWhenShot: true, preferShape: 'line',
    feint: false, focusMissiles: false, retreatAt: 0, jitter: 0,
  },
  rush: {
    id: 'rush', lineWaitS: 0, flankAtS: 6, pressAfterS: 8, pressIdleS: 4, reserveAtS: 30, reserveWaver: 0.5,
    holdHillS: 10, fordWaitS: 15, hillFlank: true, skirmishRetire: 3, shieldwallWhenShot: false, preferShape: 'wedge',
    feint: false, focusMissiles: false, retreatAt: 0, jitter: 0.15,
  },
  hammer: {
    id: 'hammer', lineWaitS: 8, flankAtS: 18, pressAfterS: 30, pressIdleS: 8, reserveAtS: 45, reserveWaver: 0.75,
    holdHillS: 60, fordWaitS: 60, hillFlank: true, skirmishRetire: 6, shieldwallWhenShot: true, preferShape: 'line',
    feint: true, focusMissiles: true, retreatAt: 0.6, jitter: 0.15,
  },
  swarm: {
    id: 'swarm', lineWaitS: 10, flankAtS: 10, pressAfterS: 20, pressIdleS: 10, reserveAtS: 60, reserveWaver: 0.65,
    holdHillS: 30, fordWaitS: 40, hillFlank: true, skirmishRetire: 7, shieldwallWhenShot: false, preferShape: 'skirmish',
    feint: true, focusMissiles: true, retreatAt: 0.45, jitter: 0.2,
  },
  fury: {
    id: 'fury', lineWaitS: 0, flankAtS: 8, pressAfterS: 6, pressIdleS: 3, reserveAtS: 25, reserveWaver: 0.45,
    holdHillS: 0, fordWaitS: 0, hillFlank: false, skirmishRetire: 2, shieldwallWhenShot: false, preferShape: 'wedge',
    feint: false, focusMissiles: false, retreatAt: 0, jitter: 0.1,
  },
};

/** The record for an id; anything unknown or missing plays steady. */
export function doctrineOf(id?: string | null): Doctrine {
  return (DOCTRINE_IDS as readonly string[]).includes(id ?? '') ? DOCTRINES[id as DoctrineId] : DOCTRINES[DEFAULT_DOCTRINE];
}

/** The timers jitter applies to, in the fixed order they are drawn (F2). */
export const DOCTRINE_TIMERS = ['lineWaitS', 'flankAtS', 'pressAfterS', 'pressIdleS', 'reserveAtS', 'holdHillS', 'fordWaitS'] as const;
export type DoctrineTimer = (typeof DOCTRINE_TIMERS)[number];
export type DoctrineTimers = Record<DoctrineTimer, number>;

/**
 * One battle's timers: each drawn once, in DOCTRINE_TIMERS order, as
 * base × (1 + J × (2r − 1)) (F2); then the press time is capped for small
 * armies (F1). `next` is the bot's own seeded RNG; it is not called when J = 0.
 */
export function battleTimers(d: Doctrine, men: number, next: () => number): DoctrineTimers {
  const t = {} as DoctrineTimers;
  for (const k of DOCTRINE_TIMERS) t[k] = d.jitter > 0 ? d[k] * (1 + d.jitter * (2 * next() - 1)) : d[k];
  t.pressAfterS = Math.min(t.pressAfterS, PRESS_BASE_S + PRESS_PER_MAN_S * men);
  return t;
}
