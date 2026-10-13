/**
 * CT-04: paused staging and the one-step "Then…" queue (design/gdd/controls.md
 * R6, F1). Both are client-side and reach the sim only as ordinary orders at
 * real ticks, so the order log replays to the same battle (ADR-0001).
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { BattleSetup, Order } from '../src/sim/types';
import { ARRIVE_DIST, STILL_S, StagedPlan, ThenQueue, thenOrder } from '../src/ui/orderQueue';

// battleHud draws with Phaser; the preview maths under test does not
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { chargeTarget } = await import('../src/ui/battleHud');

function setup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = () => armySpec(classSquad(rng, ids, 'hoplite', 6, 3, 0), false);
  return { seed, armies: [side(), side()] };
}

/** Both lines deployed far apart and the battle started; group 0 is ours, group 4 theirs. */
function started(seed = 11): Battle {
  const b = new Battle(setup(seed));
  b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 30, fx: 0, fy: -1, frontage: 3 });
  b.issue(1, { kind: 'form', group: 4, cx: 12, cy: 2, fx: 0, fy: 1, frontage: 3 });
  b.startBattle();
  for (let i = 0; i < 10; i++) b.step();
  return b;
}

const centre = (b: Battle, gid: number) => {
  const m = b.activeMembers(gid);
  return { x: m.reduce((a, u) => a + u.x, 0) / m.length, y: m.reduce((a, u) => a + u.y, 0) / m.length };
};
const slotsCentre = (b: Battle, gid: number) => {
  const s = b.groupSlots(gid);
  return { x: s.reduce((a, q) => a + q.x, 0) / s.length, y: s.reduce((a, q) => a + q.y, 0) / s.length };
};

/** Step the battle, checking the queue after every step as the scene does each frame; the orders are issued at once. */
function runQueue(b: Battle, q: ThenQueue, maxTicks: number): { tick: number; orders: Order[] } | null {
  for (let i = 0; i < maxTicks; i++) {
    b.step();
    const due = q.due(b);
    if (due.length) {
      for (const o of due) b.issue(0, o);
      return { tick: b.tick, orders: due };
    }
  }
  return null;
}

describe('paused staging (controls.md R6.1)', () => {
  const plan: Order[] = [
    { kind: 'form', group: 0, cx: 15, cy: 24, fx: 0, fy: -1, frontage: 3 },
    { kind: 'order', group: 0, order: 'advance' },
    { kind: 'face', group: 0, fx: 1, fy: 0 },
    { kind: 'order', group: 0, order: 'charge' },
  ];

  it('issues the plan on Play at the same tick as issuing while paused: the same log and the same battle', () => {
    // immediate: the orders go to the sim while paused (the tick does not move)
    const a = started();
    for (const o of plan) a.issue(0, o);
    // staged: held on the client, then issued in order at the resume tick
    const b = started();
    const s = new StagedPlan();
    for (const o of plan) s.add(o);
    expect(b.orderLog.length).toBe(a.orderLog.length - plan.length);
    for (const o of s.flush()) b.issue(0, o);
    expect(b.orderLog).toEqual(a.orderLog);
    for (let i = 0; i < 400; i++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(b.tick).toBe(a.tick);
  });

  it('a replay of the staged battle\'s log reproduces it', () => {
    const b = started();
    const s = new StagedPlan();
    for (const o of plan) s.add(o);
    for (const o of s.flush()) b.issue(0, o);
    for (let i = 0; i < 300; i++) b.step();
    const r = new Battle(setup(11));
    let k = 0;
    const log = b.orderLog;
    const feed = () => {
      while (k < log.length && log[k].tick === r.tick) {
        r.issue(log[k].side, log[k].order);
        k++;
      }
    };
    feed();
    r.startBattle();
    while (r.tick < b.tick) {
      r.step();
      feed();
    }
    expect(r.hash()).toBe(b.hash());
  });

  it('removes one group\'s orders (the ✕ on its ghost), the newest (Undo) or all (Clear plan)', () => {
    const s = new StagedPlan();
    s.add({ kind: 'form', group: 0, cx: 1, cy: 1, fx: 0, fy: -1, frontage: 3 });
    s.add({ kind: 'order', group: 1, order: 'charge' });
    s.add({ kind: 'order', group: 0, order: 'hold' });
    expect(s.groups()).toEqual([0, 1]);
    expect(s.last(0, 'order')).toEqual({ kind: 'order', group: 0, order: 'hold' });
    expect(s.pop()?.order).toEqual({ kind: 'order', group: 0, order: 'hold' });
    expect(s.last(0, 'order')).toBeNull();
    expect(s.removeGroup(0)).toBe(1);
    expect(s.orders).toEqual([{ kind: 'order', group: 1, order: 'charge' }]);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.flush()).toEqual([]);
  });
});

