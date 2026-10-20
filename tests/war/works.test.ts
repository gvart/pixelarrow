import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { lineTiles } from '../../src/war/sim/economy';
import { buildGrid, findPath, updateSectors } from '../../src/war/sim/grid';
import type { RegionData, WarBuildSim } from '../../src/war/types';

/** Flat grass n x n: a pond at (4..7, 4..7), rock at (40..43, 4..7), a no-build band x < 3, an oak at (30.5, 10.5), boulders at (34, 12). */
function flat(n = 48, extra: RegionData['objects'] = []): RegionData {
  const r: RegionData = {
    id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [{ x: 0, y: 0, w: 3, h: n }], objects: [{ id: 'oak', x: 30.5, y: 10.5 }, { id: 'boulder-a', x: 34.5, y: 12.5 }, ...extra],
  };
  for (let y = 4; y < 8; y++)
    for (let x = 4; x < 8; x++) {
      r.water[y * n + x] = 2;
      if (40 + x - 4 < n) r.terrain[y * n + 40 + x - 4] = 'rock';
    }
  return r;
}

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}

const building = (sim: WarBuildSim, id: number) => sim.snapshot().buildings!.find((b) => b.id === id)!;

/** A camp at (cx, cy) built by a squad of `n` militia of team 0; returns the squad. */
function campAt(sim: WarBuildSim, cx: number, cy: number, n = 10) {
  sim.claim(0, cx, cy, 30);
  const s = sim.spawnSquad('a', 0, 'militia', n, cx + 4, cy + 4);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: cx, y: cy });
  run(sim, 1500, () => building(sim, 0)?.state === 'done');
  expect(building(sim, 0).state).toBe('done');
  return s;
}

describe('placement', () => {
  it('rejects no-build bands, foreign ground, water, rock, nodes and overlaps', () => {
    const sim = createSim(flat(), 1);
    expect(sim.checkPlacement(0, 'camp', 20, 20)).toMatchObject({ ok: false, reason: 'influence' });
    sim.claim(0, 20, 20, 30);
    expect(sim.checkPlacement(0, 'camp', 20, 20)).toMatchObject({ ok: true });
    expect(sim.checkPlacement(0, 'camp', 20, 20).tiles).toHaveLength(32); // 4x4 (8 m)
    expect(sim.checkPlacement(1, 'camp', 20, 20).reason).toBe('influence');
    expect(sim.checkPlacement(0, 'camp', 2, 20).reason).toBe('noBuild');
    expect(sim.checkPlacement(0, 'camp', 6, 6).reason).toBe('water');
    expect(sim.checkPlacement(0, 'camp', 42, 6).reason).toBe('rock');
    expect(sim.checkPlacement(0, 'outpost', 31, 11).reason).toBe('node'); // the oak stands there
    expect(sim.checkPlacement(0, 'outpost', 35, 13).reason).toBe('blocked'); // the boulder
    expect(sim.checkPlacement(0, 'barracks', 20, 30, 1).tiles).toHaveLength(24); // 3x4 rotated
    const s = sim.spawnSquad('a', 0, 'militia', 4, 26, 26);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 20 });
    sim.step();
    expect(sim.snapshot().buildings).toHaveLength(1);
    expect(sim.checkPlacement(0, 'outpost', 21, 21).reason).toBe('overlap');
    // an invalid order is dropped
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 6, y: 6 });
    sim.step();
    expect(sim.snapshot().buildings).toHaveLength(1);
  });

  it('a wall line splits into segments with towers and a gate inside', () => {
    const sim = createSim(flat(), 1);
    sim.claim(0, 24, 24, 40);
    const plan = sim.checkWall(0, { material: 'wood', points: [5, 30.5, 44, 30.5], towers: [5, 30.5], gates: [24, 30.5] });
    expect(plan.ok).toBe(true);
    const kinds = plan.pieces.map((p) => p.type);
    expect(kinds.filter((k) => k === 'woodTower')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'woodGate')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'palisade').length).toBeGreaterThanOrEqual(9);
    for (const p of plan.pieces) if (p.type === 'palisade') expect(p.tiles.length / 2).toBeLessThanOrEqual(4);
    expect(sim.checkWall(0, { material: 'stone', points: [1, 20, 20, 20] }).reason).toBe('noBuild');
    expect(sim.checkWall(0, { material: 'stone', points: [10, 10] }).reason).toBe('short');
  });

  it('wall lines are 4-connected (no diagonal gaps)', () => {
    const t = lineTiles([0.5, 0.5, 7.5, 3.5]);
    for (let i = 2; i < t.length; i += 2) expect(Math.abs(t[i] - t[i - 2]) + Math.abs(t[i + 1] - t[i - 1])).toBe(1);
    expect(t.slice(-2)).toEqual([7, 3]);
  });
});

