import { describe, expect, it } from 'vitest';
import { SnapBuffer } from '../../src/war/view/interp';
import type { UnitSnap } from '../../src/war/types';

// Snapshot playback (src/war/view/interp.ts): a man walking at a steady 1.5 tiles/s, his 10 Hz snapshots arriving
// unevenly, drawn at 60 fps, must move on screen every frame at a near-steady pace: no freeze, no jump, never back.

const man = (tick: number): UnitSnap => ({ id: 1, squad: 0, x: tick * 0.15, y: 0, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'move' });

/** Per-frame steps (tiles) over `ms`, the snapshot of tick k arriving at k * 100 + jitter(k) ms. */
function play(jitter: (k: number) => number, ms = 6000, from = 1000): number[] {
  const b = new SnapBuffer();
  const arrivals = Array.from({ length: Math.ceil(ms / 100) + 20 }, (_, k) => [k, k * 100 + jitter(k)] as const).sort((p, q) => p[1] - q[1]);
  let ai = 0, prev = NaN;
  const steps: number[] = [];
  for (let now = 0; now < ms; now += 1000 / 60) {
    while (ai < arrivals.length && arrivals[ai][1] <= now) {
      const [k, at] = arrivals[ai++];
      if (k > b.newest || b.newest === 0) b.push(k, [man(k)], at);
    }
    if (b.newest === 0 && ai === 0) continue;
    const [p] = b.sample([man(b.newest)], b.clock(now));
    if (now >= from && !Number.isNaN(prev)) steps.push(p.x - prev);
    prev = p.x;
  }
  return steps;
}

const perFrame = 0.15 / 6; // 1.5 tiles/s at 60 fps

describe('snapshot interpolation', () => {
  it('steady arrivals: a steady pace', () => {
    const s = play(() => 0);
    for (const d of s) expect(d).toBeCloseTo(perFrame, 3);
  });

  it.each([
    ['postMessage jitter (+-25 ms)', (k: number) => ((k * 7919) % 50) - 25],
    ['a long frame now and then (snapshots 80 ms late)', (k: number) => (k % 13 === 0 ? 80 : 0)],
    ['network jitter (0-60 ms)', (k: number) => (k * 104729) % 61],
  ])('%s: moves every frame, never jumps or steps back', (_, j) => {
    const s = play(j);
    for (const d of s) {
      expect(d).toBeGreaterThan(perFrame * 0.8);
      expect(d).toBeLessThan(perFrame * 1.2);
    }
  });

  it('a snapshot late by over the delay: carried on, then held, never back', () => {
    // ticks 30-34 all arrive at once 400 ms late
    const s = play((k) => (k >= 30 && k < 34 ? (34 - k) * 100 : 0), 6000, 1000);
    for (const d of s) expect(d).toBeGreaterThan(-1e-9);
    expect(Math.max(...s)).toBeLessThan(perFrame * 6);
  });

  it('paused: the clock stops at the newest snapshot', () => {
    const b = new SnapBuffer();
    for (let k = 1; k <= 10; k++) b.push(k, [man(k)], k * 100);
    b.paused = true;
    let t = 0;
    for (let now = 1000; now < 3000; now += 16) t = b.clock(now);
    expect(t).toBe(10);
  });

  it('a skip or a restart jumps the clock instead of racing to catch up', () => {
    const b = new SnapBuffer();
    for (let k = 1; k <= 10; k++) (b.push(k, [man(k)], k * 100), b.clock(k * 100));
    b.push(600, [man(600)], 1100);
    expect(b.clock(1116)).toBeGreaterThan(590);
    b.push(1, [man(1)], 1200); // a new sim from tick 1
    expect(b.clock(1216)).toBeLessThan(3);
  });
});