describe('the "Then…" queue (controls.md R6.2, F1)', () => {
  it('"Then… Charge" fires on arrival and appears in the order log at the arrival tick', () => {
    const b = started();
    b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 22, fx: 0, fy: -1, frontage: 3 });
    const q = new ThenQueue();
    q.arm(0, 'charge', b);
    expect(q.get(0)).toBe('charge');
    const fired = runQueue(b, q, 40 * TICK_RATE);
    expect(fired).not.toBeNull();
    expect(fired!.orders).toEqual([{ kind: 'order', group: 0, order: 'charge' }]);
    // it fired because the group arrived (no contact this far out), and it is logged at that tick
    const c = centre(b, 0);
    const t = slotsCentre(b, 0);
    expect(Math.hypot(c.x - t.x, c.y - t.y)).toBeLessThanOrEqual(ARRIVE_DIST + 0.2);
    expect(b.activeMembers(0).some((u) => u.engaged)).toBe(false);
    const last = b.orderLog[b.orderLog.length - 1];
    expect(last).toEqual({ tick: fired!.tick, side: 0, order: { kind: 'order', group: 0, order: 'charge' } });
    expect(b.groups[0].order).toBe('charge');
    expect(q.size).toBe(0);
  });

  it('does not fire before the group has arrived', () => {
    const b = started();
    b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 16, fx: 0, fy: -1, frontage: 3 });
    const q = new ThenQueue();
    q.arm(0, 'hold', b);
    b.step();
    expect(q.due(b)).toEqual([]);
    expect(q.get(0)).toBe('hold');
  });

  it('fires once the group has been still for STILL_S, even short of its target', () => {
    const b = started();
    const q = new ThenQueue();
    // a target the men cannot reach in time is not needed: a group already standing is "still"
    q.arm(0, 'advance', b);
    let n = 0;
    while (!q.due(b).length && n < 10 * TICK_RATE) {
      b.step();
      n++;
    }
    // either arrived at once (already in its slots) or after standing STILL_S
    expect(n).toBeLessThanOrEqual(STILL_S * TICK_RATE + 1);
  });

  it('fires on contact', () => {
    const b = started();
    const q = new ThenQueue();
    // send the line into the enemy, with a target behind them: contact comes first
    b.issue(0, { kind: 'order', group: 0, order: 'advance' });
    b.issue(1, { kind: 'order', group: 4, order: 'advance' });
    for (let i = 0; i < 20; i++) b.step();
    b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 0.5, fx: 0, fy: -1, frontage: 3 });
    b.issue(0, { kind: 'order', group: 0, order: 'advance' });
    q.arm(0, 'hold', b);
    const fired = runQueue(b, q, 60 * TICK_RATE);
    expect(fired).not.toBeNull();
    expect(b.activeMembers(0).some((u) => u.engaged)).toBe(true);
  });

  it('keeps one step per group: arming again replaces it, clearing drops it', () => {
    const b = started();
    const q = new ThenQueue();
    q.arm(0, 'charge', b);
    q.arm(0, 'hold', b);
    expect(q.size).toBe(1);
    expect(q.get(0)).toBe('hold');
    expect(q.clear(0)).toBe(true);
    expect(q.get(0)).toBeNull();
    expect(q.clear(0)).toBe(false);
  });

  it('drops the step of a group that is gone', () => {
    const b = started();
    const q = new ThenQueue();
    q.arm(0, 'charge', b);
    b.groups[0].routed = true;
    expect(q.due(b)).toEqual([]);
    expect(q.size).toBe(0);
  });

  it('a pause never counts as standing still (the clock is the sim tick)', () => {
    const b = started();
    b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 16, fx: 0, fy: -1, frontage: 3 });
    const q = new ThenQueue();
    q.arm(0, 'charge', b);
    // paused: many frames, no steps
    for (let i = 0; i < 200; i++) expect(q.due(b)).toEqual([]);
    expect(q.get(0)).toBe('charge');
  });

  it('Shoot queues "Shoot on"; the other keys are group orders', () => {
    expect(thenOrder(2, 'loose')).toEqual({ kind: 'loose', group: 2, on: true });
    expect(thenOrder(2, 'fallback')).toEqual({ kind: 'order', group: 2, order: 'fallback' });
  });
});

describe('the staged Charge preview (controls.md R5)', () => {
  it('points from the group (or where the plan puts it) to the nearest enemy group, centre to centre', () => {
    const b = started();
    const c = chargeTarget(b, 0)!;
    expect(c.group).toBe(4);
    expect(c.from).toEqual(centre(b, 0));
    expect(c.to).toEqual(centre(b, 4));
    const moved = chargeTarget(b, 0, { x: 3, y: 10 })!;
    expect(moved.from).toEqual({ x: 3, y: 10 });
  });
});
