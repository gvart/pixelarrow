/**
 * Campaign arc knobs (design/gdd/campaign-arc.md "Tuning Knobs"): lair
 * garrisons, their regrowth and the assault battlefield (R2, F1, F3).
 * Offline campaign only: duels, the ladder and war never read this file.
 */

/**
 * A lair's garrison (R2.1, F1, F3): `base + round(danger x danger)` men at
 * level `level + round(danger x levelDanger + days x levelDays)`, gear at the
 * world's lair tier. A beaten garrison regrows one man every `regrowH` hours.
 * `plate` (EC-05): a garrison fights its walls and its doctrine better than
 * its men's heroPower says (at 1.0x on open ground the attacker won 20%), so
 * its power plate is the men's power x plate; an army at 1.0x of the plate
 * takes the lair 38-48% of the time (R2).
 */
export const GARRISON = { base: 10, danger: 6, level: 2, levelDanger: 3, levelDays: 0.04, regrowH: 24, plate: 1.15 };

/** Lairs on a map, all of which must fall before the host musters (R5). */
export const ARC_LAIRS = 6;

/**
 * The assault battlefield (R2.3): a palisade across the defender's deployment
 * front with `gates` gaps of `gateW` cells, and `rampartRows` rows of rampart
 * behind it. The palisade stands far enough back that a garrison's stakes go
 * WORKS_OUT paces in front of its gates and still inside its deployment zone.
 */
export const ASSAULT = { gates: 2, gateW: 3, rampartRows: 1 };

/**
 * The Tyrant's host (R5, F2, Tuning Knobs HOST_MULT / HOST_SPEED). When the
 * last lair falls it musters `min(cap, ceil(mult x R))` men, R the fit roster
 * then (at least 1), at a level of `level[0]..level[1]` (seeded), gear tier
 * `tier`, its men `leanShare` of the host's leaning culture and the rest the
 * other (Greek-leaning when the campaign's legendary set is Achilles', else
 * Phoenician), fighting `hammer`. Its captain, the Tyrant, is level
 * `tyrantLevel` with a legendary weapon. It marches `speed` x a band's pace
 * from the town farthest from the start (at least `minDist` tiles away when
 * it can) toward the starting town, and never leaves the field.
 * Tuned by AR-04 (docs/v5/balance/AR-04.md) to the GDD's 40-55% for a
 * prepared army: `mult` 1.0 (the GDD's 1.25 measured 3%; its range is
 * 1.0-1.5) and levels 7-9 (the GDD's 8-10 measured 31-35% at 1.0).
 */
export const HOST = { mult: 1.0, cap: 32, level: [7, 9] as [number, number], tier: 3, leanShare: 2 / 3, tyrantLevel: 10, speed: 1.2, minDist: 30 };

/** A sacked starting town keeps its recruits and market shut this many days (R5.3). */
export const SACK_DAYS = 5;

/**
 * The post-game (R5.4): danger rises by `danger` (capped at 1); `reborn`
 * fallen lairs, picked per world, rise again `rebornDays` after the host
 * falls and `rebornDays` after each time they are razed (the cooldown).
 */
export const POST_GAME = { danger: 0.2, reborn: 2, rebornDays: 10 };
