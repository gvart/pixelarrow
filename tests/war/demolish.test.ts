/** Demolish (src/war/sim/works.ts demolish): an own finished building comes down after a short tear-down, a quarter of its materials back. */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS, DEMOLISH } from '../../src/war/sim/economy';
import { put } from '../../src/war/sim/holders';
import type { RegionData, WarBuildSim } from '../../src/war/types';

function flat(n = 48): RegionData {
  return { id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [] };
}
function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id);
const wood = (sim: WarBuildSim) => sim.snapshot().stock![0].wood ?? 0;

/** A done camp (0) and a done storehouse (1) of team 0. */
function town() {
  const sim = createSim(flat(), 7);
  sim.claim(0, 20, 20, 30);
  sim.addStock(0, 'wood', 200);
  sim.addStock(0, 'stone', 200);
  const s = sim.spawnSquad('a', 0, 'militia', 10, 24, 24);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 20 });
  run(sim, 2000, () => building(sim, 0)?.state === 'done');
  sim.order({ kind: 'placeBuilding', squad: s, type: 'storehouse', x: 27, y: 20 });
  run(sim, 4000, () => building(sim, 1)?.state === 'done');
  expect(building(sim, 1)?.state).toBe('done');
  return { sim, s };
}

describe('demolish', () => {
  it('tears a finished own building down after DEMOLISH.ticks and refunds a quarter of its materials', () => {
    const { sim } = town();
    run(sim, 100); // the builders put the rest of their loads away
    put(sim.cargo({ building: 1 })!.slots[0].hold, 'wood', 30, 't'); // goods in the storehouse move to the camp
    const w0 = wood(sim), cost = BUILDINGS.storehouse.cost.wood ?? 0;
    expect(cost).toBeGreaterThan(0);
    sim.order({ kind: 'demolish', building: 1, team: 0 });
    run(sim, 2);
    expect(building(sim, 1)?.razing).toBeGreaterThanOrEqual(0);
    expect(building(sim, 1)?.state).toBe('done'); // still standing while the men tear it down
    const t = run(sim, 200, () => !building(sim, 1));
    expect(t).toBeLessThanOrEqual(DEMOLISH.ticks + 2);
    expect(wood(sim)).toBeCloseTo(w0 + cost * DEMOLISH.refund, 6);
    expect(sim.snapshot().buildings!.map((b) => b.id)).toEqual([0]);
    expect(sim.checkPlacement(0, 'storehouse', 27, 20).ok).toBe(true); // the ground is free again, no rubble
  });

  it('refuses a foe\'s building, an unfinished site and a second order', () => {
    const { sim, s } = town();
    sim.order({ kind: 'demolish', building: 1, team: 1 });
    run(sim, 2);
    expect(building(sim, 1)?.razing).toBeUndefined();
    sim.order({ kind: 'placeBuilding', team: 0, type: 'outpost', x: 32, y: 30 });
    run(sim, 1);
    const site = sim.snapshot().buildings!.at(-1)!;
    expect(site.state).toBe('foundation');
    sim.order({ kind: 'demolish', building: site.id, team: 0 });
    run(sim, 2);
    expect(building(sim, site.id)?.razing).toBeUndefined();
    // ordered twice: the tear-down does not restart
    sim.order({ kind: 'demolish', building: 0, team: 0 });
    run(sim, 20);
    const r = building(sim, 0)!.razing!;
    sim.order({ kind: 'demolish', building: 0, team: 0 });
    run(sim, 2);
    expect(building(sim, 0)!.razing!).toBeGreaterThan(r);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});
