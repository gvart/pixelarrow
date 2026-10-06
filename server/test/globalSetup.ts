/**
 * Runs in Node (not workerd): plays a battle with the real sim and hands the
 * setup, order log and outcome to the Worker tests, so battle verification is
 * checked across runtimes (Node/V8 here vs workerd in the Worker). Uses the
 * root test helpers, which track the sim/campaign API.
 */
import type { TestProject } from 'vitest/node';
import { Battle } from '../../src/sim/battle';
import { standardSetup } from '../../tests/helpers';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';

export interface BattleFixture {
  setup: BattleSetup;
  orders: LoggedOrder[];
  deployOrders: number;
  winner: 0 | 1 | -1;
  ticks: number;
  hash: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    battleFixture: BattleFixture;
  }
}

export function playFixtureBattle(seed = 4242): BattleFixture {
  const { setup } = standardSetup(seed, false);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  // Deployment orders (issued before the start), then a few battle orders.
  b.issue(0, { kind: 'preset', group: 0, type: 'shieldwall' });
  const deployOrders = b.orderLog.length;
  b.startBattle();
  for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) {
    if (b.tick === 10) b.issue(0, { kind: 'order', group: 0, order: 'advance' });
    if (b.tick === 120) b.issue(0, { kind: 'order', group: 1, order: 'advance' });
    if (b.tick === 300) b.issue(0, { kind: 'order', group: 0, order: 'charge' });
    if (b.tick === 320) b.issue(0, { kind: 'order', group: 2, order: 'charge' });
    b.step();
  }
  const r = b.result();
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)), deployOrders, winner: r.winner, ticks: r.ticks, hash: b.hash() };
}

export default function setup(project: TestProject): void {
  project.provide('battleFixture', playFixtureBattle());
}
