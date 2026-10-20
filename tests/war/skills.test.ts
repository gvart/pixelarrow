import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { BRAZIER } from '../../src/war/sim/economy';
import { makePerson } from '../../src/war/sim/roster';
import { ACTIVE, activeCooldown } from '../../src/war/sim/skills';
import type { WarBuildSim, WarPerson, WarSkillId } from '../../src/war/types';
import { flat } from './flatRegion';

const squadOf = (prefix: string, cls: string, n: number, level: number, skills: WarSkillId[], wil?: number): WarPerson[] =>
  Array.from({ length: n }, (_, k) => {
    const p = makePerson(`${prefix}${k}`, cls, { level, skills });
    if (wil !== undefined) p.hero.attrs.wil = wil;
    return p;
  });

const hpOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  return snap.squads[squad].units.reduce((a, id) => a + snap.units[id].hp, 0);
};
const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};

/** Damage the defender squad (holding) takes from `atk` attacking it for `ticks`, summed over seeds. */
function taken(def: WarPerson[] | null, atk: WarPerson[] | null, ticks: number, opts: { active?: 'def' | 'atk'; defCls?: string; atkCls?: string } = {}) {
  let lost = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = createSim(flat(), seed);
    const d = sim.spawnSquad('d', 0, opts.defCls ?? 'hoplite', 12, 30, 30, def ?? undefined);
    const a = sim.spawnSquad('a', 1, opts.atkCls ?? 'militia', 12, 30, 36, atk ?? undefined);
    sim.order({ kind: 'attack', squad: a, target: d });
    const before = hpOf(sim, d);
    for (let t = 0; t < ticks; t++) {
      if (opts.active && t === 30) sim.order({ kind: 'active', squad: opts.active === 'def' ? d : a });
      sim.step();
    }
    lost += before - hpOf(sim, d);
  }
  return lost;
}

describe('M5c flags', () => {
  it('Hold Fast: a holding squad blocks more, so takes less', () => {
    const plain = taken(squadOf('h', 'hoplite', 12, 7, ['shieldDrill']), null, 120);
    const fast = taken(squadOf('h', 'hoplite', 12, 7, ['shieldDrill', 'holdFast']), null, 120);
    expect(fast).toBeLessThan(plain * 0.95);
  });

  it('Finisher: blows on men below 40% HP hit harder', () => {
    const plain = taken(null, squadOf('s', 'celt_sword', 12, 7, ['brawler']), 200, { atkCls: 'celt_sword' });
    const fin = taken(null, squadOf('s', 'celt_sword', 12, 7, ['brawler', 'finisher']), 200, { atkCls: 'celt_sword' });
    expect(fin).toBeGreaterThan(plain * 1.02);
  });

  it('Fire Archer: twice the brazier reach', () => {
    for (const [skills, ok] of [[['eagleEye'], false], [['eagleEye', 'fireArcher'], true]] as const) {
      const sim = createSim(flat(), 1);
      sim.addStock(0, 'pitch', 10);
      sim.addStock(0, 'wood', 10);
      const s = sim.spawnSquad('p', 0, 'archer', 4, 30.5, 30.5, squadOf('a', 'archer', 4, 7, [...skills]));
      sim.order({ kind: 'formation', squad: s, shape: 'column' });
      sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 30.5 + BRAZIER.radius + 2.5, y: 30.5 });
      sim.order({ kind: 'fireArrows', squad: s, on: true });
      run(sim, 20);
      expect(sim.snapshot().squads[s].fireArrows?.available).toBe(ok);
    }
  });
});

describe('M5c squad active', () => {
  it('one per squad from its best-ranked man; fires once, buff 8 s, cooldown 60 s less 2.5% per WIL above 5', () => {
    const sim = createSim(flat(), 1);
    const men = [...squadOf('a', 'hoplite', 3, 4, ['shieldWall']), ...squadOf('b', 'hoplite', 1, 8, ['shieldDrill', 'shieldWall'], 9)];
    const s = sim.spawnSquad('p', 0, 'x', 0, 30, 30, men);
    const none = sim.spawnSquad('p', 0, 'hoplite', 4, 20, 20);
    expect(sim.snapshot().squads[none].active).toBeUndefined();
    expect(sim.snapshot().squads[s].active).toEqual({ skill: 'shieldWall', ready: 0, on: 0 });
    sim.order({ kind: 'active', squad: s });
    sim.step();
    const cd = activeCooldown(9);
    expect(cd).toBe(Math.round(ACTIVE.cooldown * 0.9));
    expect(sim.snapshot().squads[s].active).toEqual({ skill: 'shieldWall', ready: cd - 1, on: ACTIVE.buff - 1 });
    sim.order({ kind: 'active', squad: s }); // not ready: nothing
    run(sim, ACTIVE.buff);
    expect(sim.snapshot().squads[s].active).toMatchObject({ on: 0, ready: cd - 1 - ACTIVE.buff });
    run(sim, cd);
    expect(sim.snapshot().squads[s].active!.ready).toBe(0);
  });

  it('Shield Wall halves damage taken while on; Berserk adds damage dealt', () => {
    const wall = squadOf('w', 'hoplite', 12, 3, ['shieldWall']);
    expect(taken(wall, null, 80, { active: 'def' })).toBeLessThan(taken(wall, null, 80) * 0.8);
    const zerk = squadOf('z', 'celt_sword', 12, 3, ['berserk']);
    expect(taken(null, zerk, 110, { active: 'atk', atkCls: 'celt_sword' })).toBeGreaterThan(taken(null, zerk, 110, { atkCls: 'celt_sword' }) * 1.1);
  });

  it('bots fire their actives in a fight', () => {
    const sim = createSim(flat(), 3);
    const bots = createBots(sim);
    const a = sim.spawnSquad('bot', 0, 'x', 0, 30, 20, squadOf('z', 'celt_sword', 12, 3, ['berserk']));
    sim.spawnSquad('e', 1, 'militia', 12, 30, 40);
    bots.set(a, { kind: 'attackMove', x: 30, y: 44 });
    let fired = false;
    for (let t = 0; t < 600 && !fired; t++) {
      sim.step();
      bots.tick();
      fired = (sim.snapshot().squads[a].active?.on ?? 0) > 0;
    }
    expect(fired).toBe(true);
  });
});
