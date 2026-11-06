/**
 * Economy rules (src/war/sim/economy.ts) for the Godot port: footprints of every building both ways, rectangle and
 * polyline tiles on seeded inputs (half tiles, steep, flat, backwards, repeated points), door locks and who needs a man.
 */
import { Rng } from '../../sim/rng';
import type { BuildingType } from '../../war/types';
import { BUILDINGS, lineTiles, lockOf, needsPerson, rectTiles, rotated } from '../../war/sim/economy';

export const vectors = () => {
  const r = new Rng(77), types = Object.keys(BUILDINGS) as BuildingType[];
  const rects = Array.from({ length: 200 }, (_, i) => {
    const x = i < 20 ? i * 0.25 - 2 : r.range(-5, 300), y = i < 20 ? 3.5 : r.range(-5, 300), w = r.int(1, 10), h = r.int(1, 10);
    return [x, y, w, h, rectTiles(x, y, w, h)];
  });
  const lines = Array.from({ length: 300 }, (_, i) => {
    const pts: number[] = [];
    const n = i < 10 ? i % 4 : r.int(1, 6);
    let x = r.range(0, 200), y = r.range(0, 200);
    for (let k = 0; k < n; k++) {
      pts.push(x, y);
      const m = r.int(0, 5);
      if (m === 0) continue; // a repeated point
      x += m === 1 ? 0 : r.range(-30, 30);
      y += m === 2 ? 0 : r.range(-30, 30);
      if (m === 3) (x = Math.floor(x)), (y = Math.floor(y));
    }
    if (i % 17 === 5) pts.push(x); // an odd length: the last x alone is dropped
    return [pts, lineTiles(pts)];
  });
  return {
    buildings: types.map((t) => [t, rotated(t, 0), rotated(t, 1), lockOf(BUILDINGS[t]), needsPerson(t, BUILDINGS[t])]),
    rects, lines,
  };
};
