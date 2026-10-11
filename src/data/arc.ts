/**
 * Campaign arc knobs (design/gdd/campaign-arc.md "Tuning Knobs"): lair
 * garrisons, their regrowth and the assault battlefield (R2, F1, F3).
 * Offline campaign only: duels, the ladder and war never read this file.
 */

/**
 * A lair's garrison (R2.1, F1, F3): `base + round(danger x danger)` men at
 * level `level + round(danger x levelDanger + days x levelDays)`, gear at the
 * world's lair tier. A beaten garrison regrows one man every `regrowH` hours.
 */
export const GARRISON = { base: 10, danger: 6, level: 2, levelDanger: 3, levelDays: 0.04, regrowH: 24 };

/** Lairs on a map, all of which must fall before the host musters (R5). */
export const ARC_LAIRS = 6;

/**
 * The assault battlefield (R2.3): a palisade across the defender's deployment
 * front with `gates` gaps of `gateW` cells, and `rampartRows` rows of rampart
 * behind it. The palisade stands far enough back that a garrison's stakes go
 * WORKS_OUT paces in front of its gates and still inside its deployment zone.
 */
export const ASSAULT = { gates: 2, gateW: 3, rampartRows: 1 };
