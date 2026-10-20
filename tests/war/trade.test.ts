/** M6a holders and coin (docs/WAR.md "Trade", "Goods live in places", "Coin"): store networks, chests, porters, the mint. */
import { describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { BUILDINGS, CARRY, CHEST } from '../../src/war/sim/economy';
import { amount, ITEMS_PER_LOAD, loads, move, newHold, put, take, takeFrom } from '../../src/war/sim/holders';
import { makePerson } from '../../src/war/sim/roster';
import { PORTER } from '../../src/war/sim/trade';
import type { BuildingType, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const squad = (sim: WarBuildSim, id: number) => sim.snapshot().squads[id];

/** Buildings of team 0 placed and raised by a militia squad each (ids in order), on ground claimed round each. */
function raise(sim: WarBuildSim, at: [BuildingType, number, number][], owner = 'a'): number[] {
  const ss = at.map(([t, x, y]) => {
    for (const [r, v] of Object.entries(BUILDINGS[t].cost)) sim.addStock(0, r as never, v);
    const s = sim.spawnSquad(owner, 0, 'militia', 12, x, y + 5);
    sim.order({ kind: 'placeBuilding', squad: s, type: t, x, y });
    return s;
  });
  run(sim, 6000, () => at.every((_, i) => building(sim, i)?.state === 'done'));
  for (let i = 0; i < at.length; i++) expect(building(sim, i).state).toBe('done');
  return ss;
}

describe('M6a holders', () => {
  it('lots keep their origin, take first in first out, size in loads (5 items a load)', () => {
    const h = newHold();
    put(h, 'wood', 6, 'elaia');
    put(h, 'wood', 6, 'dodona');
    expect(take(h, 'wood', 8)).toEqual([{ r: 'wood', n: 6, o: 'elaia' }, { r: 'wood', n: 2, o: 'dodona' }]);
    expect(amount(h, 'wood')).toBe(4);
    h.items.push(...Array.from({ length: ITEMS_PER_LOAD }, (_, i) => ({ uid: `i${i}`, def: 'spear', rarity: 'common' as const, cond: 100 })));
    expect(loads(h)).toBeCloseTo(4 / CARRY + 1);
    expect(takeFrom([h], { wood: 5 })).toBe(false);
    expect(amount(h, 'wood')).toBe(4); // all or nothing
    const p = newHold();
    expect(move(h, p, PORTER.loads)).toBeCloseTo(4 / CARRY + 0.6); // the goods, then items while a load has room
  });
});

describe('M6a store networks', () => {
  it('work draws from the stores of the network where it stands; a cut-off store is not drawn', () => {
    const sim = createSim(flat(128), 1);
    sim.claim(0, 30, 40, 14);
    sim.claim(0, 95, 40, 6); // the camp itself reaches the storehouse
    const [w, e] = raise(sim, [['camp', 30, 40], ['camp', 95, 40]]);
    sim.addStock(0, 'wood', BUILDINGS.storehouse.cost.wood!);
    sim.order({ kind: 'placeBuilding', squad: e, type: 'storehouse', x: 100, y: 46 });
    run(sim, 3000, () => building(sim, 2)?.state === 'done');
    expect(building(sim, 2).state).toBe('done');
    // porters carry the strongroom's wood out through the west camp to the east storehouse
    sim.addStock(0, 'wood', 10);
    sim.order({ kind: 'load', squad: w, from: { building: 0 }, res: 'wood', n: 10 });
    run(sim, 300, () => squad(sim, w).order === 'hold');
    expect(sim.snapshot().units.filter((u) => u.squad === w).reduce((n, u) => n + (u.pack ?? 0), 0)).toBeCloseTo(1);
    sim.order({ kind: 'move', squad: w, x: 100, y: 52 });
    run(sim, 900);
    sim.order({ kind: 'unload', squad: w, to: { building: 2 } });
    run(sim, 600, () => squad(sim, w).order === 'hold');
    expect(building(sim, 2).goods?.wood).toBeCloseTo(10);
    expect(sim.goodsAt(0, 95, 40).wood ?? 0).toBeCloseTo(10);
    expect(sim.goodsAt(0, 30, 40).wood ?? 0).toBeCloseTo(0);
    expect(sim.drawAt(0, 30, 40, { wood: 5 })).toBe(false);
    expect(sim.drawAt(0, 95, 40, { wood: 5 })).toBe(true);
    expect(building(sim, 2).goods?.wood).toBeCloseTo(5);
    // the east camp falls: its influence goes, the storehouse is cut off, nothing there draws on it
    sim.damageBuilding(1, 1e9);
    run(sim, 1);
    expect(sim.goodsAt(0, 100, 46).wood ?? 0).toBe(0);
    expect(sim.drawAt(0, 100, 46, { wood: 1 })).toBe(false);

  });

  it('building sites fetch from their own network', () => {
    const sim = createSim(flat(128), 2);
    sim.claim(0, 30, 40, 14);
    sim.claim(0, 95, 40, 14);
    const [w] = raise(sim, [['camp', 30, 40], ['camp', 95, 40]]);
    // the strongroom feeds every network: its wood goes into the west camp first (porters), so only the west has any
    const need = BUILDINGS.storehouse.cost.wood!;
    sim.addStock(0, 'wood', need);
    sim.order({ kind: 'load', squad: w, from: { building: 0 }, res: 'wood' });
    run(sim, 300, () => squad(sim, w).order === 'hold');
    sim.order({ kind: 'unload', squad: w, to: { building: 0 } });
    run(sim, 300, () => squad(sim, w).order === 'hold');
    expect(building(sim, 0).goods?.wood).toBeCloseTo(need);
    sim.order({ kind: 'placeBuilding', squad: w, type: 'storehouse', x: 36, y: 46 });
    const t = sim.spawnSquad('a', 0, 'militia', 12, 95, 50);
    sim.order({ kind: 'placeBuilding', squad: t, type: 'storehouse', x: 100, y: 46 });
    run(sim, 4000, () => building(sim, 2).state === 'done');
    expect(building(sim, 2).state).toBe('done');
    expect(building(sim, 3).delivered).toBe(0);
  });
});

describe('M6a chests', () => {
  it('a player places at most CHEST.cap a region; only he takes from it; it never feeds crafting', () => {
    const sim = createSim(flat(96), 3);
    sim.claim(0, 40, 40, 30);
    const [s] = raise(sim, [['camp', 30, 40]]);
    sim.addStock(0, 'wood', 200);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'chest', x: 40, y: 40 });
    run(sim, 1500, () => building(sim, 1)?.state === 'done');
    expect(building(sim, 1)).toMatchObject({ state: 'done', owner: 'a' });
    // a cap a player: placements past CHEST.cap are refused
    for (let i = 1; i < CHEST.cap + 2; i++) sim.order({ kind: 'placeBuilding', squad: s, type: 'chest', x: 40 + i * 2, y: 44 });
    run(sim, 1);
    expect(sim.snapshot().buildings!.filter((b) => b.type === 'chest' && b.owner === 'a')).toHaveLength(CHEST.cap);
    // he fills it from the camp
    sim.order({ kind: 'load', squad: s, from: { building: 0 }, res: 'wood', n: 40 });
    run(sim, 400, () => squad(sim, s).order === 'hold');
    sim.order({ kind: 'unload', squad: s, to: { building: 1 } });
    run(sim, 400, () => squad(sim, s).order === 'hold');
    expect(building(sim, 1).goods?.wood).toBeCloseTo(40);
    const wood = sim.goodsAt(0, 40, 40).wood!;
    expect(sim.drawAt(0, 40, 40, { wood: wood + 1 })).toBe(false); // the chest is not in the network
    // another player of the same team may not take from it
    const b = sim.spawnSquad('b', 0, 'militia', 4, 42, 42);
    sim.order({ kind: 'load', squad: b, from: { building: 1 } });
    run(sim, 1);
    expect(squad(sim, b).order).toBe('hold');
    // an enemy loots it only with none of the owner's men within CHEST.guard
    const f = sim.spawnSquad('f', 1, 'militia', 4, 80, 80);
    sim.order({ kind: 'load', squad: f, from: { building: 1 } });
    run(sim, 1);
    expect(squad(sim, f).order).toBe('hold');
    sim.order({ kind: 'move', squad: s, x: 6, y: 90 });
    sim.order({ kind: 'move', squad: b, x: 8, y: 90 });
    run(sim, 500);
    sim.order({ kind: 'load', squad: f, from: { building: 1 } });
    run(sim, 300, () => squad(sim, f).order === 'hold');
    expect(building(sim, 1).goods?.wood ?? 0).toBeLessThan(40);
  });
});

