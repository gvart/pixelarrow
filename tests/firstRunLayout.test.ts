import { describe, expect, it } from 'vitest';
import { offerLayout, columnBox, modesRow } from '../src/ui/tutorial/firstRunLayout';

// the frame's inner box at each matrix size (UI px), roughly as ScreenFrame gives it
const inner = (w: number, h: number) => ({ x: 10, y: 40, w, h });

describe('first-run layout by size class (landscape-v6.md §13.1)', () => {
  it('compact portrait keeps the v5 200-px column', () => {
    expect(columnBox('compactPortrait', inner(175, 380))).toEqual({ x: 10, y: 40, w: 175, h: 380 });
    expect(columnBox('compactPortrait', inner(240, 380))).toEqual({ x: 30, y: 40, w: 200, h: 380 });
    expect(offerLayout('compactPortrait', inner(240, 380)).kind).toBe('column');
  });

  it('medium is a centred column, at most 360 wide', () => {
    const c = columnBox('medium', inner(370, 460));
    expect(c.w).toBe(360);
    expect(c.x).toBe(15);
    expect(offerLayout('medium', inner(370, 460)).kind).toBe('column');
  });

  it('compact landscape is a stage: the fresco takes the left half, the words and CTA the right', () => {
    const l = offerLayout('compactLandscape', inner(400, 140));
    if (l.kind !== 'stage') throw new Error('stage expected');
    expect(l.art.x).toBe(10);
    expect(Math.abs(l.art.w - l.side.w)).toBeLessThanOrEqual(1);
    expect(l.side.x).toBeGreaterThanOrEqual(l.art.x + l.art.w + 6);
    expect(l.side.x + l.side.w).toBeLessThanOrEqual(410);
    expect(l.side.h).toBe(140);
  });

  it('expanded is a stage with the fresco at most 360 wide, the pair centred and filling the content width', () => {
    for (const w of [490, 620, 700]) {
      const l = offerLayout('expanded', inner(w, 330));
      if (l.kind !== 'stage') throw new Error('stage expected');
      expect(l.art.w).toBeLessThanOrEqual(360);
      expect(l.side.w).toBeLessThanOrEqual(300);
      const span = l.side.x + l.side.w - l.art.x;
      expect(span).toBeGreaterThanOrEqual(Math.min(w, 600) * 0.9);
      // centred in the inner box
      expect(Math.abs(l.art.x - 10 - (10 + w - l.side.x - l.side.w))).toBeLessThanOrEqual(1);
    }
  });

  it('the modes sit side by side outside compact portrait, at most 180 each on laptops', () => {
    expect(modesRow('compactPortrait', inner(200, 380))).toBeNull();
    const r = modesRow('expanded', inner(620, 330))!;
    expect(r.w).toBeLessThanOrEqual(180);
    expect(r.x + 3 * r.w + 2 * r.gap).toBeLessThanOrEqual(630);
    const c = modesRow('compactLandscape', inner(400, 140))!;
    expect(3 * c.w + 2 * c.gap).toBeLessThanOrEqual(400);
    expect(c.w).toBeGreaterThan(120);
  });
});
