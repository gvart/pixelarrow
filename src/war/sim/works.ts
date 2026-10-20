/**
 * Economy and construction state of the war sim (M2a, docs/impl/global-war-rebuild.md W-12, W-22..W-24): resource
 * nodes, team stockpiles, building sites, influence, and what each gathering or building unit does this tick.
 *
 * Gather: a worker walks to its node, harvests up to CARRY, carries the load to the nearest own store (camp,
 * storehouse, fort) and goes back; an empty node sends it to the nearest node of the same resource with a free slot.
 * Build: a worker takes what the site still lacks from the nearest store (the team stockpile), carries it to the site,
 * and labours once there is nothing to fetch. Labour never runs ahead of the materials delivered. Each site has work slots,
 * open tiles round its footprint spread evenly (at most def.workers): a worker holds one slot, carries to it and labours
 * there; with no slot free it waits a little off the site. A site needs no workers to exist (planned), any squad of its
 * team may take it up, and cancel() removes an unfinished one with a refund. The footprint
 * blocks from the first labour (scaffold); a finished gate opens again for its owner team only (grid.gate).
 * Influence: done buildings with a radius and claim anchors paint bit `team` of the mask.
 *
 * Wall tiers and wall-walks (W-27, W-28): `upgrade` turns a done wall piece into a site for its next tier in place (prev
 * keeps what stands: the old piece blocks, its walkway stays open, cancel restores it; palisade -> rampart grows the inner
 * row, walls with a walkway being 2 tiles deep). A done piece with def.walk opens its footprint as a deck (grid.deck)
 * raised walk levels over its ground. Nothing reaches a deck but placed access pieces: stairs (a ramp against the inside
 * face of a walkway wall), ladders (beside any wall or tower, slow, one man at a time) and a stone tower's own door.
 * Inside: the wall order's `inside` point, else the centre of the team's claims and influence buildings.
 *
 * Siege (M2c, W-29): fire and breaches. A burnable piece set alight (kindle: torches; fireHit: fire arrows) burns at an
 * intensity that grows to 1, losing up to maxHp / FIRE.life per second, and every second may catch each burnable piece
 * beside it (chance FIRE.spread x intensity); men beat it out (douse) slowly; stone never burns. A wall, gate or tower
 * brought to 0 hp lies as rubble: its deck goes, its tiles open at ground level at FIRE.rubble cost. A siege ladder raised
 * against a foe walkway is a ladder building of the attackers' team, done at once (raiseLadder); defenders push it off.
 *
 * Bridges (M2d, W-24, types.ts BridgeOrder): ramps on both banks and 2 x 2 deck pieces over the water. A deck piece is
 * ready for workers once a neighbour piece along the line is done (from either bank inwards); workers stand on the done
 * deck (a done bridge tile is standable though a building holds it). A done piece opens its tiles at the deck level (the
 * higher bank) at BRIDGE.cost; unbuilt water stays closed. A piece brought to 0 hp (fire, stone throwers) collapses: its
 * tiles go back to water and `fall` drops the men on them.
 */
import type { BridgeAxis, BridgeOrder, BridgePlan, BuildingSnap, BuildingType, BuildState, InfluenceMap, NodeSnap, PlaceReason, PlaceResult, RegionData, ResourceKind, WallOrder, WallPlan } from '../types';
import { BRAZIER, BRIDGE, BUILDINGS, CHEST, FIELD, KILN, PINES, CANCEL_REFUND, CARRY, CLAIM_RADIUS, lineTiles, rectTiles, RESOURCE_NODES, rotated, SEGMENT, WALL_KIT, type BuildingDef, type Spot } from './economy';
import { DECK, LADDER, lineClear, STAIR, tileAt, type Grid } from './grid';
import { amount, empty, newHold, put, take, takeFrom, totals, type Cost, type Hold } from './holders';

const DT = 0.1;
/** Bridge line steps by octant of the drag angle (+x first, turning towards +y). */
const STEPS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const NEAR_NODE = 15; // an empty node's workers look this far for another of the same resource
const AT = 1.6; // a worker this near a footprint tile centre (or a node) is there
const WORK_PATHS = 6; // worker A* searches per tick
const REGROW_TICKS = 10;
const AT_SLOT = 0.3; // a worker this near its work slot is there
const WAIT_OFF = 2.5; // workers with no free slot wait this far off the footprint edge
const REPATH_NEAR = 6; // a site closing re-paths the workers headed this near its footprint
const LADDER_COST = 4; // move cost multiplier on a ladder (a slow climb)
const DOOR_COST = 2; // ... through a stone tower's door and inner stair
const DETOUR = 3, DETOUR_PAD = 16; // a builder's way to its slot longer than DETOUR x straight + pad tiles: left to others
/** Fire, ladder and breach rules (M2c). */
export const FIRE = {
  start: 0.25, // intensity when it catches
  grow: 0.02, // intensity per second while it burns
  life: 120, // seconds a piece burning at full intensity lasts from full hp
  spread: 0.06, // chance per second x intensity to catch each burnable piece beside it (from intensity spreadMin)
  spreadMin: 0.4,
  kindle: 3, // torch-seconds to set a piece alight
  douse: 0.025, // intensity per second each man beating it out takes off
  push: 4, // man-seconds to push a ladder off
  rubble: 3, // move cost multiplier over rubble
};
/** M5h3 Fortifier works: iron-bound gate (hp x`iron`), wet hides (catch chance x`wet` for `wetTicks`), their costs. */
export const FORT = { iron: 1.5, ironCost: { iron: 10, charcoal: 10 }, wet: 0.5, wetTicks: 6000, wetCost: 1 };

export interface WorkSquad { team: number; sites: number[]; node: number }
/** The part of a sim unit the works drive. */
export interface Worker {
  id: number; x: number; y: number; facing: number; alive: boolean;
  squad: WorkSquad;
  job: 'gather' | 'build' | null;
  carry: ResourceKind | null; load: number;
  wnode: number; // node it harvests, -1 none
  wsite: number; // site it builds, -1 none
  wslot: number; // its work slot at wsite (index into the site's slots), -1 none
  wfor: number; // site its load is reserved for, -1 none
  working: boolean; // harvesting or labouring this tick
  wgx: number; wgy: number; // where it walks
  wpath: number[]; wpi: number; wreq: boolean;
  /** M5h forager nodes: yield multiplier by resource at delivery; herbs from forest and marsh nodes, flax from farms. */
  gmul?: Partial<Record<ResourceKind, number>>; herbs?: boolean; flax?: boolean;
  /** M5f: gather and build speed over a soldier's (forager, engineer; undefined 1). */
  wrate?: number; brate?: number;
}

interface Node { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; regrow: number; rate: number; slots: number; users: number; tiles: number[]; obj?: number; building?: number; locked?: boolean;
  /** W-35 pitch kiln: its team (regrowth burns that team's wood). */
  kiln?: number }

interface Building {
  id: number; type: BuildingType; def: BuildingDef; team: number; rot: 0 | 1; x: number; y: number; w: number; h: number;
  tiles: number[]; // flat tile x,y
  ti: number[]; // tile indices
  state: BuildState; labour: number; need: number;
  cost: Partial<Record<ResourceKind, number>>; delivered: Partial<Record<ResourceKind, number>>; incoming: Partial<Record<ResourceKind, number>>;
  costSum: number; hp: number; maxHp: number; saved: number[]; // grid cost of its tiles before they closed
  users: number; node: number;
  slots: number[]; // work slots: tile indices round the footprint
  slotUser: number[]; // worker id per slot, -1 free
  cancelled: boolean; // cancel(): gone from the snapshot
  base: number[]; // ground height of each footprint tile
  inside: [number, number]; // a point on its inside (stairs and a tower door face it)
  decked: boolean; // its raised layer is open (deck, ramp or ladder)
  attach: number; // stairs, ladder: the wall or tower they lean on, -1 none
  door: number; // stone tower: its door tile, -1 none
  /** Upgrade under way: what stood before (restored by cancel); n: footprint tiles before the upgrade grew it. */
  prev: { type: BuildingType; def: BuildingDef; maxHp: number; hp: number; need: number; cost: Partial<Record<ResourceKind, number>>; costSum: number; delivered: Partial<Record<ResourceKind, number>>; n: number } | null;
  burn: number; // fire intensity, 0 not burning
  kindle: number; // torch-seconds put into it
  rubble: boolean;
  siege: number; // a ladder raised by this siege engine, -1
  push: number; // defenders' push on a ladder, 0..1
  /** M2d bridge piece: the pieces of its bridge in line order, its index, axis, part, deck level. */
  bridge: { ids: number[]; i: number; axis: BridgeAxis; dir: [number, number]; width: number; part: 'end0' | 'end1' | 'deck'; deck: number; rows: number[] } | null;
  /** W-35 brazier: seconds of fire left (0: out). */
  fuel: number;
  /** M5h3: an iron-bound gate; wet hides on it until this tick (0 none). */
  iron: boolean; wet: number;
  /** M6a: a store's or chest's contents (null: holds nothing); the player who placed it (chests: owner-only), '' none. */
  hold: Hold | null; owner: string;
}
export type Piece = Readonly<Building>;

export type Act = [number, number] | null | 'here';

/** M5h: terrain a Herb Finder finds herbs on, and his share of the load as herbs; a Weaver's share of a farm load as flax. */
const FORAGE_TERRAIN = new Set(['forest', 'marsh']);
const FORAGE_SHARE = { herbs: 0.2, flax: 0.25 };

/** M6: what the works hand back to the sim: a holder building gone (its contents to a loot pile; burnt: fire spoils half). */
export interface WorksHooks { spill?(x: number, y: number, hold: Hold, burnt: boolean): void }

