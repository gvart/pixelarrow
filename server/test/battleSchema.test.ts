/**
 * ST-03: the zod schema takes every sim train 2 order kind and setup field,
 * defaults the missing ones, still parses old logs, and the replay ignores
 * the new orders until their rules land (no hash change).
 */
import { describe, expect, inject, it } from 'vitest';
import { LoggedOrderSchema, OrderSchema, replayBattle, VerifyBody } from '../src/battle';
import { FORMATION_TYPES } from '../../src/sim/formation';
import { DOCTRINE_IDS, GROUP_ORDERS, WORK_TYPES } from '../../src/sim/types';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';
import replayV1 from '../../tests/fixtures/replay-v1.json';

const fx = inject('battleFixture');

const body = (setup: unknown, orders: unknown[] = []) => ({ setup, orders, claim: { winner: -1, ticks: 0 } });
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('battle schema: sim train 2', () => {
  it.each([
    { kind: 'face', group: 0, fx: 1, fy: 0 },
    { kind: 'focus', group: 1, target: 2 },
    { kind: 'focus', group: 1, target: -1 },
    ...WORK_TYPES.map((type) => ({ kind: 'work', type, x: 4, y: 30, fx: 0, fy: -1 })),
    { kind: 'unwork', x: 4, y: 30 },
    ...GROUP_ORDERS.map((order) => ({ kind: 'order', group: 0, order })),
  ])('accepts %o', (order) => {
    expect(OrderSchema.parse(order)).toEqual(order);
  });

  it.each([
    { kind: 'face', group: 0, fx: 1 },
    { kind: 'focus', group: 0, target: 'x' },
    { kind: 'work', type: 'moat', x: 1, y: 1, fx: 0, fy: 1 },
    { kind: 'work', type: 'stakes', x: 1e9, y: 1, fx: 0, fy: 1 },
    { kind: 'unwork', x: 1 },
    { kind: 'order', group: 0, order: 'dance' },
  ])('rejects %o', (order) => {
    expect(OrderSchema.safeParse(order).success).toBe(false);
  });

  it('takes a formation shape only once the sim has it (orb arrives with FO-02)', () => {
    for (const type of [...FORMATION_TYPES, 'orb']) {
      const ok = OrderSchema.safeParse({ kind: 'preset', group: 0, type }).success;
      expect(ok).toBe((FORMATION_TYPES as string[]).includes(type));
    }
  });

  it('defaults a missing doctrine to steady and a missing captain to false; works stay absent', () => {
    const parsed = VerifyBody.parse(body(fx.setup, fx.orders));
    for (const army of parsed.setup.armies) {
      expect(army.doctrine).toBe('steady');
      expect(army.works).toBeUndefined();
      for (const u of army.units) expect(u.captain).toBe(false);
    }
  });

  it('accepts every doctrine, a works allowance up to WORKS_MAX and a captain', () => {
    for (const doctrine of DOCTRINE_IDS) {
      const setup = copy(fx.setup) as unknown as Record<string, any>;
      setup.armies[1].doctrine = doctrine;
      setup.armies[0].works = { stakes: 3, ditch: 0, laager: 1 };
      setup.armies[1].units[0].captain = true;
      const parsed = VerifyBody.parse(body(setup));
      expect(parsed.setup.armies[1].doctrine).toBe(doctrine);
      expect(parsed.setup.armies[0].works).toEqual({ stakes: 3, ditch: 0, laager: 1 });
      expect(parsed.setup.armies[1].units[0].captain).toBe(true);
    }
  });

  it.each([
    ['an unknown doctrine', (s: Record<string, any>) => (s.armies[1].doctrine = 'berserk')],
    ['works over WORKS_MAX', (s: Record<string, any>) => (s.armies[0].works = { stakes: 4, ditch: 0, laager: 0 })],
    ['a partial works record', (s: Record<string, any>) => (s.armies[0].works = { stakes: 1 })],
    ['a non-boolean captain', (s: Record<string, any>) => (s.armies[0].units[0].captain = 'yes')],
  ])('rejects %s', (_name, mutate) => {
    const setup = copy(fx.setup) as unknown as Record<string, any>;
    mutate(setup);
    expect(VerifyBody.safeParse(body(setup)).success).toBe(false);
  });

  it('still parses every recorded v1 log and its setup', () => {
    const v1 = replayV1 as unknown as { battles: { setup: unknown; orders: unknown[] }[] };
    expect(v1.battles.length).toBeGreaterThan(0);
    for (const r of [...v1.battles, { setup: fx.setup, orders: fx.orders }]) {
      expect(VerifyBody.safeParse(body(r.setup, r.orders)).success).toBe(true);
      for (const o of r.orders) expect(LoggedOrderSchema.safeParse(o).success).toBe(true);
    }
  });

  it.each([1, 2])('sim %i: replays the fixture to the same hash with the new orders and fields', (simVersion) => {
    const plain = replayBattle(copy(fx.setup), fx.orders, fx.deployOrders, simVersion).summary;
    const side = fx.orders.find((o) => o.side === 0)!;
    const extra: LoggedOrder[] = [
      { tick: side.tick, side: 0, order: { kind: 'face', group: 0, fx: 0, fy: 1 } },
      { tick: side.tick, side: 0, order: { kind: 'focus', group: 0, target: 1 } },
      { tick: side.tick, side: 0, order: { kind: 'work', type: 'stakes', x: 3, y: 3, fx: 0, fy: 1 } },
      { tick: side.tick, side: 0, order: { kind: 'unwork', x: 3, y: 3 } },
    ];
    const i = fx.orders.indexOf(side) + 1;
    const orders = [...fx.orders.slice(0, i), ...extra, ...fx.orders.slice(i)];
    const deployOrders = fx.deployOrders + (i <= fx.deployOrders ? extra.length : 0);
    const parsed = VerifyBody.parse({ ...body(fx.setup, orders), deployOrders });
    parsed.setup.armies[1].units[0].captain = true;
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, simVersion).summary;
    expect(out).toEqual(plain);
  });
});
