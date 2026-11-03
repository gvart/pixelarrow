/**
 * A new player's start (docs/WAR.md "Starting a game"): one of the four alliances, then a free home region of that
 * alliance, then his path for the season (W-83), which gives his first men (W-95). Pure rules shared by the server
 * (server/src/war/start.ts, the one that decides) and the menu (src/war/menu, which shows the same).
 */
import { isCivClass, type ClassId } from '../../data/classes';
import { FAMILY_OF, type Family } from '../sim/skills';
import { joinRefusal, type HeldRegion } from './access';
import { ALLIANCES } from './alliances';
import { WORLD_REGIONS } from './regions';
import type { AllianceId, WorldRegion } from './types';

/** The classes the Tunnel of Shades raises (server/src/war/raise.ts): the first men of every path and family. */
export const START_CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer', 'thureophoros'] as const;
export type StartClass = (typeof START_CLASSES)[number];

export type PathId = 'warrior' | 'builder' | 'trader';

/**
 * What each path is and starts with (W-85, W-95): the one table to tune. `cap` is the soldiers he may grow to, `workers`
 * the civilians he may keep (W-103; not soldiers, outside `cap`), `carts` the carts he may have built (W-104); `start` is
 * his first men in slot order, soldiers first (a warrior's come from FAMILIES). The guards (hoplites) and the workers
 * (civilians) are defaults the owner has not fixed: docs/impl/paths-rework.md.
 */
export const PATHS: Record<PathId, { name: string; does: string; cap: number; workers: number; carts: number; startText: string; start: readonly string[]; /** W-145: the cart he starts with. */ startCart?: 'handcart' }> = {
  warrior: { name: 'Warrior', does: 'You fight. Beat beasts and rival armies, and take land for your alliance.', cap: 12, workers: 2, carts: 1, startText: '6 soldiers of one family', start: [] },
  builder: { name: 'Builder', does: 'You build. Raise the towns, walls and workshops your alliance needs.', cap: 4, workers: 6, carts: 1, startText: '2 guards, an engineer, a forager', start: ['hoplite', 'hoplite', 'civ_engineer', 'civ_forager'] },
  trader: { name: 'Trader', does: 'You trade. Gather goods, drive carts between towns and sell at a profit.', cap: 4, workers: 3, carts: 4, startText: '2 guards, a merchant, a forager, a handcart', start: ['hoplite', 'hoplite', 'civ_merchant', 'civ_forager'], startCart: 'handcart' },
};
export const PATH_IDS = Object.keys(PATHS) as PathId[];

/** Riders return with mounts. */
export type StartFamily = Exclude<Family, 'rider'>;
/**
 * The warrior's families (W-86; src/war/sim/skills.ts), his first men in each (W-95), and the demigod level each of the
 * family's stronger classes joins at (W-112; a class not listed: from the start). A family's men must clear bandit lairs
 * and have a way to chiefs: tests/war/familyFights.test.ts.
 */
export const FAMILIES: Record<StartFamily, { name: string; does: string; startText: string; start: readonly string[]; unlocks: Readonly<Partial<Record<ClassId, number>>> }> = {
  line: { name: 'Phalanx', does: 'Spears and big shields. They hold the line.', startText: '6 hoplites', start: ['hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite', 'hoplite'], unlocks: { royal_guard: 6, sacred_band: 9 } },
  shock: { name: 'Celtic warband', does: 'Long swords, little armour. They hit hard.', startText: '6 swordsmen', start: ['celt_sword', 'celt_sword', 'celt_sword', 'celt_sword', 'celt_sword', 'celt_sword'], unlocks: { falx: 4, gallic: 6, rhomphaia: 9 } },
  missile: { name: 'Skirmishers', does: 'Shields in front, javelins and bows behind.', startText: '5 shield-bearers, 2 javelins', start: ['thureophoros', 'thureophoros', 'thureophoros', 'thureophoros', 'thureophoros', 'javelineer', 'javelineer'], unlocks: { peltast: 4 } },
};
export const FAMILY_IDS = Object.keys(FAMILIES) as StartFamily[];

/** A player's choice as the limits read it (both null: no path, a dev player or the offline sandbox). */
/** `level`: his demigod level this season (W-84; none: 1). */
export interface PlayerPath { path: PathId | null; family: StartFamily | null; level?: number }
export const NO_PATH: PlayerPath = { path: null, family: null };

const most = (k: 'cap' | 'workers' | 'carts') => Math.max(...PATH_IDS.map((p) => PATHS[p][k]));
/** The limits of a path; with none (dev, the sandbox) the most any path has. */
export const soldierCap = (path: PathId | null): number => (path ? PATHS[path].cap : most('cap'));
export const workerCap = (path: PathId | null): number => (path ? PATHS[path].workers : most('workers'));
export const cartCap = (path: PathId | null): number => (path ? PATHS[path].carts : most('carts'));

/**
 * W-101: may this player hold a man of `cls` at all? A warrior only of his family (W-86: a real man does not change his
 * people) and at the level the class joins (W-112); a builder or trader any soldier but a rider (riders return with
 * mounts); every path a worker; no path, anyone.
 */
export function mayHold(p: PlayerPath, cls: string): boolean {
  if (!p.path || isCivClass(cls)) return true;
  const fam = FAMILY_OF[cls as ClassId];
  if (p.path !== 'warrior') return fam !== undefined && fam !== 'rider';
  return fam === p.family && (p.level ?? 1) >= unlockLevel(p.family, cls);
}

/** W-112: the demigod level a class of the family joins a warrior at. */
export const unlockLevel = (family: StartFamily | null, cls: string): number => (family && FAMILIES[family].unlocks[cls as ClassId]) || 1;

export type JoinRefusal = 'family' | 'locked' | 'full' | 'household';
/**
 * The one check every man joining a player passes (start, soul, Tunnel, captive, promotion, dev tools), given the
 * soldiers and workers he has now. Null: he may join. The server's inserts check the count again to close races.
 */
export function manRefusal(p: PlayerPath, cls: string, have: { soldiers: number; workers: number }): JoinRefusal | null {
  if (!mayHold(p, cls)) return p.path === 'warrior' && FAMILY_OF[cls as ClassId] === p.family ? 'locked' : 'family';
  if (isCivClass(cls)) return have.workers >= workerCap(p.path) ? 'household' : null;
  return have.soldiers >= soldierCap(p.path) ? 'full' : null;
}

/** The check over a list joining one by one, on top of `have` (a path's first men, a dev squad). */
export function menRefusal(p: PlayerPath, classes: readonly string[], have = { soldiers: 0, workers: 0 }): JoinRefusal | null {
  const n = { ...have };
  for (const cls of classes) {
    const why = manRefusal(p, cls, n);
    if (why) return why;
    if (isCivClass(cls)) n.workers++;
    else n.soldiers++;
  }
  return null;
}

/** W-102: who the Tunnel raises with none of his fallen to bring back: a militiaman, or for a warrior who may not hold one, his family's first. */
export function raiseClass(p: PlayerPath): string {
  return mayHold(p, 'militia') ? 'militia' : FAMILIES[p.family!].start[0];
}

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
  if ((st?.live[alliance] ?? 0) + soldierCap(null) > quota) return `${r.name} is full: ${ALLIANCES[alliance].name}'s ${quota} men already stand there`;
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
export function pathStart(path: PathId, family?: StartFamily | null): readonly string[] {
  return path === 'warrior' ? FAMILIES[family!].start : PATHS[path].start;
}
