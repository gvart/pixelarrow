/**
 * FO-01: `face` keeps the order, a small `form` keeps it too, and focus fire
 * (design/gdd/formations-orders.md R1, R4).
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { ordersRows, runFocusSlingers } from '../src/dev/ordersBalance';
import { Battle, RULES, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, Order, Side } from '../src/sim/types';
import { standardSetup } from './helpers';

/** Two human sides; each entry is [class, count, group]. */
function setupOf(seed: number, a: [ClassId, number, number][], b: [ClassId, number, number][]): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  return { seed, armies: [side(a), side(b)] };
}

/** Group ids: side 0 has groups 0..3, side 1 has 4..7 (armySpec makes four per side). */
const G1 = 4;

function form(b: Battle, side: Side, group: number, cx: number, cy: number, fy: number, frontage = 4): void {
  b.issue(side, { kind: 'form', group, cx, cy, fx: 0, fy, frontage });
}

function steps(b: Battle, n: number, each?: () => void): void {
  for (let i = 0; i < n && b.phase !== 'ended'; i++) {
    each?.();
    b.step();
  }
}

/** Angle in degrees between two unit vectors. */
const angle = (ax: number, ay: number, bx: number, by: number) => (Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by))) * 180) / Math.PI;

describe('face (formations-orders.md R1)', () => {
  function charging(): Battle {
    const b = new Battle(setupOf(5, [['hoplite', 6, 0]], [['hoplite', 6, 0]]));
    form(b, 0, 0, 12, 30, -1);
    form(b, 1, G1, 12, 2, 1);
    b.startBattle();
    b.issue(0, { kind: 'order', group: 0, order: 'charge' });
    steps(b, 5);
    return b;
  }

  it('keeps a charge going and turns the group toward the new facing', () => {
    const b = charging();
    const g = b.groups[0];
    b.issue(0, { kind: 'face', group: 0, fx: 1, fy: -1 });
    expect(g.order).toBe('charge');
    steps(b, 2 * TICK_RATE);
    expect(g.order).toBe('charge');
    expect(angle(g.formation.fx, g.formation.fy, Math.SQRT1_2, -Math.SQRT1_2)).toBeLessThan(0.01);
  });

  it('wheels a moving group at the foot turn rate, pivoting on its centre', () => {
    const b = charging();
    const f = b.groups[0].formation;
    b.issue(0, { kind: 'face', group: 0, fx: 1, fy: 0 }); // a quarter turn
    steps(b, TICK_RATE / 2);
    const turned = angle(0, -1, f.fx, f.fy);
    expect(turned).toBeGreaterThan(RULES.turnRateFoot / 2 - 1);
    expect(turned).toBeLessThanOrEqual(RULES.turnRateFoot / 2 + 0.01);
    steps(b, TICK_RATE);
    expect(angle(f.fx, f.fy, 1, 0)).toBeLessThan(0.01);
  });

  it('wheels riders at the slower horse rate', () => {
    const b = new Battle(setupOf(6, [['companion', 2, 3]], [['hoplite', 6, 0]]));
    form(b, 0, 3, 12, 30, -1, 2);
    form(b, 1, G1, 12, 2, 1);
    b.startBattle();
    b.issue(0, { kind: 'order', group: 3, order: 'advance' });
    b.issue(0, { kind: 'face', group: 3, fx: 1, fy: 0 });
    steps(b, TICK_RATE / 2);
    const f = b.groups[3].formation;
    expect(angle(0, -1, f.fx, f.fy)).toBeCloseTo(RULES.turnRateHorse / 2, 0);
  });

  it('turns a holding group at once and keeps fallback distance', () => {
    const b = new Battle(setupOf(7, [['hoplite', 6, 0]], [['hoplite', 6, 0]]));
    b.startBattle();
    const g = b.groups[0];
    b.issue(0, { kind: 'face', group: 0, fx: -1, fy: 0 });
    expect(g.order).toBe('hold');
    expect([g.formation.fx, g.formation.fy]).toEqual([-1, 0]);
    b.issue(0, { kind: 'order', group: 0, order: 'fallback' });
    const left = g.fallbackLeft;
    b.issue(0, { kind: 'face', group: 0, fx: 0, fy: -1 });
    expect(g.order).toBe('fallback');
    expect(g.fallbackLeft).toBe(left);
  });

  it('ignores a zero vector, a routed group and an enemy group', () => {
    const b = new Battle(setupOf(8, [['hoplite', 6, 0]], [['hoplite', 6, 0]]));
    b.startBattle();
    const g = b.groups[0];
    const before = { ...g.formation };
    b.issue(0, { kind: 'face', group: 0, fx: 0, fy: 0 });
    b.issue(1, { kind: 'face', group: 0, fx: 1, fy: 0 });
    g.routed = true;
    b.issue(0, { kind: 'face', group: 0, fx: 1, fy: 0 });
    expect(g.formation).toEqual(before);
  });
});

