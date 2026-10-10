/**
 * FO-03: group cohesion and army break (design/gdd/formations-orders.md R5,
 * R6, F2, F3). A routing group shakes its own men and its neighbours; a beaten
 * army that is outnumbered 3 to 1 breaks, drains morale and cannot rally.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { runDeadFight } from '../src/dev/ordersBalance';
import { Battle, RULES, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, LoggedOrder, Order, SimEvent, SimUnit, Side } from '../src/sim/types';

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

/**
 * Side 0: group 0 (6 hoplites) at (6, 28), group 1 (4 hoplites) beside it at
 * (10, 28), group 2 (4 archers) far off at (20, 34). Side 1 holds far away at
 * the other end, so nothing but the test touches morale.
 */
function camp(seed = 5): Battle {
  const b = new Battle(setupOf(seed, [['hoplite', 6, 0], ['hoplite', 4, 1], ['archer', 4, 2]], [['hoplite', 6, 0]]));
  form(b, 0, 0, 6, 28, -1);
  form(b, 0, 1, 10, 28, -1);
  form(b, 0, 2, 20, 34, -1);
  form(b, 1, G1, 12, 2, 1);
  b.startBattle();
  return b;
}

/** Break group 0: half its men turn and run (the rout rule then sets the routed flag). */
function breakGroup(b: Battle, group = 0): void {
  const mem = b.members(group);
  for (const u of mem.slice(0, Math.ceil(mem.length / 2))) u.morale = -100;
}

function run(b: Battle, n: number, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n && b.phase !== 'ended'; i++) {
    b.step();
    events.push(...b.drainEvents());
  }
  return events;
}

/** Morale of every unit just after the tick group 0's routed flag rises. */
function moraleAtRout(b: Battle): { morale: number[]; ev: SimEvent[] } {
  run(b, 5);
  breakGroup(b);
  const ev: SimEvent[] = [];
  for (let i = 0; i < 20 && !ev.some((e) => e.type === 'rout'); i++) run(b, 1, ev);
  return { morale: b.units.map((u) => u.morale), ev };
}

function withRules<T>(patch: Partial<typeof RULES>, fn: () => T): T {
  const saved = { ...RULES };
  Object.assign(RULES, patch);
  try {
    return fn();
  } finally {
    Object.assign(RULES, saved);
  }
}

describe('cohesion shock (R5, F3)', () => {
  it('a rout costs its own standing men COHESION_SELF and the near group COHESION_NEAR, the far group nothing', () => {
    const on = moraleAtRout(camp());
    const off = withRules({ cohesionSelf: 0, cohesionNear: 0 }, () => moraleAtRout(camp()));
    const b = camp();
    const delta = (u: SimUnit) => on.morale[b.units.indexOf(u)] - off.morale[b.units.indexOf(u)];
    const ev = on.ev.filter((e) => e.type === 'cohesion');
    expect(ev).toHaveLength(1);
    const shock = ev[0] as Extract<SimEvent, { type: 'cohesion' }>;
    expect(shock).toMatchObject({ side: 0, group: 0 });

    const own = b.members(0).slice(3);
    const near = b.members(1);
    const far = b.members(2);
    for (const u of own) expect(delta(u)).toBeCloseTo(-RULES.cohesionSelf, 9);
    for (const u of near) expect(delta(u)).toBeCloseTo(-RULES.cohesionNear, 9);
    for (const u of far) expect(delta(u)).toBe(0);
    expect(shock.targets).toEqual([...own, ...near].map((u) => u.id));
    // the enemy is never shaken
    for (const u of b.units.filter((x) => x.side === 1)) expect(delta(u)).toBe(0);
  });

  it('the standard-aura hook scales the shock (AB-03 returns 0.5 inside the aura; the default is 1)', () => {
    class Halved extends Battle {
      override shockFactor(): number {
        return 0.5;
      }
    }
    const make = (B: typeof Battle) => {
      const b = new B(setupOf(5, [['hoplite', 6, 0], ['hoplite', 4, 1], ['archer', 4, 2]], [['hoplite', 6, 0]]));
      form(b, 0, 0, 6, 28, -1);
      form(b, 0, 1, 10, 28, -1);
      form(b, 0, 2, 20, 34, -1);
      form(b, 1, G1, 12, 2, 1);
      b.startBattle();
      return b;
    };
    expect(camp().shockFactor(camp().units[0])).toBe(1);
    const full = moraleAtRout(make(Battle));
    const half = moraleAtRout(make(Halved));
    const off = withRules({ cohesionSelf: 0, cohesionNear: 0 }, () => moraleAtRout(make(Battle)));
    const b = camp();
    const at = (m: number[], u: SimUnit) => m[b.units.indexOf(u)];
    for (const u of b.members(0).slice(3)) {
      expect(at(full.morale, u) - at(off.morale, u)).toBeCloseTo(-10, 9);
      expect(at(half.morale, u) - at(off.morale, u)).toBeCloseTo(-5, 9);
    }
    for (const u of b.members(1)) expect(at(half.morale, u) - at(off.morale, u)).toBeCloseTo(-2.5, 9);
  });

  it('fires once per rising edge, and a group that rallies and routs again shakes again only after 10 s', () => {
    const b = camp();
    const ev = run(b, 5);
    breakGroup(b);
    run(b, 40, ev);
    expect(b.groups[0].routed).toBe(true);
    expect(ev.filter((e) => e.type === 'cohesion')).toHaveLength(1);
    const first = ev.find((e) => e.type === 'cohesion')!.tick;

    const flip = (state: 'ready' | 'routing') => {
      for (const u of b.members(0).slice(0, 3)) {
        u.state = state;
        if (state === 'routing') u.morale = -100;
        else u.morale = u.stats.morale;
      }
    };
    // rally, then rout again at once: the flag rises a second time, but no shock within 10 s
    flip('ready');
    run(b, 1, ev);
    expect(b.groups[0].routed).toBe(false);
    flip('routing');
    run(b, 1, ev);
    expect(b.groups[0].routed).toBe(true);
    expect(ev.filter((e) => e.type === 'cohesion')).toHaveLength(1);

    // after the 10 s window a new rising edge shakes again
    run(b, Math.max(0, first + RULES.cohesionCooldownS * TICK_RATE - b.tick), ev);
    flip('ready');
    run(b, 1, ev);
    flip('routing');
    run(b, 1, ev);
    const shocks = ev.filter((e) => e.type === 'cohesion');
    expect(shocks).toHaveLength(2);
    expect(shocks[1].tick - shocks[0].tick).toBeGreaterThanOrEqual(RULES.cohesionCooldownS * TICK_RATE);
  });
});

