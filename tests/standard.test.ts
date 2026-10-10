/**
 * AB-03: the Standard (design/gdd/abilities.md R5, F2; ai-doctrines.md R6).
 * One bearer per army (a captain, else the highest-level `standard_bearer`);
 * the aura (-15% morale damage, not stacking with Steady Presence, regen out
 * of melee, cohesion shocks halved: V5-024); Raise the standard once per
 * battle, which an army break overrules; banner loss once, for bearers and
 * captains alike.
 */
import { describe, expect, it } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { partyArmy, type PartyState } from '../src/world/world';
import { computeStats, isCaptain } from '../src/sim/stats';
import { makeHero } from '../src/game/heroes';
import { Battle, RAISE_STANDARD, STANDARD_RULES } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { AbilityId } from '../src/data/perks';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, Order, SimEvent, SimUnit, Side } from '../src/sim/types';

/** Two human sides; each entry is [class, count, group]. Side 0 has groups 0..3, side 1 has 4..7. */
function setupOf(seed: number, a: [ClassId, number, number][], b: [ClassId, number, number][]): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  return { seed, armies: [side(a), side(b)] };
}

const G1 = 4;
const RAISE: Order = { kind: 'ability', unit: 0, ability: RAISE_STANDARD as AbilityId };

function form(b: Battle, side: Side, group: number, cx: number, cy: number, fy: number): void {
  b.issue(side, { kind: 'form', group, cx, cy, fx: 0, fy, frontage: 4 });
}

function run(b: Battle, n: number, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n && b.phase !== 'ended'; i++) {
    b.step();
    events.push(...b.drainEvents());
  }
  return events;
}

/**
 * Side 0: group 0 (6 hoplites) at (6, 28), group 1 (4 hoplites) far off at
 * (20, 28). Side 1 holds at the other end. `bearer` marks units of side 0 as
 * standard carriers (by index); unit 0 is the bearer by default.
 */
function camp(opts: { bearer?: number[]; captain?: number; seed?: number; bot?: boolean } = {}): Battle {
  const setup = setupOf(opts.seed ?? 5, [['hoplite', 6, 0], ['hoplite', 4, 1]], [['hoplite', 6, 0]]);
  for (const i of opts.bearer ?? [0]) setup.armies[0].units[i].stats.standard = true;
  if (opts.captain !== undefined) setup.armies[0].units[opts.captain].captain = true;
  if (opts.bot) setup.armies[0].bot = true;
  const b = new Battle(setup);
  form(b, 0, 0, 6, 28, -1);
  form(b, 0, 1, 20, 28, -1);
  form(b, 1, G1, 12, 2, 1);
  b.startBattle();
  run(b, 5);
  return b;
}

function patched<T>(patch: Partial<typeof STANDARD_RULES>, fn: () => T): T {
  const saved = { ...STANDARD_RULES };
  Object.assign(STANDARD_RULES, patch);
  try {
    return fn();
  } finally {
    Object.assign(STANDARD_RULES, saved);
  }
}

/** Make a man of side 0 run: routing, with morale `frac` of his max. */
function routAt(u: SimUnit, frac: number): void {
  u.state = 'routing';
  u.engaged = false;
  u.morale = u.stats.morale * frac;
}

