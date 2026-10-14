/**
 * The Kit layout primitives (V6-RFND-02, design/ux/landscape-v6.md §3): pure geometry, checked in
 * the four variants the Kit Layouts page shows (compact portrait, compact landscape, medium,
 * expanded) with the metrics the §1.1 matrix gives.
 */
import { describe, expect, it } from 'vitest';
import { metricsFor, type UIMetrics } from '../src/ui/sizeClass';
import { belowFloor, columns, edgeClusters, grid, gridColumns, layoutVariant, masterDetail, panelLayout, rotateCardText } from '../src/ui/mosaic/layout/geometry';

/** The metrics of an opted-in scene at a W x H CSS px safe area (RS 1). */
const at = (size: string): UIMetrics => {
  const [w, h] = size.split('x').map(Number);
  return metricsFor(w, h, 1, false);
};

/** One size per variant: the reference sizes of the Kit Layouts page. */
const VARIANTS = { compactPortrait: '390x844', compactLandscape: '844x390', medium: '768x1024', expanded: '1280x800' } as const;

const box = (w: number, h = 300) => ({ x: 10, y: 20, w, h });

describe('layoutVariant', () => {
  it('names the four variants of the matrix', () => {
    for (const [v, size] of Object.entries(VARIANTS)) expect(layoutVariant(at(size))).toBe(v);
    expect(layoutVariant(at('360x780'))).toBe('compactPortrait');
    expect(layoutVariant(at('820x1180'))).toBe('medium');
    expect(layoutVariant(at('1920x1080'))).toBe('expanded');
  });
});

