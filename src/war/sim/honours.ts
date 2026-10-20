/**
 * Battle honours (docs/WAR.md "Record": <= 3 per man, +2% to one stat, mostly a name). Awarded when a fight ends
 * (WarRoom, from the sim's endFight report), at most one per man per fight, the first that fits:
 *
 *  - Took the fort at <region> (dmg): his team raided or brought down a foe's holding building (fort, camp) in the
 *    fight, and he came out of it alive (fit or wounded).
 *  - Held <region> (block): a chokepoint region his team holds (most claim points), his team won and he stood fit
 *    against at least SQUAD_MAX / 2 foes.
 *  - Veteran of <region> (hp): his team won and he stood fit against at least SQUAD_MAX foes.
 *
 * Won: his team lost a smaller share of its men in the fight (wounded, captive, dead) than its foes did. Counts are of
 * persons in the report (soldiers who took part); mobs and class spawns are not in it. The write-back (applyFight)
 * keeps HONOURS_MAX and never gives the same name twice.
 */
import type { FightReport, HonourStat } from '../types';
import { SQUAD_MAX } from './soldiers';

export const HONOURS_MAX = 3;

export interface Honour { name: string; stat: HonourStat }

export interface HonourContext {
  /** The region's name as men remember it. */
  region: string;
  /** The region is a chokepoint (src/war/world/season.ts CHOKEPOINTS). */
  chokepoint: boolean;
  /** The team holding the region (most claim points), or null. */
  holder: number | null;
  /** Teams that raided or brought down a foe's holding building during the fight. */
  stormed: ReadonlySet<number>;
}

/** Honours won in the fight, by person id. */
export function honoursOf(r: FightReport, ctx: HonourContext): Map<string, Honour> {
  const took = new Map<number, number>(), fell = new Map<number, number>();
  for (const x of r.persons) {
    took.set(x.team, (took.get(x.team) ?? 0) + 1);
    if (x.state !== 'fit') fell.set(x.team, (fell.get(x.team) ?? 0) + 1);
  }
  const foes = (team: number) => [...took].reduce((a, [t, n]) => a + (t === team ? 0 : n), 0);
  const foeFell = (team: number) => [...fell].reduce((a, [t, n]) => a + (t === team ? 0 : n), 0);
  const won = (team: number) => {
    const f = foes(team);
    return f > 0 && (fell.get(team) ?? 0) / took.get(team)! < foeFell(team) / f;
  };
  const out = new Map<string, Honour>();
  for (const x of r.persons) {
    if (x.state === 'dead' || x.state === 'captive') continue;
    const fit = x.state === 'fit';
    if (ctx.stormed.has(x.team)) out.set(x.pid, { name: `Took the fort at ${ctx.region}`, stat: 'dmg' });
    else if (fit && ctx.chokepoint && ctx.holder === x.team && won(x.team) && foes(x.team) >= SQUAD_MAX / 2) out.set(x.pid, { name: `Held ${ctx.region}`, stat: 'block' });
    else if (fit && won(x.team) && foes(x.team) >= SQUAD_MAX) out.set(x.pid, { name: `Veteran of ${ctx.region}`, stat: 'hp' });
  }
  return out;
}
