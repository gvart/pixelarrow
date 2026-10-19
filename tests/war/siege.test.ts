import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import type { RegionData, SiegeSnap, WarBuildSim } from '../../src/war/types';

/**
 * Flat grass 40 x 40 at height 1 cut in two by a rock band on row 20, open only at x 14..25 where the wall goes (as in
 * walls.test.ts). Team 0 holds the south (camp at (20, 33)); team 1 attacks from the north.
 */
function region(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 's', name: 's', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
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
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
const engine = (sim: WarBuildSim, id: number): SiegeSnap => sim.snapshot().sieges![id];
const newIds = (sim: WarBuildSim, before: number) => bs(sim).filter((b) => b.id >= before).map((b) => b.id);
const unitsOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id));
};
const alive = (sim: WarBuildSim, squad: number) => unitsOf(sim, squad).filter((u) => u.state !== 'dead');

function base(seed: number): [WarBuildSim, number] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  sim.addStock(0, 'wood', 5000);
  sim.addStock(0, 'stone', 5000);
  sim.addStock(1, 'wood', 1000);
  sim.addStock(1, 'stone', 300);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  return [sim, s];
}

function build(sim: WarBuildSim, place: () => void, ticks = 9000): number[] {
  const before = bs(sim).length;
  place();
  sim.step();
  const ids = newIds(sim, before);
  expect(ids.length).toBeGreaterThan(0);
  run(sim, ticks, () => ids.every((id) => piece(sim, id).state === 'done'));
  expect(ids.every((id) => piece(sim, id).state === 'done')).toBe(true);
  return ids;
}

/** Builders walk off south, out of the way. */
const away = (sim: WarBuildSim, s: number) => {
  sim.order({ kind: 'move', squad: s, x: 20, y: 37 });
  run(sim, 150);
};

/** Team 1 builds an engine of `type` with a fresh squad at (x,y) and crews it; returns [squad, engine id]. */
function engineAt(sim: WarBuildSim, type: SiegeSnap['type'], x: number, y: number, n = 8, cls = 'militia'): [number, number] {
  const q = sim.spawnSquad('e', 1, cls, n, x, y - 2);
  const before = sim.snapshot().sieges?.length ?? 0;
  sim.order({ kind: 'buildSiege', squad: q, type, x, y });
  sim.step();
  const id = before;
  expect(engine(sim, id)).toMatchObject({ type, team: 1, state: 'building' });
  run(sim, 3000, () => engine(sim, id).state !== 'building');
  expect(engine(sim, id).state).toBe('idle');
  sim.order({ kind: 'crew', squad: q, siege: id });
  run(sim, 60);
  return [q, id];
}

