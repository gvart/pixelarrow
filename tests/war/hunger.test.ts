/**
 * W-60 hunger (src/war/sim/food.ts): stages and their mild effects, eating from the pack and from a store near.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { blow, HUNGER, hungerStage, pace } from '../../src/war/sim/food';
import { amount, perLoad, put } from '../../src/war/sim/holders';
import { CARRY } from '../../src/war/sim/economy';
import type { Snapshot, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const menOf = (snap: Snapshot, squad: number) => snap.squads[squad].units.map((id) => snap.units[id]).filter((u) => u.state !== 'dead');

describe('W-60 hunger stages', () => {
  it('fed, hungry, starving: mild steps on pace and blows', () => {
    expect([hungerStage(100), hungerStage(HUNGER.hungry), hungerStage(HUNGER.hungry - 1), hungerStage(HUNGER.starving), hungerStage(HUNGER.starving - 1), hungerStage(0)]).toEqual([0, 0, 1, 1, 2, 2]);
    expect(pace(100)).toBe(1);
    expect(pace(30)).toBeCloseTo(0.9);
    expect(blow(30)).toBeCloseTo(0.9);
    expect(pace(5)).toBeCloseTo(0.75);
    expect(blow(5)).toBeCloseTo(0.75);
    // full to hungry takes a good while (minutes, not seconds)
    expect((HUNGER.max - HUNGER.hungry) / HUNGER.decay / 60).toBeGreaterThan(15);
  });

  it('every man of a player carries a satiety on the snapshot; it runs down; the wild has none', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('a', 0, 'hoplite', 2, 20, 20);
    run(sim, 600);
    const us = menOf(sim.snapshot(), s);
    expect(us[0].sat).toBeLessThan(100);
    expect(us[0].sat).toBeGreaterThan(95);
  });

  it('a hungry squad marches slower, a starving one slower still', () => {
    const far = (sat: number) => {
      const sim = createSim(flat(96), 3);
      const s = sim.spawnSquad('a', 0, 'hoplite', 4, 10, 48);
      sim.setSatiety(sim.snapshot().squads[s].units, sat);
      sim.order({ kind: 'move', squad: s, x: 90, y: 48 });
      run(sim, 150);
      const us = menOf(sim.snapshot(), s);
      return us.reduce((a, u) => a + u.x, 0) / us.length - 10;
    };
    const fed = far(100), hungry = far(30), starving = far(5);
    expect(hungry).toBeLessThan(fed * 0.95);
    expect(starving).toBeLessThan(hungry * 0.92);
    expect(starving).toBeGreaterThan(fed * 0.6); // mild: never a crawl
  });

  it('a starving man hits softer', () => {
    const dealt = (sat: number) => {
      const sim = createSim(flat(), 5);
      const a = sim.spawnSquad('a', 0, 'hoplite', 4, 30, 30);
      const b = sim.spawnSquad('b', 1, 'hoplite', 4, 31.5, 30);
      sim.setSatiety(sim.snapshot().squads[a].units, sat);
      sim.order({ kind: 'attack', squad: a, target: b });
      sim.order({ kind: 'hold', squad: b });
      run(sim, 120);
      return menOf(sim.snapshot(), b).reduce((x, u) => x + (u.maxHp - u.hp), 0) + (4 - menOf(sim.snapshot(), b).length) * 100;
    };
    expect(dealt(5)).toBeLessThan(dealt(100));
  });

  it('starving costs health slowly but never kills', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('a', 0, 'hoplite', 3, 20, 20);
    sim.setSatiety(sim.snapshot().squads[s].units, 0);
    run(sim, 300);
    const mid = menOf(sim.snapshot(), s)[0];
    expect(mid.hp).toBeLessThan(mid.maxHp);
    expect(mid.hp).toBeGreaterThan(mid.maxHp * 0.9); // slowly
    run(sim, 6000);
    const us = menOf(sim.snapshot(), s);
    expect(us.length).toBe(3);
    for (const u of us) expect(u.hp).toBeCloseTo(u.maxHp * HUNGER.floor, 0);
  });
});

describe('W-60 eating', () => {
  it('rations weigh half a plain food', () => {
    expect(perLoad('ration')).toBe(2 * CARRY);
    expect(perLoad('food')).toBe(CARRY);
    expect(HUNGER.ration).toBe(2 * HUNGER.food);
  });

  it('a man eats from his pack: a ration before plain food', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('a', 0, 'hoplite', 1, 20, 20);
    const pack = sim.cargo({ squad: s })!.slots[0].hold;
    put(pack, 'ration', 2, 't');
    put(pack, 'food', 2, 't');
    const id = sim.snapshot().squads[s].units[0];
    sim.setSatiety([id], 30);
    run(sim, HUNGER.every + 1);
    expect(sim.snapshot().units[id].sat).toBeGreaterThanOrEqual(30 + HUNGER.ration - 1);
    expect(amount(pack, 'ration')).toBe(1);
    expect(amount(pack, 'food')).toBe(2);
    sim.setSatiety([id], 30);
    run(sim, HUNGER.every);
    expect(amount(pack, 'ration')).toBe(0);
    sim.setSatiety([id], 30);
    run(sim, HUNGER.every);
    expect(amount(pack, 'food')).toBe(1);
    expect(sim.snapshot().units[id].sat).toBeGreaterThanOrEqual(30 + HUNGER.food - 1);
  });

  it('a man eats from a store of his team close by, not from one far off', () => {
    const sim = createSim(flat(), 1);
    sim.claim(0, 30, 30, 30);
    const b = sim.spawnSquad('a', 0, 'militia', 12, 34, 34);
    sim.order({ kind: 'placeBuilding', squad: b, type: 'camp', x: 30, y: 30 });
    run(sim, 2000, () => sim.snapshot().buildings!.find((x) => x.id === 0)?.state === 'done');
    sim.order({ kind: 'move', squad: b, x: 4, y: 60 });
    run(sim, 400);
    const store = sim.cargo({ building: 0 })!.slots[0].hold;
    put(store, 'food', 8 + 2 * HUNGER.kit * HUNGER.packFood, 't'); // W-80: each man near packs his kit from it first
    const near = sim.spawnSquad('a', 0, 'hoplite', 2, 33, 33);
    const away = sim.spawnSquad('a', 0, 'hoplite', 2, 55, 55);
    const ids = [...sim.snapshot().squads[near].units, ...sim.snapshot().squads[away].units];
    sim.setSatiety(ids, 30);
    run(sim, HUNGER.every + 1);
    const snap = sim.snapshot();
    for (const id of snap.squads[near].units) expect(snap.units[id].sat).toBeGreaterThan(50);
    for (const id of snap.squads[away].units) expect(snap.units[id].sat).toBeLessThan(31);
    expect(amount(store, 'food')).toBe(8);
  });
});
