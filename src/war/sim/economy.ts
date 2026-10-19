/**
 * Economy and building data for the war sim (docs/impl/global-war-rebuild.md W-12, W-22..W-24). One tile = 2 m.
 * Labour is in worker-seconds: a site needs `labour` seconds of one worker, so 20 workers finish it 20x faster.
 * Wall pieces (perTile) cost and take labour per tile of line.
 */
import type { BuildingType, ResourceKind } from '../types';

export interface BuildingDef {
  w: number; // footprint in tiles, before rotation (walls: 1 tile wide, length from the line)
  h: number;
  hp: number;
  cost: Partial<Record<ResourceKind, number>>;
  labour: number; // worker-seconds
  influence: number; // radius in tiles once done, 0 = none
  material: 'wood' | 'stone'; // for the fire rules (M2c)
  store?: boolean; // drop point for gatherers, source for builders
  wall?: 'segment' | 'tower' | 'gate'; // a piece of a wall line
  perTile?: boolean; // cost, labour and hp are per tile
  yields?: { res: ResourceKind; max: number; regrow: number; rate: number }; // a farm: a node once done
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  camp: { w: 3, h: 3, hp: 400, cost: {}, labour: 300, influence: 12, material: 'wood', store: true },
  storehouse: { w: 3, h: 3, hp: 600, cost: { wood: 60 }, labour: 900, influence: 0, material: 'wood', store: true },
  outpost: { w: 2, h: 2, hp: 600, cost: { wood: 40, stone: 30 }, labour: 1200, influence: 18, material: 'wood' },
  fort: { w: 6, h: 6, hp: 5000, cost: { stone: 400, wood: 150 }, labour: 24000, influence: 32, material: 'stone', store: true },
  barracks: { w: 4, h: 3, hp: 1200, cost: { wood: 120, stone: 40 }, labour: 3000, influence: 0, material: 'wood' },
  farm: { w: 4, h: 4, hp: 300, cost: { wood: 30 }, labour: 600, influence: 0, material: 'wood', yields: { res: 'food', max: 60, regrow: 0.5, rate: 1 } },
  olivePress: { w: 3, h: 3, hp: 700, cost: { wood: 30, stone: 60 }, labour: 1500, influence: 0, material: 'stone', yields: { res: 'food', max: 100, regrow: 0.8, rate: 1.2 } },
  palisade: { w: 1, h: 1, hp: 300, cost: { wood: 6 }, labour: 60, influence: 0, material: 'wood', wall: 'segment', perTile: true },
  stoneWall: { w: 1, h: 1, hp: 1500, cost: { stone: 15 }, labour: 300, influence: 0, material: 'stone', wall: 'segment', perTile: true },
  woodTower: { w: 2, h: 2, hp: 800, cost: { wood: 40 }, labour: 600, influence: 0, material: 'wood', wall: 'tower' },
  stoneTower: { w: 2, h: 2, hp: 2500, cost: { stone: 80 }, labour: 2400, influence: 0, material: 'stone', wall: 'tower' },
  woodGate: { w: 2, h: 1, hp: 600, cost: { wood: 30 }, labour: 400, influence: 0, material: 'wood', wall: 'gate' },
  stoneGate: { w: 2, h: 1, hp: 2500, cost: { stone: 60, wood: 20 }, labour: 1800, influence: 0, material: 'stone', wall: 'gate' },
};

/** Wall pieces by material. */
export const WALL_KIT = {
  wood: { segment: 'palisade', tower: 'woodTower', gate: 'woodGate' },
  stone: { segment: 'stoneWall', tower: 'stoneTower', gate: 'stoneGate' },
} as const satisfies Record<'wood' | 'stone', Record<'segment' | 'tower' | 'gate', BuildingType>>;

export const SEGMENT = 4; // wall line tiles per segment
export const CARRY = 10; // a worker's load
export const CLAIM_RADIUS = 20; // default influence of a claim anchor
export const WORK_DEFENCE = 1.5; // a gathering or building squad takes this much more damage and never blocks

export interface NodeDef { res: ResourceKind; max: number; regrow: number; rate: number; slots: number } // regrow, rate: per second

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
