import { describe, expect, it } from 'vitest';
import { CIV_CLASS_IDS, CIV_CLASSES, CIV_TOOLS } from '../../src/data/classes';
import { createSim } from '../../src/war/sim';
import { warStats, warStatsOf } from '../../src/war/sim/classes';
import { CIV, CIV_QUOTA, COOK, ENGINEER, FORAGER, MERCHANT, SMITH, workRate } from '../../src/war/sim/civilians';
import { makePerson } from '../../src/war/sim/roster';
import type { RegionData, Snapshot, WarBuildSim, WarPerson } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean): number => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return n;
};
const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;
const unitsOf = (snap: Snapshot, squad: number) => snap.squads[squad].units.map((id) => snap.units[id]);
const centre = (snap: Snapshot, squad: number) => {
  const us = unitsOf(snap, squad).filter((u) => u.state !== 'dead');
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length] as const;
};

/** A done camp (building 0) at (cx, cy) on claimed ground, raised by militia who then leave (squad 0 goes far off). */
function withCamp(region: RegionData = flat(), cx = 30, cy = 30, seed = 1): WarBuildSim {
  const sim = createSim(region, seed);
  sim.claim(0, cx, cy, 30);
  const s = sim.spawnSquad('a', 0, 'militia', 12, cx + 4, cy + 4);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: cx, y: cy });
  run(sim, 2000, () => building(sim, 0)?.state === 'done');
  expect(building(sim, 0).state).toBe('done');
  sim.order({ kind: 'move', squad: s, x: 4, y: 4 });
  run(sim, 400);
  return sim;
}

describe('M5f civilian classes', () => {
  it('six classes with role civ and three tiers of tool each', () => {
    expect(CIV_CLASS_IDS).toEqual(['civ_cook', 'civ_smith', 'civ_merchant', 'civ_engineer', 'civ_physician', 'civ_forager']);
    for (const c of CIV_CLASS_IDS) {
      expect(CIV_CLASSES[c].role).toBe('civ');
      expect(CIV_CLASSES[c].tools.map((t) => CIV_TOOLS[t].tier)).toEqual([1, 2, 3]);
    }
  });

  it('weak in a fight: no missiles, no block, half the armour, a fraction of the blow', () => {
    const m = warStats('militia');
    for (const c of CIV_CLASS_IDS) {
      const s = warStats(c);
      expect(s.range).toBe(0);
      expect(s.ammo).toBe(0);
      expect(s.block).toBe(0);
      expect(s.armor).toBeCloseTo(m.armor * CIV.armor);
      expect(s.dmg).toBeLessThan(m.dmg * 0.5);
      expect(s.maxHp).toBeLessThan(m.maxHp);
    }
  });

  it('the tool in the weapon slot and the level set the work rate', () => {
    const fresh = makePerson('c0', 'civ_smith');
    expect(fresh.hero.equip.weapon!.def).toBe('stone_hammer');
    expect(warStatsOf(fresh).work).toBeCloseTo(1);
    const best = makePerson('c1', 'civ_smith', { level: 10, tier: 2, rarity: 'epic' });
    expect(best.hero.equip.weapon!.def).toBe('iron_hammer');
    expect(workRate(best.hero)).toBeCloseTo(1.27 * 1.35);
    expect(warStatsOf(best).work).toBeCloseTo(workRate(best.hero));
    expect(warStatsOf(best).maxHp).toBeGreaterThan(warStatsOf(fresh).maxHp);
  });
});

describe('M5f quota', () => {
  it('10% of the region cap, split between the teams present', () => {
    expect(CIV_QUOTA).toBe(60);
    const sim = createSim(flat(96), 1);
    const ids = Array.from({ length: 6 }, (_, k) => sim.spawnSquad('a', 0, 'civ_forager', 12, 10 + k * 6, 10));
    expect(ids.slice(0, 5).every((id) => id >= 0)).toBe(true);
    expect(ids[5]).toBe(-1);
    const two = createSim(flat(96), 1);
    two.spawnSquad('b', 1, 'militia', 12, 80, 80);
    const got = Array.from({ length: 4 }, (_, k) => two.spawnSquad('a', 0, 'civ_cook', 12, 10 + k * 6, 10));
    expect(got.map((id) => (id < 0 ? 0 : two.snapshot().squads[id].units.length))).toEqual([12, 12, 6, 0]);
    // persons: civilians beyond the room are left out, soldiers are not
    const ps: WarPerson[] = [...Array.from({ length: 6 }, (_, k) => makePerson(`s${k}`, 'militia')), ...Array.from({ length: 6 }, (_, k) => makePerson(`c${k}`, 'civ_cook'))];
    const mixed = two.spawnSquad('a', 0, 'x', 0, 40, 40, ps);
    expect(two.snapshot().squads[mixed].units.length).toBe(6);
  });
});

