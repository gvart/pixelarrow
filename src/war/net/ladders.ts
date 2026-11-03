/**
 * W-165..W-169: the season's three ladders, one a path, ranked by level points earned this season (W-111). Shared by the
 * server (server/src/war/ladders.ts) and the standings panel (src/war/world-view/main.ts).
 */
import type { PathId, StartFamily } from '../world/start';

/** Rows the panel gets a ladder, and the top places the roll of honour keeps (W-168). */
export const LADDER = { top: 20, honour: 3 } as const;

/** W-166: first place on each ladder is W-61's title. */
export const TITLE_OF: Record<PathId, { id: string; name: string }> = {
  warrior: { id: 'warlord', name: 'Ares-born' },
  builder: { id: 'masterBuilder', name: 'Master Builder' },
  trader: { id: 'merchantPrince', name: 'Merchant Prince' },
};

export interface LadderRow {
  place: number;
  pid: number;
  player: string;
  alliance: number;
  /** Level points this season. */
  points: number;
  level: number;
  /** W-167: a warrior's family, shown beside his name. */
  family?: StartFamily;
}
export type Ladders = Record<PathId, LadderRow[]>;

/** GET /api/war/ladders: the ladders and where the player stands (null: no path, no ladder). */
export interface LaddersView {
  ladders: Ladders;
  you: { path: PathId; place: number | null; points: number; level: number } | null;
}
