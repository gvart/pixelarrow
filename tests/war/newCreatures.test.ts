/**
 * new-creatures (src/war/sim/mobs.ts): giant scorpions (armoured, venomous), harpies (a dive, weak once caught),
 * cyclopes (huge, a club that throws men) and drakes (scaled, a repeated rush); the regions that hold them (Drakon's
 * called drakes: tests/war/bosses.test.ts); and the chiefs' fight length (60-90 s against a solo player's 12 men: level 2 at depth 1, level 3 at depth 2; W-58). Squads are looked up by lair or kind,
 * never by a fixed id.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { MOBS } from '../../src/war/sim/mobs';
import { makePerson } from '../../src/war/sim/roster';
import { ARMY_MAX } from '../../src/war/sim/soldiers';
import { CHIEF_KINDS, chiefsOfKind, warChief } from '../../src/data/warBosses';
import type { MobKind, RegionData, WarBuildSim, WarEvent } from '../../src/war/types';
import krios from '../../src/war/regions/krios.json';
import saddle from '../../src/war/regions/saddle.json';
import gorge from '../../src/war/regions/gorge.json';
import stymphalia from '../../src/war/regions/stymphalia.json';
import kyreneE from '../../src/war/regions/kyrene-e.json';
import ammos from '../../src/war/regions/ammos.json';

function flat(lairs: RegionData['lairs'] = [], depth?: number, n = 96): RegionData {
  return { id: 't', name: 't', w: n, h: n, ...(depth !== undefined ? { depth } : {}), height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [], objects: [], lairs, claimPoints: [] };
}
function run(sim: WarBuildSim, ticks: number, log: WarEvent[] = [], until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    log.push(...sim.events());
    if (until?.()) return t + 1;
  }
  return ticks;
}
const alive = (sim: WarBuildSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead');
const dashes = (log: WarEvent[], mob: string) => log.filter((e): e is Extract<WarEvent, { kind: 'mobDash' }> => e.kind === 'mobDash' && e.mob === mob);
/** A lair's squad by its kind (the first lair of that kind). */
const lairOf = (sim: WarBuildSim, kind: MobKind) => sim.snapshot().lairs!.find((l) => l.kind === kind)!;

