/**
 * Soldier rules of the war sim (docs/WAR.md "Soldiers", W-37): squad size.
 */

/** N: fighters per player squad (docs/WAR.md "Army size N"; proposal 12, owner to confirm). Every other cap follows it. */
export const SQUAD_MAX = 12;
/** A squad splits into at most two detachments (`detach`), each at least this many men. */
export const DETACH_MIN = 4;
