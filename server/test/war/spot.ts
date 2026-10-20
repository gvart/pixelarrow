import type { WarRoom } from '../../src/war/room';

/** Claim ground for team 0 a little inside from (x,y) and find a spot a 4x4 camp fits. */
export function spot(r: WarRoom, x: number, y: number): [number, number] {
  for (let d = 12; d < 80; d += 2) {
    const yy = y + d;
    r.sim.claim(0, x, yy, 20);
    for (let dx = -10; dx <= 10; dx += 2) if (r.sim.checkPlacement(0, 'camp', x + dx, yy).ok) return [x + dx, yy];
  }
  throw new Error('no spot');
}
