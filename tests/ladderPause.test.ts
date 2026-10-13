import { describe, expect, it } from 'vitest';
import { LADDER, LADDER_TICKET_TTL_MS, ladderFloor, ladderSetup, ticketClock } from '../src/duel/ladder';
import { DemoDuelSource } from '../src/duel/client';
import { SPEEDS, nextSpeed, paceMode, realtimeLocked, startSpeed } from '../src/ui/input/pace';
import { StagedPlan } from '../src/ui/orderQueue';
import { Battle, DT, TICK_RATE } from '../src/sim/battle';
import type { BattleSetup, Order } from '../src/sim/types';
import { replayBattle } from '../src/sim/replay';

// CT-06 (design/gdd/controls.md R10, R11; V5-021): who may pause, the speeds, the 30-minute ladder ticket.

const MIN = 60_000;

describe('who may pause (controls.md R10)', () => {
  it('offline and the ladder pause; live duels, raids and attacks are realtime-locked', () => {
    expect(paceMode(false, false)).toBe('offline');
    expect(paceMode(true, true)).toBe('ladder');
    expect(paceMode(true, false)).toBe('locked');
    expect(realtimeLocked('offline')).toBe(false);
    expect(realtimeLocked('ladder')).toBe(false);
    expect(realtimeLocked('locked')).toBe(true);
  });

  it('speeds: 0.5× wherever pause is; offline up to 3×, the ladder up to 2×, locked 1× only', () => {
    expect(SPEEDS.offline).toEqual([0.5, 1, 2, 3]);
    expect(SPEEDS.ladder).toEqual([0.5, 1, 2]);
    expect(SPEEDS.locked).toEqual([1]);
    const cycle = (mode: 'offline' | 'ladder' | 'locked') => {
      const seen = [1];
      for (let i = 0; i < SPEEDS[mode].length; i++) seen.push(nextSpeed(mode, seen[seen.length - 1]));
      return seen;
    };
    expect(cycle('offline')).toEqual([1, 2, 3, 0.5, 1]);
    expect(cycle('ladder')).toEqual([1, 2, 0.5, 1]);
    expect(cycle('locked')).toEqual([1, 1]);
  });

  it('a battle opens at the saved battle speed (A11Y-21), capped to what it offers', () => {
    expect(startSpeed('offline')).toBe(1);
    expect(startSpeed('offline', 3)).toBe(3);
    expect(startSpeed('ladder', 3)).toBe(2);
    expect(startSpeed('ladder', 0.5)).toBe(0.5);
    expect(startSpeed('locked', 0.5)).toBe(1);
    expect(startSpeed('locked', 3)).toBe(1);
  });
});

describe('the ladder ticket clock (controls.md R10)', () => {
  it('30 minutes; a countdown from 5 min left; accepted at 29 min, expired after 30', () => {
    expect(LADDER.ticketMin).toBe(30);
    expect(LADDER_TICKET_TTL_MS).toBe(30 * MIN);
    const opened = 1_000_000;
    const end = opened + LADDER_TICKET_TTL_MS;
    expect(ticketClock(end, opened + 24 * MIN)).toEqual({ secs: 360, show: false, expired: false });
    expect(ticketClock(end, opened + 25 * MIN)).toEqual({ secs: 300, show: true, expired: false });
    expect(ticketClock(end, opened + 29 * MIN)).toEqual({ secs: 60, show: true, expired: false });
    expect(ticketClock(end, opened + 30 * MIN).expired).toBe(false);
    expect(ticketClock(end, opened + 30 * MIN + 1)).toEqual({ secs: 0, show: true, expired: true });
  });

  it('a ladder ticket carries its deadline on this device (an explicit field, DUE-01)', async () => {
    let now = 5_000_000;
    const src = new DemoDuelSource({ now: () => now });
    const tk = await src.ladderStart(1);
    expect(tk.expiresAt - tk.now!).toBe(30 * MIN);
    // the source's clock is far from Date.now(): the deadline follows the device, not the server
    expect(Math.abs(tk.deadline - (Date.now() + 30 * MIN))).toBeLessThan(1000);
    now += 29 * MIN;
    const ok = await src.ladderSubmit(tk.ticket, { orders: [], deployOrders: 0, claim: { winner: 0, ticks: 1, hash: '' } }, fight(tk.setup).result());
    expect(ok.expired).toBeUndefined();
    expect(ok.accountXp).toBeGreaterThan(0);
  });

  it('the demo, like the server, pays nothing for a run reported after 30 min', async () => {
    let now = 5_000_000;
    const src = new DemoDuelSource({ now: () => now });
    const before = await src.profile();
    const tk = await src.ladderStart(1);
    now += 30 * MIN + 1000;
    const r = await src.ladderSubmit(tk.ticket, { orders: [], deployOrders: 0, claim: { winner: 0, ticks: 1, hash: '' } }, fight(tk.setup).result());
    expect(r).toMatchObject({ expired: true, glory: 0, accountXp: 0, stars: 0, drop: null, firstClear: false });
    expect(r.profile.glory).toBe(before.glory);
    expect(r.profile.ladder.cleared).toBe(before.ladder.cleared);
  });
});

