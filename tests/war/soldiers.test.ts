import { describe, expect, it } from 'vitest';
import type { ClassId } from '../../src/data/classes';
import { createSim } from '../../src/war/sim';
import { CLAMP, CLAMP_BASE, freshHero, warStats, warStatsOf } from '../../src/war/sim/classes';
import { createRoster, makePerson } from '../../src/war/sim/roster';
import { F, FAMILY_OF, MAX_FLAGS } from '../../src/war/sim/skills';
import { flat } from './flatRegion';

const SOLDIER_CLASSES = Object.keys(FAMILY_OF) as ClassId[];

describe('M5b bake', () => {
  it('a fresh hero bakes to the class baseline, for every soldier class', () => {
    for (const cls of SOLDIER_CLASSES) {
      expect(warStatsOf(freshHero(cls))).toEqual(warStats(cls));
      expect(warStatsOf(makePerson('p', cls))).toEqual(warStats(cls));
    }
  });

  it('a max soldier (L10, tier 3 legendary kit, skills) stays within the clamp of his class, and is better than fresh', () => {
    for (const cls of SOLDIER_CLASSES) {
      const o = warStats(cls), b = warStats(CLAMP_BASE[cls] ?? cls); // elites: capped on the trained class, never below their own fresh
      const p = makePerson('max', cls, { level: 10, tier: 2, rarity: 'legendary' });
      expect(p.skills).toHaveLength(2);
      const s = warStatsOf(p);
      const e = 1e-9;
      expect(s.maxHp).toBeLessThanOrEqual(Math.max(o.maxHp, Math.round(b.maxHp * CLAMP.hp)));
      expect(s.dmg).toBeLessThanOrEqual(Math.max(o.dmg, b.dmg * CLAMP.dmg) + e);
      expect(s.rangedDmg).toBeLessThanOrEqual(Math.max(o.rangedDmg, b.rangedDmg * CLAMP.dmg) + e);
      expect(s.armor).toBeLessThanOrEqual(Math.max(o.armor, b.armor + CLAMP.armor) + e);
      expect(s.block).toBeLessThanOrEqual(Math.max(o.block, b.block + CLAMP.block) + e);
      expect(s.accuracy).toBeLessThanOrEqual(Math.max(o.accuracy, b.accuracy + CLAMP.accuracy) + e);
      expect(s.atkTicks).toBeGreaterThanOrEqual(Math.min(o.atkTicks, Math.round(b.atkTicks * CLAMP.atk)));
      expect(s.shotTicks).toBeGreaterThanOrEqual(Math.min(o.shotTicks, Math.round(b.shotTicks * CLAMP.atk)));
      expect(s.speed).toBeLessThanOrEqual(Math.max(o.speed, b.speed * CLAMP.speed) + e);
      expect(s.maxHp).toBeGreaterThan(b.maxHp);
      expect(s.maxHp).toBeGreaterThanOrEqual(o.maxHp);
      let n = 0;
      for (let v = s.flags; v; v &= v - 1) n++;
      expect(n).toBeLessThanOrEqual(MAX_FLAGS);
      if (o.range === 0) expect(s.range).toBe(0);
    }
  });

  it('P skills land in the stats, F skills in the flags; skills need the level and the family', () => {
    const base = warStatsOf(makePerson('a', 'hoplite', { level: 7, skills: [] }));
    const drill = warStatsOf(makePerson('b', 'hoplite', { level: 7, skills: ['shieldDrill', 'holdFast'] }));
    expect(drill.armor).toBeCloseTo(Math.min(base.armor + 1, warStats('hoplite').armor + CLAMP.armor));
    expect(drill.block).toBeGreaterThan(base.block);
    expect(drill.flags).toBe(F.holdFast);
    expect(makePerson('c', 'hoplite', { level: 2, skills: ['shieldDrill'] }).skills).toEqual([]);
    expect(makePerson('d', 'hoplite', { level: 5, skills: ['shieldDrill', 'holdFast'] }).skills).toEqual(['shieldDrill']);
    expect(makePerson('e', 'archer', { level: 9, skills: ['brawler', 'deepQuiver'] }).skills).toEqual(['deepQuiver']);
    const q = warStatsOf(makePerson('f', 'archer', { level: 3, skills: ['deepQuiver'] }));
    expect(q.ammo).toBe(Math.round(warStats('archer').ammo * 1.4));
    expect(q.range).toBe(warStats('archer').range + 1);
  });

  // its time budget (600 persons well inside one region join) is in tests/perf/war.perf.ts (npm run perf:war)
  it('baking 600 persons is pure: the same person bakes to the same stats every time', () => {
    const ps = SOLDIER_CLASSES.flatMap((cls, i) => Array.from({ length: 34 }, (_, k) => makePerson(`${i}-${k}`, cls, { level: 1 + (k % 10), tier: k % 3, rarity: 'epic' }))).slice(0, 600);
    expect(ps).toHaveLength(600);
    expect(ps.map((p) => warStatsOf(p))).toEqual(ps.map((p) => warStatsOf(p)));
  });

  it('spawnSquad takes persons: one man each with his own baked stats, pid and level in the snapshot', () => {
    const roster = createRoster();
    const vets = roster.recruit('v', 'hoplite', 3, { level: 6, tier: 1, rarity: 'rare' });
    const fresh = roster.recruit('f', 'militia', 2);
    expect(roster.all()).toHaveLength(5);
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('p', 0, 'ignored', 99, 20, 20, [...vets, ...fresh]);
    const snap = sim.snapshot();
    const us = snap.squads[s].units.map((id) => snap.units[id]);
    expect(us.map((u) => u.pid)).toEqual(['v-0', 'v-1', 'v-2', 'f-3', 'f-4']);
    expect(us.map((u) => u.cls)).toEqual(['hoplite', 'hoplite', 'hoplite', 'militia', 'militia']);
    expect(us[0].level).toBe(6);
    expect(us[0].maxHp).toBe(warStatsOf(vets[0]).maxHp);
    expect(us[3].maxHp).toBe(warStats('militia').maxHp);
    expect(us[0].maxHp).toBeGreaterThan(warStats('hoplite').maxHp);
    // a class spawn carries no person
    const c = sim.spawnSquad('p', 0, 'archer', 4, 30, 30);
    expect(sim.snapshot().units[sim.snapshot().squads[c].units[0]].pid).toBeUndefined();
  });
});
