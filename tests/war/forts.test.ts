/** M5h3 Fortifier works (src/war/sim/works.ts, economy.ts FIELD): stakes, ditch, iron-bound gate, wet hides. */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { FIELD } from '../../src/war/sim/economy';
import { makePerson } from '../../src/war/sim/roster';
import { FORT } from '../../src/war/sim/works';
import type { BuildingType, RegionData, SiegeSnap, WarBuildSim } from '../../src/war/types';

/** As siege.test.ts: flat 40 x 40 grass cut by a rock band on row 20, open at x 14..25; team 0 holds the south. */
function region(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 's', name: 's', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [],
  };
  for (let x = 0; x < n; x++) if (x < 14 || x > 25) r.terrain[20 * n + x] = 'rock';
  return r;
}

const run = (sim: WarBuildSim, ticks: number, until?: () => boolean): number => {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
};
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
const engine = (sim: WarBuildSim, id: number): SiegeSnap => sim.snapshot().sieges![id];
const unitsOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id));
};
const hpOf = (sim: WarBuildSim, squad: number) => unitsOf(sim, squad).reduce((a, u) => a + Math.max(0, u.hp), 0);

function engineer(sim: WarBuildSim, team: number, perks: string[], x = 2, y = 38): number {
  const p = makePerson(`eng-${team}-${perks.join('-')}-${x}`, 'civ_engineer', { level: 10 });
  p.hero.perks = perks as never;
  return sim.spawnSquad('x', team, 'civ_engineer', 1, x, y, [p]);
}

function base(seed: number, fortifier = true): [WarBuildSim, number] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  for (const t of [0, 1]) for (const r of ['wood', 'stone', 'hides', 'iron', 'charcoal'] as const) sim.addStock(t, r, 5000);
  if (fortifier) engineer(sim, 0, ['masterBuilder', 'fortifier']);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  return [sim, s];
}

function build(sim: WarBuildSim, place: () => void, ticks = 9000): number[] {
  const before = bs(sim).length;
  place();
  sim.step();
  const ids = bs(sim).filter((b) => b.id >= before).map((b) => b.id);
  expect(ids.length).toBeGreaterThan(0);
  run(sim, ticks, () => ids.every((id) => piece(sim, id).state === 'done'));
  expect(ids.every((id) => piece(sim, id).state === 'done')).toBe(true);
  return ids;
}
const away = (sim: WarBuildSim, s: number) => {
  sim.order({ kind: 'move', squad: s, x: 20, y: 37 });
  run(sim, 150);
};

/** A line of field tiles of `type` across the gap (row 20, x 14..25) or on row `y`, each placed and dug by a pair of militia. */
const fieldLine = (sim: WarBuildSim, s: number, type: BuildingType, y: number) => {
  away(sim, s);
  const pairs: number[] = [];
  const ids = build(sim, () => {
    for (let x = 14; x <= 25; x++) {
      const q = sim.spawnSquad('p', 0, 'militia', 2, x + 0.5, y + 2.5);
      pairs.push(q);
      sim.order({ kind: 'placeBuilding', squad: q, type, x: x + 0.5, y: y + 0.5 });
    }
  });
  for (const q of pairs) sim.order({ kind: 'move', squad: q, x: 30 + (q % 6), y: 37 });
  run(sim, 200);
  return ids;
};

/** A team 1 ram, built and crewed at (x,y). */
function ramAt(sim: WarBuildSim, x: number, y: number): [number, number] {
  const q = sim.spawnSquad('e', 1, 'militia', 8, x, y - 2);
  const id = sim.snapshot().sieges?.length ?? 0;
  sim.order({ kind: 'buildSiege', squad: q, type: 'ram', x, y });
  run(sim, 3000, () => engine(sim, id)?.state === 'idle');
  sim.order({ kind: 'crew', squad: q, siege: id });
  run(sim, 60);
  return [q, id];
}

describe('M5h3 stakes and ditch', () => {
  it('need a Fortifier to place', () => {
    const [sim, s] = base(1, false);
    const n = bs(sim).length;
    sim.order({ kind: 'placeBuilding', squad: s, type: 'stakes', x: 20.5, y: 24.5 });
    sim.order({ kind: 'placeBuilding', squad: s, type: 'ditch', x: 21.5, y: 24.5 });
    sim.order({ kind: 'placeBuilding', squad: s, type: 'towerBridge', x: 22.5, y: 24.5 });
    sim.step();
    expect(bs(sim).length).toBe(n);
  });

  it('stakes: men cross slowly and are wounded; engines cannot cross', () => {
    const [sim, s] = base(2);
    const ids = fieldLine(sim, s, 'stakes', 20);
    away(sim, s);
    expect(piece(sim, ids[0])).toMatchObject({ type: 'stakes', state: 'done', team: 0 });
    // a foe squad walks through, losing hp on the stakes
    const e = sim.spawnSquad('e', 1, 'militia', 6, 20, 14);
    const h0 = hpOf(sim, e);
    sim.order({ kind: 'move', squad: e, x: 20, y: 27 });
    run(sim, 800, () => unitsOf(sim, e).every((u) => u.y > 24));
    expect(unitsOf(sim, e).every((u) => u.y > 24)).toBe(true);
    expect(hpOf(sim, e)).toBeLessThan(h0);
    expect(FIELD.stakes.slow).toBeGreaterThan(1);
    // a ram cannot
    const [q, ram] = ramAt(sim, 20, 12);
    sim.order({ kind: 'move', squad: q, x: 20, y: 28 });
    run(sim, 1500);
    expect(engine(sim, ram).y).toBeLessThan(20);
  });

  it('a ditch stops engines until filled, and blocks them in pathing', () => {
    const [sim, s] = base(3);
    const ids = fieldLine(sim, s, 'ditch', 20);
    away(sim, s);
    const [q, ram] = ramAt(sim, 20, 12);
    sim.order({ kind: 'move', squad: q, x: 20, y: 28 });
    run(sim, 1500);
    expect(engine(sim, ram).y).toBeLessThan(20);
    // fill one tile (attackBuilding on a ditch): the way opens
    const at = ids.find((id) => piece(sim, id).tiles[0] === 20)!;
    const f = sim.spawnSquad('f', 1, 'militia', 8, 20, 18);
    sim.order({ kind: 'attackBuilding', squad: f, building: at });
    run(sim, 3000, () => piece(sim, at).state === 'destroyed');
    expect(piece(sim, at).state).toBe('destroyed');
    sim.order({ kind: 'move', squad: f, x: 4, y: 12 });
    sim.order({ kind: 'move', squad: q, x: 20, y: 28 });
    run(sim, 1500, () => engine(sim, ram).y > 25);
    expect(engine(sim, ram).y).toBeGreaterThan(25);
  });
});

