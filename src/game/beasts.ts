/**
 * Beast armies with their hoards (offline encounters, the Beast trial and the
 * online lairs / world bosses all use these). A beast's hoard is gear carried
 * in its (unused) equipment slots: animals ignore gear in battle, and the
 * loot of a slain beast is what it carried, so the ordinary loot code
 * (src/game/loot.ts lootPool) hands it out. Hoard rarity comes from
 * rollBeastRarity: the only regular source of Legendary gear.
 */
import type { Hero } from '../data/units';
import { ITEM_LIST, type Slot } from '../data/items';
import { ENCOUNTERS, LAIR_BEASTS, mythHeroes, type EncounterId } from '../data/beasts';
import { Rng } from '../sim/rng';
import { makeItem, rollBeastRarity, type IdSource } from './heroes';
import type { EnemyArmy } from './enemy';
import { armyPower } from './enemy';

const HOARD_SLOTS: Slot[] = ['weapon', 'armor', 'helmet', 'shield', 'trinket'];

/** Gear a beast's hoard may hold: the better half of each slot. */
function hoardPool(slot: Slot): string[] {
  return ITEM_LIST.filter((d) => d.slot === slot && d.tier >= 2).map((d) => d.id);
}

/** Heroes of an encounter at a level, the body (or the first flock members) carrying `items` pieces of hoard. */
export function beastArmy(enc: EncounterId, level: number, rng: Rng, ids: IdSource, items = 2, prefix = 'm'): Hero[] {
  const heroes = mythHeroes(enc, level, prefix);
  const carriers = heroes.filter((h) => h.cls === ENCOUNTERS[enc].body);
  for (let i = 0; i < items; i++) {
    const h = carriers[i % carriers.length];
    const free = HOARD_SLOTS.filter((s) => !h.equip[s]);
    if (!free.length) continue;
    const slot = free[i % free.length];
    const pool = hoardPool(slot);
    if (!pool.length) continue;
    h.equip[slot] = makeItem(rng, ids, rng.pick(pool), rollBeastRarity(rng), 100);
  }
  return heroes;
}

export function beastEnemy(enc: EncounterId, level: number, seed: number, ids: IdSource): EnemyArmy {
  const heroes = beastArmy(enc, level, new Rng(seed), ids, 2);
  const power = armyPower(heroes);
  return { culture: 'greek', heroes, power, targetPower: power };
}

/** Offline overland bands: about one in fourteen is a mythical beast instead (by its seed). */
export function bandBeast(seed: number): EncounterId | null {
  const s = seed >>> 0;
  if (s % 14 !== 3) return null;
  return LAIR_BEASTS[Math.floor(s / 14) % LAIR_BEASTS.length];
}
