/**
 * A new trader's first load on real ground, the rules a browser pass found missing (docs/WAR.md "Carts", W-215..W-218):
 *
 *  - W-215 a crew cuts wood onto its own cart; full, they take the cart up. No store in it. A node too far off goes to a store.
 *  - W-216 a cart that cannot go where it was sent says why.
 *  - W-217 a cart gone over a border leaves nothing standing.
 *  - W-218 soldiers at plain work, or crewing a rolling cart, fight when they are struck; then take the work up again.
 *  - his road out is the one nearest where his men stand, on every home.
 */
import { describe, expect, it } from 'vitest';
import { guideAbroad, guideSpots } from '../../src/war/net/guide';
import { npcGood } from '../../src/war/net/npcMarket';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { CARRY } from '../../src/war/sim/economy';
import { CART, CART_LOADS } from '../../src/war/sim/trade';
import type { RegionData } from '../../src/war/types';
import { ALLIANCES } from '../../src/war/world/alliances';
import { worldRegion } from '../../src/war/world/graph';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;
const steps = (sim: ReturnType<typeof createSim>, n: number) => { for (let t = 0; t < n; t++) sim.step(); };

/** Four men crewing a handcart beside the wood nearest the entry. */
function crew(id = 'dodona', team = 0) {
  const r = region(id), sim = createSim(r, 7), at = guideSpots(r, team).entry;
  sim.step();
  const node = sim.resourceNodes().filter((n) => n.res === 'wood' && !n.guarded).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
  const q = sim.spawnSquad('p:1', team, 'hoplite', 4, at.x, at.y);
  const c = sim.spawnCart(team, 'p:1', 'handcart', at.x + 1, at.y, q);
  sim.step();
  return { r, sim, q, c, node, cart: () => sim.snapshot().sieges!.find((e) => e.id === c)! };
}

describe('W-215 a crew cuts wood onto its cart', () => {
  it('the first drop is on the cart, nothing reaches a store; full, the crew takes the cart up', () => {
    const { sim, q, c, node, cart } = crew();
    const stored = () => (sim.snapshot().buildings ?? []).reduce((a, b) => a + (b.goods?.wood ?? 0), 0), wood0 = stored();
    sim.order({ kind: 'gather', squad: q, node: node.id, cart: c });
    sim.step();
    expect(sim.snapshot().squads.find((x) => x.id === q)!.cartDrop).toBe(c);
    let t = 0;
    while (t++ < 6000 && (cart().loads ?? 0) < CART_LOADS.handcart - 1e-6) sim.step();
    expect(cart().loads).toBeGreaterThanOrEqual(CART_LOADS.handcart - 1e-6); // pines give a little pitch on top
    expect(cart().cargo?.wood).toBeGreaterThan((CART_LOADS.handcart - 1) * CARRY);
    expect(t).toBeLessThan(3000); // about a minute or three of cutting, no walk to a town
    steps(sim, 10);
    const s = sim.snapshot().squads.find((x) => x.id === q)!;
    expect(s.order).toBe('crew');
    expect(cart().crew).toBe(q);
    expect(stored()).toBe(wood0);
  }, 60_000);

  it('a node beyond its reach, or a cart that is not his: the wood goes to a store as ever', () => {
    const { sim, q, c, node } = crew();
    const far = sim.resourceNodes().find((n) => n.res === 'wood' && !n.guarded && Math.hypot(n.x - node.x, n.y - node.y) > CART.gatherR * 2)!;
    sim.order({ kind: 'gather', squad: q, node: far.id, cart: c });
    sim.step();
    expect(sim.snapshot().squads.find((x) => x.id === q)!.cartDrop).toBeUndefined();
    const other = sim.spawnCart(0, 'p:2', 'handcart', node.x + 2, node.y);
    sim.order({ kind: 'gather', squad: q, node: node.id, cart: other });
    sim.step();
    expect(sim.snapshot().squads.find((x) => x.id === q)!.cartDrop).toBeUndefined();
  });
});

describe('W-216 a cart says why it stopped', () => {
  it('sent into the trees it stops as near as it gets and says the ground', () => {
    const { r, sim, q, cart } = crew();
    // the tile of deep forest nearest the cart
    const c = cart();
    let best = -1, bd = Infinity;
    for (let t = 0; t < r.w * r.h; t++) {
      const x = t % r.w, y = (t / r.w) | 0, d = Math.hypot(x - c.x, y - c.y);
      if (d < bd && d > 8 && r.terrain[t] === 'forest' && [t - 1, t + 1, t - r.w, t + r.w, t - 3, t + 3, t - 3 * r.w, t + 3 * r.w].every((n) => r.terrain[n] === 'forest')) (bd = d), (best = t);
    }
    const gx = (best % r.w) + 0.5, gy = ((best / r.w) | 0) + 0.5;
    sim.order({ kind: 'move', squad: q, x: gx, y: gy });
    steps(sim, 20);
    for (let t = 0; t < 5000 && cart().state === 'move'; t++) sim.step();
    expect(cart().state, `at ${cart().x},${cart().y} going to ${gx},${gy}`).toBe('idle');
    expect(Math.hypot(cart().x - gx, cart().y - gy)).toBeGreaterThan(CART.short);
    expect(cart().stopped).toBe('ground');
  });

  it('a new order takes the word back; down a road it never says it', () => {
    const { r, sim, q, cart } = crew();
    const a = guideSpots(r, 0).home;
    sim.order({ kind: 'move', squad: q, x: a.x, y: a.y });
    let said = false;
    for (let t = 0; t < 400; t++) {
      sim.step();
      said ||= !!cart().stopped;
    }
    expect(said).toBe(false);
  });
});

