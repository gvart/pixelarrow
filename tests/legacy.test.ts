import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Battle } from '../src/sim/battle';
import type { BattleSetup, LoggedOrder } from '../src/sim/types';

/**
 * Battles recorded before unit classes, cavalry and animals existed (setups
 * without any class fields, with and without terrain, one with a human order
 * log and abilities). They must keep replaying to the very same state.
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

const recorded = JSON.parse(readFileSync(new URL('./fixtures/legacy-battles.json', import.meta.url), 'utf8')) as Recorded[];

function replay(r: Recorded): { b: Battle; mid: string } {
  const b = new Battle(JSON.parse(JSON.stringify(r.setup)));
  for (const o of r.orders.slice(0, r.deployOrders)) b.issue(o.side, o.order);
  b.startBattle();
  const rest = r.orders.slice(r.deployOrders);
  let next = 0;
  let mid = '';
  for (let i = 0; i < 20 * 400 && b.phase !== 'ended'; i++) {
    while (next < rest.length && rest[next].tick === b.tick) {
      b.issue(rest[next].side, rest[next].order);
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
  }
});
