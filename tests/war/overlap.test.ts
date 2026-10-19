import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { WarSim } from '../../src/war/types';

// Owner play-test: where two friendly squads overlap, the overlapping soldiers walked in circles.
const ridge = parseRegion(ridgeJson);
const [FX, FY] = SPOTS.fieldE; // open flat field east of the river
const SETTLE = 700; // ticks allowed to arrive and settle
const WATCH = 200; // then every unit must stand still this long

/**
 * Runs SETTLE + WATCH ticks. Returns the longest path any unit walks over the last WATCH ticks
 * and the closest two units come at any tick (also while the squads pass through each other).
 */
function watch(sim: WarSim, each?: () => void) {
  let prev = sim.snapshot().units;
  const walked = new Array(prev.length).fill(0);
  let closest = Infinity;
  for (let t = 0; t < SETTLE + WATCH; t++) {
    sim.step();
    each?.();
    const us = sim.snapshot().units;
    if (t >= SETTLE) for (let i = 0; i < us.length; i++) walked[i] += Math.hypot(us[i].x - prev[i].x, us[i].y - prev[i].y);
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) closest = Math.min(closest, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
    prev = us;
  }
  const moving = sim.snapshot().units.filter((u) => u.state !== 'idle').length;
  return { walked: Math.max(...walked), closest, moving };
}

const settled = (r: { walked: number; closest: number; moving: number }) => {
  expect(r.walked).toBeLessThan(0.3); // no circling, no jitter
  expect(r.moving).toBe(0);
  expect(r.closest).toBeGreaterThan(0.6); // bodies never overlap
};

describe('overlapping friendly squads settle', () => {
  const pair = (a: [number, number, number, number], b: [number, number, number, number], cls: [string, string] = ['militia', 'militia']) => {
    const sim = createSim(ridge, 11);
    const s0 = sim.spawnSquad('a', 0, cls[0], 20, a[0], a[1]);
    const s1 = sim.spawnSquad('a', 0, cls[1], 20, b[0], b[1]);
    sim.order({ kind: 'move', squad: s0, x: a[2], y: a[3] });
    sim.order({ kind: 'move', squad: s1, x: b[2], y: b[3] });
    return sim;
  };

  it('two squads ordered to the same point', () => {
    settled(watch(pair([FX - 12, FY, FX, FY], [FX + 12, FY, FX, FY])));
  });

  it('two squads ordered to points 2-3 tiles apart', () => {
    settled(watch(pair([FX - 14, FY - 8, FX, FY], [FX - 14, FY + 10, FX, FY + 2])));
  });

  it('two squads crossing at an angle to nearby points', () => {
    settled(watch(pair([FX - 12, FY - 6, FX + 1, FY + 1], [FX + 4, FY - 14, FX - 1, FY], ['hoplite', 'celt_sword'])));
  });

  it('two same-team bot squads meeting head-on on attack-move', () => {
    const sim = createSim(ridge, 4);
    const bots = createBots(sim);
    const a = sim.spawnSquad('bot', 1, 'hoplite', 20, FX - 14, FY);
    const b = sim.spawnSquad('bot', 1, 'celt_sword', 20, FX + 14, FY);
    bots.set(a, { kind: 'attackMove', x: FX, y: FY });
    bots.set(b, { kind: 'attackMove', x: FX, y: FY + 1 });
    settled(watch(sim, () => bots.tick()));
  });
});
