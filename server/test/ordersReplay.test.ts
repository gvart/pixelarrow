/**
 * FO-01: the server replays a client battle that uses `face`, `focus` and a
 * small `form` (formations-orders.md R1, R4) to the client's hash, through the
 * zod schema, on sim 2.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { standardSetup } from '../../tests/helpers';
import type { BattleSetup, LoggedOrder, Order } from '../../src/sim/types';

/** Side 0 is human; side 1 groups are 4..7. */
const ORDERS: [number, Order][] = [
  [10, { kind: 'order', group: 0, order: 'advance' }],
  [30, { kind: 'focus', group: 1, target: 5 }],
  [60, { kind: 'face', group: 0, fx: 0.3, fy: -1 }],
  [90, { kind: 'form', group: 0, cx: 12.5, cy: 22, fx: 0, fy: -1, frontage: 4 }],
  [200, { kind: 'order', group: 2, order: 'charge' }],
  [215, { kind: 'face', group: 2, fx: -1, fy: -1 }],
  [400, { kind: 'focus', group: 1, target: -1 }],
];

function playClient(seed: number, orders: [number, Order][]) {
  const { setup } = standardSetup(seed, false);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  b.issue(0, { kind: 'face', group: 3, fx: 0.5, fy: -1 }); // a face in deployment too
  const deployOrders = b.orderLog.length;
  b.startBattle();
  let i = 0;
  for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) {
    while (i < orders.length && orders[i][0] === b.tick) b.issue(0, orders[i++][1]);
    b.step();
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], deployOrders, winner: b.winner, ticks: b.tick, hash: b.hash() };
}

describe('orders replay: face and focus (FO-01)', () => {
  it.each([4242, 77, 31337])('seed %i: the server replays face and focus to the client hash', (seed) => {
    const c = playClient(seed, ORDERS);
    expect(c.orders.map((o) => o.order.kind)).toEqual(expect.arrayContaining(['face', 'focus']));
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
    expect(out).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('face and focus change the battle on sim 2 (they are not ignored)', () => {
    const withOrders = playClient(4242, ORDERS);
    const without = playClient(4242, ORDERS.filter(([, o]) => o.kind !== 'face' && o.kind !== 'focus'));
    expect(withOrders.hash).not.toBe(without.hash);
  });
});
