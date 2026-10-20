/** M5h3 engineer siege designs (src/war/sim/siege.ts, docs/WAR.md "Crafting and professions"): mantlet, covered ram, oxybeles, siege tower; Artillerist, Sapper, Archimedes. */
import { describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { makePerson } from '../../src/war/sim/roster';
import { COVERED, NODE, OXY, RAM, SIEGE } from '../../src/war/sim/siege';
import type { RegionData, SiegeSnap, WarBuildSim } from '../../src/war/types';

/** As siege.test.ts: flat 40 x 40 grass cut by a rock band on row 20, open at x 14..25; team 0 holds the south. */
function region(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 's', name: 's', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [],
  };
  for (let x = 0; x < n; x++) if (x < 14 || x > 25) r.terrain[20 * n + x] = 'rock';
  return r;
}

const run = (sim: WarBuildSim, ticks: number, until?: () => boolean): number => {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
};
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const piece = (sim: WarBuildSim, id: number) => bs(sim).find((b) => b.id === id)!;
const engine = (sim: WarBuildSim, id: number): SiegeSnap => sim.snapshot().sieges![id];
const engines = (sim: WarBuildSim) => sim.snapshot().sieges?.length ?? 0;
const unitsOf = (sim: WarBuildSim, squad: number) => {
  const snap = sim.snapshot();
  const ids = new Set(snap.squads[squad].units);
  return snap.units.filter((u) => ids.has(u.id));
};
const alive = (sim: WarBuildSim, squad: number) => unitsOf(sim, squad).filter((u) => u.state !== 'dead');
const hpOf = (sim: WarBuildSim, squad: number) => unitsOf(sim, squad).reduce((a, u) => a + Math.max(0, u.hp), 0);

/** An engineer of `team` holding `perks`, out of the way in a corner. */
function engineer(sim: WarBuildSim, team: number, perks: string[], x = 2, y = 2): number {
  const p = makePerson(`eng-${team}-${perks.join('-')}-${x}`, 'civ_engineer', { level: 10 });
  p.hero.perks = perks as never;
  return sim.spawnSquad('x', team, 'civ_engineer', 1, x, y, [p]);
}

function base(seed: number): [WarBuildSim, number] {
  const sim = createSim(region(), seed);
  sim.claim(0, 20, 32, 25);
  for (const t of [0, 1]) for (const r of ['wood', 'stone', 'hides', 'iron', 'bronze', 'linen', 'charcoal'] as const) sim.addStock(t, r, 5000);
  const s = sim.spawnSquad('a', 0, 'militia', 24, 20, 27);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  return [sim, s];
}

function build(sim: WarBuildSim, place: () => void, ticks = 9000): number[] {
  const before = bs(sim).length;
  place();
  sim.step();
  const ids = bs(sim).filter((b) => b.id >= before).map((b) => b.id);
  expect(ids.length).toBeGreaterThan(0);
  run(sim, ticks, () => ids.every((id) => piece(sim, id).state === 'done'));
  expect(ids.every((id) => piece(sim, id).state === 'done')).toBe(true);
  return ids;
}
const away = (sim: WarBuildSim, s: number) => {
  sim.order({ kind: 'move', squad: s, x: 20, y: 37 });
  run(sim, 150);
};

/** Team `team` builds an engine of `type` with a fresh squad at (x,y) and crews it; returns [squad, engine id]. */
function engineAt(sim: WarBuildSim, type: SiegeSnap['type'], x: number, y: number, n = 8, team = 1): [number, number] {
  const q = sim.spawnSquad('e', team, 'militia', n, x, y - 2);
  const id = engines(sim);
  sim.order({ kind: 'buildSiege', squad: q, type, x, y });
  sim.step();
  expect(engine(sim, id)).toMatchObject({ type, team, state: 'building' });
  run(sim, 6000, () => engine(sim, id).state !== 'building');
  expect(engine(sim, id).state).toBe('idle');
  sim.order({ kind: 'crew', squad: q, siege: id });
  run(sim, 60);
  return [q, id];
}

