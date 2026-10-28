import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { UnitSnap, WarSim } from '../../src/war/types';
import { flat } from './flatRegion';

// micro: one man of a block falls back, swaps to the rear rank or rejoins (Order kind 'man'), seeded on open ground.

const run = (sim: WarSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const unit = (sim: WarSim, id: number): UnitSnap => sim.snapshot().units[id];
const living = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead');
const nearestFoe = (sim: WarSim, id: number, team: number) => {
  const snap = sim.snapshot(), u = snap.units[id];
  let d = Infinity;
  for (const o of snap.units) if (o.state !== 'dead' && snap.squads[o.squad].team !== team) d = Math.min(d, Math.hypot(o.x - u.x, o.y - u.y));
  return d;
};

/** My 4 hoplites hold at (24,32); 8 militia attack them from the east. Returns the sim, my squad and the front man. */
const brawl = (seed: number) => {
  const sim = createSim(flat(64), seed);
  const mine = sim.spawnSquad('a', 0, 'militia', 4, 24, 32);
  const foe = sim.spawnSquad('b', 1, 'militia', 8, 34, 32);
  run(sim, 3);
  sim.order({ kind: 'hold', squad: mine });
  sim.order({ kind: 'attack', squad: foe, target: mine });
  // the first of mine to strike is the man in the thick of it
  let front = -1;
  run(sim, 200, () => (front = living(sim, mine).find((u) => u.state === 'attack')?.id ?? -1) >= 0);
  return { sim, mine, foe, front };
};
/** Ticks till man id falls (cap if he stands). */
const fallsAt = (sim: WarSim, id: number, cap: number) => run(sim, cap, () => unit(sim, id).state === 'dead');

describe('micro: one man of a block', () => {
  it('falling back leaves the melee and outlives the same man left in it', () => {
    for (const seed of [11, 12]) {
      const ctl = brawl(seed), test = brawl(seed);
      expect(test.front).toBe(ctl.front);
      expect(test.front).toBeGreaterThanOrEqual(0);
      test.sim.order({ kind: 'man', squad: test.mine, unit: test.front, act: 'fallBack' });
      run(test.sim, 30);
      const u = unit(test.sim, test.front);
      expect(u.back).toBe(true);
      expect(u.state).not.toBe('attack');
      expect(u.squad).toBe(test.mine); // still of his block
      expect(nearestFoe(test.sim, test.front, 0)).toBeGreaterThan(2.5); // out of melee reach
      const cap = 1500, a = fallsAt(ctl.sim, ctl.front, cap), b = fallsAt(test.sim, test.front, cap) + 30;
      expect(b).toBeGreaterThan(a + 50);
    }
  });

  it('a man falling back rejoins his slot on rejoin', () => {
    const sim = createSim(flat(64), 21);
    const s = sim.spawnSquad('a', 0, 'militia', 8, 30, 32);
    run(sim, 3);
    sim.order({ kind: 'move', squad: s, x: 36, y: 32 }); // facing east
    run(sim, 200, () => living(sim, s).every((u) => u.state === 'idle'));
    const id = living(sim, s)[2].id, home = unit(sim, id);
    sim.order({ kind: 'man', squad: s, unit: id, act: 'fallBack' });
    run(sim, 80);
    const away = unit(sim, id);
    expect(away.back).toBe(true);
    expect(Math.hypot(away.x - home.x, away.y - home.y)).toBeGreaterThan(5);
    expect(away.x).toBeLessThan(home.x - 4); // behind the block (west, its back)
    sim.order({ kind: 'man', squad: s, unit: id, act: 'rejoin' });
    run(sim, 120);
    const back = unit(sim, id);
    expect(back.back).toBeUndefined();
    expect(back.squad).toBe(s);
    const others = living(sim, s).filter((u) => u.id !== id);
    const cx = others.reduce((a, u) => a + u.x, 0) / others.length, cy = others.reduce((a, u) => a + u.y, 0) / others.length;
    expect(Math.hypot(back.x - cx, back.y - cy)).toBeLessThan(2.5);
  });

  it('a front-rank man swaps to the rear rank', () => {
    const sim = createSim(flat(64), 31);
    const s = sim.spawnSquad('a', 0, 'militia', 8, 30, 32);
    run(sim, 3);
    sim.order({ kind: 'move', squad: s, x: 36, y: 32 }); // a 4 x 2 line facing east: the front rank is the eastern one
    run(sim, 200, () => living(sim, s).every((u) => u.state === 'idle'));
    const men = living(sim, s), maxX = Math.max(...men.map((u) => u.x)), minX = Math.min(...men.map((u) => u.x));
    expect(maxX - minX).toBeGreaterThan(0.6); // two ranks
    const id = men.find((u) => u.x > maxX - 0.3)!.id;
    sim.order({ kind: 'man', squad: s, unit: id, act: 'rear' });
    run(sim, 100);
    const after = living(sim, s), me = after.find((u) => u.id === id)!, front = Math.max(...after.map((u) => u.x));
    expect(me.x).toBeLessThan(front - 0.6); // in the rear rank now
    expect(after.filter((u) => u.x > front - 0.3).length).toBe(4); // the front rank still full
    // a man of the rear rank ordered to the rear stays where he is
    sim.order({ kind: 'man', squad: s, unit: id, act: 'rear' });
    run(sim, 30);
    expect(Math.abs(unit(sim, id).x - me.x)).toBeLessThan(0.3);
  });

  it('refuses a man of another squad, a fallen man, and is deterministic', () => {
    const go = () => {
      const sim = createSim(flat(64), 41);
      const a = sim.spawnSquad('a', 0, 'militia', 4, 20, 20), b = sim.spawnSquad('a', 0, 'militia', 4, 20, 40);
      run(sim, 5);
      const other = living(sim, b)[0].id;
      sim.order({ kind: 'man', squad: a, unit: other, act: 'fallBack' });
      sim.order({ kind: 'man', squad: a, unit: 9999, act: 'fallBack' });
      sim.order({ kind: 'man', squad: a, unit: living(sim, a)[1].id, act: 'fallBack' });
      run(sim, 60);
      return sim.snapshot();
    };
    const s1 = go(), s2 = go();
    expect(s1.units.filter((u) => u.back).map((u) => u.id)).toEqual([1]);
    expect(JSON.stringify(s1.units)).toBe(JSON.stringify(s2.units));
  });
});
