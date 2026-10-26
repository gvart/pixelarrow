/**
 * W-60 the store is local (src/war/view/hud/chest.ts): the chest's Town store tab opens only next to a store of yours
 * and shows that store's goods, never a network or team total; the sim's stores hold their own goods.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { put } from '../../src/war/sim/holders';
import { STORE_NEAR, storeNear } from '../../src/war/view/hud/chest';
import type { WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};

describe('W-60 the town store is local', () => {
  it('next to one store: only its goods; away from every store: no tab; never the sum of the network', () => {
    const sim = createSim(flat(96), 1);
    sim.claim(0, 30, 30, 40);
    const b = sim.spawnSquad('a', 0, 'militia', 6, 24, 36), d = sim.spawnSquad('a', 0, 'militia', 6, 44, 36);
    sim.order({ kind: 'placeBuilding', squad: b, type: 'camp', x: 24, y: 30 });
    sim.order({ kind: 'placeBuilding', squad: d, type: 'camp', x: 44, y: 30 });
    run(sim, 6000, () => (sim.snapshot().buildings ?? []).filter((x) => x.type === 'camp' && x.state === 'done').length === 2);
    const [a, c] = sim.snapshot().buildings!.filter((x) => x.type === 'camp');
    expect([a.state, c.state]).toEqual(['done', 'done']);
    put(sim.cargo({ building: a.id })!.slots[0].hold, 'food', 10, 't');
    put(sim.cargo({ building: c.id })!.slots[0].hold, 'ration', 6, 't');
    sim.addStock(0, 'coin', 500); // the home strongroom: never in a store's tab
    run(sim, 1);
    const cur = sim.snapshot();
    // the team total still holds everything (the sim spends from the network) ...
    expect(cur.stock![0]).toMatchObject({ food: 10, ration: 6, coin: 500 });
    // ... but by store A only A's goods show, by C only C's, between and far off none
    expect(storeNear(cur, 0, a.x + 2, a.y + 3)?.goods).toEqual({ food: 10 });
    expect(storeNear(cur, 0, c.x - 2, c.y + 3)?.goods).toEqual({ ration: 6 });
    expect(storeNear(cur, 0, (a.x + c.x) / 2, a.y - STORE_NEAR - 2)).toBeNull();
    expect(storeNear(cur, 0, 80, 80)).toBeNull();
    // a foe's store never opens your tab
    expect(storeNear(cur, 1, a.x, a.y)).toBeNull();
  });
});