describe('W-217 a cart gone over a border leaves nothing standing', () => {
  it('no wreck in the snapshot, no cart to find', () => {
    const { sim, c } = crew();
    expect(sim.snapshot().sieges!.some((e) => e.id === c)).toBe(true);
    sim.stowCart(c);
    sim.step();
    expect(sim.snapshot().sieges!.some((e) => e.id === c)).toBe(false);
  });
});

describe('W-218 men fight when they are struck', () => {
  /** Six soldiers cutting wood, a pack set down on them; ticks until none stands or the pack is gone. */
  const atWork = (order: 'gather' | 'hold') => {
    const r = region('dodona-n'), sim = createSim(r, 7);
    sim.step();
    const node = sim.resourceNodes().find((x) => x.res === 'wood' && !x.guarded && x.x > 150 && x.x < 350 && x.y > 150 && x.y < 350)!;
    const q = sim.spawnSquad('p:1', 0, 'hoplite', 6, node.x + 3, node.y);
    sim.step();
    if (order === 'gather') sim.order({ kind: 'gather', squad: q, node: node.id });
    steps(sim, 100);
    sim.addLair({ kind: 'wolf', x: node.x + 6, y: node.y + 2, count: 4 });
    return { sim, q, node };
  };

  it('six soldiers cutting wood beat four wolves as they would standing, then go back to cutting', () => {
    const { sim, q } = atWork('gather');
    let struck = false, t = 0;
    const pack = () => (sim.snapshot().lairs ?? []).at(-1)!;
    for (; t < 1500 && pack().state !== 'cleared'; t++) {
      sim.step();
      struck ||= sim.snapshot().units.some((u) => u.squad === q && u.state === 'attack');
    }
    expect(struck, 'they fought').toBe(true);
    expect(pack().state, 'they won').toBe('cleared');
    expect(sim.snapshot().units.filter((u) => u.squad === q && u.state !== 'dead').length).toBeGreaterThanOrEqual(3);
    steps(sim, 200);
    expect(sim.snapshot().squads.find((x) => x.id === q)!.order, 'back to the tree').toBe('gather');
  }, 60_000);

  it('an order of his own ends the going back', () => {
    const { sim, q, node } = atWork('gather');
    const pack = () => (sim.snapshot().lairs ?? []).at(-1)!;
    for (let t = 0; t < 1500 && pack().state !== 'cleared'; t++) sim.step();
    sim.order({ kind: 'move', squad: q, x: node.x + 10, y: node.y });
    steps(sim, 200);
    expect(sim.snapshot().squads.find((x) => x.id === q)!.order).not.toBe('gather');
  }, 60_000);

  it('a crew bitten on the road stops its cart and fights', () => {
    const { r, sim, q, cart } = crew();
    const a = guideSpots(r, 0).home;
    sim.order({ kind: 'move', squad: q, x: a.x, y: a.y });
    steps(sim, 100);
    const c0 = cart();
    sim.addLair({ kind: 'wolf', x: c0.x + 3, y: c0.y + 3, count: 3 });
    let fought = false, halted = false;
    for (let t = 0; t < 400; t++) {
      sim.step();
      const s = sim.snapshot();
      fought ||= s.units.some((u) => u.squad === q && u.state === 'attack');
      halted ||= cart().stopped === 'foe';
    }
    expect(fought).toBe(true);
    expect(halted).toBe(true);
  }, 60_000);
});

describe('his road out, on every home', () => {
  for (const [team, al] of Object.entries(ALLIANCES)) {
    it(`${al.home}: from where his men stand the guide takes the road next to them, to a town that buys wood`, () => {
      const r = region(al.home), at = guideSpots(r, Number(team)).entry;
      const near = guideAbroad(al.home, r, at)!;
      expect(worldRegion(al.home)!.adj).toContain(near.region);
      expect(Math.hypot(near.exit.x - at.x, near.exit.y - at.y)).toBeLessThan(40);
      expect(npcGood(near.region, 'wood')).toBeTruthy();
    });
  }
});
