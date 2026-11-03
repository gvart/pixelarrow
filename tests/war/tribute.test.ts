/**
 * W-153 tribute in the sim (docs/WAR.md "Feudal hierarchy"): the liege's part of an owner's share is set aside in the
 * building, stays there until the liege's men fetch it or the owner sends it sealed, and nothing is made or lost.
 */
import { describe, expect, it } from 'vitest';
import { heldNodes } from '../../src/data/professions';
import { RECIPES } from '../../src/data/recipes';
import { FEUDAL } from '../../src/data/warFeudal';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import type { BuildingType, GoodKind, ResourceKind, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const VASSAL = 'p:2', LORD = 'p:1';
const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const recipe = Object.values(RECIPES).find((r) => r.at === 'forge' && r.kind === 'smelt' && r.lv === 1 && !!r.out.good && heldNodes('smith', []).has(r.node))!;
const made = recipe.out.good as ResourceKind;

/** The vassal's forge and the lord's camp, both on claimed ground; a third player's smith pays the vassal's share. */
function field(pct: number = FEUDAL.rateDefault) {
  const sim = createSim(flat(96), 1);
  sim.claim(0, 40, 40, 40);
  const place = (owner: string, type: BuildingType, x: number) => {
    const hand = sim.spawnSquad(owner, 0, 'militia', 1, 90, 90);
    sim.order({ kind: 'placeBuilding', squad: hand, type, x, y: 40 });
    sim.step();
    const id = sim.snapshot().buildings!.at(-1)!.id;
    sim.finishSite(id);
    return id;
  };
  const forge = place(VASSAL, 'forge', 30), store = place(LORD, 'camp', 50);
  sim.order({ kind: 'setAccess', building: forge, owner: VASSAL, share: 0.5 });
  sim.order({ kind: 'setLiege', owner: VASSAL, to: LORD, pct });
  run(sim, 1);
  const at = building(sim, forge);
  const smith = sim.spawnSquad('p:3', 0, 'civ_smith', 1, at.x, at.y + 4, [makePerson('smith', 'civ_smith', { level: 3 })]);
  sim.order({ kind: 'civWork', squad: smith, building: forge });
  run(sim, 60);
  for (const [k, v] of Object.entries(recipe.inputs)) sim.addStock(0, k as never, v as number);
  sim.order({ kind: 'craft', team: 0, building: forge, recipe: recipe.id, by: 'p:3' });
  run(sim, 5000, () => !building(sim, forge).queue);
  return { sim, forge, store };
}
const packed = (sim: WarBuildSim, squad: number, r: GoodKind) => {
  const at = sim.cargo({ squad })!;
  return at.slots.reduce((a, x) => a + x.hold.lots.filter((l) => l.r === r).reduce((b, l) => b + l.n, 0), 0);
};

describe('W-153 tribute set aside', () => {
  it('the liege\'s part of an owner\'s share sits in the building, seen apart from his own, and adds up', () => {
    const { sim, forge } = field(20);
    const b = building(sim, forge), share = recipe.out.n * 0.5;
    expect(b.tithe?.[made]).toBeCloseTo(share * 0.2);
    expect(b.titheTo).toBe(LORD);
    expect(b.goods?.[made]).toBeCloseTo(share * 0.8);
  });

  it('with no liege or at 0 % nothing is set aside', () => {
    const { sim, forge } = field(0);
    const b = building(sim, forge);
    expect(b.tithe).toBeUndefined();
    expect(b.goods?.[made]).toBeCloseTo(recipe.out.n * 0.5);
  });

  it('the owner\'s plain load leaves it; a stranger cannot reach it; the liege\'s men take only it, in person', () => {
    const { sim, forge } = field(20);
    const at = building(sim, forge), share = recipe.out.n * 0.5;
    const own = sim.spawnSquad(VASSAL, 0, 'militia', 4, at.x, at.y + 3);
    sim.order({ kind: 'load', squad: own, from: { building: forge } });
    run(sim, 200, () => sim.snapshot().squads[own].order === 'hold');
    expect(building(sim, forge).goods?.[made] ?? 0).toBeCloseTo(0);
    expect(building(sim, forge).tithe?.[made]).toBeCloseTo(share * 0.2);
    expect(packed(sim, own, made)).toBeCloseTo(share * 0.8);
    // another of his alliance gets nothing
    const other = sim.spawnSquad('p:4', 0, 'militia', 2, at.x, at.y + 3);
    sim.order({ kind: 'load', squad: other, from: { building: forge } });
    run(sim, 1);
    expect(sim.snapshot().squads[other].order).toBe('hold');
    // the liege, far away, has nothing until his men walk there
    const liege = sim.spawnSquad(LORD, 0, 'militia', 2, at.x + 30, at.y + 3);
    sim.order({ kind: 'load', squad: liege, from: { building: forge } });
    run(sim, 3);
    expect(building(sim, forge).tithe?.[made]).toBeCloseTo(share * 0.2);
    run(sim, 1500, () => sim.snapshot().squads[liege].order === 'hold');
    expect(building(sim, forge).tithe).toBeUndefined();
    expect(packed(sim, liege, made)).toBeCloseTo(share * 0.2);
    // his, now: he may put it down in a store like any goods
    const cargo = sim.cargo({ squad: liege })!;
    expect(cargo.slots.flatMap((x) => x.hold.lots).every((l) => l.s === undefined)).toBe(true);
  });

  it('the owner may send it: sealed, he can put it down only in his liege\'s store', () => {
    const { sim, forge, store } = field(20);
    const at = building(sim, forge), share = recipe.out.n * 0.5;
    const own = sim.spawnSquad(VASSAL, 0, 'militia', 4, at.x, at.y + 3);
    sim.order({ kind: 'load', squad: own, from: { building: forge }, send: true });
    run(sim, 200, () => sim.snapshot().squads[own].order === 'hold');
    expect(building(sim, forge).tithe).toBeUndefined();
    expect(building(sim, forge).goods?.[made]).toBeCloseTo(share * 0.8);
    expect(packed(sim, own, made)).toBeCloseTo(share * 0.2);
    // not back into his own forge's store of goods
    sim.order({ kind: 'unload', squad: own, to: { building: forge } });
    run(sim, 80, () => sim.snapshot().squads[own].order === 'hold');
    expect(packed(sim, own, made)).toBeCloseTo(share * 0.2);
    // the lord's camp takes it, and the goods are plain goods there
    const before = building(sim, store).goods?.[made] ?? 0;
    sim.order({ kind: 'unload', squad: own, to: { building: store } });
    run(sim, 1500, () => sim.snapshot().squads[own].order === 'hold');
    expect(building(sim, store).goods?.[made]).toBeCloseTo(before + share * 0.2);
    expect(packed(sim, own, made)).toBeCloseTo(0);
  });

  it('an oath broken: it goes back to him, and what he carried sealed is his again; a new liege inherits it', () => {
    const { sim, forge } = field(20);
    const share = recipe.out.n * 0.5;
    sim.order({ kind: 'setLiege', owner: VASSAL, to: 'p:9', pct: 5 });
    run(sim, 1);
    expect(building(sim, forge).titheTo).toBe('p:9');
    expect(building(sim, forge).tithe?.[made]).toBeCloseTo(share * 0.2);
    sim.order({ kind: 'setLiege', owner: VASSAL, to: null, pct: 0 });
    run(sim, 1);
    expect(building(sim, forge).tithe).toBeUndefined();
    expect(building(sim, forge).goods?.[made]).toBeCloseTo(share);
    expect(sim.liegeOf(VASSAL)).toBeNull();
  });

  it('a foe with nobody there takes it all, the seal gone', () => {
    const { sim, forge } = field(20);
    const at = building(sim, forge), share = recipe.out.n * 0.5;
    const foe = sim.spawnSquad('p:8', 1, 'militia', 6, at.x, at.y + 3);
    sim.order({ kind: 'load', squad: foe, from: { building: forge } });
    run(sim, 300, () => sim.snapshot().squads[foe].order === 'hold');
    expect(building(sim, forge).tithe).toBeUndefined();
    expect(packed(sim, foe, made)).toBeCloseTo(share);
    expect(sim.cargo({ squad: foe })!.slots.flatMap((x) => x.hold.lots).every((l) => l.s === undefined)).toBe(true);
  });

  it('survives save and restore; the rule is the same on a replay of the same orders', () => {
    const a = field(20), b = field(20);
    expect(JSON.stringify(a.sim.snapshot().buildings)).toBe(JSON.stringify(b.sim.snapshot().buildings));
    const saved = a.sim.exportState!();
    const again = createSim(flat(96), 1);
    again.importState!(saved);
    expect(again.liegeOf(VASSAL)).toEqual({ to: LORD, pct: 20 });
    expect(building(again, a.forge).tithe?.[made]).toBeCloseTo(recipe.out.n * 0.5 * 0.2);
  });
});
