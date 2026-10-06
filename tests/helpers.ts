import { Campaign } from '../src/game/campaign';
import { generateEnemyArmy } from '../src/game/enemy';
import { armySpec } from '../src/game/armySpec';
import { makeHero } from '../src/game/heroes';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { Hero } from '../src/data/units';
import type { BattleSetup } from '../src/sim/types';

export function standardSetup(seed: number, bothBots = true): { setup: BattleSetup; player: Hero[]; enemy: Hero[] } {
  const camp = Campaign.fresh(1234);
  const enemy = generateEnemyArmy(new Rng(seed), camp.data, camp.data.heroes, 0).heroes;
  const setup: BattleSetup = { seed, armies: [armySpec(camp.data.heroes, bothBots), armySpec(enemy, true)] };
  return { setup, player: camp.data.heroes, enemy };
}

export function runToEnd(b: Battle, maxTicks = 20 * 400): void {
  b.startBattle();
  for (let i = 0; i < maxTicks && b.phase !== 'ended'; i++) b.step();
}

/** A tiny 1v1 duel with hand-placed units. */
export function duel(seed: number, attackerArch: 'hoplite' | 'swordsman' = 'swordsman', defenderArch: 'hoplite' | 'swordsman' = 'hoplite'): Battle {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const a = makeHero(rng, ids, 'greek', attackerArch, 3, 2, 0);
  const d = makeHero(rng, ids, 'greek', defenderArch, 3, 2, 0);
  const b = new Battle({ seed, armies: [armySpec([a], false), armySpec([d], false)], timeLimit: 600 });
  return b;
}
