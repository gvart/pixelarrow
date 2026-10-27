/**
 * W-63 shared settlements, the sim side: town levels keyed by centre piece (a team may hold several towns in a region,
 * each levelling on its own), turnSquad (a squad changes banner mid-fight) and rebanner (a town's pieces and stores go to
 * another team). Seeded, on flat grass.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { TOWN_PERKS } from '../../src/war/sim/townLevel';
import { HUNGER } from '../../src/war/sim/food';
import { put as putGoods } from '../../src/war/sim/holders';
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

const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};
const hpOf = (sim: WarBuildSim, q: number) => {
  const s = sim.snapshot();
  return s.squads[q].units.reduce((a, id) => a + s.units[id].hp, 0);
};

describe('turnSquad (W-63)', () => {
  it('a garrison and the town men it turned fight each other', () => {
    const { sim } = twoTowns(4);
    const garrison = sim.spawnSquad('lord', 0, 'hoplite', 6, 28, 26);
    const men = sim.spawnSquad('rebel', 0, 'militia', 6, 28, 29);
    run(sim, 60);
    const g0 = hpOf(sim, garrison), m0 = hpOf(sim, men);
    expect(sim.turnSquad(men, 0)).toBe(false); // already of that team
    expect(sim.turnSquad(men, 1)).toBe(true);
    expect(sim.snapshot().squads[men].team).toBe(1);
    run(sim, 300);
    expect(hpOf(sim, garrison)).toBeLessThan(g0);
    expect(hpOf(sim, men)).toBeLessThan(m0);
  });

  it('foes now friends stop: an attack on it drops, its own attack drops (as an order)', () => {
    const { sim } = twoTowns(5);
    const a = sim.spawnSquad('a', 0, 'hoplite', 4, 28, 26);
    const b = sim.spawnSquad('b', 1, 'militia', 4, 40, 26);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 5);
    sim.order({ kind: 'turnSquad', squad: b, team: 0 });
    run(sim, 1);
    const s = sim.snapshot();
    expect(s.squads[b].team).toBe(0);
    expect(s.squads[a].order).toBe('hold');
    expect(s.squads[b].order).toBe('hold');
    const hp = hpOf(sim, a) + hpOf(sim, b);
    run(sim, 200);
    expect(hpOf(sim, a) + hpOf(sim, b)).toBeGreaterThanOrEqual(hp - 1e-9);
  });
});

describe('rebanner (W-63)', () => {
  it("the town's pieces and stores go to the new team; the other town stays", () => {
    const { sim, a, b } = twoTowns(7);
    run(sim, 1);
    const store = bs(sim).find((x) => x.type === 'storehouse')!;
    putGoods(sim.cargo({ building: store.id })!.slots[0].hold, 'iron', 40, 's');
    expect(sim.goodsAt(1, store.x, store.y).iron ?? 0).toBe(0);
    const ids = sim.rebanner(a, 1);
    expect(ids).toContain(a);
    expect(ids).toContain(store.id);
    expect(ids).not.toContain(b);
    expect([...ids].sort((x, y) => x - y)).toEqual(ids);
    const after = bs(sim);
    for (const id of ids) expect(after.find((x) => x.id === id)!.team).toBe(1);
    expect(after.find((x) => x.id === b)!.team).toBe(0);
    expect(sim.goodsAt(1, store.x, store.y).iron).toBe(40);
    const tl = sim.townLevels();
    expect(tl.find((t) => t.id === a)).toMatchObject({ team: 1, level: 3 });
    expect(tl.find((t) => t.id === b)).toMatchObject({ team: 0, level: 1 });
    expect(sim.rebanner(a, 1)).toEqual([]);
    expect(sim.rebanner(9999, 1)).toEqual([]);
  });
});

describe('perf (W-63)', () => {
  it('eight towns and 120 men: a tick stays cheap', () => {
    const sim = createSim(region(), 9);
    for (const team of [0, 1]) {
      sim.claim(team, team ? 84 : 28, 32, 34);
      sim.addStock(team, 'wood', 99999);
      sim.addStock(team, 'stone', 99999);
    }
    for (const [x, team] of [[12, 0], [28, 0], [44, 0], [20, 0], [68, 1], [84, 1], [100, 1], [92, 1]] as const) campAt(sim, x, x === 20 || x === 92 ? 48 : 20, team);
    village(sim, 28, 32);
    village(sim, 84, 32, 1);
    for (let i = 0; i < 10; i++) sim.spawnSquad(`p${i}`, i % 2, 'militia', 12, 10 + i * 9, 40);
    expect(sim.townLevels(true).length).toBe(8);
    run(sim, 50);
    const t0 = performance.now();
    run(sim, 500);
    const per = (performance.now() - t0) / 500;
    const m0 = performance.now();
    for (let i = 0; i < 100; i++) sim.townLevels(true);
    const measure = (performance.now() - m0) / 100;
    console.log(`W-63 perf: ${per.toFixed(3)} ms a tick, ${measure.toFixed(3)} ms a town measure (every ${50} ticks)`);
    expect(measure).toBeLessThan(5);
  });
});

describe('determinism (W-63)', () => {
  const play = (seed: number) => {
    const { sim, a } = twoTowns(seed);
    sim.spawnSquad('lord', 0, 'hoplite', 6, 28, 26);
    const m = sim.spawnSquad('rebel', 0, 'militia', 6, 28, 29);
    run(sim, 30);
    sim.order({ kind: 'turnSquad', squad: m, team: 1 });
    sim.order({ kind: 'rebanner', centre: a, team: 1 });
    run(sim, 100);
    return sim;
  };
  it('same seed, same orders: the same field; and the same after save and restore', () => {
    const x = play(8), y = play(8);
    expect(JSON.stringify(y.snapshot())).toBe(JSON.stringify(x.snapshot()));
    const back = createSim(region(), 8);
    back.importState(x.exportState());
    run(x, 150);
    run(back, 150);
    expect(JSON.stringify(back.snapshot())).toBe(JSON.stringify(x.snapshot()));
    expect(JSON.stringify(back.townLevels())).toBe(JSON.stringify(x.townLevels()));
  });
});
