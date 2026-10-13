/**
 * The scale policy (ADR-0013, design/ux/landscape-v6.md §1–§2): size classes on
 * the safe-area CSS box, a whole-number S per class, the UIMetrics contract and
 * the legacy column that keeps unmigrated scenes at their v5 width.
 */
import { describe, expect, it } from 'vitest';
import { CONTENT_MAX, legacyColumnWidth, metricsFor, resizeAction, sizeClass } from '../src/ui/sizeClass';

/** design/ux/landscape-v6.md §1.1: viewport → class, land, S, VW × VH, nav width. */
const MATRIX: [string, 'compact' | 'medium' | 'expanded', boolean, number, number, number, number][] = [
  ['390x844', 'compact', false, 2, 195, 422, 0],
  ['360x780', 'compact', false, 2, 180, 390, 0],
  ['320x693', 'compact', false, 2, 160, 346, 0],
  ['844x390', 'compact', true, 2, 422, 195, 84],
  ['768x1024', 'medium', false, 2, 384, 512, 0],
  ['820x1180', 'medium', false, 2, 410, 590, 0],
  ['1024x768', 'expanded', true, 2, 512, 384, 72],
  ['1280x800', 'expanded', true, 2, 640, 400, 72],
  ['1440x900', 'expanded', true, 2, 720, 450, 72],
  ['1920x1080', 'expanded', true, 3, 640, 360, 72],
];

/** docs/v6/audit/UI.md §1: what v5 laid out at each size (the 0.64 column), S and VW × VH. */
const V5: [string, number, number, number][] = [
  ['390x844', 2, 195, 422],
  ['360x780', 2, 180, 390],
  ['320x693', 2, 160, 346],
  ['844x390', 2, 124, 195],
  ['768x1024', 2, 327, 512],
  ['820x1180', 2, 377, 590],
  ['1024x768', 2, 245, 384],
  ['1280x800', 2, 256, 400],
  ['1440x900', 2, 288, 450],
  ['1920x1080', 2, 345, 540],
];

const dims = (s: string): [number, number] => s.split('x').map(Number) as [number, number];

describe('size classes (§1)', () => {
  it.each(MATRIX)('%s is %s (land %s)', (size, cls, land) => {
    const [w, h] = dims(size);
    expect(sizeClass(w, h)).toEqual({ cls, land });
  });

  it('measures on the short side: a short wide window is compact landscape, a near-square one medium', () => {
    expect(sizeClass(1600, 470)).toEqual({ cls: 'compact', land: true });
    expect(sizeClass(900, 900)).toEqual({ cls: 'medium', land: true });
    expect(sizeClass(1000, 950)).toEqual({ cls: 'medium', land: true }); // aspect < 1.1
    expect(sizeClass(950, 600)).toEqual({ cls: 'medium', land: true }); // W < 960
    expect(sizeClass(960, 600)).toEqual({ cls: 'expanded', land: true });
  });
});

describe('UIMetrics for a scene that opted in (§1.2, §2.1)', () => {
  it.each(MATRIX)('%s: %s, S %#', (size, cls, land, S, VW, VH, navW) => {
    const [w, h] = dims(size);
    const m = metricsFor(w, h, 1, false);
    expect({ cls: m.cls, land: m.land, S: m.S, VW: m.VW, VH: m.VH, navW: m.navW, legacy: m.legacy }).toEqual({ cls, land, S, VW, VH, navW, legacy: false });
    expect(m.contentW).toBe(Math.min(VW - navW, CONTENT_MAX));
    expect(m.short).toBe(VH < 240);
  });

  it('S is whole CSS px per UI px, times the render scale; layout in UI px does not change with RS', () => {
    for (const [size, , , S, VW, VH] of MATRIX) {
      const [w, h] = dims(size);
      const m = metricsFor(w * 2, h * 2, 2, false);
      expect([m.S, m.VW, m.VH], size).toEqual([S * 2, VW, VH]);
    }
  });

  it('keeps S at 3 on big screens and allows 4 only from a short side of 1800', () => {
    expect(metricsFor(2560, 1440, 1, false).S).toBe(3);
    expect(metricsFor(3840, 2160, 1, false).S).toBe(4);
    expect(metricsFor(3000, 1799, 1, false).S).toBe(3);
    // medium stops at 3, compact at 4
    expect(metricsFor(1700, 2200, 1, false).S).toBe(3);
    expect(metricsFor(1000, 2000, 1, false)).toMatchObject({ cls: 'medium' });
  });

  it('caps the content width at 640 UI px beside the rail', () => {
    expect(metricsFor(1440, 900, 1, false).contentW).toBe(640);
    expect(metricsFor(1280, 800, 1, false).contentW).toBe(640 - 72);
    expect(metricsFor(844, 390, 1, false).contentW).toBe(422 - 84);
  });
});

describe('the legacy column (unmigrated scenes, V6-021)', () => {
  it('is the v5 width: min(W, H x 0.64)', () => {
    expect(legacyColumnWidth(1280, 800)).toBe(512);
    expect(legacyColumnWidth(390, 844)).toBe(390);
    expect(legacyColumnWidth(844, 390)).toBeCloseTo(249.6);
  });

  it.each(V5)('%s lays out as v5 did: S %i, %i x %i', (size, S, VW, VH) => {
    const [w, h] = dims(size);
    const m = metricsFor(legacyColumnWidth(w, h), h, 1, true);
    expect({ S: m.S, VW: m.VW, VH: m.VH, legacy: m.legacy, cls: m.cls, land: m.land, navW: m.navW }).toEqual({ S, VW, VH, legacy: true, cls: 'compact', land: false, navW: 0 });
  });

  it('uses the v5 scale formula, not the class formula (a 2560x1440 column stays at v5 S = 3)', () => {
    expect(metricsFor(legacyColumnWidth(2560, 1440), 1440, 1, true).S).toBe(3);
  });

  it('leaves phones in portrait exactly as v5: the same metrics in both modes', () => {
    for (const size of ['390x844', '360x780', '320x693']) {
      const [w, h] = dims(size);
      const a = metricsFor(legacyColumnWidth(w, h), h, 1, true);
      const b = metricsFor(w, h, 1, false);
      expect([a.S, a.VW, a.VH], size).toEqual([b.S, b.VW, b.VH]);
    }
  });
});

describe('resizing (§1.2, §16.11)', () => {
  const at = (size: string, legacy = false) => {
    const [w, h] = dims(size);
    return metricsFor(legacy ? legacyColumnWidth(w, h) : w, h, 1, legacy);
  };

  it('rebuilds when the class or the orientation changes', () => {
    expect(resizeAction(at('900x900'), at('1280x800'))).toBe('rebuild');
    expect(resizeAction(at('1280x800'), at('800x400'))).toBe('rebuild');
    expect(resizeAction(at('768x1024'), at('1024x768'))).toBe('rebuild');
  });

  it('reflows within a class', () => {
    expect(resizeAction(at('1280x800'), at('1440x900'))).toBe('reflow');
    expect(resizeAction(at('390x844'), at('360x780'))).toBe('reflow');
  });

  it('always rebuilds a legacy scene, as v5 did', () => {
    expect(resizeAction(at('1280x800', true), at('1440x900', true))).toBe('rebuild');
  });
});