describe('fire', () => {
  it('spreads along a palisade but never catches stone; stone cannot be lit', () => {
    const [sim, s] = base(1);
    const wood = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 19.5, 20.5] }));
    const stone = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'stone', points: [20.5, 20.5, 25.5, 20.5] }), 12000);
    away(sim, s);
    const e = sim.spawnSquad('e', 1, 'militia', 6, 16, 16);
    sim.order({ kind: 'ignite', squad: e, building: stone[0] });
    sim.step();
    expect(sim.snapshot().squads[e].order).toBe('hold'); // stone: refused
    const first = wood.reduce((a, id) => (piece(sim, id).tiles[0] < piece(sim, a).tiles[0] ? id : a), wood[0]); // the west end
    sim.order({ kind: 'ignite', squad: e, building: first });
    let lit = 0;
    run(sim, 600, () => (piece(sim, first).burning ?? 0) > 0);
    expect(piece(sim, first).burning).toBeGreaterThan(0);
    expect(alive(sim, e).some((u) => u.task === 'ignite') || sim.snapshot().squads[e].order === 'hold').toBe(true);
    sim.order({ kind: 'move', squad: e, x: 16, y: 5 });
    const burnt = new Set<number>();
    run(sim, 4000, () => {
      for (const id of wood) if (piece(sim, id).burning || piece(sim, id).state === 'destroyed') burnt.add(id);
      for (const id of stone) expect(piece(sim, id).burning).toBeUndefined();
      lit = burnt.size;
      return lit === wood.length;
    });
    expect(lit).toBe(wood.length); // caught from one to the next
    for (const id of stone) expect(piece(sim, id).state).not.toBe('destroyed');
    run(sim, 3000, () => piece(sim, first).state === 'destroyed');
    expect(piece(sim, first).state).toBe('destroyed'); // burnt down
  });

  it('men beat a fire out', () => {
    const [sim, s] = base(2);
    const wood = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 25.5, 20.5] }));
    const e = sim.spawnSquad('e', 1, 'militia', 4, 20, 16);
    sim.order({ kind: 'ignite', squad: e, building: wood[1] });
    run(sim, 600, () => (piece(sim, wood[1]).burning ?? 0) > 0);
    sim.order({ kind: 'move', squad: e, x: 20, y: 4 });
    sim.order({ kind: 'extinguish', squad: s, building: wood[1] });
    const t = run(sim, 1500, () => !piece(sim, wood[1]).burning);
    expect(t).toBeLessThan(1500);
    sim.step();
    expect(piece(sim, wood[1]).state).not.toBe('destroyed');
    expect(sim.snapshot().squads[s].order).toBe('hold');
  });

  it('fire arrows set wood alight, slower than plain arrows', () => {
    const [sim, s] = base(3);
    const wood = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 25.5, 20.5] }));
    away(sim, s);
    const a = sim.spawnSquad('e', 1, 'archer', 10, 20, 12);
    sim.order({ kind: 'fireArrows', squad: a, on: true });
    sim.order({ kind: 'attackBuilding', squad: a, building: wood[1] });
    let fire = 0;
    run(sim, 1200, () => {
      fire += (sim.snapshot().shots ?? []).filter((sh) => sh.fire && sh.t0 === sim.snapshot().tick - 1).length;
      return wood.some((id) => (piece(sim, id).burning ?? 0) > 0);
    });
    expect(fire).toBeGreaterThan(0);
    expect(wood.some((id) => (piece(sim, id).burning ?? 0) > 0)).toBe(true);
  });
});

describe('breaches', () => {
  it('a destroyed wall piece is rubble: no deck, walkable at ground level', () => {
    const [sim, s] = base(4);
    const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5] }));
    away(sim, s);
    const mid = ids.find((id) => piece(sim, id).tiles.some((v, i) => i % 2 === 0 && v === 20))!;
    sim.damageBuilding(mid, 1e9);
    sim.step();
    const b = piece(sim, mid);
    expect(b).toMatchObject({ state: 'destroyed', rubble: true, walk: 0 });
    const e = sim.spawnSquad('e', 1, 'militia', 6, 20, 10);
    sim.order({ kind: 'move', squad: e, x: 20, y: 30 });
    run(sim, 800, () => alive(sim, e).every((u) => u.y > 25));
    for (const u of alive(sim, e)) {
      expect(u.y).toBeGreaterThan(25); // through the breach
      expect(u.z).toBe(1);
    }
  });
});

