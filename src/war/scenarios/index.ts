/**
 * Sandbox scenario presets for test-ridge (M1d): `sandbox.html?scenario=<id>`. Each places the
 * player's squads (team 0, yours to order) and bot squads (team 1) with a behaviour from
 * ../sim/bots.ts, and sets the camera. Points are tile coords, mostly named spots.
 */
import type { Behaviour } from '../sim/bots';
import type { BuildingType, Order, ResourceKind, WallOrder } from '../types';
import { SPOTS } from '../regions/test-ridge.spots';

/** owner: the spawn's owner (default you / bot); a team-1 squad without a bot and with an owner other than `bot` stands idle. */
export interface ScenarioSquad { team: 0 | 1; cls: string; count: number; x: number; y: number; bot?: Behaviour; owner?: string }

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
    /** Team 1's stockpile (its walls, its siege bots' engines). */
    foeStock?: Partial<Record<ResourceKind, number>>;
    /** Wall lines a squad lays out (before the sites, so stairs and ladders find their wall). */
    walls?: (Omit<WallOrder, 'kind' | 'squad'> & { squad: number; phase?: number })[];
    sites?: { squad: number; type: BuildingType; x: number; y: number; rot?: 0 | 1; phase?: number }[];
    /**
     * Fast-forward up to this many ticks per phase before play, each team's squads building its sites (a standing
     * base): walls and sites go down by `phase` (default 0), each phase built before the next is laid out.
     */
    prebuild?: number;
  };
  /**
   * After the prebuild: orders, `settle` ticks stepped at once (squads take post), then more squads (ids go on from
   * `squads`) and the orders `then`.
   */
  after?: {
    orders: Order[]; settle?: number; squads: ScenarioSquad[]; then?: Order[];
    /** Then `settle` more ticks at once (engines get built) and these orders. */
    later?: { settle: number; orders: Order[] };
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
/**
 * wall-defense: the one flat open stretch of test-ridge (28 x 28 tiles of grass at height 1, south-west). A stone wall
 * ring, line x 119..135, y 425..440 (inner row inside), a gate in its south side, stone stairs up the north and west
 * walls, a free wood tower with its ladder inside, the camp in the middle.
 */
const RING = { x0: 119.5, y0: 425.5, x1: 135.5, y1: 440.5 } as const;
const RC = [127.5, 433] as const;
/** The ring's walls (as wall-defense): four lines, north and south take the corners, a gate in the south. */
const ringWalls = (a: number, b: number) => [
  { squad: a, material: 'stone' as const, points: [RING.x0, RING.y0, RING.x1, RING.y0], towers: [RING.x0 + 3, RING.y0, RING.x1 - 3, RING.y0], inside: [RC[0], RC[1]], phase: 1 },
  { squad: a, material: 'stone' as const, points: [RING.x0, RING.y1, RING.x1, RING.y1], gates: [127.5, RING.y1], towers: [RING.x0 + 3, RING.y1, RING.x1 - 3, RING.y1], inside: [RC[0], RC[1]], phase: 1 },
  { squad: b, material: 'stone' as const, points: [RING.x0, RING.y0 + 2, RING.x0, RING.y1 - 2], inside: [RC[0], RC[1]], phase: 2 },
  { squad: b, material: 'stone' as const, points: [RING.x1, RING.y0 + 2, RING.x1, RING.y1 - 2], inside: [RC[0], RC[1]], phase: 2 },
  // the palisade outwork south of the gate, open in front of it
  { squad: a, material: 'wood' as const, points: [113.5, 446.5, 124.5, 446.5], phase: 1 },
  { squad: b, material: 'wood' as const, points: [130.5, 446.5, 141.5, 446.5], phase: 1 },
];
/** The camp first (the store the builders haul from), then stairs up the north and west walls. */
const ringSites = (a: number, b: number) => [
  { squad: a, type: 'camp' as const, x: 127, y: 434 },
  { squad: b, type: 'stoneStairs' as const, x: 123.5, y: 428.5, phase: 3 },
  { squad: b, type: 'stoneStairs' as const, x: 122.5, y: 431.5, rot: 1 as const, phase: 3 },
];

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
    id: 'wall-defense',
    name: 'Wall defense',
    goal: 'Hold the walled camp: your archers man the south wall-walk, spears wait inside the gate. The enemy comes from the south and raises ladders.',
    squads: [
      you('hoplite', at(RC, -3, -3)),
      you('hoplite', at(RC, 3, -3)),
      // archers in fours: a big squad files up a one-man stair badly (some stall at its foot)
      ...[-3, -1, 1, 3].map((dx) => you('archer', at(RC, dx, 4), 4)),
    ],
    camera: { x: RC[0], y: RC[1] + 4, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }],
      stock: { stone: 3000, wood: 1000 },
      sites: [
        { squad: 0, type: 'camp', x: 127, y: 434 },
        { squad: 1, type: 'stoneStairs', x: 123.5, y: 428.5, phase: 2 },
        { squad: 1, type: 'stoneStairs', x: 122.5, y: 431.5, rot: 1, phase: 2 },
        { squad: 2, type: 'woodTower', x: 127, y: 428, phase: 2 },
        { squad: 2, type: 'ladder', x: 126.5, y: 429.5, phase: 2 },
      ],
      // four lines, not one closed loop: the sim's inner rows overlap at a loop's corners. North and south bands take
      // the corners, west and east run between them.
      walls: [
        { squad: 0, material: 'stone', points: [RING.x0, RING.y0, RING.x1, RING.y0], inside: [RC[0], RC[1]] },
        { squad: 0, material: 'stone', points: [RING.x0, RING.y1, RING.x1, RING.y1], gates: [127.5, RING.y1], inside: [RC[0], RC[1]] },
        { squad: 1, material: 'stone', points: [RING.x0, RING.y0 + 2, RING.x0, RING.y1 - 2], inside: [RC[0], RC[1]], phase: 1 },
        { squad: 1, material: 'stone', points: [RING.x1, RING.y0 + 2, RING.x1, RING.y1 - 2], inside: [RC[0], RC[1]], phase: 1 },
      ],
      prebuild: 20000,
    },
    after: {
      squads: [
        bot('celt_sword', at(RC, -6, 22), { kind: 'attackMove', x: RC[0], y: RC[1] }),
        bot('javelineer', at(RC, 6, 22), { kind: 'attackMove', x: RC[0], y: RC[1] }, 16),
        bot('archer', at(RC, 0, 26), { kind: 'attackMove', x: RC[0], y: RC[1] }, 16),
        { team: 1, cls: 'militia', count: 20, x: RC[0] - 2, y: RC[1] + 18 }, // raiders: raise the ladders, then climb
      ],
      orders: [
        { kind: 'move', squad: 0, x: 127.5, y: 436.5 }, // spears behind the gate
        { kind: 'move', squad: 1, x: 130.5, y: 433 },
        // archers up the stairs, along the south walk; four up the wood tower's ladder
        ...[2, 3, 4].map((squad, i): Order => ({ kind: 'move', squad, x: 121.5 + 2 * i, y: 439.5 })),
        { kind: 'move', squad: 5, x: 127, y: 427.6 },
      ],
      settle: 1200,
      then: [
        { kind: 'placeBuilding', squad: 9, type: 'ladder', x: 123.5, y: 441.5 },
        { kind: 'placeBuilding', squad: 9, type: 'ladder', x: 132.5, y: 441.5 },
      ],
    },
  },
  {
    id: 'siege',
    name: 'Siege',
    goal: 'Take the stone fort: batter the gate with the ram (C crew, right click the gate), raise the ladder on the wall (L), shell the towers with the stone thrower, burn the palisade with fire arrows (Q), then storm the breach.',
    squads: [
      // the garrison's builders (they raise the fort before play, then stand inside)
      { team: 1, cls: 'militia', count: 20, x: RC[0] - 3, y: RC[1], owner: 'garrison' },
      { team: 1, cls: 'militia', count: 20, x: RC[0] + 3, y: RC[1], owner: 'garrison' },
      { team: 1, cls: 'militia', count: 20, x: RC[0] - 3, y: RC[1] + 3, owner: 'garrison' },
      { team: 1, cls: 'militia', count: 20, x: RC[0] + 3, y: RC[1] + 3, owner: 'garrison' },
    ],
    camera: { x: 127.5, y: 450, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 1, x: RC[0], y: RC[1], r: 26 }],
      stock: { wood: 300, stone: 100 },
      foeStock: { stone: 4000, wood: 1500 },
      walls: ringWalls(0, 1),
      sites: ringSites(0, 1),
      prebuild: 30000,
    },
    after: {
      orders: [
        { kind: 'move', squad: 0, x: RC[0] - 2, y: RC[1] - 2 },
        { kind: 'move', squad: 1, x: RC[0] + 2, y: RC[1] - 2 },
        { kind: 'move', squad: 2, x: RC[0] - 2, y: RC[1] + 1 },
        { kind: 'move', squad: 3, x: RC[0] + 2, y: RC[1] + 1 },
      ],
      settle: 100,
      // your army (squads 4..9) and the wall defenders (10..12)
      squads: [
        you('hoplite', [124, 468]),
        you('hoplite', [131, 468]),
        you('archer', [127.5, 472], 16),
        you('militia', [127.5, 461], 16), // ram crew (the roof covers half the arrows)
        you('militia', [118.5, 464], 12), // ladder squad
        you('militia', [138.5, 466], 10), // thrower crew
        bot('archer', at(RC, -2, 3), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }, 16),
        bot('archer', at(RC, 2, 3), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }, 12),
        bot('hoplite', at(RC, 0, 1), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }, 16),
      ],
      then: [
        { kind: 'buildSiege', squad: 7, type: 'ram', x: 127.5, y: 458.5 },
        { kind: 'buildSiege', squad: 8, type: 'siegeLadder', x: 118.5, y: 461.5 },
        { kind: 'buildSiege', squad: 9, type: 'stoneThrower', x: 138.5, y: 463.5 },
      ],
      later: {
        settle: 1300,
        orders: [
          { kind: 'crew', squad: 7, siege: 0 },
          { kind: 'crew', squad: 8, siege: 1 },
          { kind: 'crew', squad: 9, siege: 2 },
        ],
      },
    },
  },
  {
    id: 'siege-defend',
    name: 'Siege defend',
    goal: 'Hold the stone fort: the enemy builds a ram and ladders, shoots fire arrows and storms when a breach or a ladder opens. Man the walls, push ladders off (P), sally out to burn the ram (I), beat out fires (O).',
    squads: [
      you('hoplite', at(RC, -3, -3)),
      you('hoplite', at(RC, 3, -3)),
      ...[-3, -1, 1, 3].map((dx) => you('archer', at(RC, dx, 4), 4)),
    ],
    camera: { x: RC[0], y: RC[1] + 10, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }],
      stock: { stone: 4000, wood: 1500 },
      foeStock: { wood: 1000, stone: 200 },
      walls: ringWalls(0, 1),
      sites: ringSites(0, 1),
      prebuild: 20000,
    },
    after: {
      orders: [
        { kind: 'move', squad: 0, x: 127.5, y: 437.5 },
        { kind: 'move', squad: 1, x: 130.5, y: 433 },
        ...[2, 3, 4, 5].map((squad, i): Order => ({ kind: 'move', squad, x: 121.5 + 3 * i, y: 439.5 })),
      ],
      settle: 1200,
      squads: [
        bot('militia', [127, 470], { kind: 'siegeRam', x: RC[0], y: RC[1] }, 8),
        bot('militia', [119, 468], { kind: 'siegeLadder', x: RC[0], y: RC[1] }, 6),
        bot('militia', [136, 468], { kind: 'siegeLadder', x: RC[0], y: RC[1] }, 6),
        bot('archer', [128, 474], { kind: 'siegeArchers', x: RC[0], y: RC[1] }, 16),
        bot('hoplite', [122, 476], { kind: 'assault', x: RC[0], y: RC[1] }),
        bot('celt_sword', [133, 476], { kind: 'assault', x: RC[0], y: RC[1] }),
      ],
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
