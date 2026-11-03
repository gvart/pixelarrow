/**
 * W-88..W-91 (docs/WAR.md "Buildings need people"): a building works only while someone is there, its owner sets who may
 * use it and what he keeps, private houses, and raids limited by what the raiders can carry and by the door.
 */
import { describe, expect, it } from 'vitest';
import { heldNodes } from '../../src/data/professions';
import { RECIPES } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { CIV } from '../../src/war/sim/civilians';
import { BUILDINGS, CHEST, HOUSE, LOCK, lockOf, needsPerson, STAFF, TERMS } from '../../src/war/sim/economy';
import { PREBUILT } from '../../src/war/sim/prebuilt';
import { makePerson } from '../../src/war/sim/roster';
import { PORTER } from '../../src/war/sim/trade';
import { sightOf, VISION } from '../../src/war/sim/vision';
import type { BuildingType, ResourceKind, WarBuildSim, WarEvent } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
/** A camp and pieces on claimed ground: built by `owner`, finished at once, nobody left there. */
function town(types: BuildingType[], owner = 'a', seed = 1): { sim: WarBuildSim; ids: number[] } {
  const sim = createSim(flat(96), seed);
  sim.claim(0, 40, 40, 40);
  const hand = sim.spawnSquad(owner, 0, 'militia', 1, 90, 90);
  const ids = types.map((type, i) => {
    sim.order({ kind: 'placeBuilding', squad: hand, type, x: 30 + i * 10, y: 40 });
    sim.step();
    const b = sim.snapshot().buildings!.at(-1)!;
    expect(b.type, type).toBe(type);
    sim.finishSite(b.id);
    return b.id;
  });
  sim.order({ kind: 'hold', squad: hand });
  sim.step();
  return { sim, ids };
}
const smelt = Object.values(RECIPES).find((r) => r.at === 'forge' && r.kind === 'smelt' && r.lv === 1 && !!r.out.good && heldNodes('smith', []).has(r.node))!;
const made = smelt.out.good as ResourceKind;
const smith = (sim: WarBuildSim, owner: string, team: number, b: number, pid = owner + '-smith') => {
  const at = building(sim, b);
  const s = sim.spawnSquad(owner, team, 'civ_smith', 1, at.x, at.y + 4, [makePerson(pid, 'civ_smith', { level: 3 })]);
  sim.order({ kind: 'civWork', squad: s, building: b });
  run(sim, 60);
  return s;
};
const stockFor = (sim: WarBuildSim, r: typeof smelt, n = 1) => {
  for (const [k, v] of Object.entries(r.inputs)) sim.addStock(0, k as never, (v as number) * n);
};

