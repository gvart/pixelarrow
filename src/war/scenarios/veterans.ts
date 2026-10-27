/**
 * E3 veterans (M5g `veterans`, docs/WAR.md "Record"): a max squad of named veterans (deeds, scars, kills, battles) against
 * a fresh squad in the agora of Dodona, the home of team 0, beside its memorial: the town's first statue, the graves of
 * the men who fell before standing in rows before it, the Erymanthian Boar's tusks by the second statue.
 */
import type { Scenario } from './types';
import { attackMove, bot, you } from './kit';

/** Dodona's agora: the memorial statue (its first), the second statue, open ground east of the stoa for the fight. */
const MEMORIAL = [307.5, 331.5] as const, FIGHT = [318, 336] as const;

export const VETERAN_SCENARIOS: Scenario[] = [
  {
    id: 'veterans',
    name: 'Veterans and the memorial',
    group: 'combat',
    goal: 'Twelve level-8 veterans (deeds, scars) against twelve fresh hoplites in the agora of Dodona, by the memorial of the men who fell before.',
    check: [
      'Roster (R), a veteran\'s card: kills, battles, scars, his Deeds (icon chips, each with its card)',
      'Selected veterans: rank pips under them, a red slash per scar',
      'After the fight: first blood and survivor deeds on the new men\'s cards; a wounded man gets a scar',
      'The killed stay dead: a new grave stands before the memorial statue; his kit lies as a pile named for him (yours 10 min)',
      'Click the memorial statue: the list of the fallen, each with his deeds and where he fell; the trophies',
      'The Erymanthian Boar\'s tusks stand on a post by the second statue',
    ],
    region: 'dodona',
    seed: 3,
    history: {
      fallen: [
        { cls: 'hoplite', level: 7, kills: 23, battles: 14, deeds: ['firstBlood', 'manSlayer', 'heldGate', 'slayer:erymanthian_boar'], region: 'Erymanthos Wood' },
        { cls: 'archer', level: 5, kills: 11, battles: 8, deeds: ['firstBlood', 'manSlayer'], region: 'Kleisoura Pass' },
        { cls: 'hoplite', level: 4, kills: 6, battles: 6, deeds: ['firstBlood', 'survivor'], region: 'Dodona' },
        { cls: 'celt_sword', level: 3, kills: 4, battles: 3, deeds: ['firstBlood'], region: 'Erymanthos Wood' },
        { cls: 'slinger', level: 2, kills: 0, battles: 2, deeds: ['lastStanding'], region: 'the Moors' },
        { cls: 'militia', level: 1, kills: 1, battles: 1, deeds: ['firstBlood'], region: 'Dodona' },
        { cls: 'javelineer', level: 3, kills: 2, battles: 4, deeds: [], region: 'Kleisoura Pass' },
      ],
      trophies: ['erymanthian_boar'],
    },
    squads: [
      { ...you('hoplite', [FIGHT[0] - 3, FIGHT[1] - 6], 12, attackMove([FIGHT[0], FIGHT[1] + 2])), veteran: { level: 8, tier: 2, deeds: ['firstBlood', 'heldGate', 'manSlayer', 'survivor'], scars: 2 } },
      bot('hoplite', [FIGHT[0] + 4, FIGHT[1] + 8], { kind: 'attackMove', x: FIGHT[0] - 3, y: FIGHT[1] - 6 }, 12),
    ],
    camera: { x: MEMORIAL[0] + 5, y: MEMORIAL[1] + 4, zoom: 1 },
  },
];