describe('Columns (§3.2)', () => {
  const three = [{ min: 150, max: 300 }, { min: 150, max: 300 }, { min: 120, max: 200 }];

  it('shows one pane under 300, two from 300, three from 560 when declared', () => {
    const shown = (w: number, n = 3) => columns(box(w), three.slice(0, n)).panes.filter(Boolean).length;
    expect(shown(at(VARIANTS.compactPortrait).contentW)).toBe(1);
    expect(shown(at(VARIANTS.compactLandscape).contentW)).toBe(2);
    expect(shown(at(VARIANTS.medium).contentW)).toBe(2);
    expect(shown(at(VARIANTS.expanded).contentW)).toBe(3);
    expect(shown(at(VARIANTS.expanded).contentW, 2)).toBe(2);
    expect(shown(299)).toBe(1);
    expect(shown(300)).toBe(2);
    expect(shown(559)).toBe(2);
    expect(shown(560)).toBe(3);
  });

  it('fills the box with an 8 UI px gutter between panes', () => {
    const r = columns(box(338), three);
    const [a, b] = r.panes;
    expect(a).toEqual({ x: 10, y: 20, w: 165, h: 300 });
    expect(b!.x).toBe(a!.x + a!.w + 8);
    expect(b!.x + b!.w).toBe(10 + 338);
  });

  it('keeps the panes of highest priority and reports the folded ones', () => {
    const r = columns(box(400), [{ min: 100, priority: 0 }, { min: 100, priority: 2 }, { min: 100, priority: 1 }]);
    expect(r.shown).toEqual([1, 2]);
    expect(r.hidden).toEqual([0]);
    expect(r.panes[0]).toBeNull();
    // shown panes keep their declared order, left to right
    expect(r.panes[1]!.x).toBeLessThan(r.panes[2]!.x);
  });

  it('one pane is the v5 stack: the whole width', () => {
    expect(columns(box(195), three).panes[0]).toEqual(box(195));
  });

  it('caps panes at their max and centres the group in the box', () => {
    const r = columns(box(640), [{ min: 100, max: 200 }, { min: 100, max: 200 }]);
    const [a, b] = r.panes;
    expect(a!.w).toBe(200);
    expect(b!.w).toBe(200);
    const left = a!.x - 10;
    const right = 10 + 640 - (b!.x + b!.w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('gives the room above the minima to the panes still under their max', () => {
    const r = columns(box(568), [{ min: 150, max: 180 }, { min: 150 }, { min: 120, max: 200 }]);
    const [a, b, c] = r.panes;
    expect(a!.w).toBe(180);
    // b and c are still under their max: they share the rest, each growing by the same amount
    expect(Math.abs(b!.w - 150 - (c!.w - 120))).toBeLessThanOrEqual(1);
    expect(a!.w + b!.w + c!.w + 16).toBe(568);
  });

  it('never makes a pane narrower than its min while the minima fit; shares the width when they do not', () => {
    for (const w of [300, 338, 384, 410, 440, 568]) {
      const r = columns(box(w), three);
      r.shown.forEach((i) => expect(r.panes[i]!.w).toBeGreaterThanOrEqual(Math.min(three[i].min, Math.floor((w - 8) / 2))));
    }
  });
});

describe('MasterDetail (§3.3)', () => {
  it('compact portrait is the v5 stack: the list fills the box, the detail opens on its own', () => {
    const r = masterDetail(box(195), at(VARIANTS.compactPortrait));
    expect(r.split).toBe(false);
    expect(r.master).toEqual(box(195));
    expect(r.detail).toBeNull();
  });

  it('every other variant puts the list left (180–300) and the detail right (at least 160)', () => {
    for (const v of ['compactLandscape', 'medium', 'expanded'] as const) {
      const m = at(VARIANTS[v]);
      const r = masterDetail(box(m.contentW), m);
      expect(r.split).toBe(true);
      expect(r.detail!.w).toBeGreaterThanOrEqual(160);
      expect(r.master.w).toBeLessThanOrEqual(300);
      expect(r.detail!.x).toBe(r.master.x + r.master.w + 8);
      expect(r.detail!.x + r.detail!.w).toBe(10 + m.contentW);
      expect(r.master.y).toBe(20);
      expect(r.detail!.h).toBe(300);
    }
    expect(masterDetail(box(384), at(VARIANTS.medium)).master.w).toBe(180);
    expect(masterDetail(box(568), at(VARIANTS.expanded)).master.w).toBeGreaterThan(180);
    expect(masterDetail(box(900), at(VARIANTS.expanded)).master.w).toBe(300);
  });

  it('in compact landscape (338 wide, beside the rail) the list yields to the detail minimum', () => {
    const r = masterDetail(box(338), at(VARIANTS.compactLandscape));
    expect(r.detail!.w).toBe(160);
    expect(r.master.w).toBe(170);
  });
});

describe('SidePanel (§3.4)', () => {
  /** The content area of a screen: under a 24-px top bar, right of the nav rail. */
  const area = (m: UIMetrics) => ({ x: m.navW, y: 24, w: m.VW - m.navW, h: m.VH - 24 });

  it('a task sheet: bottom in compact portrait and medium, a right side panel in landscape', () => {
    const kinds = Object.fromEntries(Object.entries(VARIANTS).map(([v, s]) => [v, panelLayout(at(s), 'task', area(at(s)), 200).presentation]));
    expect(kinds).toEqual({ compactPortrait: 'bottom', compactLandscape: 'side', medium: 'bottom', expanded: 'side' });
  });

  it('the side panel docks right, full height of the content area, 240–320 wide (220–280 on a phone sideways)', () => {
    for (const size of ['1024x768', '1280x800', '1440x900', '1920x1080']) {
      const m = at(size);
      const a = area(m);
      const r = panelLayout(m, 'task', a, 100).rect;
      expect(r.w).toBeGreaterThanOrEqual(240);
      expect(r.w).toBeLessThanOrEqual(320);
      expect(r.x + r.w).toBe(a.x + a.w);
      expect(r.y).toBe(a.y);
      expect(r.h).toBe(a.h);
    }
    const m = at(VARIANTS.compactLandscape);
    const r = panelLayout(m, 'task', area(m), 100).rect;
    expect(r.w).toBe(253);
    expect(r.x).toBeGreaterThanOrEqual(m.navW);
  });

  it('left-hand mode docks it on the left edge of the content area', () => {
    const m = at(VARIANTS.expanded);
    const r = panelLayout(m, 'task', area(m), 100, { leftHand: true }).rect;
    expect(r.x).toBe(m.navW);
  });

  it('a bottom sheet keeps the v5 look in compact portrait and is at most 320 wide on a tablet', () => {
    const cp = at(VARIANTS.compactPortrait);
    const b = panelLayout(cp, 'task', area(cp), 200).rect;
    expect(b.y + b.h).toBe(cp.VH);
    expect(b.w).toBe(cp.VW - 8);
    const md = at(VARIANTS.medium);
    const t = panelLayout(md, 'task', area(md), 200).rect;
    expect(t.w).toBe(320);
    expect(t.x).toBe(Math.round((md.VW - 320) / 2));
  });

  it('a decision is a bottom sheet in compact portrait and a centred dialog (max 320 x VH - 16) elsewhere', () => {
    expect(panelLayout(at(VARIANTS.compactPortrait), 'decision', area(at(VARIANTS.compactPortrait)), 120).presentation).toBe('bottom');
    for (const v of ['compactLandscape', 'medium', 'expanded'] as const) {
      const m = at(VARIANTS[v]);
      const p = panelLayout(m, 'decision', area(m), 999);
      expect(p.presentation).toBe('dialog');
      expect(p.rect.w).toBeLessThanOrEqual(320);
      expect(p.rect.h).toBe(m.VH - 16);
      expect(p.rect.x).toBe(Math.round((m.VW - p.rect.w) / 2));
    }
  });

  it('settings: a 60% side panel on a phone sideways, a 280 bottom sheet on a tablet, a centred 320 panel at 80% height on a desktop', () => {
    const cl = at(VARIANTS.compactLandscape);
    expect(panelLayout(cl, 'settings', area(cl), 300)).toMatchObject({ presentation: 'side', rect: { w: Math.round(cl.VW * 0.6) } });
    const md = at(VARIANTS.medium);
    expect(panelLayout(md, 'settings', area(md), 300)).toMatchObject({ presentation: 'bottom', rect: { w: 280 } });
    const ex = at(VARIANTS.expanded);
    expect(panelLayout(ex, 'settings', area(ex), 999)).toMatchObject({ presentation: 'dialog', rect: { w: 320, h: Math.round(ex.VH * 0.8) } });
  });
});

describe('EdgeClusters and the framing rect (§3.5)', () => {
  /** A battle-like HUD: a top row, a card column, an action rail, an orders bar and two corner keys. */
  const HUD = { tl: { w: 60, h: 22 }, tr: { w: 50, h: 22 }, top: { w: 120, h: 18 }, left: { w: 90, h: 150 }, right: { w: 26, h: 100 }, bottom: { w: 200, h: 26 }, bl: { w: 22, h: 22 }, br: { w: 22, h: 22 } };
  const inside = (outer: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }) =>
    r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('anchors each cluster to its edge or corner with the 6 UI px frame padding', () => {
    const safe = { x: 0, y: 0, w: 640, h: 400 };
    const { rects } = edgeClusters(safe, HUD);
    expect(rects.tl).toEqual({ x: 6, y: 6, w: 60, h: 22 });
    expect(rects.tr).toEqual({ x: 640 - 6 - 50, y: 6, w: 50, h: 22 });
    expect(rects.top).toEqual({ x: 260, y: 6, w: 120, h: 18 });
    expect(rects.bl).toEqual({ x: 6, y: 400 - 6 - 22, w: 22, h: 22 });
    expect(rects.br).toEqual({ x: 640 - 6 - 22, y: 400 - 6 - 22, w: 22, h: 22 });
    expect(rects.bottom).toEqual({ x: 220, y: 400 - 6 - 26, w: 200, h: 26 });
    // the side columns start under the top row
    expect(rects.left).toEqual({ x: 6, y: 6 + 22 + 6, w: 90, h: 150 });
    expect(rects.right!.x + rects.right!.w).toBe(640 - 6);
  });

  it('keeps every cluster inside the safe area and apart in all four variants', () => {
    for (const size of Object.values(VARIANTS)) {
      const m = at(size);
      // phone landscape: the notch insets are the safe area's sides
      const safe = { x: 0, y: 0, w: m.VW, h: m.VH };
      const { rects } = edgeClusters(safe, HUD);
      const all = Object.values(rects);
      for (const r of all) expect(inside(safe, r)).toBe(true);
      all.forEach((a, i) => all.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
    }
  });

  it('publishes the framing rect: the safe area minus the clusters, which no cluster overlaps', () => {
    const safe = { x: 30, y: 0, w: 640, h: 400 };
    const { rects, framing } = edgeClusters(safe, HUD);
    for (const r of Object.values(rects)) expect(overlaps(r, framing)).toBe(false);
    expect(framing).toEqual({ x: 30 + 6 + 90, y: 6 + 22, w: 640 - 6 - 90 - 6 - 26, h: 400 - 28 - 32 });
  });

  it('with no clusters the framing rect is the whole safe area', () => {
    const safe = { x: 0, y: 10, w: 422, h: 195 };
    expect(edgeClusters(safe, {}).framing).toEqual(safe);
  });

  it('left-hand mode mirrors the left and right clusters and the framing rect', () => {
    const safe = { x: 0, y: 0, w: 640, h: 400 };
    const r = edgeClusters(safe, HUD);
    const l = edgeClusters(safe, HUD, { leftHand: true });
    const mirror = (b: { x: number; w: number }) => 640 - b.x - b.w;
    expect(l.rects.left!.x).toBe(mirror(r.rects.left!));
    expect(l.rects.right!.x).toBe(6);
    expect(l.rects.tl!.x).toBe(mirror(r.rects.tl!));
    expect(l.rects.br!.x).toBe(6);
    expect(l.framing.x).toBe(mirror(r.framing));
    expect(l.framing.w).toBe(r.framing.w);
  });

  it('the bottom bar sits clear of the corners when they leave room, else above them', () => {
    const safe = { x: 0, y: 0, w: 260, h: 195 };
    const { rects } = edgeClusters(safe, { bl: { w: 22, h: 22 }, br: { w: 22, h: 22 }, bottom: { w: 230, h: 26 } });
    expect(overlaps(rects.bottom!, rects.bl!)).toBe(false);
    expect(overlaps(rects.bottom!, rects.br!)).toBe(false);
  });
});

describe('Grid (§3.7)', () => {
  it('columns = clamp(floor((w + gap) / (minCell + gap)), 1, maxCols)', () => {
    expect(gridColumns(195, { minCell: 56, maxCols: 6 })).toBe(3);
    expect(gridColumns(338, { minCell: 56, maxCols: 6 })).toBe(5);
    expect(gridColumns(568, { minCell: 56, maxCols: 6 })).toBe(6);
    expect(gridColumns(40, { minCell: 56, maxCols: 6 })).toBe(1);
    expect(gridColumns(119, { minCell: 56, maxCols: 6, gap: 8 })).toBe(1);
    expect(gridColumns(120, { minCell: 56, maxCols: 6, gap: 8 })).toBe(2);
    expect(gridColumns(120, { minCell: 56, maxCols: 6, gap: 4 })).toBe(2);
  });

  it('lays cells out in rows that fill the width, every cell at least minCell wide', () => {
    for (const size of Object.values(VARIANTS)) {
      const w = at(size).contentW;
      const g = grid(box(w), 13, { minCell: 56, maxCols: 6 });
      expect(g.cells).toHaveLength(13);
      expect(g.cellW).toBeGreaterThanOrEqual(56);
      const row = g.cells.slice(0, g.cols);
      expect(row[row.length - 1].x + g.cellW).toBeLessThanOrEqual(10 + w);
      expect(g.cells[g.cols].y).toBe(20 + g.cellH + 4);
      expect(g.h).toBe(Math.ceil(13 / g.cols) * (g.cellH + 4) - 4);
    }
  });

  it('cells are square unless a height is given', () => {
    expect(grid(box(200), 4, { minCell: 40, maxCols: 4 }).cellH).toBe(grid(box(200), 4, { minCell: 40, maxCols: 4 }).cellW);
    expect(grid(box(200), 4, { minCell: 40, maxCols: 4, cellH: 30 }).cellH).toBe(30);
  });
});

describe('RotateCard (§3.6)', () => {
  it('shows only under 320 CSS px tall: never at any matrix size', () => {
    for (const s of ['390x844', '360x780', '320x693', '844x390', '768x1024', '820x1180', '1024x768', '1280x800', '1440x900', '1920x1080', '320x568']) {
      const [w, h] = s.split('x').map(Number);
      expect(belowFloor(w, h)).toBe(false);
    }
    expect(belowFloor(844, 319)).toBe(true);
    expect(belowFloor(1280, 300)).toBe(true);
    expect(belowFloor(844, 320)).toBe(false);
  });

  it('asks in English and Russian', () => {
    expect(rotateCardText('en')).toBe('Turn your phone or make the window taller');
    expect(rotateCardText('ru')).toBe('Поверните телефон или сделайте окно выше');
  });
});
