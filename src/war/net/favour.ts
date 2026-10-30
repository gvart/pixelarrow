/**
 * W-66 divine favour (docs/WAR.md "Divine favour"): the player is a demigod who leads mortals; his favour with the gods
 * grows forever (per account, never reset by a season) and makes the men he raises better. Shared by the server
 * (server/src/war/favour.ts: earning, D1) and the HUD's Divine favour panel (src/war/view/hud/favour.ts).
 *
 *  - Curve: FAVOUR_XP[L] favour reaches level L (200 x (L-1)^2): level 2 in about the first hour of play, level 10 in
 *    a few weeks, FAVOUR_MAX the last.
 *  - Earning (FAVOUR_EARN): battles won and fought, kills, bosses and lairs cleared, tasks claimed, story steps and
 *    chains, encounters, a region mastered (W-73: src/war/net/mastery.ts MASTERY.favour), and land held (claim points and the region, paid every LAND_MS while his men stand there,
 *    at most FAVOUR_EARN.land.hourCap an hour across regions).
 *  - Bonus (favourBonus): only for newly raised men (claimed souls, tunnel raises): unspent attribute points at every
 *    third level (at most FAVOUR_ATTR_MAX) and a better rarity of the starting kit at FAVOUR_GEAR_AT. Capped so a max
 *    favour fresh man stays below a level 3 to 4 veteran (who has 4 to 6 points, a skill and his deeds).
 */
import { normalizeItem, RARITIES, RARITY_LABEL, rarityRank, type Rarity } from '../../data/items';
import type { Equipment } from '../../data/units';
import type { WarPerson } from '../types';

export const FAVOUR_MAX = 12;
/** Favour (total) to reach each level; index = level (0 and 1: none). */
export const FAVOUR_XP: readonly number[] = Array.from({ length: FAVOUR_MAX + 1 }, (_, l) => (l <= 1 ? 0 : 200 * (l - 1) ** 2));

/** The level a total of `xp` favour gives. */
export function favourLevel(xp: number): number {
  let l = 1;
  while (l < FAVOUR_MAX && xp >= FAVOUR_XP[l + 1]) l++;
  return l;
}

/** Greek-flavoured titles by level (index = level). */
export const FAVOUR_TITLES: readonly string[] = [
  '', 'Hero', 'Demigod', "Heroes' Kin", 'Favoured of Ares', 'Spear of Athena', 'Herald of Hermes',
  'Hand of Apollo', 'Shield of Zeus', 'Titan-slayer', 'Ichor-blooded', 'Star of Olympus', 'Olympian-touched',
];
export const favourTitle = (level: number) => FAVOUR_TITLES[Math.max(1, Math.min(FAVOUR_MAX, level))];

/** What earns favour (amounts). */
export const FAVOUR_EARN = {
  /** A fight won (only his side still standing) or fought; each kill (at most killCap counted a fight). */
  win: 20, battle: 4, kill: 2, killCap: 20,
  /** A region guardian slain (each player who hurt it); a lair cleared (each player with men near it). */
  boss: 150, lair: 40,
  /** A task claimed. */
  task: { daily: 40, weekly: 150 },
  /** A story step done, the story's chain ended; an encounter step, an encounter ended. */
  storyStep: 25, storyEnd: 150, encounterStep: 10, encounterEnd: 30,
  /** Land, each pay: per claim point his alliance holds where his men stand (at most claimsCap), the region his alliance owns. */
  land: { claim: 1, claimsCap: 3, region: 2, hourCap: 30 },
} as const;
/** Land pays this often (each region room). */
export const LAND_MS = 10 * 60_000;

export type FavourReason = 'win' | 'battle' | 'boss' | 'lair' | 'task' | 'story' | 'encounter' | 'land' | 'mastery';
export const FAVOUR_REASON: Record<FavourReason, string> = {
  win: 'Battle won', battle: 'Battle fought', boss: 'Guardian slain', lair: 'Lair cleared', task: 'Task done',
  story: 'Story', encounter: 'Encounter', land: 'Land held', mastery: 'Region mastered',
};

/** Extra unspent attribute points at every third level, at most this many. */
export const FAVOUR_ATTR_MAX = 4;
/** Levels the starting kit's rarity steps up (common -> uncommon -> rare). */
export const FAVOUR_GEAR_AT: readonly number[] = [5, 10];

export interface FavourBonus { attr: number; gearTier: number; trait?: string }

/** What favour level `level` gives a newly raised man. */
export function favourBonus(level: number): FavourBonus {
  const l = Math.max(1, Math.min(FAVOUR_MAX, Math.floor(level)));
  return { attr: Math.min(FAVOUR_ATTR_MAX, Math.floor(l / 3)), gearTier: FAVOUR_GEAR_AT.filter((x) => l >= x).length };
}

/** The rarity a gear tier lifts the starting kit to. */
export const gearRarity = (tier: number): Rarity => RARITIES[Math.max(0, Math.min(2, tier))];

/** The man with the bonus: `attr` more unspent points; each kit piece below the tier's rarity lifted to it. Pure. */
export function withFavour(p: WarPerson, b: FavourBonus): WarPerson {
  if (!b.attr && !b.gearTier) return p;
  const to = gearRarity(b.gearTier), equip: Equipment = {};
  for (const [slot, it] of Object.entries(p.hero.equip)) {
    if (!it) continue;
    const up = rarityRank(it.rarity) < rarityRank(to) ? { ...it, rarity: to } : { ...it };
    equip[slot as keyof Equipment] = normalizeItem(up); // set pieces and named items keep their own rarity
  }
  return { ...p, hero: { ...p.hero, points: p.hero.points + b.attr, equip } };
}

/** What each level unlocks for new men, for the panel: the bonus that changed there (empty: only the title). */
export function favourUnlocks(level: number): string[] {
  const b = favourBonus(level), a = favourBonus(level - 1), out: string[] = [];
  if (level > 1 && b.attr > a.attr) out.push(`+${b.attr} attribute point${b.attr > 1 ? 's' : ''}`);
  if (level > 1 && b.gearTier > a.gearTier) out.push(`${RARITY_LABEL[gearRarity(b.gearTier)]} starting kit`);
  return out;
}

/** GET /api/war/favour. */
export interface FavourView {
  xp: number; level: number; title: string;
  /** Favour at the start of this level and of the next (null: the last level). */
  from: number; next: number | null;
  bonus: FavourBonus;
  recent: { at: number; amount: number; reason: FavourReason }[];
}

export function favourView(xp: number, recent: FavourView['recent'] = []): FavourView {
  const level = favourLevel(xp);
  return { xp, level, title: favourTitle(level), from: FAVOUR_XP[level], next: level < FAVOUR_MAX ? FAVOUR_XP[level + 1] : null, bonus: favourBonus(level), recent };
}
