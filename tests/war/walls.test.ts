import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS } from '../../src/war/sim/economy';
import type { BuildingSnap, RegionData, WarBuildSim } from '../../src/war/types';

/**
 * Flat grass 40 x 40 at height 1 cut in two by a rock band on row 20, open only at x 14..25 where the wall goes, so the
 * wall closes the north off the south (team 0's side: claim and camp at (20, 33)). Walls with a walkway are 2 deep: the
 * line on row 20 and an inner row on 21.
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

const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const pieces = (sim: WarBuildSim, ids: number[]) => bs(sim).filter((b) => ids.includes(b.id));
const allDone = (sim: WarBuildSim, ids: number[]) => pieces(sim, ids).every((b) => b.state === 'done');
const newIds = (sim: WarBuildSim, before: number) => bs(sim).filter((b) => b.id >= before).map((b) => b.id);

const unitsOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id));
};
const alive = (sim: WarBuildSim, squad: number) => unitsOf(sim, squad).filter((u) => u.state !== 'dead');

/** A sim with team 0's camp at (20, 33) and 24 militia builders; returns [sim, builders]. */
function base(seed: number): [WarBuildSim, number] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 3000);
  sim.addStock(0, 'stone', 3000);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  expect(bs(sim)[0].state).toBe('done');
  return [sim, s];
}

/** Builders put up an order's pieces; returns their ids. */
function build(sim: WarBuildSim, place: () => void, ticks = 8000): number[] {
  const before = bs(sim).length;
  place();
  sim.step();
  const ids = newIds(sim, before);
  expect(ids.length).toBeGreaterThan(0);
  run(sim, ticks, () => allDone(sim, ids));
  expect(allDone(sim, ids)).toBe(true);
  return ids;
}

/** Wall of `material` across the gap; returns [sim, builders, wall ids]. */
function walled(material: 'wood' | 'timber' | 'stone', seed = 1): [WarBuildSim, number, number[]] {
  const [sim, s] = base(seed);
  const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material, points: [14.5, 20.5, 25.5, 20.5] }));
  return [sim, s, ids];
}

/** Wood stairs up to the inner row at x = 20 (tiles (20,22) bottom... (20,22) top, (20,23) bottom). */
function stairs(sim: WarBuildSim, s: number): BuildingSnap {
  const [id] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 20.5, y: 23 }));
  sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
  run(sim, 150);
  return pieces(sim, [id])[0];
}

/** `n` archers of team 0 ordered onto the walkway at (x, 20.5); returns the squad. */
function onWall(sim: WarBuildSim, n: number, x = 20.5): number {
  const a = sim.spawnSquad('b', 0, 'archer', n, 20, 28);
  sim.order({ kind: 'move', squad: a, x, y: 20.5 });
  run(sim, 800, () => alive(sim, a).every((u) => u.z === 3));
  return a;
}