describe('W-88: who needs a person', () => {
  it('everything that produces, sells, serves, shoots or sees needs one; walls, gates, wells and chests do not', () => {
    for (const t of Object.keys(BUILDINGS) as BuildingType[]) {
      const d = BUILDINGS[t];
      if (d.workplace || d.yields || d.wall === 'tower' || PREBUILT[t]?.favour) expect(needsPerson(t, d), t).toBe(true);
      if (d.wall === 'segment' || d.wall === 'gate' || d.bridge || d.access || d.field || PREBUILT[t]?.well || d.chest) expect(needsPerson(t, d), t).toBe(false);
    }
  });

  it('a building counts as staffed only with a man of its side at it, seen within a scan', () => {
    const { sim, ids: [forge] } = town(['forge']);
    run(sim, STAFF.every + 1);
    expect(building(sim, forge).staffed).toBeUndefined();
    const foe = sim.spawnSquad('f', 1, 'militia', 1, building(sim, forge).x, building(sim, forge).y + 3);
    run(sim, STAFF.every + 1);
    expect(building(sim, forge).staffed).toBeUndefined(); // a foe at it is nobody's staff
    sim.order({ kind: 'move', squad: foe, x: 90, y: 5 });
    const man = sim.spawnSquad('a', 0, 'militia', 1, building(sim, forge).x, building(sim, forge).y + 3);
    run(sim, STAFF.every + 1);
    expect(building(sim, forge).staffed).toBe(true);
    sim.order({ kind: 'move', squad: man, x: 5, y: 5 });
    run(sim, 300);
    expect(building(sim, forge).staffed).toBeUndefined();
  });

  it('an empty forge halts and resumes where it stood', () => {
    const { sim, ids: [forge] } = town(['forge']);
    stockFor(sim, smelt);
    const s = smith(sim, 'a', 0, forge);
    sim.order({ kind: 'craft', team: 0, building: forge, recipe: smelt.id });
    run(sim, CIV.every * 2 + 1);
    const q0 = building(sim, forge).queue![0];
    expect(q0.progress).toBeGreaterThan(0);
    sim.order({ kind: 'move', squad: s, x: 5, y: 5 });
    run(sim, 200);
    const left = building(sim, forge).queue![0].progress;
    run(sim, 500);
    expect(building(sim, forge).queue![0].progress).toBe(left); // nobody there: nothing moves
    sim.order({ kind: 'civWork', squad: s, building: forge });
    sim.events();
    run(sim, 5000, () => !building(sim, forge).queue);
    expect(building(sim, forge).queue).toBeUndefined();
    expect(sim.goodsAt(0, 40, 40)[made] ?? 0).toBeGreaterThan(0);
  });

  it('a kiln makes no pitch, a farm grows nothing, with nobody there; a man brings them back', () => {
    const { sim, ids: [, kiln, farm] } = town(['camp', 'pitchKiln', 'farm']);
    sim.addStock(0, 'wood', 500);
    const node = (id: number) => sim.resourceNodes().find((n) => n.building === id)!;
    // men draw them down, then leave
    const a = sim.spawnSquad('a', 0, 'militia', 8, building(sim, kiln).x, building(sim, kiln).y + 3);
    const b = sim.spawnSquad('a', 0, 'militia', 8, building(sim, farm).x, building(sim, farm).y + 4);
    sim.order({ kind: 'gather', squad: a, node: node(kiln).id });
    sim.order({ kind: 'gather', squad: b, node: node(farm).id });
    run(sim, 300);
    sim.order({ kind: 'move', squad: a, x: 5, y: 5 });
    sim.order({ kind: 'move', squad: b, x: 5, y: 12 });
    run(sim, 300);
    const k0 = node(kiln).amount, f0 = node(farm).amount;
    expect(k0).toBeLessThan(node(kiln).max);
    expect(f0).toBeLessThan(node(farm).max);
    run(sim, 300);
    expect(node(kiln).amount).toBe(k0);
    expect(node(farm).amount).toBe(f0);
    sim.spawnSquad('a', 0, 'militia', 1, building(sim, kiln).x, building(sim, kiln).y + 3);
    sim.spawnSquad('a', 0, 'militia', 1, building(sim, farm).x, building(sim, farm).y + 4);
    run(sim, 300);
    expect(node(kiln).amount).toBeGreaterThan(k0);
    expect(node(farm).amount).toBeGreaterThan(f0);
  });

  it('a tower without a man holds fire and sees nothing; a man on it does both', () => {
    const { sim, ids: [tower] } = town(['woodTower']);
    const t = building(sim, tower);
    const far = VISION.tower - 1;
    expect(far).toBeGreaterThan(sightOf('militia'));
    const foe = sim.spawnSquad('f', 1, 'militia', 4, t.x, t.y + 6);
    run(sim, 200);
    expect(sim.visibleTo(0, t.x, t.y + 6)).toBe(false);
    expect(sim.snapshot().units.filter((u) => u.squad === foe).every((u) => u.hp === u.maxHp)).toBe(true); // nothing shot at them
    sim.order({ kind: 'move', squad: foe, x: t.x, y: t.y + far });
    run(sim, 200);
    // a man at its foot: the tower is manned, it sees past his own eyes
    sim.spawnSquad('a', 0, 'militia', 1, t.x, t.y + 2);
    run(sim, 100);
    expect(building(sim, tower).staffed).toBe(true);
    expect(sim.visibleTo(0, t.x, t.y + far)).toBe(true);
  });
});

