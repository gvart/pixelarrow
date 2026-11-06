/**
 * Module vectors for the Godot port (docs/impl/godot-port.md P4..P6): inputs and the TS outputs per sim module, so each
 * GDScript module is checked on its own long before whole-scenario traces (./godotTraces.ts) can match.
 * Run through scripts/godot/traces.mjs (written to godot/tests/golden/vectors/<module>.json with exact floats,
 * ./godotJson.ts). Typed arrays go in as the sha256 of their little-endian bytes (`sha`, from the Node side).
 */
import { hashString, Rng } from '../sim/rng';
import { parseRegion } from '../war/region/schema';
import {
  buildGrid, canEnter, cartLand, DECK, findPath, flushSectors, LADDER, lineClear, lineCost, nearestLand, nearestOpen, pullPath,
  STAIR, stepCost, tileAt, walkClear, type Grid,
} from '../war/sim/grid';
import type { RegionData } from '../war/types';
import { afterArmour, blockChance, heightRange, hitChance, meleeHeight, missileHeight } from '../war/sim/combat';
import { formationOffsets, type Shape } from '../war/sim/formation';
import { createVision, sightOf, type Viewer } from '../war/sim/vision';
import type { BuildingSnap } from '../war/types';

type Sha = (bytes: Uint8Array) => string;
const regionFiles = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });

const SEEDS = [0, 1, 7, 42, 0x9e3779b9, 0xffffffff, 123456789];

function rng() {
  return {
    seeds: SEEDS.map((seed) => {
      const r = new Rng(seed), next = Array.from({ length: 64 }, () => r.next());
      const ints = Array.from({ length: 32 }, () => r.int(-5, 17));
      const ranges = Array.from({ length: 16 }, () => r.range(-2.5, 9));
      const chances = Array.from({ length: 16 }, () => r.chance(0.3));
      const picks = Array.from({ length: 16 }, () => r.pick(['a', 'b', 'c', 'd', 'e']));
      const weighted = Array.from({ length: 16 }, () => r.weighted([['x', 1], ['y', 3], ['z', 0.5]] as const));
      const shuffled = r.shuffle(Array.from({ length: 20 }, (_, i) => i));
      return { seed, state: r.state, next, ints, ranges, chances, picks, weighted, shuffled };
    }),
    hashes: ['', 'a', 'dodona:1:warlords', 'kyrene-e:42:boar:900:lord', 'Ελαία', 'emoji 🐗 boar'].map((s) => [s, hashString(s)]),
  };
}

/** Math.hypot and Math.round on awkward inputs: the GDScript JsMath must give the same doubles. */
function jsMath() {
  const r = new Rng(99), xs: number[] = [0, -0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 1e-300, 1e300, 3, 4, -7.25];
  for (let i = 0; i < 400; i++) xs.push(r.range(-1, 1) * 10 ** r.int(-8, 8));
  const pairs: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) pairs.push([xs[i], xs[(i * 7 + 3) % xs.length]]);
  // angles as the sim makes them (facings, atan2 of offsets), big ones for the argument reduction, and the edge cases
  const ang: number[] = [0, -0, Math.PI, -Math.PI, Math.PI / 2, 1e-9, 1e6, 1e22, -3e15];
  for (let i = 0; i < 1500; i++) ang.push(r.range(-8, 8));
  for (let i = 0; i < 200; i++) ang.push(r.range(-1, 1) * 10 ** r.int(0, 12));
  const ys = pairs.map(([a, b]) => [b * 3 - a, a]);
  const bases = Array.from({ length: 600 }, () => r.range(0, 50)), exps = [2, 0.5, 1.5, 3, -1, 0.75, 1 / 3, 10];
  return {
    hypot: pairs.map(([a, b]) => [a, b, Math.hypot(a, b)]), round: xs.map((x) => [x, Math.round(x)]),
    sin: ang.map((x) => [x, Math.sin(x)]), cos: ang.map((x) => [x, Math.cos(x)]), tan: ang.map((x) => [x, Math.tan(x)]),
    atan2: [...pairs, ...ys, [0, 0], [-0, -0], [0, -0], [1, 0], [-1, -0]].map(([y, x]) => [y, x, Math.atan2(y, x)]),
    log2: bases.map((x) => [x, Math.log2(x)]),
    pow: bases.flatMap((x, i) => [[x, exps[i % exps.length], x ** exps[i % exps.length]], [x - 25, 2, (x - 25) ** 2]]),
  };
}

