/** Soldier vectors (src/war/sim/soldiers.ts): woundedShare and gainXp over a spread of ends, levels and xp. */
import { gainXp, woundedShare } from '../../war/sim/soldiers';
import { Rng } from '../../sim/rng';
import type { Hero } from '../../data/units';

export const vectors = () => {
  const r = new Rng(11);
  const shares: unknown[] = [0, 3, 5, 5.5, 6, 9, 12, 20, 30].flatMap((e) => [false, true].map((p) => [e, p, woundedShare(e, p)]));
  for (let i = 0; i < 40; i++) {
    const e = r.range(0, 25), p = r.chance(0.5);
    shares.push([e, p, woundedShare(e, p)]);
  }
  const xp: unknown[] = [];
  for (let level = 1; level <= 10; level++) for (const add of [0, 1, 39, 40, 41, 120, 500, 2000, 12.5]) for (const had of [0, 10, 39.5]) {
    const hero = { level, xp: had, points: level } as Hero, out = gainXp(hero, add);
    xp.push([level, had, level, add, out.hero.level, out.hero.xp, out.hero.points, out.levelUps]);
  }
  return { shares, xp };
};
