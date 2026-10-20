/**
 * Economy and building data for the war sim (docs/impl/global-war-rebuild.md W-12, W-22..W-24). One tile = 2 m.
 * Labour is in worker-seconds: a site needs `labour` seconds of one worker, so 20 workers finish it 20x faster.
 * Wall pieces (perTile) cost and take labour per tile of line.
 */
import type { BuildingType, ResourceKind } from '../types';
import type { Workplace } from '../../data/recipes';
import { RARE_NODE, RARE_NODES } from '../../data/warLandmarks';

export interface BuildingDef {
  w: number; // footprint in tiles, before rotation (walls: 1 tile wide, length from the line)
  h: number;
  hp: number;
  cost: Partial<Record<ResourceKind, number>>;
  labour: number; // worker-seconds
  workers: number; // most workers at once (one per work slot round the footprint; a wall piece: per piece)
  influence: number; // radius in tiles once done, 0 = none
  material: 'wood' | 'stone'; // for the fire rules (M2c)
  store?: boolean; // drop point for gatherers, source for builders
  wall?: 'segment' | 'tower' | 'gate'; // a piece of a wall line
  perTile?: boolean; // cost, labour and hp are per tile
  yields?: { res: ResourceKind; max: number; regrow: number; rate: number }; // a farm: a node once done
  /** Wall tier (W-27): segments 1 palisade, 2 timber rampart, 3 stone wall; towers and gates 1 wood, 2 stone. */
  tier?: number;
  /** Walkway (segment) or platform (tower) height in levels above the ground once done; reached only by stairs, ladders or a door. */
  walk?: number;
  /** Tower platform (or ladder): most units on it at once. */
  cap?: number;
  /** Walls with a walkway are 2 tiles deep (W-28): the line plus an inner row. */
  depth?: 2;
  /** Access piece (W-28): stairs ramp up to a walkway wall's inside face; a ladder leans on any wall or tower. */
  access?: 'stairs' | 'ladder';
  /** Stone tower: a door with an inner stair up to its platform (its own team only). */
  door?: boolean;
  burnable?: boolean;
  /** M2d: a bridge piece (ramp or deck, perTile), laid out by placeBridge. */
  bridge?: boolean;
  /** `upgrade {building}`: the next tier, built in place (cost and labour per tile for wall segments). */
  upgrade?: { to: BuildingType; cost: Partial<Record<ResourceKind, number>>; labour: number };
  /** W-35: a brazier (see BRAZIER): placed done and lit, never blocks, may stand on the team's own deck. */
  brazier?: boolean;
  /** M5h3 field tile (FIELD): never closes; once done, men cross it at FIELD[kind].slow cost and engines not at all. */
  field?: 'stakes' | 'ditch';
  /** M5h: a workplace (docs/WAR.md "Workplaces"): its recipes' kind and its level (crafter slots, +1 grade a level). */
  workplace?: { kind: Workplace; level: number; spots?: readonly Spot[] };
  /** M6a: a chest: holds this many loads for its owner (never feeds crafting). */
  chest?: number;
  /** M7a: a pre-built piece type (./prebuilt.ts): only the region places it; a ruin of it is rebuilt in place. */
  prebuilt?: true;
  /** M7a: a holder anyone may loot (a town's goods cache; gone once empty). */
  cache?: number;
}

/**
 * A crafter's station inside a workplace: where he stands (x, y) and the point he faces (fx, fy: the anvil, hearth, bench
 * or counter of the level's art), in tiles from the footprint's north corner before rotation. The first `level` spots
 * are the crafter slots (a level without its own spots: along the front side, facing in); their tiles, and the tiles
 * from each straight out to the front (+x or +y) side, are open to the team's own men once the workplace is done.
 */
export type Spot = readonly [x: number, y: number, fx: number, fy: number];

