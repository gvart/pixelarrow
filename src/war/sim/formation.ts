import type { Rng } from '../../sim/rng';

export type Shape = 'line' | 'column' | 'wedge' | 'loose';

/**
 * Slot offsets in tiles for n units (docs/WAR.md "Army size N", at N = 12: line 6x2, column 2x6, wedge 1-2-3-6, loose), as flat [forward, right, ...] pairs in the squad's own
 * frame, centred on the anchor. Slot 0 is the front-centre-most.
 */
export function formationOffsets(shape: Shape, n: number, rng: Rng): number[] {
  const out: number[] = [];
  if (shape === 'wedge') {
    // ranks of 1, 2, 3, ... men; a last rank too short for the next size joins the one before (12: 1-2-3-6)
    for (let rank = 0, i = 0; i < n; rank++) {
      const left = n - i;
      const inRank = left - (rank + 1) < rank + 2 ? left : rank + 1;
      for (let k = 0; k < inRank; k++, i++) out.push(-rank * 0.9, k - (inRank - 1) / 2);
    }
  } else {
    const cols = shape === 'column' ? Math.min(2, n) : Math.ceil(n / 2);
    const gap = shape === 'loose' ? 1.8 : 1;
    for (let i = 0; i < n; i++) {
      const rank = Math.floor(i / cols);
      const inRank = Math.min(cols, n - rank * cols);
      let f = -rank * gap;
      let r = ((i % cols) - (inRank - 1) / 2) * gap;
      if (shape === 'loose') {
        f += rng.range(-0.3, 0.3);
        r += rng.range(-0.3, 0.3);
      }
      out.push(f, r);
    }
  }
  let mf = 0;
  for (let i = 0; i < out.length; i += 2) mf += out[i];
  mf /= n;
  for (let i = 0; i < out.length; i += 2) out[i] -= mf;
  return out;
}
