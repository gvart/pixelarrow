/**
 * Economy scenarios: one kind of work each (the market, crafting, loot and the ambushed caravan are in ./index.ts).
 * Building ids follow the sites' order; cart ids start at 0.
 */
import type { ResourceKind } from '../types';
import type { Scenario } from './types';
import { at, HOME, NODE, TOWN_A, TOWN_B, you } from './kit';

/** A claimed camp at HOME standing (building 0), the militia that raised it squad 0. */
const camp = (stock: Partial<Record<ResourceKind, number>> = {}): NonNullable<Scenario['economy']> => ({
  claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }],
  stock,
  sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }],
  prebuild: 3000,
});
/** The two towns of the east road (the clip caravan's): a camp and a storehouse each (buildings 0..3). */
const towns: NonNullable<Scenario['economy']> = {
  claims: [{ team: 0, x: TOWN_A[0], y: TOWN_A[1], r: 20 }, { team: 0, x: TOWN_B[0], y: TOWN_B[1], r: 10 }],
  stock: { food: 80, wood: 400, stone: 100, hides: 20, oil: 20, bronze: 10 },
  sites: [
    { squad: 0, type: 'camp', x: TOWN_A[0], y: TOWN_A[1] },
    { squad: 0, type: 'storehouse', x: TOWN_A[0] - 6.5, y: TOWN_A[1] + 1.5 },
    { squad: 0, type: 'camp', x: TOWN_B[0], y: TOWN_B[1] },
    { squad: 0, type: 'storehouse', x: TOWN_B[0] + 4.5, y: TOWN_B[1] + 0.5 },
  ],
  prebuild: 5000,
};

