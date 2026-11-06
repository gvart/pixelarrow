/**
 * Town levels (src/war/sim/townLevel.ts) on real regions: towns grown round camps, forts and lone stores, walled with
 * rings of wood or stone that are whole, gapped, gated, too big (TOWN.area) or on the map's edge, with pieces of other
 * teams, pre-built, cancelled and unfinished ones among them. Each phase edits the grid (its closed wall tiles, gates,
 * decks) and the pieces, measures, and reads every query back.
 */
import { Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import { buildGrid, type Grid } from '../../war/sim/grid';
import { BUILDINGS, NEUTRAL_TEAM } from '../../war/sim/economy';
import { MOB_TEAM } from '../../war/sim/mobs';
import { TOWN, TOWN_LEVELS, createTownLevels, kindOf, levelOf, nextNeeds } from '../../war/sim/townLevel';
import type { Piece } from '../../war/sim/works';
import type { BuildingType, RegionData } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string): RegionData => parseRegion(regionFiles[`../../war/regions/${id}.json`]);

type P = { id: number; type: BuildingType; team: number; x: number; y: number; state: string; cancelled: boolean; pre: boolean; ti: number[] };
/** What the Godot side gets of a piece (TownPiece). */
const out = (b: P) => {
  const d = BUILDINGS[b.type];
  return {
    id: b.id, type: b.type, team: b.team, x: b.x, y: b.y, state: b.state, cancelled: b.cancelled, pre: b.pre, n: b.ti.length,
    def: { material: d.material, ...(d.workplace ? { workplace: d.workplace.kind } : {}), ...(d.wall ? { wall: d.wall } : {}), ...(d.access ? { access: d.access } : {}), ...(d.bridge ? { bridge: true } : {}), ...(d.store ? { store: true } : {}) },
  };
};

const OTHER: BuildingType[] = ['forge', 'forge2', 'cookhouse', 'infirmary3', 'workshop', 'stall2', 'sortingFloor', 'house', 'cottage', 'tent', 'temple', 'shrine',
  'stoa', 'statue', 'well', 'barracks', 'farm', 'olivePress', 'woodStairs', 'stoneStairs', 'woodBridge', 'brazier', 'ladder', 'stakes', 'ditch', 'towerBridge',
  'chest', 'warehouse', 'storehouse', 'outpost', 'pitchKiln', 'privateHouse', 'jetty'];

