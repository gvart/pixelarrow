/**
 * W-79 follow-up: the snapshot counts the food left in a squad's packs, and the HUD warns once when it runs low or a man
 * goes hungry (src/war/view/hud/foodWatch.ts).
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { HUNGER } from '../../src/war/sim/food';
import { put } from '../../src/war/sim/holders';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import { FOOD, foodNote, foodWarnings, type FoodMemo } from '../../src/war/view/hud/foodWatch';
import type { Snapshot } from '../../src/war/types';
import { flat } from './flatRegion';

const snap = (meals: number | undefined, sats: number[], owner = 'you'): Snapshot => ({
  tick: 0, shots: [], buildings: [],
  units: sats.map((sat, id) => ({ id, squad: 0, x: 0, y: 0, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'idle', sat })),
  squads: [{ id: 0, owner, team: 0, units: sats.map((_, i) => i), order: 'hold', ...(meals === undefined ? {} : { meals }) }],
} as Snapshot);

describe('W-79 food left in the packs', () => {
  it('the snapshot counts whole rations and food in the living men\'s packs; the wild has none', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('you', 0, 'hoplite', 3, 20, 20);
    const w = sim.spawnSquad('wild', MOB_TEAM, 'hoplite', 2, 40, 40);
    expect(sim.snapshot().squads[s].meals).toBe(0);
    for (const sl of sim.cargo({ squad: s })!.slots) put(sl.hold, 'ration', HUNGER.kit, 'test');
    put(sim.cargo({ squad: s })!.slots[0].hold, 'food', 2, 'test');
    expect(sim.snapshot().squads[s].meals).toBe(3 * HUNGER.kit + 2);
    expect(sim.snapshot().squads[w].meals).toBeUndefined();
  });
});

describe('W-79 low-food warnings', () => {
  it('warns once when the packs run low, again only after a refill', () => {
    const memo: FoodMemo = new Map(), men = [90, 90, 90];
    expect(foodWarnings(snap(24, men), 'you', memo)).toEqual([]);
    expect(foodWarnings(snap(FOOD.low * 3, men), 'you', memo)).toEqual([{ squad: 0, kind: 'pack', meals: 6 }]);
    expect(foodWarnings(snap(2, men), 'you', memo)).toEqual([]);
    expect(foodWarnings(snap(FOOD.ok * 3, men), 'you', memo)).toEqual([]);
    expect(foodWarnings(snap(0, men), 'you', memo).map((w) => w.kind)).toEqual(['pack']);
  });

  it('packs already low when first seen warn at once; a hungry man always warns, once', () => {
    const memo: FoodMemo = new Map();
    expect(foodWarnings(snap(0, [70, 70]), 'you', memo)).toEqual([{ squad: 0, kind: 'pack', meals: 0 }]);
    expect(foodWarnings(snap(0, [30, 70]), 'you', memo)).toEqual([{ squad: 0, kind: 'hungry' }]);
    expect(foodWarnings(snap(0, [10, 70]), 'you', memo)).toEqual([]);
    expect(foodWarnings(snap(0, [HUNGER.eatAt, 70]), 'you', memo)).toEqual([]);
    expect(foodWarnings(snap(0, [10, 70]), 'you', memo)).toEqual([{ squad: 0, kind: 'starving' }]);
  });

  it('only his own squads', () => {
    expect(foodWarnings(snap(0, [10]), 'p:2', new Map())).toEqual([]);
    expect(foodWarnings(snap(0, [10], 'p:2'), 'p:2', new Map())).toHaveLength(1);
  });

  it('the toast is a few plain words, its count in a chip', () => {
    for (const n of [foodNote({ squad: 0, kind: 'pack', meals: 4 }), foodNote({ squad: 0, kind: 'pack', meals: 0 }), foodNote({ squad: 0, kind: 'hungry' }), foodNote({ squad: 0, kind: 'starving' })]) {
      expect(n.text.split(/\s+/).length).toBeLessThanOrEqual(6);
      expect(n.text).not.toMatch(/\d/);
      expect(n.icon).toBeTruthy();
    }
  });
});