export const ECONOMY_SCENARIOS: Scenario[] = [
  {
    id: 'eco-wood',
    name: 'Gather wood',
    group: 'economy',
    goal: 'A camp stands in the clearing; the militia fell the pine beside it and carry the wood home.',
    check: ['Men walk to the tree, chop, carry loads to the camp', 'Wood in the stock (top band) rises', 'The tree runs out and they move to the next one'],
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0] - 2, y: HOME[1] - 4, zoom: 1 },
    economy: camp(),
    after: { orders: [], squads: [], then: [{ kind: 'gather', squad: 0, node: NODE.wood }] },
  },
  {
    id: 'eco-stone',
    name: 'Gather stone',
    group: 'economy',
    goal: 'The militia quarry the stone outcrop north of the camp; the long walk home shows why stores go near the work.',
    check: ['Men quarry stone and carry it to the camp', 'Stone in the stock rises (slower than wood)', 'B: a storehouse by the outcrop shortens the haul'],
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0] + 3, y: HOME[1] - 12, zoom: 1 / 2 },
    economy: camp({ wood: 120 }),
    after: { orders: [], squads: [], then: [{ kind: 'gather', squad: 0, node: NODE.stone }] },
  },
  {
    id: 'eco-ore',
    name: 'Gather ore',
    group: 'economy',
    goal: 'On the Krios glacier the militia mine the iron by the old workings and carry it to a camp beside them.',
    check: ['The iron nodes show in the Resources view (F7)', 'Men mine and carry iron to the camp', 'Iron in the stock rises'],
    region: 'krios',
    squads: [you('militia', [178, 362])],
    camera: { x: 177, y: 356, zoom: 1 },
    economy: { claims: [{ team: 0, x: 176, y: 360, r: 16 }], stock: { wood: 100 }, sites: [{ squad: 0, type: 'camp', x: 176.5, y: 361.5 }], prebuild: 3000 },
    after: { orders: [], squads: [], then: [{ kind: 'gather', squad: 0, node: 1230 }] },
  },
  {
    id: 'eco-hunt',
    name: 'Hunting',
    group: 'economy',
    goal: 'Archers below the ibex herd of the Kimmerian hills (lair squad 3) loose on it; the herd bolts, the fallen beasts leave hides.',
    check: ['The herd runs from the first arrows', 'Fallen beasts leave hides (a pile or the men\'s packs)', 'The hunters chase only as far as you send them'],
    region: 'kimmeria',
    neutral: true,
    squads: [you('archer', [454, 92]), you('militia', [450, 98], 6)],
    camera: { x: 454, y: 86, zoom: 1 },
    after: { orders: [], settle: 10, squads: [], then: [{ kind: 'attack', squad: 6, target: 3 }] },
  },
  {
    id: 'eco-farm',
    name: 'Farming and food',
    group: 'economy',
    goal: 'A camp and a farm stand; foragers pick the berries west of the camp. Send the militia to work the farm (right-click it).',
    check: ['The done farm is a food node (right-click with a squad)', 'Berries and the farm both feed the food stock', 'The farm regrows; the berries run out'],
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0] - 6, y: HOME[1] + 2, zoom: 1 / 2 },
    economy: { ...camp({ wood: 200, food: 20 }), sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }, { squad: 0, type: 'farm', x: HOME[0] - 8, y: HOME[1] + 8, phase: 1 }], prebuild: 5000 },
    after: { orders: [], squads: [you('civ_forager', at(HOME, -10, 2), 3)], then: [{ kind: 'gather', squad: 1, node: NODE.food }] },
  },
  {
    id: 'eco-stores',
    name: 'Store network',
    group: 'economy',
    goal: 'Two towns down the east road, a camp and a storehouse each. Gatherers deliver to the nearest store of theirs; goods are spent from the network the site is in.',
    check: ['Loads go to the nearest store, not always the camp', 'Click a store: its goods and its network', 'A site in the second town draws only on the goods there'],
    squads: [you('militia', at(TOWN_A, -2, -6))],
    camera: { x: (TOWN_A[0] + TOWN_B[0]) / 2, y: (TOWN_A[1] + TOWN_B[1]) / 2, zoom: 1 / 2 },
    economy: towns,
  },
  {
    id: 'eco-handcart',
    name: 'Handcart crew',
    group: 'economy',
    goal: 'A crew of three takes up the handcart by the first camp and loads it there; then pull it to the second town and unload into its store.',
    check: ['The crew takes the shafts and the cart follows', 'Load from the camp (E on the cart or the camp)', 'Pull it down the road; unload at the post\'s storehouse', 'A lone puller steers to his slot (no zig-zag)'],
    squads: [you('militia', at(TOWN_A, -2, -6))],
    camera: { x: TOWN_A[0] + 8, y: TOWN_A[1] + 8, zoom: 1 },
    economy: towns,
    carts: [{ team: 0, owner: 'you', type: 'handcart', x: 397, y: 200.5 }],
    after: {
      orders: [{ kind: 'move', squad: 0, x: TOWN_A[0] - 3, y: TOWN_A[1] - 8 }],
      squads: [you('militia', [394, 200], 3)],
      then: [{ kind: 'crew', squad: 1, siege: 0 }, { kind: 'load', squad: 1, from: { building: 0 } }],
    },
  },
  {
    id: 'eco-trade',
    name: 'Trade caravan between towns',
    group: 'economy',
    goal: 'A loaded wagon leaves the first town for the trading post down the road, an escort with it. Unload at the post.',
    check: ['The wagon is loaded at the camp before it leaves', 'The escort keeps round the wagon on the road', 'At the post: unload into its store; the goods show there'],
    squads: [you('militia', at(TOWN_A, -2, -6))],
    camera: { x: TOWN_A[0] + 12, y: TOWN_A[1] + 12, zoom: 1 / 2 },
    economy: towns,
    carts: [{ team: 0, owner: 'you', type: 'wagon', x: 397, y: 200.5 }],
    after: {
      orders: [{ kind: 'move', squad: 0, x: TOWN_A[0] - 3, y: TOWN_A[1] - 8 }],
      squads: [you('militia', [394, 200], 3), you('hoplite', [391, 199], 8)],
      then: [{ kind: 'crew', squad: 1, siege: 0 }, { kind: 'load', squad: 1, from: { building: 0 } }],
      later: { settle: 200, orders: [{ kind: 'move', squad: 1, x: TOWN_B[0] - 2, y: TOWN_B[1] + 5 }, { kind: 'escort', squad: 2, cart: 0 }] },
    },
  },
];
