/**
 * Beast armies with their hoards (offline encounters, the Beast trial and the
 * online lairs / world bosses all use these). A beast's hoard is gear carried
 * in its (unused) equipment slots: animals ignore gear in battle, and the
 * loot of a slain beast is what it carried, so the ordinary loot code
 * (src/game/loot.ts lootPool) hands it out. Hoard rarity comes from
 * rollBeastRarity: the only regular source of Legendary gear.
 */
import type { Hero } from '../data/units';
import { BASE_ITEMS, itemDef, type Item, type Slot } from '../data/items';
import { ENCOUNTERS, LAIR_BEASTS, mythHeroes, type EncounterId } from '../data/beasts';
import { Rng } from '../sim/rng';
import { makeItem, rollBeastRarity, type IdSource } from './heroes';
import { BEAST_NAMED, HOARD_SETS, SOURCES, armyPick, pieceDefs } from './sources';
import type { EnemyArmy } from './enemy';
import { armyPower } from './enemy';

const HOARD_SLOTS: Slot[] = ['weapon', 'armor', 'helmet', 'shield', 'trinket'];

/** Gear a beast's hoard may hold: the better half of each slot. */
export function hoardPool(slot: Slot): string[] {
  return BASE_ITEMS.filter((d) => d.slot === slot && d.tier >= 2).map((d) => d.id);
}

/**
 * One piece of a beast's hoard for one of the `free` slots (`slot` unless a
 * set piece or the named item goes elsewhere): rarity from rollBeastRarity;
 * an epic is an epic set piece `SOURCES.hoardSet` of the time, a legendary
 * the beast's named item `SOURCES.hoardNamed` of the time; other pieces
 * follow the army's `classes` (src/game/sources.ts armyPick).
 */
export function hoardItem(rng: Rng, ids: IdSource, enc: EncounterId, slot: Slot, free: readonly Slot[], classes: readonly string[] = []): Item | null {
  const rarity = rollBeastRarity(rng);
  if (rarity === 'legendary' && rng.chance(SOURCES.hoardNamed)) {
    const named = BEAST_NAMED[enc].filter((id) => free.includes(itemDef(id).slot));
    if (named.length) return makeItem(rng, ids, rng.pick(named), 'legendary', 100);
  }
  if (rarity === 'epic' && rng.chance(SOURCES.hoardSet)) {
    const pieces = HOARD_SETS.flatMap(pieceDefs).filter((d) => free.includes(d.slot));
    if (pieces.length) return makeItem(rng, ids, armyPick(rng, pieces, classes).id, 'epic', 100);
  }
  const pool = hoardPool(slot).map(itemDef);
  if (!pool.length) return null;
  return makeItem(rng, ids, armyPick(rng, pool, classes).id, rarity, 100);
}

/** Heroes of an encounter at a level, the body (or the first flock members) carrying `items` pieces of hoard (following the army's `classes`). */
export function beastArmy(enc: EncounterId, level: number, rng: Rng, ids: IdSource, items = 2, prefix = 'm', classes: readonly string[] = []): Hero[] {
  const heroes = mythHeroes(enc, level, prefix);
  const carriers = heroes.filter((h) => h.cls === ENCOUNTERS[enc].body);
  for (let i = 0; i < items; i++) {
    const h = carriers[i % carriers.length];
    const free = HOARD_SLOTS.filter((s) => !h.equip[s]);
    if (!free.length) continue;
    const it = hoardItem(rng, ids, enc, free[i % free.length], free, classes);
    if (it) h.equip[itemDef(it.def).slot] = it;
  }
  return heroes;
}

export function beastEnemy(enc: EncounterId, level: number, seed: number, ids: IdSource, classes: readonly string[] = []): EnemyArmy {
  const heroes = beastArmy(enc, level, new Rng(seed), ids, 2, 'm', classes);
  const power = armyPower(heroes);
  return { culture: 'greek', heroes, power, targetPower: power };
}

/** Offline overland bands: about one in fourteen is a mythical beast instead (by its seed). */
export function bandBeast(seed: number): EncounterId | null {
  const s = seed >>> 0;
  if (s % 14 !== 3) return null;
  return LAIR_BEASTS[Math.floor(s / 14) % LAIR_BEASTS.length];
}
