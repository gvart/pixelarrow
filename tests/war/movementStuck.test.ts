import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { RegionData, WarSim } from '../../src/war/types';
import { flat } from './flatRegion';

// W-59 movement (docs/WAR.md "Movement"): men who stick on a wall, run back along the way, or jam at a ford or a corner.
// Each scenario walks a squad on a small hand-made map and measures every man against a walking-distance field to his
// goal (8-way, round walls and water): how far he ever turned back, how long he stood stuck, when the squad arrived.

const BLOCK = 4; // a raised block, 3 levels over the ground's 1: a cliff all round

function raise(r: RegionData, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.height[y * r.w + x] = BLOCK;
  return r;
}
function water(r: RegionData, x0: number, y0: number, x1: number, y1: number, kind: 1 | 2) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.water[y * r.w + x] = kind;
  return r;
}

/** Walking distance (tiles) from every tile to the goal tile: 8-way, no corner cutting, no cliff step, no deep water. */
function field(r: RegionData, gx: number, gy: number): Float64Array {
  const n = r.w * r.h, d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  const open = (i: number) => r.water[i] !== 2;
  const step = (a: number, b: number) => open(b) && Math.abs(r.height[a] - r.height[b]) < 2;
  const g = Math.floor(gy) * r.w + Math.floor(gx);
  d[g] = 0;
  const q: number[] = [g];
  while (q.length) {
    let bi = 0;
    for (let k = 1; k < q.length; k++) if (d[q[k]] < d[q[bi]]) bi = k;
    const c = q[bi];
    q[bi] = q[q.length - 1];
    q.pop();
    if (done[c]) continue;
    done[c] = 1;
    const cx = c % r.w, cy = (c / r.w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
        const b = y * r.w + x;
        if (!step(c, b)) continue;
        if (dx && dy && (!step(c, cy * r.w + x) || !step(c, y * r.w + cx))) continue;
        const nd = d[c] + (dx && dy ? Math.SQRT2 : 1);
        if (nd < d[b]) (d[b] = nd), q.push(b);
      }
  }
  return d;
}

interface Walk { back: number; stuck: number; t: number; worstId: number; arrived: boolean }

/**
 * Step until every man of `squads` is idle (or `ticks` run out). back: the most any man's walking distance to his goal
 * rose over the least it had been (tiles). stuck: the longest a man still far from his goal (> `near` tiles) went
 * without getting 0.15 tiles nearer it (seconds; men queueing behind a friend in a file count too).
 */
function walk(sim: WarSim, r: RegionData, goals: Map<number, Float64Array>, ticks: number, near = 3): Walk {
  const best = new Map<number, number>(), since = new Map<number, number>(), mark = new Map<number, number>();
  let back = 0, stuck = 0, worstId = -1;
  const distOf = (u: { x: number; y: number; squad: number }) => goals.get(u.squad)![Math.floor(u.y) * r.w + Math.floor(u.x)];
  for (let t = 1; t <= ticks; t++) {
    sim.step();
    const us = sim.snapshot().units.filter((u) => goals.has(u.squad));
    for (const u of us) {
      const d = distOf(u);
      const b = Math.min(best.get(u.id) ?? Infinity, d);
      best.set(u.id, b);
      if (d - b > back) (back = d - b), (worstId = u.id);
      // stuck clock: restarts each time he gets 0.15 tiles nearer his goal than the mark it last restarted at
      if (!mark.has(u.id) || d < mark.get(u.id)! - 0.15 || d <= near) mark.set(u.id, d), since.set(u.id, t);
      stuck = Math.max(stuck, (t - since.get(u.id)!) / 10);
    }
    if (us.every((u) => u.state === 'idle')) return { back, stuck, t: t / 10, worstId, arrived: true };
  }
  return { back, stuck, t: ticks / 10, worstId, arrived: false };
}

const unitsOf = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad);
const near = (sim: WarSim, squad: number, x: number, y: number, rr: number) => unitsOf(sim, squad).every((u) => Math.hypot(u.x - x, u.y - y) < rr);
/** Seconds for a militia man (1.5 tiles/s on grass) to walk the field distance from (x,y). */
const ideal = (f: Float64Array, r: RegionData, x: number, y: number) => f[Math.floor(y) * r.w + Math.floor(x)] / 1.5;

