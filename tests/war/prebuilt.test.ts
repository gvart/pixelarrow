/** M7a pre-built structures (docs/WAR.md "Pre-built structures"): schema, neutral start, ownership, functions, ruins, repair. */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { NEUTRAL_TEAM, RUIN } from '../../src/war/sim/economy';
import { BLESS, WELL } from '../../src/war/sim/prebuilt';
import type { PrebuiltEntry, RegionData, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};
const PIECES: PrebuiltEntry[] = [
  { type: 'house', x: 16, y: 15 }, // 0
  { type: 'house', x: 24, y: 15 }, // 1
  { type: 'temple', x: 20, y: 27 }, // 2
  { type: 'well', x: 13, y: 22 }, // 3
  { type: 'statue', x: 27, y: 22 }, // 4
  { type: 'stoa', x: 30, y: 20 }, // 5
  { type: 'cache', x: 17, y: 21 }, // 6
  { type: 'cottage', x: 50, y: 50 }, // 7: outside the claim point
  { type: 'shrine', x: 8, y: 8, landmark: true }, // 8
  { type: 'cottage', x: 40, y: 8, state: 'ruined' }, // 9
];
const town = (extra: Partial<RegionData> = {}): RegionData => ({ ...flat(64), claimPoints: [{ x: 20, y: 20, lairs: [], r: 14 }], prebuilt: PIECES, ...extra });
const piece = (sim: WarBuildSim, i: number) => sim.snapshot().buildings!.find((b) => b.id === i)!;

describe('M7a schema', () => {
  it('takes prebuilt entries and a depth; refuses an unknown type', () => {
    expect(parseRegion(town()).prebuilt).toHaveLength(PIECES.length);
    expect(parseRegion({ ...flat(16), depth: 3 }).depth).toBe(3);
    expect(() => parseRegion({ ...flat(16), prebuilt: [{ type: 'palace', x: 2, y: 2 }] })).toThrow();
    expect(() => parseRegion({ ...flat(16), depth: 5 })).toThrow();
  });
});

