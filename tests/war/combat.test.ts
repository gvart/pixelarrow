import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import type { Shape } from '../../src/war/sim/formation';
import type { WarSim } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);
const K = ridge.w / 256; // features are authored on a 256 map and scale with it
const [FX, FY] = SPOTS.fieldE; // open flat field east of the river
const H = (x: number, y: number) => ridge.height[Math.floor(y) * ridge.w + Math.floor(x)];

type Side = { cls: string; n: number; x: number; y: number; shape?: Shape };

const alive = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad && u.state !== 'dead').length;

/** Squad `att` attacks squad `def`, which holds; runs until one side is down. Returns survivors. */
function battle(seed: number, def: Side, att: Side, ticks = 3000) {
  const sim = createSim(ridge, seed);
  const d = sim.spawnSquad('d', 0, def.cls, def.n, def.x, def.y);
  const a = sim.spawnSquad('a', 1, att.cls, att.n, att.x, att.y);
  if (def.shape) sim.order({ kind: 'formation', squad: d, shape: def.shape });
  if (att.shape) sim.order({ kind: 'formation', squad: a, shape: att.shape });
  sim.order({ kind: 'attack', squad: a, target: d });
  for (let t = 0; t < ticks && alive(sim, d) && alive(sim, a); t++) sim.step();
  return { def: alive(sim, d), att: alive(sim, a), sim };
}

const SEEDS = [1, 2, 3];

describe('class stats', () => {
  it('come from the battle game data: archers shoot, militia close in, hoplites are armoured and slow', () => {
    const militia = warStats('militia');
    const archer = warStats('archer');
    const hoplite = warStats('hoplite');
    expect(archer.range).toBeGreaterThan(10);
    expect(archer.ammo).toBeGreaterThan(0);
    expect(militia.range).toBe(0);
    expect(hoplite.armor).toBeGreaterThan(militia.armor);
    expect(hoplite.speed).toBeLessThan(militia.speed);
    expect(warStats('companion').speed).toBeGreaterThan(1.4);
    expect(warStats('no-such-class')).toEqual(militia);
  });
});

