import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { CLAIM, MOB_TEAM, MOBS, RESPAWN } from '../../src/war/sim/mobs';
import type { RegionData, WarBuildSim } from '../../src/war/types';

/** Flat grass n x n with the given lairs and claim points; oaks at (24.5, 20.5) and (60.5, 60.5). */
function flat(lairs: RegionData['lairs'], claimPoints: RegionData['claimPoints'] = [], n = 96): RegionData {
  return {
    id: 't', name: 't', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: [], noBuild: [], objects: [{ id: 'oak', x: 24.5, y: 20.5 }, { id: 'oak', x: 80.5, y: 80.5 }], lairs, claimPoints,
  };
}

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}

const lair = (sim: WarBuildSim, i = 0) => sim.snapshot().lairs![i];
const claim = (sim: WarBuildSim, i = 0) => sim.snapshot().claims![i];
const mobsAt = (sim: WarBuildSim, i = 0) => {
  const s = sim.snapshot(), l = s.lairs![i], q = s.squads[l.squad];
  return s.units.filter((u) => q.units.includes(u.id) && u.state !== 'dead');
};

/** A strong squad clears lair i; returns its squad id. */
function clear(sim: WarBuildSim, i = 0, team = 0): number {
  const l = lair(sim, i);
  const s = sim.spawnSquad('you', team, 'hoplite', 20, l.x + 9, l.y);
  sim.order({ kind: 'attack', squad: s, target: l.squad });
  run(sim, 3000, () => lair(sim, i).state === 'cleared');
  expect(lair(sim, i).state).toBe('cleared');
  return s;
}

