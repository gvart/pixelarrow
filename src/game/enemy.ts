/** Bot army generation, scaled to the player's strength. */
import type { Culture } from '../data/names';
import type { Hero } from '../data/units';
import { Rng } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { makeHero, rollRarity, type Archetype, type IdSource } from './heroes';

export interface EnemyArmy {
  culture: Culture;
  heroes: Hero[];
  power: number;
  targetPower: number;
}

/** Bot army strength relative to the player (before the victory ramp); tuned with `npm run balance`. */
export const ENEMY_POWER = 1.2;

export function armyPower(heroes: Hero[]): number {
  return heroes.reduce((a, h) => a + heroPower(h), 0);
}

export function generateEnemyArmy(rng: Rng, ids: IdSource, player: Hero[], battlesWon: number): EnemyArmy {
  const culture = rng.pick<Culture>(['greek', 'phoenician', 'celtic']);
  const playerPower = armyPower(player);
  const ramp = Math.min(0.3, battlesWon * 0.035);
  const targetPower = playerPower * (ENEMY_POWER + ramp + rng.range(-0.04, 0.06));
  const count = Math.max(4, Math.min(20, player.length + rng.int(-1, 1)));
  const avgLevel = player.reduce((a, h) => a + h.level, 0) / Math.max(1, player.length);
  const tier = Math.max(1, Math.min(3, 1 + Math.floor((avgLevel - 1) / 2.5) + (battlesWon >= 5 ? 1 : 0)));

  const slots: { arch: Archetype; group: number }[] = [];
  const nSkirm = Math.max(1, Math.round(count * 0.25));
  const nFlank = count >= 8 ? Math.max(1, Math.round(count * 0.15)) : 0;
  const nReserve = count >= 10 ? Math.max(1, Math.round(count * 0.12)) : 0;
  const nMain = count - nSkirm - nFlank - nReserve;
  const skirmArch: Archetype[] = culture === 'phoenician' ? ['slinger', 'peltast', 'archer'] : culture === 'celtic' ? ['peltast', 'slinger'] : ['peltast', 'slinger', 'archer'];
  const mainArch: Archetype = culture === 'celtic' ? 'swordsman' : 'hoplite';
  const shockArch: Archetype = culture === 'celtic' ? 'axeman' : 'swordsman';
  for (let i = 0; i < nMain; i++) slots.push({ arch: culture === 'celtic' && rng.chance(0.3) ? 'hoplite' : mainArch, group: 0 });
  for (let i = 0; i < nSkirm; i++) slots.push({ arch: rng.pick(skirmArch), group: 1 });
  for (let i = 0; i < nReserve; i++) slots.push({ arch: mainArch, group: 2 });
  for (let i = 0; i < nFlank; i++) slots.push({ arch: shockArch, group: 3 });

  const baseLevel = Math.max(1, Math.round(avgLevel));
  const heroes = slots.map((s) => makeHero(rng, ids, culture, s.arch, Math.max(1, baseLevel + rng.int(-1, 0)), tier, s.group));

  // Nudge levels / gear until we are within ~10% of the target power.
  let power = armyPower(heroes);
  for (let iter = 0; iter < 60; iter++) {
    if (power > targetPower * 1.08) {
      const h = rng.pick(heroes);
      if (h.level > 1) h.level--;
      else {
        const slot = rng.pick(['helmet', 'armor', 'trinket'] as const);
        if (h.equip[slot]) delete h.equip[slot];
        else if (h.equip.weapon) h.equip.weapon.cond = Math.max(20, h.equip.weapon.cond - 20);
      }
    } else if (power < targetPower * 0.94) {
      const h = rng.pick(heroes);
      if (h.level < 10 && rng.chance(0.7)) h.level++;
      else {
        const slot = rng.pick(['weapon', 'shield', 'helmet', 'armor'] as const);
        const it = h.equip[slot];
        if (it) it.rarity = rollRarity(rng, tier + 1);
      }
    } else break;
    power = armyPower(heroes);
  }
  return { culture, heroes, power, targetPower };
}