/** 10 hoplites each side, in contact; `left` men of side 0 stay standing (the rest are struck down). */
function lastStand(left: number, enemy = 7): { b: Battle; ev: SimEvent[] } {
  const b = new Battle(setupOf(9, [['hoplite', 10, 0]], [['hoplite', 10, 0]]));
  form(b, 0, 0, 12, 20, -1);
  form(b, 1, G1, 12, 16, 1);
  b.startBattle();
  b.issue(1, { kind: 'order', group: G1, order: 'advance' });
  const ev = run(b, 1);
  for (let i = 0; i < 400 && !ev.some((e) => e.type === 'contact'); i++) run(b, 1, ev);
  expect(ev.some((e) => e.type === 'contact')).toBe(true);
  const down = (side: Side, keep: number) => {
    const mem = b.units.filter((u) => u.side === side);
    for (const u of mem.slice(keep)) {
      u.state = 'dead';
      u.hp = 0;
    }
    for (const u of mem.slice(0, keep)) u.morale = u.stats.morale;
  };
  down(0, left);
  down(1, enemy);
  return { b, ev };
}

describe('army break (R6, F2)', () => {
  it('2 of 10 men left against 7: the side breaks, once, and its men drain ARMY_BREAK_DRAIN a second', () => {
    const { b, ev } = lastStand(2);
    const men = b.units.filter((u) => u.side === 0 && u.state === 'ready');
    run(b, 20 - (b.tick % 20), ev); // to the next one-second check
    expect(b.isBroken(0)).toBe(true);
    expect(b.isBroken(1)).toBe(false);
    expect(ev.filter((e) => e.type === 'armyBreak')).toEqual([expect.objectContaining({ type: 'armyBreak', side: 0 })]);
    run(b, 300, ev);
    expect(ev.filter((e) => e.type === 'armyBreak')).toHaveLength(1);
    // fresh men, under the drain and 7 to 2 in melee, break and run within 15 s
    expect(men.every((u) => u.state !== 'ready')).toBe(true);
  });

  it('the drain is exactly ARMY_BREAK_DRAIN morale at each one-second check', () => {
    const at = (drain: number) =>
      withRules({ armyBreakDrain: drain }, () => {
        const { b } = lastStand(2);
        run(b, 20 - (b.tick % 20));
        return b.units.filter((u) => u.side === 0).slice(0, 2).map((u) => u.morale);
      });
    const on = at(RULES.armyBreakDrain);
    const off = at(0);
    expect(on[0] - off[0]).toBeCloseTo(-RULES.armyBreakDrain, 9);
    expect(on[1] - off[1]).toBeCloseTo(-RULES.armyBreakDrain, 9);
  });

  it('3 of 10 left against 7 is a last stand, not a break', () => {
    const { b, ev } = lastStand(3);
    run(b, 40, ev);
    expect(b.isBroken(0)).toBe(false);
    expect(ev.some((e) => e.type === 'armyBreak')).toBe(false);
  });

  it('2 of 10 left against 5 is not outnumbered 3 to 1, so no break', () => {
    const { b, ev } = lastStand(2, 5);
    run(b, 40, ev);
    expect(b.isBroken(0)).toBe(false);
  });

  it('never applies before the first contact', () => {
    const b = camp();
    for (const u of b.units.filter((x) => x.side === 0).slice(2)) {
      u.state = 'dead';
      u.hp = 0;
    }
    const ev = run(b, 60);
    expect(b.isBroken(0)).toBe(false);
    expect(ev.some((e) => e.type === 'armyBreak')).toBe(false);
  });

  it('a broken side cannot rally: its routers keep running while the condition holds', () => {
    const { b, ev } = lastStand(2);
    run(b, 20 - (b.tick % 20), ev);
    expect(b.isBroken(0)).toBe(true);
    const u = b.units.find((x) => x.side === 0 && x.state === 'ready')!;
    u.state = 'routing';
    u.morale = u.stats.morale; // would rally at once anywhere safe
    u.y = 30;
    run(b, 10, ev);
    expect(u.state === 'routing' || u.state === 'fled').toBe(true);
    expect(ev.some((e) => e.type === 'rally' && e.unit === u.id)).toBe(false);
  });

  it('beasts never break', () => {
    const { b, ev } = lastStand(2);
    for (const u of b.units) if (u.side === 0) (u.stats as { kind?: string }).kind = 'animal';
    run(b, 40, ev);
    expect(b.isBroken(0)).toBe(false);
  });
});

