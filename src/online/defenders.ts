/**
 * Neutral defenders (data-driven, pure): no region is free to claim. Every
 * unclaimed region is held by neutrals chosen by its kind and ground,
 * generated deterministically from the shard seed, the region id and the
 * respawn epoch, so the server can always rebuild them.
 *
 * Animals (wolves, boars, bears) are the animal classes of
 * src/data/classes.ts (`cls: 'wolf'`...), still flagged with
 * `arch: 'animal:<kind>'`; keep every defender definition in this file.
 */
import type { Culture } from '../data/names';
import type { Hero } from '../data/units';
import { makeHero, setBotLevel, rollRarity, type Archetype, type IdSource } from '../game/heroes';
import { Rng, hashString } from '../sim/rng';
import type { RegionInfo } from './world';

export type AnimalKind = 'wolf' | 'boar' | 'bear';

export interface DefenderUnit {
  /** Soldier archetype, or an animal (placeholder soldier). */
  arch: Archetype | `animal:${AnimalKind}`;
  /** Battle group (0 main, 1 skirmish, 2 reserve, 3 flank). */
  group: number;
  weight: number;
}

export interface DefenderDef {
  id: string;
  label: string;
  culture: Culture | 'local';
  units: DefenderUnit[];
  /** Gear tier offset (deserters and city garrisons are better equipped). */
  gear: number;
}

export const DEFENDERS: Record<string, DefenderDef> = {
  militia: { id: 'militia', label: 'Peasant militia and brigands', culture: 'local', gear: 0, units: [
    { arch: 'raw', group: 0, weight: 5 }, { arch: 'swordsman', group: 0, weight: 2 }, { arch: 'peltast', group: 1, weight: 2 }, { arch: 'slinger', group: 1, weight: 1 },
  ] },
  beasts: { id: 'beasts', label: 'Wolf packs and wild boars', culture: 'local', gear: 0, units: [
    { arch: 'animal:wolf', group: 0, weight: 5 }, { arch: 'animal:boar', group: 3, weight: 2 },
  ] },
  outlaws: { id: 'outlaws', label: 'Outlaw archers', culture: 'local', gear: 0, units: [
    { arch: 'archer', group: 1, weight: 5 }, { arch: 'swordsman', group: 0, weight: 2 }, { arch: 'raw', group: 0, weight: 2 },
  ] },
  tribes: { id: 'tribes', label: 'Hill tribes', culture: 'celtic', gear: 0, units: [
    { arch: 'slinger', group: 1, weight: 4 }, { arch: 'peltast', group: 1, weight: 4 }, { arch: 'axeman', group: 0, weight: 3 }, { arch: 'animal:bear', group: 3, weight: 1 },
  ] },
  pirates: { id: 'pirates', label: 'Pirates', culture: 'phoenician', gear: 0, units: [
    { arch: 'swordsman', group: 0, weight: 5 }, { arch: 'peltast', group: 1, weight: 3 }, { arch: 'slinger', group: 1, weight: 2 },
  ] },
  deserters: { id: 'deserters', label: 'Deserter mercenaries', culture: 'local', gear: 1, units: [
    { arch: 'hoplite', group: 0, weight: 4 }, { arch: 'swordsman', group: 0, weight: 3 }, { arch: 'archer', group: 1, weight: 2 },
  ] },
  city: { id: 'city', label: 'City garrison', culture: 'greek', gear: 1, units: [
    { arch: 'hoplite', group: 0, weight: 6 }, { arch: 'archer', group: 1, weight: 2 }, { arch: 'peltast', group: 1, weight: 2 }, { arch: 'swordsman', group: 3, weight: 1 },
  ] },
  cultists: { id: 'cultists', label: 'Cultists and fanatics', culture: 'local', gear: 0, units: [
    { arch: 'axeman', group: 0, weight: 4 }, { arch: 'swordsman', group: 0, weight: 3 }, { arch: 'raw', group: 0, weight: 3 },
  ] },
};

/** Which neutrals hold a region. */
export function defenderFor(seed: number, r: Pick<RegionInfo, 'id' | 'kind' | 'site' | 'coast'>): DefenderDef {
  if (r.kind === 'capital' || r.kind === 'town') return DEFENDERS.city;
  if (r.kind === 'fort') return DEFENDERS.deserters;
  if (r.kind === 'lair') return DEFENDERS.cultists;
  if (r.kind === 'post') return r.coast ? DEFENDERS.pirates : DEFENDERS.outlaws;
  const roll = (hashString(`${seed}:${r.id}:def`) % 1000) / 1000;
  switch (r.site.base) {
    case 'forest':
      return roll < 0.55 ? DEFENDERS.beasts : DEFENDERS.outlaws;
    case 'hills':
      return r.site.rocky && roll < 0.35 ? DEFENDERS.deserters : DEFENDERS.tribes;
    case 'scrub':
      return roll < 0.25 ? DEFENDERS.cultists : DEFENDERS.militia;
    default:
      return r.coast ? DEFENDERS.pirates : DEFENDERS.militia;
  }
}

