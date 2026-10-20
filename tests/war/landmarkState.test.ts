/** M7f landmark state and region memory (src/war/sim/landmarks.ts; docs/WAR.md "Landmarks"): capture, restore, garrison, recall. */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import { BOSS } from '../../src/war/sim/bosses';
import { LANDMARK } from '../../src/war/sim/landmarks';
import { restoreCost } from '../../src/data/warLandmarks';
import type { RegionData, ResourceKind, WarBuildSim, WarEvent } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string): RegionData => parseRegion(files[`../../src/war/regions/${id}.json`]);
const krios = region('krios');
const town = krios.prebuilt!.find((e) => e.art === 'citadel-keep')!.claim!;

const steps = (sim: WarBuildSim, n: number) => {
  const evs: WarEvent[] = [];
  for (let i = 0; i < n; i++) (sim.step(), evs.push(...sim.events()));
  return evs;
};
const pieces = (sim: WarBuildSim) => sim.snapshot().buildings!.filter((b) => b.landmark);
/** Drakon slain and the citadel's claim point held by team 0. */
function taken(): WarBuildSim {
  const sim = createSim(krios, 1);
  sim.spawnMobs();
  steps(sim, 2);
  sim.hurtBoss('drakon', 1e9);
  steps(sim, 2);
  const m = sim.memory();
  m.claims[town] = 0;
  sim.recall(m, 0);
  steps(sim, LANDMARK.every * 2);
  return sim;
}
function engineer(sim: WarBuildSim, level: number, perks: string[]): number {
  const p = makePerson(`eng-${level}-${perks.join('-')}`, 'civ_engineer', { level });
  p.hero.perks = perks as never;
  const keep = pieces(sim).find((b) => b.art === 'citadel-keep')!;
  return sim.spawnSquad('p:1', 0, 'civ_engineer', 1, keep.x, keep.y + 6, [p]);
}

describe('M7f landmark state', () => {
  it('guarded while Drakon lives, unclaimed once he falls', () => {
    const sim = createSim(krios, 1);
    sim.spawnMobs();
    steps(sim, LANDMARK.every);
    expect(sim.snapshot().landmark).toMatchObject({ id: 'drakons_citadel', state: 'guarded', holder: -1 });
    sim.hurtBoss('drakon', 1e9);
    const evs = steps(sim, LANDMARK.every * 2);
    expect(sim.snapshot().landmark!.state).toBe('unclaimed');
    expect(evs.some((e) => e.kind === 'landmark' && e.state === 'unclaimed')).toBe(true);
  });

  it('taken: every piece at most 40%, its gates broken open, function dormant', () => {
    const sim = taken();
    expect(sim.snapshot().landmark).toMatchObject({ holder: 0, state: 'damaged' });
    const ps = pieces(sim);
    for (const b of ps.filter((b) => !b.ruin)) expect(b.hp / b.maxHp).toBeLessThanOrEqual(LANDMARK.capture + 1e-9);
    const gates = ps.filter((b) => b.type === 'stoneGate' || b.type === 'woodGate');
    expect(gates.length).toBeGreaterThan(0);
    expect(gates.every((b) => b.ruin)).toBe(true);
  });

  it('restore: refused without the engineer, then without the goods; paid, every piece whole and garrisoned', () => {
    const sim = taken();
    const low = engineer(sim, 8, ['masterBuilder', 'fortifier']);
    sim.order({ kind: 'restoreLandmark', squad: low });
    let evs = steps(sim, 1);
    expect(evs).toContainEqual(expect.objectContaining({ kind: 'landmarkRefused', why: 'engineer' }));
    const lead = engineer(sim, 10, ['masterBuilder', 'fortifier', 'poliorcetes']);
    sim.order({ kind: 'restoreLandmark', squad: lead });
    evs = steps(sim, 1);
    expect(evs).toContainEqual(expect.objectContaining({ kind: 'landmarkRefused', why: 'goods' }));
    for (const [r, n] of Object.entries(restoreCost('drakons_citadel'))) sim.addStock(0, r as ResourceKind, n!);
    sim.order({ kind: 'restoreLandmark', squad: lead });
    evs = steps(sim, LANDMARK.every);
    expect(evs).toContainEqual(expect.objectContaining({ kind: 'landmark', state: 'restored', holder: 0 }));
    for (const b of pieces(sim)) {
      expect(b.ruin).toBeFalsy();
      expect(b.hp).toBeCloseTo(b.maxHp, 5);
    }
    expect(sim.snapshot().landmark!.garrisoned).toBe(false);
    const keep = pieces(sim).find((b) => b.art === 'citadel-keep')!;
    sim.spawnSquad('p:1', 0, 'hoplite', LANDMARK.garrison, keep.x, keep.y + 5);
    steps(sim, LANDMARK.every);
    expect(sim.snapshot().landmark).toMatchObject({ state: 'restored', garrisoned: true });
  });
});