describe('W-89: access and terms', () => {
  it('a player owns what he built, pre-built pieces stay the alliance\'s; only he sets its terms, within TERMS', () => {
    const { sim, ids: [forge] } = town(['forge']);
    expect(building(sim, forge)).toMatchObject({ owner: 'a', access: 'alliance' });
    sim.order({ kind: 'setAccess', building: forge, owner: 'b', access: 'private' });
    run(sim, 1);
    expect(building(sim, forge).access).toBe('alliance');
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'household', share: 9, fee: 1e6 });
    run(sim, 1);
    expect(building(sim, forge)).toMatchObject({ access: 'household', share: TERMS.share, fee: TERMS.fee });
  });

  it('a stranger is refused: at its door and at its queue', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'private' });
    run(sim, 1);
    stockFor(sim, smelt);
    const ally = smith(sim, 'b', 0, forge);
    expect(sim.snapshot().squads[ally].order).not.toBe('civWork');
    sim.order({ kind: 'craft', team: 0, building: forge, recipe: smelt.id, by: 'b' });
    run(sim, 1);
    expect(building(sim, forge).queue).toBeUndefined();
    expect(sim.mayUse(forge, 'b', 0)).toBe(false);
    expect(sim.mayUse(forge, 'a', 0)).toBe(true);
    // a foe's man is no better off under the alliance setting, and is under `anyone`
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'alliance' });
    run(sim, 1);
    expect(sim.mayUse(forge, 'b', 0)).toBe(true);
    expect(sim.mayUse(forge, 'f', 1)).toBe(false);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'anyone' });
    run(sim, 1);
    expect(sim.mayUse(forge, 'f', 1)).toBe(true);
  });

  it('household: his citizens and vassals, as the host says', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'household' });
    run(sim, 1);
    sim.setTies((owner, other) => owner === 'a' && other === 'v');
    expect(sim.mayUse(forge, 'v', 3)).toBe(true);
    expect(sim.mayUse(forge, 'b', 0)).toBe(false);
  });

  it('a permitted ally runs it, the owner\'s share of the goods sits in the building until he fetches it', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', share: 0.25 });
    run(sim, 1);
    stockFor(sim, smelt);
    smith(sim, 'b', 0, forge);
    sim.order({ kind: 'craft', team: 0, building: forge, recipe: smelt.id, by: 'b' });
    run(sim, 5000, () => !building(sim, forge).queue);
    const good = made;
    expect(building(sim, forge).goods?.[good]).toBeCloseTo(smelt.out.n * 0.25);
    expect(sim.goodsAt(0, 40, 40)[good]).toBeCloseTo(smelt.out.n * 0.75);
    // another's hand finds it shut, the owner carries it off
    const other = sim.spawnSquad('b', 0, 'militia', 2, 40, 46);
    sim.order({ kind: 'load', squad: other, from: { building: forge } });
    run(sim, 1);
    expect(sim.snapshot().squads[other].order).toBe('hold');
    const me = sim.spawnSquad('a', 0, 'militia', 2, building(sim, forge).x, building(sim, forge).y + 3);
    sim.order({ kind: 'load', squad: me, from: { building: forge } });
    run(sim, 300, () => sim.snapshot().squads[me].order === 'hold');
    expect(building(sim, forge).goods?.[good] ?? 0).toBeCloseTo(0);
  });

  it('a fee is coin paid at the start; no coin, no work', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', fee: 7 });
    run(sim, 1);
    stockFor(sim, smelt, 3);
    smith(sim, 'b', 0, forge);
    sim.order({ kind: 'craft', team: 0, building: forge, recipe: smelt.id, by: 'b' });
    run(sim, CIV.every * 5);
    expect(building(sim, forge).queue![0].by).toBe(-1); // he has no coin
    sim.addStock(0, 'coin', 7);
    run(sim, CIV.every * 2);
    expect(building(sim, forge).queue?.[0]?.by ?? 0).not.toBe(-1);
    expect(building(sim, forge).goods?.coin).toBeCloseTo(7);
  });

  it('the owner pays himself nothing', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', share: 0.5, fee: 10 });
    run(sim, 1);
    stockFor(sim, smelt);
    smith(sim, 'a', 0, forge);
    sim.order({ kind: 'craft', team: 0, building: forge, recipe: smelt.id, by: 'a' });
    run(sim, 5000, () => !building(sim, forge).queue);
    expect(sim.goodsAt(0, 40, 40)[made]).toBeCloseTo(smelt.out.n);
    expect(building(sim, forge).goods?.coin ?? 0).toBe(0);
  });

  it('a stranger under `anyone` pays from his packs and what he makes falls beside it for him', () => {
    const { sim, ids: [forge] } = town(['forge']);
    sim.order({ kind: 'setAccess', building: forge, owner: 'a', access: 'anyone', share: 0.2 });
    run(sim, 1);
    const at = building(sim, forge);
    const carrier = sim.spawnSquad('f', 1, 'militia', 1, at.x + 1, at.y + 3);
    for (const [k, v] of Object.entries(smelt.inputs)) expect(sim.cargo({ squad: carrier })!.slots[0].hold.lots.push({ r: k as never, n: v as number, o: 't' })).toBeGreaterThan(0);
    smith(sim, 'f', 1, forge);
    sim.order({ kind: 'craft', team: 1, building: forge, recipe: smelt.id, by: 'f' });
    run(sim, 5000, () => !building(sim, forge).queue);
    expect(building(sim, forge).goods?.[made]).toBeCloseTo(smelt.out.n * 0.2);
    const pile = sim.snapshot().piles!.find((p) => (p.goods[made] ?? 0) > 0)!;
    expect(pile.goods[made]).toBeCloseTo(smelt.out.n * 0.8);
  });

  it('a private store feeds no network: its owner carries goods out', () => {
    const { sim, ids: [store] } = town(['storehouse']);
    sim.cargo({ building: store })!.slots[0].hold.lots.push({ r: 'wood', n: 50, o: 't' });
    expect(sim.goodsAt(0, 30, 40).wood).toBeCloseTo(50);
    sim.order({ kind: 'setAccess', building: store, owner: 'a', access: 'private' });
    run(sim, 1);
    expect(sim.goodsAt(0, 30, 40).wood ?? 0).toBe(0);
    const ally = sim.spawnSquad('b', 0, 'militia', 2, 30, 44);
    sim.order({ kind: 'load', squad: ally, from: { building: store } });
    run(sim, 1);
    expect(sim.snapshot().squads[ally].order).toBe('hold');
    const me = sim.spawnSquad('a', 0, 'militia', 2, 30, 44);
    sim.order({ kind: 'load', squad: me, from: { building: store } });
    run(sim, 200, () => sim.snapshot().squads[me].order === 'hold');
    expect(building(sim, store).goods?.wood).toBeLessThan(50);
  });
});

