/** M5h2 crafting in the war sim (docs/WAR.md "Crafting and professions"): workplaces, queues, outputs, gates, dishes, remedies. */
import { describe, expect, it } from 'vitest';
import { DISHES, FED_CAP, RECIPES, type Product } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { CIV, fallShare, PHYSICIAN, REMEDY, VENOM } from '../../src/war/sim/civilians';
import { CRAFT, fedOf } from '../../src/war/sim/crafting';
import { BUILDINGS } from '../../src/war/sim/economy';
import { warStatsOf } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';
import type { BuildingType, WarBuildSim, WarEvent, WarPerson } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const stock = (sim: WarBuildSim) => sim.snapshot().stock![0] ?? {};

/** A camp (building 0) and done workplaces of team 0 (ids 1..n) on claimed ground, raised by militia who then leave. */
function withWorkplaces(wps: BuildingType[], seed = 1): WarBuildSim {
  const types: BuildingType[] = ['camp', ...wps];
  const sim = createSim(flat(96), seed);
  sim.claim(0, 40, 40, 40);
  for (const t of types) for (const [r, v] of Object.entries(BUILDINGS[t].cost)) sim.addStock(0, r as never, v);
  const squads = types.map((t, i) => {
    const s = sim.spawnSquad('a', 0, 'militia', 12, 30 + i * 10, 46);
    sim.order({ kind: 'placeBuilding', squad: s, type: t, x: 30 + i * 10, y: 40 });
    return s;
  });
  run(sim, 8000, () => types.every((_, i) => building(sim, i)?.state === 'done'));
  for (let i = 0; i < types.length; i++) expect(building(sim, i).state).toBe('done');
  for (const s of squads) sim.order({ kind: 'move', squad: s, x: 4, y: 4 + s });
  run(sim, 300);
  return sim;
}
const civAt = (sim: WarBuildSim, b: number, p: WarPerson) => {
  const at = building(sim, b);
  const s = sim.spawnSquad('a', 0, p.hero.cls!, 1, at.x, at.y + 3, [p]);
  sim.order({ kind: 'civWork', squad: s, building: b });
  run(sim, 100);
  return s;
};
const crafted = (evs: WarEvent[]) => evs.filter((e): e is Extract<WarEvent, { kind: 'crafted' }> => e.kind === 'crafted');

describe('M5h2 workplaces', () => {
  it('six chains of up to 3 levels by upgrade, the sorting floor from the storehouse', () => {
    for (const k of ['forge', 'cookhouse', 'infirmary', 'workshop', 'stall'] as const) {
      const ids = [k, `${k}2`, `${k}3`] as BuildingType[];
      ids.forEach((id, i) => expect(BUILDINGS[id].workplace).toMatchObject({ kind: k === 'stall' ? 'stall' : k, level: i + 1 }));
      expect(BUILDINGS[ids[0]].upgrade!.to).toBe(ids[1]);
      expect(BUILDINGS[ids[1]].upgrade!.to).toBe(ids[2]);
    }
    expect(BUILDINGS.storehouse.upgrade!.to).toBe('sortingFloor');
    expect(BUILDINGS.sortingFloor2.store).toBe(true);
  });

  it('every level has a station for each crafter slot, inside its footprint', () => {
    for (const def of Object.values(BUILDINGS)) {
      const wp = def.workplace;
      if (!wp?.spots) continue;
      expect(wp.spots.length).toBeGreaterThanOrEqual(wp.level);
      for (const [x, y, fx, fy] of wp.spots) for (const [a, n] of [[x, def.w], [y, def.h], [fx, def.w], [fy, def.h]]) expect(a > 0 && a < n).toBe(true);
    }
  });

  it('a smith walks inside the forge to its anvil and works there facing it; a foe cannot follow him in', () => {
    const sim = withWorkplaces(['forge']);
    const f = building(sim, 1), x0 = f.x - f.w / 2, y0 = f.y - f.h / 2;
    const [sx, sy, ax, ay] = BUILDINGS.forge.workplace!.spots![0];
    const s = civAt(sim, 1, makePerson('s1', 'civ_smith', { level: 1, name: 'Nikias' }));
    run(sim, 400);
    const u = sim.snapshot().units.find((v) => v.squad === s)!;
    expect(Math.hypot(u.x - (x0 + sx), u.y - (y0 + sy))).toBeLessThan(0.5);
    expect(u.work).toBe('forge');
    expect(Math.cos(u.facing - Math.atan2(y0 + ay - u.y, x0 + ax - u.x))).toBeGreaterThan(0.95);
    const foe = sim.spawnSquad('b', 1, 'militia', 1, f.x, f.y + 6);
    sim.order({ kind: 'move', squad: foe, x: x0 + sx, y: y0 + sy });
    run(sim, 400);
    const e = sim.snapshot().units.find((v) => v.squad === foe)!;
    expect(e.x > x0 && e.x < x0 + f.w && e.y > y0 && e.y < y0 + f.h).toBe(false);
  });
});