describe('new creatures', () => {
  it('stats: scorpions armoured and venomous, harpies fast and frail, cyclopes huge and knocking, drakes scaled with a rush', () => {
    const militia = warStats('militia'), sc = warStats('mob_scorpion'), ha = warStats('mob_harpy'), cy = warStats('mob_cyclops'), dr = warStats('mob_drake');
    expect(MOBS.scorpion.venom).toBe(true);
    expect(sc.armor).toBeGreaterThan(warStats('mob_wolf').armor);
    expect(ha.speed).toBeGreaterThan(militia.speed);
    expect(ha.maxHp).toBeLessThan(militia.maxHp);
    expect(MOBS.harpy.dash?.once).toBe(true);
    expect(cy.maxHp).toBeGreaterThan(warStats('mob_bear').maxHp);
    expect(cy.knock).toBeGreaterThan(warStats('mob_boar').knock ?? 0);
    expect(MOBS.cyclops.count).toBeLessThanOrEqual(2);
    expect(dr.armor).toBeGreaterThan(militia.armor);
    expect(MOBS.drake.dash?.once).toBeFalsy();
    for (const s of [sc, ha, cy, dr]) expect(s.range).toBe(0);
  });

  it('a scorpion lair rouses on men near it and stings them', () => {
    const sim = createSim(flat([{ kind: 'scorpion', x: 40.5, y: 40.5 }]), 21);
    sim.spawnMobs();
    const l = lairOf(sim, 'scorpion');
    expect(alive(sim, l.squad).every((u) => u.cls === 'mob_scorpion')).toBe(true);
    expect(alive(sim, l.squad)).toHaveLength(MOBS.scorpion.count);
    const men = sim.spawnSquad('you', 0, 'militia', 6, 46.5, 40.5);
    const hp = () => alive(sim, men).reduce((a, u) => a + u.hp, 0), h0 = hp();
    run(sim, 200, [], () => hp() < h0);
    expect(lairOf(sim, 'scorpion').state).toBe('chase');
    expect(hp()).toBeLessThan(h0);
  });

  it('a harpy dives once on a man: a burst from a few tiles off, then plain blows', () => {
    const sim = createSim(flat(), 22);
    const h = sim.spawnSquad('wild', 1, 'mob_harpy', 1, 30.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'militia', 1, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: h, target: men });
    const log: WarEvent[] = [];
    run(sim, 300, log, () => alive(sim, men).length === 0 || alive(sim, h).length === 0);
    const d = dashes(log, 'harpy');
    expect(d).toHaveLength(1);
    expect(Math.hypot(d[0].tx - d[0].x, d[0].ty - d[0].y)).toBeGreaterThan(MOBS.harpy.dash!.min);
  });

  it('a cyclops club throws a man back', () => {
    const sim = createSim(flat(), 23);
    const c = sim.spawnSquad('wild', 1, 'mob_cyclops', 1, 38.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'hoplite', 1, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: c, target: men });
    const m0 = alive(sim, men)[0], hp0 = m0.hp, x0 = m0.x;
    run(sim, 200, [], () => alive(sim, men)[0].hp < hp0);
    run(sim, 3);
    const m = alive(sim, men)[0];
    expect(m.hp).toBeLessThan(hp0);
    expect(m.x - x0).toBeGreaterThan(0.6);
  });

  it('a drake rushes the same man again after its cooldown', () => {
    const sim = createSim(flat(), 24);
    const d = sim.spawnSquad('wild', 1, 'mob_drake', 1, 30.5, 40.5);
    const men = sim.spawnSquad('you', 0, 'hoplite', 1, 40.5, 40.5);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: d, target: men });
    const log: WarEvent[] = [];
    run(sim, 100, log, () => dashes(log, 'drake').length > 0);
    expect(dashes(log, 'drake')).toHaveLength(1);
    // the drake falls back, then comes on at the same man: a second rush once its cooldown is up (a lion pounces once)
    sim.order({ kind: 'move', squad: d, x: 30.5, y: 40.5 });
    run(sim, 60, log);
    const gap = Math.hypot(alive(sim, men)[0].x - alive(sim, d)[0].x, alive(sim, men)[0].y - alive(sim, d)[0].y);
    expect(gap, 'clear').toBeGreaterThan(MOBS.drake.dash!.min + 1.2);
    sim.order({ kind: 'hold', squad: men });
    sim.order({ kind: 'attack', squad: d, target: men });
    run(sim, 200, log, () => dashes(log, 'drake').length > 1);
    const r = dashes(log, 'drake');
    expect(r.length).toBe(2);
    for (let i = 1; i < r.length; i++) expect(r[i].t - r[i - 1].t).toBeGreaterThanOrEqual(MOBS.drake.dash!.cd);
  });

  it('the regions whose lore names them hold their lairs; Krios has a cyclops chief', () => {
    const kinds = (r: { lairs?: { kind: string }[] }) => (r.lairs ?? []).map((l) => l.kind);
    expect(kinds(krios)).toContain('cyclops');
    expect(kinds(krios)).toContain('drake');
    expect(kinds(saddle)).toContain('cyclops');
    expect(kinds(gorge)).toContain('harpy');
    expect(kinds(stymphalia)).toContain('harpy');
    expect(kinds(kyreneE)).toContain('scorpion');
    expect(kinds(ammos)).toContain('scorpion');
    const chief = (krios.lairs as { kind: string; chief?: string }[]).find((l) => l.chief && l.kind === 'cyclops');
    expect(warChief(chief!.chief!)?.kind).toBe('cyclops');
  });

  it('a chief and his escort hold a solo army (12 men, L2 at depth 1, L3 at depth 2) for 60-90 s, every kind', () => {
    for (const kind of Object.keys(CHIEF_KINDS) as MobKind[]) {
      for (const [depth, level] of [[1, 2], [2, 3]] as const) {
        const c = chiefsOfKind(kind)[0];
        const sim = createSim(flat([{ kind, x: 40.5, y: 40.5, chief: c.id }], depth), 3);
        sim.spawnMobs();
        const l = lairOf(sim, kind);
        const men = Array.from({ length: ARMY_MAX }, (_, k) => makePerson(`p${k}`, 'hoplite', { level }));
        sim.order({ kind: 'attack', squad: sim.spawnSquad('you', 0, 'hoplite', ARMY_MAX, l.x + 8, l.y, men), target: l.squad });
        const t = run(sim, 1200, [], () => lairOf(sim, kind).chief?.alive === false);
        expect(t / 10, `${kind} d${depth}`).toBeGreaterThanOrEqual(60);
        expect(t / 10, `${kind} d${depth}`).toBeLessThanOrEqual(90);
      }
    }
  });
});
