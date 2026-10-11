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
import { Campaign } from '../../src/game/campaign';
import { classSquad } from '../../src/dev/classBalance';
import { assaultCases } from '../../src/dev/arcBalance';
import { generateBattlefield } from '../../src/world/battlefield';
import { Rng } from '../../src/sim/rng';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';

function assaultSetup(seed: number): BattleSetup {
  const x = assaultCases(1)[seed % 3];
  const c = Campaign.fresh(x.world);
  const foe = c.garrisonEnemy(x.lair)!;
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = [...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'archer', 4, 4, 1), ...classSquad(rng, ids, 'companion', 2, 4, 3)];
  return {
    seed,
    armies: [armySpec(mine, false), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine, holdField: foe.holdField, works: foe.works }],
    terrain: generateBattlefield(seed, { ...c.assaultSite(x.lair), assault: true }),
  };
}

function fieldSetup(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = armySpec([...classSquad(rng, ids, 'hoplite', 6, 3, 0), ...classSquad(rng, ids, 'slinger', 4, 3, 1), ...classSquad(rng, ids, 'companion', 3, 3, 3)], false);
  const bot = armySpec([...classSquad(rng, ids, 'hoplite', 8, 3, 0), ...classSquad(rng, ids, 'archer', 5, 3, 1), ...classSquad(rng, ids, 'hoplite', 3, 3, 2)], true);
  return { seed, armies: [mine, { ...bot, doctrine: 'swarm' }] };
}

function playClient(setup: BattleSetup) {
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  const deployOrders = b.orderLog.length;
  b.startBattle();
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    if (b.tick === 20) for (const g of b.sideGroups(0)) b.issue(0, { kind: 'order', group: g.id, order: 'advance' });
    if (b.tick === 20 * 20) for (const g of b.sideGroups(0)) b.issue(0, { kind: 'order', group: g.id, order: 'charge' });
    b.step();
  }
  const bot = b.orderLog.filter((o) => o.side === 1).map((o) => o.order);
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], deployOrders, winner: b.winner, ticks: b.tick, hash: b.hash(), bot };
}

function replay(c: ReturnType<typeof playClient>) {
  const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: c.deployOrders, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
  return replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
}

describe('EC-05 bot tactics: server replay', () => {
  it('a lair assault against a garrison holding its palisade replays to the client hash', () => {
    for (const seed of [71, 72]) {
      const c = playClient(assaultSetup(seed));
      expect(c.bot.some((o) => o.kind === 'form')).toBe(true);
      expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
    }
  });

  it('a field battle where the bot focuses its fire and rings against riders replays to the client hash', () => {
    const cs = [81, 82, 83, 84].map((s) => playClient(fieldSetup(s)));
    expect(cs.some((c) => c.bot.some((o) => o.kind === 'focus'))).toBe(true);
    expect(cs.some((c) => c.bot.some((o) => o.kind === 'preset' && o.type === 'orb'))).toBe(true);
    for (const c of cs) expect(replay(c)).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });
});