describe('gather and build', () => {
  it('gatherers harvest, carry and deliver to the camp', () => {
    const trees = Array.from({ length: 8 }, (_, i) => ({ id: 'pine-a', x: 30.5 + (i % 4) * 2, y: 30.5 + Math.floor(i / 4) * 2 }));
    const sim = createSim(flat(48, trees), 2);
    const s = campAt(sim, 20, 20);
    const node = sim.resourceNodes().find((n) => n.res === 'wood' && n.x === 30.5 && n.y === 30.5)!;
    sim.order({ kind: 'gather', squad: s, node: node.id });
    let gathering = false, carrying = false;
    run(sim, 1200, () => {
      for (const u of sim.snapshot().units) {
        if (u.state === 'gather') gathering = true;
        if (u.carry === 'wood' && u.state === 'move') carrying = true;
      }
      return false;
    });
    expect(gathering).toBe(true);
    expect(carrying).toBe(true);
    expect(sim.snapshot().stock![0].wood).toBeGreaterThanOrEqual(50);
    expect(sim.resourceNodes().find((n) => n.id === node.id)!.amount).toBeLessThan(node.max);
  });

  it('more workers build faster; materials come from the stockpile', () => {
    const time = (n: number) => {
      const sim = createSim(flat(), 3);
      campAt(sim, 20, 20, 10);
      sim.addStock(0, 'wood', 60);
      const s = sim.spawnSquad('b', 0, 'militia', n, 28, 28);
      sim.order({ kind: 'placeBuilding', squad: s, type: 'storehouse', x: 27, y: 20 });
      const states = new Set<string>();
      const t = run(sim, 6000, () => {
        const b = building(sim, 1);
        states.add(b.state);
        return b.state === 'done';
      });
      expect([...states]).toEqual(['foundation', 'scaffold', 'done']);
      expect(sim.snapshot().stock![0].wood).toBeCloseTo(0, 6);
      expect(building(sim, 1).delivered).toBe(1);
      return t;
    };
    const few = time(2), many = time(12); // 12 on a storehouse: 6 work, 6 wait
    expect(many).toBeLessThan(few * 0.5);
  });

  it('no materials, no labour beyond what was delivered', () => {
    const sim = createSim(flat(), 4);
    campAt(sim, 20, 20, 10);
    const s = sim.spawnSquad('b', 0, 'militia', 6, 28, 28);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'storehouse', x: 27, y: 20 });
    run(sim, 400);
    expect(building(sim, 1)).toMatchObject({ state: 'foundation', progress: 0, delivered: 0 });
    sim.addStock(0, 'wood', 30);
    run(sim, 3000);
    const b = building(sim, 1);
    expect(b.delivered).toBeCloseTo(0.5, 6);
    expect(b.progress).toBeCloseTo(0.5, 6);
    expect(b.state).toBe('scaffold');
  });

  it('a camp projects influence once done', () => {
    const sim = createSim(flat(), 5);
    campAt(sim, 20, 20);
    const m = sim.influence();
    expect(m.mask[20 * 48 + 20] & 1).toBe(1);
    expect(m.mask[20 * 48 + 20] & 2).toBe(0);
  });

  it('a building takes damage, turns damaged, then destroyed, and frees its tiles', () => {
    const sim = createSim(flat(), 6);
    campAt(sim, 20, 20);
    const hp = building(sim, 0).maxHp;
    sim.damageBuilding(0, hp * 0.6);
    expect(building(sim, 0).state).toBe('damaged');
    sim.damageBuilding(0, hp);
    expect(building(sim, 0).state).toBe('destroyed');
    expect(sim.checkPlacement(0, 'camp', 20, 20).ok).toBe(true);
  });
});

