/**
 * Mobs at true size beside the men (view only): a draw scale over the manifest's, from each sheet's idle box
 * (scripts/art/pixellab/mobs/sizes.mjs; a man's box 64 px ~ 1.8 m) against the beast's real shoulder height and length
 * seen from above: a wolf to a man's hip, a bear and a lion as tall as his chest and twice as long. The beast guardians
 * stand 2.5x a man and 2.5x their kind at least; the man-sized ones (the King, the queens) keep a man's size.
 */
export const VIEW_SCALE: Readonly<Record<string, number>> = {
  mob_wolf: 1.5, mob_jackal: 1.15, mob_boar: 1.6, mob_bear: 1.6, mob_lion: 1.75, mob_ibex: 1.45,
  mob_serpent: 1.2, mob_scorpion: 1.15, mob_harpy: 1.3, mob_drake: 1.2,
  mob_moor_bear: 1.15, mob_savanna_lion: 1.35, mob_erymanthian_boar: 1.3, mob_griffin: 1.16, mob_minotaur: 1.08, mob_chimera: 1.38,
};
