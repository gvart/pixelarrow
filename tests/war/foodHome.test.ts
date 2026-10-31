/**
 * W-80 food at home (src/war/sim/food.ts; docs/WAR.md "Food and hunger"): by a standing store of his team a soldier's
 * pack refills to HUNGER.kit rations (the store's rations, then HUNGER.packFood food a ration, from the store and then
 * the team's home strongroom, then the server's larder), and a hungry man there eats even when the store itself is
 * empty but the strongroom behind it is not. Away from a store nothing refills.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { HUNGER, hungerStage } from '../../src/war/sim/food';
import { amount, put } from '../../src/war/sim/holders';
import type { WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};

/** A flat field with a done camp (a store of team 0) at (30,30); the builders walk off. */
function withStore(): WarBuildSim {
  const sim = createSim(flat(), 1);
  sim.claim(0, 30, 30, 30);
  const b = sim.spawnSquad('a', 0, 'militia', 12, 34, 34);
  sim.order({ kind: 'placeBuilding', squad: b, type: 'camp', x: 30, y: 30 });
  run(sim, 2000, () => sim.snapshot().buildings!.find((x) => x.id === 0)?.state === 'done');
  sim.order({ kind: 'move', squad: b, x: 4, y: 60 });
  run(sim, 400);
  return sim;
}
const packs = (sim: WarBuildSim, squad: number) => sim.cargo({ squad })!.slots.map((x) => x.hold);

describe('W-80 food at home', () => {
  it('starving men by an empty store eat from the home strongroom behind it and march off with full packs', () => {
    const sim = withStore();
    sim.addStock(0, 'food', 280); // the playtest: 280 food in the strongroom, none in the store
    const s = sim.spawnSquad('b', 0, 'hoplite', 4, 33, 33);
    const ids = sim.snapshot().squads[s].units;
    sim.setSatiety(ids, 0);
    run(sim, HUNGER.every * 3);
    const snap = sim.snapshot();
    for (const id of ids) expect(hungerStage(snap.units[id].sat!)).toBe(0);
    for (const h of packs(sim, s)) expect(amount(h, 'ration')).toBe(HUNGER.kit);
    expect(snap.squads[s].meals).toBe(4 * HUNGER.kit);
    const eaten = 280 - (sim.goodsAt(0, 30, 30).food ?? 0);
    expect(eaten).toBeGreaterThanOrEqual(4 * HUNGER.kit * HUNGER.packFood);
  });

  it('the store packs its own rations first, then plain food at HUNGER.packFood a ration', () => {
    const sim = withStore();
    const store = sim.cargo({ building: 0 })!.slots[0].hold;
    put(store, 'ration', 3, 't');
    put(store, 'food', 9, 't');
    const s = sim.spawnSquad('b', 0, 'hoplite', 1, 33, 33);
    run(sim, HUNGER.every + 1);
    expect(amount(packs(sim, s)[0], 'ration')).toBe(3 + 4);
    expect(amount(store, 'ration')).toBe(0);
    expect(amount(store, 'food')).toBe(1);
  });

  it('the larder (the server: his strongroom online) fills what the store cannot; the owner and team are named', () => {
    const sim = withStore();
    const asked: [string, number, number][] = [];
    sim.setLarder((owner, team, want) => (asked.push([owner, team, want]), Math.min(want, 5)));
    const s = sim.spawnSquad('p:7', 0, 'hoplite', 1, 33, 33);
    run(sim, HUNGER.every + 1);
    expect(asked[0]).toEqual(['p:7', 0, HUNGER.kit]);
    expect(amount(packs(sim, s)[0], 'ration')).toBe(5);
  });

  it('away from a store nothing refills', () => {
    const sim = withStore();
    sim.addStock(0, 'food', 280);
    sim.setLarder(() => 99);
    const s = sim.spawnSquad('b', 0, 'hoplite', 2, 55, 55);
    const ids = sim.snapshot().squads[s].units;
    sim.setSatiety(ids, 0);
    run(sim, HUNGER.every * 3);
    for (const h of packs(sim, s)) expect(amount(h, 'ration')).toBe(0);
    expect(hungerStage(sim.snapshot().units[ids[0]].sat!)).toBe(2);
    const near = sim.spawnSquad('c', 0, 'hoplite', 2, 33, 33);
    run(sim, HUNGER.every * 2);
    expect(packs(sim, near).map((h) => amount(h, 'ration'))).toEqual([HUNGER.kit, HUNGER.kit]);
  });
});