describe('form keeps the order on a small move (formations-orders.md R1.2)', () => {
  function advancing(): Battle {
    const b = new Battle(setupOf(9, [['hoplite', 6, 0]], [['hoplite', 6, 0]]));
    form(b, 0, 0, 12, 30, -1);
    form(b, 1, G1, 12, 2, 1);
    b.startBattle();
    b.issue(0, { kind: 'order', group: 0, order: 'advance' });
    steps(b, 3);
    return b;
  }

  it('a move under FORM_RESET_DIST keeps advance', () => {
    const b = advancing();
    const f = b.groups[0].formation;
    form(b, 0, 0, f.cx + RULES.formResetDist - 0.1, f.cy, -1);
    expect(b.groups[0].order).toBe('advance');
  });

  it('a move of FORM_RESET_DIST or more sets hold', () => {
    const b = advancing();
    const f = b.groups[0].formation;
    form(b, 0, 0, f.cx + RULES.formResetDist, f.cy, -1);
    expect(b.groups[0].order).toBe('hold');
  });

  it('a small form during fallback keeps the fallback distance; a big one ends it', () => {
    const b = advancing();
    const g = b.groups[0];
    b.issue(0, { kind: 'order', group: 0, order: 'fallback' });
    const left = g.fallbackLeft;
    form(b, 0, 0, g.formation.cx + 1, g.formation.cy, -1);
    expect(g.order).toBe('fallback');
    expect(g.fallbackLeft).toBe(left);
    form(b, 0, 0, g.formation.cx + 3, g.formation.cy, -1);
    expect(g.order).toBe('hold');
    expect(g.fallbackLeft).toBe(0);
  });
});

