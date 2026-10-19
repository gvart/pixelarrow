import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BRAZIER, BUILDINGS } from '../../src/war/sim/economy';
import type { RegionData, WarBuildSim } from '../../src/war/types';

/**
 * W-35 fire arrows: braziers, pitch and the pitch kiln. Flat grass 40 x 40 at height 1 cut by a rock band on row 20,
 * open at x 14..25 where team 0's wall goes (as in walls.test.ts); `objects` adds map objects (pines).
 */
function region(objects: RegionData['objects'] = []): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 'f', name: 'f', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects,
  };
  for (let x = 0; x < n; x++) if (x < 14 || x > 25) r.terrain[20 * n + x] = 'rock';
  return r;
}

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}

const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
const newIds = (sim: WarBuildSim, before: number) => bs(sim).filter((b) => b.id >= before).map((b) => b.id);
const stock = (sim: WarBuildSim, team = 0) => sim.snapshot().stock![team] ?? {};
const alive = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id) && u.state !== 'dead');
};

/** Team 0 camp at (20, 33) and 24 militia builders. */
function base(seed: number, objects?: RegionData['objects']): [WarBuildSim, number] {
  const sim = createSim(region(objects), seed);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 3000);
  sim.addStock(0, 'stone', 3000);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  return [sim, s];
}

function build(sim: WarBuildSim, place: () => void, ticks = 8000): number[] {
  const before = bs(sim).length;
  place();
  sim.step();
  const ids = newIds(sim, before);
  run(sim, ticks, () => ids.every((id) => piece(sim, id).state === 'done'));
  expect(ids.every((id) => piece(sim, id).state === 'done')).toBe(true);
  return ids;
}

/** A timber wall across the gap, stairs up at x 20, builders sent off south; returns [sim, wall ids]. */
function walled(seed: number): [WarBuildSim, number[]] {
  const [sim, s] = base(seed);
  const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5] }));
  build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 20.5, y: 23 }));
  sim.order({ kind: 'move', squad: s, x: 20, y: 37 });
  run(sim, 150);
  return [sim, ids];
}

/** 6 archers of team 0 on the walk at (x, 20.5) and a foe militia squad in range north of the wall; returns [archers, foe]. */
function archersOnWall(sim: WarBuildSim, x = 20.5): [number, number] {
  const a = sim.spawnSquad('b', 0, 'archer', 6, 20, 28);
  sim.order({ kind: 'move', squad: a, x, y: 20.5 });
  run(sim, 800, () => alive(sim, a).every((u) => u.z === 3));
  expect(alive(sim, a).every((u) => u.z === 3)).toBe(true);
  const foe = sim.spawnSquad('e', 1, 'militia', 12, x, 14);
  sim.order({ kind: 'hold', squad: foe });
  sim.order({ kind: 'fireArrows', squad: a, on: true });
  return [a, foe];
}

/** Shots loosed over `ticks` by squad `a`'s men: [fire arrows, plain arrows]. */
function volleys(sim: WarBuildSim, a: number, ticks: number): [number, number] {
  const mine = new Set(sim.snapshot().squads[a].units);
  let fire = 0, plain = 0;
  run(sim, ticks, () => {
    const snap = sim.snapshot();
    for (const sh of snap.shots ?? []) if (sh.t0 === snap.tick - 1 && mine.has(sh.by)) sh.fire ? fire++ : plain++;
    return false;
  });
  return [fire, plain];
}

