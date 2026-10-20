import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { Order, WarSim } from '../../src/war/types';
import { flat } from './flatRegion';

const alive = (sim: WarSim, q: number) => sim.snapshot().units.filter((u) => u.squad === q && u.state !== 'dead');
const centre = (sim: WarSim, q: number) => {
  const us = alive(sim, q);
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
};

/** 12 hoplites march east past 4 militia standing 12 tiles off their line (in sight, out of a holding man's leash). */
function march(kind: 'move' | 'attackMove', seed = 1, ticks = 1500) {
  const sim = createSim(flat(100), seed);
  const a = sim.spawnSquad('a', 0, 'hoplite', 12, 10, 50);
  const b = sim.spawnSquad('b', 1, 'militia', 4, 45, 62);
  sim.order({ kind, squad: a, x: 88, y: 50 } as Order);
  let fought = false;
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (sim.snapshot().squads[a].order === 'attackMove' && alive(sim, b).length < 4) fought = true;
  }
  return { sim, a, b, fought };
}

describe('attackMove', () => {
  it('takes on a foe in sight on the way, then marches on and holds at the end', () => {
    const { sim, a, b, fought } = march('attackMove');
    expect(fought).toBe(true);
    expect(alive(sim, b).length).toBe(0);
    const c = centre(sim, a);
    expect(Math.hypot(c.x - 88, c.y - 50)).toBeLessThan(4);
    expect(sim.snapshot().squads[a].order).toBe('hold');
  });

  it('a plain move marches past the same foe', () => {
    const { sim, a, b } = march('move');
    expect(alive(sim, b).length).toBe(4);
    const c = centre(sim, a);
    expect(Math.hypot(c.x - 88, c.y - 50)).toBeLessThan(4);
  });

  it('is deterministic', () => {
    const r1 = march('attackMove', 7, 600), r2 = march('attackMove', 7, 600);
    expect(JSON.stringify(r1.sim.snapshot())).toBe(JSON.stringify(r2.sim.snapshot()));
  });
});

describe('stop', () => {
  /** A squad marching east is stopped after `after` ticks. */
  function stopped(seed = 1, after = 40) {
    const sim = createSim(flat(100), seed);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 10, 50);
    sim.order({ kind: 'formation', squad: a, shape: 'column' });
    sim.order({ kind: 'move', squad: a, x: 88, y: 50 });
    for (let t = 0; t < after; t++) sim.step();
    const at = centre(sim, a);
    sim.order({ kind: 'stop', squad: a });
    for (let t = 0; t < 150; t++) sim.step();
    return { sim, a, at };
  }

  it('cancels the march: the men form up where they stood and hold', () => {
    const { sim, a, at } = stopped();
    const c = centre(sim, a);
    expect(c.x).toBeGreaterThan(12); // it was under way
    expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeLessThan(2);
    expect(sim.snapshot().squads[a].order).toBe('hold');
    // in formation (a column 2 wide): every man near the centre, all of them standing
    for (const u of alive(sim, a)) {
      expect(Math.hypot(u.x - c.x, u.y - c.y)).toBeLessThan(8);
      expect(u.state).toBe('idle');
    }
  });

  it('ends an attack-move', () => {
    const sim = createSim(flat(100), 3);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 10, 50);
    sim.order({ kind: 'attackMove', squad: a, x: 88, y: 50 });
    for (let t = 0; t < 40; t++) sim.step();
    sim.order({ kind: 'stop', squad: a });
    for (let t = 0; t < 300; t++) sim.step();
    expect(centre(sim, a).x).toBeLessThan(30);
    expect(sim.snapshot().squads[a].order).toBe('hold');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(stopped(5).sim.snapshot())).toBe(JSON.stringify(stopped(5).sim.snapshot()));
  });
});
