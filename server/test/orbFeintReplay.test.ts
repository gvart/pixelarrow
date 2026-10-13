/**
 * FO-02: the server takes the orb and the feint through zod and replays a
 * client battle that uses both to the client's hash on sim 2. The zod shape
 * list comes from the sim's FORMATION_TYPES, so `orb` arrived with the rule.
 * A malformed shape is refused by zod.
 */
import { describe, expect, it } from 'vitest';
import { OrderSchema, replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import type { BattleSetup, LoggedOrder, Order } from '../../src/sim/types';

/** Side 0 (human): hoplites (group 0), archers (1), peltasts (3). Side 1 (bot): swordsmen and hoplites. */
function setupOf(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'archer', 4, 3, 1), ...classSquad(rng, ids, 'peltast', 4, 3, 3)], false);
  const theirs = armySpec([...classSquad(rng, ids, 'celt_sword', 6, 3, 0), ...classSquad(rng, ids, 'hoplite', 4, 3, 2), ...classSquad(rng, ids, 'slinger', 4, 3, 1)], true);
  mine.groups[1].formation = 'orb'; // an orb in the setup itself
  return { seed, armies: [mine, theirs] };
}

const ORDERS: [number, Order][] = [
  [20, { kind: 'order', group: 3, order: 'advance' }],
  [120, { kind: 'order', group: 3, order: 'feint' }],
  [140, { kind: 'order', group: 0, order: 'feint' }], // ineligible: ignored
  [300, { kind: 'order', group: 1, order: 'charge' }], // the orb opens into a line
  [400, { kind: 'preset', group: 1, type: 'orb' }],
  [900, { kind: 'order', group: 3, order: 'feint' }],
];

function playClient(seed: number, orders: [number, Order][]) {
  const setup = setupOf(seed);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  b.issue(0, { kind: 'preset', group: 0, type: 'orb' }); // an orb in deployment
  const deployOrders = b.orderLog.length;
  b.startBattle();
  let i = 0;
  for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) {
    while (i < orders.length && orders[i][0] === b.tick) b.issue(0, orders[i++][1]);
    b.step();
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], deployOrders, winner: b.winner, ticks: b.tick, hash: b.hash() };
}

describe('orb and feint: zod (FO-02)', () => {
  it('takes orb as a shape in orders and in the setup, and feint as an order', () => {
    expect(OrderSchema.parse({ kind: 'preset', group: 0, type: 'orb' })).toEqual({ kind: 'preset', group: 0, type: 'orb' });
    expect(OrderSchema.safeParse({ kind: 'form', group: 0, cx: 1, cy: 1, fx: 0, fy: 1, frontage: 4, type: 'orb' }).success).toBe(true);
    expect(OrderSchema.safeParse({ kind: 'order', group: 0, order: 'feint' }).success).toBe(true);
    const c = playClient(77, []);
    expect(VerifyBody.safeParse({ simVersion: SIM_VERSION, setup: c.setup, orders: [], claim: { winner: -1, ticks: 0 } }).success).toBe(true);
  });

  it.each([
    { kind: 'preset', group: 0, type: 'circle' },
    { kind: 'preset', group: 0, type: 'ORB' },
    { kind: 'form', group: 0, cx: 1, cy: 1, fx: 0, fy: 1, frontage: 4, type: '__proto__' },
  ])('refuses a malformed shape %o', (order) => {
    expect(OrderSchema.safeParse(order).success).toBe(false);
  });
});

describe('orb and feint: server replay (FO-02)', () => {
  it.each([4242, 77, 31337])('seed %i: the server replays orb and feint to the client hash', (seed) => {
    const c = playClient(seed, ORDERS);
    expect(c.orders.some((o) => o.order.kind === 'order' && o.order.order === 'feint')).toBe(true);
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders).summary;
    expect(out).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('orb and feint change the battle on sim 2 (they are not ignored)', () => {
    const withOrders = playClient(4242, ORDERS);
    const without = playClient(4242, ORDERS.filter(([, o]) => o.kind !== 'preset' && !(o.kind === 'order' && o.order === 'feint')));
    expect(withOrders.hash).not.toBe(without.hash);
  });
});
