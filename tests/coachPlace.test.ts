import { describe, expect, it } from 'vitest';
import { bubblePlace, bubbleMaxW } from '../src/ui/tutorial/coachPlace';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('coach bubbles in every size class (landscape-v6.md §13.1)', () => {
  it('max width: 176 on phones and tablets, 240 on laptops', () => {
    expect(bubbleMaxW({ cls: 'compact', land: false })).toBe(176);
    expect(bubbleMaxW({ cls: 'compact', land: true })).toBe(176);
    expect(bubbleMaxW({ cls: 'medium', land: false })).toBe(176);
    expect(bubbleMaxW({ cls: 'expanded', land: true })).toBe(240);
  });

  it('phone portrait: above a low target, below a high one (v5)', () => {
    const low = bubblePlace({ x: 100, y: 300, w: 40, h: 20 }, 176, 50, 195, 400, null);
    expect(low.side).toBe('above');
    expect(low.y + 50).toBeLessThanOrEqual(300);
    const high = bubblePlace({ x: 100, y: 40, w: 40, h: 20 }, 176, 50, 195, 400, null);
    expect(high.side).toBe('below');
    expect(high.y).toBeGreaterThanOrEqual(60);
  });

  it('never over its anchor: a tall panel in a short landscape canvas puts the card beside it', () => {
    // the hex panel down the right of 844x390 (422 x 195 UI)
    const at = { x: 270, y: 30, w: 140, h: 150 };
    const p = bubblePlace(at, 176, 60, 422, 195, null);
    expect(overlaps({ x: p.x, y: p.y, w: p.w, h: 60 }, at)).toBe(false);
    expect(p.side).toBe('left');
  });

  it('keeps clear of a nav rail on the left', () => {
    const at = { x: 90, y: 150, w: 30, h: 30 };
    const p = bubblePlace(at, 176, 50, 422, 195, null, 84);
    expect(p.x).toBeGreaterThanOrEqual(84 + 8);
  });

  it('a target on a key rail at the right: beside the rail, the arrow pointing right (WAR-6)', () => {
    const rail = { x: 390, y: 40, w: 30, h: 140 };
    const p = bubblePlace({ x: 392, y: 80, w: 26, h: 26 }, 176, 50, 422, 195, rail);
    expect(p.side).toBe('left');
    expect(p.x + p.w).toBeLessThanOrEqual(rail.x - 6);
  });
});
