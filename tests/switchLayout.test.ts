/**
 * The segmented switch never cuts a tab's name (V5-063): equal segments while every label fits one,
 * else each segment as wide as its label with the leftover shared, and Inter only when no Cinzel
 * style fits even that way (src/ui/mosaic/policy.ts switchLayout).
 */
import { describe, expect, it } from 'vitest';
import { switchLayout } from '../src/ui/mosaic/policy';
import { TEXT_MIN } from '../src/ui/tokens';

/** 4 UI px a character in Cinzel, 3.5 in Inter, scaled by size (a stand-in for the font metrics). */
const measure = (s: string, face: 'roman' | 'body', z: number) => s.length * (face === 'roman' ? 4 : 3.5) * (z / 7);
const items = (...ls: string[]) => ls.map((label) => ({ label, icon: true }));
const sum = (ws: number[]) => ws.reduce((a, b) => a + b, 0);

describe('switchLayout', () => {
  it('keeps equal segments when every label fits one', () => {
    const r = switchLayout(items('Hire', 'Rest'), 200, measure, 14);
    expect(r.widths).toEqual([100, 100]);
    expect(r).toMatchObject({ face: 'roman', size: 7, icons: true });
  });

  it('sizes the segments to their labels and shares the rest when one label is too long for an equal share', () => {
    const its = items('Hire', 'Buy', 'Sell', 'Services');
    const r = switchLayout(its, 140, measure, 14);
    expect(sum(r.widths)).toBe(140);
    // every label fits its own segment in the chosen style, uncut
    its.forEach((it, i) => {
      const need = measure(r.face === 'roman' ? it.label.toUpperCase() : it.label, r.face, r.size) + (r.icons ? 14 : 0) + 6;
      expect(r.widths[i]).toBeGreaterThanOrEqual(Math.floor(need));
    });
    expect(r.widths[3]).toBeGreaterThan(r.widths[1]);
  });

  it('drops to Inter at 6.5 only when no Cinzel style fits even label-sized', () => {
    const r = switchLayout(items('Наём', 'Купить', 'Продать', 'Услуги'), 100, measure, 14);
    expect(r.face).toBe('body');
    expect(r.size).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(sum(r.widths)).toBe(100);
  });

  it('keeps a lock icon even when the others go', () => {
    const r = switchLayout([{ label: 'Roster', icon: true }, { label: 'Stash', icon: true, lock: true }], 70, measure, 14);
    expect(sum(r.widths)).toBe(70);
    expect(r.widths[1]).toBeGreaterThanOrEqual(Math.floor(measure(r.face === 'roman' ? 'STASH' : 'Stash', r.face, r.size) + 14 + 6) - 1);
  });
});