describe('mobs', () => {
  it('mob classes scale their base class: wolves fast and weak, bears tanky and heavy, boars knock back', () => {
    const militia = warStats('militia');
    expect(warStats('mob_wolf').speed).toBeGreaterThan(militia.speed);
    expect(warStats('mob_wolf').maxHp).toBeLessThan(militia.maxHp);
    expect(warStats('mob_bear').maxHp).toBeGreaterThan(militia.maxHp * 3);
    expect(warStats('mob_bear').dmg).toBeGreaterThan(militia.dmg * 2);
    expect(warStats('mob_boar').knock).toBeGreaterThan(0);
    expect(warStats('mob_wolf').range).toBe(0);
    expect(MOBS.ibex.passive).toBe(true);
  });

  it('a lair spawns its pack only on spawnMobs, as team MOB_TEAM, idling round the lair', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }]), 1);
    expect(sim.snapshot().squads).toHaveLength(0);
    sim.spawnMobs();
    sim.spawnMobs(); // once
    const s = sim.snapshot();
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0].team).toBe(MOB_TEAM);
    expect(s.units.every((u) => u.cls === 'mob_wolf')).toBe(true);
    expect(s.units).toHaveLength(MOBS.wolf.count);
    run(sim, 400);
    for (const u of mobsAt(sim)) expect(Math.hypot(u.x - 20.5, u.y - 20.5)).toBeLessThan(10);
  });

  it('aggros on a unit in range, chases to the leash, then returns home and regenerates', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }]), 2);
    sim.spawnMobs();
    const horse = sim.spawnSquad('you', 0, 'thessalian', 10, 30.5, 20.5);
    run(sim, 60, () => lair(sim).state === 'chase');
    expect(lair(sim).state).toBe('chase');
    sim.order({ kind: 'move', squad: horse, x: 90, y: 90 }); // run off, far past the leash
    run(sim, 600, () => lair(sim).state === 'return');
    expect(lair(sim).state).toBe('return');
    const hurt = mobsAt(sim).reduce((a, u) => a + u.maxHp - u.hp, 0);
    run(sim, 600, () => lair(sim).state === 'home');
    expect(lair(sim).state).toBe('home');
    const c = mobsAt(sim);
    const cx = c.reduce((a, u) => a + u.x, 0) / c.length, cy = c.reduce((a, u) => a + u.y, 0) / c.length;
    expect(Math.hypot(cx - 20.5, cy - 20.5)).toBeLessThan(6);
    expect(c.reduce((a, u) => a + u.maxHp - u.hp, 0)).toBeLessThanOrEqual(hurt);
    // and the squad that ran is far off
    const me = sim.snapshot().units.filter((u) => sim.snapshot().squads[horse].units.includes(u.id) && u.state !== 'dead');
    expect(me.length).toBeGreaterThan(0);
  });

  it('packs aggro together: a wolf lair nearby joins the fight', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }, { kind: 'wolf', x: 20.5, y: 34.5 }, { kind: 'bear', x: 20.5, y: 8.5 }]), 3);
    sim.spawnMobs();
    sim.spawnSquad('you', 0, 'hoplite', 20, 30.5, 18.5); // near the first wolves only
    run(sim, 60, () => lair(sim, 0).state === 'chase');
    expect(lair(sim, 0).state).toBe('chase');
    expect(lair(sim, 1).state).toBe('chase'); // same kind, within ASSIST
    expect(lair(sim, 2).state).toBe('home'); // bears keep to themselves (out of their aggro)
  });

  it('passive herds flee instead of fighting', () => {
    const sim = createSim(flat([{ kind: 'ibex', x: 40.5, y: 40.5 }]), 4);
    sim.spawnMobs();
    sim.spawnSquad('you', 0, 'militia', 10, 48.5, 40.5);
    run(sim, 60, () => lair(sim).state === 'flee');
    expect(lair(sim).state).toBe('flee');
    run(sim, 40);
    const c = mobsAt(sim);
    expect(c.reduce((a, u) => a + u.x, 0) / c.length).toBeLessThan(40); // away from the men (east)
    expect(sim.snapshot().units.filter((u) => u.state === 'attack' && u.cls === 'mob_ibex')).toHaveLength(0);
  });

  it('gathering a node is blocked while its guard lair lives, free once it is cleared', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }]), 5);
    sim.spawnMobs();
    const oak = sim.resourceNodes().find((n) => n.x === 24.5)!;
    expect(oak.guarded).toBe(true);
    expect(sim.resourceNodes().find((n) => n.x === 80.5)!.guarded).toBeUndefined();
    const w = sim.spawnSquad('you', 0, 'militia', 4, 60.5, 60.5);
    sim.order({ kind: 'gather', squad: w, node: oak.id });
    sim.step();
    expect(sim.snapshot().squads[w].order).not.toBe('gather');
    clear(sim);
    expect(sim.resourceNodes().find((n) => n.id === oak.id)!.guarded).toBeUndefined();
    sim.order({ kind: 'gather', squad: w, node: oak.id });
    sim.step();
    expect(sim.snapshot().squads[w].order).toBe('gather');
  });

  it('claimRegion channels with a squad at the banner, is reset by foes, and grants the first influence anchor', () => {
    const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }], [{ x: 40.5, y: 40.5, lairs: [0], r: 15 }]), 6);
    sim.spawnMobs();
    expect(claim(sim).state).toBe('locked');
    const s = sim.spawnSquad('you', 0, 'militia', 10, 46.5, 46.5);
    sim.order({ kind: 'claimRegion', squad: s, point: 0 });
    sim.step();
    expect(sim.snapshot().squads[s].order).not.toBe('claimRegion'); // lairs still stand
    clear(sim);
    expect(claim(sim).state).toBe('open');
    sim.order({ kind: 'claimRegion', squad: s, point: 0 });
    run(sim, 200, () => claim(sim).progress > 0.1);
    expect(claim(sim).state).toBe('channel');
    // a foe comes near: interrupted, progress reset
    const foe = sim.spawnSquad('foe', 1, 'militia', 3, 50.5, 40.5);
    sim.order({ kind: 'hold', squad: foe });
    run(sim, 3);
    expect(claim(sim).state).toBe('contested');
    expect(claim(sim).progress).toBe(0);
    sim.order({ kind: 'move', squad: foe, x: 90, y: 5 });
    run(sim, CLAIM.ticks + 200, () => claim(sim).state === 'claimed');
    expect(claim(sim)).toMatchObject({ state: 'claimed', team: 0 });
    const inf = sim.influence();
    expect(inf.mask[40 * inf.w + 40] & 1).toBe(1);
    expect(sim.snapshot().squads[s].order).toBe('hold');
  });

  it('lairs respawn after the timer only while their area is unclaimed', () => {
    const sim = createSim(flat([{ kind: 'jackal', x: 20.5, y: 20.5 }, { kind: 'jackal', x: 70.5, y: 70.5 }], [{ x: 70.5, y: 66.5, lairs: [1] }]), 7);
    sim.spawnMobs();
    const a = clear(sim, 0), b = clear(sim, 1);
    sim.order({ kind: 'move', squad: a, x: 50, y: 50 });
    sim.order({ kind: 'claimRegion', squad: b, point: 0 });
    run(sim, CLAIM.ticks + 400, () => claim(sim).state === 'claimed');
    expect(claim(sim).state).toBe('claimed');
    sim.order({ kind: 'move', squad: b, x: 50, y: 50 });
    run(sim, RESPAWN + 200, () => lair(sim, 0).state !== 'cleared');
    expect(lair(sim, 0).state).not.toBe('cleared'); // unclaimed: back
    expect(lair(sim, 0).alive).toBe(MOBS.jackal.count);
    expect(lair(sim, 1).state).toBe('cleared'); // its zone is claimed: stays clear
  });

  it('is deterministic', () => {
    const go = () => {
      const sim = createSim(flat([{ kind: 'wolf', x: 20.5, y: 20.5 }, { kind: 'boar', x: 50.5, y: 30.5 }, { kind: 'bandit', x: 30.5, y: 60.5 }]), 9);
      sim.spawnMobs();
      const s = sim.spawnSquad('you', 0, 'hoplite', 20, 35.5, 35.5);
      sim.order({ kind: 'move', squad: s, x: 20, y: 20 });
      run(sim, 500);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });

  it('test-ridge: 6-10 lairs and a claim point, mobs within the step budget', () => {
    const ridge = parseRegion(ridgeJson);
    expect(ridge.lairs!.length).toBeGreaterThanOrEqual(6);
    expect(ridge.lairs!.length).toBeLessThanOrEqual(10);
    expect(ridge.claimPoints!.length).toBeGreaterThanOrEqual(1);
    for (const k of ['wolf', 'boar', 'bear', 'bandit', 'jackal'] as const) expect(ridge.lairs!.some((l) => l.kind === k)).toBe(true);
    const sim = createSim(ridge, 1);
    sim.spawnMobs();
    const cp = ridge.claimPoints![0];
    for (let k = 0; k < 4; k++) {
      const s = sim.spawnSquad('you', 0, k % 2 ? 'archer' : 'hoplite', 20, cp.x + k * 3, cp.y + 4);
      const l = ridge.lairs![cp.lairs[k % cp.lairs.length]];
      sim.order({ kind: 'move', squad: s, x: l.x, y: l.y });
    }
    const ms: number[] = [];
    for (let t = 0; t < 600; t++) (sim.step(), ms.push(sim.stats().stepMs));
    const avg = ms.slice(50).reduce((a, b) => a + b, 0) / (ms.length - 50);
    expect(avg).toBeLessThan(8);
  });
});
