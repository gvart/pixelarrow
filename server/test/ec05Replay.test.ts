/**
 * EC-05: the server replays battles where the bot uses the EC-05 tactics
 * (a garrison manning its palisade, focus fire, an orb against riders)
 * through zod to the client's hash on sim 2. The bot's orders come back
 * from the seed, so only the setup and the human's orders travel.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { generateBattlefield } from '../../src/world/battlefield';
import { Rng } from '../../src/sim/rng';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';

/** A garrison like a lair's (swarm, never retreats, 2 stakes) behind the assault field's palisade. */
function assaultSetup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = [...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'archer', 4, 4, 1), ...classSquad(rng, ids, 'companion', 2, 4, 3)];
  const garrison = armySpec([...classSquad(rng, ids, 'militia', 8, 4, 0), ...classSquad(rng, ids, 'slinger', 4, 4, 1), ...classSquad(rng, ids, 'gallic', 2, 4, 3)], true);
  return {
    seed,
    armies: [armySpec(mine, false), { ...garrison, doctrine: 'swarm', holdField: true, works: { stakes: 2, ditch: 0, laager: 0 } }],
    terrain: generateBattlefield(seed, { base: 'plain', river: false, coast: false, rocky: false, woods: 0.1, assault: true }),
  };
}

function fieldSetup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'slinger', 4, 3, 1), ...classSquad(rng, ids, 'companion', 3, 3, 3)], false);
  const bot = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'archer', 5, 3, 1), ...classSquad(rng, ids, 'hoplite', 3, 3, 2)], true);
  return { seed, armies: [mine, { ...bot, doctrine: 'swarm' }] };
}

/** Human riders against a lone bot line (swarm: it waits 10 s before it moves). */
function ringSetup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const riders = armySpec(classSquad(rng, ids, 'companion', 4, 3, 0), false);
  const line = armySpec(classSquad(rng, ids, 'hoplite', 8, 3, 0), true);
  return { seed, armies: [riders, { ...line, doctrine: 'swarm' }] };
}

/** The human advances at 1 s and charges at 20 s. */
function advanceThenCharge(b: Battle): void {
  if (b.tick === 20) for (const g of b.sideGroups(0)) b.issue(0, { kind: 'order', group: g.id, order: 'advance' });
  if (b.tick === 20 * 20) for (const g of b.sideGroups(0)) b.issue(0, { kind: 'order', group: g.id, order: 'charge' });
}

/** The riders ride round to the line's right flank, then charge it. */
function rideRound(b: Battle): void {
  const f = b.sideGroups(1)[0].formation;
  if (b.tick === 1) b.issue(0, { kind: 'form', group: 0, cx: f.cx + 7, cy: f.cy + 1, fx: -1, fy: 0, frontage: 2 });
  if (b.tick === 20 * 9) b.issue(0, { kind: 'order', group: 0, order: 'charge' });
}

function playClient(setup: BattleSetup, human: (b: Battle) => void = advanceThenCharge) {
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  const deployOrders = b.orderLog.length;
  b.startBattle();
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    human(b);
    b.step();
  }
  const bot = b.orderLog.filter((o) => o.side === 1).map((o) => o.order);
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], deployOrders, winner: b.winner, ticks: b.tick, hash: b.hash(), bot };
}

function replay(c: ReturnType<typeof playClient>) {
  const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
  return replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders).summary;
}

describe('EC-05 bot tactics: server replay', () => {
  it('a lair assault against a garrison holding its palisade replays to the client hash', () => {
    for (const seed of [71, 72]) {
      const c = playClient(assaultSetup(seed));
      expect(c.bot.some((o) => o.kind === 'form')).toBe(true);
      expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
    }
  });

  it('a field battle where the bot focuses its fire replays to the client hash', () => {
    const cs = [81, 82, 83].map((s) => playClient(fieldSetup(s)));
    expect(cs.some((c) => c.bot.some((o) => o.kind === 'focus'))).toBe(true);
    for (const c of cs) expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('a lone line ringing against riders on its flank replays to the client hash', () => {
    const cs = [91, 92, 93, 94].map((s) => playClient(ringSetup(s), rideRound));
    expect(cs.some((c) => c.bot.some((o) => o.kind === 'preset' && o.type === 'orb'))).toBe(true);
    for (const c of cs) expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });
});
