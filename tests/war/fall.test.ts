import { describe, expect, it } from 'vitest';
import { salvageValue } from '../../src/data/items';
import { xpToNext } from '../../src/data/units';
import { createSim } from '../../src/war/sim';
import { warStats, warStatsOf } from '../../src/war/sim/classes';
import { createRoster, makePerson } from '../../src/war/sim/roster';
import { CAPTURE_R, DROP, FALL, woundedShare, XP } from '../../src/war/sim/soldiers';
import type { WarBuildSim, WarPerson } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const alive = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  return snap.squads[squad].units.filter((id) => snap.units[id].state !== 'dead').length;
};
const men = (prefix: string, cls: string, n: number, o: Parameters<typeof makePerson>[2] = {}): WarPerson[] =>
  Array.from({ length: n }, (_, k) => makePerson(`${prefix}${k}`, cls, o));

describe('M5d wounded share', () => {
  it('0.7 at END 5, +3% per END point above, + physician, capped at 0.9', () => {
    expect(woundedShare(5)).toBeCloseTo(0.7);
    expect(woundedShare(3)).toBeCloseTo(0.7);
    expect(woundedShare(8)).toBeCloseTo(0.79);
    expect(woundedShare(15)).toBeCloseTo(FALL.cap);
    expect(woundedShare(5, true)).toBeCloseTo(0.85);
    expect(woundedShare(9, true)).toBeCloseTo(0.9);
    for (const cls of ['militia', 'hoplite', 'archer', 'celt_sword', 'royal_guard']) {
      const ws = warStats(cls).ws;
      expect(ws).toBeGreaterThanOrEqual(FALL.wounded);
      expect(ws).toBeLessThanOrEqual(FALL.cap);
    }
    const tough = makePerson('t', 'hoplite', { level: 10 });
    tough.hero.attrs.end = 15;
    expect(warStatsOf(tough).ws).toBeCloseTo(FALL.cap);
  });

  it('the fallen are wounded at about their share', () => {
    let fallen = 0, wounded = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createSim(flat(), seed);
      const tough = men('t', 'militia', 12).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 15 } } }));
      const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, tough);
      const b = sim.spawnSquad('b', 1, 'hoplite', 12, 30, 34);
      sim.order({ kind: 'attack', squad: b, target: a });
      run(sim, 2000, () => alive(sim, a) === 0);
      const dead = sim.snapshot().units.filter((u) => u.squad === a && u.state === 'dead');
      fallen += dead.length;
      wounded += dead.filter((u) => u.wounded).length;
    }
    expect(fallen).toBeGreaterThan(100);
    expect(wounded / fallen).toBeGreaterThan(0.8); // 0.9 expected
  });
});

describe('M5d gear drops', () => {
  it('the dead drop their gear for 10 min; a foe standing on it picks it up (rare and above at 50%), or a smith salvages it', () => {
    const sim = createSim(flat(), 4);
    const victims = men('v', 'hoplite', 12, { tier: 1, rarity: 'rare' }).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 0 } } }));
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, victims);
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 34);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => alive(sim, a) === 0);
    const snap = sim.snapshot();
    const killed = snap.units.filter((u) => u.squad === a && u.wounded === false).length;
    const events = sim.events();
    const mineIds = new Set(snap.squads[a].units);
    expect(events.filter((e) => e.kind === 'fall' && mineIds.has(e.unit))).toHaveLength(12);
    const picked = events.filter((e) => e.kind === 'pickup').length;
    expect(killed).toBeGreaterThan(0);
    expect((snap.drops?.length ?? 0) + picked).toBe(killed);
    for (const d of snap.drops ?? []) expect(d.left).toBeLessThanOrEqual(DROP.ticks);
    // the winners walk over the field: they pick up what lies there
    for (const d of snap.drops ?? []) {
      sim.order({ kind: 'move', squad: b, x: d.x, y: d.y });
      run(sim, 200);
    }
    const r = sim.endFight();
    const loot = r.loot[1] ?? [];
    expect(loot.length).toBeGreaterThan(0);
    for (const it of loot) expect(it.cond).toBeLessThanOrEqual(DROP.rareCond);
    // the dead come back with no gear
    for (const p of r.persons.filter((x) => x.state === 'dead')) expect(Object.keys(p.hero.equip)).toHaveLength(0);
  });

  it('a drop nobody takes is gone after 10 min; salvage pays its salvage value', () => {
    const sim = createSim(flat(), 5);
    const v = men('v', 'hoplite', 12, { tier: 1, rarity: 'epic' }).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 0 } } }));
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, v);
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 34);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => alive(sim, a) === 0);
    sim.order({ kind: 'move', squad: b, x: 60, y: 60 }); // away, out of the drops' way
    run(sim, 1);
    const drops = sim.snapshot().drops ?? [];
    expect(drops.length).toBeGreaterThan(0);
    const d = drops[0];
    const gear = Object.values(v[0].hero.equip).filter(Boolean);
    expect(sim.salvage(d.id)).toBe(gear.reduce((x, it) => x + salvageValue(it!), 0));
    expect(sim.salvage(d.id)).toBe(0);
    run(sim, DROP.ticks);
    expect(sim.snapshot().drops ?? []).toHaveLength(0);
  });
});

