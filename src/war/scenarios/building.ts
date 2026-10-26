/**
 * Building scenarios: placing, the W-57 wall tools, stalled sites and sites with no workers (build-test and bridge-test
 * are in ./index.ts). Most stand on the flat open stretch of the south-west (FLAT), the rock line by the HOME clearing.
 */
import type { Scenario } from './types';
import { at, FLAT, HOME, you } from './kit';

/** A claimed camp of yours on FLAT standing (building 0), squad 0 the militia that raised it. */
const flatCamp = (wood = 600, more: NonNullable<Scenario['economy']>['sites'] = []): NonNullable<Scenario['economy']> => ({
  claims: [{ team: 0, x: FLAT[0], y: FLAT[1], r: 22 }],
  stock: { wood, stone: 400 },
  sites: [{ squad: 0, type: 'camp', x: 127, y: 436 }, ...more],
  prebuild: 4000,
});
const ENGINEER = { level: 10, nodes: ['carpenter', 'masterBuilder', 'rams', 'fortifier', 'artillerist', 'poliorcetes'] };

export const BUILDING_SCENARIOS: Scenario[] = [
  {
    id: 'build-each',
    name: 'Place every building',
    group: 'building',
    goal: 'A claimed camp with stock of everything, three militia squads and an engineer holding every design. Place each type from the build bar (B): every tab.',
    check: ['B: each tab (Build, Walls, Trade, Siege) lists its tools with costs', 'Green footprint where it fits; red with the reason (slope, rock, influence)', 'R rotates; Esc cancels', 'Console: Finish site builds the selected one at once'],
    squads: [you('militia', at(FLAT, -4, 2)), you('militia', at(FLAT, 4, 2)), you('militia', at(FLAT, 0, 6))],
    camera: { x: FLAT[0], y: FLAT[1], zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: FLAT[0], y: FLAT[1], r: 26 }],
      stock: { wood: 5000, stone: 5000, food: 500, copper: 50, tin: 50, bronze: 50, iron: 50, hides: 50, linen: 20, charcoal: 20, pitch: 40, coin: 500 },
      sites: [{ squad: 0, type: 'camp', x: 127, y: 436 }],
      prebuild: 3000,
    },
    after: { orders: [], squads: [{ ...you('civ_engineer', at(FLAT, 6, 6), 1), ...ENGINEER }] },
  },
  {
    id: 'build-wall-rock',
    name: 'Wall line across a rock',
    group: 'building',
    goal: 'The militia lay a palisade line north from the clearing straight across the rock band. The rock tiles are skipped, the rest is built.',
    check: ['Wall drag (B, Walls): pieces over the rock show red with "rock"', 'The valid pieces are laid and built; the gap stays', 'No piece longer than a segment'],
    squads: [you('militia', at(HOME, 6, -12))],
    camera: { x: 352, y: 318, zoom: 1 },
    economy: {
      claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }, { team: 0, x: 352, y: 317, r: 12 }],
      stock: { wood: 600 },
      sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }],
      prebuild: 3000,
    },
    after: { orders: [], squads: [], then: [{ kind: 'placeWall', squad: 0, material: 'wood', points: [352.5, 311.5, 352.5, 323.5] }] },
  },
  {
    id: 'build-wall-tower',
    name: 'Wall joining a tower',
    group: 'building',
    goal: 'A wood tower stands; the militia lay a palisade from the tower east. The line joins the tower instead of overlapping it.',
    check: ['The first piece starts right after the tower (no overlap)', 'Drag a second line ending on the tower: it joins too', 'Men on the wall-walk reach the tower platform'],
    squads: [you('militia', at(FLAT, 0, -2))],
    camera: { x: 125, y: 429, zoom: 1 },
    economy: flatCamp(600, [{ squad: 0, type: 'woodTower', x: 121, y: 428 }]),
    after: { orders: [], squads: [], then: [{ kind: 'placeWall', squad: 0, material: 'wood', points: [120.5, 427.5, 134.5, 427.5] }] },
  },
  {
    id: 'build-wall-gate',
    name: 'Gate on a wall',
    group: 'building',
    goal: 'A palisade line stands; a wood gate is dropped on it. The gate replaces that stretch of wall.',
    check: ['The gate takes the wall tiles it covers (no overlap, no gap)', 'Your men pass the gate; foes do not', 'Drop a tower on the wall: it takes its tiles too'],
    squads: [you('militia', at(FLAT, 0, -2))],
    camera: { x: 127, y: 429, zoom: 1 },
    economy: { ...flatCamp(), walls: [{ squad: 0, material: 'wood', points: [119.5, 428.5, 134.5, 428.5] }] },
    after: { orders: [], squads: [], then: [{ kind: 'placeBuilding', squad: 0, type: 'woodGate', x: 127, y: 428.5, rot: 0 }] },
  },
  {
    id: 'build-stalled',
    name: 'Stalled site: waiting for goods',
    group: 'building',
    goal: 'The militia lay a palisade with 6 wood in stock (it needs 24). The site waits; grant wood from the console and it finishes.',
    check: ['The site card says "Waiting for 18 wood"', 'The squad card says the same', 'Console Economy: +wood, and the site goes on to done'],
    squads: [you('militia', at(FLAT, 0, -2))],
    camera: { x: 127, y: 430, zoom: 1 },
    economy: flatCamp(6),
    after: { orders: [], squads: [], then: [{ kind: 'placeWall', squad: 0, material: 'wood', points: [125.5, 429.5, 128.5, 429.5] }] },
  },
  {
    id: 'build-no-workers',
    name: 'Site with no workers',
    group: 'building',
    goal: 'A storehouse is planned with no squad on it. It says so and waits; send a squad (right-click the site).',
    check: ['The site card says "No workers"', 'Right-click it with the militia: they start building', 'Console: Finish site completes it at once'],
    squads: [you('militia', at(FLAT, -6, 2))],
    camera: { x: 132, y: 434, zoom: 1 },
    economy: flatCamp(),
    after: { orders: [{ kind: 'move', squad: 0, x: FLAT[0] - 8, y: FLAT[1] + 4 }], squads: [], then: [{ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 133.5, y: 433.5 }] },
  },
];