describe('W-90: private houses', () => {
  it('holds his goods alone, one a region, defaults to private and has a door', () => {
    const def = BUILDINGS.privateHouse;
    expect(def.house && !def.prebuilt).toBe(true);
    const { sim, ids: [house] } = town(['privateHouse']);
    expect(building(sim, house)).toMatchObject({ owner: 'a', access: 'private', lock: lockOf(def), lockMax: lockOf(def) });
    const hand = sim.spawnSquad('a', 0, 'militia', 1, 60, 60);
    for (let i = 0; i < HOUSE.cap + 1; i++) sim.order({ kind: 'placeBuilding', squad: hand, type: 'privateHouse', x: 60 + i * 6, y: 60 });
    run(sim, 2);
    expect(sim.snapshot().buildings!.filter((b) => b.type === 'privateHouse' && b.owner === 'a')).toHaveLength(HOUSE.cap);
    expect(def.chest).toBeGreaterThan(BUILDINGS.chest.chest!);
    sim.addStock(0, 'wood', 20);
    const me = sim.spawnSquad('a', 0, 'militia', 2, building(sim, house).x, building(sim, house).y + 3);
    sim.cargo({ squad: me })!.slots[0].hold.lots.push({ r: 'wood', n: 5, o: 't' });
    sim.order({ kind: 'unload', squad: me, to: { building: house } });
    run(sim, 200, () => sim.snapshot().squads[me].order === 'hold');
    expect(building(sim, house).goods?.wood).toBeCloseTo(5);
    const ally = sim.spawnSquad('b', 0, 'militia', 1, 60, 70);
    sim.order({ kind: 'load', squad: ally, from: { building: house } });
    run(sim, 1);
    expect(sim.snapshot().squads[ally].order).toBe('hold');
  });
});