/** Workplace chain levels: L1 (the placed building), L2 and L3 upgrade it in place. */
const wp = (kind: Workplace, level: number, d: Omit<BuildingDef, 'workplace' | 'workers' | 'influence'> & { workers?: number }, spots?: Spot[]): BuildingDef =>
  ({ workers: 4, influence: 0, ...d, workplace: { kind, level, ...(spots && { spots }) } });

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  camp: { w: 4, h: 4, hp: 400, cost: {}, labour: 300, workers: 6, influence: 12, material: 'wood', store: true },
  storehouse: { w: 3, h: 3, hp: 600, cost: { wood: 60 }, labour: 900, workers: 6, influence: 0, material: 'wood', store: true, upgrade: { to: 'sortingFloor', cost: { wood: 40, stone: 20 }, labour: 600 } },
  outpost: { w: 3, h: 3, hp: 600, cost: { wood: 40, stone: 30 }, labour: 1200, workers: 4, influence: 18, material: 'wood' },
  fort: { w: 10, h: 10, hp: 5000, cost: { stone: 400, wood: 150 }, labour: 24000, workers: 20, influence: 32, material: 'stone', store: true },
  barracks: { w: 4, h: 3, hp: 1200, cost: { wood: 120, stone: 40 }, labour: 3000, workers: 8, influence: 0, material: 'wood' },
  farm: { w: 4, h: 4, hp: 300, cost: { wood: 30 }, labour: 600, workers: 6, influence: 0, material: 'wood', yields: { res: 'food', max: 60, regrow: 0.5, rate: 1 } },
  olivePress: { w: 3, h: 3, hp: 700, cost: { wood: 30, stone: 60 }, labour: 1500, workers: 6, influence: 0, material: 'stone', yields: { res: 'food', max: 100, regrow: 0.8, rate: 1.2 }, workplace: { kind: 'press', level: 1 } }, // M5h: the Presser's oil
  palisade: { w: 1, h: 1, hp: 300, cost: { wood: 6 }, labour: 60, workers: 2, influence: 0, material: 'wood', wall: 'segment', perTile: true, tier: 1, burnable: true, upgrade: { to: 'rampart', cost: { wood: 8 }, labour: 100 } },
  rampart: { w: 1, h: 1, hp: 700, cost: { wood: 14 }, labour: 160, workers: 4, influence: 0, material: 'wood', wall: 'segment', perTile: true, tier: 2, walk: 2, depth: 2, burnable: true, upgrade: { to: 'stoneWall', cost: { stone: 15 }, labour: 300 } },
  stoneWall: { w: 1, h: 1, hp: 1500, cost: { stone: 15 }, labour: 300, workers: 4, influence: 0, material: 'stone', wall: 'segment', perTile: true, tier: 3, walk: 3, depth: 2 },
  woodTower: { w: 2, h: 2, hp: 800, cost: { wood: 40 }, labour: 600, workers: 4, influence: 0, material: 'wood', wall: 'tower', tier: 1, walk: 3, cap: 6, burnable: true, upgrade: { to: 'stoneTower', cost: { stone: 80 }, labour: 2000 } },
  stoneTower: { w: 2, h: 2, hp: 2500, cost: { stone: 80 }, labour: 2400, workers: 4, influence: 0, material: 'stone', wall: 'tower', tier: 2, walk: 4, cap: 9, door: true },
  woodStairs: { w: 1, h: 2, hp: 200, cost: { wood: 12 }, labour: 120, workers: 2, influence: 0, material: 'wood', access: 'stairs', burnable: true },
  stoneStairs: { w: 1, h: 3, hp: 900, cost: { stone: 24 }, labour: 450, workers: 2, influence: 0, material: 'stone', access: 'stairs' },
  ladder: { w: 1, h: 1, hp: 60, cost: {}, labour: 30, workers: 1, influence: 0, material: 'wood', access: 'ladder', cap: 1, burnable: true },
  woodGate: { w: 2, h: 1, hp: 600, cost: { wood: 30 }, labour: 400, workers: 3, influence: 0, material: 'wood', wall: 'gate', tier: 1, burnable: true, upgrade: { to: 'stoneGate', cost: { stone: 60 }, labour: 1500 } },
  stoneGate: { w: 2, h: 1, hp: 2500, cost: { stone: 60, wood: 20 }, labour: 1800, workers: 3, influence: 0, material: 'stone', wall: 'gate', tier: 2 },
  // W-24: wood fast and burnable, stone slow and permanent (fire-proof; only a stone thrower brings it down)
  woodBridge: { w: 1, h: 1, hp: 150, cost: { wood: 6 }, labour: 15, workers: 3, influence: 0, material: 'wood', perTile: true, burnable: true, bridge: true },
  stoneBridge: { w: 1, h: 1, hp: 1500, cost: { stone: 16, wood: 2 }, labour: 90, workers: 3, influence: 0, material: 'stone', perTile: true, bridge: true },
  // W-35 fire arrows: a brazier lights them, pitch (from a kiln, or a little with pine wood) feeds them
  brazier: { w: 1, h: 1, hp: 60, cost: { wood: 5 }, labour: 0, workers: 0, influence: 0, material: 'wood', brazier: true },
  // M5h3: a docked siege tower's bridge; Fortifier field tiles
  towerBridge: { w: 1, h: 1, hp: 400, cost: {}, labour: 1, workers: 1, influence: 0, material: 'wood', access: 'ladder', cap: 8, burnable: true },
  stakes: { w: 1, h: 1, hp: 80, cost: { wood: 3 }, labour: 20, workers: 2, influence: 0, material: 'wood', burnable: true, field: 'stakes' },
  ditch: { w: 1, h: 1, hp: 60, cost: {}, labour: 120, workers: 2, influence: 0, material: 'stone', field: 'ditch' },
  pitchKiln: { w: 2, h: 2, hp: 500, cost: { wood: 40, stone: 20 }, labour: 900, workers: 4, influence: 0, material: 'stone', yields: { res: 'pitch', max: 40, regrow: 0.1, rate: 0.6 } },
  // M5h workplaces: L1 placed, L2 / L3 by upgrade (cost and labour of the step); each level a crafter slot and +1 grade
  forge: wp('forge', 1, { w: 3, h: 3, hp: 1200, cost: { wood: 40, stone: 60 }, labour: 1500, material: 'stone', upgrade: { to: 'forge2', cost: { stone: 80, iron: 10 }, labour: 1500 } }, [[1.5, 1.5, 1.5, 0.6]]),
  forge2: wp('forge', 2, { w: 3, h: 3, hp: 1800, cost: { stone: 80, iron: 10 }, labour: 1500, material: 'stone', upgrade: { to: 'forge3', cost: { stone: 120, bronze: 20, marble: 10 }, labour: 2000 } }, [[1.7, 1.5, 1.6, 0.5], [1.1, 1.3, 0.9, 0.4]]),
  forge3: wp('forge', 3, { w: 3, h: 3, hp: 2400, cost: { stone: 120, bronze: 20, marble: 10 }, labour: 2000, material: 'stone' }, [[1.6, 1.4, 1.2, 0.5], [1.0, 1.8, 0.4, 0.9], [2.3, 1.1, 2.6, 0.3]]),
  cookhouse: wp('cookhouse', 1, { w: 3, h: 2, hp: 600, cost: { wood: 50, stone: 20 }, labour: 900, material: 'wood', burnable: true, upgrade: { to: 'cookhouse2', cost: { stone: 40 }, labour: 900 } }, [[1.6, 1.6, 1.6, 0.7]]),
  cookhouse2: wp('cookhouse', 2, { w: 3, h: 2, hp: 1000, cost: { stone: 40 }, labour: 900, material: 'stone', upgrade: { to: 'cookhouse3', cost: { stone: 60, bronze: 10 }, labour: 1200 } }, [[2.3, 1.1, 2.0, 0.1], [1.6, 1.6, 1.1, 1.0]]),
  cookhouse3: wp('cookhouse', 3, { w: 3, h: 2, hp: 1400, cost: { stone: 60, bronze: 10 }, labour: 1200, material: 'stone' }, [[1.4, 1.6, 1.3, 0.9], [2.4, 1.5, 2.3, 0.7], [0.5, 1.5, 0.5, 0.6]]),
  infirmary: wp('infirmary', 1, { w: 3, h: 3, hp: 800, cost: { wood: 60, stone: 30 }, labour: 1200, material: 'wood', burnable: true, upgrade: { to: 'infirmary2', cost: { wood: 30, herbs: 10 }, labour: 900 } }),
  infirmary2: wp('infirmary', 2, { w: 3, h: 3, hp: 1000, cost: { wood: 30, herbs: 10 }, labour: 900, material: 'wood', burnable: true, upgrade: { to: 'infirmary3', cost: { stone: 80, marble: 10 }, labour: 1500 } }),
  infirmary3: wp('infirmary', 3, { w: 3, h: 3, hp: 1600, cost: { stone: 80, marble: 10 }, labour: 1500, material: 'stone' }),
  workshop: wp('workshop', 1, { w: 4, h: 3, hp: 900, cost: { wood: 80, stone: 20 }, labour: 1200, workers: 6, material: 'wood', burnable: true, upgrade: { to: 'workshop2', cost: { wood: 60, bronze: 10 }, labour: 1200 } }),
  workshop2: wp('workshop', 2, { w: 4, h: 3, hp: 1200, cost: { wood: 60, bronze: 10 }, labour: 1200, workers: 6, material: 'wood', burnable: true, upgrade: { to: 'workshop3', cost: { wood: 100, iron: 20 }, labour: 1500 } }),
  workshop3: wp('workshop', 3, { w: 4, h: 3, hp: 1500, cost: { wood: 100, iron: 20 }, labour: 1500, workers: 6, material: 'wood', burnable: true }),
  stall: wp('stall', 1, { w: 2, h: 2, hp: 300, cost: { wood: 30 }, labour: 400, workers: 2, material: 'wood', burnable: true, upgrade: { to: 'stall2', cost: { stone: 60 }, labour: 900 } }),
  stall2: wp('stall', 2, { w: 2, h: 2, hp: 800, cost: { stone: 60 }, labour: 900, workers: 2, material: 'stone', upgrade: { to: 'stall3', cost: { marble: 20, silver: 10 }, labour: 1200 } }),
  stall3: wp('stall', 3, { w: 2, h: 2, hp: 1000, cost: { marble: 20, silver: 10 }, labour: 1200, workers: 2, material: 'stone' }),
  // the sorting floor is a storehouse upgraded in place (still a store); L2 adds the tannery
  sortingFloor: wp('sorting', 1, { w: 3, h: 3, hp: 700, cost: { wood: 40, stone: 20 }, labour: 600, workers: 6, material: 'wood', store: true, upgrade: { to: 'sortingFloor2', cost: { wood: 40, salt: 10 }, labour: 600 } }),
  sortingFloor2: wp('sorting', 2, { w: 3, h: 3, hp: 800, cost: { wood: 40, salt: 10 }, labour: 600, workers: 6, material: 'wood', store: true }),
  // M6a: a player's chest (docs/WAR.md "Goods live in places")
  chest: { w: 1, h: 1, hp: 150, cost: { wood: 10 }, labour: 60, workers: 2, influence: 0, material: 'wood', burnable: true, chest: 8 },
  // M7a pre-built pieces (docs/WAR.md "Pre-built structures"; functions in ./prebuilt.ts PREBUILT); cost and labour price a rebuild and repairs
  house: { w: 3, h: 3, hp: 900, cost: { stone: 60, wood: 20 }, labour: 1500, workers: 6, influence: 0, material: 'stone', prebuilt: true },
  cottage: { w: 3, h: 2, hp: 400, cost: { wood: 40 }, labour: 600, workers: 4, influence: 0, material: 'wood', burnable: true, prebuilt: true },
  tent: { w: 2, h: 2, hp: 150, cost: { wood: 6, hides: 4 }, labour: 200, workers: 2, influence: 0, material: 'wood', burnable: true, prebuilt: true },
  temple: { w: 4, h: 4, hp: 3000, cost: { stone: 200, marble: 60 }, labour: 8000, workers: 8, influence: 0, material: 'stone', prebuilt: true },
  shrine: { w: 2, h: 2, hp: 800, cost: { stone: 40, marble: 10 }, labour: 1200, workers: 4, influence: 0, material: 'stone', prebuilt: true },
  stoa: { w: 2, h: 6, hp: 2000, cost: { stone: 150, wood: 30 }, labour: 4000, workers: 8, influence: 0, material: 'stone', store: true, prebuilt: true },
  statue: { w: 1, h: 1, hp: 400, cost: { marble: 10 }, labour: 600, workers: 2, influence: 0, material: 'stone', prebuilt: true },
  well: { w: 1, h: 1, hp: 800, cost: { stone: 20 }, labour: 400, workers: 2, influence: 0, material: 'stone', prebuilt: true },
  jetty: { w: 1, h: 4, hp: 300, cost: { wood: 30 }, labour: 500, workers: 3, influence: 0, material: 'wood', burnable: true, prebuilt: true, yields: { res: 'food', max: 40, regrow: 0.2, rate: 0.8 } },
  warehouse: { w: 3, h: 2, hp: 1200, cost: { stone: 80, wood: 40 }, labour: 2000, workers: 6, influence: 0, material: 'stone', store: true, prebuilt: true },
  board: { w: 1, h: 1, hp: 150, cost: { wood: 10 }, labour: 60, workers: 2, influence: 0, material: 'wood', burnable: true, prebuilt: true },
  cache: { w: 1, h: 1, hp: 100, cost: { wood: 5 }, labour: 30, workers: 2, influence: 0, material: 'wood', prebuilt: true, cache: 2 },
};