describe('M5f never fight, flee', () => {
  it('civilians never strike, even with a foe at hand', () => {
    const sim = createSim(flat(), 1);
    const c = sim.spawnSquad('a', 0, 'civ_smith', 6, 30, 30);
    const f = sim.spawnSquad('b', 1, 'militia', 6, 30, 32);
    sim.order({ kind: 'attack', squad: c, target: f }); // refused: work orders only
    for (let t = 0; t < 300; t++) {
      sim.step();
      const snap = sim.snapshot();
      expect(unitsOf(snap, c).some((u) => u.state === 'attack')).toBe(false);
      expect(snap.squads[c].order).not.toBe('attack');
    }
    expect(unitsOf(sim.snapshot(), f).every((u) => u.hp === u.maxHp)).toBe(true);
  });

  it('a foe in 10 tiles sends them running; calm again they go back to work', () => {
    const sim = withCamp();
    sim.addStock(0, 'food', 1000);
    const c = sim.spawnSquad('a', 0, 'civ_cook', 4, 33, 36);
    sim.order({ kind: 'civWork', squad: c, building: 0 });
    run(sim, 200);
    expect(unitsOf(sim.snapshot(), c).some((u) => u.work === 'cook')).toBe(true);
    // wolves come at the camp from the east
    const w = sim.spawnSquad('mob', 1, 'mob_wolf', 6, 60, 30);
    sim.order({ kind: 'move', squad: w, x: 34, y: 31 });
    const t = run(sim, 400, () => !!sim.snapshot().squads[c].flee);
    expect(t).toBeLessThan(400);
    const snap = sim.snapshot();
    expect(unitsOf(snap, c).every((u) => u.state === 'dead' || u.flee)).toBe(true);
    expect(snap.squads[c].order).toBe('move');
    // the wolves go home: the cooks come back to the camp and cook again
    sim.order({ kind: 'move', squad: w, x: 62, y: 60 });
    run(sim, 1200, () => sim.snapshot().squads[c].order === 'civWork' && unitsOf(sim.snapshot(), c).some((u) => u.work === 'cook'));
    expect(sim.snapshot().squads[c].flee).toBeUndefined();
    expect(sim.snapshot().squads[c].order).toBe('civWork');
  });

  it('they run to another own camp the foe is not at', () => {
    const sim = withCamp(flat(96), 30, 30);
    sim.claim(0, 70, 30, 30);
    const s2 = sim.spawnSquad('a', 0, 'militia', 12, 74, 34);
    sim.order({ kind: 'placeBuilding', squad: s2, type: 'camp', x: 70, y: 30 });
    run(sim, 2000, () => building(sim, 1)?.state === 'done');
    sim.order({ kind: 'move', squad: s2, x: 90, y: 90 });
    const c = sim.spawnSquad('a', 0, 'civ_merchant', 4, 33, 36);
    sim.order({ kind: 'civWork', squad: c, building: 0 });
    run(sim, 200);
    const w = sim.spawnSquad('b', 1, 'militia', 12, 30, 6);
    sim.order({ kind: 'move', squad: w, x: 30, y: 30 });
    run(sim, 600, () => !!sim.snapshot().squads[c].flee);
    run(sim, 600);
    const [x, y] = centre(sim.snapshot(), c);
    expect(Math.hypot(x - 70, y - 30)).toBeLessThan(8);
  });
});

