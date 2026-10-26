import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import type { RegionData, WarSim } from '../../src/war/types';
import { flat } from './flatRegion';

// W-55 movement (docs/WAR.md "Movement"): seeded headless scenarios on small hand-made maps.

/** Raise the tiles in [x0,x1) x [y0,y1) to height h (3 over the ground's 1: a cliff all round). */
function wall(r: RegionData, x0: number, y0: number, x1: number, y1: number, h = 4) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.height[y * r.w + x] = h;
  return r;
}

interface Track { walked: Map<number, number>; turn: Map<number, number>; moves: Map<number, number>; minGap: number; flips: number }

/** Step the sim, recording per unit the distance walked, the heading change summed over its moving ticks, and the closest two bodies came. */
function run(sim: WarSim, ticks: number, until?: () => boolean, tr: Track = { walked: new Map(), turn: new Map(), moves: new Map(), minGap: Infinity, flips: 0 }) {
  let prev = new Map(sim.snapshot().units.map((u) => [u.id, u]));
  const head = new Map<number, number>();
  for (let t = 0; t < ticks; t++) {
    sim.step();
    const us = sim.snapshot().units;
    for (const u of us) {
      const p = prev.get(u.id);
      if (!p) continue;
      const dx = u.x - p.x, dy = u.y - p.y, d = Math.hypot(dx, dy);
      tr.walked.set(u.id, (tr.walked.get(u.id) ?? 0) + d);
      // the 8-way sprite facing the view shows: a change back and forth reads as twitching
      const oct = (f: number) => (Math.round(f / (Math.PI / 4)) + 8) % 8;
      if (oct(u.facing) !== oct(p.facing)) tr.flips++;
      if (d > 0.02) {
        const a = Math.atan2(dy, dx), h0 = head.get(u.id);
        if (h0 !== undefined) tr.turn.set(u.id, (tr.turn.get(u.id) ?? 0) + Math.abs(Math.atan2(Math.sin(a - h0), Math.cos(a - h0))));
        head.set(u.id, a);
        tr.moves.set(u.id, (tr.moves.get(u.id) ?? 0) + 1);
      }
    }
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) tr.minGap = Math.min(tr.minGap, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
    prev = new Map(us.map((u) => [u.id, u]));
    if (until?.()) return { tr, t: t + 1 };
  }
  return { tr, t: ticks };
}

const unitsOf = (sim: WarSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad);
const centre = (sim: WarSim, squad: number) => {
  const us = unitsOf(sim, squad);
  return [us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length] as const;
};
const allIdle = (sim: WarSim, squad: number) => unitsOf(sim, squad).every((u) => u.state === 'idle');
const near = (sim: WarSim, squad: number, x: number, y: number, r: number) => unitsOf(sim, squad).every((u) => Math.hypot(u.x - x, u.y - y) < r);
/** Mean heading change per moving tick (rad). */
const wobble = (tr: Track) => {
  let t = 0, n = 0;
  for (const [id, m] of tr.moves) (t += tr.turn.get(id) ?? 0), (n += m);
  return t / Math.max(1, n);
};

/** Share of moving ticks on which a man's 8-way sprite facing changed. */
const flipRate = (tr: Track) => tr.flips / Math.max(1, [...tr.moves.values()].reduce((a, b) => a + b, 0));