const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
function gridDigest(g: Grid, sha: Sha) {
  const s = g.sectors;
  return {
    cost: sha(bytes(g.cost)), height: sha(bytes(g.height)), ground: sha(bytes(g.ground)), cartMul: sha(bytes(g.cartMul)),
    n: s.n, node: sha(bytes(s.node)), start: sha(bytes(s.start)), adj: sha(bytes(s.adj)), adjCost: sha(bytes(s.adjCost)),
    cx: sha(bytes(s.cx)), cy: sha(bytes(s.cy)),
  };
}

/** A found path as the sim pulls it (src/war/sim/index.ts): tile centres, the running cost, nothing kept. */
function pulled(g: Grid, tiles: number[]): number[] {
  const pts: number[] = [], cost: number[] = [], keep: boolean[] = [];
  let acc = 0;
  for (let k = 0; k < tiles.length; k++) {
    if (k) acc += stepCost(g, tiles[k - 1], tiles[k]) * ((tiles[k] % g.w !== tiles[k - 1] % g.w && ((tiles[k] / g.w) | 0) !== ((tiles[k - 1] / g.w) | 0)) ? Math.SQRT2 : 1);
    pts.push((tiles[k] % g.w) + 0.5, ((tiles[k] / g.w) | 0) + 0.5);
    cost.push(acc);
    keep.push(false);
  }
  return pullPath(g, pts, cost, keep, 0.3);
}

/** Open tiles picked by the rng (rejection sampling on cost > 0). */
function openTiles(g: Grid, r: Rng, n: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const i = r.int(0, g.w * g.h - 1);
    if (g.cost[i] > 0) out.push(i);
  }
  return out;
}

function gridOn(region: RegionData, sha: Sha) {
  const g = buildGrid(region), r = new Rng(hashString(region.id) || 1);
  const built = gridDigest(g, sha);
  const ends = openTiles(g, r, 80);
  const paths = [];
  for (let k = 0; k + 1 < ends.length; k += 2) {
    const p = findPath(g, ends[k], ends[k + 1]);
    paths.push({ a: ends[k], b: ends[k + 1], path: p, pulled: pulled(g, p) });
  }
  const lines = Array.from({ length: 60 }, () => {
    const x0 = r.range(0, g.w), y0 = r.range(0, g.h), x1 = Math.min(g.w - 0.01, Math.max(0, x0 + r.range(-25, 25))), y1 = Math.min(g.h - 0.01, Math.max(0, y0 + r.range(-25, 25)));
    return [x0, y0, x1, y1, lineClear(g, x0, y0, x1, y1), lineCost(g, x0, y0, x1, y1, 0.3), walkClear(g, x0, y0, x1, y1), tileAt(g, x0, y0)];
  });
  const opens = Array.from({ length: 20 }, () => { const x = r.int(0, g.w - 1), y = r.int(0, g.h - 1); return [x, y, nearestOpen(g, x, y)]; });
  const land = cartLand(g);
  const lands = Array.from({ length: 12 }, () => { const x = r.range(0, g.w), y = r.range(0, g.h); return [x, y, ...nearestLand(g, land, x, y)]; });
  // close a few 6x6 blocks (as a wall going up does), re-cut the sectors, search again
  const closed: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const t = ends[k * 7], x0 = Math.max(0, (t % g.w) - 3), y0 = Math.max(0, ((t / g.w) | 0) - 3);
    closed.push([x0, y0]);
    for (let y = y0; y < Math.min(g.h, y0 + 6); y++) for (let x = x0; x < Math.min(g.w, x0 + 6); x++) { g.cost[y * g.w + x] = 0; g.dirty.push(x, y); }
  }
  flushSectors(g);
  const after = gridDigest(g, sha);
  const again = [];
  for (let k = 0; k + 1 < 40; k += 2) again.push({ a: ends[k + 1], b: ends[k + 2], path: findPath(g, ends[k + 1], ends[k + 2]) });
  return { region: region.id, built, paths, lines, opens, land: sha(land), lands, closed, after, again };
}

