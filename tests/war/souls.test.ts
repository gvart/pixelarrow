/**
 * W-60 souls (src/war/sim/souls.ts): a claim under the cap, a claim refused at ARMY_MAX, fading, contested claims, the
 * wild and a foe taking him first, where souls wake and how good they are.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import { createSouls, SOUL, soulLevel, soulSites, type SoulHost, type SoulMan } from '../../src/war/sim/souls';
import type { RegionData, WarBuildSim, WarEvent } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};
const alive = (sim: WarBuildSim, squad: number) => sim.snapshot().squads[squad].units.filter((id) => sim.snapshot().units[id].state !== 'dead').length;

describe('W-60 claiming a soul', () => {
  it('a squad walks to a soul and claims him under the cap: a new man of his class and level joins it', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('p:1', 0, 'hoplite', 4, 10, 10);
    const id = sim.spawnSoul(30, 30, 'archer', 3, 'lair');
    expect(sim.snapshot().souls).toEqual([expect.objectContaining({ id, cls: 'archer', level: 3, site: 'lair' })]);
    sim.order({ kind: 'claimSoul', squad: s, soul: id });
    const ev: WarEvent[] = [];
    run(sim, 1200, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulClaimed')));
    const c = ev.find((e) => e.kind === 'soulClaimed');
    expect(c).toMatchObject({ kind: 'soulClaimed', soul: id, squad: s, owner: 'p:1' });
    if (c?.kind !== 'soulClaimed') return;
    expect(c.person.hero.cls).toBe('archer');
    expect(c.person.hero.level).toBe(3);
    run(sim, 2);
    expect(alive(sim, s)).toBe(5);
    const u = sim.snapshot().units[c.unit];
    expect(u.squad).toBe(s);
    expect(u.pid).toBe(c.person.id);
    expect(sim.snapshot().souls ?? []).toEqual([]);
  });

  it('at 12 men the claim is refused and the soul waits on', () => {
    const sim = createSim(flat(), 1);
    const s = sim.spawnSquad('p:1', 0, 'militia', ARMY_MAX, 26, 30);
    const id = sim.spawnSoul(30, 30, 'hoplite');
    sim.order({ kind: 'claimSoul', squad: s, soul: id });
    const ev: WarEvent[] = [];
    run(sim, 1200, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulRefused')));
    expect(ev.find((e) => e.kind === 'soulRefused')).toMatchObject({ soul: id, squad: s, owner: 'p:1', have: ARMY_MAX });
    expect(ev.some((e) => e.kind === 'soulClaimed')).toBe(false);
    run(sim, 100);
    expect(alive(sim, s)).toBe(ARMY_MAX);
    expect(sim.snapshot().souls?.map((x) => x.id)).toEqual([id]);
    expect(sim.snapshot().souls![0].claim).toBeUndefined(); // the claim was dropped, not retried each scan
  });

  it('the gate the server sets counts men in other regions too', () => {
    const sim = createSim(flat(), 1);
    sim.setSoulGate(() => ({ ok: false, have: ARMY_MAX }));
    const s = sim.spawnSquad('p:1', 0, 'hoplite', 2, 28, 30);
    const id = sim.spawnSoul(30, 30, 'hoplite');
    sim.order({ kind: 'claimSoul', squad: s, soul: id });
    const ev: WarEvent[] = [];
    run(sim, 600, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulRefused')));
    expect(ev.find((e) => e.kind === 'soulRefused')).toMatchObject({ have: ARMY_MAX });
    expect(alive(sim, s)).toBe(2);
  });

  it('an unclaimed soul fades after SOUL.life ticks', () => {
    const sim = createSim(flat(), 1);
    const id = sim.spawnSoul(30, 30, 'militia');
    run(sim, SOUL.life - 10);
    expect(sim.snapshot().souls![0].left).toBeLessThanOrEqual(10);
    const ev: WarEvent[] = [];
    run(sim, 20, () => (ev.push(...sim.events()), false));
    expect(ev).toContainEqual(expect.objectContaining({ kind: 'soulFaded', soul: id }));
    expect(sim.snapshot().souls).toBeUndefined();
  });

  it('two sides at one soul: contested, nobody claims him while both stand there', () => {
    const sim = createSim(flat(), 1);
    const a = sim.spawnSquad('p:1', 0, 'hoplite', 2, 29, 30);
    const b = sim.spawnSquad('p:2', 1, 'hoplite', 2, 31, 30);
    const id = sim.spawnSoul(30, 30, 'hoplite');
    sim.order({ kind: 'claimSoul', squad: a, soul: id });
    sim.order({ kind: 'claimSoul', squad: b, soul: id });
    const ev: WarEvent[] = [];
    let contested = false;
    run(sim, SOUL.channel * 2, () => {
      ev.push(...sim.events());
      contested ||= !!sim.snapshot().souls?.find((x) => x.id === id)?.contested;
      return false;
    });
    expect(contested).toBe(true);
    expect(ev.some((e) => e.kind === 'soulClaimed')).toBe(false);
  });

  it('a foe who reaches him first claims him', () => {
    const sim = createSim(flat(), 1);
    const mine = sim.spawnSquad('p:1', 0, 'hoplite', 2, 4, 4);
    const foe = sim.spawnSquad('p:2', 1, 'hoplite', 2, 28, 30);
    const id = sim.spawnSoul(30, 30, 'celt_sword', 2, 'battlefield');
    sim.order({ kind: 'claimSoul', squad: mine, soul: id });
    sim.order({ kind: 'claimSoul', squad: foe, soul: id });
    const ev: WarEvent[] = [];
    run(sim, 400, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulClaimed')));
    expect(ev.find((e) => e.kind === 'soulClaimed')).toMatchObject({ owner: 'p:2', squad: foe });
    expect(alive(sim, foe)).toBe(3);
    expect(alive(sim, mine)).toBe(2);
  });

  it('the wild at an unclaimed soul takes him', () => {
    const sim = createSim(flat(), 1);
    sim.spawnSquad('mobs', MOB_TEAM, 'wolf', 2, 30, 30);
    const id = sim.spawnSoul(30, 30, 'hoplite');
    const ev: WarEvent[] = [];
    run(sim, 200, () => (ev.push(...sim.events()), ev.some((e) => e.kind === 'soulLost')));
    expect(ev.find((e) => e.kind === 'soulLost')).toMatchObject({ soul: id, team: MOB_TEAM });
  });
});

describe('W-60 where souls wake', () => {
  const region = (): RegionData => ({
    ...flat(96), id: 'krios', depth: 4,
    prebuilt: [{ type: 'shrine', x: 20, y: 20 }, { type: 'house', x: 60, y: 60, state: 'ruined' }, { type: 'house', x: 62, y: 60, state: 'ruined' }],
    lairs: [{ kind: 'wolf', x: 80, y: 80 }],
  });

  it('sites: shrines, spaced ruins, lairs', () => {
    expect(soulSites(region()).map((s) => s.kind)).toEqual(['shrine', 'ruin', 'lair']);
  });

  it('danger pays: lairs and deeper regions wake higher levels', () => {
    expect(soulLevel('shrine', 0)).toBe(1);
    expect(soulLevel('lair', 1)).toBe(3);
    expect(soulLevel('lair', 4)).toBe(5);
    expect(soulLevel('shrine', 4)).toBe(3);
    expect(SOUL.chance.lair).toBeLessThan(SOUL.chance.shrine); // the better souls are the rarer
  });

  const host = (ev: WarEvent[], men: SoulMan[] = []): SoulHost => ({ men: () => men, gate: () => ({ ok: true, have: 0 }), join: () => null, stop: () => {}, emit: (e) => ev.push(e) });

  it('rolls wake souls at the sites, at most SOUL.max at once, of the site classes and levels (seeded)', () => {
    const ev: WarEvent[] = [];
    const a = createSouls(region(), 7, host(ev)), b = createSouls(region(), 7, host([]));
    for (let t = 0; t <= SOUL.every * 30; t += SOUL.scan) (a.tick(t), b.tick(t));
    expect(a.snaps(0)).toEqual(b.snaps(0)); // deterministic
    let woke = 0;
    const c = createSouls(region(), 9, host([]));
    for (let k = 1; k <= 200; k++) {
      c.tick(k * SOUL.every);
      const s = c.snaps(k * SOUL.every);
      expect(s.length).toBeLessThanOrEqual(SOUL.max);
      for (const x of s) expect(x.level).toBe(soulLevel(x.site, 4));
      woke = Math.max(woke, s.length);
    }
    expect(woke).toBeGreaterThan(0);
  });

  it('where SOUL.field men fell an old battlefield wakes souls of the class most of them were', () => {
    const r = { ...flat(96), id: 't' };
    const s = createSouls(r, 3, host([]));
    for (let i = 0; i < SOUL.field; i++) s.fell(40 + (i % 3), 40, i < 4 ? 'javelineer' : 'hoplite');
    expect(s.sites().map((x) => x.kind)).toEqual(['battlefield']);
    for (let k = 1; k < 100 && !s.any(); k++) s.tick(k * SOUL.every);
    expect(s.snaps(0)[0]).toMatchObject({ site: 'battlefield', cls: 'javelineer' });
  });
});