describe('M5h2 crafting', () => {
  it('a bladesmith forges a sword: inputs out at the start, an item event after secs / workRate', () => {
    const sim = withWorkplaces(['forge']);
    const smith = makePerson('s1', 'civ_smith', { level: 3, name: 'Nikias' });
    smith.hero.perks = ['bladesmith'] as never;
    civAt(sim, 1, smith);
    sim.addStock(0, 'bronze', 5);
    sim.addStock(0, 'wood', 10);
    sim.events();
    const r = RECIPES['item:xiphos'];
    expect(r.inputs).toEqual({ bronze: 3, wood: 2 });
    const before = stock(sim);
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: r.id });
    run(sim, CIV.every + 1);
    expect(stock(sim).bronze).toBeCloseTo((before.bronze ?? 0) - 3);
    expect(building(sim, 1).queue).toHaveLength(1);
    const ticks = run(sim, 2000, () => !building(sim, 1).queue);
    const want = (r.secs / warStatsOf(smith).work!) * 10;
    expect(Math.abs(ticks - want)).toBeLessThanOrEqual(2 * CIV.every);
    const [ev] = crafted(sim.events());
    expect(ev).toMatchObject({ what: 'craft', owner: 'a', pid: 's1', recipe: 'item:xiphos', team: 0 });
    expect(ev.item).toMatchObject({ def: 'xiphos', mk: 'Nikias' });
  });

  it('level and node gates refuse; the queue holds at most 5', () => {
    const sim = withWorkplaces(['forge']);
    civAt(sim, 1, makePerson('s1', 'civ_smith', { level: 3 })); // root only: no Bladesmith
    sim.addStock(0, 'bronze', 50);
    sim.addStock(0, 'wood', 50);
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'item:bronze_dory' }); // tier 2: forge L2
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'ration' }); // a cookhouse recipe
    run(sim, 1);
    expect(building(sim, 1).queue).toBeUndefined();
    for (let i = 0; i < 7; i++) sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'item:xiphos' });
    run(sim, 300);
    const q = building(sim, 1).queue!;
    expect(q).toHaveLength(CRAFT.queue);
    expect(q.every((o) => o.by === -1)).toBe(true); // nobody holds the node: nothing starts
    expect(stock(sim).bronze).toBe(50);
    sim.order({ kind: 'cancelCraft', team: 0, building: 1, order: q[0].id });
    run(sim, 1);
    expect(building(sim, 1).queue).toHaveLength(CRAFT.queue - 1);
  });

  it('smelting (a good) goes to the stock, Alloy x1.2; crafter XP per job', () => {
    const sim = withWorkplaces(['forge']);
    const smith = makePerson('s1', 'civ_smith', { level: 4 });
    smith.hero.perks = ['alloy'] as never;
    civAt(sim, 1, smith);
    sim.addStock(0, 'copper', 1);
    sim.addStock(0, 'tin', 1);
    const b0 = stock(sim).bronze ?? 0;
    sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'smelt' });
    run(sim, 400, () => !building(sim, 1).queue);
    expect((stock(sim).bronze ?? 0) - b0).toBeCloseTo(2 * CRAFT.alloy);
    const rep = sim.endFight().persons.find((p) => p.pid === 's1')!;
    expect(rep.xp).toBeGreaterThanOrEqual(RECIPES.smelt.xp);
  });

  it('remedies and dishes go to the team supplies; squads near take bandages and eat', () => {
    const sim = withWorkplaces(['infirmary', 'cookhouse']);
    civAt(sim, 1, makePerson('p1', 'civ_physician'));
    civAt(sim, 2, makePerson('c1', 'civ_cook'));
    sim.addStock(0, 'linen', 4);
    sim.addStock(0, 'food', 40);
    for (let i = 0; i < 4; i++) sim.order({ kind: 'craft', team: 0, building: 1, recipe: 'bandage' });
    for (let i = 0; i < 3; i++) sim.order({ kind: 'craft', team: 0, building: 2, recipe: 'ration' });
    run(sim, 1500, () => !building(sim, 1).queue && !building(sim, 2).queue);
    const sup = sim.snapshot().supplies![0];
    expect(sup.bandage).toBe(12);
    expect(sup.ration).toBe(12);
    // a squad of 6 between them: refills its bandages and eats the rations
    const inf = building(sim, 1), ck = building(sim, 2);
    const s = sim.spawnSquad('a', 0, 'militia', 6, (inf.x + ck.x) / 2, inf.y + 4);
    run(sim, 2 * CIV.every);
    const snap = sim.snapshot().squads[s];
    expect(snap.bandages).toBe(6);
    expect(snap.fed).toBe(true);
    expect(snap.dish).toBe('ration');
  });

  it('repair mends to max condition (below 50: max -5); salvage returns 30% of the inputs', () => {
    const sim = withWorkplaces(['forge']);
    civAt(sim, 1, makePerson('s1', 'civ_smith', { level: 3 }));
    sim.addStock(0, 'iron', 10);
    sim.events();
    sim.order({ kind: 'repair', team: 0, building: 1, owner: 'a', item: { uid: 'x', def: 'dory', rarity: 'common', cond: 40 } });
    run(sim, 1000, () => !building(sim, 1).queue);
    const [rep] = crafted(sim.events());
    expect(rep).toMatchObject({ what: 'repair', owner: 'a' });
    expect(rep.item).toMatchObject({ cond: 95, mc: 95 });
    expect(stock(sim).iron).toBeLessThan(10);
    const iron = stock(sim).iron!;
    sim.order({ kind: 'salvage', team: 0, building: 1, owner: 'a', item: { uid: 'y', def: 'falcata', rarity: 'common', cond: 50 } });
    sim.order({ kind: 'repair', team: 0, building: 1, owner: 'a', item: { uid: 'z', def: 'dory', rarity: 'common', cond: 30, mc: 50 } }); // worn past mending
    run(sim, 1000, () => !building(sim, 1).queue);
    expect(stock(sim).iron! - iron).toBe(Math.floor(RECIPES['item:falcata'].inputs.iron! * CRAFT.salvage));
    expect(crafted(sim.events()).map((e) => e.what)).toEqual(['salvage']);
  });
});