describe('war movement', () => {
  it('a lone man walks a straight line on open ground (no grid zig-zag)', () => {
    const sim = createSim(flat(64), 1);
    const s = sim.spawnSquad('a', 0, 'militia', 1, 10.5, 10.5);
    sim.order({ kind: 'move', squad: s, x: 50.5, y: 25.5 });
    const { tr } = run(sim, 600, () => allIdle(sim, s));
    const straight = Math.hypot(40, 15);
    const [u] = unitsOf(sim, s);
    expect(Math.hypot(u.x - 50.5, u.y - 25.5)).toBeLessThan(0.3);
    expect(tr.walked.get(u.id)!).toBeLessThan(straight * 1.02);
    expect(wobble(tr)).toBeLessThan(0.02);
  });

  it('a squad marches straight on open ground and keeps its formation', () => {
    const sim = createSim(flat(64), 2);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 10, 12);
    sim.order({ kind: 'move', squad: s, x: 48, y: 40 });
    const [x0, y0] = centre(sim, s);
    let spread = 0;
    const { tr, t } = run(sim, 900, () => {
      const us = unitsOf(sim, s), [cx, cy] = centre(sim, s);
      for (const u of us) spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
      return allIdle(sim, s);
    });
    expect(t).toBeLessThan(900);
    const [x1, y1] = centre(sim, s);
    const straight = Math.hypot(x1 - x0, y1 - y0);
    for (const d of tr.walked.values()) expect(d).toBeLessThan(straight * 1.25 + 3);
    expect(spread).toBeLessThan(5.5); // a 6 x 2 line is ~5 wide: no one strung out
    expect(wobble(tr)).toBeLessThan(0.02);
    expect(flipRate(tr)).toBeLessThan(0.02);
    expect(tr.minGap).toBeGreaterThan(0.6);
  });

  it('goes round a cliff by the short side, close to the shortest line', () => {
    const r = wall(flat(64), 28, 8, 32, 44); // a cliff wall from y 8 to 44; the short way round is at the south end
    const sim = createSim(r, 3);
    const s = sim.spawnSquad('a', 0, 'militia', 1, 20.5, 30.5);
    sim.order({ kind: 'move', squad: s, x: 40.5, y: 30.5 });
    const { tr, t } = run(sim, 900, () => allIdle(sim, s));
    expect(t).toBeLessThan(900);
    const [u] = unitsOf(sim, s);
    expect(Math.hypot(u.x - 40.5, u.y - 30.5)).toBeLessThan(0.3);
    // shortest any-angle way: (20.5,30.5) -> the wall's south corners (28,44),(32,44) -> (40.5,30.5); the old 8-way path walked 39.1
    const best = Math.hypot(7.5, 13.5) + 4 + Math.hypot(8.5, 13.5);
    expect(tr.walked.get(u.id)!).toBeLessThan(best * 1.05);
  });

  it('12 men go through a narrow pass and nobody is left stuck', () => {
    const r = wall(wall(flat(64), 30, 0, 34, 30), 30, 33, 34, 64); // a 3-tile gap at y 30..32
    const sim = createSim(r, 4);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 18, 20);
    sim.order({ kind: 'move', squad: s, x: 46, y: 42 });
    const { t } = run(sim, 900, () => allIdle(sim, s));
    expect(t).toBeLessThan(600); // 60 s
    expect(near(sim, s, 46, 42, 5)).toBe(true);
  });

  it('a squad crosses a field of boulders and nobody is caught on a corner', () => {
    const r = flat(64);
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 4; y < 60; y++) for (let x = 20; x < 44; x++) if (rnd() < 0.18) r.height[y * 64 + x] = 4; // single-tile crags
    const sim = createSim(r, 10);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 10, 32);
    sim.order({ kind: 'move', squad: s, x: 54, y: 30 });
    const { t } = run(sim, 1200, () => allIdle(sim, s));
    expect(t).toBeLessThan(600);
    expect(near(sim, s, 54, 30, 5)).toBe(true);
  });

  it('two squads crossing head-on both get through without jamming', () => {
    const sim = createSim(flat(64), 5);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 12, 32);
    const b = sim.spawnSquad('b', 0, 'militia', 12, 52, 32);
    sim.order({ kind: 'move', squad: a, x: 52, y: 32 });
    sim.order({ kind: 'move', squad: b, x: 12, y: 32 });
    const { tr, t } = run(sim, 900, () => allIdle(sim, a) && allIdle(sim, b));
    expect(t).toBeLessThan(600);
    expect(near(sim, a, 52, 32, 5)).toBe(true);
    expect(near(sim, b, 12, 32, 5)).toBe(true);
    expect(tr.minGap).toBeGreaterThan(0.5);
    expect(flipRate(tr)).toBeLessThan(0.06);
  });

  it('a squad walks straight through a friendly squad at rest, which closes up again after', () => {
    const sim = createSim(flat(64), 9);
    const rest = sim.spawnSquad('a', 0, 'militia', 12, 32, 32);
    sim.order({ kind: 'formation', squad: rest, shape: 'loose' });
    run(sim, 200, () => allIdle(sim, rest));
    const slots = new Map(unitsOf(sim, rest).map((u) => [u.id, [u.x, u.y]]));
    const s = sim.spawnSquad('a', 0, 'militia', 6, 14, 32);
    sim.order({ kind: 'formation', squad: s, shape: 'column' });
    sim.order({ kind: 'move', squad: s, x: 52, y: 32 });
    const { tr, t } = run(sim, 900, () => allIdle(sim, s) && allIdle(sim, rest));
    expect(t).toBeLessThan(500);
    expect(near(sim, s, 52, 32, 4)).toBe(true);
    for (const u of unitsOf(sim, s)) expect(tr.walked.get(u.id)!).toBeLessThan(38 * 1.12 + 2);
    for (const u of unitsOf(sim, rest)) expect(Math.hypot(u.x - slots.get(u.id)![0], u.y - slots.get(u.id)![1])).toBeLessThan(0.6);
  });

  it('two squads crossing at right angles both get through', () => {
    const sim = createSim(flat(64), 6);
    const a = sim.spawnSquad('a', 0, 'militia', 12, 12, 32);
    const b = sim.spawnSquad('b', 1, 'militia', 12, 32, 12);
    sim.order({ kind: 'move', squad: a, x: 52, y: 32 });
    sim.order({ kind: 'move', squad: b, x: 32, y: 52 });
    const { t } = run(sim, 900, () => allIdle(sim, a) && allIdle(sim, b));
    expect(t).toBeLessThan(600);
    expect(near(sim, a, 52, 32, 5)).toBe(true);
    expect(near(sim, b, 32, 52, 5)).toBe(true);
  });

  it('men at rest stand still (no jitter)', () => {
    const sim = createSim(flat(64), 7);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 20, 20);
    sim.order({ kind: 'move', squad: s, x: 40, y: 30 });
    run(sim, 900, () => allIdle(sim, s));
    const before = unitsOf(sim, s);
    const { tr } = run(sim, 100);
    for (const u of before) expect(tr.walked.get(u.id) ?? 0).toBeLessThan(0.05);
  });

  it('a squad reformed from scattered men gathers and marches as one', () => {
    const sim = createSim(flat(64), 8);
    const s = sim.spawnSquad('a', 0, 'militia', 6, 14, 14);
    const t2 = sim.spawnSquad('a', 0, 'archer', 6, 14, 40);
    sim.order({ kind: 'merge', squad: t2, into: s });
    sim.order({ kind: 'move', squad: s, x: 48, y: 28 });
    const { t } = run(sim, 900, () => allIdle(sim, s));
    expect(t).toBeLessThan(700);
    expect(unitsOf(sim, s).length).toBe(12);
    expect(near(sim, s, 48, 28, 5)).toBe(true);
  });

  it('any picked set of men (W-53: a mixed detachment) marches together and arrives', () => {
    const sim = createSim(flat(64), 11);
    const s = sim.spawnSquad('a', 0, 'militia', 6, 14, 20);
    sim.order({ kind: 'merge', squad: sim.spawnSquad('a', 0, 'archer', 6, 14, 24), into: s });
    run(sim, 5);
    const ids = unitsOf(sim, s).filter((_, i) => i % 3 === 0).map((u) => u.id); // 2 militia, 2 archers, scattered over the block
    sim.order({ kind: 'detach', squad: s, unitIds: ids });
    sim.step();
    const d = sim.snapshot().squads.length - 1;
    expect(unitsOf(sim, d).map((u) => u.id).sort()).toEqual([...ids].sort());
    sim.order({ kind: 'move', squad: d, x: 50, y: 44 });
    sim.order({ kind: 'move', squad: s, x: 50, y: 12 });
    let spread = 0;
    const { t } = run(sim, 900, () => {
      const [cx, cy] = centre(sim, d);
      for (const u of unitsOf(sim, d)) spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
      return allIdle(sim, d) && allIdle(sim, s);
    });
    expect(t).toBeLessThan(600);
    expect(near(sim, d, 50, 44, 3)).toBe(true);
    expect(near(sim, s, 50, 12, 5)).toBe(true);
    expect(spread).toBeLessThan(6);
  });

  it('a line turned about re-forms facing the new way without its flanks crossing', () => {
    const sim = createSim(flat(64), 12);
    const s = sim.spawnSquad('a', 0, 'militia', 12, 40, 32); // a 6 x 2 line facing east
    run(sim, 20);
    sim.order({ kind: 'move', squad: s, x: 20, y: 32 });
    const { tr } = run(sim, 600, () => allIdle(sim, s));
    for (const d of tr.walked.values()) expect(d).toBeLessThan(20 + 2.5); // each man about the march, none the width of the line more
    const ys = unitsOf(sim, s).map((u) => u.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4); // still a line across the way it faces
  });
});
