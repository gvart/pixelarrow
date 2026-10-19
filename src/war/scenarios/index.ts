/**
 * Sandbox scenario presets for test-ridge (M1d): `sandbox.html?scenario=<id>`. Each places the
 * player's squads (team 0, yours to order) and bot squads (team 1) with a behaviour from
 * ../sim/bots.ts, and sets the camera. Points are tile coords, mostly named spots.
 */
import type { Behaviour } from '../sim/bots';
import type { BuildingType, ResourceKind } from '../types';
import { SPOTS } from '../regions/test-ridge.spots';

export interface ScenarioSquad { team: 0 | 1; cls: string; count: number; x: number; y: number; bot?: Behaviour }

export interface Scenario {
  id: string;
  name: string;
  goal: string;
  squads: ScenarioSquad[];
  camera: { x: number; y: number; zoom: number };
  /** Economy start (M2b): claim anchors, own stock, and sites a squad (index into squads) lays out and builds. */
  economy?: {
    claims: { team: number; x: number; y: number; r?: number }[];
    stock?: Partial<Record<ResourceKind, number>>;
    sites?: { squad: number; type: BuildingType; x: number; y: number }[];
  };
}

type P = readonly [number, number];
const at = (p: P, dx = 0, dy = 0): [number, number] => [p[0] + dx, p[1] + dy];
const you = (cls: string, [x, y]: [number, number], count = 20): ScenarioSquad => ({ team: 0, cls, count, x, y });
const bot = (cls: string, [x, y]: [number, number], b: Behaviour, count = 20): ScenarioSquad => ({ team: 1, cls, count, x, y, bot: b });

const S = SPOTS;
/** build-test: a flat clearing in the south-east woods (trees all round, boulders near). */
const HOME = [342, 338] as const;
const [passSx, passSy] = S.passS;
const [fwx, fwy] = S.fieldW;