/** Size and level by region tier (1 plain .. 5 capital); see defenderStrength for the depth scaling. */
export const NPC_TIERS: Record<number, { min: number; max: number; level: number; gear: number }> = {
  1: { min: 2, max: 3, level: 1, gear: 1 },
  2: { min: 3, max: 5, level: 2, gear: 1 },
  3: { min: 5, max: 7, level: 3, gear: 2 },
  4: { min: 8, max: 10, level: 4, gear: 2 },
  5: { min: 14, max: 16, level: 6, gear: 3 },
};

/** Victories in a row needed to claim a region of each tier (progress decays, see SIEGE_DECAY_MS). */
export const WINS_TO_CLAIM: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
/** A siege with no new victory for this long starts over. */
export const SIEGE_DECAY_MS = 6 * 3_600_000;
/** Neutrals re-raise their losses after this long (the respawn epoch advances). */
export const RESPAWN_MS = 6 * 3_600_000;
/** An owned region with no garrison whose income was not collected for this long falls back to the neutrals. */
export const ABANDON_MS = 72 * 3_600_000;

/**
 * How dangerous the neutrals of a region are: its tier plus its depth (routes
 * from the nearest spawn plot, RegionInfo.depth). Land gets harder the
 * further one pushes from the starting areas.
 */
export function defenderStrength(r: Pick<RegionInfo, 'tier' | 'depth'>): { count: [number, number]; level: number; gear: number } {
  const t = NPC_TIERS[r.tier] ?? NPC_TIERS[1];
  const depth = Math.max(0, Math.min(1, r.depth));
  const extra = Math.round(depth * 2);
  return { count: [t.min + extra, t.max + extra], level: Math.min(10, t.level + Math.round(depth * 3)), gear: Math.min(3, t.gear + (depth > 0.6 ? 1 : 0)) };
}

const ANIMAL: Record<AnimalKind, { name: string }> = {
  wolf: { name: 'Wolf' },
  boar: { name: 'Boar' },
  bear: { name: 'Bear' },
};

/** The neutral defenders of a region for a respawn epoch (deterministic). */
export function neutralDefenders(seed: number, region: Pick<RegionInfo, 'id' | 'tier' | 'depth' | 'kind' | 'site' | 'coast'>, epoch: number): Hero[] {
  const rng = new Rng((seed ^ hashString(`r${region.id}`) ^ Math.imul(epoch + 1, 0x9e3779b1)) >>> 0 || 1);
  const def = defenderFor(seed, region);
  const str = defenderStrength(region);
  const culture: Culture = def.culture === 'local' ? rng.weighted<Culture>([['greek', 5], ['phoenician', 3], ['celtic', 2]]) : def.culture;
  const count = rng.int(str.count[0], str.count[1]);
  const ids: IdSource = { nextId: 1 };
  const heroes: Hero[] = [];
  const gear = Math.max(1, Math.min(3, str.gear + def.gear));
  for (let i = 0; i < count; i++) {
    const u = rng.weighted(def.units.map((x) => [x, x.weight] as const));
    if (u.arch.startsWith('animal:')) {
      // Real animals (src/data/classes.ts): their own stats, sprites and pack behaviour.
      const kind = u.arch.slice(7) as AnimalKind;
      const h = makeHero(rng, ids, culture, kind, Math.max(1, str.level), 1, u.group, heroes);
      h.name = `${ANIMAL[kind].name} ${heroes.filter((x) => x.arch === u.arch).length + 1}`;
      h.arch = u.arch;
      heroes.push(h);
      continue;
    }
    const h = makeHero(rng, ids, culture, u.arch as Archetype, 1, gear, u.group, heroes);
    setBotLevel(h, Math.max(1, str.level + rng.int(-1, 0)));
    if (gear >= 3 && h.equip.weapon) h.equip.weapon.rarity = rollRarity(rng, gear);
    heroes.push(h);
  }
  return heroes.map((h) => {
    h.id = `n${region.id}e${epoch}_${h.id}`;
    for (const it of Object.values(h.equip)) if (it) it.uid = `n${region.id}e${epoch}_${it.uid}`;
    return h;
  });
}

export function isAnimal(h: Pick<Hero, 'arch'>): boolean {
  return !!h.arch && h.arch.startsWith('animal:');
}