describe('M5f loops', () => {
  it('cook: food into rations; a squad near the cook eats and is fed (takes less damage)', () => {
    const sim = withCamp();
    sim.addStock(0, 'food', 40);
    const c = sim.spawnSquad('a', 0, 'civ_cook', 2, 33, 36);
    const g = sim.spawnSquad('a', 0, 'hoplite', 6, 36, 26); // 6 men: 6 rations a meal
    sim.order({ kind: 'civWork', squad: c, building: 0 });
    run(sim, 1200, () => !!sim.snapshot().squads[g].fed);
    const snap = sim.snapshot();
    expect(snap.squads[g].fed).toBe(true);
    expect(snap.stock![0].food).toBeLessThan(40);
    const made = ((40 - snap.stock![0].food!) / COOK.food) * COOK.rations;
    expect(snap.rations![0]).toBeCloseTo(made - 6);
    expect(COOK.inn).toBeLessThan(1);
  });

  it('smith: copper and tin into bronze, then mends worn gear near the forge', () => {
    const sim = withCamp();
    sim.addStock(0, 'copper', 2);
    sim.addStock(0, 'tin', 2);
    const worn = Array.from({ length: 4 }, (_, k) => makePerson(`h${k}`, 'hoplite'));
    for (const p of worn) p.hero.equip.armor = { ...p.hero.equip.armor!, cond: 40 };
    const g = sim.spawnSquad('a', 0, 'x', 0, 34, 26, worn);
    const c = sim.spawnSquad('a', 0, 'x', 0, 33, 36, [makePerson('sm', 'civ_smith')]);
    sim.order({ kind: 'civWork', squad: c, building: 0 });
    run(sim, 600);
    expect(sim.snapshot().stock![0].bronze).toBe(2 * SMITH.bronze);
    expect(sim.snapshot().stock![0].copper).toBe(0);
    run(sim, 1500);
    const r = sim.endFight();
    const conds = r.persons.filter((p) => p.pid.startsWith('h')).map((p) => p.hero.equip.armor!.cond);
    expect(conds.length).toBe(4);
    expect(conds.reduce((a, b) => a + b, 0)).toBeGreaterThan(4 * 40);
    expect(r.persons.find((p) => p.pid === 'sm')!.xp).toBeGreaterThan(2); // a job each
    expect(g).toBeGreaterThanOrEqual(0);
  });

  it('merchant: sells the most plentiful surplus for silver', () => {
    const sim = withCamp();
    sim.addStock(0, 'wood', 200);
    sim.addStock(0, 'food', 60);
    const c = sim.spawnSquad('a', 0, 'civ_merchant', 2, 33, 36);
    sim.order({ kind: 'civWork', squad: c, building: 0 });
    run(sim, 1000);
    const st = sim.snapshot().stock![0];
    expect(st.silver).toBeGreaterThanOrEqual(2 * MERCHANT.silver);
    expect(st.wood).toBeLessThan(200);
    expect(st.food).toBe(60);
  });

  it('engineer: builds faster than as many soldiers', () => {
    const time = (cls: string) => {
      const sim = createSim(flat(), 2);
      sim.claim(0, 30, 30, 30);
      const s = sim.spawnSquad('a', 0, cls, 4, 34, 34);
      sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 30, y: 30 });
      return run(sim, 4000, () => building(sim, 0)?.state === 'done');
    };
    const militia = time('militia'), engineer = time('civ_engineer');
    expect(engineer).toBeLessThan(militia * 0.8);
    expect(engineer).toBeGreaterThan(militia / ENGINEER.build / 1.2);
  });

  it('forager: twice the yield of a soldier', () => {
    const wood = (cls: string) => {
      const trees = Array.from({ length: 12 }, (_, i) => ({ id: 'pine-a', x: 40.5 + (i % 4) * 2, y: 40.5 + Math.floor(i / 4) * 2 }));
      const sim = withCamp({ ...flat(), objects: trees });
      const s = sim.spawnSquad('a', 0, cls, 4, 34, 34);
      const node = sim.resourceNodes().find((n) => n.res === 'wood')!;
      sim.order({ kind: 'gather', squad: s, node: node.id });
      run(sim, 1500);
      return sim.snapshot().stock![0].wood ?? 0;
    };
    const militia = wood('militia'), forager = wood('civ_forager');
    expect(militia).toBeGreaterThan(0);
    expect(forager).toBeGreaterThan(militia * 1.3);
    expect(FORAGER.gather).toBe(2);
  });

  it('physician: the hurt round his camp heal', () => {
    const hurt = (phys: boolean) => {
      const sim = withCamp();
      const g = sim.spawnSquad('a', 0, 'hoplite', 6, 36, 28);
      sim.order({ kind: 'hold', squad: g });
      const f = sim.spawnSquad('b', 1, 'militia', 3, 36, 22);
      sim.order({ kind: 'attack', squad: f, target: g });
      if (phys) {
        const c = sim.spawnSquad('a', 0, 'civ_physician', 1, 26, 36);
        sim.order({ kind: 'civWork', squad: c, building: 0 });
      }
      run(sim, 1500, () => unitsOf(sim.snapshot(), f).every((u) => u.state === 'dead'));
      const lost = () => unitsOf(sim.snapshot(), g).reduce((a, u) => a + (u.state === 'dead' ? 0 : u.maxHp - u.hp), 0);
      const before = lost();
      run(sim, 1200);
      return [before, lost()];
    };
    const [b0, a0] = hurt(false), [b1, a1] = hurt(true);
    expect(b0).toBeGreaterThan(0);
    expect(a0).toBeCloseTo(b0);
    expect(b1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(b1 * 0.5);
  });

  it('physician: more of the fallen near him are wounded rather than killed', () => {
    let share = [0, 0];
    for (const phys of [false, true]) {
      let fallen = 0, wounded = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const sim = createSim(flat(), seed);
        const a = sim.spawnSquad('a', 0, 'militia', 12, 30, 30);
        if (phys) sim.spawnSquad('a', 0, 'civ_physician', 1, 30, 32);
        sim.order({ kind: 'hold', squad: a });
        for (const x of [24, 36]) sim.order({ kind: 'hold', squad: sim.spawnSquad('b', 1, 'archer', 12, x, 17) });
        run(sim, 3000, () => unitsOf(sim.snapshot(), a).every((u) => u.state === 'dead'));
        const dead = unitsOf(sim.snapshot(), a).filter((u) => u.state === 'dead');
        fallen += dead.length;
        wounded += dead.filter((u) => u.wounded).length;
      }
      expect(fallen).toBeGreaterThan(60);
      share[phys ? 1 : 0] = wounded / fallen;
    }
    expect(share[1]).toBeGreaterThan(share[0] + 0.05);
  });
});