describe('the bearer (R5.1)', () => {
  it('a standard_bearer hero and a band captain carry it; nobody else does', () => {
    const rng = new Rng(3);
    const ids = { nextId: 1 };
    const plain = makeHero(rng, ids, 'greek', 'hoplite', 8, 2, 0);
    plain.perks = plain.perks.filter((p) => p !== 'standard_bearer');
    expect(computeStats(plain).standard).toBeUndefined();
    const bearer = makeHero(rng, ids, 'greek', 'hoplite', 8, 2, 0);
    bearer.perks = ['drilled', 'shield_bash', 'phalangite', 'standard_bearer'];
    expect(computeStats(bearer).standard).toBe(true);
    const band: PartyState = {
      id: 900, kind: 'mercs', name: 'Mercenaries', culture: 'greek', x: 1.5, y: 1.5, size: 8, power: 0, level: 3, tier: 2,
      seed: 7920, home: 0, mode: 'wander', tx: 1, ty: 1, idle: 0,
    };
    const cap = partyArmy(band, { nextId: 1 }).heroes.find((h) => isCaptain(h))!;
    expect(computeStats(cap).standard).toBe(true);
  });

  it('one per army: the captain first, then the highest level, ties to the lower unit id', () => {
    const setup = setupOf(5, [['hoplite', 6, 0]], [['hoplite', 6, 0]]);
    const s0 = setup.armies[0].units;
    for (const i of [1, 2, 4]) s0[i].stats.standard = true;
    s0[2].level = 9;
    s0[4].level = 9;
    expect(new Battle(setup).standardBearer(0)?.id).toBe(2);
    s0[5].captain = true;
    expect(new Battle(setup).standardBearer(0)?.id).toBe(5);
    expect(new Battle(setup).standardBearer(1)).toBeNull();
  });

  it('the bearer stands behind the front rank of his group', () => {
    const b = camp();
    const mem = b.members(0);
    const deepest = Math.max(...mem.map((u) => u.slotDep));
    expect(b.units[0].slotDep).toBe(deepest);
    expect(mem.some((u) => u.slotDep < deepest - 0.1)).toBe(true);
  });

  it('an army without one has no standard: no aura, no Raise', () => {
    const b = camp({ bearer: [] });
    expect(b.standardBearer(0)).toBeNull();
    expect(b.canRaise(0)).toBe(false);
    for (const u of b.units) {
      expect(b.inStandard(u)).toBe(false);
      expect(b.shockFactor(u)).toBe(1);
    }
  });
});

describe('the standard aura (R5.2, F2, V5-024)', () => {
  it('inside: -15% morale damage, cohesion shocks halved; outside: neither', () => {
    const b = camp();
    const inside = b.members(0).filter((u) => u.id !== 0);
    const outside = b.members(1);
    for (const u of inside) {
      expect(b.inStandard(u)).toBe(true);
      expect(b.ml(u)).toBeCloseTo(u.stats.moraleLoss * 0.85, 12);
      expect(b.shockFactor(u)).toBe(0.5);
    }
    for (const u of outside) {
      expect(b.inStandard(u)).toBe(false);
      expect(b.ml(u)).toBe(u.stats.moraleLoss);
      expect(b.shockFactor(u)).toBe(1);
    }
    // the enemy never stands in our standard
    for (const u of b.members(G1)) expect(b.inStandard(u)).toBe(false);
  });

  it('does not stack with Steady Presence: the larger reduction (0.8) applies', () => {
    const setup = setupOf(5, [['hoplite', 6, 0], ['hoplite', 4, 1]], [['hoplite', 6, 0]]);
    setup.armies[0].units[0].stats.standard = true;
    setup.armies[0].units[1].stats.auras = ['steady'];
    const b = new Battle(setup);
    form(b, 0, 0, 6, 28, -1);
    form(b, 1, G1, 12, 2, 1);
    b.startBattle();
    run(b, 5);
    for (const u of b.members(0)) {
      expect(b.inStandard(u)).toBe(true);
      expect(b.ml(u)).toBeCloseTo(u.stats.moraleLoss * 0.8, 12);
    }
  });

  it('a man inside regains morale out of melee faster than one outside', () => {
    const b = camp();
    const inside = b.members(0)[1];
    const outside = b.members(1)[0];
    inside.morale = outside.morale = 30;
    run(b, 20);
    expect(inside.morale - 30).toBeCloseTo(outside.morale - 30 + STANDARD_RULES.regen, 6);
  });

  it('is suspended while the bearer routs, and the standard is not lost', () => {
    const b = camp();
    routAt(b.units[0], 0.1);
    const ev = run(b, 10);
    for (const u of b.members(0)) expect(b.inStandard(u)).toBe(false);
    expect(ev.some((e) => e.type === 'standardLost')).toBe(false);
    expect(b.standardBearer(0)?.id).toBe(0);
  });
});

