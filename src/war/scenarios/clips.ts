/**
 * Scenes for the landing page's gameplay clips (scripts/landing/war-shots.mjs records them): seeded sandbox
 * scenarios like the rest of ./index.ts, built to look at rather than to play. `sandbox.html?scenario=clip-<id>`.
 */
import type { Scenario, ScenarioSquad } from './index';
import { SPOTS as S } from '../regions/test-ridge.spots';
import { SQUAD_MAX } from '../sim/soldiers';

type P = readonly [number, number];
const you = (cls: string, [x, y]: P, count = SQUAD_MAX): ScenarioSquad => ({ team: 0, cls, count, x, y });

/** caravan: the camp by the east road (as the caravan scenario) and a trading post down the road, south of it. */
const HOME = [391.5, 189.5] as const, POST = [421.5, 214.5] as const, ROAD_E = [440, 213.5] as const;
/** build: the flat clearing in the south-east woods (build-test's HOME). */
const YARD = [342, 338] as const;
/** battle: the ridge's gentle side; one host holds the crest, the other comes up from the foot. */
const CREST = S.ridgeCrest, FOOT = S.ridgeFoot;
const LINE = ['hoplite', 'hoplite', 'celt_sword', 'militia', 'hoplite', 'celt_sword', 'militia'];
const BACK = ['archer', 'slinger', 'javelineer', 'archer', 'slinger', 'archer', 'javelineer'];

/** A host of 3 ranks x 7 squads (252 men) round (x, y), front rank toward `dy` (+1: south). */
function host(team: 0 | 1, x: number, y: number, dy: 1 | -1, to: P): ScenarioSquad[] {
  const out: ScenarioSquad[] = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const cls = r === 2 ? BACK[i] : LINE[(i + r * 3) % LINE.length];
    out.push({ team, cls, count: SQUAD_MAX, x: x + (i - 3) * 5, y: y - dy * r * 6, owner: team === 0 ? 'you' : 'bot', bot: { kind: 'attackMove', x: to[0] + (i - 3) * 3, y: to[1] } });
  }
  return out;
}

export const CLIP_SCENARIOS: Scenario[] = [
  {
    id: 'clip-caravan',
    name: 'Clip: caravan',
    goal: 'A loaded wagon takes the east road from the camp past the trading post, hoplites and archers escorting it.',
    squads: [you('militia', [HOME[0] - 2, HOME[1] - 6])],
    camera: { x: HOME[0] + 8, y: HOME[1] + 8, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 20 }, { team: 0, x: POST[0], y: POST[1], r: 10 }],
      stock: { food: 60, coin: 600, bronze: 20, hides: 10, oil: 20, wood: 400, stone: 100 },
      sites: [
        { squad: 0, type: 'camp', x: HOME[0], y: HOME[1] },
        { squad: 0, type: 'storehouse', x: HOME[0] - 6.5, y: HOME[1] + 1.5 },
        { squad: 0, type: 'camp', x: POST[0], y: POST[1] },
        { squad: 0, type: 'storehouse', x: POST[0] + 4.5, y: POST[1] + 0.5 },
      ],
      prebuild: 5000,
    },
    carts: [{ team: 0, owner: 'you', type: 'wagon', x: 397, y: 200.5 }],
    after: {
      orders: [{ kind: 'move', squad: 0, x: HOME[0] - 3, y: HOME[1] - 8 }],
      squads: [you('militia', [394, 200], 3), you('hoplite', [391, 199], 8), you('archer', [392, 202], 6)],
      then: [{ kind: 'crew', squad: 1, siege: 0 }],
      later: { settle: 60, orders: [{ kind: 'move', squad: 1, x: ROAD_E[0], y: ROAD_E[1] }, { kind: 'escort', squad: 2, cart: 0 }, { kind: 'escort', squad: 3, cart: 0 }] },
    },
  },
  {
    id: 'clip-build',
    name: 'Clip: build',
    goal: 'Militia raise a palisade round their camp, timber by timber.',
    squads: [you('militia', [YARD[0] - 4, YARD[1] + 4]), you('militia', [YARD[0] + 4, YARD[1] + 4]), you('militia', [YARD[0], YARD[1] - 4]), you('militia', [YARD[0], YARD[1] + 8])],
    camera: { x: YARD[0], y: YARD[1], zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: YARD[0], y: YARD[1], r: 24 }],
      stock: { wood: 3000, stone: 400, food: 200 },
      sites: [{ squad: 0, type: 'camp', x: YARD[0] + 0.5, y: YARD[1] + 0.5 }],
      walls: [
        { squad: 0, material: 'wood', points: [YARD[0] - 7.5, YARD[1] - 7.5, YARD[0] + 7.5, YARD[1] - 7.5], inside: [YARD[0], YARD[1]], phase: 1 },
        { squad: 1, material: 'wood', points: [YARD[0] - 7.5, YARD[1] + 7.5, YARD[0] + 7.5, YARD[1] + 7.5], gates: [YARD[0] + 0.5, YARD[1] + 7.5], inside: [YARD[0], YARD[1]], phase: 1 },
        { squad: 2, material: 'wood', points: [YARD[0] - 7.5, YARD[1] - 5.5, YARD[0] - 7.5, YARD[1] + 5.5], inside: [YARD[0], YARD[1]], phase: 1 },
        { squad: 3, material: 'wood', points: [YARD[0] + 7.5, YARD[1] - 5.5, YARD[0] + 7.5, YARD[1] + 5.5], inside: [YARD[0], YARD[1]], phase: 1 },
      ],
      // the camp stands; the palisade is begun, not done (play goes on building it)
      prebuild: 600,
    },
  },
  {
    id: 'clip-battle',
    name: 'Clip: battle',
    goal: 'Two hosts of 252 clash on the ridge: one charges down from the crest, the other up from the foot.',
    squads: [...host(0, FOOT[0], FOOT[1] - 4, -1, CREST), ...host(1, CREST[0], CREST[1] + 8, 1, FOOT)],
    camera: { x: (CREST[0] + FOOT[0]) / 2, y: (CREST[1] + FOOT[1]) / 2, zoom: 1 / 2 },
  },
];
