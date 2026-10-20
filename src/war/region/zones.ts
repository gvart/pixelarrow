/**
 * M6d trade-town zones (docs/WAR.md "Trade towns", "Safe-zone rule"; src/war/sim/trade.ts), by region id, in tiles: the
 * walled market court (`safe`, its two gates on the north and south faces), the caravan yard outside each gate (`yard`,
 * not safe) and ambush spots over the route (`ambush`). Kept beside the generated region JSON (scripts/war/regions/**
 * writes those) and merged in by parseRegion when a region's JSON carries none of its own; a region script that later
 * writes these keys wins. Each court sits beside its town square (scripts/war/regions/kit.ts court() walls it), off the claim point.
 */
import type { SafeRect, TileRect } from '../types';

export interface TradeZones { safe: SafeRect[]; yard: TileRect[]; ambush: TileRect[] }

/** A 12 x 10 court at (x, y) with 2-wide gates mid north and mid south and an 8 x 5 yard outside each. */
const court = (x: number, y: number): Pick<TradeZones, 'safe' | 'yard'> => ({
  safe: [{ x, y, w: 12, h: 10, gates: [{ x: x + 5, y, w: 2, h: 1 }, { x: x + 5, y: y + 9, w: 2, h: 1 }] }],
  yard: [{ x: x + 2, y: y - 5, w: 8, h: 5 }, { x: x + 2, y: y + 10, w: 8, h: 5 }],
});

export const TRADE_ZONES: Record<string, TradeZones> = {
  kleisoura: { ...court(274, 207), ambush: [{ x: 162, y: 215, w: 12, h: 4 }, { x: 162, y: 238, w: 12, h: 4 }] },
  stymphalia: { ...court(312, 253), ambush: [{ x: 233, y: 104, w: 12, h: 5 }] },
  achelous: { ...court(255, 264), ambush: [{ x: 100, y: 42, w: 12, h: 5 }] },
  ammos: { ...court(276, 272), ambush: [{ x: 258, y: 139, w: 12, h: 5 }] },
};