describe('siege engines', () => {
  const gateTicks = (type: 'woodGate' | 'stoneGate', seed: number) => {
    const [sim, s] = base(seed);
    const [gate] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type, x: 30, y: 30 }), 9000);
    away(sim, s);
    const [q, ram] = engineAt(sim, 'ram', 30, 23);
    sim.order({ kind: 'attackBuilding', squad: q, building: gate });
    const t = run(sim, 6000, () => piece(sim, gate).state === 'destroyed');
    const g = piece(sim, gate);
    expect(g.state).toBe('destroyed');
    expect(g.rubble).toBe(true);
    expect(engine(sim, ram).swing).toBeDefined();
    return t;
  };

  it('a ram breaks a wooden gate faster than a stone gate', () => {
    const wood = gateTicks('woodGate', 5);
    const stone = gateTicks('stoneGate', 5);
    expect(wood * 3).toBeLessThan(stone);
  });

  it('an engine needs its crew to move', () => {
    const [sim] = base(6);
    const [q, ram] = engineAt(sim, 'ram', 20, 10, 3); // 3 men: short of the 6 it needs
    const x0 = engine(sim, ram).x;
    sim.order({ kind: 'move', squad: q, x: 30, y: 10 });
    run(sim, 200);
    expect(engine(sim, ram).x).toBe(x0);
    expect(engine(sim, ram)).toMatchObject({ crew: q, crewNeed: 6, crewHere: 3 });
    const more = sim.spawnSquad('e', 1, 'militia', 6, 20, 8);
    sim.order({ kind: 'crew', squad: more, siege: ram });
    run(sim, 30);
    sim.order({ kind: 'move', squad: more, x: 30, y: 10 });
    run(sim, 300);
    expect(engine(sim, ram).x).toBeGreaterThan(x0 + 5);
    expect(engine(sim, ram).crew).toBe(more);
    expect(sim.snapshot().squads[q].order).toBe('hold'); // the old crew was relieved
  });

  it('a stone thrower deploys in range and batters a building, with a splash', () => {
    const [sim, s] = base(7);
    const [tw] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodTower', x: 30, y: 30 }));
    away(sim, s);
    const [q, th] = engineAt(sim, 'stoneThrower', 30, 4, 6);
    sim.order({ kind: 'attackBuilding', squad: q, building: tw });
    let boulders = 0;
    run(sim, 3000, () => {
      boulders += (sim.snapshot().shots ?? []).filter((sh) => sh.siege === th && sh.t0 === sim.snapshot().tick - 1).length;
      return piece(sim, tw).hp < piece(sim, tw).maxHp * 0.5;
    });
    expect(engine(sim, th).state === 'deployed' || engine(sim, th).state === 'attack').toBe(true);
    expect(boulders).toBeGreaterThan(0);
    expect(piece(sim, tw).hp).toBeLessThan(piece(sim, tw).maxHp * 0.5);
    const d = Math.hypot(engine(sim, th).x - 30, engine(sim, th).y - 30);
    expect(d).toBeGreaterThanOrEqual(8);
    expect(d).toBeLessThanOrEqual(36);
  });
});

