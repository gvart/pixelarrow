/** Shared helpers and named points for the per-feature scenario files (test-ridge unless a file says otherwise). */
import type { Behaviour } from '../sim/bots';
import { SPOTS } from '../regions/test-ridge.spots';
import { SQUAD_MAX } from '../sim/soldiers';
import type { ScenarioGo, ScenarioSquad } from './types';

export type P = readonly [number, number];
export const S = SPOTS;
export const at = (p: P, dx = 0, dy = 0): [number, number] => [p[0] + dx, p[1] + dy];
/** A squad of yours (team 0 unless `team`), optionally with its first order. */
export const you = (cls: string, [x, y]: P, count = SQUAD_MAX, go?: ScenarioGo, team = 0): ScenarioSquad => ({ team, cls, count, x, y, ...(go ? { go } : {}) });
/** A bot squad of team 1 driven by a behaviour (../sim/bots.ts). */
export const bot = (cls: string, [x, y]: P, b: Behaviour, count = SQUAD_MAX, team = 1): ScenarioSquad => ({ team, cls, count, x, y, bot: b });
/** A team-1 squad that stands idle (no bot, no brain). */
export const idle = (cls: string, [x, y]: P, count = SQUAD_MAX, owner = 'foe'): ScenarioSquad => ({ team: 1, cls, count, x, y, owner });
export const move = ([x, y]: P): ScenarioGo => ({ kind: 'move', x, y });
export const attackMove = ([x, y]: P): ScenarioGo => ({ kind: 'attackMove', x, y });
export const hold = ([x, y]: P, radius = 10): Behaviour => ({ kind: 'hold', x, y, radius });

/** The flat clearing in the south-east woods (build-test's HOME): trees all round, a rock band at y 316 to the north. */
export const HOME = [342, 338] as const;
/** Resource nodes near HOME (test-ridge's object order, seed independent): a pine, a stone outcrop, berries. */
export const NODE = { wood: 3324, wood2: 3479, stone: 3107, stone2: 3068, food: 4016 } as const;
/** The open grass by the east road (the loot scenario's field, height 1). */
export const FIELD = [430, 236] as const;
/** The camp by the east road and the trading post down it (the clip caravan's). */
export const TOWN_A = [391.5, 189.5] as const, TOWN_B = [421.5, 214.5] as const;
/** The flat open stretch in the south-west (wall-defense's ring), 28 x 28 tiles of grass at height 1. */
export const FLAT = [127.5, 433] as const;

const CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer'];
/**
 * 25 own squads against 25 bot squads of SQUAD_MAX (12): 600 units in 5 x 5 blocks on either bank of the ford (fordW,
 * fordE), so the fight goes through it; the bots attack the nearest squad. Other regions pass their own block centres.
 */
export function brawlSquads(w: P = S.fordW, e: P = S.fordE): ScenarioSquad[] {
  const out: ScenarioSquad[] = [];
  for (let i = 0; i < 25; i++) {
    const dy = ((i % 5) - 2) * 8, dx = Math.floor(i / 5) * 7;
    out.push({ team: 0, cls: CLASSES[i % CLASSES.length], count: SQUAD_MAX, x: w[0] - 8 - dx, y: w[1] + dy, owner: 'you' });
    out.push({ team: 1, cls: CLASSES[(i + 2) % CLASSES.length], count: SQUAD_MAX, x: e[0] + 8 + dx, y: e[1] + dy, owner: 'bot' });
  }
  return out;
}
