// W-51: sim heights run 0..15 — cell encoding, cliffs, high-ground caps, sight from tall tiers, determinism.
import { describe, expect, it } from 'vitest';
import { decodeCells, encodeCells, MAX_HEIGHT } from '../../src/war/region/compact';
import { buildGrid, canEnter, findPath } from '../../src/war/sim/grid';
import { COMBAT, heightLevels, heightRange, meleeHeight, missileHeight } from '../../src/war/sim/combat';
import { createSim } from '../../src/war/sim';
import type { RegionData } from '../../src/war/types';

/** Flat grass w x h at height `base`; `shape` edits it. */
function region(shape: (r: RegionData, i: (x: number, y: number) => number) => void = () => {}, w = 80, h = 40, base = 1): RegionData {
  const r: RegionData = { id: 'h', name: 'h', w, h, height: Array(w * h).fill(base), terrain: Array(w * h).fill('grass'), water: Array(w * h).fill(0), entries: [], noBuild: [] };
  shape(r, (x, y) => y * w + x);
  return r;
}

describe('height 0..15 (W-51)', () => {
  it('cells round-trip every height with every terrain and water', () => {
    const height: number[] = [], terrain: string[] = [], water: number[] = [];
    const T = ['grass', 'forest', 'sand', 'marsh', 'rock', 'road', 'snow', 'dirt'];
    for (let h = 0; h <= MAX_HEIGHT; h++) for (const t of T) for (const w of [0, 1, 2]) height.push(h), terrain.push(t), water.push(w);
    const back = decodeCells(encodeCells(height, terrain, water), height.length);
    expect(back).toEqual({ height, terrain, water });
    expect(MAX_HEIGHT).toBe(15);
    expect(() => encodeCells([16], ['grass'], [0])).toThrow(/height/);
  });

  it('a step of one level is a slope, two or more a cliff, at any height', () => {
    const r = region((r, i) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) r.height[i(x, y)] = Math.min(15, Math.floor(x / 5)); });
    const g = buildGrid(r);
    expect(canEnter(g, 13 * 80 + 74, 13 * 80 + 75)).toBe(true); // 14 -> 15
    const path = findPath(g, 20 * 80 + 1, 20 * 80 + 78);
    expect(path.at(-1)).toBe(20 * 80 + 78); // walks the 0..15 staircase up
    const cliff = region((r, i) => { for (let y = 0; y < 40; y++) for (let x = 40; x < 80; x++) r.height[i(x, y)] = 15; }, 80, 40, 13);
    const gc = buildGrid(cliff);
    expect(canEnter(gc, 20 * 80 + 39, 20 * 80 + 40)).toBe(false); // 13 -> 15
    expect(findPath(gc, 20 * 80 + 1, 20 * 80 + 78).at(-1)).not.toBe(20 * 80 + 78);
  });

  it('high-ground bonus counts 4 levels whole, 4 more half, none past 8', () => {
    expect([0, 2, 4, 6, 8, 12, 15].map(heightLevels)).toEqual([0, 2, 4, 5, 6, 6, 6]);
    expect(heightLevels(-5)).toBe(0);
    expect(missileHeight(15)).toBeCloseTo(1 + 6 * COMBAT.missileDown);
    expect(missileHeight(15)).toBeLessThan(1.75);
    expect(heightRange(15)).toBeCloseTo(6 * COMBAT.rangeDown);
    expect(heightRange(15)).toBe(heightRange(COMBAT.missileMaxDiff));
    expect(meleeHeight(15)).toBe(meleeHeight(2)); // melee counts 2 levels at most
    expect(meleeHeight(-15)).toBe(meleeHeight(-2));
  });

  it('a man on a tall tier sees over a ridge a low one hides behind', () => {
    // a 2-tile wall of height 6 across the map at x = 20..21; the viewer at x = 14.5 on a tier of 2 or of 14
    const make = (tier: number) => region((r, i) => {
      for (let y = 0; y < 40; y++) { for (let x = 0; x < 16; x++) r.height[i(x, y)] = tier; for (const x of [20, 21]) r.height[i(x, y)] = 6; }
    });
    const sees = (tier: number) => {
      const sim = createSim(make(tier), 1);
      sim.spawnSquad('a', 0, 'militia', 1, 14.5, 20.5);
      sim.step();
      return sim.visibleTo(0, 25.5, 20.5);
    };
    expect(sees(2)).toBe(false);
    expect(sees(14)).toBe(true);
  });

  it('archers on a tier 12 levels up stay deterministic', () => {
    const r = region((r, i) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) r.height[i(x, y)] = 13; });
    const play = () => {
      const sim = createSim(r, 7);
      const a = sim.spawnSquad('a', 0, 'archer', 8, 26, 20);
      const b = sim.spawnSquad('b', 1, 'militia', 8, 40, 20);
      sim.order({ kind: 'attack', squad: a, target: b });
      for (let t = 0; t < 300; t++) sim.step();
      return JSON.stringify(sim.snapshot().units.map((u) => [u.x, u.y, u.hp, u.state]));
    };
    expect(play()).toBe(play());
  });
});
