/** Civilian scenarios: the household at work, and fleeing a raid (the village, with a guard, is in ./index.ts). */
import type { Order } from '../types';
import type { Scenario } from './types';
import { at, HOME, NODE, you } from './kit';

/** A claimed camp at HOME (building 0) with a forge (1) and a cookhouse (2), raised by the militia (squad 0). */
const homestead: NonNullable<Scenario['economy']> = {
  claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }],
  stock: { wood: 300, stone: 100, food: 150, copper: 12, tin: 12, salt: 6, charcoal: 6 },
  sites: [
    { squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 },
    { squad: 0, type: 'forge', x: 336.5, y: 334.5 },
    { squad: 0, type: 'cookhouse', x: 344.5, y: 332.5 },
  ],
  prebuild: 10000,
};
/** Civilian squads 1..4 (cook, smith, forager, engineer) and their work. */
const household = [you('civ_cook', at(HOME, -4, 6), 2), you('civ_smith', at(HOME, 0, 6), 2), you('civ_forager', at(HOME, 4, 6), 3), you('civ_engineer', at(HOME, 0, 9), 2)];
const work: Order[] = [
  { kind: 'civWork', squad: 1, building: 2 },
  { kind: 'civWork', squad: 2, building: 1 },
  { kind: 'gather', squad: 3, node: NODE.wood },
  { kind: 'placeBuilding', squad: 4, type: 'storehouse', x: HOME[0] - 5.5, y: HOME[1] + 0.5 },
];

export const CIVILIAN_SCENARIOS: Scenario[] = [
  {
    id: 'civ-household',
    name: 'Household at work',
    group: 'civilians',
    goal: 'A camp with a forge and a cookhouse. The cooks cook, the smiths work the forge, the foragers fell wood, the engineers raise a storehouse. Nobody bothers them.',
    check: ['Each civilian walks to his workplace and works (activity on the card)', 'The cookhouse feeds squads (fed buff); the forge queue moves', 'Civilians take only work orders; the roster lists them as the household'],
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0] - 1, y: HOME[1] - 1, zoom: 1 },
    economy: homestead,
    after: { orders: [{ kind: 'move', squad: 0, x: HOME[0] - 2, y: HOME[1] + 10 }], settle: 50, squads: household, then: work },
  },
  {
    id: 'civ-flee',
    name: 'Civilians flee a raid',
    group: 'civilians',
    goal: 'The household is at work when bandits come out of the woods to the south; no guard this time. Watch them run, then send the militia.',
    check: ['Civilians drop their work and run from foes near them', 'They calm down and go back to work once the foes are gone', 'The militia (squad 0) can drive the bandits off'],
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0], y: HOME[1] + 6, zoom: 1 / 2 },
    economy: homestead,
    after: {
      orders: [{ kind: 'move', squad: 0, x: HOME[0] - 14, y: HOME[1] - 14 }],
      settle: 50,
      squads: [...household, { team: 1, cls: 'mob_bandit', count: 8, x: HOME[0] + 6, y: HOME[1] + 40, bot: { kind: 'attackMove', x: HOME[0], y: HOME[1] + 4 } }],
      then: work,
    },
  },
];
