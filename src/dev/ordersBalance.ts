/**
 * Orders balance (headless): the rows of design/gdd/formations-orders.md
 * "Balance targets" (face, focus fire, the orb, feint, cohesion, army break).
 * `npm run balance` prints them; FO-01, FO-02 and FO-03 fill them in. Until
 * then there are no rows and the report is unchanged.
 */
import type { BalanceRow } from './balance';

/** `n` = seeds per row. */
export function ordersRows(_n: number): BalanceRow[] {
  return [];
}
