import { describe, expect, it } from 'vitest';
import { FOAM_NX, relief, RELIEF_FILL } from '../../src/war/view/relief';
import { KINDS } from '../../src/war/regions/visual';

const GRASS = KINDS.indexOf('grass'), DEEP = KINDS.indexOf('deep');
/** Light of a code: + lit, - shade, 0 none (water and wet codes are not slope light). */
const light = (c: number) => {
  const f = RELIEF_FILL[c] ?? '';
  const a = Number(/,([\d.]+)\)$/.exec(f)?.[1] ?? 0);
  return f.startsWith('rgba(255') ? a : f.startsWith('rgba(16,20,38') ? -a : 0;
};

describe('relief', () => {
  it('lights ground rising toward +x (facing the NW light) and shades ground falling toward +x', () => {
    const w = 60, h = 20, fk = new Uint8Array(w * h).fill(GRASS), fz = new Float32Array(w * h);
    // a ridge along y at x = 30: up from x 10 to 30, down to 50
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fz[y * w + x] = 20 + Math.max(0, 20 - Math.abs(x - 30)) * 0.8;
    const { code } = relief(w, h, fk, fz);
    const avg = (x0: number, x1: number) => { let s = 0, n = 0; for (let y = 5; y < 15; y++) for (let x = x0; x < x1; x++) { s += light(code[y * w + x]); n++; } return s / n; };
    expect(avg(15, 26)).toBeGreaterThan(0.05);
    expect(avg(35, 46)).toBeLessThan(-0.05);
  });

  it('marks shore water with foam toward the land and keeps open water clear', () => {
    const w = 30, h = 10, fk = new Uint8Array(w * h), fz = new Float32Array(w * h).fill(4);
    for (let j = 0; j < w * h; j++) fk[j] = j % w < 10 ? GRASS : DEEP;
    const { foam } = relief(w, h, fk, fz);
    expect(foam[5 * w + 10] & FOAM_NX).toBeTruthy();
    expect(foam[5 * w + 20]).toBe(0);
    expect(foam[5 * w + 5]).toBe(0);
  });
});