describe('M7a pieces', () => {
  it('stand done and neutral at the start (landmarks at 60%, ruins ruined); players cannot place them', () => {
    const sim = createSim(town(), 1);
    const b = sim.snapshot().buildings!;
    expect(b).toHaveLength(PIECES.length);
    for (const x of b) expect(x.team).toBe(NEUTRAL_TEAM);
    expect(b[0]).toMatchObject({ type: 'house', state: 'done', pre: true, hp: 900 });
    expect(b[8]).toMatchObject({ landmark: true, hp: 800 * 0.6 });
    expect(b[9]).toMatchObject({ state: 'destroyed', ruin: true });
    expect(b[5].stalls).toBe(2);
    sim.claim(0, 40, 40, 30);
    expect(sim.checkPlacement(0, 'house', 40, 40)).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('follow the holder of their claim point at once, at the hp they have; pieces outside follow influence', () => {
    const sim = createSim(town(), 2);
    sim.damageBuilding(0, 300);
    sim.claim(1, 20, 20, 14);
    const b = sim.snapshot().buildings!;
    for (const i of [0, 1, 2, 3, 4, 5, 6]) expect(b[i].team).toBe(1);
    expect(b[0].hp).toBe(600);
    expect(b[7].team).toBe(NEUTRAL_TEAM);
    sim.claim(2, 50, 50, 6);
    expect(piece(sim, 7).team).toBe(2);
    // another alliance takes the point: the town flips again
    sim.claim(3, 20, 20, 14);
    expect(piece(sim, 1).team).toBe(3);
  });
});

describe('M7a functions', () => {
  it('houses give the owner a recruit pool and cap; temple favour and statue prestige an hour (capped)', () => {
    const sim = createSim(town(), 3);
    expect(sim.population(0)).toEqual({ rate: 0, cap: 0 });
    sim.claim(0, 20, 20, 14);
    expect(sim.population(0)).toEqual({ rate: 1, cap: 4 });
    expect(sim.prestige(0)).toBeCloseTo(0.25 + 0.1);
    expect(sim.towns().find((t) => t.claim === 0)).toMatchObject({ team: 0, houses: 2, standing: 2, ruined: false });
    // a house down: its rate and cap go; both and the temple: the town is ruined (no pool, no favour)
    sim.damageBuilding(0, 1e9);
    expect(sim.population(0)).toEqual({ rate: 0.5, cap: 2 });
    sim.damageBuilding(1, 1e9);
    sim.damageBuilding(2, 1e9);
    expect(sim.towns().find((t) => t.claim === 0)).toMatchObject({ ruined: true, pool: 0, favour: 0 });
    expect(sim.prestige(0)).toBeCloseTo(0.1);
  });

  it('a squad standing in an own temple precinct is blessed; a neutral temple blesses nobody', () => {
    const sim = createSim(town(), 4);
    const a = sim.spawnSquad('a', 0, 'militia', 4, 20, 31);
    run(sim, BLESS.stand + 20);
    expect(sim.snapshot().squads[a].blessed).toBeUndefined();
    sim.claim(0, 20, 20, 14);
    run(sim, BLESS.stand + 20);
    expect(sim.snapshot().squads[a].blessed).toBe(true);
  });

  it('wells: upkeep relief near an own well; a foe beside it fouls it', () => {
    const sim = createSim(town(), 5);
    expect(sim.upkeepAt(0, 14, 24)).toBe(1);
    sim.claim(0, 20, 20, 14);
    expect(sim.upkeepAt(0, 14, 24)).toBe(WELL.upkeep);
    expect(sim.upkeepAt(0, 40, 40)).toBe(1);
    sim.spawnSquad('f', 1, 'militia', 1, 13.5, 23.2);
    run(sim, WELL.foul + 30);
    expect(piece(sim, 3).fouled).toBe(true);
    expect(sim.upkeepAt(0, 14, 24)).toBe(1);
  });

  it('a town cache: anyone carries it off, then it is gone', () => {
    const sim = createSim(town(), 6);
    expect(piece(sim, 6).goods).toBeDefined();
    const p = sim.spawnSquad('p', 1, 'militia', 4, 17, 24);
    sim.order({ kind: 'load', squad: p, from: { building: 6 } });
    run(sim, 300);
    expect(piece(sim, 6).state).toBe('destroyed');
    expect(piece(sim, 6).ruin).toBeUndefined();
  });
});

describe('M7a ruins and repair', () => {
  it('razed: a ruin in place with half its goods in a pile; it stays a ruin until its ground owner rebuilds it', () => {
    const sim = createSim(town(), 7);
    sim.claim(0, 20, 20, 21);
    sim.cargo({ building: 5 })!.slots[0].hold.lots.push({ r: 'stone', n: 40, o: 't' });
    sim.damageBuilding(5, 1e9);
    let s = sim.snapshot();
    expect(s.buildings![5]).toMatchObject({ state: 'destroyed', ruin: true, rubble: true });
    expect(s.piles![0].goods.stone).toBeCloseTo(40 * RUIN.spill);
    run(sim, 3000);
    expect(piece(sim, 5).ruin).toBe(true);
    // nothing builds over it; a foe or a neutral cannot rebuild it; its owner can, at RUIN.rebuild
    expect(sim.checkPlacement(0, 'storehouse', 30, 20).ok).toBe(false);
    sim.order({ kind: 'rebuild', building: 5, team: 1 });
    run(sim, 1);
    expect(piece(sim, 5).ruin).toBe(true);
    sim.addStock(0, 'stone', 500);
    sim.addStock(0, 'wood', 500);
    const e = sim.spawnSquad('e', 0, 'militia', 12, 33, 20);
    // builders haul from a store of the network (the strongroom through it)
    sim.order({ kind: 'placeBuilding', squad: e, type: 'camp', x: 36, y: 26 });
    run(sim, 900);
    expect(sim.snapshot().buildings!.find((b) => b.type === 'camp')!.state).toBe('done');
    sim.order({ kind: 'rebuild', building: 5, squad: e });
    run(sim, 1);
    s = sim.snapshot();
    expect(s.buildings![5]).toMatchObject({ state: expect.stringMatching(/foundation|scaffold/) });
    expect(s.buildings![5].ruin).toBeUndefined();
    run(sim, 6000);
    expect(piece(sim, 5).state).toBe('done');
    expect(sim.snapshot().stock![0].stone).toBeCloseTo(500 - 150 * RUIN.rebuild);
  });

  it('landmark pieces are not rebuilt by the ruin rule', () => {
    const sim = createSim(town(), 8);
    sim.claim(0, 8, 8, 6);
    sim.damageBuilding(8, 1e9);
    sim.order({ kind: 'rebuild', building: 8, team: 0 });
    run(sim, 1);
    expect(piece(sim, 8).ruin).toBe(true);
  });

  it('razing a temple is sacrilege, named for the razer', () => {
    const sim = createSim(town(), 9);
    sim.claim(0, 20, 20, 14);
    const f = sim.spawnSquad('f', 1, 'militia', 12, 20, 32);
    sim.damageBuilding(2, 2990);
    sim.order({ kind: 'attackBuilding', squad: f, building: 2 });
    run(sim, 400);
    const ev = sim.events().find((x) => x.kind === 'razed');
    expect(ev).toMatchObject({ kind: 'razed', building: 2, type: 'temple', owner: 0, by: 1, sacrilege: true });
  });

  it('a safe court\'s pieces take no damage', () => {
    const sim = createSim(town({ safe: [{ x: 10, y: 10, w: 12, h: 8 }] }), 10);
    sim.damageBuilding(0, 500);
    expect(piece(sim, 0).hp).toBe(900);
    sim.damageBuilding(7, 100);
    expect(piece(sim, 7).hp).toBe(300);
  });

  it('repairBuilding mends to full, paid per 10% from the network', () => {
    const sim = createSim(town(), 11);
    sim.claim(0, 20, 20, 14);
    sim.addStock(0, 'stone', 100);
    sim.addStock(0, 'wood', 100);
    sim.damageBuilding(1, 450);
    const e = sim.spawnSquad('e', 0, 'militia', 6, 24, 19);
    sim.order({ kind: 'repairBuilding', squad: e, building: 1 });
    run(sim, 3000);
    expect(piece(sim, 1).hp).toBeCloseTo(900);
    expect(piece(sim, 1).mend).toBeUndefined();
    // 50% of hp: 5 steps of 5% of the cost (stone 60, wood 20)
    expect(sim.snapshot().stock![0].stone).toBeCloseTo(100 - 5 * 3);
    expect(sim.snapshot().stock![0].wood).toBeCloseTo(100 - 5 * 1);
  });

  it('state round-trips the pieces, their owners and functions', () => {
    const a = createSim(town(), 12);
    a.claim(0, 20, 20, 14);
    a.spawnSquad('a', 0, 'militia', 4, 20, 31);
    a.damageBuilding(0, 1e9);
    run(a, 200);
    const b = createSim(town(), 12);
    b.importState(JSON.parse(JSON.stringify(a.exportState())));
    run(a, 200);
    run(b, 200);
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(b.towns()).toEqual(a.towns());
  });
});
