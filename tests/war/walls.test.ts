import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS } from '../../src/war/sim/economy';
import type { BuildingSnap, RegionData, WarBuildSim } from '../../src/war/types';

/**
 * Flat grass 40 x 40 at height 1 cut in two by a rock band on row 20, open only at x 14..25 where the wall goes, so the
 * wall closes the north off the south (team 0's side: claim and camp at (20, 32)).
 */
function region(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 'w', name: 'w', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [],
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

const pieces = (sim: WarBuildSim, ids: number[]) => sim.snapshot().buildings!.filter((b) => ids.includes(b.id));
const allDone = (sim: WarBuildSim, ids: number[]) => pieces(sim, ids).every((b) => b.state === 'done');

/** Camp at (20, 32) and a wall of `material` across the gap on row 20, built by 24 militia; returns [sim, builders, wall ids]. */
function walled(material: 'wood' | 'timber' | 'stone', seed = 1, points = [14.5, 20.5, 25.5, 20.5]): [WarBuildSim, number, number[]] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 2000);
  sim.addStock(0, 'stone', 2000);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => sim.snapshot().buildings![0]?.state === 'done');
  expect(sim.snapshot().buildings![0].state).toBe('done');
  sim.order({ kind: 'placeWall', squad: s, material, points });
  sim.step();
  const ids = sim.snapshot().buildings!.filter((b) => b.type !== 'camp').map((b) => b.id);
  expect(ids.length).toBeGreaterThan(0);
  run(sim, 6000, () => allDone(sim, ids));
  expect(allDone(sim, ids)).toBe(true);
  sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
  run(sim, 150);
  return [sim, s, ids];
}

const unitsOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id));
};