describe('M5h3 designs', () => {
  it('need an engineer with the node; cost and labour come from the recipe', () => {
    const [sim] = base(1);
    const q = sim.spawnSquad('e', 1, 'militia', 6, 20, 8);
    for (const type of ['mantlet', 'coveredRam', 'oxybeles', 'siegeTower'] as const) {
      sim.order({ kind: 'buildSiege', squad: q, type, x: 20, y: 10 });
      sim.step();
      expect(engines(sim)).toBe(0); // no engineer: refused
    }
    expect(SIEGE.mantlet).toMatchObject({ cost: RECIPES.mantlet.inputs, labour: RECIPES.mantlet.secs, node: 'carpenter', crew: 2 });
    expect(SIEGE.coveredRam).toMatchObject({ hp: 1400, node: 'rams', crew: 6 });
    expect(SIEGE.oxybeles).toMatchObject({ node: 'artillerist', crew: 2 });
    expect(SIEGE.siegeTower).toMatchObject({ cost: RECIPES.siege_tower.inputs, labour: 900, node: 'poliorcetes', crew: 8 });
    engineer(sim, 1, ['carpenter']);
    const wood = sim.snapshot().stock![1].wood!, hides = sim.snapshot().stock![1].hides!;
    sim.order({ kind: 'buildSiege', squad: q, type: 'siegeTower', x: 20, y: 10 });
    sim.step();
    expect(engines(sim)).toBe(0); // a carpenter has no siege tower
    sim.order({ kind: 'buildSiege', squad: q, type: 'mantlet', x: 20, y: 10 });
    sim.step();
    expect(engine(sim, 0)).toMatchObject({ type: 'mantlet', state: 'building' });
    expect(sim.snapshot().stock![1].wood).toBe(wood - 12);
    expect(sim.snapshot().stock![1].hides).toBe(hides - 2);
  });

  it('a mantlet stops most missiles from in front for the men behind it', () => {
    const lost = (withMantlet: boolean) => {
      const [sim, s] = base(2);
      away(sim, s);
      engineer(sim, 1, ['carpenter'], 37, 2);
      let q: number;
      if (withMantlet) {
        [q] = engineAt(sim, 'mantlet', 20, 9, 8);
        sim.order({ kind: 'move', squad: q, x: 20, y: 12 }); // it faces south, at the archers
        run(sim, 200);
        sim.order({ kind: 'hold', squad: q });
      } else {
        q = sim.spawnSquad('e', 1, 'militia', 8, 20, 10);
        sim.order({ kind: 'hold', squad: q });
      }
      run(sim, 30);
      const a = sim.spawnSquad('d', 0, 'archer', 8, 20, 26);
      sim.order({ kind: 'hold', squad: a });
      const h0 = hpOf(sim, q);
      run(sim, 600);
      return h0 - hpOf(sim, q);
    };
    const open = lost(false), covered = lost(true);
    expect(open).toBeGreaterThan(0);
    expect(covered).toBeLessThan(open * 0.6);
  });

  it('a covered ram holds more, batters like a ram and is slow to catch fire', () => {
    const catchTicks = (type: 'ram' | 'coveredRam', perks: string[]) => {
      const [sim, s] = base(3);
      away(sim, s);
      engineer(sim, 1, perks, 37, 2);
      const [c, id] = engineAt(sim, type, 20, 10);
      sim.order({ kind: 'uncrew', squad: c });
      sim.order({ kind: 'move', squad: c, x: 4, y: 4 }); // the crew walks off: the torchers work unhindered
      run(sim, 100);
      expect(engine(sim, id).maxHp).toBe(SIEGE[type].hp);
      const t = sim.spawnSquad('d', 0, 'militia', 2, 20, 14);
      sim.order({ kind: 'ignite', squad: t, siege: id });
      return run(sim, 1500, () => (engine(sim, id).burning ?? 0) > 0);
    };
    const ram = catchTicks('ram', []);
    const covered = catchTicks('coveredRam', ['carpenter', 'rams']);
    expect(covered - ram).toBeGreaterThanOrEqual(12); // twice the torch-time: 3 s for two men, 1.5 s more
    expect(COVERED.cover).toBeGreaterThan(RAM.cover);
    const [sim, s] = base(4);
    const [gate] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodGate', x: 30, y: 30 }));
    away(sim, s);
    engineer(sim, 1, ['carpenter', 'rams'], 37, 2);
    const [q] = engineAt(sim, 'coveredRam', 30, 23);
    sim.order({ kind: 'attackBuilding', squad: q, building: gate });
    run(sim, 6000, () => piece(sim, gate).state === 'destroyed');
    expect(piece(sim, gate).state).toBe('destroyed');
  });

  it('an oxybeles shoots the nearest foe in sight, and its bolt goes through a line of men', () => {
    const [sim, s] = base(5);
    away(sim, s);
    engineer(sim, 1, ['carpenter', 'rams', 'artillerist'], 37, 2);
    const [, id] = engineAt(sim, 'oxybeles', 20, 9, 4);
    const line = [20.5, 21.5, 22.5].map((y) => sim.spawnSquad('d', 0, 'militia', 1, 20.5, y));
    for (const q of line) sim.order({ kind: 'hold', squad: q });
    const hp0 = line.map((q) => hpOf(sim, q));
    let bolt = -1;
    run(sim, 300, () => {
      const sh = (sim.snapshot().shots ?? []).find((x) => x.siege === id && x.kind === 'bolt');
      if (sh && bolt < 0) bolt = sh.t1;
      return bolt >= 0 && sim.snapshot().tick > bolt + 1;
    });
    expect(bolt).toBeGreaterThan(0);
    const hit = line.filter((q, i) => hpOf(sim, q) < hp0[i]).length;
    expect(hit).toBeGreaterThanOrEqual(2); // pierced
    expect(hit).toBeLessThanOrEqual(OXY.pierce);
    expect(engine(sim, id).reload).toBeGreaterThan(0);
  });

  it('a siege tower docks on the walk: many cross at once, it is not pushed off, and burns with its bridge', () => {
    const [sim, s] = base(6);
    build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    away(sim, s);
    engineer(sim, 1, ['poliorcetes'], 37, 2);
    const [q, id] = engineAt(sim, 'siegeTower', 17, 12, 10);
    expect(engine(sim, id).crewNeed).toBe(8);
    sim.order({ kind: 'raiseLadder', squad: q, wallTile: [17, 20] });
    run(sim, 3000, () => engine(sim, id).state === 'raised');
    expect(engine(sim, id).state).toBe('raised');
    const br = piece(sim, engine(sim, id).ladder!);
    expect(br).toMatchObject({ type: 'towerBridge', team: 1, siege: id, cap: 8 });
    sim.order({ kind: 'move', squad: q, x: 17.5, y: 20.5 });
    run(sim, 600, () => alive(sim, q).filter((u) => u.z === 3).length >= 4);
    expect(alive(sim, q).filter((u) => u.z === 3).length).toBeGreaterThanOrEqual(4);
    const d = sim.spawnSquad('d', 0, 'hoplite', 4, 22, 27);
    sim.order({ kind: 'pushLadder', squad: d, ladder: br.id });
    sim.step();
    expect(sim.snapshot().squads[d].order).not.toBe('pushLadder'); // refused
    const f = sim.spawnSquad('f', 0, 'militia', 4, 17, 12);
    sim.order({ kind: 'ignite', squad: f, siege: id });
    run(sim, 4000, () => engine(sim, id).state === 'destroyed');
    expect(engine(sim, id).state).toBe('destroyed');
    expect(piece(sim, br.id).state).toBe('destroyed');
  });
});

