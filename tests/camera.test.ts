import { describe, expect, it } from 'vitest';
import { boxOf, centreOf, edgePointer, followCentre, isOnScreen, keepInView, openingFrame, union, type Box } from '../src/ui/battleCamera';
import { isoToScreen } from '../src/art/iso';

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

describe('opening frame (controls.md R7, F2)', () => {
  it('opens at 1x on both armies when they fit at 1x', () => {
    const f = openingFrame(390, 500, box(0, 0, 300, 400));
    expect(f).toEqual({ zoom: 1, fits: true });
  });

  it('zooms out, snapped down to 0.25, when both armies fit only below 1x', () => {
    // raw fit = 390 / 480 = 0.81 -> 0.75
    expect(openingFrame(390, 600, box(0, 0, 480, 300))).toEqual({ zoom: 0.75, fits: true });
  });

  it('never zooms closer than 1x, however small the armies', () => {
    expect(openingFrame(390, 600, box(0, 0, 50, 50)).zoom).toBe(1);
  });

  it('falls back to 1x and an edge arrow when both armies do not fit at 0.75x', () => {
    // raw fit = 390 / 600 = 0.65 < 0.75
    expect(openingFrame(390, 600, box(0, 0, 600, 300))).toEqual({ zoom: 1, fits: false });
  });

  it('a typical deployment on a 24x36 field fits at 0.75x on a 390x844 phone (K1)', () => {
    // each army a 3-deep line across ~8 paces, ~12 paces apart in depth
    const pts = [
      [8, 24],
      [16, 24],
      [8, 27],
      [16, 27],
      [8, 10],
      [16, 10],
      [8, 13],
      [16, 13],
    ].map(([x, y]) => isoToScreen(x, y));
    const armies = boxOf(pts, 10, 44, 4)!;
    const view = { w: 390, h: 844 - 46 - 300 }; // field band between the bars
    const f = openingFrame(view.w, view.h, armies);
    expect(f.fits).toBe(true);
    expect(f.zoom).toBeGreaterThanOrEqual(0.75);
    // and at that zoom the box is inside the view
    expect(armies.x1 - armies.x0).toBeLessThanOrEqual(view.w / f.zoom);
    expect(armies.y1 - armies.y0).toBeLessThanOrEqual(view.h / f.zoom);
  });
});

describe('boxes', () => {
  it('pads a point cloud and unions boxes', () => {
    const b = boxOf([{ x: 0, y: 0 }, { x: 10, y: 20 }], 2, 3, 1);
    expect(b).toEqual(box(-2, -3, 12, 21));
    expect(union(b, null)).toEqual(b);
    expect(union(b, box(20, 0, 30, 5))).toEqual(box(-2, -3, 30, 21));
    expect(centreOf(box(0, 0, 10, 20))).toEqual({ x: 5, y: 10 });
    expect(boxOf([], 1, 1, 1)).toBeNull();
  });
});

describe('follow (controls.md R8.1)', () => {
  const view = { w: 400, h: 300 };

  it('frames the melee plus the selected group: the centre of both', () => {
    const c = followCentre(box(0, 0, 100, 100), box(200, 0, 300, 100), { x: 999, y: 999 }, view, 20);
    expect(c).toEqual({ x: 150, y: 50 });
  });

  it('never loses the selected group when the two do not fit (K2)', () => {
    const melee = box(0, 0, 100, 100);
    const group = box(900, 0, 1000, 100);
    const c = followCentre(melee, group, { x: 0, y: 0 }, view, 20);
    // the group's whole box is inside the view, minus the margin
    expect(group.x0).toBeGreaterThanOrEqual(c.x - view.w / 2 + 20);
    expect(group.x1).toBeLessThanOrEqual(c.x + view.w / 2 - 20);
    // and the camera leans toward the melee as far as it can
    expect(c.x).toBe(group.x1 - view.w / 2 + 20);
  });

  it('centres on the group when it is bigger than the view', () => {
    const c = followCentre(null, box(0, 0, 1000, 100), { x: 5000, y: 5000 }, view, 20);
    expect(c.x).toBe(500);
  });

  it('no melee: the fallback point, still keeping the group in view', () => {
    expect(followCentre(null, null, { x: 7, y: 8 }, view, 20)).toEqual({ x: 7, y: 8 });
    const c = followCentre(null, box(1000, 1000, 1010, 1010), { x: 0, y: 0 }, view, 20);
    expect(isOnScreen(centreOf(box(1000, 1000, 1010, 1010)), { x0: c.x - 200, y0: c.y - 150, x1: c.x + 200, y1: c.y + 150 })).toBe(true);
  });

  it('the hard keep stops a lagging camera from losing a fast group', () => {
    // the eased camera is still at x = 0; the group already ran to 300..340
    const c = keepInView({ x: 0, y: 0 }, box(300, -10, 340, 10), view, 0);
    expect(c.x).toBe(340 - view.w / 2);
    expect(keepInView({ x: 5, y: 6 }, null, view, 0)).toEqual({ x: 5, y: 6 });
  });

  it('a melee alone is centred as before', () => {
    expect(followCentre(box(0, 0, 10, 10), null, { x: 99, y: 99 }, view, 20)).toEqual({ x: 5, y: 5 });
  });
});

describe('edge pointer (controls.md R8.2)', () => {
  const rect = box(0, 0, 400, 600);

  it('is hidden while the target is on screen', () => {
    expect(edgePointer({ x: 200, y: 300 }, rect, 20)).toBeNull();
  });

  it('sits on the inset edge toward an off-screen target', () => {
    const p = edgePointer({ x: 1000, y: 300 }, rect, 20)!;
    expect(p.x).toBe(380);
    expect(p.y).toBe(300);
    expect(p.angle).toBeCloseTo(0);
  });

  it('clamps to a corner for a diagonal target and points at it', () => {
    const p = edgePointer({ x: -1000, y: -1000 }, rect, 20)!;
    expect(p.x).toBeGreaterThanOrEqual(20);
    expect(p.y).toBeGreaterThanOrEqual(20);
    expect(p.x === 20 || p.y === 20).toBe(true);
    expect(Math.cos(p.angle)).toBeLessThan(0);
    expect(Math.sin(p.angle)).toBeLessThan(0);
  });

  it('a target below the field band points down', () => {
    const p = edgePointer({ x: 200, y: 5000 }, rect, 20)!;
    expect(p.y).toBe(580);
    expect(p.angle).toBeCloseTo(Math.PI / 2);
  });
});
