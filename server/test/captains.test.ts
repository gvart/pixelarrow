/**
 * AI-02: a band captain's derived stats (src/sim/stats.ts CAPTAIN_STATS) ride
 * in the setup like any other unit's, and the server replays a battle with a
 * captain to the hash of the client's run.
 */
import { describe, expect, inject, it } from 'vitest';
import { VerifyBody, replayBattle } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { computeStats } from '../../src/sim/stats';
import { bandCaptain, type PartyState } from '../../src/world/world';
import type { BattleSetup } from '../../src/sim/types';

const fx = inject('battleFixture');
const SIM_V2 = 2;

const BAND: PartyState = {
  id: 1, kind: 'mercs', name: 'Mercenaries', culture: 'greek', x: 0, y: 0, size: 8, power: 0, level: 3, tier: 2,
  seed: 7920, home: 0, mode: 'wander', tx: 0, ty: 0, idle: 0,
};

/** The fixture's battle with the bot's first man replaced by a band captain. */
function withCaptain(): BattleSetup {
  const setup = JSON.parse(JSON.stringify(fx.setup)) as BattleSetup;
  const cap = bandCaptain(BAND, { nextId: 1 })!;
  const u = setup.armies[1].units[0];
  Object.assign(u, { heroId: cap.id, name: cap.name, level: cap.level, stats: computeStats(cap), captain: true });
  return setup;
}

function play(setup: BattleSetup): Battle {
  const b = new Battle(JSON.parse(JSON.stringify(setup)));
  const nDeploy = fx.deployOrders ?? 0;
  for (const o of fx.orders.slice(0, nDeploy)) if (o.side === 0) b.issue(0, o.order);
  b.startBattle();
  const later = fx.orders.slice(nDeploy).filter((o) => o.side === 0);
  let i = 0;
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks) {
    while (i < later.length && later[i].tick === b.tick) b.issue(0, later[i++].order);
    b.step();
  }
  return b;
}

describe('band captains on the server (ai-doctrines.md R6, AI-02)', () => {
  it('validates a captain\'s stats and replays his battle to the client\'s hash', () => {
    const setup = withCaptain();
    const local = play(setup);
    const parsed = VerifyBody.parse({ setup, orders: fx.orders, claim: { winner: local.winner ?? -1, ticks: local.tick } });
    expect(parsed.setup.armies[1].units[0].captain).toBe(true);
    const server = replayBattle(parsed.setup as unknown as BattleSetup, fx.orders, fx.deployOrders, SIM_V2).summary;
    expect(server).toMatchObject({ winner: local.winner, ticks: local.tick, hash: local.hash() });
  });

  it('derives the same captain stats on every run', () => {
    expect(computeStats(bandCaptain(BAND, { nextId: 1 })!)).toEqual(computeStats(bandCaptain(BAND, { nextId: 1 })!));
  });
});