describe('M5d capture', () => {
  const fall = (seed: number, friend: boolean) => {
    const sim = createSim(flat(), seed);
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, men('w', 'militia', 8).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 15 } } })));
    if (friend) sim.spawnSquad('a', 0, 'militia', 4, 30, 24 - CAPTURE_R + 4); // holding behind, within CAPTURE_R
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 32);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => alive(sim, a) === 0);
    sim.order({ kind: 'hold', squad: b });
    run(sim, 1);
    return sim.endFight().persons;
  };

  it('a wounded man is taken only when no friendly stands within 15 tiles at the fight end', () => {
    const alone = fall(6, false);
    expect(alone).toHaveLength(8);
    expect(alone.some((p) => p.state === 'captive' && p.captor === 1)).toBe(true);
    expect(alone.some((p) => p.state === 'wounded')).toBe(false);
    const covered = fall(6, true);
    expect(covered.filter((p) => p.state === 'captive')).toHaveLength(0);
    expect(covered.some((p) => p.state === 'wounded')).toBe(true);
  });
});

describe('M5d XP', () => {
  it('per unit: damage, kills, survived (>= N foes), half when wounded; level-ups re-bake; reported once', () => {
    const roster = createRoster();
    const mine = roster.recruit('p', 'hoplite', 12);
    for (const p of mine) p.hero.xp = 30; // close to level 2 (40)
    const sim = createSim(flat(), 7);
    const a = sim.spawnSquad('you', 0, 'x', 0, 30, 24, mine);
    const b = sim.spawnSquad('foe', 1, 'militia', 12, 30, 34);
    sim.order({ kind: 'attack', squad: a, target: b });
    run(sim, 3000, () => alive(sim, b) === 0 || alive(sim, a) === 0);
    expect(alive(sim, b)).toBe(0);
    const r = sim.endFight();
    expect(r.persons).toHaveLength(12);
    const foesFallen = sim.snapshot().units.filter((u) => u.squad === b && u.state === 'dead').length;
    expect(r.persons.reduce((s, p) => s + p.kills, 0)).toBe(foesFallen);
    let total = 0;
    for (const p of r.persons) {
      const full = Math.floor(p.dmg * XP.perDmg + 1e-9) + p.kills * XP.kill + (p.state === 'fit' ? XP.survived : 0);
      if (p.state === 'fit') expect(p.xp).toBeGreaterThanOrEqual(full - 1);
      if (p.state === 'fit') expect(p.xp).toBeLessThanOrEqual(full + 1);
      if (p.state === 'wounded' || p.state === 'captive') expect(p.xp).toBeLessThanOrEqual(Math.ceil(full / 2) + 1);
      if (p.state === 'dead') expect(p.xp).toBe(0);
      expect(p.hero.battles).toBe(1);
      expect(p.hero.level).toBe(1 + p.levelUps);
      expect(p.levelUps).toBe(p.xp + 30 >= 40 ? 1 : 0);
      if (p.levelUps) expect(p.hero.points).toBe(2 * p.levelUps);
      total += p.xp;
    }
    expect(total).toBeGreaterThan(12 * XP.survived);
    // level-ups show in the snapshot (re-baked) and the log
    const up = r.persons.filter((p) => p.levelUps > 0 && p.state === 'fit');
    expect(up.length).toBeGreaterThan(0);
    const snap = sim.snapshot();
    for (const p of up) {
      const u = snap.units.find((x) => x.pid === p.pid)!;
      expect(u.level).toBe(p.hero.level);
      expect(u.maxHp).toBe(warStatsOf({ ...mine[0], hero: p.hero }).maxHp);
    }
    expect(sim.events().filter((e) => e.kind === 'levelUp')).toHaveLength(up.length + r.persons.filter((p) => p.levelUps && p.state !== 'fit').length);
    expect(up[0].hero.xp).toBeLessThan(xpToNext(up[0].hero.level));
    roster.apply(r);
    expect(roster.fit().length).toBe(r.persons.filter((p) => p.state === 'fit').length);
    // nothing new: nobody reported again
    expect(sim.endFight().persons).toHaveLength(0);
  });

  it('an objective (a building felled) gives its squad XP', () => {
    const sim = createSim(flat(), 8);
    sim.claim(1, 40, 40, 20);
    sim.order({ kind: 'placeBuilding', team: 1, type: 'camp', x: 40, y: 40 });
    const a = sim.spawnSquad('you', 0, 'x', 0, 30, 30, men('m', 'militia', 6));
    run(sim, 1);
    const id = sim.snapshot().buildings![0].id;
    sim.damageBuilding(id, sim.snapshot().buildings![0].hp - 2);
    sim.order({ kind: 'attackBuilding', squad: a, building: id });
    run(sim, 600, () => sim.snapshot().buildings!.find((x) => x.id === id)?.state === 'destroyed');
    expect(sim.events().some((e) => e.kind === 'objective' && e.squad === a && e.what === 'building')).toBe(true);
    const r = sim.endFight();
    expect(r.persons.length).toBe(6);
    for (const p of r.persons) expect(p.xp).toBeGreaterThanOrEqual(XP.objective);
  });

  it('determinism: the same fight gives the same snapshot and report', () => {
    const go = () => {
      const sim = createSim(flat(), 9);
      const a = sim.spawnSquad('you', 0, 'x', 0, 30, 24, men('p', 'celt_sword', 12, { level: 4 }));
      const b = sim.spawnSquad('foe', 1, 'hoplite', 12, 30, 34);
      sim.order({ kind: 'attack', squad: a, target: b });
      sim.order({ kind: 'attack', squad: b, target: a });
      run(sim, 150);
      sim.order({ kind: 'active', squad: a });
      run(sim, 1500);
      return JSON.stringify([sim.snapshot(), sim.endFight(), sim.events()]);
    };
    expect(go()).toBe(go());
  });
});