export const SCENARIOS: Scenario[] = [
  {
    id: 'pass-ambush',
    name: 'Pass ambush',
    goal: 'Hold the switchback pass: the enemy column marches from passN to passS. Stop it.',
    squads: [
      you('hoplite', at(S.passSaddle, 0, 4)),
      you('hoplite', at(S.passSaddle, -4, 6)),
      you('archer', at(S.passSaddle, 2, 12), 16),
      you('archer', at(S.passSaddle, -4, 13), 16),
      you('militia', at(S.passSaddle, -1, 18)),
      ...['celt_sword', 'militia', 'hoplite', 'javelineer', 'celt_sword'].map((c, i) =>
        bot(c, at(S.passN, -6 + (i % 2) * 6, -10 - i * 6), { kind: 'attackMove', x: passSx, y: passSy })),
    ],
    camera: { x: S.passSaddle[0], y: S.passSaddle[1], zoom: 1 / 3 },
  },
  {
    id: 'ford-crossing',
    name: 'Ford crossing',
    goal: 'Force the ford: the enemy holds the far (east) bank. Get across and break them.',
    squads: [
      you('hoplite', at(S.fordW, -10, -4)),
      you('hoplite', at(S.fordW, -10, 4)),
      you('celt_sword', at(S.fordW, -16, 0)),
      you('archer', at(S.fordW, -20, -6), 16),
      you('slinger', at(S.fordW, -20, 6), 16),
      you('militia', at(S.fordW, -26, 0)),
      bot('hoplite', at(S.fordE, 4, -3), { kind: 'hold', x: S.fordE[0] + 4, y: S.fordE[1] - 3, radius: 10 }),
      bot('celt_sword', at(S.fordE, 4, 4), { kind: 'hold', x: S.fordE[0] + 4, y: S.fordE[1] + 4, radius: 10 }),
      bot('archer', at(S.fordE, 12, -4), { kind: 'hold', x: S.fordE[0] + 12, y: S.fordE[1] - 4, radius: 12 }, 16),
      bot('javelineer', at(S.fordE, 12, 5), { kind: 'hold', x: S.fordE[0] + 12, y: S.fordE[1] + 5, radius: 12 }, 16),
      bot('militia', at(S.fordE, 18, 0), { kind: 'hold', x: S.fordE[0] + 18, y: S.fordE[1], radius: 12 }),
    ],
    camera: { x: S.ford[0], y: S.ford[1] - 6, zoom: 1 / 3 },
  },
  {
    id: 'hill-assault',
    name: 'Hill assault',
    goal: 'Take the plateau: the enemy holds the top. Storm the ramp or flank round the hill.',
    squads: [
      // in column halfway up the ramp
      you('hoplite', at(S.rampMid, 22, -22)),
      you('hoplite', at(S.rampMid, 18, -18)),
      you('celt_sword', at(S.rampMid, 14, -14)),
      you('militia', at(S.rampMid, 10, -10)),
      you('archer', at(S.rampMid, 6, -6), 16),
      you('slinger', at(S.rampMid, 2, -2), 16),
      bot('hoplite', at(S.plateauTop, -10, 0), { kind: 'hold', x: S.plateauTop[0] - 10, y: S.plateauTop[1], radius: 12 }),
      bot('celt_sword', at(S.plateauTop, -4, 6), { kind: 'hold', x: S.plateauTop[0] - 4, y: S.plateauTop[1] + 6, radius: 12 }),
      bot('militia', at(S.plateauTop, -10, 8), { kind: 'hold', x: S.plateauTop[0] - 10, y: S.plateauTop[1] + 8, radius: 12 }),
      bot('archer', at(S.plateauTop, -4, -6), { kind: 'hold', x: S.plateauTop[0] - 4, y: S.plateauTop[1] - 6, radius: 14 }),
      bot('slinger', at(S.plateauTop, 2, 0), { kind: 'hold', x: S.plateauTop[0] + 2, y: S.plateauTop[1], radius: 14 }),
    ],
    camera: { x: 409, y: 116, zoom: 1 / 3 },
  },
  {
    id: 'bridge-vs-ford',
    name: 'Bridge or ford',
    goal: 'Two enemy columns head for fieldW, one over the bridge, one through the ford. Pick where to block.',
    squads: [
      you('hoplite', at(S.marsh, -26, -4)),
      you('hoplite', at(S.marsh, -26, 4)),
      you('celt_sword', at(S.marsh, -32, 0)),
      you('archer', at(S.marsh, -36, -6), 16),
      you('slinger', at(S.marsh, -36, 6), 16),
      you('militia', at(S.marsh, -42, 0)),
      ...['hoplite', 'celt_sword', 'archer'].map((c, i) =>
        bot(c, at(S.fordE, 18 + i * 7, 10), { kind: 'flank', via: at(S.fordW, -4, 0), x: fwx, y: fwy })),
      ...['celt_sword', 'militia', 'javelineer'].map((c, i) =>
        bot(c, at(S.bridgeE, 14 + i * 6, -10 - i * 6), { kind: 'flank', via: at(S.bridgeW, -6, 2), x: passSx, y: passSy })),
    ],
    camera: { x: 291, y: 261, zoom: 1 / 12 }, // both crossings in view
  },
  {
    id: 'brawl-600',
    name: '600 brawl',
    goal: '300 v 300 across the ford: the bots attack the nearest squad. Win the melee.',
    squads: [], // built by devPanel brawl()
    camera: { x: S.ford[0], y: S.ford[1], zoom: 1 / 3 },
  },
  {
    id: 'build-test',
    name: 'Build test',
    goal: 'Build up a base: your militia raise a camp on the claimed ground; gather wood and stone, place buildings and walls (B).',
    squads: [
      you('militia', at(HOME, -4, 4)),
      you('militia', at(HOME, 4, 6)),
      you('hoplite', at(HOME, 0, 10)),
      bot('celt_sword', at(S.fieldE, 0, 0), { kind: 'hold', x: S.fieldE[0], y: S.fieldE[1], radius: 8 }),
      bot('archer', at(S.fieldE, 6, 4), { kind: 'hold', x: S.fieldE[0] + 6, y: S.fieldE[1] + 4, radius: 8 }, 16),
    ],
    camera: { x: HOME[0], y: HOME[1] + 4, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }],
      stock: { wood: 150, stone: 100, food: 50 },
      sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }],
    },
  },
  {
    id: 'free',
    name: 'Free',
    goal: 'Empty map: place squads and bots from the panel.',
    squads: [],
    camera: { x: S.ford[0], y: S.ford[1], zoom: 1 / 2 },
  },
];

export const scenarioById = (id: string | null): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