/** M7a: the team of the neutral regions' pre-built pieces (mobs never attack it, nobody uses it; its gates stand open). */
export const NEUTRAL_TEAM = 6;
/**
 * M7a ruins and repairs (docs/WAR.md "Pre-built structures"): a ruin's footprint costs `slow` x to cross; it drops `spill`
 * of its goods as a pile; a rebuild costs `rebuild` of the cost and labour. repair: every `step` of max hp costs `cost` of
 * the build cost (from the network) and `labour` of its labour.
 */
export const RUIN = { slow: 2, spill: 0.5, rebuild: 0.75 };
export const REPAIR = { step: 0.1, cost: 0.05, labour: 0.05 };

/** M6a chests: most a player places in a region; an enemy loots one only with no unit of its owner within `guard` tiles. */
export const CHEST = { cap: 4, guard: 10 };

/**
 * W-35 braziers: archers within `radius` tiles (3 tiles = 6 m) of a lit brazier of their team loose fire arrows, each
 * taking `pitch` from the stockpile (a volley of 10 archers: 2 pitch). A brazier burns `life` seconds once placed.
 */
export const BRAZIER = { radius: 3, pitch: 0.2, life: 300 };
/** M5h3 field tiles: move cost multiplier for men; stakes: hp a second a foe man standing on them loses. */
export const FIELD = { stakes: { slow: 2, dmg: 6 }, ditch: { slow: 3, dmg: 0 } };
/**
 * W-35 pitch kiln: its pitch node regrows (yields.regrow per second) only while the team's stockpile has `wood` per pitch
 * to feed it; each pine with wood left within `pineR` tiles adds `pineBoost` to its rate, at most `pineMax` pines.
 * Gatherers felling a pine also bring back `fromPine` pitch per wood.
 */