describe('banner loss (R5.4)', () => {
  /** Morale after the bearer falls, with an enemy brought within 6 paces. */
  function fall(): { b: Battle; ev: SimEvent[]; before: number[] } {
    const b = camp({ bearer: [0, 1] });
    const foe = b.members(G1)[0];
    foe.x = b.units[0].x + 2;
    foe.y = b.units[0].y;
    foe.morale = 20;
    b.kill(b.units[0], foe);
    const before = b.units.map((u) => u.morale);
    const ev = run(b, 1);
    return { b, ev, before };
  }

  it('own men within 6 lose 12, enemies within 6 gain 5, one standardLost event', () => {
    const on = fall();
    const off = patched({ lossSelf: 0, lossEnemy: 0 }, fall);
    const bearer = on.b.units[0];
    const lost = on.ev.filter((e) => e.type === 'standardLost');
    expect(lost).toEqual([{ type: 'standardLost', tick: on.b.tick, side: 0, unit: 0 }]);
    expect(off.ev.some((e) => e.type === 'standardLost')).toBe(true);
    for (const u of on.b.units) {
      if (u.state !== 'ready') continue;
      const d = Math.hypot(u.x - bearer.x, u.y - bearer.y);
      const delta = u.morale - off.b.units[u.id].morale;
      if (d > STANDARD_RULES.lossRadius + 0.5) expect(delta, `unit ${u.id}`).toBeCloseTo(0, 6);
      else if (d < STANDARD_RULES.lossRadius - 0.5) expect(delta, `unit ${u.id}`).toBeCloseTo(u.side === 0 ? -12 : 5, 1);
    }
  });

  it('fires once, and the standard passes to nobody', () => {
    const { b, ev } = fall();
    run(b, 200, ev);
    expect(ev.filter((e) => e.type === 'standardLost')).toHaveLength(1);
    expect(b.standardBearer(0)).toBeNull();
    expect(b.canRaise(0)).toBe(false);
    for (const u of b.members(0)) expect(b.inStandard(u)).toBe(false);
  });

  it("captains apply it: the band's captain is its bearer, and his fall costs the band", () => {
    const band: PartyState = {
      id: 900, kind: 'mercs', name: 'Mercenaries', culture: 'greek', x: 1.5, y: 1.5, size: 8, power: 0, level: 3, tier: 2,
      seed: 7920, home: 0, mode: 'wander', tx: 1, ty: 1, idle: 0,
    };
    const ids = { nextId: 1 };
    const heroes = partyArmy(band, ids).heroes;
    const mine = classSquad(new Rng(2), ids, 'hoplite', 6, 3, 0);
    const b = new Battle({ seed: 9, armies: [armySpec(mine, true), armySpec(heroes, true)] });
    const cap = b.standardBearer(1)!;
    expect(cap.heroId).toBe(heroes.find((h) => isCaptain(h))!.id);
    expect(b.standardBearer(0)).toBeNull();
    b.startBattle();
    run(b, 5);
    b.kill(cap, b.units[0]);
    const ev = run(b, 100);
    expect(ev.filter((e) => e.type === 'standardLost')).toEqual([expect.objectContaining({ side: 1, unit: cap.id })]);
  });
});