describe('M7f region memory', () => {
  it('a fresh sim recalls a half-razed town: ruins, hp and holders', () => {
    const r = region('kleisoura');
    const sim = createSim(r, 1);
    sim.spawnMobs();
    sim.step();
    const houses = sim.snapshot().buildings!.filter((b) => b.pre && b.type === 'house');
    expect(houses.length).toBeGreaterThan(3);
    const half = Math.floor(houses.length / 2);
    for (const b of houses.slice(0, half)) sim.damageBuilding(b.id, 1e9);
    sim.damageBuilding(houses[half].id, houses[half].maxHp * 0.7);
    steps(sim, 2);
    const hurt = sim.snapshot().buildings!.find((b) => b.id === houses[half].id)!.hp;
    expect(hurt).toBeLessThan(houses[half].maxHp);
    const m = sim.memory();
    const fresh = createSim(r, 1);
    fresh.spawnMobs();
    fresh.recall(JSON.parse(JSON.stringify(m)), 100);
    fresh.step();
    const by = new Map(fresh.snapshot().buildings!.map((b) => [b.id, b]));
    for (const b of houses.slice(0, half)) expect(by.get(b.id)!.ruin).toBe(true);
    expect(by.get(houses[half].id)!.hp).toBeCloseTo(hurt, 0);
    expect(by.get(houses[half + 1].id)!.ruin).toBeFalsy();
  });

  it('a restored landmark and its slain guardian survive; once 24 h pass unheld he is back and it is as the season found it', () => {
    const sim = taken();
    const lead = engineer(sim, 10, ['masterBuilder', 'fortifier', 'archimedes']);
    for (const [r, n] of Object.entries(restoreCost('drakons_citadel'))) sim.addStock(0, r as ResourceKind, n!);
    sim.order({ kind: 'restoreLandmark', squad: lead });
    steps(sim, LANDMARK.every);
    const m = JSON.parse(JSON.stringify(sim.memory()));
    expect(m.landmark).toEqual({ captured: true, restored: true });

    const held = createSim(krios, 1);
    held.spawnMobs();
    held.recall(m, BOSS.respawn * 2); // held: he never comes back
    steps(held, LANDMARK.every);
    expect(held.snapshot().bosses![0].state).toBe('slain');
    expect(held.snapshot().landmark).toMatchObject({ state: 'restored', holder: 0 });

    const unheld = { ...m, claims: m.claims.map(() => -1) };
    const soon = createSim(krios, 1);
    soon.spawnMobs();
    soon.recall(unheld, 600);
    soon.step();
    const b = soon.snapshot().bosses![0];
    expect(b.state).toBe('slain');
    expect(b.respawnIn).toBeGreaterThan(BOSS.respawn - 700);

    const late = createSim(krios, 1);
    late.spawnMobs();
    late.recall(unheld, BOSS.respawn + 1);
    steps(late, LANDMARK.every);
    expect(late.snapshot().bosses![0].state).not.toBe('slain');
    expect(late.snapshot().landmark!.state).toBe('guarded');
    for (const p of pieces(late)) expect(p.hp / p.maxHp).toBeCloseTo(0.6, 5);
  });
});
