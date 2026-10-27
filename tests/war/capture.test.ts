/**
 * Taking a held claim point (owner 2026-10-27, docs/WAR.md "Towns" Capture): an alliance claims a point another holds
 * with the depth's channel; a foe within CLAIM.contest resets it, a fighting man of the holder within the point's radius
 * keeps it from running; done, the point's pieces flip at the hp they have, the old anchor goes, a town centred outside
 * the radius (a W-63 settlement) keeps its own banner. Seeded, on flat grass.
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { DEPTH } from '../../src/war/sim/depth';
import { CLAIM } from '../../src/war/sim/mobs';
import type { BuildingType, RegionData, WarBuildSim } from '../../src/war/types';

const W = 128, H = 72, P = { x: 40.5, y: 36.5 };
function region(extra: Partial<RegionData> = {}): RegionData {
  return {
    id: 'cap', name: 'cap', w: W, h: H, height: Array(W * H).fill(1), terrain: Array(W * H).fill('grass'), water: Array(W * H).fill(0),
    entries: [], noBuild: [], lairs: [], claimPoints: [{ ...P, lairs: [] }, { x: 100.5, y: 36.5, lairs: [] }],
    prebuilt: [{ type: 'house', x: 44, y: 30, hp: 0.7 }], ...extra,
  };
}
function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
const claim = (sim: WarBuildSim, i = 0) => sim.snapshot().claims![i];
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
function put(sim: WarBuildSim, type: BuildingType, x: number, y: number, team: number): number {
  const before = bs(sim).length;
  sim.order({ kind: 'placeBuilding', team, type, x, y });
  sim.step();
  const ids = bs(sim).filter((b) => b.id >= before).map((b) => b.id);
  for (const id of ids) sim.finishSite(id);
  return ids[0];
}
/** Team 0 claims point i with a squad that then walks off east (far from point 0). */
function held(sim: WarBuildSim, i = 0): number {
  const c = claim(sim, i);
  const s = sim.spawnSquad('d', 0, 'hoplite', 6, c.x, c.y + 2);
  sim.order({ kind: 'claimRegion', squad: s, point: i });
  run(sim, DEPTH[1].claim.ticks + 200, () => claim(sim, i).state === 'claimed');
  expect(claim(sim, i)).toMatchObject({ state: 'claimed', team: 0 });
  return s;
}
const away = (sim: WarBuildSim, s: number) => sim.order({ kind: 'move', squad: s, x: 120, y: 66 });

