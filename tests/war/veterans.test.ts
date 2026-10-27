/** E3 veterans (src/war/sim/deeds.ts): deeds and scars on the fight report, a fallen man's kit his owner's for a while. */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { DEED_NAME } from '../../src/war/sim/deeds';
import { createRoster, makePerson } from '../../src/war/sim/roster';
import { CLAIM_TICKS } from '../../src/war/sim/trade';
import type { RegionData, WarBuildSim, WarPerson } from '../../src/war/types';
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

describe('E3 deeds and scars', () => {
  it('first blood on a first kill, survivor and a scar for the wounded; the roster keeps them once', () => {
    const sim = createSim(flat(), 3);
    const vets = men('v', 'hoplite', 12, { level: 4, tier: 1 });
    const a = sim.spawnSquad('p:1', 0, 'x', 0, 30, 24, vets);
    const b = sim.spawnSquad('foe', 1, 'hoplite', 12, 30, 34);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => alive(sim, b) === 0 || alive(sim, a) === 0);
    const r = sim.endFight();
    const killers = r.persons.filter((x) => x.kills > 0);
    expect(killers.length).toBeGreaterThan(0);
    for (const x of killers) {
      expect(x.hero.kills).toBe(x.kills);
      expect(x.deeds?.map((d) => d.name)).toContain(DEED_NAME.firstBlood);
    }
    const wounded = r.persons.filter((x) => x.state === 'wounded');
    expect(wounded.length).toBeGreaterThan(0);
    for (const x of wounded) {
      expect(x.scar).toBe(true);
      expect(x.deeds?.map((d) => d.id)).toContain('survivor');
    }
    for (const x of r.persons.filter((p) => p.state === 'fit')) expect(x.scar).toBeUndefined();
    const roster = createRoster();
    for (const p of vets) roster.add(p);
    roster.apply(r);
    roster.apply(r); // the same report twice: no deed twice, one more scar only
    const w = roster.get(wounded[0].pid)!;
    expect(w.deeds!.filter((d) => d.id === 'survivor')).toHaveLength(1);
    expect(w.scars).toBe(2);
    expect(roster.get(killers[0].pid)!.hero.kills).toBe(killers[0].kills);
  });

  it('Boar-slayer: men who struck the Erymanthian Boar when it fell', () => {
    const region: RegionData = { ...flat(96), id: 'erymanthos', depth: 3, lairs: [], claimPoints: [], guardians: [{ boss: 'erymanthian_boar', x: 48, y: 48 }] };
    const sim = createSim(region, 5);
    sim.spawnMobs();
    sim.step();
    const boar = sim.snapshot().bosses![0];
    const a = sim.spawnSquad('p:1', 0, 'x', 0, 48, 54, men('h', 'hoplite', 12, { level: 8, tier: 2, rarity: 'epic' }));
    sim.order({ kind: 'attack', squad: a, target: boar.squad });
    run(sim, 400, () => (sim.snapshot().bosses![0].hp < boar.maxHp * 0.9));
    sim.hurtBoss('erymanthian_boar', 1e9, 'p:1');
    run(sim, 2);
    const r = sim.endFight();
    const slayers = r.persons.filter((x) => x.deeds?.some((d) => d.id === 'slayer:erymanthian_boar'));
    expect(slayers.length).toBeGreaterThan(0);
    expect(slayers[0].deeds!.find((d) => d.id === 'slayer:erymanthian_boar')!.name).toBe('Boar-slayer');
    // the next fight: no slaying in it, no new deed
    expect(sim.endFight().persons.every((x) => !x.deeds?.some((d) => d.id.startsWith('slayer:')))).toBe(true);
  });
});

describe('E3 a fallen man\'s kit', () => {
  it('falls as a pile named for him, his owner\'s alone for CLAIM_TICKS, then anyone\'s', () => {
    const sim = createSim(flat(), 4);
    const victims = men('v', 'hoplite', 12, { tier: 1, rarity: 'rare' }).map((p) => ({ ...p, hero: { ...p.hero, attrs: { ...p.hero.attrs, end: 0 } } }));
    const a = sim.spawnSquad('a', 0, 'x', 0, 30, 24, victims);
    const b = sim.spawnSquad('b', 1, 'royal_guard', 12, 30, 34);
    sim.order({ kind: 'attack', squad: b, target: a });
    run(sim, 3000, () => alive(sim, a) === 0);
    const kits = (sim.snapshot().piles ?? []).filter((p) => p.claim);
    expect(kits.length).toBeGreaterThan(0);
    const kit = kits[0];
    expect(kit.claim!.owner).toBe('a');
    expect(victims.map((v) => v.hero.name)).toContain(kit.claim!.name);
    expect(kit.claim!.left).toBeLessThanOrEqual(CLAIM_TICKS);
    // the foe is refused; a squad of the owner's carries it home
    const packs = (sq: number) => sim.snapshot().units.filter((u) => u.squad === sq).reduce((n, u) => n + (u.pack ?? 0), 0);
    sim.order({ kind: 'load', squad: b, from: { pile: kit.id } });
    run(sim, 400);
    expect(packs(b)).toBe(0);
    sim.order({ kind: 'move', squad: b, x: 60, y: 60 });
    run(sim, 200);
    const own = sim.spawnSquad('a', 0, 'hoplite', 6, 36, 24);
    sim.order({ kind: 'load', squad: own, from: { pile: kit.id } });
    run(sim, 400);
    expect(packs(own)).toBeGreaterThan(0);
  });
});
