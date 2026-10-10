/**
 * FO-02: the feint and the disordered state (design/gdd/formations-orders.md R3).
 * Light troops run back for FEINT_S, turn and charge; enemy groups that
 * pursued them are disordered; an ineligible group's feint is a no-op.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { ordersRows, runFeintBait } from '../src/dev/ordersBalance';
import { Battle, RULES, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, Order, SimEvent } from '../src/sim/types';

/** Two human sides; each entry is [class, count, group]. Side 0 has groups 0..3, side 1 has 4..7. */
function setupOf(seed: number, a: [ClassId, number, number][], b: [ClassId, number, number][]): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  return { seed, armies: [side(a), side(b)] };
}

const G1 = 4;
const FEINT_TICKS = RULES.feintS * TICK_RATE;

/** Peltasts (group 3) at y 26, swordsmen (side 1, group 4) at y 14 charging them from tick 0. */
function bait(seed = 7, peltasts: ClassId = 'peltast'): { b: Battle; events: SimEvent[]; step: (n: number) => void } {
  const b = new Battle(setupOf(seed, [[peltasts, 4, 3]], [['celt_sword', 6, 0]]));
  b.issue(0, { kind: 'form', group: 3, cx: 12, cy: 24, fx: 0, fy: -1, frontage: 4 });
  b.issue(1, { kind: 'form', group: G1, cx: 12, cy: 12, fx: 0, fy: 1, frontage: 6 });
  b.startBattle();
  b.issue(1, { kind: 'order', group: G1, order: 'charge' });
  const events: SimEvent[] = [];
  const step = (n: number) => {
    for (let i = 0; i < n && b.phase !== 'ended'; i++) {
      b.step();
      events.push(...b.drainEvents());
    }
  };
  return { b, events, step };
}

describe('feint eligibility (R3.1)', () => {
  it('light infantry, missile men and riders may feint; heavy foot and mixed groups may not', () => {
    const b = new Battle(setupOf(1, [['peltast', 2, 0], ['archer', 2, 1], ['companion', 2, 3]], [['hoplite', 3, 0], ['hoplite', 2, 1], ['archer', 2, 1]]));
    expect(b.canFeint(0)).toBe(true);
    expect(b.canFeint(1)).toBe(true);
    expect(b.canFeint(3)).toBe(true);
    expect(b.canFeint(G1)).toBe(false);
    expect(b.canFeint(G1 + 1)).toBe(false);
    expect(b.canFeint(2)).toBe(false); // no men
  });

  it('an ineligible group ignores the feint: logged, and the battle plays exactly as without it', () => {
    const play = (feint: boolean) => {
      const b = new Battle(setupOf(2, [['hoplite', 6, 0]], [['hoplite', 6, 0]]));
      b.startBattle();
      for (let t = 0; t < 20 * 200 && b.phase !== 'ended'; t++) {
        if (feint && b.tick === 40) {
          b.issue(0, { kind: 'order', group: 0, order: 'feint' });
          expect(b.groups[0].order).toBe('hold');
        }
        b.step();
      }
      return b;
    };
    const plain = play(false);
    const tried = play(true);
    expect(tried.orderLog.some((o) => o.order.kind === 'order' && o.order.order === 'feint')).toBe(true);
    expect(tried.hash()).toBe(plain.hash());
    expect(tried.tick).toBe(plain.tick);
  });

  it('is ignored in deployment', () => {
    const b = new Battle(setupOf(1, [['peltast', 4, 3]], [['hoplite', 6, 0]]));
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    expect(b.groups[3].order).toBe('hold');
    expect(b.feintReady(3)).toBe(false);
  });
});

describe('feint behaviour (R3.2, R3.4)', () => {
  it('runs back for FEINT_S, then turns about and charges', () => {
    const { b, step } = bait();
    step(10);
    const g = b.groups[3];
    const y0 = g.formation.cy;
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    expect(g.order).toBe('feint');
    step(FEINT_TICKS - 1);
    expect(g.order).toBe('feint');
    expect(g.formation.cy).toBeGreaterThan(y0 + 3); // ran back toward its own edge
    expect(g.formation.fy).toBe(-1); // the formation still faces the enemy
    step(1);
    expect(g.order).toBe('charge');
  });

  it('men face away while running and face the enemy again after the turn-about', () => {
    const { b, step } = bait();
    step(10);
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    step(TICK_RATE * 2);
    const mean = () => b.activeMembers(3).reduce((s, u) => s + u.fy, 0) / b.activeMembers(3).length;
    expect(mean()).toBeGreaterThan(0.5); // facing their own edge (+y)
    step(FEINT_TICKS - TICK_RATE * 2 + TICK_RATE);
    expect(mean()).toBeLessThan(0);
  });

  it('runs at full speed, clamped to the field at the edge', () => {
    const b = new Battle(setupOf(3, [['peltast', 4, 3]], [['hoplite', 6, 0]]));
    b.issue(0, { kind: 'form', group: 3, cx: 12, cy: 34, fx: 0, fy: -1, frontage: 4 });
    b.startBattle();
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    for (let i = 0; i < FEINT_TICKS; i++) b.step();
    expect(b.groups[3].formation.cy).toBeLessThanOrEqual(b.height - 0.5);
    expect(b.groups[3].order).toBe('charge');
  });

  it('has a cooldown of FEINT_CD_S per group', () => {
    const { b, step } = bait();
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    step(FEINT_TICKS + 5);
    b.issue(0, { kind: 'order', group: 3, order: 'hold' });
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    expect(b.groups[3].order).toBe('hold');
    step(RULES.feintCdS * TICK_RATE - FEINT_TICKS);
    if (b.phase === 'battle' && !b.groups[3].routed) {
      b.issue(0, { kind: 'order', group: 3, order: 'feint' });
      expect(b.groups[3].order).toBe('feint');
    }
  });

  it('another order cancels it: no turn-about charge and no disorder', () => {
    const { b, events, step } = bait();
    step(10);
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    step(TICK_RATE);
    b.issue(0, { kind: 'order', group: 3, order: 'hold' });
    step(FEINT_TICKS);
    expect(b.groups[3].order).toBe('hold');
    expect(events.some((e) => e.type === 'disordered')).toBe(false);
  });

  it('works for riders', () => {
    const b = new Battle(setupOf(4, [['thessalian', 3, 3]], [['hoplite', 6, 0]]));
    b.startBattle();
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    expect(b.groups[3].order).toBe('feint');
    for (let i = 0; i < FEINT_TICKS; i++) b.step();
    expect(b.groups[3].order).toBe('charge');
  });
});

