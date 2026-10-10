/**
 * Campaign arc balance (headless): the rows of design/gdd/campaign-arc.md
 * "Balance targets" (the 8-man starter vs an even band, lair assaults, the
 * host). `npm run balance` prints them; AR-01 and the arc stories fill them
 * in. Until then there are no rows and the report is unchanged.
 */
import type { BalanceRow } from './balance';

/** `n` = seeds per row. */
export function arcRows(_n: number): BalanceRow[] {
  return [];
}
