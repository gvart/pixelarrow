/**
 * RFND-04: the wheel accumulator (ADR-0012 Decision 5, design/ux/input-v6.md §2.3) and the
 * cursor-anchored zoom maths shared by Battle, World, War and Camp.
 */
import { describe, expect, it } from 'vitest';
import { WheelAccumulator, type WheelIn } from '../src/ui/input/wheel';
import { anchorOffset, anchoredScroll, type CamView } from '../src/ui/input/zoomAt';

const ev = (deltaY: number, o: Partial<WheelIn> = {}): WheelIn => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false, ...o });
const VIEW_H = 800;

describe('WheelAccumulator', () => {
  it('one mouse notch (100 px) is one zoom step; down zooms out, up zooms in', () => {
    const w = new WheelAccumulator();
    expect(w.push(ev(100), 0, VIEW_H).zoom).toBe(-1);
    expect(w.push(ev(-100), 1000, VIEW_H).zoom).toBe(1);
  });

  it('ten 10 px trackpad deltas are one step, not ten', () => {
    const w = new WheelAccumulator();
    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = w.push(ev(10), i * 16, VIEW_H);
      if (r.zoom) steps.push(r.zoom);
    }
    expect(steps).toEqual([-1]);
  });

  it('line mode counts 16 px a line, page mode a view height', () => {
    const w = new WheelAccumulator();
    expect(w.push(ev(3, { deltaMode: 1 }), 0, VIEW_H).zoom).toBeUndefined(); // 48 px
    expect(w.push(ev(4, { deltaMode: 1 }), 10, VIEW_H).zoom).toBe(-1); // 48 + 64 = 112 px
    expect(w.push(ev(-1, { deltaMode: 2 }), 1000, VIEW_H).zoom).toBe(1);
  });

  it('steps at most once per 120 ms, however fast the wheel spins', () => {
    const w = new WheelAccumulator();
    expect(w.push(ev(100), 0, VIEW_H).zoom).toBe(-1);
    expect(w.push(ev(100), 50, VIEW_H).zoom).toBeUndefined();
    expect(w.push(ev(100), 119, VIEW_H).zoom).toBeUndefined();
    expect(w.push(ev(100), 120, VIEW_H).zoom).toBe(-1);
  });

  it('a held-back flick does not bank extra steps for later', () => {
    const w = new WheelAccumulator();
    w.push(ev(100), 0, VIEW_H);
    for (let t = 10; t < 120; t += 10) w.push(ev(100), t, VIEW_H);
    expect(w.push(ev(100), 130, VIEW_H).zoom).toBe(-1);
    expect(w.push(ev(1), 260, VIEW_H).zoom).toBeUndefined();
  });

  it('turning back starts the count again', () => {
    const w = new WheelAccumulator();
    expect(w.push(ev(90), 0, VIEW_H).zoom).toBeUndefined();
    expect(w.push(ev(-20), 10, VIEW_H).zoom).toBeUndefined();
    expect(w.push(ev(-80), 20, VIEW_H).zoom).toBe(1);
  });

  it('ctrl (a trackpad pinch) zooms through the same accumulator and asks to stop the page zoom', () => {
    const w = new WheelAccumulator();
    const a = w.push(ev(-60, { ctrlKey: true }), 0, VIEW_H);
    expect(a.zoom).toBeUndefined();
    expect(a.prevent).toBe(true);
    expect(w.push(ev(-60, { ctrlKey: true }), 10, VIEW_H).zoom).toBe(1);
    expect(w.push(ev(100), 1000, VIEW_H).prevent).toBe(false);
  });

  it('shift + wheel pans sideways instead of zooming', () => {
    const w = new WheelAccumulator();
    const r = w.push(ev(100, { shiftKey: true }), 0, VIEW_H);
    expect(r.zoom).toBeUndefined();
    expect(r.panX).toBe(100);
  });

  it('a horizontal deltaX pans, normalised like deltaY', () => {
    const w = new WheelAccumulator();
    expect(w.push(ev(0, { deltaX: -12 }), 0, VIEW_H).panX).toBe(-12);
    expect(w.push(ev(0, { deltaX: 2, deltaMode: 1 }), 10, VIEW_H).panX).toBe(32);
    expect(w.push(ev(100), 20, VIEW_H).panX).toBeUndefined();
  });
});

describe('zoom anchored at the cursor', () => {
  /** Phaser's camera mapping (Camera.preRender + getWorldPoint): world = (s - x - w·ox) / z + w·ox + scroll. */
  const worldAt = (c: CamView, sx: number, sy: number) => ({
    x: (sx - c.x - c.width * c.originX) / c.zoom + c.width * c.originX + c.scrollX,
    y: (sy - c.y - c.height * c.originY) / c.zoom + c.height * c.originY + c.scrollY,
  });

  it('a camera keeps the world point under the cursor in place', () => {
    const cam: CamView = { x: 0, y: 0, width: 780, height: 1688, originX: 0.5, originY: 0.5, zoom: 2, scrollX: 140, scrollY: -60 };
    for (const [sx, sy, z] of [
      [100, 200, 4],
      [700, 1500, 1],
      [390, 844, 6],
      [0, 0, 0.5],
    ]) {
      const before = worldAt(cam, sx, sy);
      const s = anchoredScroll(cam, z, sx, sy);
      const after = worldAt({ ...cam, zoom: z, scrollX: s.x, scrollY: s.y }, sx, sy);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('an offset camera (a viewport not at 0, 0) anchors too', () => {
    const cam: CamView = { x: 30, y: 90, width: 400, height: 300, originX: 0.5, originY: 0.5, zoom: 1, scrollX: 0, scrollY: 0 };
    const before = worldAt(cam, 250, 120);
    const s = anchoredScroll(cam, 3, 250, 120);
    const after = worldAt({ ...cam, zoom: 3, scrollX: s.x, scrollY: s.y }, 250, 120);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('a scaled container (screen = offset + world·z) keeps the point under the cursor', () => {
    // Camp: world at x = 40, scale 1; the cursor at 140 is world 100; at scale 2 the offset must be -60
    expect(anchorOffset(40, 140, 1, 2)).toBe(-60);
    expect((140 - anchorOffset(40, 140, 1, 2)) / 2).toBe(100);
    expect(anchorOffset(-60, 140, 2, 1)).toBe(40);
  });
});
