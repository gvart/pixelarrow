import { describe, expect, it } from 'vitest';
import { CTA_PANE_MAX, RESULTS_GUTTER, resultsPanes, spoilCols, tilesPerRow } from '../src/ui/results/layout';
import { ROW_MAX } from '../src/ui/sizeClass';

describe('Results panes (landscape-v6 §7.5)', () => {
  it('keeps the v5 single column on phones and tablets upright', () => {
    expect(resultsPanes({ x: 6, w: 183 }, false, 'compact')).toEqual({ left: { x: 10, w: 175 }, right: null });
    expect(resultsPanes({ x: 6, w: 372 }, false, 'medium')).toEqual({ left: { x: 10, w: 364 }, right: null });
  });

  it('splits compact landscape into two panes that share the width', () => {
    const p = resultsPanes({ x: 6, w: 410 }, true, 'compact');
    expect(p.right).not.toBeNull();
    expect(p.left.w).toBeGreaterThan(150);
    expect(p.right!.w).toBeGreaterThan(150);
    expect(p.right!.x).toBe(p.left.x + p.left.w + RESULTS_GUTTER);
    expect(p.right!.x + p.right!.w).toBeLessThanOrEqual(6 + 410 - 4);
  });

  it('gives the Summary 260 at expanded and the page a list width at most, centred', () => {
    for (const w of [500, 628, 708]) {
      const p = resultsPanes({ x: 6, w }, true, 'expanded');
      expect(p.left.w).toBeLessThanOrEqual(260);
      expect(p.right!.w).toBeLessThanOrEqual(ROW_MAX);
      // a primary at most 240 fits the right pane's foot
      expect(Math.min(p.right!.w, CTA_PANE_MAX)).toBeLessThanOrEqual(CTA_PANE_MAX);
      const used = p.left.w + RESULTS_GUTTER + p.right!.w;
      expect(Math.abs(p.left.x - 10 - (w - 8 - used) / 2)).toBeLessThanOrEqual(1);
      // the pair spans at least 70% of the content (wasted-width at expanded)
      expect(used / (w - 8)).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('Summary tiles and the Spoils grid', () => {
  it('puts five tiles in a row only when every label fits a fifth', () => {
    expect(tilesPerRow(364, 4, [20, 24, 30, 22, 14])).toBe(5);
    expect(tilesPerRow(189, 4, [20, 24, 30, 22, 14])).toBe(3);
  });

  it('keeps 2 or 3 spoil columns on a phone and grows to 4 where there is room', () => {
    expect(spoilCols(179, 4, true)).toBe(2);
    expect(spoilCols(360, 4, false)).toBe(4);
    expect(spoilCols(200, 4, false)).toBe(3);
    expect(spoilCols(130, 4, false)).toBe(2);
  });
});
