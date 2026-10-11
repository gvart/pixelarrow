/**
 * English strings of the Results why-line (RD-03, design/gdd/battle-readability.md
 * R5; the rules are whyLine in src/game/report.ts). `why.lost.*` explain a
 * defeat, `why.won.*` are the victory mirrors. {g} is a group numeral, {t} a
 * battle time ("0:42"), {a} and {b} head counts. Spread into en.ts; ru.ts
 * spreads why.ru.ts (same keys, same {params}).
 */
export const WHY_EN = {
  'why.lost.captain': 'Our captain fell at {t}, and the line wavered.',
  'why.lost.standard': 'We lost the standard, and the line wavered.',
  'why.lost.flanked': 'Group {g} was flanked and broke.',
  'why.lost.flankedLine': 'Our line was flanked and broke.',
  'why.lost.outnumbered': 'Outnumbered {a} to {b} at the clash.',
  'why.lost.range': 'Our missiles were out of range most of the fight.',
  'why.lost.cascade': 'Group {g} broke, and the rout spread down the line.',
  'why.lost.cascadeLine': 'Our line broke, and the rout spread.',
  'why.lost.armyBreak': { one: 'Our army broke after {n} group routed.', other: 'Our army broke after {n} groups routed.' },
  'why.lost.armyFell': 'Our army broke as its men fell.',
  'why.lost.held': 'Their line held longer than ours.',
  'why.won.captain': 'We cut down their captain at {t}.',
  'why.won.standard': 'We felled their standard at {t}, and their line wavered.',
  'why.won.flanked': 'We broke their flank at {t}.',
  'why.won.focus': 'Our focused volleys broke their line at {t}.',
  'why.won.outnumbered': 'We outnumbered them {a} to {b} at the clash.',
  'why.won.cascade': 'Their rout spread down the line at {t}.',
  'why.won.armyBreak': { one: 'Their army broke after {n} group routed.', other: 'Their army broke after {n} groups routed.' },
  'why.won.armyFell': 'Their army broke as their men fell.',
  'why.won.held': 'Our line held longer than theirs.',
  'why.won.withdrew': 'They withdrew at {t}.',
  'why.withdrew': 'We withdrew at {t}.',
  'why.draw': 'Neither line gave way.',
  'why.bounty': "Captain's bounty: +{n} gold",
} as const;