describe('M6a coin', () => {
  it('a smith at a forge L2 mints silver 1 into coin 20, and melts coin 20 back into silver 1', () => {
    expect(RECIPES.mint).toMatchObject({ at: 'forge', lv: 2, inputs: { silver: 1 }, out: { good: 'coin', n: 20 }, secs: 30 });
    expect(RECIPES.melt).toMatchObject({ at: 'forge', lv: 2, inputs: { coin: 20 }, out: { good: 'silver', n: 1 } });
    const sim = createSim(flat(96), 4);
    sim.claim(0, 40, 40, 40);
    const [, f] = raise(sim, [['camp', 30, 40], ['forge', 42, 40]]);
    for (const [r, v] of Object.entries(BUILDINGS.forge.upgrade!.cost)) sim.addStock(0, r as never, v);
    sim.order({ kind: 'upgrade', squad: f, building: 1 });
    run(sim, 6000, () => building(sim, 1).type === 'forge2' && building(sim, 1).state === 'done');
    expect(building(sim, 1).type).toBe('forge2');
    sim.order({ kind: 'move', squad: f, x: 4, y: 4 });
    sim.addStock(0, 'silver', 2);
    const smith = sim.spawnSquad('a', 0, 'civ_smith', 1, 42, 45, [makePerson('sm', 'civ_smith')]);
    sim.order({ kind: 'civWork', squad: smith, building: 1 });
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'mint' });
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'mint' });
    run(sim, 1200);
    const st = () => sim.snapshot().stock![0];
    expect(st().coin).toBe(40);
    expect(st().silver).toBe(0);
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'melt' });
    run(sim, 600);
    expect(st().coin).toBe(20);
    expect(st().silver).toBe(1);
  });
});