describe('combat', () => {
  /** The first point walking from `a` toward `b` where `stop` holds, and the unit direction. */
  const walk = (a: readonly [number, number], b: readonly [number, number], stop: (x: number, y: number) => boolean) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let t = 0;
    while (t < L && !stop(a[0] + ux * t, a[1] + uy * t)) t += 0.5;
    return { x: a[0] + ux * t, y: a[1] + uy * t, ux, uy };
  };
  // the brow: where the flat crest ends and the gentle side starts down (the ridge top is wide at real scale)
  const brow = walk(SPOTS.ridgeCrest, SPOTS.ridgeFoot, (x, y) => H(x, y) < 5);

  it('equal squads: the side holding high ground wins clearly', () => {
    const { x: cx, y: cy, ux, uy } = brow;
    const [fx, fy] = [cx + ux * 22, cy + uy * 22]; // 22 tiles down the gentle side
    expect(H(cx, cy)).toBe(4);
    expect(H(fx, fy)).toBe(1);
    for (const seed of SEEDS) {
      const r = battle(seed, { cls: 'militia', n: 12, x: cx, y: cy }, { cls: 'militia', n: 12, x: fx, y: fy });
      expect(r.att).toBe(0);
      expect(r.def).toBeGreaterThanOrEqual(6);
    }
  });

  it('archers on the plateau beat melee climbing at them, but lose the same fight on the flat', () => {
    for (const seed of SEEDS) {
      const hill = battle(seed, { cls: 'archer', n: 12, x: brow.x + brow.ux, y: brow.y + brow.uy }, { cls: 'militia', n: 8, x: SPOTS.ridgeFoot[0], y: SPOTS.ridgeFoot[1] });
      expect(hill.att).toBe(0);
      expect(hill.def).toBeGreaterThanOrEqual(2); // W-55: the climbers walk a straight line up (fewer volleys before they close)
      const flat = battle(seed, { cls: 'archer', n: 12, x: FX, y: FY - 12 }, { cls: 'militia', n: 8, x: FX, y: FY + 12 });
      expect(flat.def).toBe(0);
    }
  });

  it('a squad fighting from a ford does much worse than on dry ground', () => {
    for (const seed of SEEDS) {
      // defenders in the ford 4 tiles short of the east bank, attackers 16 tiles off on dry ground; and on the flat 12 off
      const bank = walk(SPOTS.ford, SPOTS.fordE, (x, y) => ridge.water[Math.floor(y) * ridge.w + Math.floor(x)] === 0);
      const [ox, oy] = [bank.x - bank.ux * 4, bank.y - bank.uy * 4];
      const [ex, ey] = [ox + bank.ux * 16, oy + bank.uy * 16];
      const ford = battle(seed, { cls: 'militia', n: 10, x: ox, y: oy, shape: 'column' }, { cls: 'militia', n: 10, x: ex, y: ey, shape: 'column' });
      const dry = battle(seed, { cls: 'militia', n: 10, x: FX, y: FY, shape: 'column' }, { cls: 'militia', n: 10, x: FX + 12, y: FY, shape: 'column' });
      expect(ford.def).toBe(0);
      expect(ford.att).toBeGreaterThanOrEqual(dry.att + 2);
    }
  });

  it('forest gives cover from missiles', () => {
    const volley = (tx: number, ty: number) => {
      const sim = createSim(ridge, 4);
      const t = sim.spawnSquad('t', 0, 'militia', 20, tx, ty);
      sim.spawnSquad('a', 1, 'archer', 20, tx + 13, ty);
      for (let k = 0; k < 250; k++) sim.step();
      return sim.snapshot().units.filter((u) => u.squad === t).reduce((a, u) => a + u.maxHp - u.hp, 0);
    };
    const [wx, wy] = SPOTS.forest;
    expect(ridge.terrain[Math.floor(wy) * ridge.w + Math.floor(wx)]).toBe('forest');
    const inForest = volley(wx, wy);
    const inOpen = volley(FX, FY);
    expect(inOpen).toBeGreaterThan(0);
    expect(inForest).toBeLessThan(inOpen * 0.75);
  });

  it('the fallen are dead, mostly wounded, some killed, and leave the collision', () => {
    let fallen = 0, wounded = 0, killed = 0;
    for (const seed of [9, 10, 11]) {
      const sim = createSim(ridge, seed);
      const a = sim.spawnSquad('a', 0, 'militia', 12, FX - 10, FY);
      const b = sim.spawnSquad('b', 1, 'militia', 12, FX - 10, FY + 6);
      sim.order({ kind: 'attack', squad: a, target: b });
      sim.order({ kind: 'attack', squad: b, target: a });
      let shots = 0;
      for (let t = 0; t < 2000 && alive(sim, a) && alive(sim, b); t++) {
        sim.step();
        shots += sim.snapshot().shots?.length ?? 0;
      }
      expect(shots).toBe(0); // militia carry no missiles
      const dead = sim.snapshot().units.filter((u) => u.state === 'dead');
      expect(dead.length).toBeGreaterThanOrEqual(12);
      fallen += dead.length;
      wounded += dead.filter((u) => u.wounded).length;
      killed += dead.filter((u) => u.wounded === false).length;
      for (const u of dead) expect(u.hp).toBe(0);
      for (const u of sim.snapshot().units.filter((x) => x.state !== 'dead')) expect(u.wounded).toBeUndefined();
      expect(sim.stats().units).toBe(24 - dead.length);
    }
    expect(wounded / fallen).toBeGreaterThan(0.5);
    expect(killed).toBeGreaterThan(0);
  });

  it('missiles fly: shots show in the snapshot until they land', () => {
    const sim = createSim(ridge, 5);
    sim.spawnSquad('t', 0, 'militia', 10, FX, FY);
    sim.spawnSquad('a', 1, 'archer', 10, FX, FY + 12);
    let seen = 0;
    for (let k = 0; k < 60; k++) {
      sim.step();
      const snap = sim.snapshot();
      for (const s of snap.shots ?? []) {
        expect(s.t1).toBeGreaterThan(s.t0);
        expect(s.t1).toBeGreaterThanOrEqual(snap.tick);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('holding units fight what comes into reach, marching units do not', () => {
    const sim = createSim(ridge, 6);
    const hold = sim.spawnSquad('h', 0, 'militia', 10, FX, FY);
    const march = sim.spawnSquad('m', 1, 'militia', 10, FX, FY + 8);
    sim.order({ kind: 'move', squad: march, x: FX, y: FY - 15 }); // straight through the holders
    let marchHit = false;
    for (let k = 0; k < 120; k++) {
      sim.step();
      for (const u of sim.snapshot().units) if (u.squad === march && u.state === 'attack') marchHit = true;
    }
    expect(marchHit).toBe(false);
    expect(sim.snapshot().units.some((u) => u.squad === march && u.hp < u.maxHp)).toBe(true);
    expect(alive(sim, hold)).toBe(10);
  });
});

describe('head-on jams', () => {
  const cases = [
    ['pass', SPOTS.passN, SPOTS.passSaddle, 'line'],
    ['ford', SPOTS.fordW, SPOTS.fordE, 'wedge'],
    ['ford', SPOTS.fordW, SPOTS.fordE, 'loose'],
    ['bridge', SPOTS.bridgeW, SPOTS.bridgeE, 'line'],
  ] as const;
  it.each(cases)('two friendly squads meeting head-on at the %s (%s) pass each other within 450 ticks per 256 tiles of map', (_, p0, p1, shape) => {
    const sim = createSim(ridge, 4);
    const a = sim.spawnSquad('a', 0, 'militia', 20, p0[0], p0[1]);
    const b = sim.spawnSquad('b', 0, 'militia', 20, p1[0], p1[1]);
    for (const s of [a, b]) sim.order({ kind: 'formation', squad: s, shape });
    sim.order({ kind: 'move', squad: a, x: p1[0], y: p1[1] });
    sim.order({ kind: 'move', squad: b, x: p0[0], y: p0[1] });
    let done = -1;
    for (let t = 0; t < 450 * K && done < 0; t++) {
      sim.step();
      const ok = sim.snapshot().units.every((u) => {
        const g = u.squad === a ? p1 : p0;
        return Math.hypot(u.x - g[0], u.y - g[1]) < 13;
      });
      if (ok) done = t;
    }
    expect(done).toBeGreaterThan(0);
  });
});

describe('reach and attack state', () => {
  // the plateau's cliff edge: walk south from the top until the ground drops (5 -> 1, no ramp there)
  const [px, py] = SPOTS.plateauTop;
  let ey = py;
  while (H(px, ey + 1) === H(px, py)) ey++;
  const top: [number, number] = [px, Math.floor(ey) + 0.5];
  const foot: [number, number] = [px, Math.floor(ey) + 1.5];
  const reach = warStats('militia').reach + 0.3;

  /** Every unit shown attacking is in reach of a living foe it could hit (melee: at most 1 level apart). */
  const checkAttackers = (sim: WarSim) => {
    const snap = sim.snapshot();
    const team = (u: { squad: number }) => snap.squads[u.squad].team;
    for (const u of snap.units) {
      if (u.state !== 'attack') continue;
      const near = snap.units.some(
        (o) =>
          (o.state !== 'dead' || u.swing === 0) && // a foe felled by this very blow still counts
          team(o) !== team(u) && Math.hypot(o.x - u.x, o.y - u.y) <= reach + 0.2 && Math.abs(H(o.x, o.y) - H(u.x, u.y)) <= 1,
      );
      expect(near).toBe(true);
      expect(u.ready).toBeGreaterThanOrEqual(0);
    }
    return snap;
  };

  it('a melee pair split by a cliff never trade blows while holding', () => {
    expect(H(...top) - H(...foot)).toBeGreaterThanOrEqual(2);
    const sim = createSim(ridge, 3);
    sim.spawnSquad('t', 0, 'militia', 1, ...top);
    sim.spawnSquad('f', 1, 'militia', 1, ...foot);
    for (let k = 0; k < 300; k++) {
      sim.step();
      for (const u of sim.snapshot().units) {
        expect(u.hp).toBe(u.maxHp);
        expect(u.state).not.toBe('attack');
      }
    }
  });

  it('attackers under a cliff go round by the ramp, then fight on the top', () => {
    const play = (seed: number) => {
      const sim = createSim(ridge, seed);
      const d = sim.spawnSquad('t', 0, 'militia', 3, ...top);
      const a = sim.spawnSquad('f', 1, 'militia', 3, ...foot);
      sim.order({ kind: 'attack', squad: a, target: d });
      let hitAt = -1;
      for (let k = 0; k < 4000 && hitAt < 0; k++) {
        sim.step();
        const snap = checkAttackers(sim);
        if (snap.units.some((u) => u.squad === d && u.hp < u.maxHp)) {
          hitAt = k;
          // the blow came from an attacker up on the plateau
          expect(snap.units.some((u) => u.squad === a && u.state === 'attack' && H(u.x, u.y) >= H(...top) - 1)).toBe(true);
        }
      }
      expect(hitAt).toBeGreaterThan(100); // not across the cliff on arrival: they had to walk round
      return JSON.stringify(sim.snapshot());
    };
    expect(play(7)).toBe(play(7)); // deterministic
  });

  it('closing in shows move, attack only in reach, and a swing per blow', () => {
    const sim = createSim(ridge, 8);
    const a = sim.spawnSquad('a', 0, 'militia', 10, FX, FY - 5);
    const b = sim.spawnSquad('b', 1, 'militia', 10, FX, FY + 5);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    let movers = 0;
    let swings = 0;
    for (let k = 0; k < 400; k++) {
      sim.step();
      const snap = checkAttackers(sim);
      for (const u of snap.units) {
        if (k < 5 && u.state !== 'dead') {
          expect(u.state).not.toBe('attack'); // 10 tiles apart, closing
          if (u.state === 'move') movers++;
        }
        if (u.state === 'attack' && u.swing === 0) swings++;
        if (u.state !== 'attack') expect(u.swing).toBeUndefined();
      }
    }
    expect(movers).toBeGreaterThan(10);
    expect(swings).toBeGreaterThan(10);
  });

  it('shots carry heights, the shooter and the missile kind', () => {
    const kinds = new Set<string>();
    for (const cls of ['archer', 'slinger', 'javelineer']) {
      const sim = createSim(ridge, 5);
      sim.spawnSquad('t', 0, 'militia', 10, FX, FY);
      const a = sim.spawnSquad('a', 1, cls, 10, FX, FY + 8);
      for (let k = 0; k < 60; k++) {
        sim.step();
        const snap = sim.snapshot();
        for (const s of snap.shots ?? []) {
          expect(snap.units[s.by].squad).toBe(a);
          expect(s.z0).toBe(H(s.x0, s.y0));
          expect(s.z1).toBe(H(s.x1, s.y1));
          kinds.add(s.kind);
        }
      }
    }
    expect([...kinds].sort()).toEqual(['arrow', 'javelin', 'stone']);
  });
});
