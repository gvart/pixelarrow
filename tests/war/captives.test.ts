/**
 * W-68 captives and dismissal in the sim (src/war/sim/captives.ts, souls.ts spawnNamed, WarBuildSim.dismissPerson): the
 * refusal chance by level (fixed per man), named souls at a shrine (his record kept, the dismissing owner barred for a
 * while, outside the SOUL.max count), a dismissed man's gear in a pile where he stood.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { askAt, CAPTIVE, refuseChance, refuses, soulRegions } from '../../src/war/sim/captives';
import { makePerson } from '../../src/war/sim/roster';
import { SOUL } from '../../src/war/sim/souls';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const shrined = (): RegionData => ({ ...flat(64), id: 't-shrine', prebuilt: [{ type: 'shrine', x: 30, y: 30 }] });
const vet = (id: string) => {
  const p = makePerson(id, 'archer', { level: 4 });
  return { ...p, hero: { ...p.hero, name: 'Damon', kills: 9, battles: 5 }, honours: [{ name: 'Held the Ford', stat: 'block' as const }] };
};

describe('W-68 asking a captive to join', () => {
  it('the chance he refuses: 30% + 5% a level above 1', () => {
    expect(refuseChance(1)).toBeCloseTo(0.3);
    expect(refuseChance(5)).toBeCloseTo(0.5);
    expect(refuseChance(10)).toBeCloseTo(0.75);
  });

  it('fixed per man, and near the chance over many men (seeded)', () => {
    expect(refuses('w1-abc', 3)).toBe(refuses('w1-abc', 3));
    for (const level of [1, 4, 8]) {
      let n = 0;
      for (let k = 0; k < 4000; k++) if (refuses(`w${k}-x${k * 7}`, level)) n++;
      expect(n / 4000).toBeCloseTo(refuseChance(level), 1);
    }
  });

  it('he may be asked 2 h after he was taken', () => {
    const taken = 1_000_000, until = taken + CAPTIVE.holdMs;
    expect(askAt(until)).toBe(taken + 2 * 3_600_000);
  });

  it('his soul wakes in the region, else the nearest world regions first', () => {
    expect(soulRegions('test-ridge')[0]).toBe('test-ridge');
    expect(soulRegions('test-ridge')).toHaveLength(1 + 37);
    const r = soulRegions('dodona');
    expect(r[0]).toBe('dodona');
    expect(r.slice(1, 5).sort()).toEqual(['dodona-e', 'dodona-n', 'dodona-s', 'dodona-w']);
  });
});

describe('W-68 named souls', () => {
  it('wakes at a shrine as himself; a claim brings his record, level and class', () => {
    const sim = createSim(shrined(), 1);
    const s = sim.spawnSquad('p:2', 0, 'hoplite', 3, 20, 20);
    expect(sim.spawnNamedSoul(vet('w1-vet'), CAPTIVE.soulMs / 100)).toBe(true);
    expect(sim.spawnNamedSoul(vet('w1-vet'), CAPTIVE.soulMs / 100)).toBe(true); // once per man
    const souls = sim.snapshot().souls!;
    expect(souls).toHaveLength(1);
    expect(souls[0]).toMatchObject({ cls: 'archer', level: 4, site: 'shrine', name: 'Damon' });
    expect(souls[0].left).toBe(CAPTIVE.soulMs / 100); // waits far longer than a plain soul
    expect(souls[0].left).toBeGreaterThan(SOUL.life);
    sim.order({ kind: 'claimSoul', squad: s, soul: souls[0].id });
    const ev: WarEvent[] = [];
    run(sim, 1500, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulClaimed')));
    const c = ev.find((e) => e.kind === 'soulClaimed');
    if (c?.kind !== 'soulClaimed') throw new Error('not claimed');
    expect(c.person).toMatchObject({ id: 'w1-vet', hero: { name: 'Damon', level: 4, cls: 'archer', kills: 9 }, honours: [{ name: 'Held the Ford' }] });
  });

  it('no shrine in the region: refused (the server tries the next region)', () => {
    const sim = createSim(flat(64), 1);
    expect(sim.spawnNamedSoul(vet('w1-x'), 1000)).toBe(false);
  });

  it('the owner who dismissed him cannot claim him for the bar; another player can', () => {
    const sim = createSim(shrined(), 1);
    const mine = sim.spawnSquad('p:1', 0, 'hoplite', 2, 29, 30);
    sim.spawnNamedSoul(vet('w1-bar'), 100_000, { owner: 'p:1', ticks: 600 });
    const id = sim.snapshot().souls![0].id;
    expect(sim.snapshot().souls![0].bar).toEqual({ owner: 'p:1', at: 600 });
    sim.order({ kind: 'claimSoul', squad: mine, soul: id });
    const ev: WarEvent[] = [];
    run(sim, 500, () => (ev.push(...sim.events()), false));
    expect(ev.some((e) => e.kind === 'soulClaimed')).toBe(false);
    // the bar lifts: his own squad may claim him now
    sim.order({ kind: 'claimSoul', squad: mine, soul: id });
    run(sim, 400, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulClaimed')));
    expect(ev.find((e) => e.kind === 'soulClaimed')).toMatchObject({ owner: 'p:1', person: { id: 'w1-bar' } });
  });

  it('a named soul fades with his person id, and does not count toward SOUL.max', () => {
    const sim = createSim(shrined(), 1);
    sim.spawnNamedSoul(vet('w1-fade'), 20);
    const ev: WarEvent[] = [];
    run(sim, 40, () => (ev.push(...sim.events()), false));
    expect(ev.find((e) => e.kind === 'soulFaded')).toMatchObject({ pid: 'w1-fade' });
  });
});

describe('W-68 dismissing a man in the field', () => {
  it('his worn gear drops in a pile where he stood; he leaves the field', () => {
    const sim = createSim(flat(64), 1);
    const s = sim.spawnSquad('p:1', 0, 'hoplite', 2, 20, 20, [vet('w1-d1'), vet('w1-d2')]);
    run(sim, 2);
    const before = sim.snapshot().piles?.length ?? 0;
    const at = sim.dismissPerson('w1-d1');
    expect(at).not.toBeNull();
    run(sim, 2);
    const snap = sim.snapshot();
    expect(snap.units.filter((u) => u.pid === 'w1-d1' && u.state !== 'dead')).toHaveLength(0);
    expect(snap.squads[s].units.filter((id) => snap.units[id].state !== 'dead')).toHaveLength(1);
    expect((snap.piles?.length ?? 0)).toBe(before + 1);
    expect(sim.dismissPerson('w1-d1')).toBeNull();
  });
});
