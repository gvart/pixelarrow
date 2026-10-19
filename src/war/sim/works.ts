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
 */
import type { BuildingSnap, BuildingType, BuildState, InfluenceMap, NodeSnap, PlaceReason, PlaceResult, RegionData, ResourceKind, WallOrder, WallPlan } from '../types';
import { BUILDINGS, CANCEL_REFUND, CARRY, CLAIM_RADIUS, lineTiles, rectTiles, RESOURCE_NODES, rotated, SEGMENT, WALL_KIT, type BuildingDef } from './economy';
import { DECK, LADDER, lineClear, STAIR, tileAt, type Grid } from './grid';

const DT = 0.1;
const NEAR_NODE = 15; // an empty node's workers look this far for another of the same resource
const AT = 1.6; // a worker this near a footprint tile centre (or a node) is there
const WORK_PATHS = 6; // worker A* searches per tick
const REGROW_TICKS = 10;
const AT_SLOT = 0.3; // a worker this near its work slot is there
const WAIT_OFF = 2.5; // workers with no free slot wait this far off the footprint edge
const REPATH_NEAR = 6; // a site closing re-paths the workers headed this near its footprint
const LADDER_COST = 4; // move cost multiplier on a ladder (a slow climb)
const DOOR_COST = 2; // ... through a stone tower's door and inner stair

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
  const waits = new Map<number, [number, number, number]>(); // worker id -> [site, x, y]: where it waits for a free slot
  const active = new Set<Worker>(); // workers with a job
  const cutOff = new Map<number, number>(); // worker id -> a site it found no way to (until its next order)
  const waitAt = new Set<number>(); // tiles taken as wait spots
  const unwait = (u: Worker) => {
    const p = waits.get(u.id);
    if (p && p[1] >= 0) waitAt.delete(Math.floor(p[2]) * w + Math.floor(p[1]));
    waits.delete(u.id);
  };
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
    if (def.access) {
      const a = accessOf(team, type, tiles);
      const reason = a.reason ?? checkTiles(team, a.tiles, true, def.access === 'ladder');
      return reason ? { ok: false, reason, tiles: a.tiles } : { ok: true, tiles: a.tiles };
    }
    const reason = def.wall === 'segment' ? 'short' : checkTiles(team, tiles, true);
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

  const add = (team: number, type: BuildingType, tiles: number[], rot: 0 | 1, inside?: [number, number], attach = -1): number => {
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
    };
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
  const standable = (t: number, team: number) => grid.cost[t] > 0 && occ[t] < 0 && (!grid.gate[t] || grid.gate[t] === team + 1);

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
          if (inside.has(t) || seen.has(t) || !standable(t, b.team) || Math.abs(grid.height[t] - b.base[i0]) > 1) continue;
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

  const place = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0): number => {
    const r = checkPlacement(team, type, x, y, rot);
    if (!r.ok) return -1;
    return add(team, type, r.tiles, rot, undefined, BUILDINGS[type].access ? accessOf(team, type, r.tiles).attach : -1);
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
    // workers headed near it search their way again (the old path may run through it, or the goal is now cut off)
    const r = Math.max(b.w, b.h) / 2 + REPATH_NEAR;
    for (const u of active) if (u.alive && Math.abs(u.wgx - b.x) < r && Math.abs(u.wgy - b.y) < r) u.wgx = u.wgy = -1;
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
    if (d.access === 'stairs') return ramp(b);
    if (d.access === 'ladder') {
      const t = b.ti[0];
      grid.cost[t] = (b.saved[0] || 1) * LADDER_COST;
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

  const finish = (b: Building) => {
    b.state = 'done';
    b.hp = b.maxHp;
    if (b.prev) {
      b.prev = null;
      b.need = b.def.labour * (b.def.perTile ? b.ti.length : 1);
      b.labour = b.need;
    }
    raiseDeck(b);
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
    b.prev = null;
    lowerDeck(b);
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
      if (!b || b.team !== u.squad.team || !unfinished(b) || b.users >= b.slots.length || cutOff.get(u.id) === id) continue;
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
      if (!b || b.team !== u.squad.team || !unfinished(b) || cutOff.get(u.id) === id) continue;
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
      cutOff.set(u.id, b.id);
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
    const go = toSlot(u, b);
    if (go !== 'here') return go;
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
    } else if (b.saved.length < b.ti.length) close(b); // an upgrade's new inner row
    b.labour = Math.min(cap, b.labour + DT);
    b.hp = b.prev ? b.prev.hp + (b.maxHp - b.prev.hp) * (b.labour / b.need) : b.maxHp * Math.max(0.1, b.labour / b.need);
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
    /** A site of `team` with work left (planned, half built or damaged). */
    siteOk: (id: number, team: number) => id >= 0 && id < buildings.length && buildings[id].team === team && unfinished(buildings[id]),
    /**
     * Remove an unfinished site (foundation or scaffold): its tiles open, its workers move on, loads on the way go back to
     * the stockpile in full and delivered materials at CANCEL_REFUND. False if there is no such site.
     */
    cancel(id: number): boolean {
      const b = buildings[id];
      if (!b || (b.state !== 'foundation' && b.state !== 'scaffold')) return false;
      const st = stockOf(b.team);
      for (const [r, v] of Object.entries(b.incoming) as [ResourceKind, number][]) if (v > 0) st[r] = (st[r] ?? 0) + v;
      for (const [r, v] of Object.entries(b.delivered) as [ResourceKind, number][]) st[r] = (st[r] ?? 0) + v * CANCEL_REFUND;
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
    /** Platform capacity of tower `id` (0: not a tower). */
    platCap: (id: number) => buildings[id]?.def.cap ?? 0,
    /** The building whose deck or stair tile t is, -1 none. */
    onBuilding: (t: number) => (t >= 0 && grid.deck[t] !== 0 ? occ[t] : -1),
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
      }
      if (++tick % REGROW_TICKS === 0)
        for (const n of regrowing) if (n.amount < n.max) n.amount = Math.min(n.max, n.amount + n.regrow * DT * REGROW_TICKS);
    },
    resourceNodes: (): NodeSnap[] =>
      nodes.map((n) => ({ id: n.id, res: n.res, x: n.x, y: n.y, amount: n.amount, max: n.max, ...(n.obj !== undefined ? { obj: n.obj } : {}), ...(n.building !== undefined ? { building: n.building } : {}) })),
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
        };
      }),
    stockSnap: () => {
      const out: Record<number, Partial<Record<ResourceKind, number>>> = {};
      for (const [team, s] of stock) out[team] = { ...s };
      return out;
    },
  };
}

export type Works = ReturnType<typeof createWorks>;