describe('M5h3 engineer nodes', () => {
  it('Artillerist: a stone thrower needs one crew less', () => {
    const [sim] = base(7);
    const [, a] = engineAt(sim, 'stoneThrower', 10, 10, 6);
    expect(engine(sim, a).crewNeed).toBe(4);
    engineer(sim, 1, ['carpenter', 'rams', 'artillerist']);
    run(sim, 1);
    expect(engine(sim, a).crewNeed).toBe(3);
  });

  it('Sapper: engine damage x1.3', () => {
    const blow = (perks: string[]) => {
      const [sim, s] = base(8);
      const [gate] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodGate', x: 30, y: 30 }));
      away(sim, s);
      if (perks.length) engineer(sim, 1, perks, 37, 2);
      const [q, id] = engineAt(sim, 'ram', 30, 23);
      sim.order({ kind: 'attackBuilding', squad: q, building: gate });
      const hp0 = piece(sim, gate).hp;
      run(sim, 3000, () => engine(sim, id).swing !== undefined);
      run(sim, 2);
      return hp0 - piece(sim, gate).hp;
    };
    const plain = blow([]), sapper = blow(['carpenter', 'rams', 'sapper']);
    expect(plain).toBeCloseTo(RAM.dmg, 0);
    expect(sapper).toBeCloseTo(RAM.dmg * NODE.sapper, 0);
  });

  it('Archimedes: an oxybeles on a stone tower, and only with him', () => {
    const [sim, s] = base(9);
    const [tw] = build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'stoneTower', x: 20, y: 28 }), 20000);
    away(sim, s);
    const crew = sim.spawnSquad('c', 0, 'militia', 4, 22, 31);
    const t = piece(sim, tw);
    const [tx, ty] = [t.tiles[0] + 0.5, t.tiles[1] + 0.5];
    engineer(sim, 0, ['carpenter', 'rams', 'artillerist'], 37, 37);
    sim.order({ kind: 'buildSiege', squad: crew, type: 'oxybeles', x: tx, y: ty });
    sim.step();
    expect(engines(sim)).toBe(0); // no Archimedes: not on a tower
    engineer(sim, 0, ['archimedes'], 36, 37);
    sim.order({ kind: 'buildSiege', squad: crew, type: 'oxybeles', x: tx, y: ty });
    sim.step();
    expect(engine(sim, 0)).toMatchObject({ type: 'oxybeles', team: 0, state: 'building' });
    expect(NODE.archimedes * OXY.range).toBeCloseTo(36);
  });
});

