/**
 * W-62 E5 replays (src/war/view/replay): the rolling record stays within its ticks and bytes, and playing frames
 * N..M back gives the men where they stood when recorded.
 */
import { describe, expect, it } from 'vitest';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { SPOTS } from '../../src/war/regions/test-ridge.spots';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { ReplayBuffer, REPLAY_TICKS } from '../../src/war/view/replay/buffer';
import { BIG_FIGHT, Moments, QUIET, STALL, type Moment } from '../../src/war/view/replay/moments';
import { ReplayPlayer } from '../../src/war/view/replay/player';
import type { Snapshot } from '../../src/war/types';

const ridge = parseRegion(ridgeJson);
const [FX, FY] = SPOTS.fieldE;

/** A synthetic snapshot: n men walking, a few buildings standing still. */
const synth = (tick: number, n: number): Snapshot => ({
  tick,
  units: Array.from({ length: n }, (_, i) => ({ id: i, squad: i % 20, x: 100 + i * 0.1 + tick * 0.05, y: 200 + Math.sin(tick / 10 + i), facing: tick / 7, hp: 50, maxHp: 50, cls: 'hoplite', state: 'move' as const })),
  squads: Array.from({ length: 20 }, (_, q) => ({ id: q, owner: 'bot', team: q % 2, units: [], order: 'move' as const })),
  buildings: Array.from({ length: 50 }, (_, b) => ({ id: b, type: 'palisade', team: 0, x: b, y: 10, w: 1, h: 1, rot: 0, tiles: [b, 10], state: 'done', progress: 1, delivered: 0, hp: 100, maxHp: 100, workers: 0, maxWorkers: 0 })) as unknown as Snapshot['buildings'],
});

describe('replay buffer', () => {
  it('keeps at most REPLAY_TICKS ticks, the newest ones', () => {
    const b = new ReplayBuffer();
    for (let t = 1; t <= REPLAY_TICKS + 700; t++) b.push(synth(t, 40), null);
    expect(b.last).toBe(REPLAY_TICKS + 700);
    expect(b.last - b.first).toBeLessThanOrEqual(REPLAY_TICKS);
  });

  it('stays under its byte cap with 600 men, and still-standing buildings cost nothing per frame', () => {
    const cap = 4 * 2 ** 20, b = new ReplayBuffer(REPLAY_TICKS, cap);
    for (let t = 1; t <= 1200; t++) b.push(synth(t, 600), null);
    expect(b.bytes).toBeLessThanOrEqual(cap);
    expect(b.frames.length).toBeGreaterThan(50);
    const [f0, f1] = b.frames.slice(-2);
    expect(f1.rest.buildings).toBe(f0.rest.buildings); // interned: the very same array
    expect(f1.tpl[3]).toBe(f0.tpl[3]); // a man's template shared while only his position changes
    // 600 men: about 30 bytes a man a frame (16 position, 6 small ints, a template reference)
    expect(f1.bytes / 600).toBeLessThan(32);
  });

  it('a pile counting down its time is kept from the frame before until it is SLACK ticks stale', () => {
    const b = new ReplayBuffer(), pile = (t: number) => ({ id: 7, x: 1, y: 2, lots: [[1, 2]], left: 1000 - t });
    for (let t = 1; t <= 30; t++) b.push({ ...synth(t, 2), piles: [pile(t)] } as unknown as Snapshot, null);
    const at = (t: number) => b.frames[t - 1].rest.piles!;
    expect(at(10)).toBe(at(5));
    expect(at(25)).not.toBe(at(5));
    expect((at(25)[0] as unknown as { left: number }).left).toBeGreaterThan(1000 - 25);
  });

  it('starts over when the ticks go back (a new sim or region)', () => {
    const b = new ReplayBuffer();
    for (let t = 1; t <= 50; t++) b.push(synth(t, 5), null);
    b.push(synth(3, 5), null);
    expect(b.frames.length).toBe(1);
  });
});

