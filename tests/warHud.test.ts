/**
 * V6-RSCR-03: the War map's HUD per layout variant (design/ux/landscape-v6.md §8.2) and its camera
 * framing (§8.3), at every size of the v6 matrix and in Telegram's short landscape.
 */
import { describe, expect, it } from 'vitest';
import { metricsFor, type UIMetrics } from '../src/ui/sizeClass';
import { clampToFraming, framedZoomLimits, intoFraming, warHudLayout, type WarHudSpec } from '../src/scenes/online/warHud';
import type { Box } from '../src/ui/mosaic/layout/geometry';

const at = (size: string): UIMetrics => {
  const [w, h] = size.split('x').map(Number);
  return metricsFor(w, h, 1, false);
};
/** Telegram's 844x390 safe area (726x323 CSS px). */
const TG_LAND = metricsFor(726, 323, 1, false);
const MATRIX = ['390x844', '360x780', '320x693', '844x390', '768x1024', '820x1180', '1024x768', '1280x800', '1440x900', '1920x1080'];
const LANDSCAPE = ['844x390', '1024x768', '1280x800', '1440x900', '1920x1080'];
/** railLayout's sizes: labelled keys 30 (44 expanded) tall when they fit, else icon keys 22. */
const rail = (avail: number, expanded: boolean) => {
  const keyH = expanded ? 44 : 30;
  const big = 5 * keyH + 4 * 3 + 4;
  return big <= avail ? { w: 44, h: big } : { w: 26, h: 5 * 22 + 4 * 3 + 4 };
};
/** The card: the sentence row (22) and one or two rows of chips (22 + 2), by width. */
const cardH = (w: number) => 4 + 22 + 3 + (w >= 236 ? 22 : 46) + 4;
const spec = (o: Partial<WarHudSpec> = {}): WarHudSpec => ({ top: 24, rail, cardH, marching: false, panel: false, ...o });

const inside = (a: Box, b: Box) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the War map HUD (§8.2)', () => {
  it('keeps the v5 hub (the map window in the frame) in compact portrait and medium', () => {
    for (const size of ['390x844', '360x780', '320x693', '768x1024', '820x1180']) expect(warHudLayout(at(size), spec()), size).toBeNull();
  });

  it('draws the map full bleed right of the nav rail and under the top bar in landscape', () => {
    for (const size of LANDSCAPE) {
      const m = at(size);
      const l = warHudLayout(m, spec())!;
      expect(l.map, size).toEqual({ x: m.navW, y: 24, w: m.VW - m.navW, h: m.VH - 24 });
    }
  });

  it('never hides the key rail: the right edge, full height, every key inside the screen (§16.4)', () => {
    for (const m of [...LANDSCAPE.map(at), TG_LAND]) {
      for (const o of [{}, { panel: true }, { marching: true, panel: true }]) {
        const l = warHudLayout(m, spec(o))!;
        expect(l.rail.x + l.rail.w).toBe(m.VW);
        expect(l.rail.y).toBe(24);
        expect(l.rail.h).toBe(m.VH - 24);
        expect(l.keys.h).toBeLessThanOrEqual(l.rail.h);
        expect(inside(l.keys, l.rail)).toBe(true);
      }
    }
  });

  it('labels the keys at 844x390 (30 tall) and at laptops (44 tall); icon keys in Telegram\'s short landscape', () => {
    expect(warHudLayout(at('844x390'), spec())!.keys.h).toBe(5 * 30 + 16);
    for (const size of ['1024x768', '1280x800', '1440x900', '1920x1080']) expect(warHudLayout(at(size), spec())!.keys.h, size).toBe(5 * 44 + 16);
    expect(warHudLayout(TG_LAND, spec())!.keys.h).toBe(5 * 22 + 16);
  });

  it('puts the situation card top-left (≤ 280 at 844x390, ≤ 320 on laptops), clear of the rail', () => {
    for (const size of LANDSCAPE) {
      const m = at(size);
      const l = warHudLayout(m, spec())!;
      expect(l.card!.x).toBe(m.navW + 6);
      expect(l.card!.y).toBe(24 + 6);
      expect(l.card!.w).toBeLessThanOrEqual(m.cls === 'compact' ? 280 : 320);
      expect(l.card!.w).toBeGreaterThanOrEqual(236);
      expect(overlap(l.card!, l.rail)).toBe(false);
    }
  });

  it('opens the hex panel as an inspector left of the key rail: 220 at 844x390, 240 at 1024, 280 wider', () => {
    const want: Record<string, number> = { '844x390': 220, '1024x768': 240, '1280x800': 280, '1440x900': 280, '1920x1080': 280 };
    for (const size of LANDSCAPE) {
      const m = at(size);
      const l = warHudLayout(m, spec({ panel: true }))!;
      expect(l.panel!.w, size).toBe(want[size]);
      expect(l.panel!.x + l.panel!.w).toBe(l.rail.x);
      expect(l.panel!.y).toBe(24);
      expect(l.panel!.h).toBe(m.VH - 24);
    }
    const tg = warHudLayout(TG_LAND, spec({ panel: true }))!;
    expect(tg.panel!.w).toBe(220);
    expect(tg.panel!.x).toBeGreaterThan(TG_LAND.navW);
  });

  it('keeps the card beside an open panel where it fits, else folds it under the panel', () => {
    for (const size of ['1280x800', '1440x900', '1920x1080']) {
      const l = warHudLayout(at(size), spec({ panel: true }))!;
      expect(l.card, size).not.toBeNull();
      expect(overlap(l.card!, l.panel!)).toBe(false);
    }
    expect(warHudLayout(at('844x390'), spec({ panel: true }))!.card).toBeNull();
    expect(warHudLayout(TG_LAND, spec({ panel: true }))!.card).toBeNull();
  });

  it('puts the march bar bottom-centre over the map, clear of the panel and the rail; under a panel that leaves no room for it', () => {
    for (const m of [...LANDSCAPE.map(at), TG_LAND]) {
      for (const panel of [false, true]) {
        const l = warHudLayout(m, spec({ marching: true, panel }))!;
        if (!l.march) {
          expect(panel).toBe(true);
          continue;
        }
        expect(l.march.w).toBeGreaterThanOrEqual(140);
        expect(l.march!.y + l.march!.h).toBe(m.VH - 6);
        expect(l.march!.x).toBeGreaterThanOrEqual(m.navW);
        expect(overlap(l.march!, l.rail)).toBe(false);
        if (l.panel) expect(overlap(l.march!, l.panel)).toBe(false);
        if (l.card) expect(overlap(l.march!, l.card)).toBe(false);
      }
    }
    expect(warHudLayout(at('1280x800'), spec({ marching: true, panel: true }))!.march).not.toBeNull();
    expect(warHudLayout(at('844x390'), spec({ marching: true, panel: true }))!.march).toBeNull();
  });

  it('frames the clear map: inside the map, clear of the card, the rail, the march bar and an open panel (§8.3)', () => {
    for (const m of [...LANDSCAPE.map(at), TG_LAND]) {
      for (const o of [{}, { panel: true }, { marching: true }, { marching: true, panel: true }]) {
        const l = warHudLayout(m, spec(o))!;
        const f = l.framing;
        expect(f.w).toBeGreaterThan(20);
        expect(f.h).toBeGreaterThan(20);
        expect(inside(f, l.map)).toBe(true);
        for (const b of [l.card, l.rail, l.march, l.panel]) if (b) expect(overlap(f, b)).toBe(false);
      }
    }
  });

  it('covers every matrix size without throwing', () => {
    for (const size of MATRIX) expect(() => warHudLayout(at(size), spec({ marching: true, panel: true }))).not.toThrow();
  });
});

