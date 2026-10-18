import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import type { Shape } from '../../src/war/sim/formation';
import type { WarSim } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);
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
  it('equal squads: the side holding high ground wins clearly', () => {
    const [cx, cy] = SPOTS.ridgeCrest;
    const k = 22 / 26; // 22 tiles down the gentle side (ridgeFoot is 26)
    const [fx, fy] = [cx + (SPOTS.ridgeFoot[0] - cx) * k, cy + (SPOTS.ridgeFoot[1] - cy) * k];
    expect(H(cx, cy)).toBe(5);
    expect(H(fx, fy)).toBe(1);
    for (const seed of SEEDS) {
      const r = battle(seed, { cls: 'militia', n: 20, x: cx, y: cy }, { cls: 'militia', n: 20, x: fx, y: fy });
      expect(r.att).toBe(0);
      expect(r.def).toBeGreaterThanOrEqual(10);
    }
  });

  it('archers on the plateau beat melee climbing at them, but lose the same fight on the flat', () => {
    for (const seed of SEEDS) {
      const hill = battle(seed, { cls: 'archer', n: 20, x: SPOTS.ridgeCrest[0], y: SPOTS.ridgeCrest[1] }, { cls: 'militia', n: 14, x: SPOTS.ridgeFoot[0], y: SPOTS.ridgeFoot[1] });
      expect(hill.att).toBe(0);
      expect(hill.def).toBeGreaterThanOrEqual(8);
      const flat = battle(seed, { cls: 'archer', n: 20, x: FX, y: FY - 12 }, { cls: 'militia', n: 14, x: FX, y: FY + 12 });
      expect(flat.def).toBe(0);
    }
  });

  it('a squad fighting from a ford does much worse than on dry ground', () => {
    for (const seed of SEEDS) {
      // attackers 12 tiles off: on the east bank beyond fordE (10 off), and on the flat
      const [ox, oy] = SPOTS.ford;
      const [ex, ey] = [ox + (SPOTS.fordE[0] - ox) * 1.2, oy + (SPOTS.fordE[1] - oy) * 1.2];
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
    expect(ridge.terrain[wy * ridge.w + wx]).toBe('forest');
    const inForest = volley(wx, wy);
    const inOpen = volley(FX, FY);
    expect(inOpen).toBeGreaterThan(0);
    expect(inForest).toBeLessThan(inOpen * 0.75);
  });

  it('the fallen are dead, mostly wounded, some killed, and leave the collision', () => {
    const sim = createSim(ridge, 9);
    const a = sim.spawnSquad('a', 0, 'militia', 20, FX - 10, FY);
    const b = sim.spawnSquad('b', 1, 'militia', 20, FX - 10, FY + 6);
    sim.order({ kind: 'attack', squad: a, target: b });
    sim.order({ kind: 'attack', squad: b, target: a });
    let shots = 0;
    for (let t = 0; t < 2000 && alive(sim, a) && alive(sim, b); t++) {
      sim.step();
      shots += sim.snapshot().shots?.length ?? 0;
    }
    expect(shots).toBe(0); // militia carry no missiles
    const dead = sim.snapshot().units.filter((u) => u.state === 'dead');
    expect(dead.length).toBeGreaterThanOrEqual(20);
    const wounded = dead.filter((u) => u.wounded).length;
    expect(wounded / dead.length).toBeGreaterThan(0.5);
    expect(dead.some((u) => u.wounded === false)).toBe(true);
    for (const u of dead) expect(u.hp).toBe(0);
    for (const u of sim.snapshot().units.filter((x) => x.state !== 'dead')) expect(u.wounded).toBeUndefined();
    expect(sim.stats().units).toBe(40 - dead.length);
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
  it.each(cases)('two friendly squads meeting head-on at the %s (%s) pass each other within 450 ticks', (_, p0, p1, shape) => {
    const sim = createSim(ridge, 4);
    const a = sim.spawnSquad('a', 0, 'militia', 20, p0[0], p0[1]);
    const b = sim.spawnSquad('b', 0, 'militia', 20, p1[0], p1[1]);
    for (const s of [a, b]) sim.order({ kind: 'formation', squad: s, shape });
    sim.order({ kind: 'move', squad: a, x: p1[0], y: p1[1] });
    sim.order({ kind: 'move', squad: b, x: p0[0], y: p0[1] });
    let done = -1;
    for (let t = 0; t < 450 && done < 0; t++) {
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