describe('M5h3 iron-bound gate and wet hides', () => {
  it('an iron-bound gate takes half again the hp, once, for iron and charcoal', () => {
    const [sim, s] = base(4);
    const [gate] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodGate', x: 30, y: 30 }));
    const g0 = piece(sim, gate);
    const st0 = sim.snapshot().stock![0];
    sim.order({ kind: 'fortify', team: 0, building: gate, fort: 'ironGate' });
    sim.step();
    const g = piece(sim, gate);
    expect(g.iron).toBe(true);
    expect(g.maxHp).toBeCloseTo(g0.maxHp * FORT.iron);
    expect(sim.snapshot().stock![0].iron).toBe(st0.iron! - 10);
    expect(sim.snapshot().stock![0].charcoal).toBe(st0.charcoal! - 10);
    sim.order({ kind: 'fortify', team: 0, building: gate, fort: 'ironGate' });
    sim.step();
    expect(piece(sim, gate).maxHp).toBeCloseTo(g0.maxHp * FORT.iron); // once
    // no Fortifier: refused
    const [sim2, s2] = base(4, false);
    const [gate2] = build(sim2, () => sim2.order({ kind: 'placeBuilding', squad: s2, type: 'woodGate', x: 30, y: 30 }));
    sim2.order({ kind: 'fortify', team: 0, building: gate2, fort: 'ironGate' });
    sim2.step();
    expect(piece(sim2, gate2).iron).toBeUndefined();
  });

  it('wet hides make wood slow to catch, for a while', () => {
    const catchTicks = (wet: boolean) => {
      const [sim, s] = base(5);
      const [p] = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 16.5, 20.5] }));
      away(sim, s);
      if (wet) {
        const h = sim.snapshot().stock![0].hides!;
        sim.order({ kind: 'fortify', team: 0, building: p, fort: 'wetHides' });
        sim.step();
        expect(piece(sim, p).wet).toBe(true);
        expect(sim.snapshot().stock![0].hides).toBe(h - piece(sim, p).tiles.length / 2);
      }
      const e = sim.spawnSquad('e', 1, 'militia', 2, 15, 16);
      sim.order({ kind: 'ignite', squad: e, building: p });
      return [run(sim, 1500, () => (piece(sim, p).burning ?? 0) > 0), sim, p] as const;
    };
    const [dry] = catchTicks(false);
    const [wet, sim, p] = catchTicks(true);
    expect(wet - dry).toBeGreaterThanOrEqual(12); // twice the torch-time
    run(sim, FORT.wetTicks);
    expect(piece(sim, p).wet).toBeUndefined(); // dried out
  });
});

describe('M5h3 save and restore', () => {
  it('stakes, a ditch, an oxybeles and a docked tower resume exactly', () => {
    const setup = () => {
      const [sim, s] = base(6);
      build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
      fieldLine(sim, s, 'stakes', 24);
      away(sim, s);
      engineer(sim, 1, ['carpenter', 'rams', 'artillerist', 'poliorcetes'], 37, 2);
      const q = sim.spawnSquad('e', 1, 'militia', 10, 17, 10);
      sim.order({ kind: 'buildSiege', squad: q, type: 'siegeTower', x: 17, y: 12 });
      run(sim, 3000, () => engine(sim, 0)?.state === 'idle');
      sim.order({ kind: 'crew', squad: q, siege: 0 });
      run(sim, 30);
      sim.order({ kind: 'raiseLadder', squad: q, wallTile: [17, 20] });
      const o = sim.spawnSquad('o', 1, 'militia', 3, 23, 8);
      sim.order({ kind: 'buildSiege', squad: o, type: 'oxybeles', x: 23, y: 10 });
      run(sim, 3000, () => engine(sim, 1)?.state === 'idle');
      sim.order({ kind: 'crew', squad: o, siege: 1 });
      const d = sim.spawnSquad('d', 0, 'archer', 6, 21, 23);
      sim.order({ kind: 'hold', squad: d });
      return sim;
    };
    const a = setup();
    run(a, 700);
    const saved = JSON.parse(JSON.stringify(a.exportState()));
    const b = createSim(region(), 6);
    b.importState(saved);
    expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
    for (let t = 0; t < 6; t++) {
      run(a, 100);
      run(b, 100);
      expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
    }
    expect(a.snapshot().sieges!.some((e) => e.state === 'raised')).toBe(true);
  });
});