describe('Raise the standard (R5.3)', () => {
  it('restores 20% morale within 6 and turns back routers at or above 30%, once per battle', () => {
    const b = camp();
    const [, a, c, d] = b.members(0);
    routAt(a, 0.15); // 0.35 after: turns back
    routAt(c, 0.05); // 0.25 after: keeps running
    d.morale = d.stats.morale * 0.5;
    const far = b.members(1)[0];
    far.morale = far.stats.morale * 0.5;
    expect(b.canRaise(0)).toBe(true);
    b.issue(0, RAISE);
    const ev = run(b, 1);
    expect(a.state).toBe('ready');
    expect(c.state).toBe('routing');
    expect(d.morale).toBeGreaterThanOrEqual(d.stats.morale * 0.69);
    expect(far.morale).toBeLessThan(far.stats.morale * 0.55);
    expect(ev.filter((e) => e.type === 'rally').map((e) => (e as { unit: number }).unit)).toEqual([a.id]);
    expect(b.canRaise(0)).toBe(false);
    // a second raise does nothing
    routAt(a, 0.15);
    b.issue(0, RAISE);
    run(b, 1);
    expect(a.state).toBe('routing');
  });

  it('only the bearer can raise it', () => {
    const b = camp();
    b.issue(0, { ...RAISE, unit: 1 } as Order);
    run(b, 1);
    expect(b.canRaise(0)).toBe(true);
  });

  it('army break wins: on a broken side Raise restores morale but turns no router back', () => {
    const b = camp();
    const a = b.members(0)[1];
    routAt(a, 0.15);
    (b as unknown as { broken: [boolean, boolean] }).broken[0] = true;
    b.issue(0, RAISE);
    run(b, 1);
    expect(a.state).toBe('routing');
    expect(a.morale).toBeGreaterThan(a.stats.morale * 0.3);
    expect(b.canRaise(0)).toBe(false);
  });

  it('the bot raises it once 3 allies near the bearer are routing (R6)', () => {
    const b = camp({ bot: true });
    expect(b.canRaise(0)).toBe(true);
    const ev = run(b, 20);
    expect(b.canRaise(0)).toBe(true); // nobody routing yet
    for (const u of b.members(0).slice(1, 4)) {
      routAt(u, 0.2);
      u.x = b.units[0].x;
      u.y = b.units[0].y + 1;
    }
    run(b, 12, ev);
    expect(b.canRaise(0)).toBe(false);
    expect(ev.filter((e) => e.type === 'rally').length).toBeGreaterThanOrEqual(3);
  });
});

describe('determinism (ADR-0001)', () => {
  function play(seed: number) {
    const setup = setupOf(seed, [['hoplite', 6, 0], ['peltast', 4, 1], ['celt_sword', 4, 2]], [['hoplite', 8, 0], ['celt_sword', 6, 1], ['slinger', 4, 2]]);
    setup.armies[0].units[0].stats.standard = true;
    setup.armies[1].units[0].captain = true;
    setup.armies[1].bot = true;
    const b = new Battle(setup);
    b.startBattle();
    const ev: SimEvent[] = [];
    while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
      if (b.tick === 10) for (const g of [0, 1, 2]) b.issue(0, { kind: 'order', group: g, order: 'charge' });
      if (b.tick % 10 === 0 && b.canRaise(0) && b.members(0).some((u) => u.state === 'routing')) b.issue(0, RAISE);
      b.step();
      ev.push(...b.drainEvents());
    }
    return { b, ev, setup };
  }

  it('two runs give the same hash; the human log replays it exactly', () => {
    const a = play(43);
    const again = play(43);
    expect(again.b.hash()).toBe(a.b.hash());
    // the human side raised its standard in this battle
    expect(a.b.orderLog.some((o) => o.side === 0 && o.order.kind === 'ability')).toBe(true);
    const human = a.b.orderLog.filter((o) => o.side === 0);
    const setup = setupOf(43, [['hoplite', 6, 0], ['peltast', 4, 1], ['celt_sword', 4, 2]], [['hoplite', 8, 0], ['celt_sword', 6, 1], ['slinger', 4, 2]]);
    setup.armies[0].units[0].stats.standard = true;
    setup.armies[1].units[0].captain = true;
    setup.armies[1].bot = true;
    const r = new Battle(setup);
    r.startBattle();
    while (r.phase !== 'ended' && r.tick < r.timeLimitTicks + 10) {
      for (const o of human) if (o.tick === r.tick) r.issue(0, o.order);
      r.step();
    }
    expect(r.hash()).toBe(a.b.hash());
    expect(JSON.stringify(r.result())).toBe(JSON.stringify(a.b.result()));
  });

  it('a standard changes the battle; without one the hash ignores the new state', () => {
    const base = setupOf(41, [['hoplite', 6, 0]], [['hoplite', 6, 0]]);
    const withStd = JSON.parse(JSON.stringify(base)) as BattleSetup;
    withStd.armies[0].units[0].stats.standard = true;
    const h = (s: BattleSetup) => {
      const b = new Battle(s);
      b.startBattle();
      for (let i = 0; i < 400 && b.phase !== 'ended'; i++) b.step();
      return b.hash();
    };
    expect(h(withStd)).not.toBe(h(base));
    expect(h(base)).toBe(h(JSON.parse(JSON.stringify(base)) as BattleSetup));
  });
});