describe('taking a held claim point', () => {
  it('another alliance channels it with the depth rule; the point, its pieces and the influence change hands at their hp', () => {
    const sim = createSim(region(), 1);
    const house = bs(sim)[0].id;
    held(sim, 0);
    held(sim, 1);
    const d = sim.snapshot().squads.find((q) => q.team === 0)!.id;
    away(sim, d);
    run(sim, 300);
    sim.addStock(0, 'wood', 9999);
    const hut = put(sim, 'storehouse', 34, 40, 0); // built by the holder inside the radius
    expect(piece(sim, house)).toMatchObject({ team: 0 });
    const hpHouse = piece(sim, house).hp, hpHut = piece(sim, hut).hp;
    // the holder's own squad may not claim its own point
    sim.order({ kind: 'claimRegion', squad: d, point: 0 });
    expect(sim.snapshot().squads[d].order).not.toBe('claimRegion');

    const a = sim.spawnSquad('a', 1, 'hoplite', 6, P.x, P.y + 2);
    sim.order({ kind: 'claimRegion', squad: a, point: 0 });
    run(sim, 100, () => claim(sim).progress > 0.1);
    expect(claim(sim)).toMatchObject({ state: 'claimed', team: 0, taking: 'channel', by: 1, squad: a });
    const t = run(sim, DEPTH[1].claim.ticks + 50, () => claim(sim).team === 1);
    expect(claim(sim)).toMatchObject({ state: 'claimed', team: 1 });
    expect(claim(sim).taking).toBeUndefined();
    expect(t + 10).toBeGreaterThanOrEqual(DEPTH[1].claim.ticks * 0.9);
    // every piece in its radius flips at the hp it has; the other point stays team 0's
    expect(piece(sim, house)).toMatchObject({ team: 1, hp: hpHouse });
    expect(piece(sim, hut)).toMatchObject({ team: 1, hp: hpHut });
    expect(claim(sim, 1).team).toBe(0);
    // the old anchor is gone: the point's tile is team 1's influence, not team 0's
    const m = sim.influence().mask[Math.floor(P.y) * W + Math.floor(P.x)];
    expect(m & 2).toBe(2);
    expect(m & 1).toBe(0);
  });

  it("a defender of the holder within the point's radius keeps the channel from running; a foe within 14 resets it", () => {
    const sim = createSim(region(), 2);
    const d = held(sim, 0);
    // the holder's man stands 17 tiles off: inside the radius (20), outside the contest ring (14)
    sim.order({ kind: 'move', squad: d, x: P.x, y: P.y - 17 });
    run(sim, 200);
    const a = sim.spawnSquad('a', 1, 'hoplite', 6, P.x, P.y + 2);
    sim.order({ kind: 'claimRegion', squad: a, point: 0 });
    run(sim, 60);
    expect(claim(sim)).toMatchObject({ taking: 'defended', progress: 0 });
    // he leaves: the channel runs
    away(sim, d);
    run(sim, 400, () => claim(sim).progress > 0.3);
    expect(claim(sim)).toMatchObject({ taking: 'channel', team: 0 });
    // a holder's squad comes within 14 mid-channel: reset to 0, exactly as any foe
    sim.spawnSquad('d2', 0, 'militia', 3, P.x + 10, P.y);
    run(sim, 3);
    expect(claim(sim).progress).toBe(0);
    expect(['contested', 'defended']).toContain(claim(sim).taking);
    expect(claim(sim).team).toBe(0);
  });

  it('a deeper point takes its depth: 60 s at depth 2, and at depth 3 men of two players', () => {
    const sim = createSim(region({ depth: 2 }), 3);
    const c = claim(sim);
    const s = sim.spawnSquad('d', 0, 'hoplite', 6, c.x, c.y + 2);
    sim.order({ kind: 'claimRegion', squad: s, point: 0 });
    run(sim, DEPTH[2].claim.ticks + 200, () => claim(sim).state === 'claimed');
    away(sim, s);
    run(sim, 300);
    const a = sim.spawnSquad('a', 1, 'hoplite', 6, P.x, P.y + 2);
    sim.order({ kind: 'claimRegion', squad: a, point: 0 });
    const t = run(sim, DEPTH[2].claim.ticks + 100, () => claim(sim).team === 1);
    expect(claim(sim).team).toBe(1);
    expect(t).toBeGreaterThanOrEqual(DEPTH[2].claim.ticks);

    const deep = createSim(region({ depth: 3 }), 3);
    const s0 = deep.spawnSquad('d', 0, 'hoplite', 6, P.x, P.y + 2), s1 = deep.spawnSquad('e', 0, 'hoplite', 6, P.x + 1, P.y + 2);
    deep.order({ kind: 'claimRegion', squad: s0, point: 0 });
    deep.order({ kind: 'claimRegion', squad: s1, point: 0 });
    run(deep, DEPTH[3].claim.ticks + 200, () => claim(deep).state === 'claimed');
    away(deep, s0);
    away(deep, s1);
    run(deep, 300);
    const one = deep.spawnSquad('a', 1, 'hoplite', 12, P.x, P.y + 2);
    deep.order({ kind: 'claimRegion', squad: one, point: 0 });
    run(deep, 300);
    expect(claim(deep).progress).toBe(0); // one player's men
    const two = deep.spawnSquad('b', 1, 'hoplite', 6, P.x + 1, P.y + 2);
    deep.order({ kind: 'claimRegion', squad: two, point: 0 });
    run(deep, DEPTH[3].claim.ticks + 100, () => claim(deep).team === 1);
    expect(claim(deep).team).toBe(1);
  });

  it("a town centred outside the radius (a W-63 settlement) keeps its banner: no double flip with rebanner", () => {
    const sim = createSim(region(), 4);
    held(sim, 0);
    const d = sim.snapshot().squads.find((q) => q.team === 0)!.id;
    away(sim, d);
    sim.claim(0, 66.5, 36.5, 24); // the settlement's ground
    sim.addStock(0, 'wood', 9999);
    const camp = put(sim, 'camp', 64, 36, 0); // 23.5 tiles from the point
    const farm = put(sim, 'storehouse', 58, 38, 0); // inside the claim radius, but its town's
    run(sim, 300);
    expect(sim.townLevels(true).find((t) => t.id === camp)?.team).toBe(0);
    const a = sim.spawnSquad('a', 1, 'hoplite', 6, P.x, P.y + 2);
    sim.order({ kind: 'claimRegion', squad: a, point: 0 });
    run(sim, CLAIM.ticks + 100, () => claim(sim).team === 1);
    expect(claim(sim).team).toBe(1);
    expect(piece(sim, camp).team).toBe(0);
    expect(piece(sim, farm).team).toBe(0);
  });
});
