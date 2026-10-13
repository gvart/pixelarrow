/**
 * English strings of the battle readout (RD-01, design/gdd/battle-readability.md
 * R1-R3): the bars' one-letter labels, the card's "Flanked!" and the card's
 * long-press legend for the morale glyph and the bars. Spread into en.ts;
 * ru.ts spreads readout.ru.ts (same keys, same {params}).
 */
export const READOUT_EN = {
  'readout.bar.h': 'H',
  'readout.bar.m': 'M',
  'readout.flanked': 'Flanked!',
  'readout.tip.steady': 'Morale: steady (whole shield).',
  'readout.tip.wavering': 'Morale: wavering (cracked shield). A third of the men are shaken.',
  'readout.tip.routing': 'Morale: routing (falling flag). The group is fleeing.',
  'readout.tip.bars': 'Bars: {hp} health, {mor} morale.',
  'readout.tip.standard': 'Carries the Standard (banner).',
  // RD-02: field-event banners (battle-readability.md R4)
  'readout.armyBreak.ours': 'Our army breaks!',
  'readout.armyBreak.theirs': 'Their army breaks!',
  'readout.disordered.ours': '{group} is disordered!',
  'readout.disordered.theirs': 'Enemy {group} is disordered: strike now!',
  'readout.shaken': 'The rout shakes {groups}',
} as const;
