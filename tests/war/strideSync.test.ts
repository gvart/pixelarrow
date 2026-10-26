import { describe, expect, it } from 'vitest';
import { advancePhase, Animator, PACE, strideFrame, strideOf, type ClipDef } from '../../src/war/view/anim';
import type { DrawUnit } from '../../src/war/view/simClient';

const C = (n: number, fps: number): ClipDef => ({ n, fps, strike: 0, hold: 0 });
const walk = C(16, 16), run = C(12, 16);
const clips = new Map<string, ClipDef>([['idle', C(12, 8)], ['walk', walk], ['run', run], ['charge', run]]);

/** Frames shown over `ms` at `speed` tiles/s, drawn at 60 fps, from phase 0. */
function frames(speed: number, ms: number): number[] {
  const out: number[] = [], stride = strideOf(walk, 'walk');
  let phase = 0;
  for (let t = 0; t < ms; t += 1000 / 60) {
    phase = advancePhase(phase, (speed * 1000) / 60 / 1000, stride);
    out.push(strideFrame(walk, phase));
  }
  return out;
}

/** Forward steps (with the wrap 15 -> 0 as one step) between consecutive frames. */
const steps = (f: number[]) => f.slice(1).map((x, i) => (x - f[i] + walk.n) % walk.n);

describe('stride-synced walk cycle', () => {
  it('one cycle per stride: the authored length at the march pace', () => {
    expect(strideOf(walk, 'walk')).toBeCloseTo(PACE.walk * 1); // 16 frames at 16 fps
    expect(strideOf(run, 'run')).toBeCloseTo(PACE.run * 0.75);
  });

  it.each([0.3, 1, 2])('at %fx the march pace the cycle runs at that rate, in order, no frame cut', (k) => {
    const f = frames(PACE.walk * k, 3000);
    // cycles played in 3 s = 3k (one per second at 1x)
    const wraps = f.slice(1).filter((x, i) => x < f[i]).length;
    expect(wraps).toBe(Math.floor(3 * k));
    // frames only move forward, never skipping one (at 2x: 32 frames/s at 60 fps)
    for (const s of steps(f)) expect(s).toBeLessThanOrEqual(1);
    // the whole cycle shows, at the slow pace too
    if (k >= 1) expect(new Set(f).size).toBe(walk.n);
    else expect(new Set(f).size).toBe(Math.floor(walk.n * 0.9) + 1);
    // the mean frame rate follows the speed
    const advanced = steps(f).reduce((a, b) => a + b, 0);
    expect(advanced / 3).toBeCloseTo(16 * k, -0.5);
  });

  it('a man walking slower holds his cycle; speed jitter round the run pace does not flip the clip', () => {
    const a = new Animator(), seen: string[] = [], fr: number[] = [];
    let x = 0;
    for (let i = 0; i < 240; i++) {
      const now = i * (1000 / 60), v = i < 120 ? PACE.walk * 0.3 : 2.05 + (i % 2 ? 0.08 : -0.08); // slow, then jittering at the run threshold
      x += v / 60;
      const d: DrawUnit = { u: { id: 7, squad: 0, x, y: 0, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'move' }, x, y: 0, facing: 0, team: 0 };
      const p = a.pick(d, clips, { now, tick: i / 6, snap: Math.ceil(i / 6), tickMs: 100 }, [d], []);
      seen.push(p.clip); fr.push(p.frame);
    }
    // slow part: walk throughout, frames only step forward one at a time
    expect(new Set(seen.slice(2, 120))).toEqual(new Set(['walk']));
    for (let i = 3; i < 120; i++) expect((fr[i] - fr[i - 1] + 16) % 16).toBeLessThanOrEqual(1);
    // jitter part: the gait changes at most once, never back and forth
    const flips = seen.slice(120).filter((c, i, s) => i > 0 && c !== s[i - 1]).length;
    expect(flips).toBeLessThanOrEqual(1);
  });
});
