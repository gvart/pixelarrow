/**
 * W-184..W-192 what an NPC town's board offers and at what numbers (the rules: src/war/net/townBoard.ts; docs/WAR.md "Town
 * boards"). Start numbers, one table to tune. Text is data: the goal stays short, its numbers live on the card's chips.
 */
import type { Land } from './warStories';
import type { MobKind } from '../war/types';

export const BOARD = {
  /** Most contracts and errands a player holds (W-189). */
  hold: 3,
  /** Hours a board's listing stands before it refills with other names, works and loads. */
  windowHours: 4,
  /** W-186: his own path's kind pays this much more coin. W-188: another path's kind pays this share of the level points. */
  onPath: 1.25,
  offPathPoints: 0.25,
  /** W-189: each hand-in of a kind at a town weighs `per` on the next; the pay falls to `floor`; the weight goes 63% in `recoverHours`, as W-141's stock. */
  repeat: { per: 0.3, floor: 0.2, recoverHours: 4 },
  /** W-185: a fight's size against his army (never under a starting family: W-193), its base pay. */
  kill: [
    { size: 'skirmish', share: 0.45, coin: 45, points: 15 },
    { size: 'even', share: 0.85, coin: 90, points: 32 },
    { size: 'hard', share: 1.35, coin: 160, points: 60 },
  ],
  /** W-194: hurt men standing at a town with no foe near get well: this share of their health a second (half a physician's). */
  rest: { perSec: 0.005, foeR: 20 },
  /** Most men in a band. */
  bandMost: 16,
  /** A rested board's hard fight is led by a named chief (he drops his loot) when the heat on Kill here is under this. */
  chiefHeat: 0.2,
  /** W-188: a board's work comes with its stone and wood, so a builder's labour on it earns this share of the level points of his own works. */
  labourFavour: 0.6,
  /** W-185: worker-seconds on site, base pay. */
  build: [
    { size: 'repair', labour: 1800, coin: 50, points: 8 },
    { size: 'raise', labour: 5400, coin: 150, points: 20 },
  ],
  /** W-185: hops to the named town (a road or two), loads carried, base pay. */
  trade: [
    { size: 'near', hops: 1, loads: 2, coin: 60, points: 120 },
    { size: 'far', hops: 2, loads: 5, coin: 170, points: 400 },
  ],
  /** W-190: a giver's errand: the smallest job of his own path's kind, these pays (level points as a story step). */
  errand: { coin: 30, points: 25 },
  /** Tiles from the town's spot a band is set down at, and from any other lair. */
  band: { near: 32, far: 68, apart: 26, tries: 48 },
  /** Tiles round the town's spot a work may stand. */
  siteReach: 40,
} as const;

/** W-193: how a band is told beside his army (his strength over its: at least this). */
export const RATING = { easy: 1.6, fair: 1, hard: 0.6 } as const;

/** What his men may be set to mend at a town, by the prebuilt it stands at: [a small job, a big one]. */
export const BUILD_WORK: Readonly<Record<string, readonly [string, string]>> = {
  well: ['Mend the town well', 'Raise a new well-house'],
  cottage: ['Patch the cottage roofs', 'Raise cottages for the newly woken'],
  house: ['Shore up the old house', 'Rebuild the burnt house'],
  stall: ['Mend the market stalls', 'Raise a covered market row'],
  board: ['Mend the notice board', 'Raise a roof over the board'],
  storehouse: ['Patch the storehouse', 'Raise a second storehouse floor'],
  warehouse: ['Patch the warehouse doors', 'Raise a warehouse wing'],
  stoa: ['Reset the stoa columns', 'Raise the fallen stoa bay'],
  statue: ['Reset the statue plinth', 'Raise the toppled statue'],
  temple: ['Clear the temple steps', 'Rebuild the temple porch'],
  shrine: ['Clear the shrine path', 'Rebuild the shrine wall'],
  farm: ['Mend the farm walls', 'Dig the farm a new ditch'],
};
/** A town with none of those: its own ground. */
export const BUILD_ANY: readonly [string, string] = ['Clear the town road', 'Raise a town palisade'];

/** A band's name: a word of its land, then its people. */
export const BAND_WORDS: Readonly<Record<Land | 'any', readonly string[]>> = {
  north: ['Cold Ford', 'Black Oak', 'Rime Hollow', 'Grey Tarn', 'Hull Rot', 'Lantern Bog'],
  steppe: ['Mound', 'White Cliff', 'Long Grass', 'Tin Road', 'Frost Pond', 'Barrow'],
  sand: ['Red Cliff', 'Thirst', 'Salt Bar', 'Dry Well', 'Wadi', 'Dune Walk'],
  south: ['Reed Fen', 'Sea Cave', 'Flood Channel', 'Vine Terrace', 'Drowned Step', 'Delta'],
  any: ['Lost Road', 'Broken Oath', 'Grey Mist', 'Last Muster', 'Old Grave', 'Faded Name'],
};
export const BAND_PEOPLE: Readonly<Record<MobKind, string>> = {
  wolf: 'wolves', boar: 'boars', bear: 'bears', bandit: 'robbers', jackal: 'jackals', ibex: 'ibex', lion: 'lions', serpent: 'serpents',
  scorpion: 'scorpions', harpy: 'harpies', cyclops: 'giants', drake: 'drakes',
};

/** W-190: a town giver with no chain here to speak for him. */
export const GIVER_ANY = 'The town reeve';
/** W-190: what a giver says of an errand, by the ground and the kind: one short line, no numbers. */
export const ERRAND_STORY: Readonly<Record<Land | 'any', Readonly<Record<'kill' | 'build' | 'trade', string>>>> = {
  north: { kill: 'Something took the night watch by the oak line. Nobody here sleeps until it is gone.', build: 'Frost split the stone again. Hands are short and the dead keep waking.', trade: 'The next town burns its last wood this week. They will remember who came.' },
  steppe: { kill: 'The herds will not graze near the mounds. Find out why, and end it.', build: 'The wind took what we raised last moon. Help us raise it lower.', trade: 'The road is long and the riders are few. Take this on, and do not stop for strangers.' },
  sand: { kill: 'The last water-carrier did not come back. The cliffs know why.', build: 'The sand walks over everything. Dig us out once more.', trade: 'They are dry down the road. A load that arrives is worth more than a prayer.' },
  south: { kill: 'The channels ran red at dawn. Something came up with the flood.', build: 'The water rose and took the footings. Set them again before it comes back.', trade: 'The boats no longer come. If it is to get there, it goes on a back.' },
  any: { kill: 'The mist gave us these. Send them back to it.', build: 'Nothing here stands unless someone stands by it.', trade: 'They will not last the season without this. Carry it, and be kept.' },
};
