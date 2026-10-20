/** M6c loot piles (docs/WAR.md "Loot piles", W-46): the fall table, merge, pick-up by any side, salvage, decay, fire. */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS } from '../../src/war/sim/economy';
import { loads } from '../../src/war/sim/holders';
import { makePerson } from '../../src/war/sim/roster';
import { CAPTURE_R } from '../../src/war/sim/soldiers';
import { createPiles, PILE, PORTER } from '../../src/war/sim/trade';
import type { WarBuildSim, WarPerson } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const alive = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  return snap.squads[squad].units.filter((id) => snap.units[id].state !== 'dead').length;
};
const men = (p: string, cls: string, n: number, end: number): WarPerson[] =>
  Array.from({ length: n }, (_, k) => makePerson(`${p}${k}`, cls, { tier: 1, rarity: 'common' })).map((x) => ({ ...x, hero: { ...x.hero, attrs: { ...x.hero.attrs, end } } }));
const pileSum = (sim: WarBuildSim) => {
  const ps = sim.snapshot().piles ?? [];
  return { wood: ps.reduce((n, p) => n + (p.goods.wood ?? 0), 0), items: ps.reduce((n, p) => n + p.items, 0), n: ps.length };
};

/** A camp of team 0 (building 0), and a squad of persons who each carry a load of wood in their packs. */
function porters(ps: WarPerson[], seed = 1) {
  const sim = createSim(flat(96), seed);
  sim.claim(0, 30, 30, 20);
  const b = sim.spawnSquad('a', 0, 'militia', 12, 30, 36);
  sim.order({ kind: 'placeBuilding', squad: b, type: 'camp', x: 30, y: 30 });
  run(sim, 2000, () => building(sim, 0)?.state === 'done');
  sim.order({ kind: 'move', squad: b, x: 5, y: 90 });
  sim.addStock(0, 'wood', 10 * ps.length);
  const s = sim.spawnSquad('a', 0, 'x', 0, 30, 36, ps);
  sim.order({ kind: 'load', squad: s, from: { building: 0 }, res: 'wood' });
  run(sim, 600, () => sim.snapshot().squads[s].order === 'hold');
  expect(sim.snapshot().units.filter((u) => u.squad === s).every((u) => u.pack === 1)).toBe(true);
  sim.order({ kind: 'move', squad: s, x: 60, y: 60 });
  run(sim, 500);
  return { sim, s };
}

describe('M6c the fall table', () => {
  it('killed: his load and his worn kit (-25 condition) to a pile', () => {
    const ps = men('k', 'hoplite', 6, 0);
    const kit = Object.keys(ps[0].hero.equip).length;
    const { sim, s } = porters(ps);
    const f = sim.spawnSquad('f', 1, 'royal_guard', 12, 60, 68);
    sim.order({ kind: 'attack', squad: f, target: s });
    run(sim, 3000, () => alive(sim, s) === 0);
    const dead = sim.snapshot().units.filter((u) => u.squad === s && u.state === 'dead');
    const killed = dead.filter((u) => u.wounded === false).length;
    expect(dead).toHaveLength(6);
    const sum = pileSum(sim);
    expect(sum.wood).toBeCloseTo(10 * 6); // every fallen man's load
    expect(sum.items).toBe(killed * kit); // the killed men's kit only
  });

  it('wounded and carried off: his load to a pile, his kit kept; captured: the kit too, at the capture tile', () => {
    const ps = men('w', 'militia', 6, 15);
    const kit = Object.keys(ps[0].hero.equip).length;
    const { sim, s } = porters(ps, 3);
    const f = sim.spawnSquad('f', 1, 'royal_guard', 12, 60, 68);
    sim.order({ kind: 'attack', squad: f, target: s });
    run(sim, 3000, () => alive(sim, s) === 0);
    const killed = sim.snapshot().units.filter((u) => u.squad === s && u.wounded === false).length;
    const before = pileSum(sim);
    expect(before.wood).toBeCloseTo(60);
    expect(before.items).toBe(killed * kit);
    sim.order({ kind: 'hold', squad: f });
    run(sim, 1);
    const r = sim.endFight(); // no friend within CAPTURE_R: the wounded are taken
    const caught = r.persons.filter((p) => p.state === 'captive');
    expect(caught.length).toBeGreaterThan(0);
    for (const p of caught) expect(Object.keys(p.hero.equip)).toHaveLength(0);
    expect(pileSum(sim).items).toBe(before.items + caught.length * kit);
    expect(CAPTURE_R).toBeGreaterThan(0);
  });
});

