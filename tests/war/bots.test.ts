import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { WarSim } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);
const [FX, FY] = SPOTS.fieldE; // open flat field east of the river

const live = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead');
const centre = (sim: WarSim, squad: number) => {
  const us = live(sim, squad);
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length];
};

describe('bots', () => {
  it('attack-move fights the enemy met on the way, then reaches the point', () => {
    const sim = createSim(ridge, 1);
    const bots = createBots(sim);
    const me = sim.spawnSquad('bot', 0, 'militia', 20, FX - 15, FY);
    const foe = sim.spawnSquad('e', 1, 'militia', 6, FX, FY + 1);
    bots.set(me, { kind: 'attackMove', x: FX + 18, y: FY });
    let fought = false;
    for (let t = 0; t < 1500; t++) {
      sim.step();
      bots.tick();
      if (bots.phase(me) === 'fight') fought = true;
    }
    expect(fought).toBe(true);
    expect(live(sim, foe)).toHaveLength(0);
    const [x, y] = centre(sim, me);
    expect(Math.hypot(x - FX - 18, y - FY)).toBeLessThan(4);
    expect(bots.phase(me)).toBe('done');
  });

  it('hold stays put while enemies are far, engages those that come near, then walks back', () => {
    const sim = createSim(ridge, 2);
    const bots = createBots(sim);
    const me = sim.spawnSquad('bot', 0, 'militia', 20, FX - 10, FY);
    const far = sim.spawnSquad('e', 1, 'militia', 10, FX + 10, FY);
    bots.set(me, { kind: 'hold', x: FX - 10, y: FY });
    for (let t = 0; t < 200; t++) sim.step(), bots.tick();
    expect(bots.phase(me)).toBe('hold');
    expect(Math.hypot(centre(sim, me)[0] - FX + 10, centre(sim, me)[1] - FY)).toBeLessThan(2);
    // the enemy walks up to the point
    sim.order({ kind: 'move', squad: far, x: FX - 5, y: FY });
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
    expect(Math.hypot(x - FX + 10, y - FY)).toBeLessThan(4);
  });

  it('flank goes through the chosen waypoint before it strikes', () => {
    const sim = createSim(ridge, 3);
    const bots = createBots(sim);
    const [sx, sy] = SPOTS.passS;
    const me = sim.spawnSquad('bot', 0, 'militia', 20, ...SPOTS.passN);
    const foe = sim.spawnSquad('e', 1, 'militia', 8, sx - 8, sy + 6);
    sim.order({ kind: 'formation', squad: me, shape: 'column' });
    bots.set(me, { kind: 'flank', via: [sx, sy], x: sx - 8, y: sy + 6 });
    let viaAt = -1;
    let fightAt = -1;
    let inPass = false;
    for (let t = 0; t < 2500; t++) {
      sim.step();
      bots.tick();
      for (const u of live(sim, me)) if (Math.hypot(u.x - SPOTS.passSaddle[0], u.y - SPOTS.passSaddle[1]) < 3) inPass = true;
      if (viaAt < 0 && bots.phase(me) !== 'via') viaAt = t;
      if (fightAt < 0 && bots.phase(me) === 'fight') fightAt = t;
    }
    expect(inPass).toBe(true);
    expect(viaAt).toBeGreaterThan(0);
    expect(fightAt).toBeGreaterThan(viaAt);
    expect(live(sim, foe)).toHaveLength(0);
  });
});