export function createWorks(grid: Grid, region: RegionData, path: (team: number, x0: number, y0: number, x1: number, y1: number) => number[], evict: (tiles: number[]) => void, chance: (p: number) => boolean = () => false, fall: (tiles: number[]) => void = () => {}, hooks: WorksHooks = {}) {
  const { w, h } = grid;
  const nodes: Node[] = [];
  const nodeAt = new Int32Array(w * h).fill(-1); // foot tile -> object node (blocks placement while it has any left)
  const regrowing: Node[] = [];
  const buildings: Building[] = [];
  const braziers: Building[] = []; // W-35: not in occ (they never block and may stand on a deck)
  const occ = new Int32Array(w * h).fill(-1); // tile -> building that stands or is marked out there
  const noBuild = new Uint8Array(w * h);
  for (const r of region.noBuild) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) noBuild[y * w + x] = 1;
  // M6d: no building in a safe zone (rented sites: M6f)
  for (const r of region.safe ?? []) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) noBuild[y * w + x] = 1;
  /** M6a: each team's home strongroom (server-fed: addStock), drawn by every network of the team (docs/WAR.md "Goods live in places"). */
  const reserve = new Map<number, Hold>();
  const storeList: Building[] = []; // every store building ever placed (done ones hold goods)
  const claims: { team: number; x: number; y: number; r: number }[] = [];
  const infl: InfluenceMap = { w, h, mask: new Uint8Array(w * h), version: 0 };
  const pathQueue: Worker[] = [];
  const waits = new Map<number, [number, number, number]>(); // worker id -> [site, x, y]: where it waits for a free slot
  const active = new Set<Worker>(); // workers with a job
  const cutOff = new Map<number, Set<number>>(); // worker id -> sites it found no way to (until its next order)
  const isCut = (u: Worker, id: number) => !!cutOff.get(u.id)?.has(id);
  const cut = (u: Worker, id: number) => { let c = cutOff.get(u.id); if (!c) cutOff.set(u.id, (c = new Set())); c.add(id); };
  const waitAt = new Set<number>(); // tiles taken as wait spots
  const unwait = (u: Worker) => {
    const p = waits.get(u.id);
    if (p && p[1] >= 0) waitAt.delete(Math.floor(p[2]) * w + Math.floor(p[1]));
    waits.delete(u.id);
  };
  let tick = 0;
  let fields = 0; // M5h3: done field tiles standing

  (region.objects ?? []).forEach((o, i) => {
    const d = RESOURCE_NODES[o.id];
    if (!d) return;
    const n: Node = { id: nodes.length, res: d.res, x: o.x, y: o.y, amount: d.max, max: d.max, regrow: d.regrow, rate: d.rate, slots: d.slots, users: 0, tiles: [], obj: i };
    const t = tileAt(grid, o.x, o.y);
    if (t >= 0) {
      n.tiles = [t % w, (t / w) | 0];
      nodeAt[t] = n.id;
    }
    nodes.push(n);
    if (n.regrow > 0) regrowing.push(n);
  });

  const reserveOf = (team: number) => {
    let s = reserve.get(team);
    if (!s) reserve.set(team, (s = newHold()));
    return s;
  };

  // --- M6a store networks: a team's done stores joined by its influence (4-connected tiles of its bit) ---
  const nets = new Map<number, { v: number; lab: Int32Array }>(); // cache by influence version (not saved: rebuilt)
  const labels = (team: number): Int32Array => {
    let c = nets.get(team);
    if (c && c.v === infl.version) return c.lab;
    const lab = c?.lab ?? new Int32Array(w * h);
    lab.fill(-1);
    const bit = 1 << team, stack: number[] = [];
    let n = 0;
    for (let s = 0; s < w * h; s++) {
      if (lab[s] >= 0 || !(infl.mask[s] & bit)) continue;
      lab[s] = n;
      stack.push(s);
      while (stack.length) {
        const t = stack.pop()!, x = t % w;
        for (const o of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w]) {
          if (o < 0 || o >= w * h || lab[o] >= 0 || !(infl.mask[o] & bit)) continue;
          lab[o] = n;
          stack.push(o);
        }
      }
      n++;
    }
    nets.set(team, (c = { v: infl.version, lab }));
    return lab;
  };
  /** The network of `team` at (x,y): -1 outside its influence. */
  const netAt = (team: number, x: number, y: number): number => {
    const t = tileAt(grid, x, y);
    return t < 0 ? -1 : labels(team)[t];
  };
  const standing = (b: Building) => !b.cancelled && (b.state === 'done' || b.state === 'damaged' || (!!b.prev && b.state !== 'destroyed')); // an upgrade keeps its store
  /** A building's (store's, site's) network: of the first of its tiles in its team's influence (-1: cut off). */
  const storeNet = (b: Building): number => {
    const lab = labels(b.team);
    for (const t of b.ti) if (lab[t] >= 0) return lab[t];
    return -1;
  };
  /** Done stores of `team` in network `net`, by id. */
  // exact cache: rebuilt whenever influence or any store's standing changes (storeVer), so a resumed sim agrees
  let storeVer = 0;
  const netCache = new Map<string, { v: number; s: number; list: Building[] }>();
  const netStores = (team: number, net: number): Building[] => {
    if (net < 0) return [];
    const k = `${team}:${net}`, c = netCache.get(k);
    if (c && c.v === infl.version && c.s === storeVer) return c.list;
    const list = storeList.filter((b) => b.team === team && standing(b) && storeNet(b) === net);
    netCache.set(k, { v: infl.version, s: storeVer, list });
    return list;
  };
  /** What work of `team` at (x,y) draws from: the stores of its network, then the home strongroom. */
  const sources = (team: number, x: number, y: number): Hold[] => [...netStores(team, netAt(team, x, y)).map((b) => b.hold!), reserveOf(team)];
  /** Pay `cost` where the work stands; false (nothing taken) when the network lacks any of it. */
  const takeAt = (team: number, x: number, y: number, cost: Cost): boolean => takeFrom(sources(team, x, y), cost);
  /** Goods the network at (x,y) holds (stores and strongroom). */
  const haveAt = (team: number, x: number, y: number): Cost => {
    const out: Cost = {};
    for (const h of sources(team, x, y)) totals(h, out);
    return out;
  };
  /** Output of work at (x,y): into the nearest store of its network, else the strongroom. */
  const addAt = (team: number, x: number, y: number, r: ResourceKind, n: number, o = region.id) => {
    let best: Building | null = null, bd = Infinity;
    for (const b of netStores(team, netAt(team, x, y))) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd) (bd = d), (best = b);
    }
    put(best ? best.hold! : reserveOf(team), r, n, o);
  };

  // --- influence ---
  const repaint = () => {
    infl.mask.fill(0);
    const paint = (team: number, cx: number, cy: number, r: number) => {
      const bit = 1 << team;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) infl.mask[y * w + x] |= bit;
    };
    for (const c of claims) paint(c.team, c.x, c.y, c.r);
    for (const b of buildings) if (b.def.influence > 0 && (b.state === 'done' || b.state === 'damaged')) paint(b.team, b.x, b.y, b.def.influence);
    infl.version++;
  };

  // --- placement ---
  const checkTiles = (team: number, tiles: number[], flat: boolean, anyTeam = false): PlaceReason | null => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i], y = tiles[i + 1];
      if (x < 0 || y < 0 || x >= w || y >= h) return 'bounds';
      const t = y * w + x;
      if (noBuild[t]) return 'noBuild';
      if (region.water[t] > 0) return 'water';
      if (region.terrain[t] === 'rock') return 'rock';
      if (occ[t] >= 0) return 'overlap';
      if (grid.cost[t] === 0) return 'blocked';
      if (nodeAt[t] >= 0 && nodes[nodeAt[t]].amount > 0) return 'node';
      if (!anyTeam && !(infl.mask[t] & (1 << team))) return 'influence';
      lo = Math.min(lo, grid.height[t]);
      hi = Math.max(hi, grid.height[t]);
    }
    return flat && hi - lo > 1 ? 'slope' : null;
  };

  const checkPlacement = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0): PlaceResult => {
    const [fw, fh] = rotated(type, rot);
    const tiles = rectTiles(x, y, fw, fh);
    const def = BUILDINGS[type];
    if (def.brazier) return checkBrazier(team, tiles);
    if (def.access) {
      const a = accessOf(team, type, tiles);
      const reason = a.reason ?? checkTiles(team, a.tiles, true, def.access === 'ladder');
      return reason ? { ok: false, reason, tiles: a.tiles } : { ok: true, tiles: a.tiles };
    }
    const reason = def.wall === 'segment' ? 'short' : checkTiles(team, tiles, true);
    return reason ? { ok: false, reason, tiles } : { ok: true, tiles };
  };

  /**
   * W-35: a brazier goes on the team's own finished walkway or tower platform deck, or else on open ground (no influence
   * needed either way); never two on a tile; the team must have its cost in stock.
   */
  const checkBrazier = (team: number, tiles: number[]): PlaceResult => {
    const [x, y] = tiles, t = y * w + x;
    const under = x >= 0 && y >= 0 && x < w && y < h ? buildings[occ[t]] : undefined;
    let reason: PlaceReason | null = null;
    // a field piece: on the ground it needs no influence (attackers set them down before foe walls)
    if (!(under && under.team === team && under.decked && grid.deck[t] === DECK)) reason = checkTiles(team, tiles, true, true);
    if (!reason && braziers.some((b) => b.state !== 'destroyed' && b.ti[0] === t)) reason = 'overlap';
    if (!reason && Object.entries(BUILDINGS.brazier.cost).some(([r, v]) => (haveAt(team, x + 0.5, y + 0.5)[r as ResourceKind] ?? 0) < v)) reason = 'cost';
    return reason ? { ok: false, reason, tiles } : { ok: true, tiles };
  };

  /** Pay for and set a brazier down done and lit; its id. */
  const addBrazier = (team: number, tiles: number[]): number => {
    const t = tiles[1] * w + tiles[0];
    takeAt(team, tiles[0] + 0.5, tiles[1] + 0.5, BUILDINGS.brazier.cost);
    const under = buildings[occ[t]];
    const def = BUILDINGS.brazier;
    const b: Building = {
      id: buildings.length, type: 'brazier', def, team, rot: 0, x: tiles[0] + 0.5, y: tiles[1] + 0.5, w: 1, h: 1, tiles,
      ti: [t], state: 'done', labour: 1, need: 1, cost: { ...def.cost }, delivered: { ...def.cost }, incoming: {}, costSum: 0,
      hp: def.hp, maxHp: def.hp, saved: [], users: 0, node: -1, slots: [], slotUser: [], cancelled: false,
      base: [grid.height[t]], inside: [tiles[0], tiles[1]], decked: false, attach: under && under.decked ? under.id : -1, door: -1, prev: null,
      burn: 0, kindle: 0, rubble: false, siege: -1, push: 0, bridge: null, fuel: BRAZIER.life, iron: false, wet: 0, hold: null, owner: '',
    };
    buildings.push(b);
    braziers.push(b);
    return b.id;
  };

  const checkWall = (team: number, o: Omit<WallOrder, 'kind' | 'squad'>): WallPlan => {
    const kit = WALL_KIT[o.material];
    const line = lineTiles(o.points);
    const n = line.length / 2;
    if (n < 2) return { ok: false, reason: 'short', pieces: [] };
    const taken = new Array<boolean>(n).fill(false);
    const nearest = (px: number, py: number) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < n; k++) {
        const d = (line[k * 2] + 0.5 - px) ** 2 + (line[k * 2 + 1] + 0.5 - py) ** 2;
        if (d < bd) (bd = d), (best = k);
      }
      return best;
    };
    const pieces: WallPlan['pieces'] = [];
    const towers = o.towers ?? [];
    for (let i = 0; i + 1 < towers.length; i += 2) {
      const k = nearest(towers[i], towers[i + 1]);
      const tiles = rectTiles(line[k * 2] + 1, line[k * 2 + 1] + 1, 2, 2);
      for (let j = 0; j < n; j++) for (let t = 0; t < tiles.length; t += 2) if (line[j * 2] === tiles[t] && line[j * 2 + 1] === tiles[t + 1]) taken[j] = true;
      pieces.push({ type: kit.tower, tiles, ok: true });
    }
    const gates = o.gates ?? [];
    for (let i = 0; i + 1 < gates.length; i += 2) {
      let k = nearest(gates[i], gates[i + 1]);
      if (k === n - 1) k--;
      const clash = taken[k] || taken[k + 1];
      taken[k] = taken[k + 1] = true;
      pieces.push({ type: kit.gate, tiles: line.slice(k * 2, k * 2 + 4), ok: !clash, ...(clash ? { reason: 'overlap' as const } : {}) });
    }
    for (let k = 0; k < n; ) {
      if (taken[k]) {
        k++;
        continue;
      }
      const tiles: number[] = [];
      while (k < n && !taken[k] && tiles.length < SEGMENT * 2) tiles.push(line[k * 2], line[k * 2 + 1]), k++;
      pieces.push({ type: kit.segment, tiles, ok: true });
    }
    // walls with a walkway are two tiles deep: an inner row toward the inside
    const inside: [number, number] = o.inside && o.inside.length >= 2 ? [o.inside[0], o.inside[1]] : homeOf(team);
    const onLine = new Set<number>();
    for (const p of pieces) for (let t = 0; t < p.tiles.length; t += 2) onLine.add(p.tiles[t + 1] * w + p.tiles[t]);
    for (const p of pieces) if (BUILDINGS[p.type].depth === 2) p.tiles = [...p.tiles, ...innerRow(p.tiles, inside, onLine)];
    // pieces may not overlap each other (two towers on one spot)
    const mine = new Set<number>();
    for (const p of pieces) {
      if (!p.ok) continue;
      const r = checkTiles(team, p.tiles, BUILDINGS[p.type].wall === 'tower');
      let dup = false;
      for (let t = 0; t < p.tiles.length; t += 2) {
        const key = p.tiles[t + 1] * w + p.tiles[t];
        if (mine.has(key)) dup = true;
        mine.add(key);
      }
      const reason = r ?? (dup ? 'overlap' : null);
      if (reason) (p.ok = false), (p.reason = reason);
    }
    const bad = pieces.find((p) => !p.ok);
    return bad ? { ok: false, reason: bad.reason, pieces } : { ok: true, pieces };
  };

  /** Centre of the team's claims and influence buildings (the default inside of its walls); the map centre if none. */
  const homeOf = (team: number): [number, number] => {
    let x = 0, y = 0, n = 0;
    for (const c of claims) if (c.team === team) (x += c.x), (y += c.y), n++;
    for (const b of buildings) if (b.team === team && b.def.influence > 0 && !b.cancelled && b.state !== 'destroyed') (x += b.x), (y += b.y), n++;
    return n ? [x / n, y / n] : [w / 2, h / 2];
  };

  const add = (team: number, type: BuildingType, tiles: number[], rot: 0 | 1, inside?: [number, number], attach = -1, owner = ''): number => {
    const def = BUILDINGS[type];
    const k = def.perTile ? tiles.length / 2 : 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < tiles.length; i += 2) {
      x0 = Math.min(x0, tiles[i]);
      x1 = Math.max(x1, tiles[i] + 1);
      y0 = Math.min(y0, tiles[i + 1]);
      y1 = Math.max(y1, tiles[i + 1] + 1);
    }
    const cost: Partial<Record<ResourceKind, number>> = {};
    let costSum = 0;
    for (const [r, v] of Object.entries(def.cost) as [ResourceKind, number][]) (cost[r] = v * k), (costSum += v * k);
    const maxHp = def.hp * k;
    const b: Building = {
      id: buildings.length, type, def, team, rot, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, tiles,
      ti: [], state: 'foundation', labour: 0, need: def.labour * k, cost, delivered: {}, incoming: {}, costSum,
      hp: maxHp * 0.1, maxHp, saved: [], users: 0, node: -1, slots: [], slotUser: [], cancelled: false,
      base: [], inside: inside ?? homeOf(team), decked: false, attach, door: -1, prev: null,
      burn: 0, kindle: 0, rubble: false, siege: -1, push: 0, bridge: null, fuel: 0, iron: false, wet: 0,
      hold: def.store || def.chest ? newHold() : null, owner,
    };
    if (def.store) storeList.push(b);
    for (let i = 0; i < tiles.length; i += 2) {
      const t = tiles[i + 1] * w + tiles[i];
      b.ti.push(t);
      b.base.push(grid.height[t]);
      occ[t] = b.id;
    }
    b.slots = workSlots(b);
    b.slotUser = b.slots.map(() => -1);
    buildings.push(b);
    return b.id;
  };

  /** A worker of `team` can stand on tile t to work a site: open, no building marked out there, not a foe's gate. */
  const standable = (t: number, team: number) => grid.cost[t] > 0 && (occ[t] < 0 || onDeck(t)) && (!grid.gate[t] || grid.gate[t] === team + 1);
  /** Tile t is the open deck of a finished bridge piece. */
  const onDeck = (t: number) => { const o = buildings[occ[t]]; return !!o && !!o.bridge && o.decked; };

  /**
   * Work slots of a site: the tiles round its footprint (8-neighbour ring) a worker can stand on and step off (an open
   * 4-neighbour within a level), at most one level from the footprint tile beside it; ordered round the centre and thinned
   * evenly to def.workers, so workers spread all round.
   */
  const workSlots = (b: Building): number[] => {
    const inside = new Set(b.ti);
    const ring: number[] = [];
    const seen = new Set<number>();
    for (const [i0, t0] of b.ti.entries())
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (t0 % w) + dx, y = ((t0 / w) | 0) + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const t = y * w + x;
          if (inside.has(t) || seen.has(t) || !standable(t, b.team) || Math.abs(grid.height[t] - (b.bridge?.deck ?? b.base[i0])) > 1) continue;
          let out = false;
          for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + ex, ny = y + ey;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (!inside.has(n) && standable(n, b.team) && Math.abs(grid.height[n] - grid.height[t]) < 2) out = true;
          }
          if (!out) continue;
          seen.add(t);
          ring.push(t);
        }
    const ang = (t: number) => Math.atan2(((t / w) | 0) + 0.5 - b.y, (t % w) + 0.5 - b.x);
    ring.sort((a, c) => ang(a) - ang(c) || a - c);
    const k = Math.min(b.def.workers, ring.length);
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(ring[Math.floor((i * ring.length) / k)]);
    return out;
  };

  const place = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0, owner = ''): number => {
    // M6a: a chest is a player's (CHEST.cap a player a region)
    if (BUILDINGS[type].chest && (!owner || buildings.filter((b) => b.owner === owner && b.def.chest && !b.cancelled && b.state !== 'destroyed').length >= CHEST.cap)) return -1;
    const r = checkPlacement(team, type, x, y, rot);
    if (!r.ok) return -1;
    if (BUILDINGS[type].brazier) return addBrazier(team, r.tiles);
    return add(team, type, r.tiles, rot, undefined, BUILDINGS[type].access ? accessOf(team, type, r.tiles).attach : -1, owner);
  };

  const placeWall = (team: number, o: Omit<WallOrder, 'kind' | 'squad'>): number[] => {
    const plan = checkWall(team, o);
    if (!plan.ok) return [];
    const inside: [number, number] = o.inside && o.inside.length >= 2 ? [o.inside[0], o.inside[1]] : homeOf(team);
    const ids = plan.pieces.map((p) => add(team, p.type, p.tiles, 0, inside));
    for (const id of ids) {
      const b = buildings[id]; // slots again, now that every piece is marked out
      b.slots = workSlots(b);
      b.slotUser = b.slots.map(() => -1);
    }
    return ids;
  };

  // --- bridges (M2d) ---
  const checkBridge = (team: number, o: Omit<BridgeOrder, 'kind' | 'squad'>): BridgePlan => {
    const p = o.points, n2 = p.length;
    const sx = Math.floor(p[0] ?? 0), sy = Math.floor(p[1] ?? 0), ex = Math.floor(p[n2 - 2] ?? 0), ey = Math.floor(p[n2 - 1] ?? 0);
    // the nearest of the 8 steps (4 lines) to the drag; a diagonal step is sqrt 2 tiles long
    const oct = (((Math.round(Math.atan2(ey - sy, ex - sx) / (Math.PI / 4)) % 8) + 8) % 8);
    const [dx, dy] = STEPS[oct], diag = dx !== 0 && dy !== 0, stepLen = diag ? Math.SQRT2 : 1;
    const axis: BridgeAxis = !diag ? (dx ? 'x' : 'y') : dx === dy ? 'v' : 'h';
    const width = Math.max(1, Math.min(3, Math.round(o.width ?? BRIDGE.width))), maxSpan = BRIDGE.maxSpan[o.material];
    const len = Math.round(((ex - sx) * dx + (ey - sy) * dy) / (dx * dx + dy * dy)) + 1;
    // a row's tiles beside the line: an axis row `width` tiles (+y along x, +x along y; 3 wide centred); a diagonal row a
    // staircase band: tiles on every other diagonal across (px, py) and between them the 4-neighbour half a step ahead
    const offs: [number, number][] = [];
    if (!diag) for (let j = -Math.floor((width - 1) / 2), n = 0; n < width; j++, n++) offs.push(dx ? [0, j] : [j, 0]);
    else {
      const px = -dy, py = dx, [qx, qy] = px * dx > 0 ? [px, 0] : [0, py], n = Math.round(width * Math.SQRT2) + 1;
      for (let j = -Math.floor((n - 1) / 2), c = 0; c < n; j++, c++) { const m = Math.floor(j / 2), odd = j - 2 * m; offs.push([px * m + qx * odd, py * m + qy * odd]); }
    }
    const fail = (reason: PlaceReason, span = 0, pieces: BridgePlan['pieces'] = []): BridgePlan => ({ ok: false, reason, axis, dir: [dx, dy], width, span, maxSpan, pieces });
    if (len < 3 || n2 < 4) return fail('short');
    const row = (k: number) => offs.flatMap(([ox, oy]) => [sx + dx * k + ox, sy + dy * k + oy]);
    const centre = (k: number) => { const r = row(k); let cx = 0, cy = 0; for (let i = 0; i < r.length; i += 2) (cx += r[i]), (cy += r[i + 1]); return [cx / offs.length + 0.5, cy / offs.length + 0.5]; };
    const inMap = (k: number) => row(k).every((v, i) => v >= 0 && v < (i % 2 ? h : w));
    const wet = (k: number) => { const r = row(k); for (let i = 0; i < r.length; i += 2) if (region.water[r[i + 1] * w + r[i]] > 0) return true; return false; };
    if (!inMap(0) || !inMap(len - 1)) return fail('bounds');
    if (wet(0)) return fail('bank');
    let k0 = 1;
    while (k0 < len && !wet(k0)) k0++;
    if (k0 >= len) return fail('short'); // no water on the line
    let k1 = k0;
    while (k1 + 1 < len && wet(k1 + 1)) k1++;
    const span = Math.round((k1 - k0 + 1) * stepLen), type = BRIDGE.kit[o.material];
    // each ramp is BRIDGE.ramp rows of the bank (outer row first on end0, inner first on end1), past the drag if need be
    const rampRows = (ks: number[]) => ({ tiles: ks.flatMap(row), rows: ks.flatMap(centre) });
    const r0 = Array.from({ length: BRIDGE.ramp }, (_, i) => k0 - BRIDGE.ramp + i), r1 = Array.from({ length: BRIDGE.ramp }, (_, i) => k1 + 1 + i);
    const pieces: BridgePlan['pieces'] = [{ type, part: 'end0', ...rampRows(r0), ok: true }];
    for (let k = k0; k <= k1; k += BRIDGE.piece) {
      const tiles: number[] = [], rows: number[] = [];
      for (let j = k; j <= Math.min(k1, k + BRIDGE.piece - 1); j++) tiles.push(...row(j)), rows.push(...centre(j));
      pieces.push({ type, part: 'deck', tiles, rows, ok: true });
    }
    if (k1 + 1 < len) pieces.push({ type, part: 'end1', ...rampRows(r1), ok: true });
    const bad = (reason: PlaceReason) => { for (const q of pieces) q.ok = false; return fail(reason, span, pieces); };
    if (span > maxSpan) return bad('span');
    if (k1 + 1 >= len) return bad('bank'); // the drag ends in the water
    if (![...r0, ...r1].every(inMap)) return bad('bounds');
    if ([...r0, ...r1].some(wet)) return bad('bank'); // a bank too narrow for the ramp
    // ramps: open dry ground, banks at most a level apart, one of them in the team's influence
    const ends = [pieces[0], pieces[pieces.length - 1]];
    let lo = Infinity, hi = -Infinity, own = false;
    for (const e of ends) {
      const r = checkTiles(team, e.tiles, false, true);
      if (r) { e.ok = false; return fail(r, span, pieces); }
      let mine = true;
      for (let i = 0; i < e.tiles.length; i += 2) {
        const t = e.tiles[i + 1] * w + e.tiles[i];
        lo = Math.min(lo, grid.height[t]); hi = Math.max(hi, grid.height[t]);
        if (!(infl.mask[t] & (1 << team))) mine = false;
      }
      own ||= mine;
    }
    if (hi - lo > 1) return bad('slope');
    if (!own) return bad('influence');
    // deck: free of buildings, no-build bands and rock; a dry tile beside the water open
    for (const q of pieces) if (q.part === 'deck') for (let i = 0; i < q.tiles.length; i += 2) {
      const t = q.tiles[i + 1] * w + q.tiles[i];
      const r: PlaceReason | null = noBuild[t] ? 'noBuild' : occ[t] >= 0 ? 'overlap' : region.terrain[t] === 'rock' ? 'rock' : !region.water[t] && grid.cost[t] === 0 ? 'blocked' : null;
      if (r) { q.ok = false; return fail(r, span, pieces); }
    }
    return { ok: true, axis, dir: [dx, dy], width, span, maxSpan, pieces };
  };

  const placeBridge = (team: number, o: Omit<BridgeOrder, 'kind' | 'squad'>): number[] => {
    const plan = checkBridge(team, o);
    if (!plan.ok) return [];
    let deck = 0;
    for (const q of [plan.pieces[0], plan.pieces[plan.pieces.length - 1]]) for (let i = 0; i < q.tiles.length; i += 2) deck = Math.max(deck, grid.height[q.tiles[i + 1] * w + q.tiles[i]]);
    const ids = plan.pieces.map((q) => add(team, q.type, q.tiles, 0));
    ids.forEach((id, i) => {
      const b = buildings[id];
      b.bridge = { ids, i, axis: plan.axis, dir: plan.dir, width: plan.width, part: plan.pieces[i].part, deck, rows: plan.pieces[i].rows };
      b.slots = workSlots(b);
      b.slotUser = b.slots.map(() => -1);
    });
    return ids;
  };

  /** A bridge piece takes workers: a ramp always, a deck piece once a neighbour along the line is done. */
  const ready = (b: Building) => {
    const br = b.bridge;
    if (!br || br.part !== 'deck') return true;
    return [br.ids[br.i - 1], br.ids[br.i + 1]].some((id) => id !== undefined && buildings[id].decked);
  };

  // --- site life ---
  const delivered = (b: Building) => {
    if (b.costSum === 0) return 1;
    let s = 0;
    for (const v of Object.values(b.delivered)) s += v!;
    return s / b.costSum;
  };

  /** Close the footprint tiles not closed yet (all of them, or the inner row an upgrade grew). */
  const close = (b: Building) => {
    const fresh = b.ti.slice(b.saved.length);
    for (const t of fresh) {
      b.saved.push(grid.cost[t]);
      grid.cost[t] = 0;
      grid.dirty.push(t % w, (t / w) | 0);
    }
    evict(fresh);
    // workers headed near it, or holding one of its slots, search their way again (the old path may run through it, or
    // the goal is now cut off or a long detour away)
    const r = Math.max(b.w, b.h) / 2 + REPATH_NEAR;
    for (const u of active) if (u.alive && (u.wsite === b.id || (Math.abs(u.wgx - b.x) < r && Math.abs(u.wgy - b.y) < r))) u.wgx = u.wgy = -1;
  };

  // --- walkways (W-27, W-28) ---
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  /** A wall segment with a walkway of `team` (standing or being built) on tile t, or null. */
  const walkWall = (t: number, team: number): Building | null => {
    const o = buildings[occ[t]];
    return o && o.team === team && o.def.wall === 'segment' && o.def.walk && !o.cancelled && o.state !== 'destroyed' ? o : null;
  };

  /**
   * The inner row of a thick wall: each line tile pushed one tile toward `inside` (across the line's main axis), skipping
   * tiles in `skip`, repeats and line tiles.
   */
  const innerRow = (tiles: number[], inside: [number, number], skip: Set<number>): number[] => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < tiles.length; i += 2) (x0 = Math.min(x0, tiles[i])), (x1 = Math.max(x1, tiles[i])), (y0 = Math.min(y0, tiles[i + 1])), (y1 = Math.max(y1, tiles[i + 1]));
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
    const [ox, oy] = x1 - x0 >= y1 - y0 ? [0, inside[1] < cy ? -1 : 1] : [inside[0] < cx ? -1 : 1, 0];
    const own = new Set<number>();
    for (let i = 0; i < tiles.length; i += 2) own.add(tiles[i + 1] * w + tiles[i]);
    const out: number[] = [];
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i] + ox, y = tiles[i + 1] + oy, k = y * w + x;
      if (own.has(k) || skip.has(k)) continue;
      own.add(k);
      out.push(x, y);
    }
    return out;
  };

  /**
   * Where stairs or a ladder of `type` on `tiles` attach (W-28). Stairs: a straight ramp whose top end abuts, along its
   * axis, a walkway wall segment of the team on its inside face, with open ground beyond its bottom end; tiles come back
   * bottom first. Ladder: a tile beside any walkway wall or tower platform (any team's: attackers scale foe walls).
   */
  const accessOf = (team: number, type: BuildingType, tiles: number[]): { reason?: PlaceReason; attach: number; tiles: number[] } => {
    const n = tiles.length / 2;
    if (BUILDINGS[type].access === 'ladder') {
      const t = tiles[1] * w + tiles[0];
      for (const [dx, dy] of DIRS) {
        const x = tiles[0] + dx, y = tiles[1] + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = buildings[occ[y * w + x]];
        if (o && o.def.walk && !o.def.access && !o.cancelled && o.state !== 'destroyed' && t >= 0) return { attach: o.id, tiles };
      }
      return { reason: 'attach', attach: -1, tiles };
    }
    const ax = Math.sign(tiles[(n - 1) * 2] - tiles[0]), ay = Math.sign(tiles[(n - 1) * 2 + 1] - tiles[1]); // first to last tile
    for (const up of [1, -1]) {
      const top = up > 0 ? n - 1 : 0, bottom = n - 1 - top;
      const tx = tiles[top * 2] + ax * up, ty = tiles[top * 2 + 1] + ay * up;
      const bx = tiles[bottom * 2] - ax * up, by = tiles[bottom * 2 + 1] - ay * up;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || bx < 0 || by < 0 || bx >= w || by >= h) continue;
      const wall = walkWall(ty * w + tx, team);
      if (!wall) continue;
      // on its inside face, and a way onto the bottom step
      if (-ax * up * (wall.inside[0] - tx - 0.5) - ay * up * (wall.inside[1] - ty - 0.5) <= 0) continue;
      const entry = by * w + bx;
      if (grid.cost[entry] === 0 || occ[entry] >= 0 || grid.deck[entry] !== 0) continue;
      const ordered: number[] = [];
      for (let k = 0; k < n; k++) {
        const j = up > 0 ? k : n - 1 - k;
        ordered.push(tiles[j * 2], tiles[j * 2 + 1]);
      }
      return { attach: wall.id, tiles: ordered };
    }
    return { reason: 'attach', attach: -1, tiles };
  };

  /** Ramp levels (above the wall's ground) of stairs s, bottom first: 1 at the bottom up to walk - 1 at the top. */
  const steps = (s: Building): number[] => {
    const walk = buildings[s.attach]?.def.walk ?? 2;
    const n = s.ti.length;
    return s.ti.map((_, i) => Math.max(1, walk - 1 - (n - 1 - i)));
  };

  /** Stairs s take their ramp heights over the ground of the wall tile they lean on. */
  const ramp = (s: Building) => {
    const wall = buildings[s.attach];
    const top = s.ti[s.ti.length - 1];
    let base = s.base[s.base.length - 1];
    if (wall) {
      const tx = top % w, ty = (top / w) | 0;
      for (const [dx, dy] of DIRS) {
        const k = wall.ti.indexOf((ty + dy) * w + tx + dx);
        if (k >= 0) base = wall.base[k];
      }
    }
    const lv = steps(s);
    s.ti.forEach((t, i) => {
      grid.height[t] = base + lv[i];
      grid.cost[t] = s.saved[i] || 1;
      grid.deck[t] = STAIR;
    });
    s.decked = true;
    grid.dirty.push(...s.tiles);
  };

  /** Stone tower door: the footprint tile with open ground outside it, facing its inside most; -1 none. */
  const doorOf = (b: Building): number => {
    let best = -1, bs = -Infinity;
    for (const f of b.ti) {
      const fx = f % w, fy = (f / w) | 0;
      const ix = b.inside[0] - fx - 0.5, iy = b.inside[1] - fy - 0.5, il = Math.hypot(ix, iy) || 1;
      for (const [dx, dy] of DIRS) {
        const x = fx + dx, y = fy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = y * w + x;
        if (b.ti.includes(t) || grid.cost[t] === 0 || occ[t] >= 0 || grid.deck[t] !== 0) continue;
        const sc = (dx * ix + dy * iy) / il;
        if (sc > bs) (bs = sc), (best = f);
      }
    }
    return best;
  };

  /**
   * A finished piece opens its raised layer: a wall or tower footprint becomes a deck at its ground + walk (a stone tower
   * keeps one tile as its door, an inner stair for its own team); stairs ramp up to their wall; a ladder leans on its piece.
   * Stairs on a wall follow it when an upgrade raises it.
   */
  const raiseDeck = (b: Building) => {
    const d = b.def;
    if (b.bridge) {
      const br = b.bridge;
      const diag = br.axis === 'h' || br.axis === 'v';
      b.ti.forEach((t) => {
        grid.height[t] = br.deck;
        grid.cost[t] = BRIDGE.cost;
        if (diag) grid.span[t] = 1;
        grid.narrow[t] = br.width < 2 ? 1 : 0; // M6b: carts need a bridge 2 wide
        grid.cartMul[t] = 1;
      });
      b.decked = true;
      grid.dirty.push(...b.tiles);
      // the next pieces get their work slots on this deck; workers cut off before may find a way now
      for (const id of [br.ids[br.i - 1], br.ids[br.i + 1]]) {
        const o = buildings[id];
        if (!o || o.users > 0 || o.decked) continue;
        o.slots = workSlots(o);
        o.slotUser = o.slots.map(() => -1);
      }
      cutOff.clear();
      return;
    }
    if (d.access === 'stairs') return ramp(b);
    if (d.access === 'ladder') {
      const t = b.ti[0];
      grid.cost[t] = (b.saved[0] || 1) * (b.type === 'towerBridge' ? 1 : LADDER_COST); // M5h3: a tower's bridge is no climb
      grid.deck[t] = LADDER;
      grid.plat[t] = b.id;
      b.decked = true;
      grid.dirty.push(...b.tiles);
      return;
    }
    if (!d.walk) return;
    b.ti.forEach((t, i) => {
      grid.height[t] = b.base[i] + d.walk!;
      if (grid.cost[t] === 0) grid.cost[t] = b.saved[i] || 1;
      grid.deck[t] = DECK;
      if (d.wall === 'tower') grid.plat[t] = b.id;
    });
    if (d.door && b.door < 0) b.door = doorOf(b);
    if (d.door && b.door >= 0) {
      const t = b.door;
      grid.height[t] = b.base[b.ti.indexOf(t)];
      grid.deck[t] = LADDER;
      grid.gate[t] = b.team + 1;
      grid.cost[t] = (b.saved[b.ti.indexOf(t)] || 1) * DOOR_COST;
    }
    b.decked = true;
    grid.dirty.push(...b.tiles);
    for (const o of buildings) if (o.attach === b.id && o.decked && o.def.access === 'stairs') ramp(o);
  };

  const lowerDeck = (b: Building) => {
    if (!b.decked) return;
    b.ti.forEach((t, i) => {
      grid.height[t] = b.base[i];
      grid.deck[t] = 0;
      grid.plat[t] = -1;
      if (i < b.saved.length) grid.cost[t] = b.saved[i];
    });
    if (b.door >= 0) grid.gate[b.door] = 0;
    b.door = -1;
    b.decked = false;
    grid.dirty.push(...b.tiles);
  };

  const bbox = (b: Building) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < b.tiles.length; i += 2) (x0 = Math.min(x0, b.tiles[i])), (x1 = Math.max(x1, b.tiles[i] + 1)), (y0 = Math.min(y0, b.tiles[i + 1])), (y1 = Math.max(y1, b.tiles[i + 1] + 1));
    Object.assign(b, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
  };

  /**
   * A workplace's crafter stations in the world (Spot: x, y, fx, fy), its first `level`: the level's spots, else along
   * the front row facing in. Rot 1 swaps the footprint's x and y (as the art is mirrored).
   */
  const spotsOf = (b: Building): Spot[] => {
    const wp = b.def.workplace;
    if (!wp) return [];
    const [lw, lh] = b.rot ? [b.h, b.w] : [b.w, b.h];
    const own = wp.spots ?? Array.from({ length: lw }, (_, i): Spot => [lw - 0.5 - i, lh - 0.5, lw - 0.5 - i, lh / 2 - 0.5]);
    const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
    return own.slice(0, wp.level).map(([x, y, fx, fy]): Spot => (b.rot ? [x0 + y, y0 + x, x0 + fy, y0 + fx] : [x0 + x, y0 + y, x0 + fx, y0 + fy]));
  };

  /**
   * A done workplace opens its stations to its own team: each spot's tile and the tiles straight out from it to the
   * nearer front side (+x or +y) become walkable (a gate of the team); the rest of the footprint stays closed.
   */
  const openInside = (b: Building) => {
    const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2, open = new Set<number>();
    for (const [sx, sy] of spotsOf(b)) {
      let tx = Math.floor(sx), ty = Math.floor(sy);
      const alongX = x0 + b.w - 1 - tx <= y0 + b.h - 1 - ty;
      open.add(ty * w + tx);
      while (alongX ? tx < x0 + b.w - 1 : ty < y0 + b.h - 1) {
        if (alongX) tx++;
        else ty++;
        open.add(ty * w + tx);
      }
    }
    const shut: number[] = [];
    b.ti.forEach((t, i) => {
      if (open.has(t)) (grid.cost[t] = b.saved[i] || 1), (grid.gate[t] = b.team + 1);
      else if (grid.cost[t] > 0) (grid.cost[t] = 0), (grid.gate[t] = 0), shut.push(t);
    });
    grid.dirty.push(...b.tiles);
    if (shut.length) evict(shut);
  };

  const finish = (b: Building) => {
    b.state = 'done';
    b.hp = b.maxHp;
    if (b.prev) {
      b.prev = null;
      b.need = b.def.labour * (b.def.perTile ? b.ti.length : 1);
      b.labour = b.need;
    }
    raiseDeck(b);
    if (b.def.workplace) openInside(b);
    if (b.def.field) {
      // M5h3: men cross it slowly, engines not at all
      b.saved = b.ti.map((t) => grid.cost[t]);
      for (const t of b.ti) (grid.cost[t] *= FIELD[b.def.field].slow), (grid.trench[t] = 1);
      grid.dirty.push(...b.tiles);
      fields++;
    }
    if (b.def.wall === 'gate') {
      b.ti.forEach((t, i) => {
        grid.cost[t] = b.saved[i];
        grid.gate[t] = b.team + 1;
      });
      grid.dirty.push(...b.tiles);
    }
    if (b.def.yields) {
      const y = b.def.yields;
      const n: Node = { id: nodes.length, res: y.res, x: b.x, y: b.y, amount: y.max, max: y.max, regrow: y.regrow, rate: y.rate, slots: 2 * (b.w + b.h), users: 0, tiles: b.tiles, building: b.id };
      if (b.type === 'pitchKiln') {
        // W-35: pines standing near feed it faster
        let pines = 0;
        for (const o of nodes) if (o.obj !== undefined && o.amount >= 1 && PINES.has(region.objects![o.obj].id) && (o.x - b.x) ** 2 + (o.y - b.y) ** 2 <= KILN.pineR ** 2) pines++;
        n.regrow *= 1 + KILN.pineBoost * Math.min(pines, KILN.pineMax);
        n.kiln = b.team;
        n.amount = 0; // it starts cold
      }
      nodes.push(n);
      regrowing.push(n);
      b.node = n.id;
    }
    if (b.def.influence > 0) repaint();
    if (b.def.store) storeVer++;
  };

  const destroy = (b: Building) => {
    if (b.def.brazier) {
      // knocked over: not in occ, nothing to open
      b.state = 'destroyed';
      b.hp = 0;
      b.fuel = 0;
      return;
    }
    for (const o of braziers) if (o.attach === b.id && o.state !== 'destroyed') destroy(o); // its deck goes
    const closed = b.state !== 'foundation';
    const wasDone = b.state === 'done' || b.state === 'damaged';
    // M6c: a store or chest that falls leaves its contents in a pile (burnt: fire spoils half the goods)
    if (b.hold && !empty(b.hold)) {
      hooks.spill?.(b.x, b.y, b.hold, b.burn > 0);
      b.hold = { lots: [], items: [] };
    }
    b.state = 'destroyed';
    b.hp = 0;
    b.prev = null;
    b.burn = 0;
    b.rubble = closed && !!b.def.wall; // a breach
    lowerDeck(b);
    for (const [i, t] of b.ti.entries()) {
      occ[t] = -1;
      if (closed && grid.cost[t] === 0) grid.cost[t] = b.saved[i];
      if (b.rubble && grid.cost[t] > 0) grid.cost[t] *= FIRE.rubble;
      grid.gate[t] = 0;
      grid.span[t] = 0;
      grid.narrow[t] = 0;
    }
    if (b.def.field && wasDone) {
      b.ti.forEach((t, i) => ((grid.cost[t] = b.saved[i]), (grid.trench[t] = 0))); // filled, or the stakes broken
      fields--;
    }
    if (closed) grid.dirty.push(...b.tiles);
    if (b.bridge && wasDone) fall(b.ti); // the deck collapses under the men on it
    if (b.node >= 0) nodes[b.node].amount = nodes[b.node].max = nodes[b.node].regrow = 0;
    if (wasDone && b.def.influence > 0) repaint();
    if (b.def.store) storeVer++;
  };

  const damage = (id: number, dmg: number) => {
    const b = buildings[id];
    if (!b || b.state === 'destroyed') return;
    b.hp -= dmg;
    if (b.hp <= 0) destroy(b);
    else if (b.state === 'done' && b.hp < b.maxHp / 2) b.state = 'damaged';
  };

  // --- fire (M2c) ---
  const burning: Building[] = [];
  /** M5h3: wet hides halve the chance a piece catches (and double the torch-time). */
  const wetK = (b: Building) => (b.wet > tick ? FORT.wet : 1);
  const canBurn = (b: Building | undefined): b is Building => !!b && !!b.def.burnable && !b.cancelled && b.state !== 'destroyed' && b.state !== 'foundation';
  const ignite = (b: Building) => {
    if (b.burn > 0) return;
    b.burn = FIRE.start;
    burning.push(b);
  };
  /** Pieces sharing a tile edge with b, by id. */
  const besides = (b: Building): Building[] => {
    const ids = new Set<number>();
    for (const t of b.ti) {
      const x = t % w, y = (t / w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const o = occ[ny * w + nx];
        if (o >= 0 && o !== b.id) ids.add(o);
      }
    }
    return [...ids].sort((a, c) => a - c).map((i) => buildings[i]);
  };
  const fireTick = () => {
    if (!burning.length) return;
    const spread = tick % 10 === 0;
    for (const b of burning.slice()) {
      if (b.burn <= 0 || b.state === 'destroyed') continue;
      b.burn = Math.min(1, b.burn + FIRE.grow * DT);
      damage(b.id, (b.burn * b.maxHp * DT) / FIRE.life);
      if (!spread || b.burn < FIRE.spreadMin || (b.state as BuildState) === 'destroyed') continue;
      for (const o of besides(b)) if (canBurn(o) && o.burn <= 0 && chance(FIRE.spread * b.burn * wetK(o))) ignite(o);
    }
    for (let i = burning.length - 1; i >= 0; i--)
      if (burning[i].burn <= 0 || burning[i].state === 'destroyed') {
        burning[i].burn = 0;
        burning.splice(i, 1);
      }
  };

  // --- siege ladders (M2c) ---
  /** The open ground tile at the outer foot of a foe (not `team`'s) walkway wall or tower tile (x,y), -1 none. */
  const ladderFoot = (team: number, x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    const o = buildings[occ[y * w + x]];
    if (!o || o.team === team || !o.def.walk || o.def.access || !o.decked || (o.state !== 'done' && o.state !== 'damaged')) return -1;
    let best = -1, bs = Infinity;
    const ix = o.inside[0] - x - 0.5, iy = o.inside[1] - y - 0.5, il = Math.hypot(ix, iy) || 1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const t = ny * w + nx;
      if (grid.cost[t] === 0 || occ[t] >= 0 || grid.deck[t] !== 0 || grid.gate[t]) continue;
      const sc = (dx * ix + dy * iy) / il; // most outward
      if (sc < bs) (bs = sc), (best = t);
    }
    return best;
  };

  // --- workers ---
  /** Squared distance from (x,y) to the nearest tile centre of a footprint. */
  const near2 = (tiles: number[], x: number, y: number) => {
    let best = Infinity;
    for (let i = 0; i < tiles.length; i += 2) best = Math.min(best, (tiles[i] + 0.5 - x) ** 2 + (tiles[i + 1] + 0.5 - y) ** 2);
    return best;
  };
  const at = (tiles: number[], u: Worker) => near2(tiles, u.x, u.y) <= AT * AT;

  /** An open tile next to the footprint, nearest (x,y) (spread by the worker id), as a point; the centre if none. */
  const spot = (tiles: number[], u: Worker, cx: number, cy: number): [number, number] => {
    const inside = new Set<number>();
    for (let i = 0; i < tiles.length; i += 2) inside.add(tiles[i + 1] * w + tiles[i]);
    const ring: number[] = [];
    for (let i = 0; i < tiles.length; i += 2)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = tiles[i] + dx, y = tiles[i + 1] + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const t = y * w + x;
          if (inside.has(t) || grid.cost[t] === 0 || (grid.gate[t] && grid.gate[t] !== u.squad.team + 1) || ring.includes(t)) continue;
          ring.push(t);
        }
    if (!ring.length) return [cx, cy];
    ring.sort((a, b) => ((a % w) + 0.5 - u.x) ** 2 + (((a / w) | 0) + 0.5 - u.y) ** 2 - (((b % w) + 0.5 - u.x) ** 2 + (((b / w) | 0) + 0.5 - u.y) ** 2) || a - b);
    const t = ring[u.id % Math.min(ring.length, 3)];
    return [(t % w) + 0.5, ((t / w) | 0) + 0.5];
  };

  const walkTo = (u: Worker, x: number, y: number): [number, number] => {
    if (Math.abs(x - u.wgx) > 0.5 || Math.abs(y - u.wgy) > 0.5) {
      u.wgx = x;
      u.wgy = y;
      u.wpath = [];
      if (!u.wreq) {
        u.wreq = true;
        pathQueue.push(u);
      }
    }
    if (u.wpath.length) {
      while (u.wpi < u.wpath.length / 2 - 1 && Math.hypot(u.wpath[u.wpi * 2] - u.x, u.wpath[u.wpi * 2 + 1] - u.y) < 0.4) u.wpi++;
      return [u.wpath[u.wpi * 2], u.wpath[u.wpi * 2 + 1]];
    }
    return [x, y];
  };

  const stores = (team: number) => buildings.filter((b) => b.team === team && b.def.store && (b.state === 'done' || b.state === 'damaged'));
  const nearestStore = (u: Worker): Building | null => {
    let best: Building | null = null, bd = Infinity;
    for (const b of stores(u.squad.team)) {
      const d = near2(b.tiles, u.x, u.y);
      if (d < bd) (bd = d), (best = b);
    }
    return best;
  };

  /** The worker gives up its site and slot. */
  const leave = (u: Worker) => {
    if (u.wsite < 0) return;
    const b = buildings[u.wsite];
    b.users--;
    if (u.wslot >= 0) b.slotUser[u.wslot] = -1;
    u.wsite = u.wslot = -1;
  };

  /** A load reserved for a cancelled site was refunded already: it is gone. */
  const dropRefunded = (u: Worker) => {
    if (u.wfor >= 0 && buildings[u.wfor].cancelled) {
      u.carry = null;
      u.load = 0;
      u.wfor = -1;
    }
  };

  const release = (u: Worker) => {
    if (u.wnode >= 0) nodes[u.wnode].users--;
    leave(u);
    dropRefunded(u);
    if (u.wfor >= 0 && u.carry) buildings[u.wfor].incoming[u.carry]! -= u.load;
    u.wnode = u.wfor = -1;
    u.working = false;
    unwait(u);
  };

  const setJob = (u: Worker, job: 'gather' | 'build' | null) => {
    release(u);
    cutOff.delete(u.id);
    u.job = job;
    if (job) active.add(u);
    else active.delete(u);
    u.wgx = u.wgy = -1;
    u.wpath = [];
  };

  const takeNode = (u: Worker, n: Node) => {
    if (u.wnode >= 0) nodes[u.wnode].users--;
    u.wnode = n.id;
    n.users++;
  };

  /** Nearest node of resource res with a free slot within r of (x,y), the given one first. */
  const findNode = (res: ResourceKind, x: number, y: number, r: number, first: number): Node | null => {
    const f = nodes[first];
    if (f && f.res === res && f.amount >= 1 && f.users < f.slots && !f.locked) return f;
    let best: Node | null = null, bd = r * r;
    for (const n of nodes) {
      if (n.res !== res || n.amount < 1 || n.users >= n.slots || n.locked) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  };

  /** Drop the load at the nearest store; 'here' once dropped, null with no store. */
  const deliver = (u: Worker): Act => {
    const s = nearestStore(u);
    if (!s) return null;
    if (!at(s.tiles, u)) return walkTo(u, ...spot(s.tiles, u, s.x, s.y));
    const st = s.hold!, o = region.id;
    if (u.carry) put(st, u.carry, u.load * (u.gmul?.[u.carry] ?? 1), o);
    const n = nodes[u.wnode];
    // M5h: Herb Finder (forest and marsh nodes), Weaver (farms)
    if (u.herbs && n?.obj !== undefined && FORAGE_TERRAIN.has(region.terrain[tileAt(grid, n.x, n.y)])) put(st, 'herbs', u.load * FORAGE_SHARE.herbs, o);
    if (u.flax && n?.building !== undefined && buildings[n.building]?.type === 'farm') put(st, 'flax', u.load * FORAGE_SHARE.flax, o);
    if (u.carry === 'wood' && n?.obj !== undefined && PINES.has(region.objects![n.obj].id)) put(st, 'pitch', u.load * KILN.fromPine, o);
    u.carry = null;
    u.load = 0;
    return 'here';
  };

  const gather = (u: Worker): Act => {
    let n = u.wnode >= 0 ? nodes[u.wnode] : null;
    if (u.load > 0 && (u.load >= CARRY - 1e-6 || (n && u.carry !== n.res))) return deliver(u);
    if (n?.locked) {
      // a guard lair came back: off this node
      n.users--;
      u.wnode = -1;
      n = null;
    }
    if (!n || n.amount < 1) {
      const from = n ?? nodes[u.squad.node];
      const next = from ? findNode(from.res, from.x, from.y, NEAR_NODE, u.squad.node) : null;
      if (!next) {
        if (u.wnode >= 0) (nodes[u.wnode].users--, (u.wnode = -1));
        return u.load > 0 ? deliver(u) : null;
      }
      takeNode(u, next);
      n = next;
    }
    if (!at(n.tiles, u)) return walkTo(u, ...spot(n.tiles, u, n.x, n.y));
    const take = Math.min(n.rate * DT * (u.wrate ?? 1), n.amount, CARRY - u.load);
    n.amount -= take;
    u.carry = n.res;
    u.load += take;
    u.working = true;
    u.facing = Math.atan2(n.y - u.y, n.x - u.x);
    if (n.amount < 1e-6 && n.regrow === 0) {
      n.amount = 0;
      if (nodeAt[tileAt(grid, n.x, n.y)] === n.id) nodeAt[tileAt(grid, n.x, n.y)] = -1;
    }
    return 'here';
  };

  const unfinished = (b: Building) => b.state === 'foundation' || b.state === 'scaffold' || (b.state === 'damaged' && b.hp < b.maxHp);
  const slotOk = (b: Building, k: number) => standable(b.slots[k], b.team);

  /** The free usable slot of b nearest the worker, -1 none. */
  const freeSlot = (b: Building, u: Worker): number => {
    let best = -1, bd = Infinity;
    for (let k = 0; k < b.slots.length; k++) {
      if (b.slotUser[k] >= 0 || !slotOk(b, k)) continue;
      const t = b.slots[k];
      const d = ((t % w) + 0.5 - u.x) ** 2 + (((t / w) | 0) + 0.5 - u.y) ** 2;
      if (d < bd) (bd = d), (best = k);
    }
    return best;
  };

  /** Nearest site of the squad's with a free slot, and that slot; null when every one is full or done. */
  const pickSite = (u: Worker): [Building, number] | null => {
    let best: [Building, number] | null = null, bd = Infinity;
    for (const id of u.squad.sites) {
      const b = buildings[id];
      if (!b || b.team !== u.squad.team || !unfinished(b) || b.users >= b.slots.length || isCut(u, id) || !ready(b)) continue;
      const d = near2(b.tiles, u.x, u.y);
      if (d >= bd) continue;
      const k = freeSlot(b, u);
      if (k >= 0) (bd = d), (best = [b, k]);
    }
    return best;
  };

  /** No free slot: wait off the nearest unfinished site of the squad's (spread round it by worker id); null if none is left. */
  const wait = (u: Worker): Act => {
    let site: Building | null = null, bd = Infinity;
    for (const id of u.squad.sites) {
      const b = buildings[id];
      if (!b || b.team !== u.squad.team || !unfinished(b) || isCut(u, id)) continue;
      const d = near2(b.tiles, u.x, u.y);
      if (d < bd) (bd = d), (site = b);
    }
    if (!site) return null;
    let p = waits.get(u.id);
    if (!p || p[0] !== site.id) {
      // a free spot round the site (golden-angle spread by worker id, two rings) with a clear walk to one of its slots;
      // none: back to the squad
      unwait(u);
      p = [site.id, -1, -1];
      for (let i = 0; i < 24 && p[1] < 0; i++) {
        const a = u.id * 2.399963 + i * 0.52, r = Math.max(site.w, site.h) / 2 + WAIT_OFF + (i >= 12 ? 1.5 : 0);
        const x = Math.floor(site.x + Math.cos(a) * r), y = Math.floor(site.y + Math.sin(a) * r);
        if (x < 0 || y < 0 || x >= w || y >= h || waitAt.has(y * w + x) || !standable(y * w + x, site.team)) continue;
        for (const t of site.slots)
          if (lineClear(grid, x + 0.5, y + 0.5, (t % w) + 0.5, ((t / w) | 0) + 0.5)) {
            p = [site.id, x + 0.5, y + 0.5];
            waitAt.add(y * w + x);
            break;
          }
      }
      waits.set(u.id, p);
    }
    if (p[1] < 0) return null;
    return (u.x - p[1]) ** 2 + (u.y - p[2]) ** 2 <= 0.25 ? 'here' : walkTo(u, p[1], p[2]);
  };

  /**
   * 'here' at its slot, else the point to walk to. When its path ends short of the slot (cut off, say behind the wall
   * it builds) next to the footprint, it takes a free slot nearer, or else works from where it stands.
   */
  const toSlot = (u: Worker, b: Building): Act => {
    const pos = (k: number): [number, number] => [(b.slots[k] % w) + 0.5, ((b.slots[k] / w) | 0) + 0.5];
    const [sx, sy] = pos(u.wslot);
    const d2 = (u.x - sx) ** 2 + (u.y - sy) ** 2;
    if (d2 <= AT_SLOT * AT_SLOT) return 'here';
    const n = u.wpath.length / 2;
    const ended = n > 0 && !u.wreq && u.wgx === sx && u.wgy === sy && u.wpi >= n - 1 && Math.hypot(u.wpath[n * 2 - 2] - u.x, u.wpath[n * 2 - 1] - u.y) <= AT_SLOT;
    if (!ended) return walkTo(u, sx, sy);
    if (!at(b.tiles, u)) {
      // no way to the site from here (another level, cut off): leave it to others; a load for it goes back to the store
      cut(u, b.id);
      if (u.wfor === b.id && u.carry) (b.incoming[u.carry]! -= u.load), (u.wfor = -1);
      leave(u);
      return null;
    }
    const k = freeSlot(b, u);
    if (k < 0) return 'here';
    const [kx, ky] = pos(k);
    if ((u.x - kx) ** 2 + (u.y - ky) ** 2 >= d2) return 'here';
    b.slotUser[u.wslot] = -1;
    b.slotUser[k] = u.id;
    u.wslot = k;
    return walkTo(u, kx, ky);
  };

  /**
   * A builder whose way to its site's slot is a long detour (the far bank of a river it is bridging, the far side of
   * its wall, reached only round by a ford) leaves that site to others for now: workers build from their own side.
   */
  const detour = (u: Worker) => {
    if (u.job !== 'build' || u.wpath.length < 4) return;
    const p = waits.get(u.id), waiting = u.wsite < 0 && !!p && p[1] === u.wgx && p[2] === u.wgy;
    const b = u.wsite >= 0 ? buildings[u.wsite] : waiting ? buildings[p![0]] : null;
    if (!b || (!waiting && near2(b.tiles, u.wgx, u.wgy) > AT * AT)) return;
    let len = 0;
    for (let i = 2; i < u.wpath.length; i += 2) len += Math.hypot(u.wpath[i] - u.wpath[i - 2], u.wpath[i + 1] - u.wpath[i - 1]);
    if (len <= DETOUR * Math.hypot(u.wgx - u.x, u.wgy - u.y) + DETOUR_PAD) return;
    cut(u, b.id);
    if (waiting) unwait(u);
    else {
      if (u.wfor === b.id && u.carry) (b.incoming[u.carry]! -= u.load), (u.wfor = -1);
      leave(u);
    }
    u.wgx = u.wgy = -1;
    u.wpath = [];
  };

  const build = (u: Worker): Act => {
    let b = u.wsite >= 0 ? buildings[u.wsite] : null;
    if (b && (!unfinished(b) || !slotOk(b, u.wslot))) {
      leave(u);
      b = null;
    }
    if (!b) {
      const pick = pickSite(u);
      if (!pick) return u.load > 0 && u.wfor < 0 ? deliver(u) : wait(u);
      const k = pick[1];
      b = pick[0];
      u.wsite = b.id;
      u.wslot = k;
      b.slotUser[k] = u.id;
      b.users++;
      unwait(u);
    }
    if (u.load > 0) {
      if (u.wfor !== b.id) {
        if (u.wfor >= 0 && u.carry) buildings[u.wfor].incoming[u.carry]! -= u.load;
        u.wfor = -1;
        return deliver(u);
      }
      const go = toSlot(u, b);
      if (go !== 'here') return go;
      const r = u.carry!;
      b.delivered[r] = (b.delivered[r] ?? 0) + u.load;
      b.incoming[r]! -= u.load;
      u.carry = null;
      u.load = 0;
      u.wfor = -1;
      return 'here';
    }
    // fetch what the site still lacks from a store of its network that has it (M6a; the strongroom through any of them)
    if (b.state !== 'damaged') {
      // a site outside every network (a far bridge ramp): the network of the store nearest the worker
      let sn = storeNet(b);
      if (sn < 0) sn = storeNet(nearestStore(u) ?? b);
      const net = netStores(b.team, sn), room = reserveOf(b.team);
      for (const [r, v] of Object.entries(b.cost) as [ResourceKind, number][]) {
        const lack = v - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0);
        if (lack < 1e-6) continue;
        const inRoom = amount(room, r) > 1e-6;
        let s: Building | null = null, sd = Infinity;
        for (const o of net) {
          const d = near2(o.tiles, u.x, u.y);
          if (d < sd && (inRoom || amount(o.hold!, r) > 1e-6)) (sd = d), (s = o);
        }
        if (!s) continue;
        if (!at(s.tiles, u)) return walkTo(u, ...spot(s.tiles, u, s.x, s.y));
        let got = 0;
        for (const hd of [s.hold!, room]) for (const l of take(hd, r, Math.min(CARRY, lack) - got)) got += l.n;
        if (got < 1e-9) continue;
        b.incoming[r] = (b.incoming[r] ?? 0) + got;
        u.carry = r;
        u.load = got;
        u.wfor = b.id;
        return 'here';
      }
    }
    const go = toSlot(u, b);
    if (go !== 'here') return go;
    u.facing = Math.atan2(b.y - u.y, b.x - u.x);
    if (b.state === 'damaged') {
      u.working = true;
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / b.need) * DT * (u.brate ?? 1));
      if (b.hp >= b.maxHp / 2) b.state = 'done';
      return 'here';
    }
    const cap = b.need * delivered(b);
    if (b.labour >= cap) return 'here'; // waiting for materials
    u.working = true;
    if (b.state === 'foundation') {
      b.state = 'scaffold';
      if (!b.def.field) close(b); // M5h3: a field tile never closes
    } else if (b.saved.length < b.ti.length && !b.def.field) close(b); // an upgrade's new inner row
    b.labour = Math.min(cap, b.labour + DT * (u.brate ?? 1));
    b.hp = b.prev ? b.prev.hp + (b.maxHp - b.prev.hp) * (b.labour / b.need) : b.maxHp * Math.max(0.1, b.labour / b.need);
    if (b.labour >= b.need - 1e-9) finish(b);
    return 'here';
  };


  return {
    /** Save and restore (./state.ts): the closure state (the decoder refills the containers in place; `tick` is set back). */
    saveRoot: () => ({ nodes, nodeAt, regrowing, buildings, braziers, occ, noBuild, reserve, storeList, claims, infl, pathQueue, waits, active, cutOff, waitAt, burning, tick, fields }),
    loadRoot: (o: { tick: number; fields: number }) => void ((tick = o.tick), (fields = o.fields)),
    /** The finished bridge piece whose open deck or ramp is tile t (its line: axis, dir, width, row centres), or null. */
    bridgeAt: (t: number) => { const o = buildings[occ[t]]; return o && o.bridge && o.decked ? o.bridge : null; },
    checkPlacement,
    checkWall,
    checkBridge,
    place,
    placeWall,
    placeBridge,
    /** Scenarios: every unfinished bridge piece of `team` done at once (materials and labour free). */
    finishBridges(team: number) {
      for (const b of buildings) {
        if (!b.bridge || b.team !== team || (b.state !== 'foundation' && b.state !== 'scaffold')) continue;
        b.delivered = { ...b.cost };
        if (b.state === 'foundation') (b.state = 'scaffold'), close(b);
        b.labour = b.need;
        finish(b);
      }
    },
    damage,
    setJob,
    release,
    claim(team: number, x: number, y: number, r = CLAIM_RADIUS) {
      claims.push({ team, x, y, r });
      repaint();
    },
    /** Server and scenario goods: into the team's home strongroom (negative n: taken out of it, as far as it goes). */
    addStock(team: number, res: ResourceKind, n: number) {
      if (n >= 0) put(reserveOf(team), res, n, region.id);
      else take(reserveOf(team), res, -n);
    },
    takeAt,
    addAt,
    haveAt,
    netAt,
    /** The network of store building id (-1: not a standing store, or cut off). */
    storeNet: (id: number) => (buildings[id] && buildings[id].def.store && standing(buildings[id]) ? storeNet(buildings[id]) : -1),
    /** The live hold of building id (store, chest), or null. */
    holdOf: (id: number): Hold | null => (buildings[id] && standing(buildings[id]) ? buildings[id].hold : null),
    reserveOf,
    influence: () => infl,
    nodeOk: (id: number) => id >= 0 && id < nodes.length && nodes[id].max > 0 && !nodes[id].locked,
    /** Mobs (./mobs.ts): a living guard lair locks its nodes (no gathering), clearing it frees them. */
    lockNodes(ids: number[], on: boolean) {
      for (const id of ids) if (nodes[id]) nodes[id].locked = on;
    },
    /** A site of `team` with work left (planned, half built or damaged). */
    siteOk: (id: number, team: number) => id >= 0 && id < buildings.length && buildings[id].team === team && unfinished(buildings[id]),
    /**
     * Remove an unfinished site (foundation or scaffold): its tiles open, its workers move on, loads on the way go back to
     * the stockpile in full and delivered materials at CANCEL_REFUND. False if there is no such site.
     */
    cancel(id: number): boolean {
      const b = buildings[id];
      if (!b || (b.state !== 'foundation' && b.state !== 'scaffold')) return false;
      for (const [r, v] of Object.entries(b.incoming) as [ResourceKind, number][]) if (v > 0) addAt(b.team, b.x, b.y, r, v);
      for (const [r, v] of Object.entries(b.delivered) as [ResourceKind, number][]) if (v > 0) addAt(b.team, b.x, b.y, r, v * CANCEL_REFUND);
      b.incoming = {};
      if (b.prev) {
        // an upgrade: the old piece stands on as it was (its workers leave: it is no longer unfinished); a grown inner row goes
        const p = b.prev;
        b.ti.slice(p.n).forEach((t, i) => {
          occ[t] = -1;
          if (p.n + i < b.saved.length) grid.cost[t] = b.saved[p.n + i];
          grid.dirty.push(t % w, (t / w) | 0);
        });
        b.ti.length = b.base.length = p.n;
        b.saved.length = Math.min(b.saved.length, p.n);
        b.tiles = b.tiles.slice(0, p.n * 2);
        bbox(b);
        Object.assign(b, { type: p.type, def: p.def, maxHp: p.maxHp, hp: Math.min(p.maxHp, b.hp), need: p.need, labour: p.need, cost: p.cost, costSum: p.costSum, delivered: p.delivered, prev: null });
        b.state = b.hp < b.maxHp / 2 ? 'damaged' : 'done';
        return true;
      }
      destroy(b);
      b.cancelled = true;
      if (b.def.store) storeVer++;
      return true;
    },
    /**
     * A done wall piece of `team` with a next tier becomes a site for it in place: new materials and labour, the old piece
     * standing meanwhile (state scaffold, upgradeFrom in the snapshot). False if it cannot.
     */
    upgrade(id: number, team: number): boolean {
      const b = buildings[id];
      if (!b || b.cancelled || b.team !== team || b.state !== 'done' || !b.def.upgrade) return false;
      const up = b.def.upgrade;
      // a thin wall growing a walkway takes an inner row (tiles taken by the line's own towers and gates are left out)
      let grow: number[] = [];
      if (BUILDINGS[up.to].depth === 2 && (b.def.depth ?? 1) < 2) {
        const skip = new Set<number>();
        for (const o of buildings) if (o !== b && o.team === team && o.def.wall && !o.cancelled && o.state !== 'destroyed') for (const t of o.ti) skip.add(t);
        grow = innerRow(b.tiles, b.inside, skip);
        if (checkTiles(team, grow, false)) return false;
      }
      const n = b.ti.length;
      b.prev = { type: b.type, def: b.def, maxHp: b.maxHp, hp: b.hp, need: b.need, cost: b.cost, costSum: b.costSum, delivered: b.delivered, n };
      for (let i = 0; i < grow.length; i += 2) {
        const t = grow[i + 1] * w + grow[i];
        b.ti.push(t);
        b.base.push(grid.height[t]);
        occ[t] = b.id;
      }
      b.tiles = [...b.tiles, ...grow];
      bbox(b);
      const k = b.def.perTile ? b.ti.length : 1;
      b.type = up.to;
      b.def = BUILDINGS[up.to];
      b.cost = {};
      b.costSum = 0;
      for (const [r, v] of Object.entries(up.cost) as [ResourceKind, number][]) (b.cost[r] = v * k), (b.costSum += v * k);
      b.delivered = {};
      b.incoming = {};
      b.labour = 0;
      b.need = up.labour * k;
      b.maxHp = b.def.hp * k;
      b.state = 'scaffold'; // already standing: no close()
      b.slots = workSlots(b);
      b.slotUser = b.slots.map(() => -1);
      b.users = 0;
      return true;
    },
    /** M2c: a building by id (read only), undefined if none. */
    piece: (id: number): Piece | undefined => buildings[id],
    /** Squared distance from (x,y) to the nearest footprint tile centre of building id (Infinity if none). */
    dist2: (id: number, x: number, y: number) => (buildings[id] ? near2(buildings[id].tiles, x, y) : Infinity),
    /** Nearest footprint tile centre of building id to (x,y). */
    nearestTile(id: number, x: number, y: number): [number, number] {
      const b = buildings[id];
      let best: [number, number] = [b.x, b.y], bd = Infinity;
      for (let i = 0; i < b.tiles.length; i += 2) {
        const d = (b.tiles[i] + 0.5 - x) ** 2 + (b.tiles[i + 1] + 0.5 - y) ** 2;
        if (d < bd) (bd = d), (best = [b.tiles[i] + 0.5, b.tiles[i + 1] + 0.5]);
      }
      return best;
    },
    /**
     * Up to n standing points (flat x,y) on open ground round building id (its 8-neighbour ring, off decks), nearest (x,y)
     * first; repeated when the ring is shorter than n.
     */
    /** A done (or damaged) workplace's crafter stations (x, y, fx, fy; see spotsOf); [] for anything else. */
    workSpots(id: number): Spot[] {
      const b = buildings[id];
      return b && b.def.workplace && (b.state === 'done' || b.state === 'damaged') ? spotsOf(b) : [];
    },
    ringPoints(id: number, n: number, x: number, y: number): number[] {
      const b = buildings[id];
      if (!b) return [];
      const own = new Set(b.ti);
      const ring: number[] = [];
      for (const t0 of b.ti)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const tx = (t0 % w) + dx, ty = ((t0 / w) | 0) + dy;
            if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
            const t = ty * w + tx;
            if (own.has(t) || ring.includes(t) || grid.cost[t] === 0 || occ[t] >= 0 || grid.deck[t] !== 0) continue;
            ring.push(t);
          }
      const d = (t: number) => ((t % w) + 0.5 - x) ** 2 + (((t / w) | 0) + 0.5 - y) ** 2;
      ring.sort((a, c) => d(a) - d(c) || a - c);
      const out: number[] = [];
      for (let i = 0; i < n && ring.length; i++) {
        const t = ring[i % ring.length];
        out.push((t % w) + 0.5, ((t / w) | 0) + 0.5);
      }
      return out;
    },
    /** Torches on building id for dt seconds: it catches after FIRE.kindle. False when it cannot burn (stone, gone, a bare foundation). */
    kindle(id: number, dt: number): boolean {
      const b = buildings[id];
      if (!canBurn(b)) return false;
      if (b.burn > 0) return true;
      b.kindle += dt * wetK(b);
      if (b.kindle >= FIRE.kindle) ignite(b);
      return true;
    },
    /** A fire arrow lands on building id: it catches with chance p if it can burn. */
    fireHit(id: number, p: number) {
      const b = buildings[id];
      if (canBurn(b) && b.burn <= 0 && chance(p * wetK(b))) ignite(b);
    },
    /**
     * M5h3 Fortifier: iron-bind a done gate of `team` (hp x FORT.iron, once) or hang wet hides on a done burnable piece
     * (FORT.wetCost hides a tile, for FORT.wetTicks); paid at once. False: refused (not its, wrong kind, no stock).
     */
    fortify(team: number, id: number, fort: 'ironGate' | 'wetHides'): boolean {
      const b = buildings[id];
      if (!b || b.team !== team || b.cancelled || (b.state !== 'done' && b.state !== 'damaged')) return false;
      if (fort === 'ironGate') {
        if (b.def.wall !== 'gate' || b.iron || !takeAt(team, b.x, b.y, FORT.ironCost)) return false;
        b.iron = true;
        b.maxHp *= FORT.iron;
        b.hp *= FORT.iron;
        return true;
      }
      if (!canBurn(b) || !takeAt(team, b.x, b.y, { hides: FORT.wetCost * b.ti.length })) return false;
      b.wet = tick + FORT.wetTicks;
      return true;
    },
    /** M5h3: the done field tile (stakes, ditch) on tile t, or undefined; any at all. */
    fieldAt: (t: number): Piece | undefined => {
      const b = fields > 0 && grid.trench[t] ? buildings[occ[t]] : undefined;
      return b && b.def.field ? b : undefined;
    },
    /** Men beat out the fire on building id for dt man-seconds; false when it is not burning. */
    douse(id: number, dt: number): boolean {
      const b = buildings[id];
      if (!b || b.burn <= 0) return false;
      b.burn = Math.max(0, b.burn - FIRE.douse * dt);
      if (b.burn <= 0) b.kindle = 0;
      return true;
    },
    ladderFoot,
    /** Raise siege engine `siege`'s ladder at the foot of foe wall tile (x,y): a done ladder building of `team`; its id, or -1. */
    raiseLadder(team: number, x: number, y: number, siege: number, type: 'ladder' | 'towerBridge' = 'ladder'): number {
      const foot = ladderFoot(team, x, y);
      if (foot < 0) return -1;
      const id = add(team, type, [foot % w, (foot / w) | 0], 0, undefined, occ[y * w + x]);
      const b = buildings[id];
      b.saved = [grid.cost[foot]];
      b.siege = siege;
      b.state = 'done';
      b.labour = b.need;
      b.hp = b.maxHp;
      raiseDeck(b);
      grid.gate[foot] = team + 1; // the attackers' way up: defenders push it, they do not climb down it
      return id;
    },
    /** Defenders push foe ladder `id` for dt man-seconds; true once it is pushed off (destroyed). */
    push(id: number, dt: number): boolean {
      const b = buildings[id];
      if (!b || b.type !== 'ladder' || b.state === 'destroyed' || b.cancelled) return false;
      b.push += dt / FIRE.push;
      if (b.push >= 1) destroy(b);
      return (b.state as BuildState) === 'destroyed';
    },
    /** W-35: a lit brazier of `team` within r (default BRAZIER.radius) of (x,y) at about height z (a level either way). */
    litNear(team: number, x: number, y: number, z: number, r = BRAZIER.radius): boolean {
      for (const b of braziers)
        if (b.team === team && b.fuel > 0 && b.state !== 'destroyed' && Math.abs(grid.height[b.ti[0]] - z) <= 1 && (b.x - x) ** 2 + (b.y - y) ** 2 <= r * r) return true;
      return false;
    },
    /** W-35: pitch the network of `team` at (x,y) holds. */
    pitch: (team: number, x: number, y: number) => haveAt(team, x, y).pitch ?? 0,
    /** Platform capacity of tower `id` (0: not a tower). */
    platCap: (id: number) => buildings[id]?.def.cap ?? 0,
    /** The building whose deck or stair tile t is, -1 none. */
    onBuilding: (t: number) => (t >= 0 && (grid.deck[t] !== 0 || onDeck(t)) ? occ[t] : -1),
    /**
     * Standing points (flat x,y) for up to n units on the walkway reached from deck tile t, nearest first along the deck: a
     * tower's platform (its cap in a grid) and the wall's outer face (the parapet) first, then the inner row, the tiles at
     * a stair head or ladder last, so the way up and along the 2-deep walk stays open.
     */
    deckPoints(t: number, n: number): number[] {
      if (t < 0 || grid.deck[t] !== DECK) return [];
      const ranks: number[][] = [[], [], []];
      const seen = new Set<number>([t]);
      const towers = new Set<number>();
      const queue = [t];
      for (let q = 0; q < queue.length && ranks[0].length < n * 2 && q < 8 * n + 16; q++) {
        const c = queue[q];
        const p = grid.plat[c];
        const x = c % w, y = (c / w) | 0;
        if (p >= 0) {
          if (!towers.has(p)) {
            towers.add(p);
            const b = buildings[p];
            const cap = b.def.cap ?? 1, cols = Math.ceil(Math.sqrt(cap)), rows = Math.ceil(cap / cols);
            const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
            for (let i = 0; i < cap; i++) {
              const px = x0 + ((i % cols) + 0.5) * (b.w / cols), py = y0 + (Math.floor(i / cols) + 0.5) * (b.h / rows);
              if (grid.deck[tileAt(grid, px, py)] === DECK) ranks[0].push(px, py); // not in the door
            }
          }
        } else {
          const b = buildings[occ[c]];
          let landing = false, outer = false;
          for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const o = ny * w + nx;
            if (grid.deck[o] > DECK) landing = true;
            else if (grid.deck[o] === 0 && b) {
              const ix = b.inside[0] - x - 0.5, iy = b.inside[1] - y - 0.5;
              if ((dx * ix + dy * iy) / (Math.hypot(ix, iy) || 1) < -0.5) outer = true;
            }
          }
          ranks[landing ? 2 : outer ? 0 : 1].push(x + 0.5, y + 0.5);
        }
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const o = ny * w + nx;
          if (seen.has(o) || grid.deck[o] !== DECK || Math.abs(grid.height[o] - grid.height[c]) > 1) continue;
          seen.add(o);
          queue.push(o);
        }
      }
      return ranks.flat().slice(0, n * 2);
    },
    /** What a worker does this tick: walk to a point, 'here' (stand: working, dropping or waiting), or null (no work: back to its slot). */
    work(u: Worker): Act {
      u.working = false;
      dropRefunded(u);
      return u.job === 'gather' ? gather(u) : u.job === 'build' ? build(u) : null;
    },
    /** Per tick, before the units: worker paths, node regrowth. */
    tick() {
      for (const u of pathQueue.splice(0, WORK_PATHS)) {
        u.wreq = false;
        if (!u.alive || !u.job) continue;
        u.wpath = path(u.squad.team, u.x, u.y, u.wgx, u.wgy);
        u.wpi = 1;
        detour(u);
      }
      fireTick();
      if (++tick % REGROW_TICKS === 0)
        for (const n of regrowing) {
          if (n.amount >= n.max) continue;
          let add = Math.min(n.max - n.amount, n.regrow * DT * REGROW_TICKS);
          if (n.kiln !== undefined) {
            // W-35: a kiln burns its team's wood into pitch
            const src = sources(n.kiln, n.x, n.y);
            let wood = 0;
            for (const hd of src) wood += amount(hd, 'wood');
            add = Math.min(add, wood / KILN.wood);
            if (add > 0) takeFrom(src, { wood: add * KILN.wood });
          }
          n.amount += add;
        }
      for (const b of braziers) if (b.fuel > 0 && b.state !== 'destroyed') b.fuel = Math.max(0, b.fuel - DT);
    },
    resourceNodes: (): NodeSnap[] =>
      nodes.map((n) => ({ id: n.id, res: n.res, x: n.x, y: n.y, amount: n.amount, max: n.max, ...(n.obj !== undefined ? { obj: n.obj } : {}), ...(n.building !== undefined ? { building: n.building } : {}), ...(n.locked ? { guarded: true as const } : {}) })),
    buildingSnaps: (): BuildingSnap[] =>
      buildings.filter((b) => !b.cancelled).map((b) => {
        let maxWorkers = 0;
        for (let k = 0; k < b.slots.length; k++) if (slotOk(b, k)) maxWorkers++;
        return {
          id: b.id, type: b.type, team: b.team, x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, tiles: b.tiles, state: b.state,
          progress: b.state === 'destroyed' ? 0 : b.labour / b.need, delivered: delivered(b), hp: b.hp, maxHp: b.maxHp,
          workers: b.users, maxWorkers,
          ...(b.def.tier ? { tier: b.def.tier } : {}),
          ...(b.def.walk ? { walk: b.decked ? b.def.walk : 0, depth: b.def.depth ?? 1 } : b.def.wall === 'segment' ? { depth: 1 } : {}),
          ...(b.attach >= 0 ? { attach: b.attach } : {}),
          ...(b.def.access === 'stairs' ? { steps: steps(b) } : {}),
          ...(b.door >= 0 ? { door: [b.door % w, (b.door / w) | 0] } : {}),
          ...(b.def.cap ? { cap: b.def.cap } : {}),
          ...(b.prev ? { upgradeFrom: b.prev.type } : {}),
          ...(b.burn > 0 ? { burning: b.burn } : {}),
          ...(b.def.brazier ? { lit: b.fuel > 0 && b.state !== 'destroyed', fuel: b.fuel / BRAZIER.life } : {}),
          ...(b.rubble ? { rubble: true as const } : {}),
          ...(b.siege >= 0 ? { siege: b.siege } : {}),
          ...(b.iron ? { iron: true as const } : {}),
          ...(b.wet > tick ? { wet: true as const } : {}),
          ...(b.push > 0 && b.state !== 'destroyed' ? { push: Math.min(1, b.push) } : {}),
          ...(b.bridge ? { bridge: { axis: b.bridge.axis, dir: b.bridge.dir, width: b.bridge.width, part: b.bridge.part, deck: b.bridge.deck, rows: b.bridge.rows } } : {}),
          ...(b.hold && b.state !== 'destroyed' ? { goods: totals(b.hold), ...(b.hold.items.length ? { items: b.hold.items.length } : {}) } : {}),
          ...(b.owner ? { owner: b.owner } : {}),
        };
      }),
    /** Per team: its strongroom and every standing store together (the HUD's totals; chests are their owners'). */
    stockSnap: () => {
      const out: Record<number, Partial<Record<ResourceKind, number>>> = {};
      for (const [team, s] of reserve) out[team] = totals(s);
      for (const b of storeList) if (standing(b)) totals(b.hold!, (out[b.team] ??= {}));
      return out;
    },
  };
}

export type Works = ReturnType<typeof createWorks>;
