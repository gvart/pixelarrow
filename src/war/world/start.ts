/**
 * A new player's start (docs/WAR.md "Starting a game"): one of the four alliances, then a free home region of that
 * alliance, then a squad of up to ARMY_MAX men (his whole army) picked freely from the classes that have war sprites.
 * Pure rules shared by the server (server/src/war/start.ts, the one that decides) and the menu (src/war/menu, which
 * shows the same).
 */
import { ARMY_MAX } from '../sim/soldiers';
import { joinRefusal, type HeldRegion } from './access';
import { ALLIANCES } from './alliances';
import { WORLD_REGIONS } from './regions';
import type { AllianceId, WorldRegion } from './types';

/** The six classes with war sprite sheets (src/war/view/units.ts), in the order the squad picker shows them. */
export const START_CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer'] as const;
export type StartClass = (typeof START_CLASSES)[number];

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

/** null: `classes` is a legal start squad (1..ARMY_MAX men of START_CLASSES); else why not. */
export function squadRefusal(classes: readonly string[]): string | null {
  if (!classes.length) return 'pick at least one man';
  if (classes.length > ARMY_MAX) return `an army is at most ${ARMY_MAX} men`;
  const bad = classes.find((c) => !(START_CLASSES as readonly string[]).includes(c));
  return bad ? `${bad} cannot be picked at the start` : null;
}
