/** Combat scenarios, each one kind of fight (the classic ones, pass-ambush to brawl-600, are in ./index.ts). */
import type { Scenario } from './types';
import { at, attackMove, bot, FIELD, hold, S, you } from './kit';

const F = FIELD;

export const COMBAT_SCENARIOS: Scenario[] = [
  {
    id: 'combat-lines',
    name: 'Melee: line vs line',
    group: 'combat',
    goal: 'Three hoplite squads of yours against three of theirs on open grass; theirs advance. Meet them in line.',
    check: ['Front ranks lock; rear ranks wait their turn', 'Shields block (hoplites lose men slowly)', 'Score panel: alive / wounded / killed per team'],
    squads: [
      ...[0, 1, 2].map((i) => you('hoplite', at(F, -8 + i * 8, 8))),
      ...[0, 1, 2].map((i) => bot('hoplite', at(F, -8 + i * 8, -14), { kind: 'attackMove', x: F[0] - 8 + i * 8, y: F[1] + 8 })),
    ],
    camera: { x: F[0], y: F[1], zoom: 1 / 2 },
  },
  {
    id: 'combat-high-ground',
    name: 'Archers on high ground',
    group: 'combat',
    goal: 'Your archers hold the ridge crest; enemy archers shoot back from the foot of the slope. Compare the losses.',
    check: ['Your archers outrange and outhit theirs from above', 'Their arrows fall short or miss more uphill', 'Altitude view (F3) shows the height gap'],
    squads: [
      you('archer', at(S.ridgeCrest, -4, 2)), you('archer', at(S.ridgeCrest, 4, 2)),
      bot('archer', at(S.ridgeFoot, -4, 4), hold(at(S.ridgeFoot, -4, 4), 4)), bot('archer', at(S.ridgeFoot, 4, 4), hold(at(S.ridgeFoot, 4, 4), 4)),
    ],
    camera: { x: (S.ridgeCrest[0] + S.ridgeFoot[0]) / 2, y: (S.ridgeCrest[1] + S.ridgeFoot[1]) / 2, zoom: 1 / 2 },
  },
  {
    id: 'combat-skirmish',
    name: 'Skirmishers',
    group: 'combat',
    goal: 'Your javelineers and slingers face a militia charge. Shoot, fall back, shoot again.',
    check: ['Javelins and sling stones land as the militia close', 'Pulled back in time, the skirmishers keep out of melee', 'Caught in melee, they lose fast'],
    squads: [
      you('javelineer', at(F, -6, 10)), you('slinger', at(F, 6, 10)),
      bot('militia', at(F, -4, -18), { kind: 'attackMove', x: F[0], y: F[1] + 12 }), bot('militia', at(F, 6, -20), { kind: 'attackMove', x: F[0], y: F[1] + 12 }),
    ],
    camera: { x: F[0], y: F[1], zoom: 1 / 2 },
  },
  {
    id: 'combat-flank',
    name: 'Flank',
    group: 'combat',
    goal: 'Their two squads hold a line facing south; your hoplites pin them from the front while your swordsmen wait off their east flank. Send the swordsmen in.',
    check: ['Men hit in the flank or rear take more and break sooner', 'The pinned line turns to face the flank', 'Compare the time to win with a frontal fight (combat-lines)'],
    squads: [
      you('hoplite', at(F, -4, 6), 12, attackMove(at(F, -4, -2))), you('hoplite', at(F, 4, 6), 12, attackMove(at(F, 4, -2))),
      you('celt_sword', at(F, 22, -6)),
      bot('hoplite', at(F, -4, -4), hold(at(F, -4, -4), 6)), bot('militia', at(F, 4, -4), hold(at(F, 4, -4), 6)),
    ],
    camera: { x: F[0] + 6, y: F[1], zoom: 1 / 2 },
  },
  {
    id: 'combat-wounded',
    name: 'The wounded and the dead',
    group: 'combat',
    goal: 'A short melee with a physician behind your line. The fallen lie wounded or dead; the physician saves some.',
    check: ['Fallen men show as wounded or dead (score panel: wnd and kill)', 'More of yours fall wounded with the physician near', 'Console: strike down, hurt and heal the selected men', 'Roster (R) lists the wounded'],
    squads: [
      you('hoplite', at(F, -4, 6)), you('militia', at(F, 4, 6)), you('civ_physician', at(F, 0, 14), 2),
      bot('celt_sword', at(F, -4, -14), { kind: 'attackMove', x: F[0] - 4, y: F[1] + 6 }), bot('celt_sword', at(F, 4, -14), { kind: 'attackMove', x: F[0] + 4, y: F[1] + 6 }),
    ],
    camera: { x: F[0], y: F[1], zoom: 1 / 2 },
  },
];