describe('M5h2 dishes, remedies, venom', () => {
  it('a fed record gives at most +5% to any combat stat', () => {
    for (const d of Object.keys(DISHES) as Product[]) {
      const f = fedOf(d);
      expect(1 / f.inn - 1).toBeLessThanOrEqual(FED_CAP + 1e-9);
      expect(f.melee).toBeLessThanOrEqual(FED_CAP);
      expect(f.missile).toBeLessThanOrEqual(FED_CAP);
      expect(f.acc).toBeLessThanOrEqual(FED_CAP);
    }
    expect(fedOf('feast', true).ticks).toBe(Math.round(fedOf('feast').ticks * 1.5));
  });

  it('bandage, Battle Dresser, physician and venom shares of a fall, within the cap', () => {
    expect(fallShare(0.7, false, 1, false)).toBeCloseTo(0.7 + REMEDY.bandage);
    expect(fallShare(0.7, false, 2, false)).toBeCloseTo(0.7 + 2 * REMEDY.bandage);
    expect(fallShare(0.7, false, 0, true)).toBeCloseTo(0.7 - VENOM.share);
    expect(fallShare(0.88, true, 2, false)).toBe(0.9);
    expect(fallShare(0.1, false, 0, true)).toBe(0);
    expect(PHYSICIAN.surgeonR).toBeGreaterThan(PHYSICIAN.r);
  });
});
