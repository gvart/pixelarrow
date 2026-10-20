/**
 * Soldier rules of the war sim (docs/WAR.md "Soldiers", W-37): squad size, falling, gear drops, capture, XP.
 */
import { POINTS_PER_LEVEL } from '../../data/perks';
import { MAX_LEVEL, xpToNext, type Hero } from '../../data/units';

/** N: fighters per player squad (docs/WAR.md "Army size N"; proposal 12, owner to confirm). Every other cap follows it. */
export const SQUAD_MAX = 12;
/** A squad splits into at most two detachments (`detach`), each at least this many men. */
export const DETACH_MIN = 4;

/** At 0 HP a man is wounded with this share (+ per END point above 5, + a physician near, capped), else dead. */
export const FALL = { wounded: 0.7, perEnd: 0.03, physician: 0.15, cap: 0.9 };

export function woundedShare(end: number, physician = false): number {
  return Math.min(FALL.cap, FALL.wounded + FALL.perEnd * Math.max(0, end - 5) + (physician ? FALL.physician : 0));
}

/** XP per fight (docs/WAR.md "Record"): per point of damage dealt (1 per 10), per kill, for surviving a fight with >= SQUAD_MAX enemy soldiers in it, per objective. */
export const XP = { perDmg: 0.1, kill: 10, survived: 15, objective: 5 };

/** The dead's gear lies `ticks` (10 min at 10 Hz); a man of another team within `pick` tiles, not fighting, picks it up; rare and above come at `rareCond`. */
export const DROP = { ticks: 6000, pick: 1.5, rareCond: 50 };
/** A wounded man with no friendly this near when the fight ends, and a foe this near, is taken captive. */
export const CAPTURE_R = 15;

/** A copy of the hero with xp added, levelled up (+POINTS_PER_LEVEL each) as far as it goes, up to MAX_LEVEL. */
export function gainXp(hero: Hero, xp: number): { hero: Hero; levelUps: number } {
  const h: Hero = { ...hero, xp: hero.xp + xp };
  let levelUps = 0;
  while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
    h.points += POINTS_PER_LEVEL;
    levelUps++;
  }
  return { hero: h, levelUps };
}