describe('W-91: raids', () => {
  const lockEvents = (evs: WarEvent[]) => evs.filter((e) => e.kind === 'lockAttacked' || e.kind === 'lockBroken');
  /** A full store nobody stands at, `men` raiders by it. */
  function raid(men: number, type: BuildingType = 'storehouse') {
    const { sim, ids: [store] } = town([type]);
    const at = building(sim, store);
    sim.cargo({ building: store })!.slots[0].hold.lots.push({ r: 'wood', n: 1000, o: 't' });
    const r = sim.spawnSquad('r', 1, 'militia', men, at.x, at.y + 3);
    sim.events();
    sim.order({ kind: 'load', squad: r, from: { building: store } });
    return { sim, store, r, at };
  }

  it('the lock costs the group real time, nothing leaves until it gives way, and the owner hears', () => {
    const men = 12, { sim, store, r } = raid(men);
    const hp = lockOf(BUILDINGS.storehouse);
    expect(hp).toBe(LOCK.wood);
    const secs = hp / (men * LOCK.perMan);
    run(sim, Math.floor(secs * 10 * 0.9));
    expect(building(sim, store).goods?.wood).toBeCloseTo(1000);
    expect(building(sim, store).lock).toBeGreaterThan(0);
    const told = lockEvents(sim.events());
    expect(told[0]).toMatchObject({ kind: 'lockAttacked', building: store, owner: 'a', team: 0, by: 1 });
    expect(told).toHaveLength(1);
    run(sim, Math.ceil(secs * 10 * 0.3) + 100);
    const after = lockEvents(sim.events());
    expect(after.some((e) => e.kind === 'lockBroken')).toBe(true);
    expect(building(sim, store).lock).toBe(0);
    expect(building(sim, store).goods?.wood).toBeLessThan(1000);
    expect(sim.snapshot().squads[r].order).not.toBe('load'); // packs full: done
  });

  it('a raider\'s take stops at what his men can carry', () => {
    const men = 4, { sim, store, r } = raid(men);
    run(sim, (LOCK.wood / (men * LOCK.perMan)) * 10 + 600, () => sim.snapshot().squads[r].order === 'hold' && building(sim, store).lock === 0);
    const carry = men * PORTER.loads * 10; // CARRY goods a load
    expect(1000 - building(sim, store).goods!.wood!).toBeCloseTo(carry);
    run(sim, 300);
    expect(1000 - building(sim, store).goods!.wood!).toBeCloseTo(carry); // and no more for standing about
    // the rest is there for whoever comes back, the door mended by his men
    const h = sim.spawnSquad('a', 0, 'militia', 4, building(sim, store).x, building(sim, store).y + 3);
    run(sim, 300);
    expect(building(sim, store).lock).toBeGreaterThan(0);
    expect(h).toBeGreaterThanOrEqual(0);
  });

  it('a man of its side at the door keeps looters off; the home strongroom is no holder at all', () => {
    const { sim, store, at, r } = raid(6);
    sim.addStock(0, 'stone', 100);
    sim.spawnSquad('a', 0, 'civ_smith', 1, at.x + 2, at.y - 3);
    run(sim, 1);
    expect(sim.snapshot().squads[r].order).toBe('hold');
    expect(building(sim, store).lock).toBe(LOCK.wood);
    expect(CHEST.guard).toBeGreaterThan(STAFF.reach);
    expect(sim.goodsAt(0, at.x, at.y).stone).toBeCloseTo(100);
  });

  it('a house is broken into the same way and spills what it held when it falls', () => {
    const { sim, ids: [house] } = town(['privateHouse']);
    const at = building(sim, house);
    sim.cargo({ building: house })!.slots[0].hold.lots.push({ r: 'coin', n: 60, o: 't' });
    const r = sim.spawnSquad('r', 1, 'militia', 12, at.x, at.y + 3);
    sim.order({ kind: 'load', squad: r, from: { building: house } });
    run(sim, 300);
    expect(building(sim, house).goods?.coin).toBeCloseTo(60);
    run(sim, (LOCK.wood / 12) * 10);
    expect(building(sim, house).goods?.coin ?? 0).toBeLessThan(60);
    sim.damageBuilding(house, 1e9);
    run(sim, 2);
    expect(building(sim, house).state).toBe('destroyed');
  });
});