describe('M6c pile rules', () => {
  const region = { ...flat(32), safe: [{ x: 20, y: 20, w: 8, h: 8 }] };
  it('piles within a tile merge up to 8 loads; none in a safe zone; gone after 15 min', () => {
    const P = createPiles(region);
    const a = P.drop(5, 5, [{ r: 'wood', n: 30, o: 't' }], [], 0)!;
    const b = P.drop(5.5, 5.5, [{ r: 'wood', n: 40, o: 't' }], [], 10)!;
    expect(b).toBe(a);
    expect(loads(a.hold)).toBeCloseTo(7);
    const c = P.drop(5.2, 5, [{ r: 'stone', n: 20, o: 't' }], [], 20)!;
    expect(c).not.toBe(a); // 9 loads would be past PILE.max
    expect(P.drop(22, 22, [{ r: 'wood', n: 10, o: 't' }], [], 0)).toBeNull();
    P.tick(PILE.decay + 9); // a merge refreshes the pile's time
    expect(P.piles.map((p) => p.id)).toEqual([a.id, c.id]);
    P.tick(PILE.decay + 15);
    expect(P.piles.map((p) => p.id)).toEqual([c.id]);
    P.tick(PILE.decay + 21);
    expect(P.piles).toHaveLength(0);
  });

  it('any side picks a pile up, one load a man every 2 s, first hands win; a smith salvages an item in place', () => {
    const ps = men('k', 'hoplite', 4, 0);
    const { sim, s } = porters(ps, 5);
    const f = sim.spawnSquad('f', 1, 'royal_guard', 12, 60, 68);
    sim.order({ kind: 'attack', squad: f, target: s });
    run(sim, 3000, () => alive(sim, s) === 0);
    sim.order({ kind: 'move', squad: f, x: 90, y: 90 });
    run(sim, 400);
    const pile = (sim.snapshot().piles ?? []).find((p) => (p.goods.wood ?? 0) > 0 && p.items > 0)!;
    expect(pile).toBeDefined();
    const wood0 = pile.goods.wood!, items0 = pile.items;
    // a squad of each side takes from it at once: nothing is taken twice
    const a = sim.spawnSquad('a', 0, 'militia', 4, pile.x - 2, pile.y);
    const b = sim.spawnSquad('b', 1, 'militia', 4, pile.x + 2, pile.y);
    sim.order({ kind: 'load', squad: a, from: { pile: pile.id } });
    sim.order({ kind: 'load', squad: b, from: { pile: pile.id } });
    run(sim, 6 * PORTER.every);
    const packs = sim.snapshot().units.filter((u) => u.squad === a || u.squad === b).reduce((n, u) => n + (u.pack ?? 0), 0);
    const left = sim.snapshot().piles?.find((p) => p.id === pile.id);
    const leftLoads = left ? left.loads : 0;
    expect(packs + leftLoads).toBeCloseTo(wood0 / 10 + items0 / 5);
    expect(packs).toBeGreaterThan(0);
  });

  it('a smith salvages a pile item in place into some of its goods', () => {
    const ps = men('k', 'hoplite', 4, 0);
    const { sim, s } = porters(ps, 6);
    const f = sim.spawnSquad('f', 1, 'royal_guard', 12, 60, 68);
    sim.order({ kind: 'attack', squad: f, target: s });
    run(sim, 3000, () => alive(sim, s) === 0);
    sim.order({ kind: 'move', squad: f, x: 90, y: 90 });
    run(sim, 400);
    // the killed men's kit lies there by uid (`<person>-<slot>`); find one of them in a pile
    const dead = sim.endFight().persons.filter((p) => p.state === 'dead').map((p) => p.pid);
    expect(dead.length).toBeGreaterThan(0);
    const slot = Object.keys(ps[0].hero.equip)[0];
    const uid = `${dead[0]}-${slot}`;
    const ps0 = sim.snapshot().piles ?? [];
    let found = -1;
    for (const p of ps0) {
      sim.order({ kind: 'salvagePile', squad: sim.spawnSquad('a', 0, 'civ_smith', 1, p.x, p.y + 1, [makePerson(`sm${p.id}`, 'civ_smith')]), pile: p.id, uid });
      run(sim, 1);
      const sq = sim.snapshot().squads.at(-1)!;
      if (sq.order === 'salvagePile') {
        found = p.id;
        break;
      }
      sim.order({ kind: 'move', squad: sq.id, x: 2, y: 2 });
    }
    expect(found).toBeGreaterThanOrEqual(0);
    const before = ps0.find((p) => p.id === found)!;
    run(sim, PILE.salvage + 300);
    const after = sim.snapshot().piles!.find((p) => p.id === found)!;
    expect(after.items).toBe(before.items - 1);
    const goods = (p: typeof after) => Object.values(p.goods).reduce((a, b) => a + (b ?? 0), 0);
    expect(goods(after)).toBeGreaterThan(goods(before));
    expect(BUILDINGS.chest.chest).toBe(8);
  });
});

describe('M6c fire', () => {
  it('a burnt chest leaves its contents in a pile, fire spoiling half the goods', () => {
    const sim = createSim(flat(96), 9);
    sim.claim(0, 30, 30, 20);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 30, 36);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 30, y: 30 });
    run(sim, 2000, () => building(sim, 0)?.state === 'done');
    sim.addStock(0, 'wood', 100);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'chest', x: 38, y: 30 });
    run(sim, 1500, () => building(sim, 1)?.state === 'done');
    sim.order({ kind: 'load', squad: s, from: { building: 0 }, res: 'wood', n: 40 });
    run(sim, 400, () => sim.snapshot().squads[s].order === 'hold');
    sim.order({ kind: 'unload', squad: s, to: { building: 1 } });
    run(sim, 400, () => sim.snapshot().squads[s].order === 'hold');
    expect(building(sim, 1).goods?.wood).toBeCloseTo(40);
    sim.order({ kind: 'move', squad: s, x: 5, y: 90 });
    run(sim, 600);
    const f = sim.spawnSquad('f', 1, 'militia', 4, 40, 34);
    sim.order({ kind: 'ignite', squad: f, building: 1 });
    run(sim, 6000, () => building(sim, 1).state === 'destroyed');
    expect(building(sim, 1).state).toBe('destroyed');
    expect(pileSum(sim).wood).toBeCloseTo(20);
  });
});