describe('replay playback', () => {
  it('frames N..M played back put every man where he was recorded, interpolated between', () => {
    const sim = createSim(ridge, 3);
    const a = sim.spawnSquad('a', 0, 'hoplite', 30, FX - 6, FY);
    const d = sim.spawnSquad('d', 1, 'militia', 30, FX + 6, FY);
    sim.order({ kind: 'attack', squad: a, target: d });
    sim.order({ kind: 'attack', squad: d, target: a });
    const buf = new ReplayBuffer(), moments = new Moments(), seen = new Map<number, Snapshot>();
    let fell = 0;
    for (let t = 0; t < 600; t++) {
      sim.step();
      const s = sim.snapshot();
      seen.set(s.tick, structuredClone(s));
      const n = buf.push(s, null);
      fell += n.fell;
      moments.feed(n);
    }
    expect(fell).toBeGreaterThan(5);
    const p = new ReplayPlayer(buf), N = buf.first + 100, M = buf.first + 400;
    for (let t = N; t <= M; t += 7) {
      p.seek(t);
      // the men stand where frame t has them; the rest is the frame drawn towards (t + 1), as the live view draws
      const want = seen.get(t)!, next = seen.get(p.cur!.tick)!, got = p.units();
      expect(p.cur!.tick).toBe(t + 1);
      expect(got.length).toBe(want.units.length);
      for (let i = 0; i < got.length; i++) {
        expect(got[i].u.id).toBe(want.units[i].id);
        expect(got[i].x).toBeCloseTo(want.units[i].x, 4);
        expect(got[i].y).toBeCloseTo(want.units[i].y, 4);
        expect(got[i].u.state).toBe(next.units[i].state);
        expect(got[i].u.hp).toBeCloseTo(next.units[i].hp, 3);
        expect(got[i].u.swing).toBe(next.units[i].swing);
      }
      expect(p.cur!.squads).toEqual(next.squads);
      expect(p.cur!.buildings).toEqual(next.buildings);
    }
    // half a tick in: halfway between the frames for a man in both
    p.seek(N + 0.5);
    const u0 = seen.get(N)!.units[0], u1 = seen.get(N + 1)!.units.find((u) => u.id === u0.id)!;
    const mid = p.units().find((x) => x.u.id === u0.id)!;
    expect(mid.x).toBeCloseTo((u0.x + u1.x) / 2, 4);
    // playing at 2x moves 2 ticks per 100 ms and stops at the newest frame
    p.seek(N);
    p.rate = 2;
    p.playing = true;
    p.step(100);
    expect(p.t).toBeCloseTo(N + 2, 6);
    p.step(1e6);
    expect(p.t).toBe(buf.last);
    expect(p.playing).toBe(false);
  });
});

describe('replay moments', () => {
  const note = (tick: number, fell = 0, striking = 0) => ({ tick, fell, razed: 0, slain: [], units: 40, striking });
  it('a big fight is told only once no blow is struck any more, not while men still hack at a lord', () => {
    const m = new Moments(), got: Moment[] = [];
    m.onMoment = (x) => got.push(x);
    let t = 0;
    for (let i = 0; i < BIG_FIGHT + 1; i++) m.feed(note(++t, 1, 20));
    // his men are down; the lord fights on with deep hp: nobody falls, but blows are struck
    for (let i = 0; i < QUIET * 3; i++) m.feed(note(++t, 0, 13));
    expect(got).toEqual([]);
    m.feed(note(++t, 1, 0)); // he falls
    for (let i = 0; i <= QUIET + 1; i++) m.feed(note(++t, 0, 0));
    expect(got.length).toBe(1);
    expect(got[0].fell).toBe(BIG_FIGHT + 2);
  });
  it('blows struck forever (a skirmish far off) still end the fight once nobody fell for STALL', () => {
    const m = new Moments(), got: Moment[] = [];
    m.onMoment = (x) => got.push(x);
    let t = 0;
    for (let i = 0; i < BIG_FIGHT; i++) m.feed(note(++t, 1, 20));
    for (let i = 0; i <= STALL + 1; i++) m.feed(note(++t, 0, 4));
    expect(got.length).toBe(1);
  });
});
