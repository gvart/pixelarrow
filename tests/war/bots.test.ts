import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { WarSim } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);

const live = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead');
const centre = (sim: WarSim, squad: number) => {
  const us = live(sim, squad);
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length];
};

describe('bots', () => {
  it('attack-move fights the enemy met on the way, then reaches the point', () => {
    const sim = createSim(ridge, 1);
    const bots = createBots(sim);
    const me = sim.spawnSquad('bot', 0, 'militia', 20, 115, 100);
    const foe = sim.spawnSquad('e', 1, 'militia', 6, 130, 101);
    bots.set(me, { kind: 'attackMove', x: 148, y: 100 });
    let fought = false;
    for (let t = 0; t < 1500; t++) {
      sim.step();
      bots.tick();
      if (bots.phase(me) === 'fight') fought = true;
    }
    expect(fought).toBe(true);
    expect(live(sim, foe)).toHaveLength(0);
    const [x, y] = centre(sim, me);
    expect(Math.hypot(x - 148, y - 100)).toBeLessThan(4);
    expect(bots.phase(me)).toBe('done');
  });

  it('hold stays put while enemies are far, engages those that come near, then walks back', () => {
    const sim = createSim(ridge, 2);
    const bots = createBots(sim);
    const me = sim.spawnSquad('bot', 0, 'militia', 20, 120, 100);
    const far = sim.spawnSquad('e', 1, 'militia', 10, 140, 100);
    bots.set(me, { kind: 'hold', x: 120, y: 100 });
    for (let t = 0; t < 200; t++) sim.step(), bots.tick();
    expect(bots.phase(me)).toBe('hold');
    expect(Math.hypot(centre(sim, me)[0] - 120, centre(sim, me)[1] - 100)).toBeLessThan(2);
    // the enemy walks up to the point
    sim.order({ kind: 'move', squad: far, x: 125, y: 100 });
    let fought = false;
    for (let t = 0; t < 1500; t++) {
      sim.step();
      bots.tick();
      if (bots.phase(me) === 'fight') fought = true;
    }
    expect(fought).toBe(true);
    expect(live(sim, far)).toHaveLength(0);
    expect(bots.phase(me)).toBe('hold');
    const [x, y] = centre(sim, me);
    expect(Math.hypot(x - 120, y - 100)).toBeLessThan(4);
  });

  it('flank goes through the chosen waypoint before it strikes', () => {
    const sim = createSim(ridge, 3);
    const bots = createBots(sim);
    const me = sim.spawnSquad('bot', 0, 'militia', 20, 30, 66);
    const foe = sim.spawnSquad('e', 1, 'militia', 8, 22, 98);
    sim.order({ kind: 'formation', squad: me, shape: 'column' });
    bots.set(me, { kind: 'flank', via: [39, 92], x: 22, y: 98 });
    let viaAt = -1;
    let fightAt = -1;
    let inPass = false;
    for (let t = 0; t < 2500; t++) {
      sim.step();
      bots.tick();
      for (const u of live(sim, me)) if (u.y >= 78 && u.y < 87 && u.x >= 38 && u.x < 41) inPass = true;
      if (viaAt < 0 && bots.phase(me) !== 'via') viaAt = t;
      if (fightAt < 0 && bots.phase(me) === 'fight') fightAt = t;
    }
    expect(inPass).toBe(true);
    expect(viaAt).toBeGreaterThan(0);
    expect(fightAt).toBeGreaterThan(viaAt);
    expect(live(sim, foe)).toHaveLength(0);
  });
});
