/**
 * Anti-abuse (M6i; docs/WAR.md "Season score and anti-abuse"). M6g: the seam the hand-off goes through.
 */
import type { Bundle } from './cargo';
import type { HandoffWindow } from './room';

/** Why a ready hand-off window may not swap (null: it may). */
export async function handoffRefusal(_db: D1Database, _w: HandoffWindow, _now: number): Promise<string | null> {
  return null;
}

/** Throws when two players may not deal with each other (contracts, deals, letters). */
export async function contractRefusal(_db: D1Database, _a: number, _b: number, _now: number): Promise<void> {}

/** A hand-off swapped: its record. */
export async function handoffDone(_db: D1Database, _w: HandoffWindow, _gave: Record<number, Bundle>, _now: number): Promise<void> {}
