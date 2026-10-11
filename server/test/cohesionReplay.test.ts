/**
 * FO-03: the server replays a client battle in which cohesion shocks and an
 * army break happen, through zod, to the client's hash on sim 2. Both rules
 * live inside the sim and need no new order or schema field.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import type { BattleSetup, LoggedOrder, Order, SimEvent } from '../../src/sim/types';

/** Side 0 (human): hoplites (0), peltasts (1), archers (2), thrown in one by one. Side 1 (bot) outnumbers it. */
function setupOf(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 4, 3, 0), ...classSquad(rng, ids, 'peltast', 4, 3, 1), ...classSquad(rng, ids, 'archer', 4, 3, 2)], false);
  const theirs = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'celt_sword', 6, 3, 1), ...classSquad(rng, ids, 'slinger', 4, 3, 2)], true);
  return { seed, armies: [mine, theirs] };
}

const ORDERS: [number, Order][] = [
  [10, { kind: 'order', group: 1, order: 'charge' }],
  [200, { kind: 'order', group: 0, order: 'charge' }],
  [400, { kind: 'order', group: 2, order: 'advance' }],
];

function playClient(seed: number) {
  const setup = setupOf(seed);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  b.startBattle();
  const events: SimEvent[] = [];
  let i = 0;
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    while (i < ORDERS.length && ORDERS[i][0] === b.tick) b.issue(0, ORDERS[i++][1]);
    b.step();
    events.push(...b.drainEvents());
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], winner: b.winner, ticks: b.tick, hash: b.hash(), events };
}

describe('cohesion and army break: server replay (FO-03)', () => {
  it.each([11, 12, 13])('seed %i: the server replays to the client hash', (seed) => {
    const c = playClient(seed);
    expect(c.events.some((e) => e.type === 'cohesion')).toBe(true);
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: 0, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders).summary;
    expect(out).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('some seed breaks an army, and that battle replays too', () => {
    const seeds = [11, 12, 13, 14, 15, 16, 17, 18];
    const c = seeds.map(playClient).find((x) => x.events.some((e) => e.type === 'armyBreak'));
    expect(c).toBeDefined();
    const out = replayBattle(c!.setup, c!.orders, 0).summary;
    expect(out).toMatchObject({ winner: c!.winner, ticks: c!.ticks, hash: c!.hash });
  });
});