function townsOn(id: string, seed: number) {
  const region = load(id), grid: Grid = buildGrid(region), { w, h } = grid, rng = new Rng(seed);
  const pieces: P[] = [];
  let nextId = 1, edits: number[][] = [];
  const edit = (t: number, cost: number, gate: number, deck: number) => {
    grid.cost[t] = cost;
    grid.gate[t] = gate;
    grid.deck[t] = deck;
    edits.push([t, grid.cost[t], gate, deck]);
  };
  const add = (type: BuildingType, team: number, x: number, y: number, o: Partial<P> = {}): P => {
    const d = BUILDINGS[type], ti: number[] = [];
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
      const tx = Math.floor(x - d.w / 2) + dx, ty = Math.floor(y - d.h / 2) + dy;
      if (tx >= 0 && ty >= 0 && tx < w && ty < h) ti.push(ty * w + tx);
    }
    const b: P = { id: nextId++, type, team, x, y, state: 'done', cancelled: false, pre: false, ti, ...o };
    Object.defineProperty(b, 'def', { get: () => BUILDINGS[b.type] }); // what townLevel reads; left out of the vector
    pieces.push(b);
    if (b.state === 'done' || b.state === 'damaged') for (const t of ti) {
      if (d.wall === 'gate') edit(t, grid.cost[t] > 0 ? grid.cost[t] : 1, team + 1, 0);
      else if (type !== 'woodBridge') edit(t, 0, 0, 0);
    }
    return b;
  };
  /** A wall ring of radius r round (cx, cy): segments, a gate on one side, towers at the corners, `gaps` left open. */
  const ring = (team: number, cx: number, cy: number, r: number, stone: boolean, gaps: number) => {
    const seg: BuildingType = stone ? 'stoneWall' : rng.chance(0.5) ? 'palisade' : 'rampart';
    const x0 = Math.floor(cx) - r, y0 = Math.floor(cy) - r, x1 = Math.floor(cx) + r, y1 = Math.floor(cy) + r;
    const gx = Math.floor(cx);
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) {
      if (y === y1 && (x === gx || x === gx + 1)) continue;
      if (gaps > 0 && rng.chance(0.03)) { gaps--; continue; }
      add(seg, team, x + 0.5, y + 0.5);
    }
    for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) {
      if (gaps > 0 && rng.chance(0.03)) { gaps--; continue; }
      add(rng.chance(0.85) || stone ? seg : 'stoneWall', team, x + 0.5, y + 0.5);
    }
    add(stone ? 'stoneGate' : rng.chance(0.5) ? 'woodGate' : 'stoneGate', team, gx + 1, y1 + 0.5);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) if (rng.chance(0.6)) add(stone || rng.chance(0.3) ? 'stoneTower' : 'woodTower', team, x + 0.5, y + 0.5, { ti: [] });
  };
  const open = (): [number, number] => {
    for (let k = 0; k < 4000; k++) {
      const x = rng.int(40, w - 41), y = rng.int(40, h - 41);
      if (grid.cost[y * w + x] > 0) return [x + 0.5, y + 0.5];
    }
    return [w / 2, h / 2];
  };
  const tl = createTownLevels(grid, () => pieces as unknown as Piece[], MOB_TEAM);
  const phases: unknown[] = [];
  const [cx, cy] = open();
  const look = () => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 24; i++) pts.push([rng.int(-1, 4), cx + rng.range(-40, 40), cy + rng.range(-40, 40)]);
    for (const b of pieces.slice(0, 6)) pts.push([b.team, b.x, b.y]);
    const snaps = tl.snaps();
    return {
      snaps, levels: [-1, 0, 1, 2, 3, NEUTRAL_TEAM, MOB_TEAM].map((tm) => tl.level(tm)),
      at: pts.map(([tm, x, y]) => [tm, x, y, tl.townAt(tm, x, y), tl.perkAt(tm, x, y), tl.soulsAt(x, y)]),
      towns: [...snaps.map((s) => s.id), 0, 999].map((c) => [c, tl.town(c), tl.members(c)]),
    };
  };
  const phase = (ticks: number[]) => {
    for (const k of ticks) tl.tick(k);
    phases.push({ edits, pieces: pieces.map(out), ticks, ...look() });
    edits = [];
  };
  // a camp alone, then its first buildings (a few beyond TOWN.r, of other teams, unfinished, cancelled, pre-built)
  add('camp', 0, cx, cy);
  phase([0]);
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(3, 30), s = rng.next();
    add(OTHER[rng.int(0, OTHER.length - 1)], rng.chance(0.8) ? 0 : rng.pick([1, NEUTRAL_TEAM, MOB_TEAM, -1]), cx + Math.cos(a) * d, cy + Math.sin(a) * d,
      { state: s < 0.7 ? 'done' : s < 0.8 ? 'damaged' : s < 0.9 ? 'building' : 'destroyed', cancelled: rng.chance(0.05), pre: rng.chance(0.08) });
  }
  phase([7, 50]);
  // a ring: wood with gaps, then closed in stone round a second camp of the same team
  const r = rng.int(7, 12);
  ring(0, cx, cy, r, false, rng.int(0, 2));
  phase([100]);
  ring(0, cx, cy, r + 2, true, 0);
  for (let i = 0; i < 8; i++) add(OTHER[rng.int(0, 16)], 0, cx + rng.range(-r, r), cy + rng.range(-r, r), { state: 'done' });
  phase([149, 150]);
  // more towns: another camp of team 0 near, a fort of team 1, a lone store of team 2, a pre-built store of team 3
  const [ox, oy] = [cx + rng.range(20, 34) * (rng.chance(0.5) ? 1 : -1), cy + rng.range(-10, 10)];
  add(rng.chance(0.5) ? 'camp' : 'fort', 0, ox, oy);
  add('fort', 1, cx - 30, cy + 25);
  add('storehouse', 2, cx + 5, cy - 30);
  add('warehouse', 2, cx + 9, cy - 30);
  add('camp', 3, cx - 20, cy - 20, { pre: true });
  add('storehouse', NEUTRAL_TEAM, cx + 2, cy + 2);
  add('camp', MOB_TEAM, cx - 2, cy - 2);
  for (let i = 0; i < 16; i++) {
    const tm = rng.pick([0, 1, 2]), bx = tm === 0 ? ox : tm === 1 ? cx - 30 : cx + 5, by = tm === 0 ? oy : tm === 1 ? cy + 25 : cy - 30;
    add(OTHER[rng.int(0, OTHER.length - 1)], tm, bx + rng.range(-20, 20), by + rng.range(-20, 20));
  }
  ring(1, cx - 30, cy + 25, rng.int(8, 10), rng.chance(0.5), 0);
  phase([200]);
  // a ring too big to count as closed (TOWN.area), and a camp at the map's edge walled against it
  ring(2, cx + 5, cy - 30, 33, false, 0);
  const ex = rng.chance(0.5) ? 3.5 : w - 3.5;
  add('camp', 3, ex, cy);
  ring(3, ex, cy, 6, true, 0);
  phase([250]);
  // team 0's wooden walls burn down (their ground opens again) and it builds in stone: a city, if it has the kinds
  for (const b of pieces) if (b.team === 0 && BUILDINGS[b.type].wall && BUILDINGS[b.type].material === 'wood') {
    b.cancelled = true;
    for (const t of b.ti) edit(t, 1, 0, 0);
  }
  for (const type of ['forge3', 'house', 'temple', 'stall3', 'cookhouse3', 'stoa', 'well', 'statue'] as BuildingType[]) add(type, 0, cx + rng.range(-r, r), cy + rng.range(-r, r));
  phase([299, 300]);
  // a breach in the stone ring, and decks round the camp (the flood starts further out)
  const wall = pieces.find((b) => b.team === 0 && b.type === 'stoneWall' && !b.cancelled && b.y === Math.floor(cy) - r - 2 + 0.5 && b.x === Math.floor(cx) + 0.5); // the outer ring's top middle
  if (!wall) throw new Error(`no breach in ${id}`);
  if (wall) (wall.cancelled = true), wall.ti.forEach((t) => edit(t, 1, 0, 0));
  const t0 = Math.floor(cy) * w + Math.floor(cx);
  for (const o of [t0 + 3 * w, t0 + 3]) edit(o, grid.cost[o], grid.gate[o], 1);
  phase([350]);
  return { region: id, seed, phases };
}

export const vectors = () => {
  const r = new Rng(61), measures: unknown[] = [];
  for (let i = 0; i < 300; i++) {
    const m = { variety: r.int(0, 12), stone: r.chance(0.2) ? [0, 0.25, 0.4, 0.6, 0.25 - 5e-10, 0.4 - 2e-9][r.int(0, 5)] : r.next(), closed: r.chance(0.5), stoneWalls: r.chance(0.5) };
    const level = levelOf(m), t = { level: r.chance(0.2) ? r.int(-1, 6) : level, ...m };
    measures.push([m, level, t, nextNeeds(t)]);
  }
  return {
    town: TOWN, levels: TOWN_LEVELS.length,
    kinds: (Object.keys(BUILDINGS) as BuildingType[]).map((k) => [k, out({ id: 0, type: k, team: 0, x: 0, y: 0, state: 'done', cancelled: false, pre: false, ti: [] }).def, kindOf(k, BUILDINGS[k])]),
    measures,
    runs: [['dodona', 1], ['kyrene-e', 2], ['test-ridge', 3], ['skythia', 4], ['elaia-n', 5], ['dodona-s', 6]].map(([id, s]) => townsOn(id as string, s as number)),
  };
};