describe('M5f determinism and cost', () => {
  const village = (seed: number) => {
    const sim = withCamp(flat(96), 40, 40, seed);
    sim.addStock(0, 'food', 500);
    sim.addStock(0, 'wood', 500);
    sim.addStock(0, 'copper', 20);
    sim.addStock(0, 'tin', 20);
    for (const [k, cls] of ['civ_cook', 'civ_smith', 'civ_merchant', 'civ_physician'].entries()) {
      const c = sim.spawnSquad('a', 0, cls, 3, 36 + k * 3, 47);
      sim.order({ kind: 'civWork', squad: c, building: 0 });
    }
    sim.spawnSquad('a', 0, 'hoplite', 12, 46, 34);
    const w = sim.spawnSquad('mob', 1, 'mob_wolf', 6, 90, 40);
    return { sim, w };
  };
  it('the same seed gives the same village', () => {
    const go = () => {
      const { sim, w } = village(5);
      run(sim, 300);
      sim.order({ kind: 'move', squad: w, x: 42, y: 48 });
      run(sim, 600);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });

  it('60 civilians at work beside 540 soldiers: the step stays under 8 ms', () => {
    const sim = createSim(flat(160), 3);
    sim.claim(0, 40, 40, 40);
    sim.claim(1, 120, 120, 40);
    const s0 = sim.spawnSquad('a', 0, 'militia', 12, 44, 44);
    sim.order({ kind: 'placeBuilding', squad: s0, type: 'camp', x: 40, y: 40 });
    run(sim, 1500, () => building(sim, 0)?.state === 'done');
    sim.addStock(0, 'food', 1e5);
    sim.addStock(0, 'wood', 1e5);
    for (let k = 0; k < 5; k++) {
      const c = sim.spawnSquad('a', 0, CIV_CLASS_IDS[k % 4 === 3 ? 4 : k % 4], 12, 34 + k * 3, 48);
      sim.order({ kind: 'civWork', squad: c, building: 0 });
    }
    // 44 more squads fight it out on the east field (the 600 cap)
    for (let k = 0; k < 44; k++) {
      const side = k % 2, x = 100 + (k % 11) * 4, y = side ? 60 : 30;
      const id = sim.spawnSquad(`p${k}`, side, ['militia', 'hoplite', 'archer'][k % 3], 12, x, y);
      sim.order({ kind: 'attackMove', squad: id, x, y: side ? 30 : 60 });
    }
    expect(sim.stats().units).toBeLessThanOrEqual(612);
    const ms: number[] = [];
    for (let t = 0; t < 400; t++) (sim.step(), ms.push(sim.stats().stepMs));
    const avg = ms.slice(50).reduce((a, b) => a + b, 0) / (ms.length - 50);
    expect(unitsOf(sim.snapshot(), 1).some((u) => u.work)).toBe(true);
    expect(avg).toBeLessThan(8);
  });
});
