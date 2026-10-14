import { describe, expect, it } from 'vitest';
import { easeOut, valueAt } from '../src/scripts/countUp';

// The stats counters (V6-LAND-04) may only ever show the real value or a number on the way up to it.
describe('count-up curve', () => {
  it('starts at 0 and ends exactly on the value', () => {
    for (const to of [0, 3, 12, 56789, 1234567]) {
      expect(valueAt(to, 0)).toBe(0);
      expect(valueAt(to, 1)).toBe(to);
      expect(valueAt(to, 1.7)).toBe(to);
    }
  });

  it('rises without overshoot, fast first (ease-out)', () => {
    const to = 56789;
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = valueAt(to, t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(to);
      last = v;
    }
    expect(easeOut(0.5)).toBeGreaterThan(0.9);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});
