/**
 * AB-02: the server replays a client battle in which the human side uses all
 * seven signature actives (abilities.md R3) and the bot side uses its own,
 * through zod, to the client's hash on sim 2. The actives are `ability`
 * orders, which the schema already carries (`z.string().max(32)`); the sim
 * validates the id.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { armySpec } from '../../src/game/armySpec';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import type { ClassId } from '../../src/data/classes';
import type { AbilityId, PerkId } from '../../src/data/perks';
import type { Hero } from '../../src/data/units';
import type { BattleSetup, LoggedOrder, SimEvent } from '../../src/sim/types';

const SIGNATURE: AbilityId[] = ['push', 'bond', 'warcry', 'sunder', 'aimed', 'recharge', 'scythe'];

function men(rng: Rng, ids: { nextId: number }, cls: ClassId, n: number, perks: PerkId[], group: number): Hero[] {
  const out = classSquad(rng, ids, cls, n, 4, group);
  for (const h of out) h.perks = [...perks];
  return out;
}

/** Side 0 (human): one group per family's active. Side 1 (bot, level 4): it takes the tier-2 actives itself. */
function setupOf(seed: number): BattleSetup {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const mine = [
    ...men(rng, ids, 'hoplite', 3, ['shield_drill', 'push'], 0), ...men(rng, ids, 'sacred_band', 2, ['shield_drill', 'bond'], 0),
    ...men(rng, ids, 'archer', 3, ['longshot', 'aimed'], 1),
    ...men(rng, ids, 'gallic', 2, ['brawler', 'warcry'], 2), ...men(rng, ids, 'falx', 2, ['brawler', 'sunder'], 2),
    ...men(rng, ids, 'companion', 2, ['horsemanship', 'recharge'], 3), ...men(rng, ids, 'chariot', 1, ['horsemanship', 'scythe'], 3),
  ];
  const theirs = [...classSquad(rng, ids, 'hoplite', 8, 4, 0), ...classSquad(rng, ids, 'slinger', 3, 4, 1), ...classSquad(rng, ids, 'celt_sword', 4, 4, 2)];
  return { seed, armies: [armySpec(mine, false), armySpec(theirs, true)] };
}

/** The player focuses the archers, sends everyone in, and uses every ready ability twice a second. */
function playClient(seed: number) {
  const setup = setupOf(seed);
  const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
  const b = new Battle(setup);
  b.startBattle();
  const events: SimEvent[] = [];
  while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) {
    if (b.tick === 1) {
      b.issue(0, { kind: 'focus', group: 1, target: 4 });
      for (const g of [0, 2, 3]) b.issue(0, { kind: 'order', group: g, order: 'charge' });
      b.issue(0, { kind: 'order', group: 1, order: 'advance' });
    }
    if (b.tick % 10 === 0) for (const u of b.units) if (u.side === 0) for (const id of u.abil) if (b.abilityReady(u, id)) b.issue(0, { kind: 'ability', unit: u.id, ability: id });
    b.step();
    events.push(...b.drainEvents());
  }
  return { setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)) as LoggedOrder[], winner: b.winner, ticks: b.tick, hash: b.hash(), events, units: b.units };
}

describe('signature actives: server replay (AB-02)', () => {
  it('a battle using all seven actives replays through zod to the client hash', () => {
    const c = playClient(2024);
    const used = new Set(c.events.flatMap((e) => (e.type === 'ability' && c.units[e.unit].side === 0 ? [e.ability] : [])));
    for (const id of SIGNATURE) expect(used.has(id), id).toBe(true);
    expect(c.events.some((e) => e.type === 'ability' && c.units[e.unit].side === 1)).toBe(true);
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: c.orders, deployOrders: 0, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
    expect(out).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });

  it('an unknown ability id in the log is ignored by the sim (logged, no effect)', () => {
    const c = playClient(2025);
    const forged = [...c.orders, { tick: 5, side: 0 as const, order: { kind: 'ability' as const, unit: 0, ability: 'smite' as AbilityId } }].sort((a, b) => a.tick - b.tick);
    const parsed = VerifyBody.parse({ simVersion: SIM_VERSION, setup: c.setup, orders: forged, deployOrders: 0, claim: { winner: c.winner, ticks: c.ticks, hash: c.hash } });
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
    expect(out).toMatchObject({ winner: c.winner, ticks: c.ticks, hash: c.hash });
  });
});