/** A small hand-made grid with heights, decks, stairs, ladders, gates, bridge spans, trenches and narrow tiles. */
function synthetic(): RegionData {
  const w = 24, h = 16, n = w * h, height: number[] = [], terrain: RegionData['terrain'] = [], water: RegionData['water'] = [];
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    height.push(x >= 12 && x < 16 ? 2 : x >= 16 ? 1 : 0);
    terrain.push(y === 3 ? 'road' : x === 5 && y > 8 ? 'rock' : x < 3 && y < 4 ? 'forest' : y > 12 && x < 6 ? 'marsh' : 'grass');
    water.push(x >= 7 && x <= 9 && y >= 6 ? (x === 8 ? 2 : 1) : 0);
  }
  return { id: 'synthetic', name: 'synthetic', w, h, height, terrain, water, entries: [], noBuild: [] };
}

function gridModes(sha: Sha) {
  const g = buildGrid(synthetic()), w = g.w;
  for (let y = 2; y < 6; y++) { g.deck[y * w + 10] = DECK; g.deck[y * w + 11] = DECK; g.height[y * w + 10] = g.height[y * w + 11] = 2; }
  g.deck[6 * w + 10] = STAIR; g.height[6 * w + 10] = 1;
  g.deck[1 * w + 10] = LADDER;
  for (let x = 7; x <= 9; x++) { g.cost[10 * w + x] = 1; g.span[10 * w + x] = 1; g.narrow[10 * w + x] = x === 8 ? 1 : 0; }
  g.span[11 * w + 9] = g.span[9 * w + 7] = 1; g.cost[11 * w + 9] = g.cost[9 * w + 7] = 1;
  g.gate[3 * w + 6] = 1; g.gate[3 * w + 17] = 2;
  g.trench[12 * w + 2] = g.trench[12 * w + 3] = 1;
  for (let i = 0; i < w * g.h; i++) g.dirty.push(i % w, (i / w) | 0); // re-cut the sectors for the edited tiles
  flushSectors(g);
  const modes: { team: number; engine: boolean; cart: boolean }[] = [];
  for (const team of [-1, 0, 1]) for (const [engine, cart] of [[false, false], [true, false], [true, true]] as const) modes.push({ team, engine, cart });
  const out = modes.map((m) => {
    Object.assign(g, m);
    const enter: number[] = []; // canEnter for every tile into each of its 8 neighbours, as bits
    for (let i = 0; i < w * g.h; i++) {
      let bitsOf = 0;
      for (let k = 0; k < 8; k++) {
        const x = (i % w) + [1, -1, 0, 0, 1, 1, -1, -1][k], y = ((i / w) | 0) + [0, 0, 1, -1, 1, -1, 1, -1][k];
        if (x >= 0 && y >= 0 && x < w && y < g.h && canEnter(g, i, y * w + x)) bitsOf |= 1 << k;
      }
      enter.push(bitsOf);
    }
    const paths = [[0, 23 * 1 + w * 15], [w * 2 + 9, w * 14 + 20], [w * 12 + 0, w * 12 + 6], [w * 3 + 0, w * 3 + 23], [w * 10 + 6, w * 10 + 10]]
      .map(([a, b]) => findPath(g, a, b));
    return { ...m, enter, paths };
  });
  Object.assign(g, { team: -1, engine: false, cart: false });
  return { built: gridDigest(g, sha), modes: out };
}

function grid(sha: Sha) {
  const load = (id: string) => parseRegion(regionFiles[`../war/regions/${id}.json`]);
  return { regions: ['test-ridge', 'dodona'].map((id) => gridOn(load(id), sha)), synthetic: gridModes(sha) };
}

/** The pure combat and formation rules (src/war/sim/combat.ts, formation.ts) on a spread of inputs. */
function rules() {
  const r = new Rng(31);
  const dhs = [-20, -3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 4, 4.5, 5, 8, 9, 15, 30];
  const blocks = Array.from({ length: 400 }, (_, i) => {
    const a = [r.range(0, 0.9), r.range(-7, 7), r.range(-30, 30), r.range(-30, 30), r.chance(0.5), r.chance(0.5)] as const;
    const v = i < 4 ? [0.5, 0, 0, 0, false, false] as const : a; // dx = dy = 0: the `|| 1` fallback
    return [...v, blockChance(v[0], v[1], v[2], v[3], v[4], v[5])];
  });
  const hits = Array.from({ length: 200 }, () => {
    const a = [r.range(0, 1.2), r.range(0, 40), r.range(1, 30), r.chance(0.4)] as const;
    return [...a, hitChance(a[0], a[1], a[2], a[3])];
  });
  const armour = Array.from({ length: 200 }, () => { const a = [r.range(0, 80), r.range(0, 30), r.range(0, 1)]; return [...a, afterArmour(a[0], a[1], a[2])]; });
  const forms: unknown[] = [];
  for (const shape of ['line', 'column', 'wedge', 'loose'] as Shape[]) for (let n = 1; n <= 20; n++) forms.push([shape, n, n * 7 + 1, formationOffsets(shape, n, new Rng(n * 7 + 1))]);
  return { heights: dhs.map((d) => [d, meleeHeight(d), missileHeight(d), heightRange(d)]), blocks, hits, armour, forms };
}