describe('wall tiers', () => {
  it('tiers: palisade has no walkway, rampart +2, stone +3; towers have platforms with a cap; wood burns', () => {
    expect(BUILDINGS.palisade.walk ?? 0).toBe(0);
    expect(BUILDINGS.rampart.walk).toBe(2);
    expect(BUILDINGS.stoneWall.walk).toBe(3);
    expect(BUILDINGS.woodTower).toMatchObject({ walk: 3, cap: 6, burnable: true });
    expect(BUILDINGS.stoneTower).toMatchObject({ walk: 4, cap: 9 });
    expect(BUILDINGS.stoneWall.hp).toBeGreaterThan(BUILDINGS.rampart.hp);
    expect(BUILDINGS.rampart.hp).toBeGreaterThan(BUILDINGS.palisade.hp);
    expect(BUILDINGS.palisade.burnable && BUILDINGS.rampart.burnable && !BUILDINGS.stoneWall.burnable).toBe(true);
    expect(BUILDINGS.palisade.upgrade?.to).toBe('rampart');
    expect(BUILDINGS.rampart.upgrade?.to).toBe('stoneWall');
  });

  it('a finished rampart is a raised walkway with inside stairs; archers climb it and stand on top', () => {
    const [sim, , ids] = walled('timber');
    const walls = pieces(sim, ids);
    expect(walls.every((b) => b.type === 'rampart' && b.walk === 2 && b.tier === 2)).toBe(true);
    const stairs = walls.flatMap((b) => b.stairs ?? []);
    expect(stairs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < stairs.length; i += 2) expect(stairs[i]).toBe(21); // inside (south) face, hugging the wall

    const a = sim.spawnSquad('b', 0, 'archer', 8, 20, 28);
    sim.order({ kind: 'move', squad: a, x: 20.5, y: 20.5 });
    run(sim, 600, () => unitsOf(sim, a).every((u) => Math.floor(u.y) === 20));
    for (const u of unitsOf(sim, a)) {
      expect(Math.floor(u.y)).toBe(20);
      expect(u.z).toBe(3); // ground 1 + walkway 2
      expect(ids).toContain(u.on);
    }
  });

  it('from outside the wall is a cliff: foes cannot walk onto it, nor reach the men on it in melee', () => {
    const [sim, , ids] = walled('timber', 2);
    const a = sim.spawnSquad('b', 0, 'archer', 6, 20, 28);
    sim.order({ kind: 'move', squad: a, x: 20.5, y: 20.5 });
    run(sim, 600, () => unitsOf(sim, a).every((u) => Math.floor(u.y) === 20));
    sim.order({ kind: 'hold', squad: a });
    const e = sim.spawnSquad('e', 1, 'hoplite', 12, 20, 8);
    sim.order({ kind: 'attack', squad: e, target: a });
    let meleeHits = 0;
    let closest = 0;
    let before = unitsOf(sim, a).reduce((s, u) => s + u.hp, 0);
    for (let t = 0; t < 600; t++) {
      sim.step();
      for (const u of unitsOf(sim, e)) {
        expect(u.y).toBeLessThan(20); // never on the wall, never past it
        if (u.state !== 'dead') closest = Math.max(closest, u.y);
      }
      const now = unitsOf(sim, a).reduce((s, u) => s + u.hp, 0);
      if (now < before) meleeHits++;
      before = now;
    }
    expect(closest).toBeGreaterThan(19); // they came right under the wall
    expect(meleeHits).toBe(0);
    expect(unitsOf(sim, a).every((u) => u.state !== 'dead')).toBe(true);
    // the wall stood: nobody of team 1 climbed a stair
    expect(pieces(sim, ids).every((b) => b.state === 'done')).toBe(true);
  });

  it('archers on the wall beat equal archers on the ground', () => {
    const [sim] = walled('timber', 3);
    const a = sim.spawnSquad('b', 0, 'archer', 10, 20, 28);
    sim.order({ kind: 'move', squad: a, x: 20.5, y: 20.5 });
    run(sim, 600, () => unitsOf(sim, a).every((u) => Math.floor(u.y) === 20));
    sim.order({ kind: 'hold', squad: a });
    const e = sim.spawnSquad('e', 1, 'archer', 10, 20, 8);
    sim.order({ kind: 'attack', squad: e, target: a });
    const alive = (s: number) => unitsOf(sim, s).filter((u) => u.state !== 'dead').length;
    run(sim, 3000, () => alive(a) === 0 || alive(e) === 0);
    expect(alive(e)).toBeLessThan(10); // they fought
    expect(alive(a)).toBeGreaterThan(alive(e));
  });

  it('upgrades in place: palisade -> rampart -> stone wall, blocking all the while', () => {
    const [sim, s, ids] = walled('wood', 4);
    const before = pieces(sim, ids);
    expect(before.every((b) => b.type === 'palisade' && !b.walk && !b.stairs)).toBe(true);
    const tiles = before.map((b) => b.tiles.join());
    const id = ids[0];
    sim.order({ kind: 'upgrade', squad: s, building: id });
    sim.step();
    const up = pieces(sim, [id])[0];
    expect(up).toMatchObject({ type: 'rampart', state: 'scaffold', upgradeFrom: 'palisade' });
    // the old wall blocks during the upgrade: a foe cannot slip through
    const e = sim.spawnSquad('e', 1, 'militia', 4, 20, 8);
    sim.order({ kind: 'move', squad: e, x: 20, y: 36 });
    const done = () => pieces(sim, [id])[0].state === 'done';
    run(sim, 4000, () => {
      for (const u of unitsOf(sim, e)) expect(u.y).toBeLessThan(20);
      return done();
    });
    expect(pieces(sim, [id])[0]).toMatchObject({ type: 'rampart', walk: 2, state: 'done' });
    expect(pieces(sim, [id])[0].upgradeFrom).toBeUndefined();
    sim.order({ kind: 'upgrade', squad: s, building: id });
    run(sim, 8000, done);
    const stone: BuildingSnap = pieces(sim, [id])[0];
    expect(stone).toMatchObject({ type: 'stoneWall', walk: 3, tier: 3, state: 'done', hp: stone.maxHp });
    expect(pieces(sim, ids).map((b) => b.tiles.join())).toEqual(tiles); // same layout
    expect((stone.stairs ?? []).length / 2).toBeGreaterThanOrEqual(2);
    // a stone wall has no next tier
    sim.order({ kind: 'upgrade', squad: s, building: id });
    sim.step();
    expect(pieces(sim, [id])[0].state).toBe('done');
  });

  it('cancelling an upgrade leaves the old tier standing', () => {
    const [sim, s, ids] = walled('wood', 5);
    sim.order({ kind: 'upgrade', squad: s, building: ids[0] });
    run(sim, 30);
    sim.order({ kind: 'cancelSite', site: ids[0] });
    sim.step();
    expect(pieces(sim, [ids[0]])[0]).toMatchObject({ type: 'palisade', state: 'done' });
  });

  it('a tower platform takes at most its cap', () => {
    const [ts, , tids] = walledTower();
    const tower = pieces(ts, tids).find((b) => b.type === 'woodTower')!;
    expect(tower).toMatchObject({ walk: 3, cap: 6 });
    const a = ts.spawnSquad('b', 0, 'archer', 10, 20, 28);
    ts.order({ kind: 'move', squad: a, x: tower.x, y: tower.y });
    run(ts, 800);
    const onTop = unitsOf(ts, a).filter((u) => u.on === tower.id);
    expect(onTop.length).toBeGreaterThan(0);
    expect(onTop.length).toBeLessThanOrEqual(6);
    for (const u of onTop) expect(u.z).toBe(4);
  });

  it('is deterministic', () => {
    const go = () => {
      const [sim] = walled('timber', 7);
      const a = sim.spawnSquad('b', 0, 'archer', 6, 20, 28);
      sim.order({ kind: 'move', squad: a, x: 18.5, y: 20.5 });
      run(sim, 300);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});

function walledTower(): [WarBuildSim, number, number[]] {
  const sim = createSim(region(), 8);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 2000);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => sim.snapshot().buildings![0]?.state === 'done');
  sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], towers: [20, 20.5] });
  sim.step();
  const ids = sim.snapshot().buildings!.filter((b) => b.type !== 'camp').map((b) => b.id);
  run(sim, 8000, () => allDone(sim, ids));
  expect(allDone(sim, ids)).toBe(true);
  sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
  run(sim, 150);
  return [sim, s, ids];
}