export const KILN = { wood: 2, pineR: 8, pineBoost: 0.15, pineMax: 6, fromPine: 0.05 };
/** Resinous trees (object ids) for KILN: pines and firs. */
export const PINES = new Set(['pine-a', 'pine-b', 'stone-pine', 'elaia/stone-pine', 'mountains/fir', 'mountains/fir-snow', 'mountains/black-pine']);

/**
 * Bridges (M2d W-24, v2 W-33): most tiles of water bank to bank per material, widths in tiles across (default `width`),
 * rows along the line per deck piece, bank rows per ramp (a gentle slope up to the deck), move cost on a deck.
 */
export const BRIDGE = { maxSpan: { wood: 12, stone: 24 }, widths: [1, 2, 3], width: 2, piece: 2, ramp: 2, cost: 0.8, kit: { wood: 'woodBridge', stone: 'stoneBridge' } as const };

/** Wall pieces by material. */
export const WALL_KIT = {
  wood: { segment: 'palisade', tower: 'woodTower', gate: 'woodGate' },
  timber: { segment: 'rampart', tower: 'woodTower', gate: 'woodGate' },
  stone: { segment: 'stoneWall', tower: 'stoneTower', gate: 'stoneGate' },
} as const satisfies Record<'wood' | 'timber' | 'stone', Record<'segment' | 'tower' | 'gate', BuildingType>>;