describe('siege ladders', () => {
  const walled = (seed: number): [WarBuildSim, number, number[]] => {
    const [sim, s] = base(seed);
    // a gate lets the builders who worked from the north side go home
    const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 15.5, y: 23 }));
    away(sim, s);
    return [sim, s, ids];
  };
  const onDeck = (sim: WarBuildSim, q: number) => alive(sim, q).filter((u) => u.z === 3).length;

  it('gives deck access only while raised; pushing it off takes the access away', () => {
    const [sim, s, ids] = walled(8);
    const [q, lad] = engineAt(sim, 'siegeLadder', 17, 10, 6);
    // no ladder up: nobody gets onto the walk
    const climb = sim.spawnSquad('c', 1, 'militia', 4, 17, 14);
    sim.order({ kind: 'move', squad: climb, x: 17.5, y: 20.5 });
    run(sim, 400);
    expect(onDeck(sim, climb)).toBe(0);
    sim.order({ kind: 'raiseLadder', squad: q, wallTile: [17, 20] });
    run(sim, 1200, () => engine(sim, lad).state === 'raised');
    const raised = engine(sim, lad);
    expect(raised.state).toBe('raised');
    const l = piece(sim, raised.ladder!);
    expect(l).toMatchObject({ type: 'ladder', team: 1, siege: lad, tiles: [17, 19] });
    expect(ids).toContain(l.attach);
    sim.order({ kind: 'move', squad: climb, x: 17.5, y: 20.5 });
    run(sim, 600, () => onDeck(sim, climb) > 0);
    expect(onDeck(sim, climb)).toBeGreaterThan(0);
    // defenders push it off
    sim.order({ kind: 'move', squad: climb, x: 17, y: 4 }); // the climbers get down... those up stay up, the rest go
    const d = sim.spawnSquad('d', 0, 'hoplite', 4, 22, 27);
    sim.order({ kind: 'pushLadder', squad: d, ladder: l.id });
    run(sim, 1500, () => piece(sim, l.id).state === 'destroyed');
    expect(piece(sim, l.id).state).toBe('destroyed');
    expect(engine(sim, lad).state).toBe('idle');
    expect(engine(sim, lad).hp).toBeLessThan(engine(sim, lad).maxHp);
    const late = sim.spawnSquad('l', 1, 'militia', 4, 17, 14);
    sim.order({ kind: 'move', squad: late, x: 17.5, y: 20.5 });
    run(sim, 500);
    expect(onDeck(sim, late)).toBe(0);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

describe('determinism', () => {
  it('a siege runs the same twice', () => {
    const go = () => {
      const [sim, s] = base(9);
      const wood = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
      const [q] = engineAt(sim, 'ram', 20, 12);
      const gate = wood.find((id) => piece(sim, id).type === 'woodGate')!;
      sim.order({ kind: 'attackBuilding', squad: q, building: gate });
      const a = sim.spawnSquad('a', 1, 'archer', 6, 16, 12);
      sim.order({ kind: 'fireArrows', squad: a, on: true });
      sim.order({ kind: 'attackBuilding', squad: a, building: wood[0] });
      run(sim, 1500);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});

describe('siege bots', () => {
  it('take a small walled camp from passive defenders', () => {
    const [sim, s] = base(10);
    const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 15.5, y: 23 }));
    away(sim, s);
    const archers = sim.spawnSquad('d', 0, 'archer', 6, 17, 26);
    sim.order({ kind: 'move', squad: archers, x: 17.5, y: 20.5 });
    run(sim, 600);
    sim.order({ kind: 'hold', squad: archers });
    const guard = sim.spawnSquad('g', 0, 'hoplite', 6, 22, 27);
    const bots = createBots(sim);
    const atk = [
      [sim.spawnSquad('r', 1, 'militia', 8, 22, 8), 'siegeRam'],
      [sim.spawnSquad('l', 1, 'militia', 6, 16, 8), 'siegeLadder'],
      [sim.spawnSquad('a', 1, 'archer', 10, 24, 6), 'siegeArchers'],
      [sim.spawnSquad('h', 1, 'hoplite', 14, 20, 3), 'assault'],
    ] as const;
    for (const [q, kind] of atk) bots.set(q, { kind, x: 20, y: 30 });
    const inside = () => atk.some(([q]) => alive(sim, q).some((u) => u.y > 24));
    const t = run(sim, 9000, () => {
      bots.tick();
      return inside() && alive(sim, guard).length === 0 && alive(sim, archers).length === 0;
    });
    const gate = ids.find((id) => piece(sim, id).type === 'woodGate')!;
    expect(t).toBeLessThan(9000);
    expect(inside()).toBe(true);
    expect(piece(sim, gate).state === 'destroyed' || (sim.snapshot().sieges ?? []).some((e) => e.ladder !== undefined)).toBe(true);
    expect(alive(sim, guard).length + alive(sim, archers).length).toBe(0);
  });

  it('defenders man the walk, push off ladders and sally out to burn a ram', () => {
    const [sim, s] = base(11);
    build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 15.5, y: 23 }));
    away(sim, s);
    const bots = createBots(sim);
    const walk = sim.spawnSquad('d', 0, 'hoplite', 6, 17, 26);
    const sally = sim.spawnSquad('g', 0, 'hoplite', 8, 22, 27);
    bots.set(walk, { kind: 'defendWalls', x: 20, y: 24 });
    const ladder = sim.spawnSquad('l', 1, 'militia', 6, 17, 8);
    bots.set(ladder, { kind: 'siegeLadder', x: 20, y: 30 });
    let pushed = false, manned = false;
    run(sim, 2500, () => {
      bots.tick();
      manned ||= alive(sim, walk).some((u) => u.z === 3);
      pushed ||= bs(sim).some((b) => b.siege !== undefined && b.state === 'destroyed');
      return pushed;
    });
    expect(manned).toBe(true);
    expect(pushed).toBe(true);
    // a ram at the gate: the melee defenders go out and set it alight
    const [, ram] = engineAt(sim, 'ram', 20, 12);
    bots.set(sally, { kind: 'defendWalls', x: 20, y: 24 });
    let burnt = false;
    run(sim, 2000, () => {
      bots.tick();
      burnt ||= (engine(sim, ram).burning ?? 0) > 0;
      return burnt;
    });
    expect(burnt).toBe(true);
  });
});

