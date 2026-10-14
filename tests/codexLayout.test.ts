/**
 * V6-RSCR-09: the Codex per size class (design/ux/landscape-v6.md §13.2). Compact portrait keeps the v5 rows;
 * phone landscape is rows beside a detail pane; a tablet gets a 3-column card grid with the detail as a sheet;
 * a laptop gets a card grid beside a 240-wide detail pane.
 */
import { describe, expect, it, vi } from 'vitest';
import { cardCols, codexLayout, DETAIL_W } from '../src/ui/codexLayout';

// the beast sheet draws with Phaser; the rule tested here is pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C }, Scene: C, Loader: { Events: {} } } };
});
const { beastStageH } = await import('../src/ui/beastInfo');

const box = (w: number, h = 300) => ({ x: 10, y: 20, w, h });

describe('codexLayout (§13.2)', () => {
  it('compact portrait: the v5 rows, the detail a sheet', () => {
    const l = codexLayout({ cls: 'compact', land: false }, box(185));
    expect(l.list).toBe('rows');
    expect(l.detail).toBeNull();
  });

  it('phone landscape (844x390, 316 wide beside the rail): rows left, the detail pane right', () => {
    const l = codexLayout({ cls: 'compact', land: true }, box(316));
    expect(l.list).toBe('rows');
    expect(l.detail).not.toBeNull();
    expect(l.master.w).toBeGreaterThanOrEqual(140);
    expect(l.detail!.w).toBeGreaterThanOrEqual(160);
    expect(l.detail!.x).toBe(l.master.x + l.master.w + 8);
    expect(l.detail!.x + l.detail!.w).toBe(10 + 316);
  });

  it('phone landscape in Telegram (no room for two panes): rows across, the detail a side panel', () => {
    const l = codexLayout({ cls: 'compact', land: true }, box(265));
    expect(l.list).toBe('rows');
    expect(l.detail).toBeNull();
    expect(l.master.w).toBe(265);
  });

  it('tablet portrait: a 3-column card grid, the detail a sheet', () => {
    for (const w of [372, 398]) {
      const l = codexLayout({ cls: 'medium', land: false }, box(w));
      expect(l.list).toBe('grid');
      expect(l.cols).toBe(3);
      expect(l.detail).toBeNull();
    }
  });

  it('laptop: a card grid (min 120, up to 4 columns) left, a 240 detail pane right', () => {
    const at1280 = codexLayout({ cls: 'expanded', land: true }, box(560));
    expect(at1280.list).toBe('grid');
    expect(at1280.cols).toBe(2);
    expect(at1280.detail!.w).toBe(DETAIL_W);
    expect(DETAIL_W).toBe(240);
    const at1440 = codexLayout({ cls: 'expanded', land: true }, box(640));
    expect(at1440.cols).toBe(3);
    expect(at1440.master.w + 8 + at1440.detail!.w).toBe(640);
  });

  it('laptop too narrow for two cards (1024x768): rows beside the detail, never a one-card grid', () => {
    const l = codexLayout({ cls: 'expanded', land: true }, box(432));
    expect(l.list).toBe('rows');
    expect(l.detail!.w).toBe(DETAIL_W);
  });
});

describe('cardCols', () => {
  it('a list shorter than two full rows takes two columns, so no column stands empty down the screen', () => {
    const tablet = codexLayout({ cls: 'medium', land: false }, box(372));
    expect(cardCols(tablet, 5)).toBe(2);
    expect(cardCols(tablet, 8)).toBe(3);
    const wide = codexLayout({ cls: 'expanded', land: true }, box(640));
    expect(cardCols(wide, 5)).toBe(2);
    expect(cardCols(wide, 8)).toBe(3);
  });
});

describe('the beast sheet stage (the 844x390 Telegram crash)', () => {
  it('never leaves the figure a negative width beside the plate', () => {
    // the sheet in a 103-UI-px column: 75 wide, a 1000-tall probe asked for a 74 stage
    const h = beastStageH(1000, 75, true);
    expect(75 - (h + 4)).toBeGreaterThan(0);
  });

  it('keeps v5 sizes where there is room', () => {
    expect(beastStageH(1000, 179, true)).toBe(74);
    expect(beastStageH(100, 179, true)).toBe(44);
    expect(beastStageH(150, 179, false)).toBe(60);
  });
});
