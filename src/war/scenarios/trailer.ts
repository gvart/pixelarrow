/**
 * Scenes for the war trailer (scripts/landing/trailer-shots.mjs records them, scripts/landing/trailer.mjs cuts them):
 * seeded sandbox scenarios like ./clips.ts, staged for the camera. `sandbox.html?scenario=<id>`; the recorder seeds
 * Math.random per shot, so a take repeats frame for frame. Squad ids follow the spawn order (neutral regions: their
 * lairs and guardians first); the foragers' nodes and the fire arrows' cottage are the nearest of their kind to a point
 * (gatherNear, attackBuildingNear; tests/war/trailer.test.ts checks them).
 */
import type { Scenario, ScenarioOrder, ScenarioSquad } from './types';
import type { Order } from '../types';
import { SPOTS as E } from '../regions/elaia.spots';
import { SQUAD_MAX } from '../sim/soldiers';

type P = readonly [number, number];
const you = (cls: string, [x, y]: P, count = SQUAD_MAX): ScenarioSquad => ({ team: 0, cls, count, x, y });

/** Elaia's agora: the well, the brazier the hoplites meet by, and the two groups' marks either side of it. */
export const WELL = [254.5, 313.5] as const;
const BRAZIER = [252, 316] as const;
/** The two hoplite groups' marks; each starts back along the line between them (a clear, straight walk), so they halt facing each other. */
const MEET = [[252.5, 314.5], [256.5, 313]] as const;
const back = (from: P, to: P, d = 5): P => {
  const dx = from[0] - to[0], dy = from[1] - to[1], k = d / Math.hypot(dx, dy);
  return [from[0] + dx * k, from[1] + dy * k];
};
/**
 * Where the foragers work (the nearest node of its kind): a lone flame cypress in the fields below the olive terraces
 * (no other tree in front of it, so it never fades over them), the marble knoll's deposit, the olive grove.
 */
export const WOOD = [286.4, 272.5] as const, MARBLE = E.marbleKnoll, OLIVE = E.olives;
/** The woodcutters come at the cypress from the front (screen-below), so they stand before it, not behind it. */
const WOOD_FRONT = [WOOD[0] + 3, WOOD[1] + 3] as const;
/** The column's halt on the terrace top above the olive grove, and the cottage the fire arrows go for (the one nearest this point). */
export const RIDGE = [318, 176] as const;
export const COTTAGE = [257, 345] as const;
const COLUMN = ['celt_sword', 'celt_sword', 'javelineer', 'archer'] as const;

/** The town at peace (squads 0..6, team 0) and the column on the ridge (7..10, team 1, idle). */
const town: ScenarioSquad[] = [
  you('hoplite', back(MEET[0], MEET[1]), 4),
  you('hoplite', back(MEET[1], MEET[0], 6), 4),
  you('civ_merchant', [256.5, 309.5], 2),
  you('civ_forager', WOOD_FRONT, 3),
  you('civ_forager', [E.marbleKnoll[0] + 2, E.marbleKnoll[1] + 4], 2),
  you('civ_forager', [E.olives[0] - 2, E.olives[1] + 5], 3),
  you('militia', [232, 306], 6),
];
const column = (bots: boolean): ScenarioSquad[] => COLUMN.map((cls, i) => ({
  team: 1, cls, count: SQUAD_MAX, x: RIDGE[0] + (i % 2) * 4 - 2, y: RIDGE[1] - Math.floor(i / 2) * 5, owner: 'raiders',
  // the swordsmen make for the agora, the javelineers through the olive grove (the pickers there run)
  ...(bots && cls !== 'archer' ? { bot: { kind: 'attackMove' as const, x: cls === 'javelineer' ? E.olives[0] : E.market[0], y: cls === 'javelineer' ? E.olives[1] + 4 : E.market[1] } } : {}),
}));
/** The day's work: the hoplites meet at the well, the merchants stand their stall, the foragers fell, quarry and pick. */
const work: ScenarioOrder[] = [
  { kind: 'move', squad: 0, x: MEET[0][0], y: MEET[0][1] },
  { kind: 'move', squad: 1, x: MEET[1][0], y: MEET[1][1] },
  { kind: 'placeBuilding', squad: 0, type: 'brazier', x: BRAZIER[0], y: BRAZIER[1] },
  { kind: 'gatherNear', squad: 3, res: 'wood', x: WOOD[0], y: WOOD[1] },
  { kind: 'gatherNear', squad: 4, res: 'marble', x: MARBLE[0], y: MARBLE[1] },
  { kind: 'gatherNear', squad: 5, res: 'food', x: OLIVE[0], y: OLIVE[1] },
  { kind: 'move', squad: 6, x: 272, y: 312 },
];
/** No claims (no banners on the town): the brazier's wood comes from the strongroom. */
const elaia = { claims: [], stock: { wood: 50 } };

