/**
 * W-216 why a cart of his stopped, in words: a toast when it first stops, the squad card's line while it lasts (./hud.ts).
 * A silent cart read as a broken game.
 */
import type { SiegeSnap, Snapshot } from '../../types';

/** A stop's words: the card's few, the toast's whole sentence. */
export const CART_STOP: Record<NonNullable<SiegeSnap['stopped']>, { line: string; toast: string }> = {
  ground: { line: 'stopped: no way for a cart', toast: 'Your cart stopped as near as it can get. Carts keep to open ground and roads: no forest or marsh off the road, no cliffs. Send it along the road.' },
  foe: { line: 'halted: foes near', toast: 'Your cart halts: foes near. It rolls on once they are gone.' },
  crew: { line: 'waiting for its crew', toast: 'Your cart waits for its crew: its men have to stand beside it.' },
};

/** The words due now for carts of `owner`; `memo` holds what each said last, so a stop is told once until it rolls again. */
export function cartNotes(cur: Pick<Snapshot, 'sieges'>, owner: string, memo: Map<number, string>): string[] {
  const out: string[] = [];
  for (const c of cur.sieges ?? []) {
    if (c.owner !== owner) continue;
    const was = memo.get(c.id) ?? '', now = c.stopped ?? '';
    if (now && now !== was) out.push(CART_STOP[c.stopped!].toast);
    if (now) memo.set(c.id, now);
    else if (c.state === 'move') memo.set(c.id, ''); // only a cart that rolled clears the word: a re-sent order must not repeat it
  }
  return out;
}
