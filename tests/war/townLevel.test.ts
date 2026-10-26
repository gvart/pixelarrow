/**
 * W-61 town level (src/war/sim/townLevel.ts, docs/WAR.md "Town level"): a team's town levels up from variety, stone
 * and closed walls; each level's perks reach its men and things inside. Seeded, on flat grass.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { levelOf, nextNeeds, TOWN_PERKS } from '../../src/war/sim/townLevel';
import { HUNGER } from '../../src/war/sim/food';
import type { BuildingType, RegionData, WarBuildSim } from '../../src/war/types';

const N = 64;
function region(): RegionData {
  return { id: 't', name: 't', w: N, h: N, height: Array(N * N).fill(1), terrain: Array(N * N).fill('grass'), water: Array(N * N).fill(0), entries: [], noBuild: [] };
}
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const town = (sim: WarBuildSim, team = 0) => sim.townLevels(true).find((t) => t.team === team);

/** Place and finish at once (dev finishSite). */
function put(sim: WarBuildSim, type: BuildingType, x: number, y: number, team = 0) {
  const before = bs(sim).length;
  sim.order({ kind: 'placeBuilding', team, type, x, y });
  sim.step();
  for (const b of bs(sim).filter((b) => b.id >= before)) sim.finishSite(b.id);
}
function wall(sim: WarBuildSim, material: 'wood' | 'stone', points: number[], team = 0) {
  const before = bs(sim).length;
  sim.order({ kind: 'placeWall', team, material, points, inside: [32, 32] });
  sim.step();
  for (const b of bs(sim).filter((b) => b.id >= before)) sim.finishSite(b.id);
  sim.step();
}

function camp(seed = 1): WarBuildSim {
  const sim = createSim(region(), seed);
  sim.claim(0, 32, 32, 30);
  sim.addStock(0, 'wood', 99999);
  sim.addStock(0, 'stone', 99999);
  put(sim, 'camp', 32, 32);
  return sim;
}

/** A stone-heavy village of 8 kinds inside x,y 22..42. */
function village(sim: WarBuildSim) {
  put(sim, 'storehouse', 27, 27);
  put(sim, 'farm', 37, 27);
  put(sim, 'forge', 27, 37);
  put(sim, 'cookhouse', 37, 37);
  put(sim, 'pitchKiln', 32, 26);
  put(sim, 'infirmary', 32, 38);
  put(sim, 'olivePress', 26, 32);
}