describe('focus fire (formations-orders.md R4)', () => {
  /**
   * 4 archers (side 0, group 1) face two hoplite groups that hold: group 4 is
   * the nearest, group 6 is farther off to the side.
   */
  function range(farX: number): Battle {
    const b = new Battle(setupOf(11, [['archer', 4, 1]], [['hoplite', 3, 0], ['hoplite', 3, 2]]));
    form(b, 0, 1, 12, 23, -1);
    form(b, 1, G1, 12, 13, 1, 3);
    form(b, 1, G1 + 2, farX, 12, 1, 3);
    b.startBattle();
    return b;
  }

  /** Mean distance from where side 0's arrows were aimed to a group's men. */
  function aimedAt(b: Battle, group: number, ticks: number): number {
    let sum = 0;
    let n = 0;
    const seen = new Set<number>();
    steps(b, ticks, () => {
      for (const p of b.projectiles) {
        if (p.side !== 0 || seen.has(p.id)) continue;
        seen.add(p.id);
        const men = b.activeMembers(group);
        if (!men.length) continue;
        sum += Math.min(...men.map((u) => Math.hypot(u.x - p.tx, u.y - p.ty)));
        n++;
      }
    });
    expect(n).toBeGreaterThan(0);
    return sum / n;
  }

  it('without focus the archers shoot the nearest group', () => {
    const b = range(3);
    expect(aimedAt(b, G1, 3 * TICK_RATE)).toBeLessThan(2);
  });

  it('with focus they shoot the focused group while it is in range', () => {
    const b = range(3);
    const r = b.units.find((u) => u.side === 0)!.stats.range;
    const far = b.activeMembers(G1 + 2)[0];
    const archer = b.activeMembers(1)[0];
    expect(Math.hypot(far.x - archer.x, far.y - archer.y)).toBeLessThan(r); // the setup puts it in range
    b.issue(0, { kind: 'focus', group: 1, target: G1 + 2 });
    expect(b.groups[1].focus).toBe(G1 + 2);
    expect(aimedAt(b, G1 + 2, 3 * TICK_RATE)).toBeLessThan(2);
    expect(b.groups[1].focusOutOfRange).toBe(false);
  });

  it('falls back to the nearest when the focused group is out of range, and says so', () => {
    const b = new Battle(setupOf(12, [['archer', 4, 1]], [['hoplite', 3, 0], ['hoplite', 3, 2]]));
    form(b, 0, 1, 12, 23, -1);
    form(b, 1, G1, 12, 13, 1, 3);
    form(b, 1, G1 + 2, 2, 1, 1, 3); // the far corner
    b.startBattle();
    b.issue(0, { kind: 'focus', group: 1, target: G1 + 2 });
    expect(aimedAt(b, G1, 3 * TICK_RATE)).toBeLessThan(2);
    expect(b.groups[1].focusOutOfRange).toBe(true);
    expect(b.groups[1].noTargetS).toBe(0);
  });

  it('counts seconds with no enemy in range', () => {
    const b = new Battle(setupOf(13, [['archer', 4, 1]], [['hoplite', 3, 0]]));
    form(b, 0, 1, 12, 35, -1);
    form(b, 1, G1, 12, 1, 1, 3);
    b.startBattle();
    steps(b, 2 * TICK_RATE);
    expect(b.groups[1].noTargetS).toBeCloseTo(2, 5);
    b.issue(0, { kind: 'loose', group: 1, on: false });
    steps(b, 1);
    expect(b.groups[1].noTargetS).toBe(0);
  });

  it('clears when the focused group is gone', () => {
    const b = range(3);
    b.issue(0, { kind: 'focus', group: 1, target: G1 + 2 });
    for (const u of b.members(G1 + 2)) u.state = 'fled';
    steps(b, 1);
    expect(b.groups[1].focus).toBe(-1);
    expect(b.groups[1].focusOutOfRange).toBe(false);
  });

  it('ignores a focus on an own group or an unknown one, and -1 clears it', () => {
    const b = range(3);
    b.issue(0, { kind: 'focus', group: 1, target: 0 });
    b.issue(0, { kind: 'focus', group: 1, target: 99 });
    expect(b.groups[1].focus).toBeUndefined();
    b.issue(0, { kind: 'focus', group: 1, target: G1 });
    b.issue(0, { kind: 'focus', group: 1, target: -1 });
    expect(b.groups[1].focus).toBe(-1);
  });
});

describe('orders balance rows (src/dev/ordersBalance.ts)', () => {
  // the seeded balance battles of ordersRows(4): seconds idle, several times that under load
  it('prints the FO-01 rows against their GDD targets', { timeout: 120_000 }, () => {
    const rows = ordersRows(4);
    expect(rows.map((r) => r.target)).toEqual(expect.arrayContaining(['flanker >= 52%', '>= 30%']));
  });

  it('focus fire silences reserve slingers sooner than nearest fire (a few seeds)', () => {
    const seeds = [22001, 22005, 22007, 22009];
    const t = (focus: boolean) => seeds.reduce((a, s) => a + runFocusSlingers(s, focus), 0);
    expect(t(true)).toBeLessThan(t(false) * 0.7);
  });
});

describe('determinism with face and focus', () => {
  const orders: [number, Order][] = [
    [40, { kind: 'order', group: 0, order: 'advance' }],
    [60, { kind: 'face', group: 0, fx: 0.4, fy: -1 }],
    [80, { kind: 'focus', group: 1, target: 5 }],
    [120, { kind: 'form', group: 0, cx: 12, cy: 20, fx: 0, fy: -1, frontage: 4 }],
    [200, { kind: 'order', group: 2, order: 'charge' }],
    [210, { kind: 'face', group: 2, fx: -1, fy: -1 }],
  ];

  function play(): Battle {
    const b = new Battle(standardSetup(77, false).setup);
    b.startBattle();
    let i = 0;
    for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) {
      while (i < orders.length && orders[i][0] === b.tick) b.issue(0, orders[i++][1]);
      b.step();
    }
    return b;
  }

  it('the same orders at the same ticks give the same hash', () => {
    const a = play();
    const b = play();
    expect(a.phase).toBe('ended');
    expect(b.hash()).toBe(a.hash());
    expect(a.orderLog.map((o) => o.order.kind)).toEqual(expect.arrayContaining(['face', 'focus']));
  });
});
