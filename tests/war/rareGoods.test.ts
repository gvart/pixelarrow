/** M7e rare goods (docs/WAR.md "Rare goods", "Landmarks"): goods, landmark nodes for the holder only, boss drops, restores. */
import { describe, expect, it } from 'vitest';
import { bossGoods, WAR_BOSSES } from '../../src/data/warBosses';
import { LANDMARKS, RARE_GOODS, RARE_NODE, restoreCost } from '../../src/data/warLandmarks';
import { GOODS } from '../../src/war/net/protocol';
import { createSim } from '../../src/war/sim';
import { RESOURCE_NODES } from '../../src/war/sim/economy';
import { amount, move, newHold, put } from '../../src/war/sim/holders';
import type { RegionData, WarBuildSim } from '../../src/war/types';

const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};
const region = (extra: Partial<RegionData> = {}, n = 64): RegionData => ({
  id: 'krios', name: 'k', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [],
  objects: [{ id: 'landmark/bone-pit', x: 30.5, y: 30.5 }, { id: 'oak', x: 50.5, y: 50.5 }], claimPoints: [{ x: 24.5, y: 24.5, lairs: [], r: 20 }], ...extra,
});

describe('M7e goods and sources', () => {
  it('six rare goods travel the wire; each landmark node is 1 a 10 min, at most 20 (the slag heap once)', () => {
    for (const g of RARE_GOODS) expect(GOODS).toContain(g);
    const rare = Object.entries(RESOURCE_NODES).filter(([, d]) => d.rare);
    expect(new Set(rare.map(([, d]) => d.res))).toEqual(new Set(RARE_GOODS));
    for (const [id, d] of rare) {
      expect(d.max).toBe(20);
      expect(d.regrow).toBe(id === 'landmark/slag-heap' ? 0 : 1 / 600);
    }
  });

  it('the landmark bosses drop their rare good into the pile', () => {
    expect(bossGoods('drakon')).toEqual([{ r: 'dragonbone', n: 20 }]);
    expect(bossGoods('scylla')).toEqual([{ r: 'nereidPearl', n: 15 }]);
    expect(bossGoods('moor_bear')).toEqual([]);
    const dropped = new Set(WAR_BOSSES.flatMap((b) => bossGoods(b.id).map((g) => g.r)));
    expect(dropped).toEqual(new Set(RARE_GOODS));
  });

  it('every restore needs a rare good from another landmark', () => {
    for (const l of LANDMARKS) {
      const foreign = Object.keys(l.restore.rare).filter((g) => g !== l.rare);
      expect(foreign.length, l.id).toBeGreaterThan(0);
      expect(restoreCost(l.id)).toMatchObject(l.restore.bulk);
    }
  });

  it('a rare good keeps its origin stamp wherever it is carried', () => {
    const a = newHold(), b = newHold();
    put(a, 'starIron', 10, 'saddle');
    move(a, b, 1);
    expect(b.lots).toEqual([{ r: 'starIron', n: 10, o: 'saddle' }]);
    expect(amount(b, 'starIron')).toBe(10);
  });
});

describe('M7e landmark nodes in the sim', () => {
  it('no depth yield on a rare node; ordinary nodes scale', () => {
    const nodes = createSim(region(), 1).resourceNodes();
    expect(nodes[0]).toMatchObject({ res: 'dragonbone', max: RARE_NODE.max, rare: true });
    expect(nodes[1].max).toBe(40 * 2); // krios: depth 4
  });

  it('only the holder of the region gathers it; its goods come in stamped with the region', () => {
    const sim = createSim(region(), 2);
    const s = sim.spawnSquad('a', 0, 'militia', 6, 26, 26);
    sim.order({ kind: 'gather', squad: s, node: 0 });
    run(sim, 1);
    expect(sim.snapshot().squads[s].order).not.toBe('gather');
    sim.claim(0, 24.5, 24.5, 20);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 24, y: 30 });
    run(sim, 700);
    sim.order({ kind: 'gather', squad: s, node: 0 });
    run(sim, 1);
    expect(sim.snapshot().squads[s].order).toBe('gather');
    run(sim, 1500);
    const camp = sim.snapshot().buildings!.find((b) => b.type === 'camp')!;
    expect(camp.goods?.dragonbone).toBeGreaterThan(0);
    expect(sim.cargo({ building: camp.id })!.slots[0].hold.lots.find((l) => l.r === 'dragonbone')!.o).toBe('krios');
    // another alliance takes the point: the node shuts to the old holder
    sim.claim(1, 24.5, 24.5, 20);
    run(sim, 20);
    expect(sim.snapshot().units.filter((u) => sim.snapshot().squads[s].units.includes(u.id) && u.state === 'gather')).toHaveLength(0);
  });

  it('regrows 1 a 10 min up to its cap', () => {
    const sim = createSim(region(), 3);
    sim.claim(0, 24.5, 24.5, 20);
    const s = sim.spawnSquad('a', 0, 'militia', 6, 26, 26);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 24, y: 30 });
    run(sim, 700);
    sim.order({ kind: 'gather', squad: s, node: 0 });
    run(sim, 3000);
    sim.order({ kind: 'stopWork', squad: s });
    const left = sim.resourceNodes()[0].amount;
    expect(left).toBeLessThan(RARE_NODE.max);
    run(sim, 6000);
    expect(sim.resourceNodes()[0].amount).toBeCloseTo(Math.min(RARE_NODE.max, left + 1), 1);
    run(sim, 600 * 10 * 25);
    expect(sim.resourceNodes()[0].amount).toBe(RARE_NODE.max);
  });
});
