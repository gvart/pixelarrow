import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { hashString } from '../../src/sim/rng';
import type { Order, WarSim } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);
const K = ridge.w / 256; // features are authored on a 256 map and scale with it
const [FX, FY] = SPOTS.fieldE; // open flat field east of the river
const tile = (x: number, y: number) => Math.floor(y) * ridge.w + Math.floor(x);
const blocked = (x: number, y: number) => ridge.terrain[tile(x, y)] === 'rock' || ridge.water[tile(x, y)] === 2;

function run(sim: WarSim, ticks: number, each?: () => void) {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    each?.();
  }
}

const centre = (sim: WarSim, squad: number) => {
  const us = sim.snapshot().units.filter((u) => u.squad === squad);
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length];
};

describe('war sim', () => {
  it('marches a squad through the pass without stepping on rock or deep water', () => {
    const sim = createSim(ridge, 7);
    const s = sim.spawnSquad('a', 0, 'militia', 20, ...SPOTS.passN);
    sim.order({ kind: 'move', squad: s, x: SPOTS.passS[0], y: SPOTS.passS[1] });
    run(sim, 1600 * K, () => {
      for (const u of sim.snapshot().units) expect(blocked(u.x, u.y)).toBe(false);
    });
    for (const u of sim.snapshot().units) {
      expect(Math.hypot(u.x - SPOTS.passS[0], u.y - SPOTS.passS[1])).toBeLessThan(5);
      expect(u.state).toBe('idle');
    }
  });

  it('crosses the river at the ford', () => {
    const sim = createSim(ridge, 3);
    const s = sim.spawnSquad('a', 0, 'militia', 12, ...SPOTS.fordW);
    sim.order({ kind: 'formation', squad: s, shape: 'column' });
    sim.order({ kind: 'move', squad: s, x: SPOTS.fordE[0], y: SPOTS.fordE[1] });
    let forded = false;
    run(sim, 500, () => {
      for (const u of sim.snapshot().units) if (ridge.water[tile(u.x, u.y)] === 1) forded = true;
    });
    expect(forded).toBe(true);
    const [cx] = centre(sim, s);
    expect(cx).toBeGreaterThan(SPOTS.fordE[0] - 4);
  });

  it('formations change the squad footprint and units face the march', () => {
    const width = (shape: 'line' | 'column') => {
      const sim = createSim(ridge, 1);
      const s = sim.spawnSquad('a', 0, 'militia', 12, FX - 10, FY);
      sim.order({ kind: 'formation', squad: s, shape });
      sim.order({ kind: 'move', squad: s, x: FX + 10, y: FY }); // march east
      run(sim, 40);
      const mid = sim.snapshot().units.filter((u) => u.state === 'move');
      expect(mid.length).toBeGreaterThan(0);
      for (const u of mid) expect(Math.abs(u.facing)).toBeLessThan(1);
      run(sim, 300);
      const ys = sim.snapshot().units.map((u) => u.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const line = width('line');
    const column = width('column');
    expect(line).toBeGreaterThan(4); // 6 x 2
    expect(column).toBeLessThan(2.5); // 2 x 6
  });

  it('keeps units apart', () => {
    const sim = createSim(ridge, 5);
    sim.spawnSquad('a', 0, 'militia', 20, FX, FY + 10);
    sim.order({ kind: 'formation', squad: 0, shape: 'wedge' });
    run(sim, 100);
    const us = sim.snapshot().units;
    let close = 0;
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) if (Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y) < 0.4) close++;
    expect(close).toBe(0);
  });

  it('hold stops the march', () => {
    const sim = createSim(ridge, 2);
    const s = sim.spawnSquad('a', 0, 'militia', 10, FX - 10, FY);
    sim.order({ kind: 'move', squad: s, x: FX + 20, y: FY });
    run(sim, 30);
    sim.order({ kind: 'hold', squad: s });
    run(sim, 60);
    const [x0] = centre(sim, s);
    run(sim, 60);
    expect(centre(sim, s)[0]).toBeCloseTo(x0, 1);
    expect(sim.snapshot().squads[s].order).toBe('hold');
    expect(x0).toBeLessThan(FX);
  });

  it('attack walks to the target squad and engages it', () => {
    const sim = createSim(ridge, 2);
    const a = sim.spawnSquad('a', 0, 'militia', 10, FX - 15, FY);
    const b = sim.spawnSquad('b', 1, 'militia', 10, FX + 10, FY + 10);
    sim.order({ kind: 'attack', squad: a, target: b });
    run(sim, 300);
    const [ax, ay] = centre(sim, a);
    expect(Math.hypot(ax - FX - 10, ay - FY - 10)).toBeLessThan(6);
    expect(sim.snapshot().units.some((u) => u.squad === a && u.state === 'attack')).toBe(true);
  });

  it('is deterministic: same seed and orders give the same snapshot hash', () => {
    const play = (seed: number) => {
      const sim = createSim(ridge, seed);
      const orders: Order[] = [];
      for (let k = 0; k < 6; k++) {
        const s = sim.spawnSquad(`p${k}`, k % 2, 'militia', 20, FX + (k % 2 ? 15 : -15), FY - 20 + k * 8);
        orders.push({ kind: 'formation', squad: s, shape: (['line', 'column', 'wedge', 'loose'] as const)[k % 4] });
        orders.push({ kind: 'move', squad: s, x: FX + (k % 2 ? -15 : 15), y: FY + 20 - k * 6 });
      }
      orders.forEach((o) => sim.order(o));
      run(sim, 400);
      return hashString(JSON.stringify(sim.snapshot()));
    };
    expect(play(11)).toBe(play(11));
    expect(play(11)).not.toBe(play(12));
  });
});
