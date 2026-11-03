/**
 * A new player's start (docs/WAR.md "Starting a game"): one of the four alliances, then a free home region of that
 * alliance, then his path for the season (W-83), which gives his first men (W-95). Pure rules shared by the server
 * (server/src/war/start.ts, the one that decides) and the menu (src/war/menu, which shows the same).
 */
import { ARMY_MAX } from '../sim/soldiers';
import type { Family } from '../sim/skills';
import { joinRefusal, type HeldRegion } from './access';
import { ALLIANCES } from './alliances';
import { WORLD_REGIONS } from './regions';
import type { AllianceId, WorldRegion } from './types';

/** The six classes the Tunnel of Shades raises (server/src/war/raise.ts). */
export const START_CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer'] as const;
export type StartClass = (typeof START_CLASSES)[number];

export type PathId = 'warrior' | 'builder' | 'trader';

/**
 * What each path is and starts with (W-85, W-95): the one table to tune. `cap` is the soldiers he may grow to; `start`
 * is his first men in slot order, soldiers first (a warrior's come from FAMILIES). The guards (hoplites) and the workers
 * (civilians) are defaults the owner has not fixed: docs/impl/paths-rework.md.
 */
export const PATHS: Record<PathId, { name: string; does: string; cap: number; startText: string; start: readonly string[] }> = {
  warrior: { name: 'Warrior', does: 'You fight. Beat beasts and rival armies, and take land for your alliance.', cap: 12, startText: '6 soldiers of one family', start: [] },
  builder: { name: 'Builder', does: 'You build. Raise the towns, walls and workshops your alliance needs.', cap: 4, startText: '2 guards, an engineer, a forager', start: ['hoplite', 'hoplite', 'civ_engineer', 'civ_forager'] },
  trader: { name: 'Trader', does: 'You trade. Gather goods, drive carts between towns and sell at a profit.', cap: 4, startText: '2 guards, a merchant, a forager', start: ['hoplite', 'hoplite', 'civ_merchant', 'civ_forager'] },
};
export const PATH_IDS = Object.keys(PATHS) as PathId[];

/** The warrior's families (W-86; the war skills' four, src/war/sim/skills.ts) and his first men in each (W-95). */
export const FAMILIES: Record<Family, { name: string; does: string; startText: string; start: readonly string[] }> = {
  line: { name: 'Phalanx', does: 'Spears and big shields. They hold the line.', startText: '3 hoplites, 3 militia', start: ['hoplite', 'hoplite', 'hoplite', 'militia', 'militia', 'militia'] },
  shock: { name: 'Celtic warband', does: 'Long swords, little armour. They hit hard.', startText: '6 swordsmen', start: ['celt_sword', 'celt_sword', 'celt_sword', 'celt_sword', 'celt_sword', 'celt_sword'] },
  missile: { name: 'Skirmishers', does: 'Bows, slings and javelins. Weak up close.', startText: '2 archers, 2 slingers, 2 javelins', start: ['archer', 'archer', 'slinger', 'slinger', 'javelineer', 'javelineer'] },
  rider: { name: 'Riders', does: 'Fast horsemen. They strike and ride away.', startText: '4 horsemen, 2 horse archers', start: ['thessalian', 'thessalian', 'thessalian', 'thessalian', 'horse_archer', 'horse_archer'] },
};
export const FAMILY_IDS = Object.keys(FAMILIES) as Family[];

/** Where an alliance's new players may make their home: its home region and its four entry regions. */
export function homeChoices(alliance: AllianceId): WorldRegion[] {
  return WORLD_REGIONS.filter((r) => r.alliance === alliance && (r.role === 'home' || r.role === 'entry'));
}

/** What the home rule reads of a region: who holds it and how many of the alliance's men stand there. */
export interface HomeState extends HeldRegion { live: number[] }

/**
 * null: `id` is a free home for a new player of `alliance` (one of its home choices, fresh men may come in, and the
 * alliance's quota there has room for a whole army); else why not.
 */
export function homeRefusal(id: string, alliance: AllianceId, st: HomeState | null, quota: number): string | null {
  const r = homeChoices(alliance).find((x) => x.id === id);
  if (!r) return `${id} is not a home of ${ALLIANCES[alliance].name}`;
  const why = joinRefusal(id, alliance, st);
  if (why) return why;
  if ((st?.live[alliance] ?? 0) + ARMY_MAX > quota) return `${r.name} is full: ${ALLIANCES[alliance].name}'s ${quota} men already stand there`;
  return null;
}

/** null: a legal choice (a warrior with one family, a builder or trader with none); else why not. */
export function pathRefusal(path: string, family?: string | null): string | null {
  if (!(PATH_IDS as string[]).includes(path)) return `${path} is not a path`;
  if (path !== 'warrior') return family ? `A ${PATHS[path as PathId].name.toLowerCase()} has no family` : null;
  if (!family) return 'A warrior chooses a family';
  return (FAMILY_IDS as string[]).includes(family) ? null : `${family} is not a family`;
}

/** A legal choice's first men, in slot order. */
export function pathStart(path: PathId, family?: Family | null): readonly string[] {
  return path === 'warrior' ? FAMILIES[family!].start : PATHS[path].start;
}
