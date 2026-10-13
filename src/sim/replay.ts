/**
 * The deterministic replay of a recorded battle: the server's authority
 * (server/src/battle.ts re-exports it behind its zod schemas) and pure enough
 * for the client and root tests to import without the server's dependencies.
 *
 * Replay protocol (mirrors the client's BattleScene and tests/sim.test.ts):
 *   1. new Battle(setup)
 *   2. issue the first `deployOrders` log entries (issued during deployment,
 *      before startBattle(); default: the leading entries with tick 0)
 *   3. startBattle(), then before every step() issue the remaining entries whose
 *      tick equals battle.tick, until the battle ends or the time limit.
 */
import { Battle, TICK_RATE } from './battle';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from './types';

export interface BattleSummary {
  winner: Side | -1;
  retreated: Side | null;
  ticks: number;
  seconds: number;
  hash: string;
  sides: { alive: number; dead: number; routedOrFled: number; ko: number; kills: number }[];
}

export interface ReplayOutcome {
  summary: BattleSummary;
  result: BattleResult;
}

function summarize(b: Battle): ReplayOutcome {
  const result = b.result();
  const sides = [0, 1].map((side) => {
    const us = result.units.filter((u) => u.side === side);
    return {
      alive: us.filter((u) => u.state === 'ready').length,
      dead: us.filter((u) => u.state === 'dead').length,
      routedOrFled: us.filter((u) => u.state === 'routing' || u.state === 'fled').length,
      ko: us.filter((u) => u.ko).length,
      kills: us.reduce((n, u) => n + u.kills, 0),
    };
  });
  return {
    result,
    summary: {
      winner: result.winner,
      retreated: result.retreated ?? null,
      ticks: result.ticks,
      seconds: result.ticks / TICK_RATE,
      hash: b.hash(),
      sides,
    },
  };
}

/** Re-runs a battle headless with today's sim. Throws if the sim rejects the setup. */
export function replayBattle(setup: BattleSetup, log: LoggedOrder[], deployOrders?: number): ReplayOutcome {
  const b = new Battle(setup);
  const human = (side: Side) => !setup.armies[side].bot;
  const orders = log.map((o, i) => ({ ...o, i })).filter((o) => human(o.side));
  const nDeploy = deployOrders ?? leadingTickZero(log);

  const deploy = orders.filter((o) => o.i < nDeploy);
  const battle = orders.filter((o) => o.i >= nDeploy).sort((a, b) => a.tick - b.tick || a.i - b.i);
  for (const o of deploy) b.issue(o.side, o.order);
  b.startBattle();

  const maxTicks = b.timeLimitTicks + 1;
  const ended = () => b.phase === 'ended';
  let next = 0;
  while (!ended() && b.tick <= maxTicks) {
    while (next < battle.length && battle[next].tick < b.tick) next++; // stale (should not happen)
    while (next < battle.length && battle[next].tick === b.tick) {
      b.issue(battle[next].side, battle[next].order);
      next++;
    }
    if (ended()) break;
    b.step();
    b.drainEvents(); // keep memory flat
  }
  return summarize(b);
}

function leadingTickZero(log: LoggedOrder[]): number {
  let n = 0;
  while (n < log.length && log[n].tick === 0) n++;
  return n;
}