export const SEGMENT = 4; // wall line tiles per segment
export const CARRY = 10; // a worker's load
export const CLAIM_RADIUS = 20; // default influence of a claim anchor
/** cancelSite: share of the materials already delivered that goes back to the stockpile (loads still on the way: all). */
export const CANCEL_REFUND = 0.75;
export const WORK_DEFENCE = 1.5; // a gathering or building squad takes this much more damage and never blocks

/** regrow, rate: per second; rare (M7e): a landmark's rare-good node (no depth yield; only the region's holder gathers it). */
export interface NodeDef { res: ResourceKind; max: number; regrow: number; rate: number; slots: number; rare?: true }

const tree: NodeDef = { res: 'wood', max: 40, regrow: 0, rate: 1, slots: 2 };
const olive: NodeDef = { res: 'food', max: 20, regrow: 0.05, rate: 0.8, slots: 2 };
const boulder: NodeDef = { res: 'stone', max: 120, regrow: 0, rate: 0.6, slots: 4 };
const marble: NodeDef = { res: 'marble', max: 300, regrow: 0, rate: 0.4, slots: 4 };
const ore = (res: ResourceKind): NodeDef => ({ res, max: 300, regrow: 0, rate: 0.4, slots: 4 });

/** Map objects that are resource nodes, by id (biome objects as `<biome>/<id>`). Others are scenery. */
export const RESOURCE_NODES: Record<string, NodeDef> = {
  'pine-a': tree, 'pine-b': tree, 'stone-pine': tree, cypress: tree, oak: tree, 'dead-tree': { ...tree, max: 20 },
  'olive-a': olive, 'olive-b': olive,
  'boulder-a': boulder, 'boulder-b': boulder, outcrop: boulder,
  'elaia/olive-ancient': olive, 'elaia/olive-orchard': olive, 'elaia/olive-tall': olive,
  'elaia/cypress-tall': tree, 'elaia/cypress-flame': tree, 'elaia/stone-pine': tree, 'elaia/holm-oak': tree,
  'elaia/vines': { ...olive, max: 15 },
  'elaia/olive-harvest': { res: 'food', max: 60, regrow: 0.1, rate: 1, slots: 4 },
  'elaia/marble-outcrop-a': marble, 'elaia/marble-outcrop-b': marble, 'elaia/marble-quarry': { ...marble, max: 800 }, 'elaia/marble-deposit': marble,
  'kyrene/date-palm-fruit': olive, 'kyrene/date-palm-tall': tree, 'kyrene/date-palm-mid': tree, 'kyrene/doum-palm': tree,
  'kyrene/acacia': tree, 'kyrene/acacia-old': tree, 'kyrene/tamarisk': tree,
  'kyrene/boulder-red': boulder, 'kyrene/rocks-red': boulder, 'kyrene/copper-ore': ore('copper'),
  'mountains/fir': tree, 'mountains/fir-snow': tree, 'mountains/black-pine': tree,
  'mountains/boulder-field': boulder, 'mountains/iron-ore': ore('iron'), 'mountains/tin-ore': ore('tin'),
  // M7e: the landmarks' rare-good nodes (src/data/warLandmarks.ts)
  ...Object.fromEntries(Object.entries(RARE_NODES).map(([id, n]) => [id, { res: n.res, max: RARE_NODE.max, regrow: n.once ? 0 : RARE_NODE.regrow, rate: RARE_NODE.rate, slots: RARE_NODE.slots, rare: true as const }])),
};