/**
 * Fog of war (src/war/sim/vision.ts) on two regions: men of four teams (and mobs) wander, die and come back, buildings
 * rise, burn and fall, a wall goes up mid-run (the height poll), one team has W-61 extra sight. Every update records the
 * inputs (units as x, y, alive, team, sightOf) and, per team, its version, fog states and last-seen buildings.
 */
function visionOn(id: string, sha: Sha) {
  const region = parseRegion(regionFiles[`../war/regions/${id}.json`]), g = buildGrid(region), r = new Rng(hashString(id) + 5);
  const classes = ['militia', 'archer', 'scout', 'slinger', 'spearman'];
  const units: Viewer[] = Array.from({ length: 48 }, (_, i) => ({
    x: r.range(0, g.w), y: r.range(0, g.h), alive: true, cls: r.pick(classes), squad: { team: i % 9 === 8 ? 7 : i % 4 },
  }));
  const types = ['woodTower', 'outpost', 'barracks', 'brazier', 'palisade', 'ladder', 'fort', 'farm'] as const;
  const blds: BuildingSnap[] = types.map((type, i) => {
    const x = r.int(0, g.w - 3), y = r.int(0, g.h - 3);
    return { id: 100 + i, type, team: i % 3, x: x + 1, y: y + 1, tiles: [x, y, x + 1, y, x, y + 1, x + 1, y + 1], state: 'done', staffed: i !== 2, lit: true } as unknown as BuildingSnap;
  });
  const vision = createVision(g, { units: () => units, buildings: () => blds, sightAdd: (t) => (t === 1 ? 3 : 0) });
  const steps = [], wall: number[] = [];
  for (let t = 0; t <= 240; t++) {
    for (const u of units) {
      u.x = Math.min(g.w - 0.01, Math.max(0, u.x + r.range(-0.6, 0.6)));
      u.y = Math.min(g.h - 0.01, Math.max(0, u.y + r.range(-0.6, 0.6)));
      if (r.chance(0.004)) u.alive = !u.alive;
    }
    if (t === 60) (blds[1] as { burning?: number }).burning = 0.5;
    if (t === 120) blds[1].state = 'destroyed';
    if (t === 140) blds.splice(4, 1); // the palisade is pulled down
    if (t === 90) { // a 6x6 wall rises: the next height poll recomputes everything
      const x0 = (units[0].x | 0) - 3, y0 = (units[0].y | 0) - 3;
      wall.push(x0, y0);
      for (let y = Math.max(0, y0); y < Math.min(g.h, y0 + 6); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x0 + 6); x++) g.height[y * g.w + x] += 3;
    }
    if (t === 170) blds.push({ ...blds[0], id: 200, team: 3, x: units[5].x, y: units[5].y, tiles: [] });
    vision.tick(t);
    if (t % 4) continue;
    const teams = [0, 1, 2, 3].map((tm) => {
      const f = vision.teamGrid(tm);
      return [tm, f.version, sha(f.state), vision.lastSeen(tm).map((b) => b.id), units.slice(0, 6).map((u) => vision.visibleTo(tm, u.x, u.y))];
    });
    steps.push({
      t, units: units.flatMap((u) => [u.x, u.y, u.alive ? 1 : 0, u.squad.team, sightOf(u.cls)]),
      buildings: blds.map((b) => ({ ...b })), teams,
    });
  }
  return { region: id, wall, steps };
}

const vision = (sha: Sha) => ({ regions: ['test-ridge', 'dodona'].map((id) => visionOn(id, sha)) });

export const vectors = (sha: Sha): Record<string, unknown> => ({ rng: rng(), jsmath: jsMath(), grid: grid(sha), rules: rules(), vision: vision(sha) });