describe('work slots', () => {
  it('workers spread round the site, one per slot; the rest wait nearby', () => {
    const sim = createSim(flat(), 21);
    sim.claim(0, 20, 20, 30);
    const s = sim.spawnSquad('a', 0, 'militia', 10, 24, 24);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 20 });
    let full = false;
    run(sim, 1500, () => {
      const snap = sim.snapshot();
      const b = snap.buildings![0];
      expect(b.maxWorkers).toBe(6);
      expect(b.workers).toBeLessThanOrEqual(6);
      const at = snap.units.filter((u) => u.state === 'build');
      expect(at.length).toBeLessThanOrEqual(6);
      if (at.length === 6) {
        full = true;
        for (let i = 0; i < at.length; i++)
          for (let j = i + 1; j < at.length; j++) expect(Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y)).toBeGreaterThan(0.9);
        // they stand all round the footprint, not on one side
        expect(at.some((u) => u.x < b.x - 1) && at.some((u) => u.x > b.x + 1)).toBe(true);
        expect(at.some((u) => u.y < b.y - 1) && at.some((u) => u.y > b.y + 1)).toBe(true);
        // the other four wait near the site, off its slots
        for (const u of snap.units.filter((u) => u.state !== 'build')) expect(Math.hypot(u.x - b.x, u.y - b.y)).toBeLessThan(9);
      }
      return b.state === 'done';
    });
    expect(full).toBe(true);
    expect(building(sim, 0).state).toBe('done');
  });

  it('slots per type are capped: camp 6, wall segment 2, tower 4, fort 20', () => {
    const sim = createSim(flat(64), 22);
    sim.claim(0, 32, 32, 40);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'camp', x: 20, y: 20 });
    sim.order({ kind: 'placeBuilding', team: 0, type: 'fort', x: 40, y: 40 });
    sim.order({ kind: 'placeWall', team: 0, material: 'wood', points: [10.5, 50.5, 30.5, 50.5], towers: [20, 50.5] });
    sim.step();
    const max = (t: string) => sim.snapshot().buildings!.filter((b) => b.type === t).map((b) => b.maxWorkers);
    expect(max('camp')).toEqual([6]);
    expect(max('fort')).toEqual([20]);
    expect(max('woodTower')).toEqual([4]);
    expect(new Set(max('palisade'))).toEqual(new Set([2]));
    for (const b of sim.snapshot().buildings!) expect(b.workers).toBe(0);
  });
});