describe('braziers and fire arrows (W-35)', () => {
  it('defs: a cheap 1x1 wood brazier; a pitch kiln yields pitch', () => {
    expect(BUILDINGS.brazier).toMatchObject({ w: 1, h: 1, brazier: true });
    expect(BUILDINGS.brazier.cost.wood).toBeLessThanOrEqual(10);
    expect(BUILDINGS.pitchKiln.yields?.res).toBe('pitch');
  });

  it('no brazier: plain arrows only, the squad reports noBrazier', () => {
    const [sim] = walled(1);
    sim.addStock(0, 'pitch', 100);
    const [a] = archersOnWall(sim);
    const [fire, plain] = volleys(sim, a, 300);
    expect(fire).toBe(0);
    expect(plain).toBeGreaterThan(0);
    expect(sim.snapshot().squads[a].fireArrows).toEqual({ on: true, available: false, reason: 'noBrazier' });
    expect(stock(sim).pitch).toBe(100);
  });

  it('a lit brazier on the walkway lets the archers there loose fire arrows, each taking pitch', () => {
    const [sim, ids] = walled(2);
    sim.addStock(0, 'pitch', 100);
    // on the team's own deck; not on a foe's, nor where the stock cannot pay
    expect(sim.checkPlacement(0, 'brazier', 20.5, 20.5)).toMatchObject({ ok: true, tiles: [20, 20] });
    expect(sim.checkPlacement(1, 'brazier', 20.5, 20.5).ok).toBe(false);
    expect(sim.checkPlacement(1, 'brazier', 20.5, 20.5).reason).toBe('overlap');
    const before = bs(sim).length, wood = stock(sim).wood!;
    sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 20.5, y: 20.5 });
    sim.step();
    const br = piece(sim, before);
    expect(br).toMatchObject({ type: 'brazier', state: 'done', lit: true });
    expect(br.fuel).toBeCloseTo(1, 2);
    expect(ids).toContain(br.attach);
    expect(stock(sim).wood).toBe(wood - BUILDINGS.brazier.cost.wood!);
    expect(sim.checkPlacement(0, 'brazier', 20.5, 20.5).reason).toBe('overlap');
    // a squad far from it on the ground cannot
    const far = sim.spawnSquad('c', 0, 'archer', 4, 20, 30);
    const [a] = archersOnWall(sim);
    sim.step();
    expect(sim.snapshot().squads[a].fireArrows).toEqual({ on: true, available: true });
    expect(sim.snapshot().squads[far].fireArrows).toMatchObject({ on: false, available: false, reason: 'noBrazier' });
    const [fire] = volleys(sim, a, 300);
    expect(fire).toBeGreaterThan(0);
    expect(stock(sim).pitch).toBeCloseTo(100 - fire * BRAZIER.pitch, 6);
  });

  it('out of pitch: plain arrows, reason noPitch', () => {
    const [sim] = walled(3);
    sim.addStock(0, 'pitch', BRAZIER.pitch * 3);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 20.5, y: 21.5 });
    const [a] = archersOnWall(sim);
    const [fire, plain] = volleys(sim, a, 400);
    expect(fire).toBe(3);
    expect(plain).toBeGreaterThan(0);
    expect(sim.snapshot().squads[a].fireArrows).toEqual({ on: true, available: false, reason: 'noPitch' });
  });

  it('a brazier burns out after its life; knocked over it is gone; it falls with its wall', () => {
    const [sim, ids] = walled(4);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 17.5, y: 25.5 }); // ground
    sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 22.5, y: 25.5 });
    sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 16.5, y: 20.5 }); // walk
    sim.step();
    const [g1, g2, w1] = bs(sim).filter((b) => b.type === 'brazier').map((b) => b.id);
    sim.damageBuilding(g2, 999);
    expect(piece(sim, g2)).toMatchObject({ state: 'destroyed', lit: false });
    const wall = piece(sim, w1).attach!;
    expect(ids).toContain(wall);
    sim.damageBuilding(wall, 1e6);
    expect(piece(sim, w1)).toMatchObject({ state: 'destroyed', lit: false });
    run(sim, BRAZIER.life * 10 - 10);
    expect(piece(sim, g1).lit).toBe(true);
    run(sim, 20);
    expect(piece(sim, g1)).toMatchObject({ state: 'done', lit: false, fuel: 0 });
  });

  it('a pitch kiln burns wood into pitch, faster with pines near; pine gatherers bring a little pitch', () => {
    const pines = Array.from({ length: 6 }, (_, i) => ({ id: 'pine-a', x: 28.5 + (i % 3) * 2, y: 26.5 + Math.floor(i / 3) * 2 }));
    const kiln = (objects: RegionData['objects'], wood: boolean) => {
      const [sim, s] = base(5, objects);
      const [id] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'pitchKiln', x: 26, y: 30 }));
      const node = () => sim.resourceNodes().find((n) => n.building === id)!;
      expect(node()).toMatchObject({ res: 'pitch', amount: 0 });
      if (!wood) sim.addStock(0, 'wood', -stock(sim).wood!);
      const w0 = stock(sim).wood!;
      run(sim, 600);
      return { made: node().amount, burnt: w0 - stock(sim).wood! };
    };
    const cold = kiln([], false);
    expect(cold.made).toBe(0);
    const bare = kiln([], true);
    expect(bare.made).toBeGreaterThan(0);
    expect(bare.burnt).toBeCloseTo(bare.made * 2, 6);
    const piney = kiln(pines, true);
    expect(piney.made).toBeGreaterThan(bare.made * 1.5);

    // felling pines brings back a little pitch with the wood
    const [sim, s] = base(6, pines);
    const p0 = stock(sim).pitch ?? 0;
    const node = sim.resourceNodes().find((n) => n.res === 'wood')!;
    sim.order({ kind: 'gather', squad: s, node: node.id });
    run(sim, 1200);
    expect((stock(sim).pitch ?? 0) - p0).toBeGreaterThan(0);
  });

  it('runs the same twice', () => {
    const go = () => {
      const [sim] = walled(7);
      sim.addStock(0, 'pitch', 2);
      sim.order({ kind: 'placeBuilding', team: 0, type: 'brazier', x: 19.5, y: 21.5 });
      const [a] = archersOnWall(sim);
      volleys(sim, a, 400);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});
