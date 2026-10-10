/**
 * Field works balance (headless): the rows of design/gdd/field-works.md
 * "Balance targets" (stakes on a threatened flank, riders into stakes, ditch,
 * laager, lair assaults). `npm run balance` prints them; the FW stories fill
 * them in. Until then there are no rows and the report is unchanged.
 */
import type { BalanceRow } from './balance';

/** `n` = seeds per row. */
export function worksRows(_n: number): BalanceRow[] {
  return [];
}
