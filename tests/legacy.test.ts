import { describe, expect, it } from 'vitest';
import fixture from './fixtures/legacy-battles.json';
import { Battle } from '../src/sim/battle';
import { BattleV1 } from '../server/src/sims/v1';
import type { BattleSetup, LoggedOrder } from '../src/sim/types';

/**
 * Battles recorded before unit classes, cavalry and animals existed (setups
 * without any class fields, with and without terrain, one with a human order
 * log and abilities). They must keep replaying to the very same state under
 * the rules they were recorded with: the frozen v1 sim (ADR-0001). Since FO-03
 * changed the v2 rules, the current sim must still run them to an end.
 */
interface Recorded {
  name: string;
  setup: BattleSetup;
  orders: LoggedOrder[];
  deployOrders: number;
  ticks: number;
  hash: string;
  mid: string;
  winner: number;
}

const recorded = fixture as unknown as Recorded[];

function replay(r: Recorded, make: (s: BattleSetup) => Battle | BattleV1 = (s) => new BattleV1(s as unknown as ConstructorParameters<typeof BattleV1>[0])): { b: Battle | BattleV1; mid: string } {
  const b = make(JSON.parse(JSON.stringify(r.setup)));
  for (const o of r.orders.slice(0, r.deployOrders)) b.issue(o.side, o.order as never);
  b.startBattle();
  const rest = r.orders.slice(r.deployOrders);
  let next = 0;
  let mid = '';
  for (let i = 0; i < 20 * 400 && b.phase !== 'ended'; i++) {
    while (next < rest.length && rest[next].tick === b.tick) {
      b.issue(rest[next].side, rest[next].order as never);
      next++;
    }
    b.step();
    if (b.tick === 600) mid = b.hash();
  }
  return { b, mid };
}

describe('old battle setups replay identically', () => {
  for (const r of recorded) {
    it(r.name, () => {
      const { b, mid } = replay(r);
      expect(b.tick).toBe(r.ticks);
      expect(b.winner ?? -1).toBe(r.winner);
      expect(mid).toBe(r.mid);
      expect(b.hash()).toBe(r.hash);
    });
    it(`${r.name}: the current (v2) sim still runs it to an end`, () => {
      const { b } = replay(r, (s) => new Battle(s));
      expect(b.phase).toBe('ended');
    });
  }
});
