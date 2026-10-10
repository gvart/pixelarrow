/**
 * AB-03: the server replays a client battle with the Standard (abilities.md
 * R5) through zod to the client's hash on sim 2: a human bearer who raises it,
 * a bot band led by its captain, and banner loss. The bearer comes from
 * `UnitSpec.captain` and `CombatStats.standard`; Raise is the `ability` order
 * with the id `standard`. No schema change.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle, RAISE_STANDARD } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import type { AbilityId } from '../../src/data/perks';
import type { BattleSetup, LoggedOrder, SimEvent } from '../../src/sim/types';

/** Side 0 (human, unit 0 carries the standard) against a bot band whose first man is its captain. */
function setupOf(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'peltast', 4, 3, 1), ...classSquad(rng, ids, 'celt_sword', 4, 3, 2)], false);
  const theirs = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'celt_sword', 6, 3, 1), ...classSquad(rng, ids, 'slinger', 4, 3, 2)], true);
  mine.units[0].stats.standard = true;
  theirs.units[0].captain = true;
  return { seed, armies: [mine, theirs] };
}

function playClient(seed: number) {
  const setup = setupOf(seed);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  b.startBattle();
  const events: SimEvent[] = [];
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    if (b.tick === 10) for (const g of [0, 1, 2]) b.issue(0, { kind: 'order', group: g, order: 'charge' });
    if (b.tick % 10 === 0 && b.canRaise(0) && b.members(0).some((u) => u.state === 'routing')) {
      b.issue(0, { kind: 'ability', unit: 0, ability: RAISE_STANDARD as AbilityId });
    }
    b.step();
    events.push(...b.drainEvents());
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], winner: b.winner, ticks: b.tick, hash: b.hash(), events };
}

function replay(c: ReturnType<typeof playClient>) {
  const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: 0, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
  return replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
}

describe('the standard: server replay (AB-03)', () => {
  it('a raised standard replays to the client hash', () => {
    const c = playClient(43);
    expect(c.orders.some((o) => o.order.kind === 'ability' && o.order.ability === RAISE_STANDARD)).toBe(true);
    expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('some seed loses a standard, and that battle replays too', () => {
    const c = [41, 42, 43, 44, 45, 46, 47, 48].map(playClient).find((x) => x.events.some((e) => e.type === 'standardLost'));
    expect(c).toBeDefined();
    expect(replay(c!)).toMatchObject({ winner: c!.winner, ticks: c!.ticks, hash: c!.hash });
  });
});
