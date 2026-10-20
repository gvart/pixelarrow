/**
 * Sandbox scenario presets for test-ridge (M1d): `sandbox.html?scenario=<id>`. Each places the
 * player's squads (team 0, yours to order) and bot squads (team 1) with a behaviour from
 * ../sim/bots.ts, and sets the camera. Points are tile coords, mostly named spots.
 */
import type { Behaviour } from '../sim/bots';
import type { BridgeOrder, BuildingType, Order, ResourceKind, SafeRect, TileRect, WallOrder } from '../types';
import { CLAIM_POINT as ridgeClaim, SPOTS } from '../regions/test-ridge.spots';
import { SQUAD_MAX } from '../sim/soldiers';

/** count: at most SQUAD_MAX (the sim clamps it). owner: the spawn's owner (default you / bot); a team-1 squad without a bot and with an owner other than `bot` stands idle. */
export interface ScenarioSquad { team: 0 | 1; cls: string; count: number; x: number; y: number; bot?: Behaviour; owner?: string;
  /** M5h3, own civilians: the persons' level and profession nodes (src/data/professions.ts ids), set on the sandbox roster. */
  level?: number; nodes?: string[] }

export interface Scenario {
  id: string;
  name: string;
  goal: string;
  squads: ScenarioSquad[];
  camera: { x: number; y: number; zoom: number };
  /** Neutral play (W-12): spawn the region's lairs (src/war/sim/mobs.ts); no claim anchor, the claim point gives the first. */
  neutral?: true;
  /** Economy start (M2b): claim anchors, own stock, and sites a squad (index into squads) lays out and builds. */
  economy?: {
    claims: { team: number; x: number; y: number; r?: number }[];
    stock?: Partial<Record<ResourceKind, number>>;
    /** Team 1's stockpile (its walls, its siege bots' engines). */
    foeStock?: Partial<Record<ResourceKind, number>>;
    /** Wall lines a squad lays out (before the sites, so stairs and ladders find their wall). */
    walls?: (Omit<WallOrder, 'kind' | 'squad'> & { squad: number; phase?: number })[];
    sites?: { squad: number; type: BuildingType; x: number; y: number; rot?: 0 | 1; phase?: number }[];
    /** Bridges standing at the start: laid out for `team` after the prebuild and done at once. */
    bridges?: (Omit<BridgeOrder, 'kind' | 'squad' | 'team'> & { team: number })[];
    /**
     * Fast-forward up to this many ticks per phase before play, each team's squads building its sites (a standing
     * base): walls and sites go down by `phase` (default 0), each phase built before the next is laid out.
     */
    prebuild?: number;
  };
  /** M6k: carts standing ready after the prebuild (ids from 0 in this order, after any engine built before). */
  carts?: { team: number; owner: string; type: 'handcart' | 'wagon'; x: number; y: number }[];
  /** M6k: zones merged into the region before the sim starts (RegionData safe, yard, ambush). */
  zones?: { safe?: SafeRect[]; yard?: TileRect[]; ambush?: TileRect[] };
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
const you = (cls: string, [x, y]: [number, number], count = SQUAD_MAX): ScenarioSquad => ({ team: 0, cls, count, x, y });
const bot = (cls: string, [x, y]: [number, number], b: Behaviour, count = SQUAD_MAX): ScenarioSquad => ({ team: 1, cls, count, x, y, bot: b });

const S = SPOTS;
/** neutral-clear: test-ridge's claim point (scripts/war/buildTestRidge.ts; its zone holds the lairs round it). */
const CLAIM = [ridgeClaim.x, ridgeClaim.y] as const;
/** build-test: a flat clearing in the south-east woods (trees all round, boulders near). */
const HOME = [342, 338] as const;
/** crafting: the forge, cookhouse and infirmary round the camp at HOME (open ground in its claim). */
export const CRAFT_FORGE = [336.5, 334.5] as const, CRAFT_COOK = [344.5, 332.5] as const, CRAFT_INFIRMARY = [348.5, 338.5] as const;
/** village: the storehouse the engineers raise beside the camp, and the pine the foragers start on (node id, test-ridge's object order; tests/war/village.test.ts checks it). */
const VILLAGE_STORE = [HOME[0] - 5.5, HOME[1] + 0.5] as const;
const VILLAGE_WOOD = 3324;
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

/**
 * bridge-test (M2d, v2 W-33): the southern river below the ford. The old road crossing between the two river arms is
 * walled off by the enemy (palisade y 402, x 301..309). Two bridges of yours stand: a 3-wide stone road bridge running
 * screen-horizontally over the wide reach (23 tiles of water, BRIDGE_STONE) and a 1-wide wood footbridge over the narrow
 * reach (BRIDGE_FOOT). BRIDGE_DRAG: a free reach between them for a bridge of your own (11 tiles along x at y 376).
 */
/** M6k loot / caravan: open grass by the east road (height 1). */
const LOOT = [430, 236] as const, LOOT_FOE = [444.5, 236.5] as const, LOOT_CART = [436.5, 242.5] as const;
const CARAVAN_HOME = [391.5, 189.5] as const;
const CARAVAN_AMBUSH: TileRect = { x: 446, y: 203, w: 14, h: 9 };
export const BRIDGE_DRAG = [287.5, 376.5, 305.5, 376.5] as const;
export const BRIDGE_STONE = [282.5, 370.5, 306.5, 346.5] as const;
export const BRIDGE_FOOT = [297.5, 400.5, 317.5, 380.5] as const;
const BRIDGE_HOME = [289, 393] as const;

export const SCENARIOS: Scenario[] = [
  {
    id: 'pass-ambush',
    name: 'Pass ambush',
    goal: 'Hold the switchback pass: the enemy column marches from passN to passS. Stop it.',
    squads: [
      you('hoplite', at(S.passSaddle, 0, 4)),
      you('hoplite', at(S.passSaddle, -4, 6)),
      you('archer', at(S.passSaddle, 2, 12)),
      you('archer', at(S.passSaddle, -4, 13)),
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
      you('archer', at(S.fordW, -20, -6)),
      you('slinger', at(S.fordW, -20, 6)),
      you('militia', at(S.fordW, -26, 0)),
      bot('hoplite', at(S.fordE, 4, -3), { kind: 'hold', x: S.fordE[0] + 4, y: S.fordE[1] - 3, radius: 10 }),
      bot('celt_sword', at(S.fordE, 4, 4), { kind: 'hold', x: S.fordE[0] + 4, y: S.fordE[1] + 4, radius: 10 }),
      bot('archer', at(S.fordE, 12, -4), { kind: 'hold', x: S.fordE[0] + 12, y: S.fordE[1] - 4, radius: 12 }),
      bot('javelineer', at(S.fordE, 12, 5), { kind: 'hold', x: S.fordE[0] + 12, y: S.fordE[1] + 5, radius: 12 }),
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
      you('archer', at(S.rampMid, 6, -6)),
      you('slinger', at(S.rampMid, 2, -2)),
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
      you('archer', at(S.marsh, -36, -6)),
      you('slinger', at(S.marsh, -36, 6)),
      you('militia', at(S.marsh, -42, 0)),
      ...['hoplite', 'celt_sword', 'archer'].map((c, i) =>
        bot(c, at(S.fordE, 18 + i * 7, 10), { kind: 'flank', via: at(S.fordW, -4, 0), x: fwx, y: fwy })),
      ...['celt_sword', 'militia', 'javelineer'].map((c, i) =>
        bot(c, at(S.bridgeE, 14 + i * 6, -10 - i * 6), { kind: 'flank', via: at(S.bridgeW, -6, 2), x: passSx, y: passSy })),
    ],
    camera: { x: 291, y: 261, zoom: 1 / 4 }, // the camera's floor (SandboxScene MIN_ZOOM)
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
      bot('archer', at(S.fieldE, 6, 4), { kind: 'hold', x: S.fieldE[0] + 6, y: S.fieldE[1] + 4, radius: 8 }),
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
      prebuild: 28000,
    },
    after: {
      squads: [
        bot('celt_sword', at(RC, -6, 22), { kind: 'attackMove', x: RC[0], y: RC[1] }),
        bot('javelineer', at(RC, 6, 22), { kind: 'attackMove', x: RC[0], y: RC[1] }),
        bot('archer', at(RC, 0, 26), { kind: 'attackMove', x: RC[0], y: RC[1] }),
        { team: 1, cls: 'militia', count: SQUAD_MAX, x: RC[0] - 2, y: RC[1] + 18 }, // raiders: raise the ladders, then climb
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
    goal: 'Take the stone fort: batter the gate with the ram (E on the ram to crew it, then E on the gate), raise the ladder on the wall (E on the wall face), shell the towers with the stone thrower, burn the palisade (E with torches, or fire arrows: Q), then storm the breach. Your engineer (behind the archers) holds the designs: build a mantlet, covered ram, oxybeles or siege tower from the Siege tab (B), and stakes or a ditch from Walls.',
    squads: [
      // the garrison's builders (they raise the fort before play, then stand inside)
      { team: 1, cls: 'militia', count: SQUAD_MAX, x: RC[0] - 3, y: RC[1], owner: 'garrison' },
      { team: 1, cls: 'militia', count: SQUAD_MAX, x: RC[0] + 3, y: RC[1], owner: 'garrison' },
      { team: 1, cls: 'militia', count: SQUAD_MAX, x: RC[0] - 3, y: RC[1] + 3, owner: 'garrison' },
      { team: 1, cls: 'militia', count: SQUAD_MAX, x: RC[0] + 3, y: RC[1] + 3, owner: 'garrison' },
    ],
    camera: { x: 127.5, y: 450, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 1, x: RC[0], y: RC[1], r: 26 }],
      // M5h3: enough over the three engines for one of each engineer design (mantlet, covered ram, oxybeles, siege tower)
      stock: { wood: 800, stone: 100, hides: 40, iron: 20, bronze: 12, linen: 8, charcoal: 10 },
      foeStock: { stone: 4000, wood: 1500 },
      walls: ringWalls(0, 1),
      sites: ringSites(0, 1),
      prebuild: 50000,
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
        you('archer', [127.5, 472]),
        you('militia', [127.5, 461]), // ram crew (the roof covers half the arrows)
        you('militia', [118.5, 464], 12), // ladder squad
        you('militia', [138.5, 466], 10), // thrower crew
        bot('archer', at(RC, -2, 3), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }),
        bot('archer', at(RC, 2, 3), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }, 12),
        bot('hoplite', at(RC, 0, 1), { kind: 'defendWalls', x: RC[0], y: RC[1], radius: 9 }),
        // M5h3: an engineer holding every design and the Fortifier works (squad 13)
        { ...you('civ_engineer', [127.5, 477], 1), level: 10, nodes: ['carpenter', 'masterBuilder', 'rams', 'fortifier', 'artillerist', 'poliorcetes'] },
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
      foeStock: { wood: 1000, stone: 200, pitch: 60 }, // pitch: the siege archers' fire arrows (W-35)
      walls: ringWalls(0, 1),
      sites: ringSites(0, 1),
      prebuild: 28000,
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
        bot('archer', [128, 474], { kind: 'siegeArchers', x: RC[0], y: RC[1] }),
        bot('hoplite', [122, 476], { kind: 'assault', x: RC[0], y: RC[1] }),
        bot('celt_sword', [133, 476], { kind: 'assault', x: RC[0], y: RC[1] }),
      ],
    },
  },
  {
    id: 'bridge-test',
    name: 'Bridge test',
    goal: 'Cross the river: the old road crossing is walled off, but a stone road bridge spans the wide reach to the north and a wood footbridge the narrow one. March the hoplites over, or build a bridge of your own (B, wood or stone bridge: drag from your bank across the water, along the grid or screen-straight; [ ] width 1-3; wood spans 12 tiles, stone 24).',
    squads: [
      you('militia', at(BRIDGE_HOME, 2, 4)),
      you('hoplite', at(BRIDGE_HOME, -4, 9)),
      // the enemy walls the crossing from both sides, then the pickets fall back to their camp and the south woods
      { team: 1, cls: 'militia', count: 12, x: 312, y: 397, owner: 'foe' },
      { team: 1, cls: 'militia', count: 6, x: 305, y: 406, owner: 'foe' },
    ],
    camera: { x: 298, y: 378, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: BRIDGE_HOME[0], y: BRIDGE_HOME[1] + 2, r: 14 }, { team: 0, x: 285, y: 373, r: 10 }, { team: 1, x: 312, y: 398, r: 14 }, { team: 1, x: 302, y: 407, r: 8 }],
      bridges: [
        { team: 0, material: 'stone', points: [...BRIDGE_STONE], width: 3 },
        { team: 0, material: 'wood', points: [...BRIDGE_FOOT], width: 1 },
      ],
      stock: { wood: 400, stone: 800 },
      foeStock: { wood: 200 },
      // a camp (store) on each side of the crossing; each picket walls its part from its side
      sites: [{ squad: 0, type: 'camp', x: BRIDGE_HOME[0] - 2, y: BRIDGE_HOME[1] - 2 }, { squad: 2, type: 'camp', x: 320, y: 392 }, { squad: 3, type: 'camp', x: 300, y: 408 }],
      walls: [
        { squad: 3, material: 'wood', points: [301.5, 402.5, 304.5, 402.5], phase: 1 },
        { squad: 2, material: 'wood', points: [305.5, 402.5, 309.5, 402.5], phase: 1 },
      ],
      prebuild: 10000,
    },
    after: { orders: [{ kind: 'move', squad: 2, x: 322, y: 388 }, { kind: 'move', squad: 3, x: 300, y: 440 }], squads: [] },
  },
  {
    id: 'neutral-clear',
    name: 'Neutral clear',
    goal: 'Clear the region: kill the wolves, boars, bears and bandits round the claim banner (the mobs overlay shows aggro and leash), then right-click the banner with a squad to claim it (30 s, no foes near). Gathering near a living lair is blocked.',
    squads: [
      you('hoplite', at(CLAIM, -6, 6)),
      you('celt_sword', at(CLAIM, 0, 8)),
      you('archer', at(CLAIM, 6, 6)),
      you('militia', at(CLAIM, 0, 12), 12),
    ],
    camera: { x: CLAIM[0], y: CLAIM[1], zoom: 1 / 2 },
    neutral: true,
  },
  {
    // M5f: squads 0 militia (built the camp), 1 hoplite guard; after the prebuild 2..7 civilians (three of each class)
    // and 8 the wolf pack, which comes in from the south some 25 s into play: the civilians run, the guard (a hold bot
    // round the camp) fights
    id: 'village',
    name: 'Village',
    goal: 'A claimed camp at work: cooks, a smith, merchants and a physician at the camp, engineers raise a storehouse, foragers fell wood. A wolf pack raids from the south: the civilians run, the hoplite guard (scripted to hold round the camp) fights them off, then work goes on.',
    squads: [you('militia', at(HOME, -4, 4)), { ...you('hoplite', at(HOME, 6, 2)), bot: { kind: 'hold', x: HOME[0] + 1, y: HOME[1] - 5, radius: 16 } }],
    camera: { x: HOME[0] + 2, y: HOME[1] + 2, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }],
      stock: { wood: 200, stone: 60, food: 120, copper: 12, tin: 12, salt: 6 },
      sites: [{ squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 }],
      prebuild: 4000,
    },
    after: {
      orders: [{ kind: 'move', squad: 0, x: HOME[0] - 2, y: HOME[1] - 9 }],
      settle: 100,
      squads: [
        ...(['civ_cook', 'civ_smith', 'civ_merchant', 'civ_physician', 'civ_engineer', 'civ_forager'] as const).map((cls, k) => you(cls, at(HOME, -4 + (k % 3) * 4, 6 + Math.floor(k / 3) * 3), 3)),
        { team: 1, cls: 'mob_wolf', count: 6, x: HOME[0] + 10, y: HOME[1] + 55, owner: 'raiders', bot: { kind: 'attackMove', x: HOME[0] + 1, y: HOME[1] + 4 } },
      ],
      then: [
        ...[2, 3, 4, 5].map((squad): Order => ({ kind: 'civWork', squad, building: 0 })),
        { kind: 'placeBuilding', squad: 6, type: 'storehouse', x: VILLAGE_STORE[0], y: VILLAGE_STORE[1] },
        { kind: 'gather', squad: 7, node: VILLAGE_WOOD },
      ],
    },
  },
  {
    // M5h5: squad 0 militia raises the camp (building 0), a forge (1), a cookhouse (2) and an infirmary (3); after the
    // prebuild squads 1..6 civilians (cook, smith x2, physician, engineer, merchant, forager), the sandbox roster's household
    // first (the L4 smith holds Bladesmith), the smiths, cook and physician on civWork at their workplaces
    id: 'crafting',
    name: 'Crafting',
    goal: 'A claimed camp with a forge, a cookhouse and an infirmary, stock and a civilian of every trade. Click the forge: queue a Xiphos (Weapons) and watch the odds; when it is made it lands in your stash (roster R, any soldier card): put it on. Pick a crafter for his profession tree; repair or salvage the worn gear in the stash at the forge.',
    squads: [you('militia', at(HOME, -4, 4))],
    camera: { x: HOME[0] - 1, y: HOME[1] - 2, zoom: 1 },
    economy: {
      claims: [{ team: 0, x: HOME[0], y: HOME[1], r: 24 }],
      stock: {
        wood: 400, stone: 300, food: 200, copper: 20, tin: 20, bronze: 24, iron: 6, silver: 80, salt: 10,
        hides: 6, flax: 6, herbs: 8, charcoal: 8, leather: 6, linen: 8, oil: 4,
      },
      sites: [
        { squad: 0, type: 'camp', x: HOME[0] + 0.5, y: HOME[1] + 0.5 },
        { squad: 0, type: 'forge', x: CRAFT_FORGE[0], y: CRAFT_FORGE[1] },
        { squad: 0, type: 'cookhouse', x: CRAFT_COOK[0], y: CRAFT_COOK[1] },
        { squad: 0, type: 'infirmary', x: CRAFT_INFIRMARY[0], y: CRAFT_INFIRMARY[1] },
      ],
      prebuild: 12000,
    },
    after: {
      orders: [{ kind: 'move', squad: 0, x: HOME[0] - 2, y: HOME[1] + 9 }],
      settle: 50,
      squads: ([['civ_cook', 1], ['civ_smith', 2], ['civ_physician', 1], ['civ_engineer', 1], ['civ_merchant', 1], ['civ_forager', 1]] as const)
        .map(([cls, n], k) => you(cls, at(HOME, -6 + (k % 4) * 4, 7 + Math.floor(k / 4) * 3), n)),
      then: [
        { kind: 'civWork', squad: 1, building: 2 },
        { kind: 'civWork', squad: 2, building: 1 },
        { kind: 'civWork', squad: 3, building: 3 },
        { kind: 'civWork', squad: 5, building: 0 },
      ],
    },
  },
  {
    // M6k loot: the foe's trader (squad 0, team 1) raises its camp (building 0) by the east field, loads its handcart
    // (cart 0) there and drives it to the field's edge; a skirmish (squads 1, 2, both scripted) leaves loot piles; the
    // trader lets go of the cart and walks off, and your hoplites (3), smiths (4) and militia porters (5) come up.
    id: 'loot',
    name: 'Loot',
    goal: 'After the skirmish: pick up the loot piles (E on a pile), let the smith salvage gear, and capture the foe trader\'s handcart (stand beside it 5 s with none of theirs near), then load it.',
    squads: [{ team: 1, cls: 'civ_merchant', count: 2, x: LOOT_FOE[0] - 4, y: LOOT_FOE[1] + 5, owner: 'trader' }],
    camera: { x: LOOT[0] + 2, y: LOOT[1] + 2, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 1, x: LOOT_FOE[0], y: LOOT_FOE[1], r: 16 }],
      foeStock: { food: 40, coin: 400, bronze: 10, hides: 12 },
      sites: [{ squad: 0, type: 'camp', x: LOOT_FOE[0], y: LOOT_FOE[1] }],
      prebuild: 2500,
    },
    carts: [{ team: 1, owner: 'trader', type: 'handcart', x: LOOT_FOE[0] - 6, y: LOOT_FOE[1] + 5 }],
    after: {
      orders: [{ kind: 'crew', squad: 0, siege: 0 }, { kind: 'load', squad: 0, from: { building: 0 } }],
      settle: 300,
      squads: [
        { ...you('militia', at(LOOT, -8, -2)), bot: { kind: 'attackMove', x: LOOT[0] + 2, y: LOOT[1] } },
        bot('celt_sword', at(LOOT, 8, 2), { kind: 'attackMove', x: LOOT[0] - 2, y: LOOT[1] }),
        you('hoplite', at(LOOT, -30, 6)), you('civ_smith', at(LOOT, -30, 10), 2), you('militia', at(LOOT, -32, 2), 6),
      ],
      then: [{ kind: 'move', squad: 0, x: LOOT_CART[0], y: LOOT_CART[1] }],
      later: {
        settle: 900,
        orders: [{ kind: 'uncrew', squad: 0 }, { kind: 'move', squad: 0, x: LOOT_FOE[0] + 24, y: LOOT_FOE[1] + 16 }, ...[3, 4, 5].map((squad, i): Order => ({ kind: 'move', squad, x: LOOT[0] + 4, y: LOOT[1] + 2 + i * 3 }))],
      },
    },
  },
  {
    // M6k caravan: your camp (building 0) by the east road; three militia (squad 1: soldiers, civilians would flee) drive the wagon (cart 0), loads it at
    // the camp and takes the road east to the entry, hoplites and archers escorting it; foes wait on the ambush rect
    // over the road half way: raider bots (M6j) that go for the wagon if its escort is weak, else fight it in the rect.
    id: 'caravan',
    name: 'Caravan',
    goal: 'Get the loaded wagon down the east road to the entry. Foes wait in the ambush (red rect) over the road: the escort keeps round the wagon and takes them on; the wagon halts while foes are near.',
    squads: [you('militia', at(CARAVAN_HOME, -2, -6))],
    camera: { x: CARAVAN_HOME[0] + 10, y: CARAVAN_HOME[1] + 6, zoom: 1 / 2 },
    economy: {
      claims: [{ team: 0, x: CARAVAN_HOME[0], y: CARAVAN_HOME[1], r: 20 }],
      stock: { food: 60, coin: 600, bronze: 20, hides: 10, oil: 20 },
      sites: [{ squad: 0, type: 'camp', x: CARAVAN_HOME[0], y: CARAVAN_HOME[1] }],
      prebuild: 2500,
    },
    zones: { ambush: [CARAVAN_AMBUSH] },
    carts: [{ team: 0, owner: 'you', type: 'wagon', x: CARAVAN_HOME[0] + 6, y: CARAVAN_HOME[1] + 6 }],
    after: {
      orders: [],
      squads: [
        you('militia', at(CARAVAN_HOME, 4, 8), 3), you('hoplite', at(CARAVAN_HOME, 2, 11)), you('archer', at(CARAVAN_HOME, 8, 11)),
        ...(['celt_sword', 'javelineer'] as const).map((c, i) => bot(c, [CARAVAN_AMBUSH.x + 4 + i * 6, CARAVAN_AMBUSH.y + 4], { kind: 'raider', ...CARAVAN_AMBUSH }, 8)),
      ],
      then: [{ kind: 'crew', squad: 1, siege: 0 }, { kind: 'load', squad: 1, from: { building: 0 } }],
      later: { settle: 300, orders: [{ kind: 'move', squad: 1, x: S.entryE[0] - 6, y: S.entryE[1] }, { kind: 'escort', squad: 2, cart: 0 }, { kind: 'escort', squad: 3, cart: 0 }] },
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
