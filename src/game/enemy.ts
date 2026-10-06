/** Bot army generation: sized and tuned to a target power (the player's, or a world party's). */
import type { Culture } from '../data/names';
import type { Hero } from '../data/units';
import { Rng } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { makeHero, rollRarity, setBotLevel, type Archetype, type IdSource } from './heroes';

export interface EnemyArmy {
  culture: Culture;
  heroes: Hero[];
  power: number;
  targetPower: number;
}

/** Bot army strength relative to the player (before the victory ramp); tuned with `npm run balance`. */
export const ENEMY_POWER = 1.2;

/** Army make-up: a proper battle line, or the kind of band that roams the world map. */
export type ArmyMix = 'line' | 'bandits' | 'raiders' | 'mercs';

export interface ArmyRequest {
  culture?: Culture;
  count: number;
  level: number;
  /** Gear tier 1..3. */
  tier: number;
  targetPower: number;
  mix?: ArmyMix;
  /** false: keep the army as generated (its natural power), no level/gear nudging. */
  tune?: boolean;
}

export function armyPower(heroes: Hero[]): number {
  return heroes.reduce((a, h) => a + heroPower(h), 0);
}

/** The classic skirmish opponent: sized to the player's army at ENEMY_POWER (+ a victory ramp). */
export function generateEnemyArmy(rng: Rng, ids: IdSource, player: Hero[], battlesWon: number): EnemyArmy {
  const culture = rng.pick<Culture>(['greek', 'phoenician', 'celtic']);
  const playerPower = armyPower(player);
  const ramp = Math.min(0.3, battlesWon * 0.035);
  const targetPower = playerPower * (ENEMY_POWER + ramp + rng.range(-0.04, 0.06));
  const count = Math.max(4, Math.min(20, player.length + rng.int(-1, 1)));
  const avgLevel = player.reduce((a, h) => a + h.level, 0) / Math.max(1, player.length);
  const tier = Math.max(1, Math.min(3, 1 + Math.floor((avgLevel - 1) / 2.5) + (battlesWon >= 5 ? 1 : 0)));
  return buildArmy(rng, ids, { culture, count, level: avgLevel, tier, targetPower, mix: 'line' });
}

interface Slot {
  arch: Archetype;
  group: number;
}

function composition(rng: Rng, culture: Culture, count: number, mix: ArmyMix): Slot[] {
  const slots: Slot[] = [];
  if (mix === 'bandits') {
    // A rabble: levies with whatever they found, a few throwers, a couple of blades.
    for (let i = 0; i < count; i++) {
      const r = rng.next();
      if (r < 0.45) slots.push({ arch: 'raw', group: 0 });
      else if (r < 0.65) slots.push({ arch: 'swordsman', group: 0 });
      else if (r < 0.85) slots.push({ arch: rng.pick(['peltast', 'slinger'] as const), group: 1 });
      else slots.push({ arch: 'axeman', group: count >= 6 ? 3 : 0 });
    }
    return slots;
  }
  if (mix === 'raiders') {
    // Celtic war band: long swords and axes, javelins, a wedge on the flank.
    for (let i = 0; i < count; i++) {
      const r = rng.next();
      if (r < 0.5) slots.push({ arch: 'swordsman', group: 0 });
      else if (r < 0.72) slots.push({ arch: 'axeman', group: count >= 6 ? 3 : 0 });
      else slots.push({ arch: 'peltast', group: 1 });
    }
    return slots;
  }
  const nSkirm = Math.max(1, Math.round(count * 0.25));
  const nFlank = count >= 8 ? Math.max(1, Math.round(count * 0.15)) : 0;
  const nReserve = count >= 10 ? Math.max(1, Math.round(count * 0.12)) : 0;
  const nMain = count - nSkirm - nFlank - nReserve;
  const skirmArch: Archetype[] = culture === 'phoenician' ? ['slinger', 'peltast', 'archer'] : culture === 'celtic' ? ['peltast', 'slinger'] : ['peltast', 'slinger', 'archer'];
  const mainArch: Archetype = culture === 'celtic' ? 'swordsman' : 'hoplite';
  const shockArch: Archetype = culture === 'celtic' ? 'axeman' : 'swordsman';
  for (let i = 0; i < nMain; i++) slots.push({ arch: culture === 'celtic' && rng.chance(0.3) ? 'hoplite' : mix === 'mercs' && rng.chance(0.3) ? 'swordsman' : mainArch, group: 0 });
  for (let i = 0; i < nSkirm; i++) slots.push({ arch: rng.pick(skirmArch), group: 1 });
  for (let i = 0; i < nReserve; i++) slots.push({ arch: mainArch, group: 2 });
  for (let i = 0; i < nFlank; i++) slots.push({ arch: shockArch, group: 3 });
  return slots;
}

/** Build an army of `count` heroes, then nudge levels and gear until it is within ~10% of the target power. */
export function buildArmy(rng: Rng, ids: IdSource, req: ArmyRequest): EnemyArmy {
  const culture = req.culture ?? rng.pick<Culture>(['greek', 'phoenician', 'celtic']);
  const mix = req.mix ?? 'line';
  const count = Math.max(1, Math.min(20, Math.round(req.count)));
  const tier = Math.max(1, Math.min(3, Math.round(req.tier)));
  const targetPower = req.targetPower;
  const slots = composition(rng, culture, count, mix);
  const baseLevel = Math.max(1, Math.round(req.level));
  const heroes: Hero[] = [];
  for (const s of slots) {
    const h = makeHero(rng, ids, culture, s.arch, 1, tier, s.group, heroes);
    setBotLevel(h, Math.max(1, baseLevel + rng.int(-1, 0)));
    heroes.push(h);
  }

  let power = armyPower(heroes);
  for (let iter = 0; iter < (req.tune === false ? 0 : 80); iter++) {
    if (power > targetPower * 1.08) {
      const h = rng.pick(heroes);
      if (h.level > 1) setBotLevel(h, h.level - 1);
      else {
        const slot = rng.pick(['helmet', 'armor', 'trinket'] as const);
        if (h.equip[slot]) delete h.equip[slot];
        else if (h.equip.weapon) h.equip.weapon.cond = Math.max(20, h.equip.weapon.cond - 20);
      }
    } else if (power < targetPower * 0.94) {
      const h = rng.pick(heroes);
      if (h.level < 10 && rng.chance(0.7)) setBotLevel(h, h.level + 1);
      else {
        const slot = rng.pick(['weapon', 'shield', 'helmet', 'armor'] as const);
        const it = h.equip[slot];
        if (it) it.rarity = rollRarity(rng, tier + 1);
      }
    } else break;
    power = armyPower(heroes);
  }
  return { culture, heroes, power, targetPower: req.tune === false ? power : targetPower };
}
