/**
 * Economy and construction state of the war sim (M2a, docs/impl/global-war-rebuild.md W-12, W-22..W-24): resource
 * nodes, team stockpiles, building sites, influence, and what each gathering or building unit does this tick.
 *
 * Gather: a worker walks to its node, harvests up to CARRY, carries the load to the nearest own store (camp,
 * storehouse, fort) and goes back; an empty node sends it to the nearest node of the same resource with a free slot.
 * Build: a worker takes what the site still lacks from the nearest store (the team stockpile), carries it to the site,
 * and labours once there is nothing to fetch. Labour never runs ahead of the materials delivered. The footprint
 * blocks from the first labour (scaffold); a finished gate opens again for its owner team only (grid.gate).
 * Influence: done buildings with a radius and claim anchors paint bit `team` of the mask.
 */
import type { BuildingSnap, BuildingType, BuildState, InfluenceMap, NodeSnap, PlaceReason, PlaceResult, RegionData, ResourceKind, WallOrder, WallPlan } from '../types';
import { BUILDINGS, CARRY, CLAIM_RADIUS, lineTiles, rectTiles, RESOURCE_NODES, rotated, SEGMENT, WALL_KIT, type BuildingDef } from './economy';
import { tileAt, type Grid } from './grid';

const DT = 0.1;
const NEAR_NODE = 15; // an empty node's workers look this far for another of the same resource
const AT = 1.6; // a worker this near a footprint tile centre (or a node) is there
const WORK_PATHS = 6; // worker A* searches per tick
const REGROW_TICKS = 10;

export interface WorkSquad { team: number; sites: number[]; node: number }
/** The part of a sim unit the works drive. */
export interface Worker {
  id: number; x: number; y: number; facing: number; alive: boolean;
  squad: WorkSquad;
  job: 'gather' | 'build' | null;
  carry: ResourceKind | null; load: number;
  wnode: number; // node it harvests, -1 none
  wsite: number; // site it builds, -1 none
  wfor: number; // site its load is reserved for, -1 none
  working: boolean; // harvesting or labouring this tick
  wgx: number; wgy: number; // where it walks
  wpath: number[]; wpi: number; wreq: boolean;
}

interface Node { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; regrow: number; rate: number; slots: number; users: number; tiles: number[]; obj?: number; building?: number }

interface Building {
  id: number; type: BuildingType; def: BuildingDef; team: number; rot: 0 | 1; x: number; y: number; w: number; h: number;
  tiles: number[]; // flat tile x,y
  ti: number[]; // tile indices
  state: BuildState; labour: number; need: number;
  cost: Partial<Record<ResourceKind, number>>; delivered: Partial<Record<ResourceKind, number>>; incoming: Partial<Record<ResourceKind, number>>;
  costSum: number; hp: number; maxHp: number; saved: number[]; // grid cost of its tiles before they closed
  users: number; node: number;
}

export type Act = [number, number] | null | 'here';

