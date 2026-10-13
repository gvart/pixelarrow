/**
 * EC-02 (item power cap): the duel and war-map server builds battles from the
 * same item data as the client (src/data/items.ts, sets.ts, affixes.ts), so a
 * re-tuned named item or set bonus has the same stats on both sides, and a
 * battle with them replays to the client's hash on the current sim. No schema
 * or server code change: stored items keep their ids, rarity and rolls.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { onlineBattleSetup } from '../../src/online/battle';
import { computeStats } from '../../src/sim/stats';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { ITEMS, normalizeItem } from '../../src/data/items';
import { SETS, setPieces } from '../../src/data/sets';
import { classSquad } from '../../src/dev/classBalance';
import { Rng } from '../../src/sim/rng';
import { setBotLevel } from '../../src/game/heroes';
import type { Hero } from '../../src/data/units';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';

/** Ten level-10 men: hoplites in the Aegis of Zeus and Trident of Poseidon, the Sacred Band in its full set. */
function capped(seed: number): Hero[] {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const hop = classSquad(rng, ids, 'hoplite', 6, 10, 0);
  const band = classSquad(rng, ids, 'sacred_band', 4, 10, 1);
  hop.forEach((h, i) => {
    h.equip.shield = normalizeItem({ uid: `s${i}`, def: 'aegis_of_zeus', rarity: 'legendary', cond: 100 });
    h.equip.weapon = normalizeItem({ uid: `w${i}`, def: 'poseidon_trident', rarity: 'legendary', cond: 100 });
  });
  band.forEach((h, i) => {
    for (const id of setPieces('sacred_band')) h.equip[ITEMS[id].slot] = normalizeItem({ uid: `b${i}${id}`, def: id, rarity: 'epic', cond: 100 });
  });
  // develop after gearing up, so the bot spends its points on what the gear asks for
  const all = [...hop, ...band];
  for (const h of all) setBotLevel(h, 10);
  return all;
}

describe('item power cap on the server (EC-02)', () => {
  it('the server-built setup carries the stats the client computes from the shared item data', () => {
    const mine = capped(5);
    const theirs = classSquad(new Rng(6), { nextId: 50 }, 'hoplite', 10, 10, 0);
    const setup = onlineBattleSetup(77, { heroes: mine, formations: undefined as never, bot: false }, { heroes: theirs, formations: undefined as never, bot: true }, null);
    setup.armies[0].units.forEach((u, i) => expect(u.stats).toEqual(computeStats(mine[i])));
    // the re-tuned numbers are what the server sees
    expect(ITEMS.aegis_of_zeus.mods.morale).toBe(2);
    expect(SETS.sacred_band.bonuses[0].mods?.morale).toBe(2);
    expect(setup.armies[0].units[0].stats.powers?.map((p) => p.id).sort()).toEqual(['aegis', 'executioner']);
    expect(setup.armies[0].units[6].stats.setSpecials).toContain('bond_of_the_band');
  });

  it('a battle with re-tuned named items and a set bonus replays to the client hash', () => {
    const setup: BattleSetup = onlineBattleSetup(91, { heroes: capped(9), formations: undefined as never, bot: true }, { heroes: classSquad(new Rng(10), { nextId: 50 }, 'hoplite', 10, 10, 0), formations: undefined as never, bot: true }, null);
    const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
    const b = new Battle(setup);
    b.startBattle();
    while (b.phase !== 'ended' && b.tick < b.timeLimitTicks + 10) b.step();
    const claim = { winner: b.winner, ticks: b.tick, hash: b.hash() };
    const body = VerifyBody.parse({ simVersion: SIM_VERSION, setup: pristine, orders: JSON.parse(JSON.stringify(b.orderLog)), deployOrders: 0, claim });
    const r = replayBattle(body.setup as unknown as BattleSetup, body.orders as LoggedOrder[], body.deployOrders);
    expect(r.summary).toMatchObject(claim);
  });
});