describe('planned sites, resume and cancel', () => {
  it('a site at any state blocks placement over it (camp site under a fort)', () => {
    const sim = createSim(flat(), 23);
    sim.claim(0, 24, 24, 40);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'camp', x: 20, y: 20 });
    sim.step();
    expect(building(sim, 0).state).toBe('foundation');
    expect(sim.checkPlacement(0, 'fort', 22, 22)).toMatchObject({ ok: false, reason: 'overlap' });
    sim.order({ kind: 'placeBuilding', team: 0, type: 'fort', x: 22, y: 22 });
    sim.order({ kind: 'placeWall', team: 0, material: 'stone', points: [15.5, 20.5, 25.5, 20.5] });
    sim.step();
    expect(sim.snapshot().buildings).toHaveLength(1);
    // walls and gates too
    sim.order({ kind: 'placeWall', team: 0, material: 'wood', points: [10.5, 30.5, 30.5, 30.5], gates: [20, 30.5] });
    sim.step();
    expect(sim.checkPlacement(0, 'camp', 20, 31).reason).toBe('overlap');
    expect(sim.checkPlacement(0, 'camp', 14, 30).reason).toBe('overlap');
  });

  it('a planned site waits for workers; a build order takes it up; stopWork and build again resume it', () => {
    const sim = createSim(flat(), 24);
    campAt(sim, 20, 20, 6);
    sim.addStock(0, 'wood', 60);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 27, y: 20 });
    run(sim, 200);
    expect(building(sim, 1)).toMatchObject({ state: 'foundation', progress: 0, delivered: 0, workers: 0 });
    const s = sim.spawnSquad('b', 0, 'militia', 6, 28, 28);
    sim.order({ kind: 'build', squad: s, site: 1 });
    run(sim, 3000, () => building(sim, 1).progress > 0.3);
    expect(building(sim, 1).state).toBe('scaffold');
    sim.order({ kind: 'stopWork', squad: s });
    run(sim, 2);
    const p = building(sim, 1).progress;
    expect(sim.snapshot().squads[s].order).toBe('hold');
    run(sim, 300);
    expect(building(sim, 1)).toMatchObject({ state: 'scaffold', progress: p, workers: 0 });
    expect(sim.snapshot().units.filter((u) => u.squad === s).every((u) => u.state !== 'build')).toBe(true);
    // another squad may finish it
    sim.order({ kind: 'build', squad: 0, site: 1 });
    run(sim, 6000, () => building(sim, 1).state === 'done');
    expect(building(sim, 1).state).toBe('done');
    // a finished or foreign site takes no build order
    sim.order({ kind: 'build', squad: s, site: 1 });
    run(sim, 1);
    expect(sim.snapshot().squads[s].order).toBe('hold');
  });

  it('cancelSite removes the site, refunds loads on the way in full and delivered materials at 75%', () => {
    const sim = createSim(flat(), 25);
    campAt(sim, 20, 20, 6);
    sim.addStock(0, 'wood', 60);
    const s = sim.spawnSquad('b', 0, 'militia', 6, 28, 28);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'storehouse', x: 27, y: 20 });
    // cancel while some wood is delivered and some still on the way
    run(sim, 3000, () => building(sim, 1).delivered > 0.2 && sim.snapshot().units.some((u) => u.squad === s && u.carry === 'wood'));
    const del = building(sim, 1).delivered * 60;
    expect(del).toBeGreaterThan(0);
    sim.order({ kind: 'cancelSite', site: 1 });
    run(sim, 1);
    expect(sim.snapshot().buildings!.map((b) => b.id)).toEqual([0]);
    expect(sim.snapshot().stock![0].wood).toBeCloseTo(60 - 0.25 * del, 6);
    expect(sim.snapshot().units.some((u) => u.squad === s && u.carry)).toBe(false);
    expect(sim.checkPlacement(0, 'storehouse', 27, 20).ok).toBe(true);
    run(sim, 300);
    expect(sim.snapshot().stock![0].wood).toBeCloseTo(60 - 0.25 * del, 6); // nothing counted twice
    expect(sim.snapshot().units.filter((u) => u.squad === s).every((u) => u.state !== 'build')).toBe(true);
    // a planned site with nothing delivered: all back (nothing left the stockpile), its scaffold tiles open again
    sim.order({ kind: 'placeBuilding', team: 0, type: 'outpost', x: 30, y: 30 });
    sim.step();
    const id = sim.snapshot().buildings!.at(-1)!.id;
    sim.order({ kind: 'cancelSite', site: id });
    sim.step();
    expect(sim.snapshot().buildings!.some((b) => b.id === id)).toBe(false);
    // a finished building cannot be cancelled
    sim.order({ kind: 'cancelSite', site: 0 });
    sim.step();
    expect(building(sim, 0).state).toBe('done');
  });
});

