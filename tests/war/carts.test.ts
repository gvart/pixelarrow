/** M6b carts and escort (docs/WAR.md "Carts"): workshop recipes, ground rules, cap, quota, load, capture, wreck, escort. */
import { describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { CIV_QUOTA } from '../../src/war/sim/civilians';
import { BUILDINGS } from '../../src/war/sim/economy';
import { buildGrid, canEnter, CART_UPHILL, stepCost } from '../../src/war/sim/grid';
import { makePerson } from '../../src/war/sim/roster';
import { SIEGE } from '../../src/war/sim/siege';
import { CART, CART_LOADS } from '../../src/war/sim/trade';
import type { BuildingType, RegionData, SiegeSnap, TerrainKind, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const carts = (sim: WarBuildSim): SiegeSnap[] => (sim.snapshot().sieges ?? []).filter((e) => e.type === 'handcart' || e.type === 'wagon');
const cart = (sim: WarBuildSim, id: number) => sim.snapshot().sieges!.find((e) => e.id === id)!;

/** A camp (0) and a workshop (1) of team 0, an engineer of `owner` at the workshop making `n` handcarts. */
function withCarts(n: number, owner = 'a', seed = 1): WarBuildSim {
  const sim = createSim(flat(96), seed);
  sim.claim(0, 40, 40, 40);
  const types: BuildingType[] = ['camp', 'workshop'];
  for (const t of types) for (const [r, v] of Object.entries(BUILDINGS[t].cost)) sim.addStock(0, r as never, v);
  const ss = types.map((t, i) => {
    const s = sim.spawnSquad(owner, 0, 'militia', 12, 30 + i * 10, 46);
    sim.order({ kind: 'placeBuilding', squad: s, type: t, x: 30 + i * 10, y: 40 });
    return s;
  });
  run(sim, 8000, () => types.every((_, i) => building(sim, i)?.state === 'done'));
  for (const s of ss) sim.order({ kind: 'move', squad: s, x: 10, y: 80 + s });
  for (let k = 0; k < n; k++) for (const [r, v] of Object.entries(RECIPES.handcart.inputs)) sim.addStock(0, r as never, v);
  const eng = sim.spawnSquad(owner, 0, 'civ_engineer', 1, 40, 45, [makePerson(`${owner}-eng`, 'civ_engineer')]);
  sim.order({ kind: 'civWork', squad: eng, building: 1 });
  for (let k = 0; k < n; k++) sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'handcart' });
  run(sim, 900 * n, () => carts(sim).length >= Math.min(n, CART.cap));
  return sim;
}

describe('M6b ground rules', () => {
  const region = (terrain: TerrainKind[], water: (0 | 1 | 2)[] = terrain.map(() => 0), height = terrain.map(() => 1)): RegionData =>
    ({ id: 'g', name: 'g', w: terrain.length, h: 1, height, terrain, water, entries: [], noBuild: [] });
  const step = (r: RegionData, a: number, b: number) => {
    const g = buildGrid(r);
    g.cart = g.engine = true;
    const ok = canEnter(g, a, b), c = stepCost(g, a, b);
    return { ok, c };
  };
  it('road x1.3, ford and sand x0.5, uphill x0.6; forest and marsh only on a road', () => {
    expect(step(region(['grass', 'road']), 0, 1).c).toBeCloseTo(1 / 1.3);
    expect(step(region(['grass', 'grass'], [0, 1]), 0, 1).c).toBeCloseTo(2);
    expect(step(region(['grass', 'sand']), 0, 1).c).toBeCloseTo(2);
    expect(step(region(['grass', 'grass'], [0, 0], [1, 2]), 0, 1).c).toBeCloseTo(CART_UPHILL);
    expect(CART_UPHILL).toBeCloseTo(1 / 0.6);
    expect(step(region(['grass', 'forest']), 0, 1).ok).toBe(false);
    expect(step(region(['grass', 'marsh']), 0, 1).ok).toBe(false);
    expect(step(region(['road', 'road']), 0, 1).ok).toBe(true);
  });
  it('no stairs, walkways or ladders; a bridge under 2 wide is closed', () => {
    const r = region(['grass', 'grass', 'grass']);
    const g = buildGrid(r);
    g.cart = g.engine = true;
    g.deck[1] = 2; // a stair
    expect(canEnter(g, 0, 1)).toBe(false);
    g.deck[1] = 0;
    g.narrow[1] = 1;
    expect(canEnter(g, 0, 1)).toBe(false);
    g.narrow[1] = 0;
    expect(canEnter(g, 0, 1)).toBe(true);
    g.cart = g.engine = false;
    g.narrow[1] = 1;
    expect(canEnter(g, 0, 1)).toBe(true); // men cross a footbridge
  });
});

