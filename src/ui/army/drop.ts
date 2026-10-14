/**
 * What a stash drag shows over the hero's slots (design/ux/landscape-v6.md §4, "Drop target (hero slot)
 * during a drag"), as a plain function (no Phaser; tests/armyDrop.test.ts): the slots that take the item
 * get an outline, at full strength under the cursor and at half strength elsewhere; a slot that refuses
 * it gets none. The cursor is `grabbing`, or `not-allowed` over a refusing slot. "Over" uses the same
 * 4 UI px margin as the release (DragDrop.end).
 */
import type { CursorKind } from '../input/cursor';

export interface DropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outline's strength on a valid slot away from the cursor. */
export const DROP_FAR_ALPHA = 0.5;
/** The release margin around a slot, UI px. */
export const DROP_MARGIN = 4;

const over = (r: DropRect, x: number, y: number): boolean => x >= r.x - DROP_MARGIN && x <= r.x + r.w + DROP_MARGIN && y >= r.y - DROP_MARGIN && y <= r.y + r.h + DROP_MARGIN;

export function dropView(targets: readonly { rect: DropRect; ok: boolean }[], x: number, y: number): { marks: { rect: DropRect; alpha: number }[]; cursor: CursorKind } {
  let cursor: CursorKind = 'grabbing';
  const marks: { rect: DropRect; alpha: number }[] = [];
  for (const t of targets) {
    const hit = over(t.rect, x, y);
    if (hit && !t.ok) cursor = 'not-allowed';
    if (t.ok) marks.push({ rect: t.rect, alpha: hit ? 1 : DROP_FAR_ALPHA });
  }
  return { marks, cursor };
}