describe('squad split and merge', () => {
  it('detach makes a new squad of the same owner and team; merge joins them again', () => {
    const sim = createSim(flat(), 26);
    const a = sim.spawnSquad('p', 0, 'militia', 10, 20, 20);
    const b = sim.spawnSquad('q', 1, 'militia', 8, 40, 40);
    sim.order({ kind: 'detach', squad: a, count: 4 });
    sim.step();
    let snap = sim.snapshot();
    expect(snap.squads).toHaveLength(3);
    const c = snap.squads[2];
    expect(c).toMatchObject({ id: 2, owner: 'p', team: 0, order: 'hold' });
    expect(c.units).toHaveLength(4);
    expect(snap.squads[a].units).toHaveLength(6);
    for (const id of c.units) expect(snap.units[id].squad).toBe(2);
    // M5a: into two detachments of DETACH_MIN or more, no further: a split squad and its detachment stay as they are
    sim.order({ kind: 'detach', squad: a, count: 2 });
    sim.order({ kind: 'detach', squad: c.id, count: 4 });
    sim.order({ kind: 'detach', squad: b, count: 3 }); // too few to go
    sim.step();
    expect(sim.snapshot().squads).toHaveLength(3);
    // by unit ids (unknown ids ignored)
    sim.order({ kind: 'detach', squad: b, unitIds: [...snap.squads[b].units.slice(0, 4), 999] });
    sim.step();
    snap = sim.snapshot();
    expect(snap.squads[3]).toMatchObject({ owner: 'q', team: 1 });
    expect(snap.squads[3].units).toHaveLength(4);
    expect(snap.squads[b].units).toHaveLength(4);
    // merge: only same owner and team, and at most SQUAD_MAX men
    const d = sim.spawnSquad('p', 0, 'militia', 12, 30, 20);
    sim.order({ kind: 'merge', squad: 3, into: a });
    sim.order({ kind: 'merge', squad: d, into: a });
    sim.order({ kind: 'merge', squad: c.id, into: a });
    sim.step();
    snap = sim.snapshot();
    expect(snap.squads[a].units).toHaveLength(10);
    expect(snap.squads[c.id].units).toHaveLength(0);
    expect(snap.squads[3].units).toHaveLength(4);
    expect(snap.squads[d].units).toHaveLength(12);
    // whole again, it may split again
    sim.order({ kind: 'detach', squad: a, count: 5 });
    sim.step();
    expect(sim.snapshot().squads.at(-1)!.units).toHaveLength(5);
    sim.order({ kind: 'merge', squad: sim.snapshot().squads.length - 1, into: a });
    // the merged squad moves as one
    sim.order({ kind: 'move', squad: a, x: 30, y: 20 });
    run(sim, 300);
    for (const id of sim.snapshot().squads[a].units) expect(Math.hypot(sim.snapshot().units[id].x - 30, sim.snapshot().units[id].y - 20)).toBeLessThan(5);
  });

  it('part of an army detaches to build while the rest holds; merging into a building squad puts them to work', () => {
    const sim = createSim(flat(), 27);
    sim.claim(0, 20, 20, 30);
    const army = sim.spawnSquad('p', 0, 'militia', 12, 26, 26);
    sim.order({ kind: 'detach', squad: army, count: 4 });
    sim.step();
    const crew = 1;
    sim.order({ kind: 'placeBuilding', squad: crew, type: 'camp', x: 20, y: 20 });
    run(sim, 200);
    let snap = sim.snapshot();
    expect(snap.squads[army].order).toBe('hold');
    expect(snap.buildings![0].workers).toBe(4);
    const more = sim.spawnSquad('p', 0, 'militia', 4, 28, 26);
    sim.order({ kind: 'merge', squad: more, into: crew });
    run(sim, 300);
    snap = sim.snapshot();
    expect(snap.squads[crew].units).toHaveLength(8);
    expect(snap.buildings![0].workers).toBe(6); // a camp takes 6 at once
  });
});

