/**
 * Doctrine balance (headless): the rows of design/gdd/ai-doctrines.md
 * "Balance targets" (the reference army vs each doctrine, battle length,
 * counter scripts, first contact, the ridge, captains). `npm run balance`
 * prints them; AI-01 fills them in. Until then there are no rows and the
 * report is unchanged.
 */
import type { BalanceRow } from './balance';

/** `n` = seeds per row (the GDD asks for 400 at the default run). */
export function doctrineRows(_n: number): BalanceRow[] {
  return [];
}