describe('M6b carts', () => {
  it('handcart and wagon recipes at a workshop; carts in the civilian quota; a player has at most CART.cap', () => {
    expect(RECIPES.handcart).toMatchObject({ kind: 'cart', at: 'workshop', lv: 1, inputs: { wood: 30, hides: 2 }, secs: 60 });
    expect(RECIPES.wagon).toMatchObject({ kind: 'cart', at: 'workshop', lv: 2, inputs: { wood: 80, bronze: 4, hides: 6, food: 40 }, secs: 180 });
    expect(SIEGE.handcart).toMatchObject({ hp: 200, crew: 2 });
    expect(SIEGE.wagon).toMatchObject({ hp: 450, crew: 1 });
    expect(CART_LOADS).toEqual({ handcart: 6, wagon: 12 });
    const sim = withCarts(CART.cap + 1);
    run(sim, 1500);
    const cs = carts(sim);
    expect(cs).toHaveLength(CART.cap); // the third waits in the queue
    for (const c of cs) expect(c).toMatchObject({ owner: 'a', team: 0, state: 'idle', cap: 6 });
    expect(building(sim, 1).queue?.length).toBe(1);
    // the quota: civilians and carts together
    const room = Math.floor(CIV_QUOTA / 1) - 1 - CART.cap;
    const civ = sim.spawnSquad('a', 0, 'civ_cook', 12, 50, 60);
    expect(civ).toBeGreaterThanOrEqual(0);
    expect(sim.snapshot().squads[civ].units.length).toBe(Math.min(12, room));
  });

  it('two men pull a handcart, one alone at half pace; it takes loads at a store; a foe beside it with none of its side near takes it; it is taken back', () => {
    const sim = withCarts(1);
    const c = carts(sim)[0];
    sim.addStock(0, 'wood', 40);
    const pull = sim.spawnSquad('a', 0, 'militia', 2, c.x, c.y + 1);
    sim.order({ kind: 'crew', squad: pull, siege: c.id });
    run(sim, 20);
    sim.order({ kind: 'load', squad: pull, from: { building: 0 }, res: 'wood' });
    run(sim, 1500, () => sim.snapshot().squads[pull].order === 'hold');
    expect(cart(sim, c.id).cargo?.wood).toBeCloseTo(40);
    // pace: two pullers vs one
    const pace = (n: number) => {
      const s2 = withCarts(1, 'a', 7);
      const k = carts(s2)[0];
      const q = s2.spawnSquad('a', 0, 'militia', n, k.x, k.y + 1);
      s2.order({ kind: 'crew', squad: q, siege: k.id });
      run(s2, 20);
      const x0 = cart(s2, k.id).x;
      s2.order({ kind: 'move', squad: q, x: k.x + 30, y: k.y });
      run(s2, 100);
      return cart(s2, k.id).x - x0;
    };
    const two = pace(2), one = pace(1);
    expect(two).toBeGreaterThan(0);
    expect(one / two).toBeGreaterThan(0.35);
    expect(one / two).toBeLessThan(0.65);
    // capture: the pullers walk off, a foe stands beside it CART.capture ticks
    sim.order({ kind: 'uncrew', squad: pull });
    for (const s of sim.snapshot().squads) if (s.team === 0) sim.order({ kind: 'move', squad: s.id, x: 6, y: 90 }); // every man of its side
    run(sim, 600);
    const k = cart(sim, c.id);
    const foe = sim.spawnSquad('f', 1, 'militia', 1, k.x + 1, k.y);
    sim.order({ kind: 'hold', squad: foe });
    run(sim, CART.capture + 20);
    expect(cart(sim, c.id)).toMatchObject({ team: 1, owner: 'f' });
    expect(sim.events().some((e) => e.kind === 'cartCaptured' && e.cart === c.id && e.owner === 'f')).toBe(true);
    expect(cart(sim, c.id).cargo?.wood).toBeCloseTo(40);
    // taken back the same way once the foe is gone
    sim.order({ kind: 'move', squad: foe, x: 90, y: 90 });
    run(sim, 500);
    const back = sim.spawnSquad('a', 0, 'militia', 1, k.x - 1, k.y);
    sim.order({ kind: 'hold', squad: back });
    run(sim, CART.capture + 20);
    expect(cart(sim, c.id)).toMatchObject({ team: 0, owner: 'a' });
  });

  it('a wrecked cart leaves its cargo in a pile; it halts while a foe is near', () => {
    const sim = withCarts(1);
    const c = carts(sim)[0];
    sim.addStock(0, 'wood', 30);
    const pull = sim.spawnSquad('a', 0, 'militia', 2, c.x, c.y + 1);
    sim.order({ kind: 'crew', squad: pull, siege: c.id });
    run(sim, 20);
    sim.order({ kind: 'load', squad: pull, from: { building: 0 }, res: 'wood' });
    run(sim, 1500, () => sim.snapshot().squads[pull].order === 'hold');
    const k = cart(sim, c.id);
    const foe = sim.spawnSquad('f', 1, 'hoplite', 12, k.x + 6, k.y + 6);
    run(sim, 10);
    expect(cart(sim, c.id).halted).toBe(true);
    sim.order({ kind: 'attackBuilding', squad: foe, siege: c.id });
    run(sim, 3000, () => cart(sim, c.id).state === 'destroyed');
    expect(cart(sim, c.id).state).toBe('destroyed');
    const piles = sim.snapshot().piles ?? [];
    expect(piles.reduce((n, p) => n + (p.goods.wood ?? 0), 0)).toBeCloseTo(30);
  });

  it('escort: the squad keeps round its cart and takes on foes near it', () => {
    const sim = withCarts(1);
    const c = carts(sim)[0];
    const pull = sim.spawnSquad('a', 0, 'militia', 2, c.x, c.y + 1);
    sim.order({ kind: 'crew', squad: pull, siege: c.id });
    const guard = sim.spawnSquad('a', 0, 'hoplite', 12, c.x - 4, c.y + 4);
    sim.order({ kind: 'escort', squad: guard, cart: c.id });
    run(sim, 20);
    sim.order({ kind: 'move', squad: pull, x: c.x + 30, y: c.y + 20 });
    run(sim, 400);
    const k = cart(sim, c.id), g = sim.snapshot().squads[guard];
    const gx = g.units.map((id) => sim.snapshot().units[id]).reduce((a, u) => a + u.x, 0) / g.units.length;
    expect(Math.abs(gx - k.x)).toBeLessThan(8);
    expect(g.order).toBe('escort');
    const foe = sim.spawnSquad('f', 1, 'militia', 6, k.x + 8, k.y);
    run(sim, 400);
    expect(sim.snapshot().squads[foe].units.filter((id) => sim.snapshot().units[id].state === 'dead').length).toBeGreaterThan(0);
  });
});