describe('determinism (slots, planned sites, split)', () => {
  it('the same orders give the same snapshot', () => {
    const go = () => {
      const sim = createSim(flat(), 28);
      campAt(sim, 20, 20, 10);
      sim.addStock(0, 'wood', 200);
      sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 27, y: 20 });
      sim.order({ kind: 'placeWall', team: 0, material: 'wood', points: [10.5, 30.5, 30.5, 30.5] });
      sim.order({ kind: 'detach', squad: 0, count: 4 });
      sim.step();
      sim.order({ kind: 'build', squad: 1, site: 1 });
      sim.order({ kind: 'build', squad: 0, site: 2 });
      run(sim, 600);
      sim.order({ kind: 'cancelSite', site: 1 });
      run(sim, 600);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});

describe('walls and gates', () => {
  /** A palisade right across a 24-wide map at y = 12 (a gate in the middle if asked), built by team 0. */
  function walled(gate: boolean) {
    const n = 24;
    const r: RegionData = { id: 'w', name: 'w', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [] };
    const sim = createSim(r, 9);
    sim.claim(0, 12, 12, 40);
    sim.addStock(0, 'wood', 400);
    const s = sim.spawnSquad('a', 0, 'militia', 20, 12, 18);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 12, y: 20 }); // 4 x 4: tiles y 18..21, clear of the wall's work ring
    run(sim, 1000, () => building(sim, 0).state === 'done');
    sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [0.5, 12.5, 23.5, 12.5], ...(gate ? { gates: [12, 12.5] } : {}) });
    run(sim, 6000, () => sim.snapshot().buildings!.every((b) => b.state === 'done'));
    expect(sim.snapshot().buildings!.every((b) => b.state === 'done')).toBe(true);
    sim.order({ kind: 'move', squad: s, x: 3, y: 21 }); // out of the way
    run(sim, 200);
    return sim;
  }
  const crosses = (sim: WarBuildSim, team: number) => {
    const s = sim.spawnSquad(`m${team}`, team, 'militia', 4, 12, 20);
    sim.order({ kind: 'move', squad: s, x: 12, y: 4 });
    run(sim, 400);
    return sim.snapshot().units.filter((u) => u.squad === s).every((u) => u.y < 12);
  };

  it('a finished wall blocks pathing', () => {
    expect(crosses(walled(false), 0)).toBe(false);
  });

  it('a gate lets its owner through and holds the enemy', () => {
    expect(crosses(walled(true), 0)).toBe(true);
    const sim = walled(true);
    expect(crosses(sim, 1)).toBe(false);
    for (const u of sim.snapshot().units) expect(u.y > 12.99 || u.y < 12 || u.squad === 0).toBe(true);
  });
});

describe('sector updates', () => {
  it('match a full rebuild after tiles close and open', () => {
    const r = flat(64);
    const g = buildGrid(r);
    const changed: number[] = [];
    for (let k = 0; k < 400; k++) {
      const x = (k * 37) % 64, y = (k * 53 + 7) % 64;
      g.cost[y * 64 + x] = 0;
      changed.push(x, y);
    }
    for (let x = 0; x < 63; x++) (g.cost[32 * 64 + x] = 0), changed.push(x, 32); // a wall with one gap
    updateSectors(g, changed);
    const full = buildGrid({ ...r });
    full.cost.set(g.cost);
    updateSectors(full, Array.from({ length: 64 * 64 * 2 }, (_, i) => (i % 2 ? Math.floor(i / 128) : (i >> 1) % 64)));
    for (let k = 0; k < 60; k++) {
      const a = ((k * 911) % 4096), b = ((k * 577 + 1999) % 4096);
      if (g.cost[a] === 0 || g.cost[b] === 0) continue;
      const p = findPath(g, a, b), q = findPath(full, a, b);
      expect([k, p.at(-1) === b]).toEqual([k, q.at(-1) === b]);
    }
  });
});

describe('determinism', () => {
  it('the same seed and orders give the same economy', () => {
    const go = () => {
      const trees = Array.from({ length: 6 }, (_, i) => ({ id: 'oak', x: 32.5 + i * 2, y: 30.5 }));
      const sim = createSim(flat(48, trees), 11);
      const s = campAt(sim, 20, 20);
      sim.order({ kind: 'gather', squad: s, node: sim.resourceNodes().find((n) => n.x === 32.5)!.id });
      const b = sim.spawnSquad('b', 0, 'militia', 8, 24, 30);
      sim.order({ kind: 'placeBuilding', squad: b, type: 'farm', x: 26, y: 28 });
      run(sim, 1500);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});
