/**
 * E3 veterans: deeds and scars (docs/WAR.md "Record"). Unlike battle honours (./honours.ts, +2% to a stat) a deed is
 * only a name on his record, his roster card and, when he falls, his grave on the home memorial; scars are cosmetic.
 * The sim gives them when a fight is reported (index.ts resultsOf), each at most once per man:
 *
 *  - First blood: his first kill.
 *  - Man-slayer: his tenth kill.
 *  - <boss deed> (Boar-slayer, Bane of Drakon...): he struck a guardian that was slain in the fight.
 *  - Held the gate: he stood fit through a fight with foes in it, within DEED.gate tiles of his team's fort or camp.
 *  - Last man standing: the only one of his team in the fight (at least DEED.last of them) to walk off fit.
 *  - Survivor: he fell wounded and lived (a scar too, up to SCARS_MAX).
 */
import { bossDeed } from '../../data/warBosses';
import type { Deed } from '../types';

export const DEEDS_MAX = 8;
export const SCARS_MAX = 3;
/** Held the gate: tiles from the fort or camp; Last man standing: men of his team in the fight. Man-slayer: kills. */
export const DEED = { gate: 8, last: 4, slayer: 10 };

export const DEED_NAME = {
  firstBlood: 'First blood',
  manSlayer: 'Man-slayer',
  heldGate: 'Held the gate',
  lastStanding: 'Last man standing',
  survivor: 'Survivor',
} as const;
export type PlainDeed = keyof typeof DEED_NAME;

export const plainDeed = (id: PlainDeed): Deed => ({ id, name: DEED_NAME[id] });
export const slayerDeed = (boss: string): Deed => ({ id: `slayer:${boss}`, name: bossDeed(boss) });

/** The deeds of `had` not yet in `have`, in order (none twice), and the record with them (at most DEEDS_MAX). */
export function addDeeds(have: readonly Deed[] | undefined, had: readonly Deed[]): { all: Deed[]; fresh: Deed[] } {
  const all = [...(have ?? [])], fresh: Deed[] = [];
  for (const d of had) {
    if (all.length >= DEEDS_MAX || all.some((x) => x.id === d.id)) continue;
    all.push(d);
    fresh.push(d);
  }
  return { all, fresh };
}
