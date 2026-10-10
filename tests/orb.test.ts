/**
 * FO-02: the orb (design/gdd/formations-orders.md R2, F1). A ring facing
 * outward with no flanks, slow, weaker blows and shots, no charge, no riders.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle, RULES, TICK_RATE } from '../src/sim/battle';
import { FORMATION_TYPES, ORB, formationSlots, orbRings, turnCosSin } from '../src/sim/formation';
import { Rng } from '../src/sim/rng';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, Side } from '../src/sim/types';

/** Two human sides; each entry is [class, count, group]. Side 0 has groups 0..3, side 1 has 4..7. */
function setupOf(seed: number, a: [ClassId, number, number][], b: [ClassId, number, number][]): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  return { seed, armies: [side(a), side(b)] };
}

const G1 = 4;

function form(b: Battle, side: Side, group: number, cx: number, cy: number, fy: number): void {
  b.issue(side, { kind: 'form', group, cx, cy, fx: 0, fy, frontage: 4 });
}

function steps(b: Battle, n: number): void {
  for (let i = 0; i < n && b.phase !== 'ended'; i++) b.step();
}

/** Eight hoplites in an orb at (12, 24); the enemy far off. */
function orbBattle(): Battle {
  const b = new Battle(setupOf(3, [['hoplite', 8, 0]], [['hoplite', 6, 0]]));
  form(b, 0, 0, 12, 24, -1);
  form(b, 1, G1, 12, 4, 1);
  b.issue(0, { kind: 'preset', group: 0, type: 'orb' });
  return b;
}

describe('orb geometry (F1)', () => {
  it('is a formation type the server schema takes', () => {
    expect(FORMATION_TYPES).toContain('orb');
  });

  it('cos and sin from the Taylor series match Math within 1e-9', () => {
    for (let k = 0; k < 64; k++) {
      const t = k / 64;
      const { c, s } = turnCosSin(t);
      expect(Math.abs(c - Math.cos(t * 2 * Math.PI))).toBeLessThan(1e-9);
      expect(Math.abs(s - Math.sin(t * 2 * Math.PI))).toBeLessThan(1e-9);
    }
  });

  it.each([
    [1, 1, ORB.rMin],
    [8, 8, 2.56],
    [16, 16, 5.12],
    [24, 24, 7.68],
    [40, 20, 6.4],
    [64, 32, 10.24],
  ])('n = %i: %i men in the outer ring at radius %f', (n, outer, r) => {
    const o = orbRings(n);
    expect(o.outer).toBe(outer);
    expect(o.r).toBeCloseTo(r, 9);
    const slots = formationSlots({ type: 'orb', cx: 10, cy: 10, fx: 0, fy: -1, frontage: n }, n);
    expect(slots).toHaveLength(n);
    const dist = slots.map((p) => Math.sqrt((p.x - 10) ** 2 + (p.y - 10) ** 2));
    for (const d of dist.slice(0, outer)) expect(d).toBeCloseTo(o.r, 6);
    for (const d of dist.slice(outer)) expect(d).toBeCloseTo(o.rIn, 6);
  });

  it('puts every man on his own slot round the ring, facing outward', () => {
    const b = orbBattle();
    const f = b.groups[0].formation;
    const r = orbRings(8).r;
    const men = b.activeMembers(0);
    const seen = new Set<string>();
    for (const u of men) {
      const dx = u.x - f.cx;
      const dy = u.y - f.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      expect(d).toBeCloseTo(r, 6);
      expect((dx * u.fx + dy * u.fy) / d).toBeGreaterThan(0.999);
      seen.add(`${u.x.toFixed(3)},${u.y.toFixed(3)}`);
    }
    expect(seen.size).toBe(8);
  });
});