export function createWorks(grid: Grid, region: RegionData, path: (team: number, x0: number, y0: number, x1: number, y1: number) => number[], evict: (tiles: number[]) => void) {
  const { w, h } = grid;
  const nodes: Node[] = [];
  const nodeAt = new Int32Array(w * h).fill(-1); // foot tile -> object node (blocks placement while it has any left)
  const regrowing: Node[] = [];
  const buildings: Building[] = [];
  const occ = new Int32Array(w * h).fill(-1); // tile -> building that stands or is marked out there
  const noBuild = new Uint8Array(w * h);
  for (const r of region.noBuild) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) noBuild[y * w + x] = 1;
  const stock = new Map<number, Partial<Record<ResourceKind, number>>>();
  const claims: { team: number; x: number; y: number; r: number }[] = [];
  const infl: InfluenceMap = { w, h, mask: new Uint8Array(w * h), version: 0 };
  const pathQueue: Worker[] = [];
  let tick = 0;

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

  const stockOf = (team: number) => {
    let s = stock.get(team);
    if (!s) stock.set(team, (s = {}));
    return s;
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
  const checkTiles = (team: number, tiles: number[], flat: boolean): PlaceReason | null => {
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
      if (!(infl.mask[t] & (1 << team))) return 'influence';
      lo = Math.min(lo, grid.height[t]);
      hi = Math.max(hi, grid.height[t]);
    }
    return flat && hi - lo > 1 ? 'slope' : null;
  };

  const checkPlacement = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0): PlaceResult => {
    const [fw, fh] = rotated(type, rot);
    const tiles = rectTiles(x, y, fw, fh);
    const reason = BUILDINGS[type].wall === 'segment' ? 'short' : checkTiles(team, tiles, true);
    return reason ? { ok: false, reason, tiles } : { ok: true, tiles };
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

  const add = (team: number, type: BuildingType, tiles: number[], rot: 0 | 1): number => {
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
      hp: maxHp * 0.1, maxHp, saved: [], users: 0, node: -1,
    };
    for (let i = 0; i < tiles.length; i += 2) {
      const t = tiles[i + 1] * w + tiles[i];
      b.ti.push(t);
      occ[t] = b.id;
    }
    buildings.push(b);
    return b.id;
  };

  const place = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0): number => {
    const r = checkPlacement(team, type, x, y, rot);
    return r.ok ? add(team, type, r.tiles, rot) : -1;
  };

  const placeWall = (team: number, o: Omit<WallOrder, 'kind' | 'squad'>): number[] => {
    const plan = checkWall(team, o);
    return plan.ok ? plan.pieces.map((p) => add(team, p.type, p.tiles, 0)) : [];
  };

  // --- site life ---
  const delivered = (b: Building) => {
    if (b.costSum === 0) return 1;
    let s = 0;
    for (const v of Object.values(b.delivered)) s += v!;
    return s / b.costSum;
  };

  const close = (b: Building) => {
    for (const t of b.ti) {
      b.saved.push(grid.cost[t]);
      grid.cost[t] = 0;
    }
    grid.dirty.push(...b.tiles);
    evict(b.ti);
  };

  const finish = (b: Building) => {
    b.state = 'done';
    b.hp = b.maxHp;
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
      nodes.push(n);
      regrowing.push(n);
      b.node = n.id;
    }
    if (b.def.influence > 0) repaint();
  };

  const destroy = (b: Building) => {
    const closed = b.state !== 'foundation';
    const wasDone = b.state === 'done' || b.state === 'damaged';
    b.state = 'destroyed';
    b.hp = 0;
    for (const [i, t] of b.ti.entries()) {
      occ[t] = -1;
      if (closed && grid.cost[t] === 0) grid.cost[t] = b.saved[i];
      grid.gate[t] = 0;
    }
    if (closed) grid.dirty.push(...b.tiles);
    if (b.node >= 0) nodes[b.node].amount = nodes[b.node].max = nodes[b.node].regrow = 0;
    if (wasDone && b.def.influence > 0) repaint();
  };

  const damage = (id: number, dmg: number) => {
    const b = buildings[id];
    if (!b || b.state === 'destroyed') return;
    b.hp -= dmg;
    if (b.hp <= 0) destroy(b);
    else if (b.state === 'done' && b.hp < b.maxHp / 2) b.state = 'damaged';
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

  const release = (u: Worker) => {
    if (u.wnode >= 0) nodes[u.wnode].users--;
    if (u.wsite >= 0) buildings[u.wsite].users--;
    if (u.wfor >= 0 && u.carry) buildings[u.wfor].incoming[u.carry]! -= u.load;
    u.wnode = u.wsite = u.wfor = -1;
    u.working = false;
  };

  const setJob = (u: Worker, job: 'gather' | 'build' | null) => {
    release(u);
    u.job = job;
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
    if (f && f.res === res && f.amount >= 1 && f.users < f.slots) return f;
    let best: Node | null = null, bd = r * r;
    for (const n of nodes) {
      if (n.res !== res || n.amount < 1 || n.users >= n.slots) continue;
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
    const st = stockOf(u.squad.team);
    if (u.carry) st[u.carry] = (st[u.carry] ?? 0) + u.load;
    u.carry = null;
    u.load = 0;
    return 'here';
  };

  const gather = (u: Worker): Act => {
    let n = u.wnode >= 0 ? nodes[u.wnode] : null;
    if (u.load > 0 && (u.load >= CARRY - 1e-6 || (n && u.carry !== n.res))) return deliver(u);
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
    const take = Math.min(n.rate * DT, n.amount, CARRY - u.load);
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
  const siteCap = (b: Building) => Math.max(4, 2 * (b.w + b.h));

  const pickSite = (u: Worker): Building | null => {
    let best: Building | null = null, bd = Infinity;
    for (const id of u.squad.sites) {
      const b = buildings[id];
      if (!b || b.team !== u.squad.team || !unfinished(b) || b.users >= siteCap(b)) continue;
      const d = near2(b.tiles, u.x, u.y);
      if (d < bd) (bd = d), (best = b);
    }
    return best;
  };

  const build = (u: Worker): Act => {
    let b = u.wsite >= 0 ? buildings[u.wsite] : null;
    if (!b || !unfinished(b)) {
      if (b) (b.users--, (u.wsite = -1));
      b = pickSite(u);
      if (!b) return u.load > 0 && u.wfor < 0 ? deliver(u) : null;
      u.wsite = b.id;
      b.users++;
    }
    if (u.load > 0) {
      if (u.wfor !== b.id) {
        if (u.wfor >= 0 && u.carry) buildings[u.wfor].incoming[u.carry]! -= u.load;
        u.wfor = -1;
        return deliver(u);
      }
      if (!at(b.tiles, u)) return walkTo(u, ...spot(b.tiles, u, b.x, b.y));
      const r = u.carry!;
      b.delivered[r] = (b.delivered[r] ?? 0) + u.load;
      b.incoming[r]! -= u.load;
      u.carry = null;
      u.load = 0;
      u.wfor = -1;
      return 'here';
    }
    // fetch what the site still lacks, if the stockpile has it
    if (b.state !== 'damaged') {
      const st = stockOf(b.team);
      for (const [r, v] of Object.entries(b.cost) as [ResourceKind, number][]) {
        const lack = v - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0);
        if (lack < 1e-6 || !(st[r]! > 1e-6)) continue;
        const s = nearestStore(u);
        if (!s) break;
        if (!at(s.tiles, u)) return walkTo(u, ...spot(s.tiles, u, s.x, s.y));
        const take = Math.min(CARRY, lack, st[r]!);
        st[r]! -= take;
        b.incoming[r] = (b.incoming[r] ?? 0) + take;
        u.carry = r;
        u.load = take;
        u.wfor = b.id;
        return 'here';
      }
    }
    if (!at(b.tiles, u)) return walkTo(u, ...spot(b.tiles, u, b.x, b.y));
    u.facing = Math.atan2(b.y - u.y, b.x - u.x);
    if (b.state === 'damaged') {
      u.working = true;
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / b.need) * DT);
      if (b.hp >= b.maxHp / 2) b.state = 'done';
      return 'here';
    }
    const cap = b.need * delivered(b);
    if (b.labour >= cap) return 'here'; // waiting for materials
    u.working = true;
    if (b.state === 'foundation') {
      b.state = 'scaffold';
      close(b);
    }
    b.labour = Math.min(cap, b.labour + DT);
    b.hp = b.maxHp * Math.max(0.1, b.labour / b.need);
    if (b.labour >= b.need - 1e-9) finish(b);
    return 'here';
  };

  return {
    checkPlacement,
    checkWall,
    place,
    placeWall,
    damage,
    setJob,
    release,
    claim(team: number, x: number, y: number, r = CLAIM_RADIUS) {
      claims.push({ team, x, y, r });
      repaint();
    },
    addStock(team: number, res: ResourceKind, n: number) {
      const s = stockOf(team);
      s[res] = (s[res] ?? 0) + n;
    },
    influence: () => infl,
    nodeOk: (id: number) => id >= 0 && id < nodes.length && nodes[id].max > 0,
    /** What a worker does this tick: walk to a point, 'here' (stand: working, dropping or waiting), or null (no work: back to its slot). */
    work(u: Worker): Act {
      u.working = false;
      return u.job === 'gather' ? gather(u) : u.job === 'build' ? build(u) : null;
    },
    /** Per tick, before the units: worker paths, node regrowth. */
    tick() {
      for (const u of pathQueue.splice(0, WORK_PATHS)) {
        u.wreq = false;
        if (!u.alive || !u.job) continue;
        u.wpath = path(u.squad.team, u.x, u.y, u.wgx, u.wgy);
        u.wpi = 1;
      }
      if (++tick % REGROW_TICKS === 0)
        for (const n of regrowing) if (n.amount < n.max) n.amount = Math.min(n.max, n.amount + n.regrow * DT * REGROW_TICKS);
    },
    resourceNodes: (): NodeSnap[] =>
      nodes.map((n) => ({ id: n.id, res: n.res, x: n.x, y: n.y, amount: n.amount, max: n.max, ...(n.obj !== undefined ? { obj: n.obj } : {}), ...(n.building !== undefined ? { building: n.building } : {}) })),
    buildingSnaps: (): BuildingSnap[] =>
      buildings.map((b) => ({
        id: b.id, type: b.type, team: b.team, x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, tiles: b.tiles, state: b.state,
        progress: b.state === 'destroyed' ? 0 : b.labour / b.need, delivered: delivered(b), hp: b.hp, maxHp: b.maxHp,
      })),
    stockSnap: () => {
      const out: Record<number, Partial<Record<ResourceKind, number>>> = {};
      for (const [team, s] of stock) out[team] = { ...s };
      return out;
    },
  };
}

export type Works = ReturnType<typeof createWorks>;
