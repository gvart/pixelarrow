/**
 * FW-01: the server replays a client battle with field works
 * (design/gdd/field-works.md R3) through zod to the client's hash on sim 2.
 * The `work` / `unwork` orders are deploy orders (before startBattle), the
 * allowance travels in ArmySpec.works, and a refused order replays as refused.
 * No schema change: ST-03 declared the kinds.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import type { BattleSetup, LoggedOrder, Order, SimEvent } from '../../src/sim/types';

/** Side 0 (human hoplites and archers behind works) against a bot with riders and swordsmen. */
function setupOf(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'archer', 4, 3, 1)], false);
  const theirs = armySpec([...classSquad(rng, ids, 'companion', 3, 3, 0), ...classSquad(rng, ids, 'celt_sword', 6, 3, 1)], true);
  mine.works = { stakes: 2, ditch: 1, laager: 1 };
  return { seed, armies: [mine, theirs] };
}

const DEPLOY: Order[] = [
  { kind: 'work', type: 'stakes', x: 8.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'work', type: 'stakes', x: 15.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'work', type: 'ditch', x: 12.5, y: 23.5, fx: 0, fy: -1 },
  { kind: 'work', type: 'stakes', x: 12.5, y: 5.5, fx: 0, fy: -1 }, // refused: the enemy's half
  { kind: 'unwork', x: 15.5, y: 23.5 },
  { kind: 'work', type: 'stakes', x: 4.5, y: 24.5, fx: 1, fy: -1 },
];

function playClient(seed: number) {
  const setup = setupOf(seed);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  for (const o of DEPLOY) b.issue(0, o);
  const deployOrders = b.orderLog.length;
  b.startBattle();
  const events: SimEvent[] = [];
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    if (b.tick === 20) b.issue(0, { kind: 'order', group: 1, order: 'advance' });
    b.step();
    events.push(...b.drainEvents());
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], deployOrders, winner: b.winner, ticks: b.tick, hash: b.hash(), events, works: b.works().length, refused: b.worksLog.length };
}

function replay(c: ReturnType<typeof playClient>) {
  const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
  return replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
}

describe('field works: server replay (FW-01)', () => {
  it('a battle with stakes, a ditch, a refused work and an unwork replays to the client hash', () => {
    const c = playClient(61);
    expect(c.works).toBe(3);
    expect(c.refused).toBe(1);
    expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('some seed breaks a charge on the stakes, and that battle replays too', () => {
    const c = [61, 62, 63, 64, 65, 66, 67, 68].map(playClient).find((x) => x.events.some((e) => e.type === 'stakesBreak'));
    expect(c).toBeDefined();
    expect(replay(c!)).toMatchObject({ winner: c!.winner, ticks: c!.ticks, hash: c!.hash });
  });

  it('zod keeps the allowance and the work orders', () => {
    const c = playClient(61);
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    expect(parsed.setup.armies[0].works).toEqual({ stakes: 2, ditch: 1, laager: 1 });
    expect(parsed.orders.map((o) => o.order).filter((o) => o.kind === 'work' || o.kind === 'unwork')).toEqual(DEPLOY);
  });
});