/** A raid of `n` squads in column at `from`, attack-moving on `to` (squad ids from `first`). */
const raid = (classes: string[], from: P, to: P, first: number): Pick<Scenario, 'squads' | 'after'> => ({
  squads: classes.map((cls, i) => you(cls, [from[0] + (i % 2) * 4 - 2, from[1] + Math.floor(i / 2) * 4])),
  after: { orders: classes.map((_, i): Order => ({ kind: 'attackMove', squad: first + i, x: to[0] + (i % 2) * 2, y: to[1] + Math.floor(i / 2) * 2 })), squads: [] },
});

export const TRAILER_SCENARIOS: Scenario[] = [
  {
    id: 'trailer-elaia',
    name: 'Trailer: Elaia at peace',
    goal: 'Elaia at peace: hoplites meet at the well by a brazier, merchants at their stall, foragers fell, quarry and pick olives; a column waits on the ridge above.',
    region: 'elaia',
    squads: [...town, ...column(false)],
    camera: { x: WELL[0], y: WELL[1], zoom: 1 },
    economy: elaia,
    after: { orders: work, squads: [] },
  },
  {
    id: 'trailer-elaia-raid',
    name: 'Trailer: Elaia raided',
    goal: 'The column comes down through the olive terraces on the agora: swordsmen and javelineers attack-move, the foragers run; archers by a brazier loose fire arrows on a cottage.',
    region: 'elaia',
    squads: [...town, ...column(true)],
    camera: { x: RIDGE[0], y: RIDGE[1] + 20, zoom: 1 },
    economy: { ...elaia, foeStock: { pitch: 60, wood: 200 } },
    after: {
      orders: work,
      squads: [{ team: 1, cls: 'archer', count: SQUAD_MAX, x: 268, y: 336, owner: 'raiders' }],
      then: [{ kind: 'placeBuilding', squad: 11, type: 'brazier', x: 270, y: 338 }],
      // once the brazier burns: fire arrows on, at the cottage
      later: { settle: 2, orders: [{ kind: 'fireArrows', squad: 11, on: true }, { kind: 'attackBuildingNear', squad: 11, type: 'cottage', x: COTTAGE[0], y: COTTAGE[1] }] },
    },
  },
  {
    // Kimmeria's lairs are squads 0..5 (the ibex herd of the north-east, 3, among them); the archers are 6
    id: 'trailer-hunt',
    name: 'Trailer: ibex hunt',
    goal: 'Eight archers below the north-east ibex herd of the Kimmerian hills loose on it; the herd bolts.',
    region: 'kimmeria',
    neutral: true,
    squads: [you('archer', [454, 92], 8)],
    camera: { x: 454, y: 86, zoom: 1 },
    after: { orders: [], settle: 10, squads: [], then: [{ kind: 'attack', squad: 6, target: 3 }] },
  },
  {
    // the Gorge: lairs 0..2, Gyges 3 at the anvil; the raid 4..7 up from the narrows
    id: 'landmark-forge',
    name: "Titan's Forge",
    goal: 'A 4-squad raid comes up from the narrows on Gyges, chained at the anvil of the forge.',
    region: 'gorge',
    neutral: true,
    ...raid(['hoplite', 'hoplite', 'archer', 'archer'], [252, 182], [258, 158], 4),
    camera: { x: 260, y: 155, zoom: 1 },
  },
  {
    // the Red Canyons: lairs 0..1, the Chimera 2 at the hold; the raid 3..6 up from the mesa
    id: 'landmark-hold',
    name: 'Obsidian Hold',
    goal: 'A 4-squad raid climbs from the mesa on the Chimera at the Obsidian Hold.',
    region: 'canyons',
    neutral: true,
    ...raid(['hoplite', 'hoplite', 'celt_sword', 'archer'], [163, 178], [161, 156], 3),
    camera: { x: 161, y: 155, zoom: 1 },
  },
  {
    // the Siren Estuary: lairs 0..1, Scylla 2 and her heads 3; the raid 4..7 over the tidal flats
    id: 'landmark-watchtower',
    name: 'Rim Watchtower',
    goal: "A 4-squad raid crosses the tidal flats to Scylla's sea cave below the Rim Watchtower.",
    region: 'siren',
    neutral: true,
    ...raid(['hoplite', 'hoplite', 'archer', 'archer'], [72, 300], [55, 292], 4),
    camera: { x: 52, y: 292, zoom: 1 },
  },
  {
    // Omphalos: lairs 0..3, the Titan 4 at the arena, the Minotaur 5; the raid 6..10 from the temple streets
    id: 'landmark-temple',
    name: 'Temple City arena',
    goal: 'A 5-squad raid comes out of the ruined temple streets into the arena, where the Titan hurls boulders.',
    region: 'omphalos',
    neutral: true,
    ...raid(['hoplite', 'hoplite', 'hoplite', 'archer', 'archer'], [368, 286], [384, 272], 6),
    camera: { x: 384, y: 272, zoom: 1 },
  },
];
