import { describe, expect, it } from 'vitest';
import { Animator, frameAt, pickClip, workClips, type ClipDef } from '../../src/war/view/anim';
import type { DrawUnit } from '../../src/war/view/simClient';
import type { UnitSnap } from '../../src/war/types';

const C = (n: number, fps: number, strike = Math.floor(n / 2), hold = 0): ClipDef => ({ n, fps, strike, hold });
const clips = new Map<string, ClipDef>([
  ['idle', C(12, 8)], ['look', C(16, 8)], ['walk', C(16, 16)], ['run', C(12, 16)], ['charge', C(12, 16)], ['ready', C(12, 8)],
  ['thrust', C(14, 14, 6)], ['stagger', C(12, 12)], ['fallBack', C(12, 12)], ['fallFwd', C(12, 12)], ['cheer', C(12, 10, 0, 3)],
]);
const unit = (o: Partial<UnitSnap> = {}, x = 0, team = 0): DrawUnit => ({
  u: { id: 1, squad: team, x, y: 0, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'idle', ...o }, x, y: 0, facing: 0, team,
});
const at = (now: number, snap: number) => ({ now, tick: snap - 1 + 0.5, snap, tickMs: 100 });

describe('war clip selection', () => {
  it('falls back by name and holds', () => {
    expect(pickClip(clips, 'attack')).toBe('thrust');
    expect(pickClip(clips, 'build')).toBe('idle');
    expect(frameAt(C(12, 10, 0, 3), 5000)).toBeGreaterThanOrEqual(3);
  });

  it('plays the blow once with its strike frame on the landing tick', () => {
    const a = new Animator();
    // the blow landed on snapshot tick 10 (swing 0), rendered at tick 9.5: the strike frame shows 50 ms on
    const d = unit({ state: 'attack', swing: 0, ready: 12 });
    const p = a.pick(d, clips, at(1000, 10), [d], []);
    expect(p.clip).toBe('thrust');
    expect(p.frame).toBe(Math.floor(((6 / 14) * 1000 - 50) * 14 / 1000));
    // well after the clip and before the next lead: the ready stance
    const q = a.pick({ ...d, u: { ...d.u, swing: 9, ready: 3 } }, clips, at(1900, 19), [d], []);
    expect(q.clip).toBe('ready');
  });

  it('staggers on a hit, falls back when struck from in front', () => {
    const a = new Animator(), d = unit();
    a.pick(d, clips, at(0, 1), [d], []);
    a.pick(unit({ hp: 6 }), clips, at(100, 2), [d], []); // shows once render reaches the snapshot it fell in
    expect(a.pick(unit({ hp: 6 }), clips, at(200, 2.5), [d], []).clip).toBe('stagger');
    const foe = unit({ id: 2 }, 1, 1);
    expect(a.pick(unit({ hp: 0, state: 'dead' }), clips, at(200, 3), [foe], []).clip).toBe('fallBack');
  });

  it('desyncs a squad standing idle', () => {
    const a = new Animator(), frames = new Set<number>();
    for (let id = 0; id < 12; id++) frames.add(a.pick(unit({ id }), clips, at(0, 1), [], []).frame);
    expect(frames.size).toBeGreaterThan(3);
  });

  it('plays work clips by the resource gathered, never the attack', () => {
    const work = new Map([...clips, ['chop', C(12, 10)], ['mine', C(12, 10)], ['harvest', C(12, 10)], ['build', C(12, 10)], ['carry', C(9, 12)]]);
    const pick = (o: Partial<UnitSnap>, cs = work) => {
      const a = new Animator();
      a.override = workClips;
      return a.pick(unit(o), cs, at(0, 1), [], []).clip;
    };
    expect(pick({ state: 'gather', carry: 'wood', load: 1 })).toBe('chop');
    expect(pick({ state: 'gather', carry: 'marble', load: 1 })).toBe('mine');
    expect(pick({ state: 'gather', carry: 'iron', load: 1 })).toBe('mine');
    expect(pick({ state: 'gather', carry: 'food', load: 1 })).toBe('harvest');
    expect(pick({ state: 'build' })).toBe('build');
    expect(pick({ state: 'move', carry: 'stone', load: 2 })).toBe('carry');
    // a sheet without work clips idles at work and walks with its load
    expect(pick({ state: 'gather', carry: 'wood', load: 1 }, clips)).toBe('idle');
    expect(pick({ state: 'build' }, clips)).toBe('idle');
    expect(pick({ state: 'move', carry: 'wood', load: 1 }, clips)).toBe('walk');
  });
});