describe('town level (W-61)', () => {
  it('a camp is level 1; no store, no town', () => {
    const sim = createSim(region(), 1);
    expect(sim.townLevels(true)).toEqual([]);
    const c = camp();
    expect(town(c)).toMatchObject({ level: 1, name: 'Camp', variety: 1 });
  });

  it('variety and stone level it up; walls closed all round make it a Town; all stone a City', () => {
    const sim = camp(2);
    village(sim);
    let t = town(sim)!;
    expect(t.variety).toBe(8);
    expect(t.stone).toBeGreaterThan(0.25);
    expect(t.level).toBe(3); // walls not closed yet
    expect(t.next).toContain('walls closed all round');
    // a stone ring round the town (x, y 20..44), with a stone gate on its south side
    wall(sim, 'stone', [20.5, 20.5, 44.5, 20.5, 44.5, 44.5, 20.5, 44.5, 20.5, 20.5]);
    t = town(sim)!;
    expect(t.closed).toBe(true);
    expect(t.stoneWalls).toBe(true);
    expect(t.level).toBeGreaterThanOrEqual(4);
    put(sim, 'workshop', 36, 32);
    put(sim, 'chest', 30, 30);
    t = town(sim)!;
    expect(t.variety).toBeGreaterThanOrEqual(10);
    expect(t.level).toBe(t.stone >= 0.6 ? 5 : 4);
  });

  it('a gap in the wall is no closed town', () => {
    const sim = camp(3);
    village(sim);
    wall(sim, 'stone', [20.5, 20.5, 44.5, 20.5, 44.5, 44.5, 20.5, 44.5, 20.5, 30.5]); // west side open from y 30 to 20
    expect(town(sim)!.closed).toBe(false);
    expect(town(sim)!.level).toBe(3);
  });

  it('levelOf and nextNeeds follow the table', () => {
    expect(levelOf({ variety: 4, stone: 0, closed: false, stoneWalls: false })).toBe(2);
    expect(levelOf({ variety: 6, stone: 0.3, closed: false, stoneWalls: false })).toBe(3);
    expect(levelOf({ variety: 9, stone: 0.5, closed: true, stoneWalls: false })).toBe(4);
    expect(levelOf({ variety: 12, stone: 0.7, closed: true, stoneWalls: true })).toBe(5);
    expect(levelOf({ variety: 12, stone: 0.7, closed: false, stoneWalls: true })).toBe(3);
    expect(nextNeeds({ level: 2, variety: 5, stone: 0.1, closed: false, stoneWalls: false })).toEqual(['1 more kind of building', '25% stone (now 10%)']);
  });

  it('perks: men inside a levelled town get hungry slower than men outside it', () => {
    const sim = camp(4);
    village(sim);
    for (let t = 0; t < 60; t++) sim.step(); // measured
    expect(town(sim)!.level).toBe(3);
    const inside = sim.spawnSquad('a', 0, 'militia', 1, 32, 30);
    const out = sim.spawnSquad('b', 0, 'militia', 1, 60, 60);
    for (let t = 0; t < 1200; t++) sim.step();
    const sat = (q: number) => sim.snapshot().units.find((u) => u.squad === q)!.sat!;
    const lost = (q: number) => HUNGER.max - sat(q);
    expect(lost(inside)).toBeLessThan(lost(out));
    expect(lost(inside) / lost(out)).toBeCloseTo(TOWN_PERKS[3].hunger, 1);
  });

  it('perks: repairs go faster in a levelled town', () => {
    const mendTicks = (lvl: boolean) => {
      const sim = camp(5);
      if (lvl) village(sim);
      put(sim, 'woodTower', 32, 44);
      const id = bs(sim).find((b) => b.type === 'woodTower')!.id;
      for (let t = 0; t < 60; t++) sim.step();
      sim.damageBuilding(id, 600);
      const s = sim.spawnSquad('w', 0, 'militia', 4, 32, 47);
      sim.order({ kind: 'repairBuilding', squad: s, building: id });
      for (let t = 1; t < 6000; t++) {
        sim.step();
        const b = bs(sim).find((x) => x.id === id)!;
        if (b.hp >= b.maxHp - 1e-6) return t;
      }
      return 6000;
    };
    const slow = mendTicks(false), fast = mendTicks(true);
    expect(slow).toBeLessThan(6000);
    expect(fast).toBeLessThan(slow);
  });

  it('labour is logged by owner and site; resumes the same after save and restore', () => {
    const sim = camp(6);
    const before = bs(sim).length;
    sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 27, y: 27 });
    sim.step();
    const site = bs(sim).find((b) => b.id >= before)!.id;
    const s = sim.spawnSquad('p:7', 0, 'militia', 4, 27, 31);
    sim.order({ kind: 'build', squad: s, site });
    for (let t = 0; t < 600; t++) sim.step();
    const log = sim.takeLabour();
    const mine = log.filter((l) => l.owner === 'p:7' && l.site === site).reduce((a, l) => a + l.secs, 0);
    expect(mine).toBeGreaterThan(0);
    expect(sim.takeLabour()).toEqual([]);
    const st = sim.exportState();
    const back = createSim(region(), 6);
    back.importState(st);
    for (let t = 0; t < 100; t++) (sim.step(), back.step());
    expect(JSON.stringify(back.townLevels())).toBe(JSON.stringify(sim.townLevels()));
  });
});
