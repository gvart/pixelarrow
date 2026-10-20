/**
 * Soldier rules of the war sim (docs/WAR.md "Soldiers", W-37): squad size, falling.
 */

/** N: fighters per player squad (docs/WAR.md "Army size N"; proposal 12, owner to confirm). Every other cap follows it. */
export const SQUAD_MAX = 12;
/** A squad splits into at most two detachments (`detach`), each at least this many men. */
export const DETACH_MIN = 4;

/** At 0 HP a man is wounded with this share (+ per END point above 5, + a physician near, capped), else dead. */
export const FALL = { wounded: 0.7, perEnd: 0.03, physician: 0.15, cap: 0.9 };

export function woundedShare(end: number, physician = false): number {
  return Math.min(FALL.cap, FALL.wounded + FALL.perEnd * Math.max(0, end - 5) + (physician ? FALL.physician : 0));
}
