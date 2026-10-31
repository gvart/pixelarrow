/** W-60: food made visible (hunger, eating from packs and stores) and claiming souls under the 12-man cap. */
import type { Scenario } from './types';
import { at, FIELD, HOME, you } from './kit';

export const SOUL_SCENARIOS: Scenario[] = [
  {
    id: 'food-hunger',
    name: 'Hunger',
    group: 'economy',
    goal: 'By the camp: hungry hoplites (its store holds food), slingers with rations in their packs. Out in the woods: starving archers with nothing to eat.',
    check: [
      'Roster (R): a grain-bundle icon by fed men, the amber hunger sign by the hungry, red by the starving; every icon has its card',
      'Soldier card: the satiety bar; its card lists the steps with icons (hungry −10% pace and attack, starving −25% and slow health loss, never below a quarter)',
      'The hoplites pack 8 rations each from the camp\'s store (2 food a ration; Chest I > Town store: the food goes down), eat and turn fed',
      'The slingers eat their rations first (a ration feeds twice a food); Chest > Squad: the Food row',
      'The archers march slower than the others; walk them next to the camp and they eat and recover',
      'Click the camp and a cookhouse in the build bar: each card says in one line what it does with food',
    ],
    squads: [you('hoplite', at(HOME, 3, 5), 6), you('slinger', at(HOME, -5, 4), 4), you('archer', at(HOME, 30, -14), 4)],
    camera: { x: HOME[0] + 6, y: HOME[1] - 2, zoom: 1 / 2 },
    economy: { claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }], sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }], prebuild: 3000 },
    after: {
      orders: [{ kind: 'move', squad: 0, x: HOME[0] + 3, y: HOME[1] + 4 }, { kind: 'move', squad: 1, x: HOME[0] - 4, y: HOME[1] + 5 }, { kind: 'move', squad: 2, x: HOME[0] + 30, y: HOME[1] - 14 }],
      settle: 400, squads: [],
    },
    food: [{ res: 'food', n: 120 }, { squad: 1, res: 'ration', n: 8 }],
    hunger: [{ squad: 0, sat: 30 }, { squad: 1, sat: 35 }, { squad: 2, sat: 8 }],
  },
  {
    id: 'limit-soul',
    name: 'Claim a soul',
    group: 'limits',
    goal: 'Eleven men of yours stand in the field; two souls wait near them: an archer who woke at a lair and a javelineer in a ruin. Claim one, then try the other.',
    check: [
      'Each soul stands as a pale, glowing ghost of his class; the minimap marks him',
      'Select the hoplites: the soul prompt names him (class, level, where he woke, the fade timer); hover it for his card',
      'Claim: the squad walks to him, stands 3 s and he joins it (a note; Roster: 12 / 12 men)',
      'The second soul: the button reads Army full 12/12; a claim is refused with a clear note and he waits on',
      'Strike a man down (console), then claim again: the place he left takes the soul',
      'A soul fades after 10 minutes unclaimed (console: skip)',
    ],
    squads: [you('hoplite', at(FIELD, 0, 0), 6), you('militia', at(FIELD, 0, 6), 5)],
    souls: [{ x: FIELD[0] + 12, y: FIELD[1] - 4, cls: 'archer', level: 3, site: 'lair' }, { x: FIELD[0] - 12, y: FIELD[1] + 4, cls: 'javelineer', level: 1, site: 'ruin' }],
    camera: { x: FIELD[0], y: FIELD[1], zoom: 1 },
  },
];
