/**
 * W-66, W-83, W-84 the demigod's level (docs/WAR.md "Levels and perks"): the player is a demigod who leads mortals; his
 * favour with the gods grows through the season from his path's work and resets with it. Levels unlock his path's perks
 * (src/data/warPerks.ts) and, for a warrior, his family's stronger classes (src/war/world/start.ts FAMILIES). Shared by
 * the server (server/src/war/favour.ts: earning, D1) and the HUD's panel (src/war/view/hud/favour.ts).
 *
 *  - Curve: FAVOUR_XP[L] favour reaches level L (200 x (L-1)^2): level 2 in about the first hour of play, level 10 in
 *    a few weeks, FAVOUR_MAX the last.
 *  - Earning (FAVOUR_EARN, W-111): each reason pays the paths in PAYS only: a warrior fights and holds land, a builder
 *    builds and raises works, a trader sells and carries. Tasks, stories and encounters pay every path. Land, goods sold
 *    and goods carried are capped an hour (HOUR_CAP).
 */
import { CLASSES, type ClassId } from '../../data/classes';
import { PERKS, type Perk } from '../../data/warPerks';
import { FAMILIES, type PathId, type StartFamily } from '../world/start';

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
  land: { claim: 1, claimsCap: 3, region: 2 },
  /** W-111 a builder: each second one of his men works on a site or at an alliance work; each good he gives to a work. */
  built: { labour: 0.03, gift: 0.25 },
  /** W-111 a trader: each coin of goods he sells; each load he brings over a border. */
  sold: 0.2, carried: 2,
} as const;
/** Land pays this often (each region room). */
export const LAND_MS = 10 * 60_000;

export type FavourReason = 'win' | 'battle' | 'boss' | 'lair' | 'land' | 'built' | 'sold' | 'carried' | 'task' | 'story' | 'encounter';
export const FAVOUR_REASON: Record<FavourReason, string> = {
  win: 'Battle won', battle: 'Battle fought', boss: 'Guardian slain', lair: 'Lair cleared', land: 'Land held',
  built: 'Building', sold: 'Goods sold', carried: 'Goods carried', task: 'Task done', story: 'Story', encounter: 'Encounter',
};
/** W-111: the one path each kind of work pays; the rest pay every path. */
export const PAYS: Partial<Record<FavourReason, PathId>> = { win: 'warrior', battle: 'warrior', boss: 'warrior', lair: 'warrior', land: 'warrior', built: 'builder', sold: 'trader', carried: 'trader' };
/** Most favour an hour from these (one count a player: only one path earns each). */
export const HOUR_CAP: Partial<Record<FavourReason, number>> = { land: 30, sold: 600, carried: 600 };

/** One row of the panel: what a level gives this player. */
export type PerkRow = Pick<Perk, 'level' | 'name' | 'text'>;

/** W-110, W-86: all a path gives by level; a warrior's new classes among the perks. No path: nothing. */
export function perkRows(path: PathId | null, family: StartFamily | null = null): PerkRow[] {
  if (!path) return [];
  const classes = path === 'warrior' && family ? Object.entries(FAMILIES[family].unlocks) : [];
  return [
    ...PERKS[path].map(({ level, name, text }) => ({ level, name, text })),
    ...classes.map(([cls, level]) => ({ level: level as number, name: 'New men', text: `${CLASSES[cls as ClassId].name} can join you.` })),
  ].sort((a, b) => a.level - b.level);
}

/** GET /api/war/favour. */
export interface FavourView {
  xp: number; level: number; title: string;
  /** Favour at the start of this level and of the next (null: the last level). */
  from: number; next: number | null;
  path: PathId | null; family: StartFamily | null;
  recent: { at: number; amount: number; reason: FavourReason }[];
}

export function favourView(xp: number, recent: FavourView['recent'] = [], path: PathId | null = null, family: StartFamily | null = null): FavourView {
  const level = favourLevel(xp);
  return { xp, level, title: favourTitle(level), from: FAVOUR_XP[level], next: level < FAVOUR_MAX ? FAVOUR_XP[level + 1] : null, path, family, recent };
}
