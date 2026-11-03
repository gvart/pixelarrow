/**
 * W-140..W-145 what the NPC towns deal in and at what numbers (the rules: src/war/net/npcMarket.ts; docs/WAR.md "NPC
 * towns"). The town of every world region buys and sells the goods of its role and what its own land yields. All start
 * numbers, one table to tune.
 */
import type { GoodKind } from '../war/types';
import type { RegionRole } from '../war/world/types';

/** Coin a unit before the town's distance and stock. Silver is not here: it is the mint's (docs/WAR.md "Coin"). */
export const NPC_BASE = {
  food: 2, wood: 2, stone: 2, flax: 3, charcoal: 3, herbs: 4, salt: 5, pitch: 5, hides: 5, oil: 6, linen: 7, copper: 8, leather: 8, iron: 10, marble: 10, tin: 12, bronze: 16,
} as const satisfies Partial<Record<GoodKind, number>>;
export type NpcGood = keyof typeof NPC_BASE;

/** The goods each kind of town deals in, on top of what its land yields. */
export const NPC_ROLE_GOODS: Record<RegionRole, readonly NpcGood[]> = {
  home: ['food', 'wood', 'stone', 'salt', 'hides', 'copper', 'tin', 'iron', 'marble', 'charcoal', 'leather', 'linen', 'oil', 'bronze'],
  entry: ['food', 'wood', 'stone', 'salt', 'hides', 'herbs', 'flax', 'copper', 'iron'],
  neutral: ['food', 'wood', 'stone', 'salt', 'hides', 'copper', 'tin', 'iron', 'pitch'],
  center: ['food', 'wood', 'stone', 'salt', 'hides', 'copper', 'tin', 'iron', 'marble', 'bronze', 'leather', 'linen', 'oil'],
};

export const NPC = {
  /** Tiles from the town's spot within which his men and carts deal with it. */
  reach: 14,
  /** W-141 a good's price by the hops to its nearest land that yields it: at + per x hops, hops up to `far`; a good no land yields: `made`. */
  distance: { at: 0.6, per: 0.5, far: 4, made: 1.4 },
  /** W-141 stock a town keeps of a good: `made` if its land does not yield it, else `land` x its land's points. */
  par: { made: 120, land: 150 },
  /** W-141 price by stock: 1 + slope x (1 - stock / par), within min..max; the town's edge either way; hours for stock to go 63% back to par. */
  price: { slope: 0.5, min: 0.5, max: 1.5, edge: 0.06, recoverHours: 12 },
  /** W-142 the purse: what it starts the season with; silver minted a UTC day, while under `cap` coin. */
  purse: { start: 400, mintSilver: 5, cap: 1000 },
} as const;

/** W-144 what a hired worker costs (W-103 is the cap); paid into the town's purse. */
export const NPC_HIRE: Readonly<Record<string, number>> = { civ_forager: 120, civ_cook: 150, civ_engineer: 200, civ_merchant: 200, civ_physician: 200, civ_smith: 200 };

/** W-145 what a cart costs at a town (his path's cap holds, W-104); paid into the town's purse. */
export const NPC_CARTS = { handcart: 180, wagon: 600 } as const;
export type NpcCart = keyof typeof NPC_CARTS;