describe('the War map camera (§8.3)', () => {
  // a canvas of 1280x800 device px at S = 2, the framing rect left of a panel
  const S = 2;
  const canvas = { w: 1280, h: 800 };
  const framing: Box = { x: 72, y: 24, w: 300, h: 376 };
  const bounds: Box = { x: 0, y: 0, w: 4000, h: 3000 };

  it('keeps the framing rect over the map (the half-view correction), not just the camera centre', () => {
    const z = 2;
    // asked to look at the map's corner: the framing rect's world box stays inside the map
    const c = clampToFraming(0, 0, z, S, canvas, framing, bounds);
    const left = c.x + (framing.x * S - canvas.w / 2) / z;
    const top = c.y + (framing.y * S - canvas.h / 2) / z;
    expect(left).toBeCloseTo(0);
    expect(top).toBeCloseTo(0);
    const c2 = clampToFraming(1e6, 1e6, z, S, canvas, framing, bounds);
    expect(c2.x + ((framing.x + framing.w) * S - canvas.w / 2) / z).toBeCloseTo(4000);
    expect(c2.y + ((framing.y + framing.h) * S - canvas.h / 2) / z).toBeCloseTo(3000);
    // a point well inside is left alone
    expect(clampToFraming(2000, 1500, z, S, canvas, framing, bounds)).toEqual({ x: 2000, y: 1500 });
  });

  it('centres a map smaller than the framing rect inside it', () => {
    const z = 0.1;
    const c = clampToFraming(0, 0, z, S, canvas, framing, bounds);
    const left = c.x + (framing.x * S - canvas.w / 2) / z;
    const right = c.x + ((framing.x + framing.w) * S - canvas.w / 2) / z;
    expect((left + right) / 2).toBeCloseTo(2000);
  });

  it('moves a selected hex into the framing rect only when it is outside it, and no further than needed', () => {
    // the hex on screen (device px) at the panel's place: eased left into the rect
    const inner = { x: framing.x * S + 24, y: framing.y * S + 24, w: framing.w * S - 48, h: framing.h * S - 48 };
    expect(intoFraming({ x: 300, y: 300 }, inner)).toEqual({ x: 0, y: 0 });
    const d = intoFraming({ x: 1000, y: 300 }, inner);
    expect(d.y).toBe(0);
    expect(1000 + d.x).toBe(inner.x + inner.w);
    const up = intoFraming({ x: 300, y: 10 }, inner);
    expect(10 + up.y).toBe(inner.y);
  });

  it('takes the zoom limits from the framing rect and S: zoomed out, the whole map fits the framing rect, no smaller', () => {
    const lim = { min: 0.25, max: 6, start: 2 };
    // a small map: the overview stops where the map fills the framing rect (600 device px / 1000 map px)
    const small = framedZoomLimits(lim, S, framing, { x: 0, y: 0, w: 1000, h: 800 });
    expect(small.min).toBeCloseTo(Math.min((framing.w * S) / 1000, (framing.h * S) / 800));
    expect(small.max).toBe(lim.max);
    expect(small.start).toBe(lim.start);
    // a big map keeps S's floor; the floor never passes the start zoom
    expect(framedZoomLimits(lim, S, framing, { x: 0, y: 0, w: 40000, h: 30000 }).min).toBe(lim.min);
    expect(framedZoomLimits(lim, S, framing, { x: 0, y: 0, w: 10, h: 10 }).min).toBe(lim.start);
  });
});
