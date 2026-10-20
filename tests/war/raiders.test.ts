/** M6j trade bots (src/war/sim/bots.ts): raiders on an ambush rect, escort and haul bots, bandit lairs; the escort ring. */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots, lairSites } from '../../src/war/sim/bots';
import type { SiegeSnap, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const cart = (sim: WarBuildSim, id: number) => sim.snapshot().sieges!.find((e) => e.id === id) as SiegeSnap;
const dead = (sim: WarBuildSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state === 'dead').length;

describe('M6j raiders', () => {
  it('a raider band captures an unescorted cart and pulls it back to its ambush', () => {
    const sim = createSim(flat(96), 1);
    const bots = createBots(sim);
    const c = sim.spawnCart(0, 'a', 'handcart', 50.5, 50.5);
    const raid = sim.spawnSquad('r', 1, 'militia', 6, 44, 48);
    bots.set(raid, { kind: 'raider', x: 40, y: 44, w: 8, h: 8 });
    let t = 0;
    for (; t < 2000 && cart(sim, c).team !== 1; t++) { sim.step(); bots.tick(); }
    expect(cart(sim, c)).toMatchObject({ team: 1, owner: 'r' });
    expect(sim.events().some((e) => e.kind === 'cartCaptured' && e.cart === c)).toBe(true);
    for (let k = 0; k < 1500; k++) { sim.step(); bots.tick(); }
    const k = cart(sim, c);
    expect(Math.hypot(k.x - 44, k.y - 48)).toBeLessThan(5); // crewed and pulled home
  });

  it('a 12-man escort beats it off: the hauled cart stays its owner\'s and gets through', () => {
    const sim = createSim(flat(96), 2);
    const bots = createBots(sim);
    const c = sim.spawnCart(0, 'a', 'handcart', 30.5, 50.5);
    const pullers = sim.spawnSquad('a', 0, 'militia', 2, 30, 52);
    const guard = sim.spawnSquad('a', 0, 'hoplite', 12, 26, 50);
    bots.set(pullers, { kind: 'haul', cart: c, path: [[50, 50], [80, 50]] });
    bots.set(guard, { kind: 'escort', cart: c });
    const raid = sim.spawnSquad('r', 1, 'militia', 6, 60, 46);
    bots.set(raid, { kind: 'raider', x: 56, y: 42, w: 10, h: 8 });
    let lost = false;
    for (let t = 0; t < 6000 && bots.phase(pullers) !== 'arrived'; t++) {
      sim.step();
      bots.tick();
      if (cart(sim, c).team !== 0) lost = true;
    }
    expect(lost).toBe(false);
    expect(dead(sim, raid)).toBeGreaterThanOrEqual(4);
    expect(bots.phase(pullers)).toBe('arrived');
    expect(Math.hypot(cart(sim, c).x - 80, cart(sim, c).y - 50)).toBeLessThan(4);
  });

  it('bandit lairs sit on coast tracks', () => {
    const r = flat(96);
    for (let x = 0; x < 96; x++) { r.water[10 * 96 + x] = 2; r.terrain[12 * 96 + x] = 'road'; }
    const sites = lairSites(r, 2);
    expect(sites.length).toBe(2);
    for (const [, y] of sites) expect(Math.floor(y)).toBe(12);
    expect(Math.hypot(sites[0][0] - sites[1][0], sites[0][1] - sites[1][1])).toBeGreaterThanOrEqual(40);
    expect(lairSites(flat(64))).toEqual([]);
  });
});

describe('M6b escort ring', () => {
  it('escorts at rest keep a ring about 3 tiles out round the cart', () => {
    const sim = createSim(flat(96), 3);
    const c = sim.spawnCart(0, 'a', 'wagon', 50.5, 50.5);
    const guard = sim.spawnSquad('a', 0, 'hoplite', 12, 44, 54);
    sim.order({ kind: 'escort', squad: guard, cart: c });
    for (let t = 0; t < 400; t++) sim.step();
    const k = cart(sim, c);
    const d = sim.snapshot().units.filter((u) => u.squad === guard).map((u) => Math.hypot(u.x - k.x, u.y - k.y));
    expect(Math.min(...d)).toBeGreaterThanOrEqual(2.3);
    expect(d.reduce((a, v) => a + v, 0) / d.length).toBeGreaterThan(2.6);
    expect(Math.max(...d)).toBeLessThan(4.5);
  });
});