/** Both sides as bots to the end (the harness). */
function fight(setup: BattleSetup): Battle {
  const s = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  s.armies[0].bot = true;
  const b = new Battle(s);
  b.startBattle();
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks) b.step();
  return b;
}

describe('a paused, sped-up ladder run replays on the server (ADR-0001)', () => {
  const floor = ladderFloor(3);
  const setup = () => ladderSetup(4242, JSON.parse(JSON.stringify(ladderFloor(2).heroes)), [...floor.formations], floor);

  /**
   * The battle scene's loop (BattleScene.update): real time × speed fills the
   * accumulator, a sim step per DT; paused, nothing steps and orders go to the
   * plan, which Play issues at the resume tick (controls.md R6.1).
   */
  function play(frames: { ms: number; speed: number; paused: boolean; orders?: Order[] }[]): Battle {
    const b = new Battle(setup());
    b.startBattle();
    const plan = new StagedPlan();
    let acc = 0;
    let wasPaused = false;
    for (const f of frames) {
      if (b.phase === 'ended') break;
      if (f.paused) {
        for (const o of f.orders ?? []) plan.add(o);
        wasPaused = true;
        continue;
      }
      if (wasPaused) {
        for (const o of plan.orders) b.issue(0, o);
        plan.clear();
        wasPaused = false;
      }
      for (const o of f.orders ?? []) b.issue(0, o);
      acc += Math.min(0.25, f.ms / 1000) * f.speed;
      while (acc >= DT && b.phase === 'battle') {
        b.step();
        acc -= DT;
      }
    }
    while (b.phase === 'battle' && b.tick <= b.timeLimitTicks) b.step();
    return b;
  }

  it('pauses of any length and any speeds give the order log ticks, so the replay matches', () => {
    const charge: Order[] = [
      { kind: 'order', group: 0, order: 'charge' },
      { kind: 'order', group: 1, order: 'charge' },
    ];
    const frames = (pauseFrames: number, speeds: number[]) => {
      const out: { ms: number; speed: number; paused: boolean; orders?: Order[] }[] = [];
      for (let i = 0; i < 30; i++) out.push({ ms: 16, speed: speeds[i % speeds.length], paused: false, orders: i === 0 ? [{ kind: 'order', group: 0, order: 'advance' }] : undefined });
      // a long pause (minutes of frames), the plan given in it
      for (let i = 0; i < pauseFrames; i++) out.push({ ms: 16, speed: 1, paused: true, orders: i === 3 ? charge : undefined });
      for (let i = 0; i < 4000; i++) out.push({ ms: 16, speed: speeds[(i >> 6) % speeds.length], paused: false });
      return out;
    };
    const runs = [play(frames(0, [1])), play(frames(9000, [2])), play(frames(20, [0.5, 1, 2]))];
    for (const b of runs) {
      const log = b.orderLog.filter((o) => o.side === 0).map((o) => ({ tick: o.tick, side: o.side, order: o.order }));
      const r = replayBattle(setup(), log, 0);
      expect(r.summary).toMatchObject({ winner: b.winner ?? -1, ticks: b.tick, hash: b.hash() });
    }
  });
});

describe('ladder pace (CT-06 AC4: floor 5 at 2× in 90 s of real time or less)', () => {
  it('the median floor 5 battle takes at most 90 s at 2× (harness: its own army as the player; sim unchanged)', () => {
    const floor = ladderFloor(5);
    const secs: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const b = fight(ladderSetup(seed, JSON.parse(JSON.stringify(floor.heroes)), [...floor.formations], floor));
      secs.push(b.tick / TICK_RATE / 2);
    }
    secs.sort((a, b) => a - b);
    const median = secs[Math.floor(secs.length / 2)];
    console.info(`[CT-06] floor 5 real time at 2x: median ${median.toFixed(1)} s, range ${secs[0].toFixed(1)}-${secs[secs.length - 1].toFixed(1)} s (25 seeds)`);
    expect(median).toBeLessThanOrEqual(90);
  });
});