describe('wall tiers', () => {
  it('tiers: palisade thin, no walkway; rampart 2 deep at +2; stone wall 2 deep at +3; towers with a cap; wood burns', () => {
    expect(BUILDINGS.palisade.walk ?? 0).toBe(0);
    expect(BUILDINGS.rampart).toMatchObject({ walk: 2, depth: 2 });
    expect(BUILDINGS.stoneWall).toMatchObject({ walk: 3, depth: 2 });
    expect(BUILDINGS.woodTower).toMatchObject({ walk: 3, cap: 6, burnable: true });
    expect(BUILDINGS.stoneTower).toMatchObject({ walk: 4, cap: 9, door: true });
    expect(BUILDINGS.ladder).toMatchObject({ access: 'ladder', cap: 1 });
    expect(BUILDINGS.stoneWall.hp).toBeGreaterThan(BUILDINGS.rampart.hp);
    expect(BUILDINGS.rampart.hp).toBeGreaterThan(BUILDINGS.palisade.hp);
    expect(BUILDINGS.palisade.burnable && BUILDINGS.rampart.burnable && !BUILDINGS.stoneWall.burnable).toBe(true);
    expect(BUILDINGS.palisade.upgrade?.to).toBe('rampart');
    expect(BUILDINGS.rampart.upgrade?.to).toBe('stoneWall');
  });

  it('a timber wall line is 2 deep (line + inner row toward the inside); a palisade 1', () => {
    const [sim] = base(1);
    sim.claim(0, 20, 20, 30);
    const plan = sim.checkWall(0, { material: 'timber', points: [14.5, 20.5, 25.5, 20.5] });
    expect(plan.ok).toBe(true);
    const rows = new Set(plan.pieces.flatMap((p) => p.tiles.filter((_, i) => i % 2 === 1)));
    expect([...rows].sort()).toEqual([20, 21]);
    expect(plan.pieces.reduce((n, p) => n + p.tiles.length / 2, 0)).toBe(24);
    const thin = sim.checkWall(0, { material: 'wood', points: [14.5, 20.5, 25.5, 20.5] });
    expect(thin.pieces.reduce((n, p) => n + p.tiles.length / 2, 0)).toBe(12);
  });

  it('a finished rampart is a raised walkway nobody reaches without stairs or a ladder', () => {
    const [sim, , ids] = walled('timber');
    expect(pieces(sim, ids).every((b) => b.type === 'rampart' && b.walk === 2 && b.depth === 2 && b.tier === 2)).toBe(true);
    const a = onWall(sim, 6);
    expect(alive(sim, a).some((u) => u.z === 3)).toBe(false);
  });

  it('stairs attach only to the inside face of a walkway wall; archers climb them and stand on top', () => {
    const [sim, s, ids] = walled('timber');
    expect(sim.checkPlacement(0, 'woodStairs', 20.5, 19)).toMatchObject({ ok: false }); // outside (north) face / rock
    expect(sim.checkPlacement(0, 'woodStairs', 20.5, 26).reason).toBe('attach'); // nothing to lean on
    expect(sim.checkPlacement(0, 'woodStairs', 20.5, 23)).toMatchObject({ ok: true, tiles: [20, 23, 20, 22] }); // bottom first
    const st = stairs(sim, s);
    expect(st).toMatchObject({ type: 'woodStairs', attach: expect.any(Number), steps: [1, 1] });
    expect(ids).toContain(st.attach);
    const a = onWall(sim, 8);
    for (const u of unitsOf(sim, a)) {
      expect(u.z).toBe(3); // ground 1 + walkway 2
      expect(Math.floor(u.y)).toBeGreaterThanOrEqual(20);
      expect(Math.floor(u.y)).toBeLessThanOrEqual(21);
      expect(ids).toContain(u.on);
    }
  });

  it('two men pass each other on a 2-deep walkway', () => {
    const [sim, s] = walled('timber', 2);
    stairs(sim, s);
    const a = onWall(sim, 1, 15.5);
    const b = onWall(sim, 1, 24.5);
    expect(alive(sim, a)[0].z).toBe(3);
    expect(alive(sim, b)[0].z).toBe(3);
    sim.order({ kind: 'move', squad: a, x: 24.5, y: 20.5 });
    sim.order({ kind: 'move', squad: b, x: 15.5, y: 20.5 });
    run(sim, 300);
    const [ua] = alive(sim, a), [ub] = alive(sim, b);
    expect(Math.hypot(ua.x - 24.5, ua.y - 20.5)).toBeLessThan(0.6);
    expect(Math.hypot(ub.x - 15.5, ub.y - 20.5)).toBeLessThan(0.6);
  });

  it('from outside the wall is a cliff: foes cannot walk onto it, nor reach the men on it in melee', () => {
    const [sim, s, ids] = walled('timber', 3);
    stairs(sim, s);
    const a = onWall(sim, 6);
    sim.order({ kind: 'hold', squad: a });
    const e = sim.spawnSquad('e', 1, 'hoplite', 12, 20, 8);
    sim.order({ kind: 'attack', squad: e, target: a });
    let hits = 0;
    let closest = 0;
    let before = unitsOf(sim, a).reduce((n, u) => n + u.hp, 0);
    for (let t = 0; t < 600; t++) {
      sim.step();
      for (const u of unitsOf(sim, e)) {
        expect(u.y).toBeLessThan(20); // never on the wall, never past it
        if (u.state !== 'dead') closest = Math.max(closest, u.y);
      }
      const now = unitsOf(sim, a).reduce((n, u) => n + u.hp, 0);
      if (now < before) hits++;
      before = now;
    }
    expect(closest).toBeGreaterThan(16); // they came up to the wall (and stood off its foot)
    expect(hits).toBe(0);
    expect(pieces(sim, ids).every((b) => b.state === 'done')).toBe(true);
  });

  it('archers on the wall beat equal archers on the ground', () => {
    const [sim, s] = walled('timber', 4);
    stairs(sim, s);
    const a = onWall(sim, 10);
    sim.order({ kind: 'hold', squad: a });
    const e = sim.spawnSquad('e', 1, 'archer', 10, 20, 8);
    sim.order({ kind: 'attack', squad: e, target: a });
    run(sim, 3000, () => alive(sim, a).length === 0 || alive(sim, e).length === 0);
    expect(alive(sim, e).length).toBeLessThan(10); // they fought
    expect(alive(sim, a).length).toBeGreaterThan(alive(sim, e).length);
  });

  it('attackers scale a foe wall by a ladder, one man on it at a time', () => {
    const [sim] = walled('timber', 5);
    const e = sim.spawnSquad('e', 1, 'militia', 6, 18, 14);
    expect(sim.checkPlacement(1, 'ladder', 17.5, 19.5)).toMatchObject({ ok: true }); // no influence needed
    sim.order({ kind: 'placeBuilding', squad: e, type: 'ladder', x: 17.5, y: 19.5 });
    sim.step();
    const ladder = bs(sim).at(-1)!;
    expect(ladder).toMatchObject({ type: 'ladder', team: 1, cap: 1 });
    run(sim, 1500, () => pieces(sim, [ladder.id])[0].state === 'done');
    expect(pieces(sim, [ladder.id])[0].attach).toBeGreaterThanOrEqual(0);
    sim.order({ kind: 'move', squad: e, x: 18.5, y: 20.5 });
    let most = 0;
    run(sim, 1500, () => {
      most = Math.max(most, alive(sim, e).filter((u) => u.on === ladder.id).length);
      return alive(sim, e).every((u) => u.z === 3);
    });
    expect(most).toBeLessThanOrEqual(1);
    expect(alive(sim, e).filter((u) => u.z === 3).length).toBeGreaterThan(0);
  });

  it('a standalone wood tower is reached only by a ladder, and its platform holds its cap', () => {
    const [sim, s] = base(6);
    const [tw] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodTower', x: 30, y: 30 }));
    const tower = pieces(sim, [tw])[0];
    expect(tower).toMatchObject({ walk: 3, cap: 6 });
    sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
    run(sim, 150);
    const a = sim.spawnSquad('b', 0, 'archer', 10, 24, 30);
    sim.order({ kind: 'move', squad: a, x: tower.x, y: tower.y });
    run(sim, 500);
    expect(alive(sim, a).some((u) => u.on === tw)).toBe(false);
    build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'ladder', x: 28.5, y: 29.5 }));
    sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
    sim.order({ kind: 'move', squad: a, x: tower.x, y: tower.y });
    run(sim, 1200);
    const top = alive(sim, a).filter((u) => u.on === tw);
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(6);
    for (const u of top) expect(u.z).toBe(4);
  });

  it('a stone tower is entered by its door, for its own team only', () => {
    const [sim, s] = base(7);
    const [tw] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'stoneTower', x: 30, y: 30 }), 12000);
    const tower = pieces(sim, [tw])[0];
    expect(tower.door).toHaveLength(2);
    sim.order({ kind: 'move', squad: s, x: 20, y: 36 });
    run(sim, 150);
    const e = sim.spawnSquad('e', 1, 'militia', 4, 34, 26);
    sim.order({ kind: 'move', squad: e, x: tower.x, y: tower.y });
    const a = sim.spawnSquad('b', 0, 'archer', 6, 24, 30);
    sim.order({ kind: 'move', squad: a, x: tower.x, y: tower.y });
    run(sim, 1000);
    expect(alive(sim, e).some((u) => u.z! > 1)).toBe(false);
    const top = alive(sim, a).filter((u) => u.z === 5);
    expect(top.length).toBeGreaterThan(0);
  });

  it('upgrades in place: palisade -> rampart (growing its inner row) -> stone wall, blocking all the while', () => {
    const [sim, s, ids] = walled('wood', 8);
    const before = pieces(sim, ids);
    expect(before.every((b) => b.type === 'palisade' && !b.walk && b.depth === 1)).toBe(true);
    const id = ids[0];
    const n0 = pieces(sim, [id])[0].tiles.length;
    sim.order({ kind: 'upgrade', squad: s, building: id });
    sim.step();
    const up = pieces(sim, [id])[0];
    expect(up).toMatchObject({ type: 'rampart', state: 'scaffold', upgradeFrom: 'palisade' });
    expect(up.tiles.length).toBe(n0 * 2); // the inner row
    // the old wall blocks during the upgrade: a foe cannot slip through
    const e = sim.spawnSquad('e', 1, 'militia', 4, 20, 8);
    sim.order({ kind: 'move', squad: e, x: 20, y: 36 });
    const done = () => pieces(sim, [id])[0].state === 'done';
    run(sim, 8000, () => {
      for (const u of unitsOf(sim, e)) expect(u.y).toBeLessThan(20);
      return done();
    });
    expect(pieces(sim, [id])[0]).toMatchObject({ type: 'rampart', walk: 2, depth: 2, state: 'done' });
    expect(pieces(sim, [id])[0].upgradeFrom).toBeUndefined();
    const tiles = pieces(sim, [id])[0].tiles.join();
    sim.order({ kind: 'upgrade', squad: s, building: id });
    run(sim, 12000, done);
    const stone = pieces(sim, [id])[0];
    expect(stone).toMatchObject({ type: 'stoneWall', walk: 3, tier: 3, state: 'done', hp: stone.maxHp });
    expect(stone.tiles.join()).toBe(tiles); // same layout
    // a stone wall has no next tier
    sim.order({ kind: 'upgrade', squad: s, building: id });
    sim.step();
    expect(pieces(sim, [id])[0].state).toBe('done');
  });

  it('stairs follow their wall up when it is upgraded', () => {
    const [sim, s, ids] = walled('timber', 9);
    const st = stairs(sim, s);
    sim.order({ kind: 'upgrade', squad: s, building: st.attach! });
    run(sim, 8000, () => pieces(sim, [st.attach!])[0].state === 'done');
    expect(pieces(sim, [st.attach!])[0].type).toBe('stoneWall');
    expect(pieces(sim, [st.id])[0].steps).toEqual([1, 2]);
    const a = onWall(sim, 4);
    expect(alive(sim, a).some((u) => u.z === 4 && ids.includes(u.on!))).toBe(true);
  });

  it('cancelling an upgrade leaves the old tier standing', () => {
    const [sim, s, ids] = walled('wood', 10);
    const n0 = pieces(sim, [ids[0]])[0].tiles.length;
    sim.order({ kind: 'upgrade', squad: s, building: ids[0] });
    run(sim, 30);
    sim.order({ kind: 'cancelSite', site: ids[0] });
    sim.step();
    expect(pieces(sim, [ids[0]])[0]).toMatchObject({ type: 'palisade', state: 'done' });
    expect(pieces(sim, [ids[0]])[0].tiles.length).toBe(n0);
  });

  it('melee who cannot reach the men on a wall stand off its foot instead of pressing against it', () => {
    const [sim, s] = walled('timber', 3);
    stairs(sim, s);
    const a = onWall(sim, 6);
    sim.order({ kind: 'hold', squad: a });
    const e = sim.spawnSquad('e', 1, 'hoplite', 12, 20, 8);
    sim.order({ kind: 'attack', squad: e, target: a });
    run(sim, 600);
    const ys = alive(sim, e).map((u) => u.y);
    expect(ys.length).toBeGreaterThan(4);
    expect(ys.filter((y) => y >= 19).length).toBeLessThanOrEqual(2); // the wall's foot row stays clear
    expect(Math.max(...ys)).toBeGreaterThan(15); // they did come up to it
  });

  it('is deterministic', () => {
    const go = () => {
      const [sim, s] = walled('timber', 11);
      stairs(sim, s);
      onWall(sim, 6, 18.5);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});