/** Footprint (w, h) of a building after rotation. */
export function rotated(type: BuildingType, rot: 0 | 1): [number, number] {
  const d = BUILDINGS[type];
  return rot ? [d.h, d.w] : [d.w, d.h];
}

/** Tiles (flat x,y) of a w x h footprint centred on (x, y), snapped to whole tiles. */
export function rectTiles(x: number, y: number, w: number, h: number): number[] {
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2), out: number[] = [];
  for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) out.push(tx, ty);
  return out;
}

/**
 * Tiles (flat x,y) of a polyline (flat x,y points), 4-connected so no diagonal gap lets a unit slip through,
 * without repeats.
 */
export function lineTiles(points: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (x: number, y: number) => {
    const k = y * 65536 + x;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(x, y);
  };
  for (let i = 0; i + 1 < points.length; i += 2) {
    let x = Math.floor(points[i]), y = Math.floor(points[i + 1]);
    push(x, y);
    if (i + 3 >= points.length) break;
    const x1 = Math.floor(points[i + 2]), y1 = Math.floor(points[i + 3]);
    const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), sx = Math.sign(x1 - x), sy = Math.sign(y1 - y);
    // walk the grid: each step moves along x or y (never both), whichever keeps nearer the line
    for (let ix = 0, iy = 0; ix < dx || iy < dy; ) {
      if ((0.5 + ix) / dx < (0.5 + iy) / dy) (x += sx), ix++;
      else (y += sy), iy++;
      push(x, y);
    }
  }
  return out;
}
