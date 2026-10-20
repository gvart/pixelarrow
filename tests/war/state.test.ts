/**
 * Sim save and restore (src/war/sim/state.ts, M5e eviction resume): a sim exported mid-run and imported into a fresh
 * one steps on exactly as the uninterrupted run (same snapshot and same state hash), through siege, fire, building,
 * fighting persons, mobs and fog.
 */
import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import { hashString } from '../../src/war/sim/state';
import type { RegionData, WarBuildSim } from '../../src/war/types';

function siegeRegion(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 's', name: 's', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [{ id: 'oak', x: 5.5, y: 30.5 }],
  };
  for (let x = 0; x < n; x++) if (x < 14 || x > 25) r.terrain[20 * n + x] = 'rock';
  return r;
}

const run = (sim: WarBuildSim, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
const hash = (sim: WarBuildSim) => hashString(JSON.stringify(sim.exportState()));
const snap = (sim: WarBuildSim) => JSON.stringify(sim.snapshot());

/** Export at `at`, then check the copy and the original agree for `more` ticks (`mid` orders both at +200). */
function resumes(region: RegionData, seed: number, setup: (sim: WarBuildSim) => void, at: number, more: number, mid?: (sim: WarBuildSim) => void) {
  const a = createSim(region, seed);
  setup(a);
  run(a, at);
  const saved = JSON.parse(JSON.stringify(a.exportState())); // through JSON, as storage keeps it
  const b = createSim(region, seed);
  b.importState(saved);
  expect(hash(b)).toBe(hash(a));
  expect(snap(b)).toBe(snap(a));
  for (let t = 0; t < more; t += 100) {
    if (t === 200 && mid) (mid(a), mid(b));
    run(a, 100);
    run(b, 100);
    expect(snap(b)).toBe(snap(a));
  }
  expect(hash(b)).toBe(hash(a));
  return { a, b, size: JSON.stringify(saved).length };
}

describe('sim exportState / importState', () => {
  it('a siege with a burning wall, a ram and fire arrows resumes exactly', () => {
    const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
    const until = (sim: WarBuildSim, n: number, f: () => boolean) => {
      for (let i = 0; i < n && !f(); i++) sim.step();
    };
    const { a, size } = resumes(
      siegeRegion(),
      9,
      (sim) => {
        sim.claim(0, 20, 32, 25);
        sim.addStock(0, 'wood', 5000);
        sim.addStock(0, 'stone', 5000);
        sim.addStock(1, 'wood', 1000);
        const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 27);
        sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
        until(sim, 2000, () => bs(sim)[0]?.state === 'done');
        sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] });
        sim.step();
        until(sim, 9000, () => bs(sim).every((b) => b.state === 'done'));
        sim.order({ kind: 'move', squad: s, x: 20, y: 37 });
        const g = sim.spawnSquad('g', 0, 'militia', 6, 6, 32);
        sim.order({ kind: 'gather', squad: g, node: 0 });
        const q = sim.spawnSquad('e', 1, 'militia', 8, 20, 10);
        sim.order({ kind: 'buildSiege', squad: q, type: 'ram', x: 20, y: 12 });
        sim.step();
        until(sim, 3000, () => sim.snapshot().sieges![0].state !== 'building');
        sim.order({ kind: 'crew', squad: q, siege: 0 });
        const gate = bs(sim).find((b) => b.type === 'woodGate')!;
        const wall = bs(sim).find((b) => b.type !== 'woodGate' && b.team === 0 && b.type !== 'camp')!;
        sim.order({ kind: 'attackBuilding', squad: q, building: gate.id });
        const arch = sim.spawnSquad('b', 1, 'archer', 6, 16, 12);
        sim.order({ kind: 'placeBuilding', team: 1, type: 'brazier', x: 16.5, y: 10.5 });
        sim.order({ kind: 'fireArrows', squad: arch, on: true });
        sim.order({ kind: 'attackBuilding', squad: arch, building: wall.id });
      },
      300,
      1200,
      (sim) => sim.order({ kind: 'extinguish', squad: 0, building: bs(sim).find((b) => b.burning)?.id ?? 1 }),
    );
    const s = a.snapshot();
    expect(s.buildings!.filter((b) => b.state === 'done' && b.team === 0).length).toBeGreaterThan(3);
    expect(s.buildings!.some((b) => b.burning || b.state === 'destroyed' || b.state === 'damaged')).toBe(true);
    expect(s.sieges?.length).toBe(1);
    expect(size).toBeLessThan(400_000);
  });

  it('persons fighting by the mobs of test-ridge, under fog, resume exactly', () => {
    const { visual: _v, biomes: _b, ...ridge } = parseRegion(ridgeJson);
    const men = (p: string, cls: string, n: number) => Array.from({ length: n }, (_, i) => makePerson(`${p}${i}`, cls, { level: 1 + (i % 5) }));
    const { a } = resumes(
      ridge,
      4,
      (sim) => {
        sim.spawnMobs();
        const x = sim.spawnSquad('p:1', 0, 'hoplite', 12, 60, 60, men('h', 'hoplite', 12));
        const y = sim.spawnSquad('p:2', 1, 'archer', 12, 75, 60, men('a', 'archer', 12));
        sim.order({ kind: 'attack', squad: x, target: y });
        sim.order({ kind: 'attack', squad: y, target: x });
      },
      400,
      800,
    );
    const s = a.snapshot();
    expect(s.units.some((u) => u.state === 'dead' || u.hp < u.maxHp)).toBe(true);
  });

  it('refuses a state of another region or into a used sim', () => {
    const a = createSim(siegeRegion(), 1);
    a.spawnSquad('a', 0, 'militia', 4, 10, 30);
    run(a, 3);
    const st = a.exportState();
    const used = createSim(siegeRegion(), 1);
    used.step();
    expect(() => used.importState(st)).toThrow(/fresh/);
    expect(() => createSim({ ...siegeRegion(), id: 'other' }, 1).importState(st)).toThrow(/does not fit/);
  });
});