describe('W-59 movement: no sticking, no running back', () => {
  it('a squad ordered past a long wall goes through its gap', () => {
    // a wall down x 30..32 with a 3-tile gap at y 40..42; the squad starts and ends north of the gap, on either side
    const r = raise(raise(flat(64), 30, 0, 33, 40), 30, 43, 33, 64);
    const sim = createSim(r, 21);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 18, 24);
    sim.order({ kind: 'move', squad: s, x: 44, y: 24 });
    const f = field(r, 44, 24);
    const w = walk(sim, r, new Map([[s, f]]), 1200);
    expect(w.arrived).toBe(true);
    expect(near(sim, s, 44, 24, 5)).toBe(true);
    expect(w.back).toBeLessThan(3);
    expect(w.stuck).toBeLessThan(1.5);
    expect(w.t).toBeLessThan(ideal(f, r, 18, 24) * 1.35 + 6);
  });

  it('a squad wades a ford and forms up on the far bank', () => {
    // a deep river down x 28..35, a 4-wide ford at y 30..33; the goal is just over the far bank, so the rear rank stands
    // right by the water
    const r = water(water(flat(64), 28, 0, 36, 64, 2), 28, 30, 36, 34, 1);
    const sim = createSim(r, 22);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 16, 22);
    sim.order({ kind: 'move', squad: s, x: 37.5, y: 26 });
    const f = field(r, 37.5, 26);
    const w = walk(sim, r, new Map([[s, f]]), 1200);
    expect(w.arrived).toBe(true);
    for (const u of unitsOf(sim, s)) expect(u.x).toBeGreaterThan(36); // every man on the far bank
    expect(w.back).toBeLessThan(3);
    // the ford halves the pace: the third rank waits on the bank while the first two wade in (was 2.7 s, with men pressed
    // into the bank's corner)
    expect(w.stuck).toBeLessThan(2.5);
    expect(w.t).toBeLessThan(ideal(f, r, 16, 22) * 1.5 + 6);
  });

  it('a squad turns a building corner without catching on it', () => {
    const r = raise(flat(64), 28, 28, 38, 38);
    const sim = createSim(r, 23);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 22);
    sim.order({ kind: 'move', squad: s, x: 36, y: 46 });
    const f = field(r, 36, 46);
    const w = walk(sim, r, new Map([[s, f]]), 1200);
    expect(w.arrived).toBe(true);
    expect(near(sim, s, 36, 46, 5)).toBe(true);
    expect(w.back).toBeLessThan(3);
    expect(w.stuck).toBeLessThan(1.5);
    expect(w.t).toBeLessThan(ideal(f, r, 20, 22) * 1.35 + 6);
  });

  it('two squads meeting in a narrow pass bump past each other', () => {
    // a 3-wide pass at y 30..32 through a wall down x 28..36
    const r = raise(raise(flat(64), 28, 0, 37, 30), 28, 33, 37, 64);
    const sim = createSim(r, 24);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 16, 31);
    const b = sim.spawnSquad('b', 0, 'militia', 12, 48, 31);
    sim.order({ kind: 'move', squad: a, x: 48, y: 31 });
    sim.order({ kind: 'move', squad: b, x: 16, y: 31 });
    const fa = field(r, 48, 31), fb = field(r, 16, 31);
    const w = walk(sim, r, new Map([[a, fa], [b, fb]]), 1500);
    expect(w.arrived).toBe(true);
    expect(near(sim, a, 48, 31, 5)).toBe(true);
    expect(near(sim, b, 16, 31, 5)).toBe(true);
    expect(w.back).toBeLessThan(3);
    expect(w.stuck).toBeLessThan(3); // two files of 12 through one 3-wide gap: a man may wait a little for the one ahead
    expect(w.t).toBeLessThan(ideal(fa, r, 16, 31) * 1.6 + 8);
  });
});
