/**
 * W-63 shared settlements, the sim side: town levels keyed by centre piece (a team may hold several towns in a region,
 * each levelling on its own), turnSquad (a squad changes banner mid-fight) and rebanner (a town's pieces and stores go to
 * another team). Seeded, on flat grass.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { TOWN_PERKS } from '../../src/war/sim/townLevel';
import { HUNGER } from '../../src/war/sim/food';
import type { BuildingType, RegionData, WarBuildSim } from '../../src/war/types';

const W = 112, H = 64;
function region(): RegionData {
  return { id: 's', name: 's', w: W, h: H, height: Array(W * H).fill(1), terrain: Array(W * H).fill('grass'), water: Array(W * H).fill(0), entries: [], noBuild: [] };
}
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;

/** Place and finish at once (dev finishSite). */
function put(sim: WarBuildSim, type: BuildingType, x: number, y: number, team = 0) {
  const before = bs(sim).length;
  sim.order({ kind: 'placeBuilding', team, type, x, y });
  sim.step();
  for (const b of bs(sim).filter((b) => b.id >= before)) sim.finishSite(b.id);
}
const campAt = (sim: WarBuildSim, x: number, y: number, team = 0) => {
  put(sim, 'camp', x, y, team);
  return bs(sim).filter((b) => b.type === 'camp' && b.team === team).at(-1)!.id;
};
/** Seven more kinds round (x,y): a village (level 3) with its camp. */
function village(sim: WarBuildSim, x: number, y: number, team = 0) {
  put(sim, 'storehouse', x - 5, y - 5, team);
  put(sim, 'farm', x + 5, y - 5, team);
  put(sim, 'forge', x - 5, y + 5, team);
  put(sim, 'cookhouse', x + 5, y + 5, team);
  put(sim, 'pitchKiln', x, y - 6, team);
  put(sim, 'infirmary', x, y + 6, team);
  put(sim, 'olivePress', x - 6, y, team);
}
/** Team 0 holds two towns: A (a village round (28,32)) and B (a bare camp round (84,32)). */
function twoTowns(seed = 1) {
  const sim = createSim(region(), seed);
  sim.claim(0, 28, 32, 30);
  sim.claim(0, 84, 32, 30);
  sim.addStock(0, 'wood', 99999);
  sim.addStock(0, 'stone', 99999);
  const a = campAt(sim, 28, 32);
  village(sim, 28, 32);
  const b = campAt(sim, 84, 32);
  return { sim, a, b };
}

describe('town levels by centre (W-63)', () => {
  it('two towns of one team level separately, keyed by their centre piece', () => {
    const { sim, a, b } = twoTowns();
    const tl = sim.townLevels(true);
    expect(tl.map((t) => t.id)).toEqual([a, b]);
    expect(tl.find((t) => t.id === a)).toMatchObject({ team: 0, level: 3, variety: 8, x: 28, y: 32 });
    expect(tl.find((t) => t.id === b)).toMatchObject({ team: 0, level: 1, variety: 1, x: 84, y: 32 });
  });

  it('perks apply per town: men in the village get hungry slower than men in the camp', () => {
    const { sim } = twoTowns(2);
    for (let t = 0; t < 60; t++) sim.step(); // measured
    const inA = sim.spawnSquad('a', 0, 'militia', 1, 28, 29);
    const inB = sim.spawnSquad('b', 0, 'militia', 1, 84, 29);
    for (let t = 0; t < 1200; t++) sim.step();
    const lost = (q: number) => HUNGER.max - sim.snapshot().units.find((u) => u.squad === q)!.sat!;
    expect(lost(inA) / lost(inB)).toBeCloseTo(TOWN_PERKS[3].hunger, 1);
  });

  it('a piece in reach of two own centres counts for the nearer only', () => {
    const sim = createSim(region(), 3);
    sim.claim(0, 40, 32, 40);
    sim.addStock(0, 'wood', 99999);
    sim.addStock(0, 'stone', 99999);
    const a = campAt(sim, 30, 32), b = campAt(sim, 50, 32);
    put(sim, 'farm', 34, 26); // nearer a
    put(sim, 'forge', 46, 26); // nearer b
    put(sim, 'cookhouse', 47, 38); // nearer b
    const tl = sim.townLevels(true);
    expect(tl.find((t) => t.id === a)!.variety).toBe(2);
    expect(tl.find((t) => t.id === b)!.variety).toBe(3);
  });
});
