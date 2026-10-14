import { describe, expect, it } from 'vitest';
import { dropView, DROP_FAR_ALPHA } from '../src/ui/army/drop';

// landscape-v6 §4 "Drop target (hero slot) during a drag": valid targets outlined (full under the
// cursor, 50% elsewhere), invalid ones not outlined; the cursor is grabbing over a valid slot,
// not-allowed over an invalid one, grabbing anywhere else.
const helmet = { rect: { x: 10, y: 10, w: 20, h: 20 }, ok: true };
const shield = { rect: { x: 50, y: 10, w: 20, h: 20 }, ok: false };
const weapon = { rect: { x: 90, y: 10, w: 20, h: 20 }, ok: true };

describe('dropView: what a drag over the hero slots shows', () => {
  it('outlines only the slots that take the item, at half strength away from the cursor', () => {
    const v = dropView([helmet, shield, weapon], 200, 200);
    expect(v.marks.map((m) => m.rect.x)).toEqual([10, 90]);
    expect(v.marks.every((m) => m.alpha === DROP_FAR_ALPHA)).toBe(true);
    expect(v.cursor).toBe('grabbing');
  });

  it('draws the valid slot under the cursor at full strength, with the grabbing cursor', () => {
    const v = dropView([helmet, shield, weapon], 20, 20);
    expect(v.marks.find((m) => m.rect.x === 10)?.alpha).toBe(1);
    expect(v.marks.find((m) => m.rect.x === 90)?.alpha).toBe(DROP_FAR_ALPHA);
    expect(v.cursor).toBe('grabbing');
  });

  it('shows not-allowed over a slot that refuses the item, and no outline on it', () => {
    const v = dropView([helmet, shield, weapon], 60, 20);
    expect(v.cursor).toBe('not-allowed');
    expect(v.marks.some((m) => m.rect.x === 50)).toBe(false);
  });

  it('counts the 4 px drop margin the release uses as "over" the slot', () => {
    expect(dropView([helmet], 7, 20).marks[0].alpha).toBe(1);
    expect(dropView([shield], 73, 20).cursor).toBe('not-allowed');
  });
});