describe('orb rules (R2)', () => {
  it('a flank or rear blow from outside the ring lands on the front; a breach uses the normal rule', () => {
    const b = orbBattle();
    b.startBattle();
    const f = b.groups[0].formation;
    // The man at the front of the ring faces north; strike him from his rear, outside the ring.
    const u = b.activeMembers(0).reduce((a, m) => (m.y < a.y ? m : a));
    expect(b.hitDirection(u, u.x, u.y - 1)).toBe('front');
    expect(b.hitDirection(u, u.x + 1, u.y - 3.2)).toBe('front');
    expect(b.hitDirection(u, u.x - 5, u.y)).toBe('front');
    // From inside the ring (a breach), behind him: the normal rule.
    expect(b.hitDirection(u, f.cx, f.cy)).toBe('rear');

    // The same man in a line is hit in the rear.
    b.issue(0, { kind: 'preset', group: 0, type: 'line' });
    expect(b.hitDirection(u, f.cx, f.cy + 3)).toBe('rear');
  });

  it('riders cannot form an orb: preset and form keep the shape, a setup orb stands in line', () => {
    const b = new Battle(setupOf(4, [['companion', 3, 3], ['hoplite', 4, 0]], [['hoplite', 6, 0]]));
    expect(b.canOrb(3)).toBe(false);
    expect(b.canOrb(0)).toBe(true);
    b.issue(0, { kind: 'preset', group: 3, type: 'orb' });
    expect(b.groups[3].formation.type).not.toBe('orb');
    b.issue(0, { kind: 'form', group: 3, cx: 8, cy: 28, fx: 0, fy: -1, frontage: 3, type: 'orb' });
    expect(b.groups[3].formation.type).not.toBe('orb');
    expect(b.groups[3].formation.cx).toBe(8);

    const setup = setupOf(4, [['companion', 3, 3]], [['hoplite', 6, 0]]);
    setup.armies[0].groups[3].formation = 'orb';
    expect(new Battle(setup).groups[3].formation.type).toBe('line');
  });

  it('a rider assigned into an orb in deployment opens it into a line', () => {
    const b = new Battle(setupOf(4, [['hoplite', 4, 0], ['companion', 1, 3]], [['hoplite', 6, 0]]));
    b.issue(0, { kind: 'preset', group: 0, type: 'orb' });
    expect(b.groups[0].formation.type).toBe('orb');
    const rider = b.activeMembers(3)[0];
    b.issue(0, { kind: 'assign', unit: rider.id, group: 0 });
    expect(b.groups[0].formation.type).toBe('line');
  });

  it('a malformed shape is ignored, and a setup with an unknown shape stands in line', () => {
    const b = orbBattle();
    b.issue(0, { kind: 'preset', group: 0, type: 'circle' as never });
    b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 24, fx: 0, fy: -1, frontage: 4, type: 'circle' as never });
    expect(b.groups[0].formation.type).toBe('orb');
    const setup = setupOf(4, [['hoplite', 4, 0]], [['hoplite', 6, 0]]);
    (setup.armies[0].groups[0] as { formation: string }).formation = 'circle';
    expect(() => new Battle(setup)).not.toThrow();
    expect(new Battle(setup).groups[0].formation.type).toBe('line');
  });

  it('a charge opens the orb into a line at its facing first', () => {
    const b = orbBattle();
    b.startBattle();
    b.issue(0, { kind: 'order', group: 0, order: 'charge' });
    expect(b.groups[0].order).toBe('charge');
    expect(b.groups[0].formation.type).toBe('line');
    expect(b.groups[0].formation.fy).toBe(-1);
  });

  it('takes no shield wall', () => {
    const b = orbBattle();
    b.issue(0, { kind: 'shieldwall', group: 0, on: true });
    expect(b.groups[0].shieldWall).toBe(false);
  });

  it(`advances at ${RULES.orbSpeed} of a line's pace`, () => {
    const moved = (orb: boolean) => {
      const b = new Battle(setupOf(3, [['hoplite', 8, 0]], [['hoplite', 6, 0]]));
      form(b, 0, 0, 12, 30, -1);
      form(b, 1, G1, 12, 2, 1);
      if (orb) b.issue(0, { kind: 'preset', group: 0, type: 'orb' });
      b.startBattle();
      b.issue(0, { kind: 'order', group: 0, order: 'advance' });
      steps(b, TICK_RATE);
      return 30 - b.groups[0].formation.cy;
    };
    expect(moved(true) / moved(false)).toBeCloseTo(RULES.orbSpeed, 6);
  });

  it('a face turns the orb on the spot, keeping its order', () => {
    const b = orbBattle();
    b.startBattle();
    b.issue(0, { kind: 'order', group: 0, order: 'advance' });
    b.issue(0, { kind: 'face', group: 0, fx: 1, fy: 0 });
    expect(b.groups[0].order).toBe('advance');
    expect(b.groups[0].formation.fx).toBe(1);
  });

  it('is deterministic: the same orb battle twice ends with the same hash', () => {
    const play = () => {
      const b = new Battle(setupOf(9, [['hoplite', 6, 0], ['archer', 4, 1]], [['celt_sword', 8, 0]]));
      form(b, 0, 0, 12, 24, -1);
      b.issue(0, { kind: 'preset', group: 0, type: 'orb' });
      b.issue(0, { kind: 'preset', group: 1, type: 'orb' });
      b.startBattle();
      b.issue(1, { kind: 'order', group: G1, order: 'charge' });
      steps(b, 20 * 300);
      return { hash: b.hash(), tick: b.tick, winner: b.winner };
    };
    const a = play();
    expect(a.winner).not.toBeNull();
    expect(play()).toEqual(a);
  });
});
