/**
 * W-61 walls that matter (docs/WAR.md "Walls that matter", economy.ts WALLS): a raid of fewer than 12 men with no ram
 * cannot break a stone gate, wall or tower quickly, while a ram and ladders keep a siege meaningful. Seeded scenarios
 * on flat grass (team 0 builds, team 1 attacks).
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { BuildingType, RegionData, SiegeSnap, WarBuildSim } from '../../src/war/types';

function region(): RegionData {
  const n = 40;
  return { id: 's', name: 's', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [] };
}
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
const engine = (sim: WarBuildSim, id: number): SiegeSnap => sim.snapshot().sieges![id];
function run(sim: WarBuildSim, ticks: number, until: () => boolean = () => false): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until()) return t + 1;
  }
  return ticks;
}
const MIN = 600; // ticks a minute

/** Team 0's camp and one finished piece of `type` at (30, 30); its builders walk off. */
function fortified(seed: number, type: BuildingType): [WarBuildSim, number] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 5000);
  sim.addStock(0, 'stone', 5000);
  sim.addStock(1, 'wood', 1000);
  const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  const before = bs(sim).length;
  sim.order({ kind: 'placeBuilding', squad: s, type, x: 30, y: 30 });
  sim.step();
  const id = bs(sim).find((b) => b.id >= before)!.id;
  run(sim, 20000, () => piece(sim, id).state === 'done');
  expect(piece(sim, id).state).toBe('done');
  sim.order({ kind: 'move', squad: s, x: 5, y: 37 });
  run(sim, 150);
  return [sim, id];
}

/** Ticks 11 men of `cls` (no ram) take to bring piece `id` down, at most `cap`. */
function raid(sim: WarBuildSim, id: number, cls: string, cap: number): number {
  const e = sim.spawnSquad('e', 1, cls, 11, 30, 22);
  sim.order({ kind: 'attackBuilding', squad: e, building: id });
  return run(sim, cap, () => piece(sim, id).state === 'destroyed');
}

describe('walls that matter (W-61)', () => {
  it('11 swordsmen without a ram cannot break a stone gate in 20 minutes', () => {
    const [sim, gate] = fortified(1, 'stoneGate');
    const t = raid(sim, gate, 'celt_sword', 20 * MIN);
    expect(t).toBe(20 * MIN);
    expect(piece(sim, gate).state).not.toBe('destroyed');
    expect(piece(sim, gate).hp).toBeGreaterThan(piece(sim, gate).maxHp * 0.2);
  });

  it('nor a stone tower', () => {
    const [sim, tower] = fortified(2, 'stoneTower');
    expect(raid(sim, tower, 'hoplite', 20 * MIN)).toBe(20 * MIN);
    expect(piece(sim, tower).state).not.toBe('destroyed');
  });

  it('a wooden gate still falls to the same raid in minutes (stone is what buys safety)', () => {
    const [sim, gate] = fortified(3, 'woodGate');
    expect(raid(sim, gate, 'hoplite', 20 * MIN)).toBeLessThan(5 * MIN);
  });

  it('a crewed ram breaks the stone gate in a few minutes: sieges stay meaningful', () => {
    const [sim, gate] = fortified(4, 'stoneGate');
    const q = sim.spawnSquad('r', 1, 'militia', 8, 30, 20);
    sim.order({ kind: 'buildSiege', squad: q, type: 'ram', x: 30, y: 22 });
    sim.step();
    const ram = (sim.snapshot().sieges?.length ?? 1) - 1;
    run(sim, 3000, () => engine(sim, ram).state !== 'building');
    sim.order({ kind: 'crew', squad: q, siege: ram });
    run(sim, 60);
    sim.order({ kind: 'attackBuilding', squad: q, building: gate });
    const t = run(sim, 20 * MIN, () => piece(sim, gate).state === 'destroyed');
    expect(piece(sim, gate).state).toBe('destroyed');
    expect(t).toBeLessThan(5 * MIN);
  });

  it('runs the same for a seed', () => {
    const go = () => {
      const [sim, gate] = fortified(5, 'stoneGate');
      raid(sim, gate, 'hoplite', 2 * MIN);
      return piece(sim, gate).hp;
    };
    expect(go()).toBe(go());
  });
});
