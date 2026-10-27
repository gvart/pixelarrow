/** Personal map markers (src/war/view/hud/pinStore.ts): capped per view, removable, temporary (they fade and go). */
import { describe, expect, it } from 'vitest';
import { PIN_FADE_MS, PIN_MAX, PIN_MS, pinAlpha, PinStore } from '../../src/war/view/hud/pinStore';

const clock = () => { const c = { t: 1000, now: () => c.t }; return c; };

describe('personal markers', () => {
  it('holds at most PIN_MAX: the oldest drops, the new one takes the lowest free number', () => {
    const s = new PinStore(clock().now);
    for (let i = 0; i < PIN_MAX; i++) s.add(i, i);
    expect(s.list().map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    const p = s.add(9, 9);
    expect(s.list()).toHaveLength(PIN_MAX);
    expect(s.list()[0]).toMatchObject({ n: 2, x: 1 });
    expect(p).toMatchObject({ n: 1, x: 9, y: 9 });
  });

  it('removes one by its number (a middle click toggles it), and clears all', () => {
    const s = new PinStore(clock().now);
    s.add(1, 1); s.add(2, 2); s.add(3, 3);
    s.remove(2);
    expect(s.list().map((p) => p.n)).toEqual([1, 3]);
    expect(s.add(4, 4).n).toBe(2);
    s.clear();
    expect(s.list()).toEqual([]);
  });

  it('lasts PIN_MS, fading over its last PIN_FADE_MS, then goes and frees its number', () => {
    const c = clock(), s = new PinStore(c.now);
    const a = s.add(10.04, 20.06);
    expect(a).toEqual({ n: 1, x: 10, y: 20.1, t: 1000 });
    c.t += 2000;
    s.add(5, 5);
    c.t = a.t + PIN_MS - PIN_FADE_MS;
    expect(pinAlpha(a, c.t)).toBe(1);
    c.t += PIN_FADE_MS / 2;
    expect(pinAlpha(a, c.t)).toBeCloseTo(0.5);
    c.t = a.t + PIN_MS;
    expect(pinAlpha(a, c.t)).toBe(0);
    expect(s.list().map((p) => p.n)).toEqual([2]);
    expect(s.add(0, 0).n).toBe(1);
  });

  it('keeps nothing between visits', () => {
    new PinStore().add(1, 1);
    expect(new PinStore().list()).toEqual([]);
  });
});