describe('determinism (ADR-0001)', () => {
  function play(seed: number): { hash: string[]; ev: string } {
    const b = camp(seed);
    b.issue(1, { kind: 'order', group: G1, order: 'charge' });
    b.issue(0, { kind: 'order', group: 2, order: 'advance' });
    const hash: string[] = [];
    const ev: SimEvent[] = [];
    for (let i = 0; i < 20 * 300 && b.phase !== 'ended'; i++) {
      b.step();
      ev.push(...b.drainEvents());
      if (b.tick % 20 === 0) hash.push(b.hash());
    }
    return { hash, ev: JSON.stringify(ev.filter((e) => e.type === 'cohesion' || e.type === 'armyBreak' || e.type === 'end')) };
  }

  it('two runs give the same hash every second and the same cohesion / armyBreak events', () => {
    const a = play(31);
    const c = play(31);
    expect(c.hash).toEqual(a.hash);
    expect(c.ev).toBe(a.ev);
  });

  it('a replay of the order log reaches the same hash, with the new events on the way', () => {
    // side 0 (human) throws its groups in one by one against a bot army; side 1 is the bot
    const ORDERS: [number, Order][] = [
      [10, { kind: 'order', group: 1, order: 'charge' }],
      [200, { kind: 'order', group: 0, order: 'charge' }],
      [400, { kind: 'order', group: 2, order: 'advance' }],
    ];
    for (const seed of [11, 12, 13]) {
      const setup = (): BattleSetup => {
        const s = setupOf(seed, [['hoplite', 4, 0], ['peltast', 4, 1], ['archer', 4, 2]], [['hoplite', 8, 0], ['celt_sword', 6, 1], ['slinger', 4, 2]]);
        s.armies[1].bot = true;
        return s;
      };
      const b = new Battle(setup());
      b.startBattle();
      const ev: SimEvent[] = [];
      let i = 0;
      while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
        while (i < ORDERS.length && ORDERS[i][0] === b.tick) b.issue(0, ORDERS[i++][1]);
        b.step();
        ev.push(...b.drainEvents());
      }
      expect(ev.some((e) => e.type === 'cohesion' || e.type === 'armyBreak')).toBe(true);
      const log = JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[];
      const r = new Battle(setup());
      r.startBattle();
      let j = 0;
      while (r.phase !== 'ended' && r.tick < r.timeLimitTicks + 10) {
        while (j < log.length && log[j].tick === r.tick) r.issue(log[j].side, log[j++].order);
        r.step();
      }
      expect({ tick: r.tick, winner: r.winner, hash: r.hash() }).toEqual({ tick: b.tick, winner: b.winner, hash: b.hash() });
    }
  });
});

describe('balance harness (FO-03 rows)', () => {
  it('runDeadFight reports the longest stretch with a side at 2 men or fewer', () => {
    const r = runDeadFight(1000);
    expect(r.seconds).toBeGreaterThan(0);
    expect(r.tail).toBeGreaterThanOrEqual(0);
  });
});