describe('the bait: pursuers become disordered (R3.3)', () => {
  function feintAt(tick: number) {
    const r = bait();
    r.step(tick);
    r.b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    return { ...r, at: r.b.tick };
  }

  it('a charging group that chased the feint is disordered for DISORDER_S, with one event', () => {
    const { b, events, step, at } = feintAt(10);
    step(FEINT_TICKS);
    const dis = events.filter((e): e is Extract<SimEvent, { type: 'disordered' }> => e.type === 'disordered');
    expect(dis).toEqual([{ type: 'disordered', tick: at + FEINT_TICKS, group: G1, untilTick: at + FEINT_TICKS + RULES.disorderS * TICK_RATE }]);
    expect(b.disordered(G1)).toBe(true);
    step(RULES.disorderS * TICK_RATE);
    expect(b.disordered(G1)).toBe(false);
    expect(events.filter((e) => e.type === 'disordered')).toHaveLength(1);
  });

  it('disorder costs block and scatters the slots', () => {
    const { b, step } = feintAt(10);
    step(FEINT_TICKS - 1);
    const u = b.activeMembers(G1)[0];
    const block = b.blockChance(u, 'front', 0, false);
    step(1);
    expect(b.disordered(G1)).toBe(true);
    expect(b.blockChance(u, 'front', 0, false)).toBeCloseTo(Math.max(0, block - RULES.disorderBlock), 9);
    const f = b.groups[G1].formation;
    const off = b.slotPos(u);
    const dx = off.x - (f.cx - f.fy * u.slotLat - f.fx * u.slotDep);
    const dy = off.y - (f.cy + f.fx * u.slotLat - f.fy * u.slotDep);
    expect(Math.abs(dx)).toBeLessThanOrEqual(RULES.disorderScatter);
    expect(Math.abs(dy)).toBeLessThanOrEqual(RULES.disorderScatter);
    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
  });

  it('a holding group is not drawn: no disorder', () => {
    const b = new Battle(setupOf(7, [['peltast', 4, 3]], [['celt_sword', 6, 0]]));
    b.issue(0, { kind: 'form', group: 3, cx: 12, cy: 24, fx: 0, fy: -1, frontage: 4 });
    b.issue(1, { kind: 'form', group: G1, cx: 12, cy: 12, fx: 0, fy: 1, frontage: 6 });
    b.startBattle();
    b.issue(0, { kind: 'order', group: 3, order: 'feint' });
    const events: SimEvent[] = [];
    for (let i = 0; i < FEINT_TICKS + 2; i++) {
      b.step();
      events.push(...b.drainEvents());
    }
    expect(events.some((e) => e.type === 'disordered')).toBe(false);
    expect(b.disordered(G1)).toBe(false);
  });

  it('the bait pays: on a few seeds the peltasts side does better feinting than withdrawing (balance row)', () => {
    const seeds = [24000, 24001, 24002, 24003, 24004, 24005, 24006, 24007];
    const sum = (feint: boolean) => seeds.reduce((a, s) => a + runFeintBait(s, feint), 0);
    expect(sum(true)).toBeGreaterThan(sum(false));
    expect(ordersRows(4).map((r) => r.target)).toEqual(expect.arrayContaining(['>= 8 pts', '>= 55%', '55-70%', '20-35%']));
  });

  it('is deterministic: replaying the order log gives the same hash', () => {
    const { b, step } = feintAt(20);
    step(20 * 120);
    const replay = new Battle(setupOf(7, [['peltast', 4, 3]], [['celt_sword', 6, 0]]));
    const log = b.orderLog;
    let i = 0;
    while (i < log.length && log[i].tick === 0 && replay.phase === 'deploy' && i < 2) replay.issue(log[i].side, log[i++].order);
    replay.startBattle();
    while (replay.phase !== 'ended' && replay.tick < b.tick) {
      while (i < log.length && log[i].tick === replay.tick) replay.issue(log[i].side, log[i++].order as Order);
      replay.step();
    }
    expect(replay.hash()).toBe(b.hash());
  });
});