describe('M5h3 determinism', () => {
  it('a siege with the new engines runs the same twice', () => {
    const go = () => {
      const [sim, s] = base(10);
      build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
      away(sim, s);
      engineer(sim, 1, ['carpenter', 'rams', 'artillerist', 'poliorcetes'], 37, 2);
      const [, ox] = engineAt(sim, 'oxybeles', 22, 9, 3);
      const [q] = engineAt(sim, 'siegeTower', 17, 12, 10);
      sim.order({ kind: 'raiseLadder', squad: q, wallTile: [17, 20] });
      const d = sim.spawnSquad('d', 0, 'archer', 6, 21, 23);
      sim.order({ kind: 'hold', squad: d });
      run(sim, 1500);
      expect(engine(sim, ox).type).toBe('oxybeles');
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});

describe('M5h3 siege bots', () => {
  it('take a walled camp with a covered ram, a siege tower, a mantlet and an oxybeles', () => {
    const [sim, s] = base(11);
    const ids = build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    away(sim, s);
    engineer(sim, 1, ['carpenter', 'rams', 'artillerist', 'poliorcetes'], 37, 2);
    // passive defenders, as in siege.test.ts: archers on the walk, a guard inside
    build(sim, () => sim.order({ kind: 'placeBuilding', squad: s, type: 'woodStairs', x: 15.5, y: 23 }));
    away(sim, s);
    const archers = sim.spawnSquad('d', 0, 'archer', 6, 17, 26);
    sim.order({ kind: 'move', squad: archers, x: 17.5, y: 20.5 });
    run(sim, 600);
    sim.order({ kind: 'hold', squad: archers });
    const guard = sim.spawnSquad('g', 0, 'hoplite', 6, 22, 27);
    const bots = createBots(sim);
    const atk = [
      [sim.spawnSquad('r', 1, 'militia', 12, 22, 8), { kind: 'siegeRam', x: 20, y: 30, engine: 'coveredRam' }],
      [sim.spawnSquad('t', 1, 'militia', 14, 16, 8), { kind: 'siegeLadder', x: 20, y: 30, engine: 'siegeTower' }],
      [sim.spawnSquad('a', 1, 'archer', 8, 24, 6), { kind: 'siegeArchers', x: 20, y: 30, engine: 'mantlet' }],
      [sim.spawnSquad('o', 1, 'militia', 3, 28, 6), { kind: 'siegeBolts', x: 20, y: 30 }],
      [sim.spawnSquad('h', 1, 'hoplite', 14, 20, 3), { kind: 'assault', x: 20, y: 30 }],
    ] as const;
    for (const [q, b] of atk) bots.set(q, b);
    const inside = () => atk.some(([q]) => alive(sim, q).some((u) => u.y > 24));
    const t = run(sim, 12000, () => {
      bots.tick();
      return inside() && alive(sim, guard).length === 0 && alive(sim, archers).length === 0;
    });
    const types = new Set((sim.snapshot().sieges ?? []).map((e) => e.type));
    for (const k of ['coveredRam', 'siegeTower', 'mantlet', 'oxybeles'] as const) expect(types.has(k)).toBe(true);
    expect(t).toBeLessThan(12000);
    const gate = ids.find((id) => piece(sim, id).type === 'woodGate')!;
    expect(piece(sim, gate).state === 'destroyed' || bs(sim).some((b) => b.type === 'towerBridge')).toBe(true);
  });

  it('fall back to the plain engine when no engineer has the design', () => {
    const [sim, s] = base(12);
    build(sim, () => sim.order({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] }));
    away(sim, s);
    const bots = createBots(sim);
    const q = sim.spawnSquad('r', 1, 'militia', 8, 22, 8);
    bots.set(q, { kind: 'siegeRam', x: 20, y: 30, engine: 'coveredRam' });
    run(sim, 1500, () => {
      bots.tick();
      return engines(sim) > 0;
    });
    expect(engine(sim, 0).type).toBe('ram');
  });
});
