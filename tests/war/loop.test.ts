/**
 * The war loop past the market on a real region (the moors), headless and seeded: what scripts/war/play-smoke.mjs used
 * to drive live (docs/PLAYTEST.md). A lair raid, the region's guardian slain, a claim point flipped to our influence,
 * and a ram built, crewed, moved and battering a foe's palisade gate to a breach. The market half (the buyer's coin)
 * runs against the region server in server/test/war/tradeLoop.test.ts.
 */
import { describe, expect, it } from 'vitest';
import moors from '../../src/war/regions/moors.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import type { WarBuildSim } from '../../src/war/types';

const MOORS = parseRegion(moors);
/** The moors' lair-free claim point 1 (the buyer's ground in the smoke), its bear lair 4 and claim point 2 behind it. */
const PAL = { x: 185, y: 301 };

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
const snap = (sim: WarBuildSim) => sim.snapshot();
const lair = (sim: WarBuildSim, i: number) => snap(sim).lairs![i];
const claimPt = (sim: WarBuildSim, i: number) => snap(sim).claims![i];
const alive = (sim: WarBuildSim, squad: number) => {
  const s = snap(sim), ids = new Set(s.squads[squad].units);
  return s.units.filter((u) => ids.has(u.id) && u.state !== 'dead').length;
};
const ours = (sim: WarBuildSim, team: number, mask = sim.influence(), x: number, y: number) => (mask.mask[Math.floor(y) * mask.w + Math.floor(x)] & (1 << team)) !== 0;

describe('the moors raid and claim', () => {
  it('three hoplite squads clear bear lair 4, slay the Great Bear and claim point 2 into our influence', () => {
    const sim = createSim(MOORS, 11);
    sim.spawnMobs(); // as the region server wakes a neutral region (WarRoom wild)
    const L = MOORS.lairs![4], cp = MOORS.claimPoints![2], g = MOORS.guardians![0];
    expect(lair(sim, 4)).toMatchObject({ kind: 'bear', state: 'home' });
    expect(lair(sim, 4).alive).toBeGreaterThan(0);
    expect(snap(sim).bosses![0].state).not.toBe('slain');
    expect(claimPt(sim, 2).state).toBe('locked');

    const squads = [0, 1, 2].map((i) => sim.spawnSquad('p:1', 0, 'hoplite', 12, L.x + 4 * i - 4, L.y + 22));
    for (const q of squads) sim.order({ kind: 'attackMove', squad: q, x: L.x, y: L.y });
    run(sim, 6000, () => lair(sim, 4).state === 'cleared');
    expect(lair(sim, 4).state).toBe('cleared');

    // the guardian sleeps on claim point 2 and keeps every claim point shut while it lives
    expect(claimPt(sim, 2).state).toBe('locked');
    for (const q of squads) if (alive(sim, q)) sim.order({ kind: 'attackMove', squad: q, x: g.x, y: g.y });
    run(sim, 9000, () => snap(sim).bosses![0].state === 'slain');
    expect(snap(sim).bosses![0].state).toBe('slain');
    expect(claimPt(sim, 2).state).toBe('open');

    expect(ours(sim, 0, undefined, cp.x, cp.y)).toBe(false);
    const claimer = squads.filter((q) => alive(sim, q)).sort((a, b) => alive(sim, b) - alive(sim, a))[0];
    sim.order({ kind: 'claimRegion', squad: claimer, point: 2 });
    run(sim, 3000, () => claimPt(sim, 2).state === 'claimed');
    expect(claimPt(sim, 2)).toMatchObject({ state: 'claimed', team: 0 });
    expect(ours(sim, 0, undefined, cp.x, cp.y)).toBe(true);
  });
});

describe('the moors siege', () => {
  it('a foe palisade with a gate; a ram built, crewed by a full hoplite squad, moved up and breaching the gate', () => {
    const sim = createSim(MOORS, 12);
    sim.spawnMobs();
    // team 1 (the buyer): his ground at claim point 1, a camp to fetch wood through, a palisade line with a gate
    sim.claim(1, PAL.x, PAL.y, 24);
    sim.addStock(1, 'wood', 400);
    const b = sim.spawnSquad('p:2', 1, 'militia', 12, PAL.x, PAL.y + 4);
    const camp = sim.checkPlacement(1, 'camp', PAL.x, PAL.y + 2, 0);
    expect(camp.ok).toBe(true);
    sim.order({ kind: 'placeBuilding', squad: b, type: 'camp', x: PAL.x, y: PAL.y + 2, rot: 0 });
    run(sim, 3000, () => snap(sim).buildings!.some((x) => x.type === 'camp' && x.team === 1 && x.state === 'done'));
    const wall = { material: 'wood' as const, points: [PAL.x - 8, PAL.y - 6, PAL.x + 8, PAL.y - 6], gates: [PAL.x, PAL.y - 6] };
    expect(sim.checkWall(1, wall).ok).toBe(true);
    sim.order({ kind: 'placeWall', squad: b, ...wall });
    sim.step();
    const line = () => snap(sim).buildings!.filter((x) => x.team === 1 && x.type !== 'camp' && Math.abs(x.y - (PAL.y - 6)) <= 2);
    run(sim, 9000, () => line().length > 0 && line().every((x) => x.state === 'done'));
    const gate = line().find((x) => /gate/i.test(x.type))!;
    expect(gate).toMatchObject({ state: 'done' });
    sim.order({ kind: 'move', squad: b, x: PAL.x, y: PAL.y + 12 }); // behind the camp, off the gate

    // team 0: a squad of 12 hoplites builds a ram 14 tiles out, crews it, rolls it up and batters the gate
    sim.addStock(0, 'wood', 200);
    const q = sim.spawnSquad('p:1', 0, 'hoplite', 12, PAL.x, PAL.y - 22);
    const rx = PAL.x, ry = PAL.y - 20;
    sim.order({ kind: 'buildSiege', squad: q, type: 'ram', x: rx, y: ry });
    sim.step();
    const ram = snap(sim).sieges!.findIndex((e) => e.type === 'ram' && e.team === 0);
    expect(ram).toBeGreaterThanOrEqual(0);
    const eng = () => snap(sim).sieges![ram];
    run(sim, 4000, () => eng().state !== 'building');
    expect(eng().state).toBe('idle');
    sim.order({ kind: 'crew', squad: q, siege: ram });
    run(sim, 300, () => eng().crewHere >= eng().crewNeed);
    expect(eng()).toMatchObject({ crew: q, crewNeed: 6 });
    expect(eng().crewHere).toBeGreaterThanOrEqual(6);
    const x0 = eng().x, y0 = eng().y;
    sim.order({ kind: 'move', squad: q, x: rx, y: PAL.y - 11 });
    run(sim, 600);
    expect(Math.hypot(eng().x - x0, eng().y - y0)).toBeGreaterThan(5);
    sim.order({ kind: 'attackBuilding', squad: q, building: gate.id });
    run(sim, 6000, () => snap(sim).buildings!.find((x) => x.id === gate.id)!.state === 'destroyed');
    const g = snap(sim).buildings!.find((x) => x.id === gate.id)!;
    expect(g).toMatchObject({ state: 'destroyed', rubble: true });
  });
});
