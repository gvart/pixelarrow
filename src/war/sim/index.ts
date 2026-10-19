/**
 * Live region war sim (docs/impl/global-war-rebuild.md, M1a + M1c): deterministic 10 Hz tick.
 * Positions are in tiles (floats; tile i spans [i, i+1)); facing is radians, atan2(dy, dx).
 *
 * A squad has an anchor that walks its A* path; each unit steers to its formation slot
 * around the anchor, or, when the slot is out of sight (behind a corner or cliff), along the
 * squad path. Units are pushed apart through a spatial hash, never end a tick inside another
 * body (`separate`) and never step onto blocked tiles. Once the squad is at rest each unit
 * settles in its slot, or as near as it gets when another unit stands there, and stops steering.
 *
 * Combat (M1c): units fight as individuals. A marching squad (move order under way) does
 * not fight. Any other squad picks targets among enemy squads nearby: holding or idle units
 * fight what comes into reach (melee may leave their slot by LEASH), attacking units break
 * formation to close on the target squad, whose centre the anchor chases. Missiles land
 * after a travel delay. Terrain rules live in ./combat.ts. A unit at 0 hp is dead (wounded or
 * killed), leaves the collision hash and its squad closes ranks. Melee needs real reach: the foe within
 * reach, at most one height level apart and no cliff between (see `reachable`); a foe across a cliff is
 * gone round by the squad path. A unit shows 'attack' only while it strikes in reach or shoots in range.
 *
 * Economy and building (M2a, ./works.ts): a squad on a gather or build order does not fight; its units work one by one
 * (harvest, carry, fetch, labour) and take WORK_DEFENCE more damage without blocking. Path searches and gates go by
 * the mover's team (grid.team).
 */
import { Rng } from '../../sim/rng';
import type { Order, RegionData, ShotSnap, Snapshot, SquadId, WarBuildSim } from '../types';
import { warStats, type WarStats } from './classes';
import { afterArmour, blockChance, COMBAT, heightRange, hitChance, meleeHeight, missileHeight } from './combat';
import { formationOffsets, type Shape } from './formation';
import { WORK_DEFENCE } from './economy';
import { BOG, buildGrid, canEnter, findPath, flushSectors, FOREST, lineClear, nearestOpen, tileAt, UPHILL, type Grid } from './grid';
import { createWorks, type Worker } from './works';

const DT = 0.1;
const SPEED = 1.5; // tiles/s on grass for a man on foot (class speed multiplies)
const CATCH_UP = 1.35; // units may outpace the anchor to reach their slot
const RADIUS = 0.35; // units closer than 2*RADIUS are pushed apart
const PUSH = 0.5; // fraction of the overlap resolved per tick
const TURN = 0.35; // max anchor turn per tick (rad)
const ARRIVE = 0.05;
const STALL = 10; // squad at rest: a unit that gets no nearer its slot this many ticks settles where it stands
const WAKE = 0.5; // a settled unit walks again when its slot moves this much further off
const RETRY = 10; // ticks between a settled unit's checks whether its taken slot has come free
const REPATH_TICKS = 20; // attack: re-path to the moving target
/**
 * Squad A* work per tick, in tiles of straight-line distance (deterministic, unlike a time budget):
 * via the sector layer a search costs about 1 ms per 150 tiles. At least one search runs per tick;
 * the rest wait in FIFO order.
 */
const PATH_BUDGET = 900;
const UNIT_PATHS_PER_TICK = 2; // short A* searches for stuck units
const SCAN = 5; // ticks between squad-level scans for enemy squads nearby
const NEAR = 26; // enemy squads whose centre is this close are target candidates
const RETARGET = 5; // ticks between target picks per unit (staggered by id)
const LEASH = 4; // holding melee leave their slot this far to fight
const CHARGE = 10; // attacking units break formation for a target this near
const MELEE_STOP = 1.5; // attack: the anchor stops this near the foe's centre
const REACH_PAD = 0.3; // body: reach is measured centre to centre
const YIELD = 0.08; // keep-right sidestep per tick when meeting another squad head-on
const YIELD_R = 1.2; // ... felt this far ahead (bodies never touch, see `separate`)
const STUCK_TICKS = 8;
const CLIMB_LOOK = 1.5; // tiles ahead a climb is felt
const FACE = 18; // a standing squad turns to face enemies this near
const FACE_TURN = 0.08; // rad per tick
const EVICT_R = 4; // a closing site moves the units on it to the nearest open tile on their level this near

interface Unit extends Worker {
  id: number;
  squad: Squad;
  slot: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  cls: string;
  st: WarStats;
  moving: boolean;
  wp: number; // index into squad.path when following it
  alive: boolean;
  wounded: boolean;
  fighting: boolean; // engaged: closing on or striking a foe
  striking: boolean; // in reach (melee) or in range (missiles) of its foe this tick
  swingAt: number; // tick of its last blow or shot, -1 none yet
  cd: number; // ticks to the next blow or shot
  ammo: number;
  tgt: Unit | null;
  vx: number; // unit direction it wants to walk (0,0 standing)
  vy: number;
  stuck: number;
  own: number[]; // personal detour (flat x,y) when stuck
  oi: number;
  ownReq: boolean;
  settled: boolean; // squad at rest and the unit is in its slot (or as near as it gets): no steering, not pushed
  settleD: number; // distance to its slot when it settled
  best: number; // nearest it has come to its slot since the squad came to rest
  stall: number; // ticks without getting nearer
  ox: number; // position at the start of the tick
  oy: number;
  want: number; // distance it set out to walk this tick, -1 when it stood to strike
  toSlot: boolean; // walking to its slot (not closing on a foe)
}

interface Squad {
  id: SquadId;
  owner: string;
  team: number;
  units: Unit[];
  alive: number;
  shape: Shape;
  offsets: number[];
  ax: number;
  ay: number;
  cx: number; // centre of the living units
  cy: number;
  facing: number;
  speed: number;
  ranged: boolean;
  path: number[]; // flat x,y points; path[0..1] is where the order was given
  pi: number; // next path point
  order: Order['kind'];
  target: SquadId;
  repathAt: number;
  goal: [number, number] | null; // queued path request
  near: Squad[];
  sites: number[]; // build order: the sites it works on
  node: number; // gather order: the node it was sent to
}

interface Missile {
  at: number;
  by: Unit;
  t: Unit;
  raw: number;
  ap: number;
}

export function createSim(region: RegionData, seed: number): WarBuildSim {
  const grid: Grid = buildGrid(region);
  const rng = new Rng(seed);
  const squads: Squad[] = [];
  const units: Unit[] = [];
  const queue: Order[] = [];
  const pathQueue: Squad[] = [];
  const unitPathQueue: Unit[] = [];
  let missiles: Missile[] = [];
  let shots: ShotSnap[] = [];
  const reslotQueue = new Set<Squad>();
  let tick = 0;
  let stepMs = 0;

  // spatial hash, one cell per tile
  const head = new Int32Array(grid.w * grid.h);
  let next = new Int32Array(0);

  const works = createWorks(
    grid,
    region,
    (team, x0, y0, x1, y1) => {
      grid.team = team;
      return cornerPath(x0, y0, x1, y1);
    },
    (tiles) => {
      // a site closed its footprint: units standing on it step to the nearest open tile
      const shut = new Set(tiles);
      for (const u of units) {
        const here = tileAt(grid, u.x, u.y);
        if (!u.alive || !shut.has(here)) continue;
        // the nearest open tile on its own level (not up on a cliff beside the site), else any
        let o = -1;
        let bd = Infinity;
        const tx = Math.floor(u.x);
        const ty = Math.floor(u.y);
        for (let y = Math.max(0, ty - EVICT_R); y <= Math.min(grid.h - 1, ty + EVICT_R); y++)
          for (let x = Math.max(0, tx - EVICT_R); x <= Math.min(grid.w - 1, tx + EVICT_R); x++) {
            const t = y * grid.w + x;
            const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
            if (d < bd && grid.cost[t] > 0 && Math.abs(grid.height[t] - grid.height[here]) <= 1) (bd = d), (o = t);
          }
        if (o < 0) o = nearestOpen(grid, tx, ty);
        u.x = (o % grid.w) + 0.5;
        u.y = Math.floor(o / grid.w) + 0.5;
      }
    },
  );

  const hAt = (x: number, y: number) => grid.height[tileAt(grid, x, y)];
  const groundAt = (x: number, y: number) => grid.ground[tileAt(grid, x, y)];

  const openPoint = (x: number, y: number): [number, number] => {
    const t = tileAt(grid, x, y);
    if (t >= 0 && grid.cost[t] > 0) return [x, y];
    const o = nearestOpen(grid, Math.min(grid.w - 1, Math.max(0, Math.floor(x))), Math.min(grid.h - 1, Math.max(0, Math.floor(y))));
    return [(o % grid.w) + 0.5, Math.floor(o / grid.w) + 0.5];
  };

  const slotPos = (s: Squad, slot: number): [number, number] => {
    const f = s.offsets[slot * 2];
    const r = s.offsets[slot * 2 + 1];
    const c = Math.cos(s.facing);
    const sn = Math.sin(s.facing);
    return [s.ax + c * f - sn * r, s.ay + sn * f + c * r];
  };

  /** Tile path from (x0,y0) to (x1,y1) as flat corner points, ending at the goal (or as near as it gets). */
  const cornerPath = (x0: number, y0: number, x1: number, y1: number): number[] => {
    const [gx, gy] = openPoint(x1, y1);
    const goal = tileAt(grid, gx, gy);
    const tiles = findPath(grid, tileAt(grid, x0, y0), goal);
    const pts = [x0, y0];
    for (let i = 1; i < tiles.length - 1; i++) {
      const a = tiles[i - 1], b = tiles[i], c = tiles[i + 1];
      if (b - a !== c - b) pts.push((b % grid.w) + 0.5, Math.floor(b / grid.w) + 0.5);
    }
    const last = tiles[tiles.length - 1];
    if (last === goal) pts.push(gx, gy);
    else pts.push((last % grid.w) + 0.5, Math.floor(last / grid.w) + 0.5);
    return pts;
  };

  const pathTo = (s: Squad, x: number, y: number) => {
    s.path = cornerPath(s.ax, s.ay, x, y);
    s.pi = 1;
    for (const u of s.units) {
      u.wp = 0;
      u.own = [];
    }
  };

  const requestPath = (s: Squad, x: number, y: number) => {
    if (!s.goal) pathQueue.push(s);
    s.goal = [x, y];
  };

  /** Living units take slots 0..n-1 in their old order; the formation is rebuilt for n. */
  const reslot = (s: Squad) => {
    let k = 0;
    for (const u of s.units) if (u.alive) u.slot = k++;
    if (k > 0) s.offsets = formationOffsets(s.shape, k, rng);
    let minSpeed = Infinity;
    let ranged = 0;
    for (const u of s.units) {
      if (!u.alive) continue;
      minSpeed = Math.min(minSpeed, u.st.speed);
      if (u.ammo > 0 && u.st.range > 0) ranged++;
    }
    if (k > 0) s.speed = minSpeed;
    s.ranged = ranged * 2 > k;
  };

  /** A new squad of s's owner and team takes these living units of s, holding where they stand. */
  const detach = (s: Squad, picked: Unit[]) => {
    if (!picked.length) return;
    let x = 0;
    let y = 0;
    for (const u of picked) (x += u.x), (y += u.y);
    const [ax, ay] = openPoint(x / picked.length, y / picked.length);
    const ns: Squad = {
      ...s, id: squads.length, units: [], alive: 0, ax, ay, cx: ax, cy: ay, path: [], pi: 0, order: 'hold', target: -1, goal: null,
      near: [], sites: [], node: -1,
    };
    squads.push(ns);
    move(s, ns, picked);
    if (s.order === 'gather' || s.order === 'build') for (const u of ns.units) works.setJob(u, null);
    scanNear();
  };

  /** Living units leave s for t (and take up t's work order, if any); both re-form. */
  const move = (s: Squad, t: Squad, picked: Unit[]) => {
    const set = new Set(picked);
    s.units = s.units.filter((u) => !set.has(u));
    s.alive -= picked.length;
    for (const u of picked) {
      u.squad = t;
      u.settled = false;
      u.own = [];
      u.wp = 0;
      u.tgt = null;
      t.units.push(u);
    }
    t.alive += picked.length;
    if (s.alive > 0) reslot(s);
    reslot(t);
  };

  const apply = (o: Order) => {
    if (o.kind === 'cancelSite') {
      works.cancel(o.site);
      return;
    }
    if ((o.kind === 'placeBuilding' || o.kind === 'placeWall') && o.squad === undefined) {
      // no squad: a planned site, built once a squad gets a build order for it
      if (o.team === undefined) return;
      if (o.kind === 'placeBuilding') works.place(o.team, o.type, o.x, o.y, o.rot ?? 0);
      else works.placeWall(o.team, o);
      return;
    }
    const s = squads[o.squad ?? -1];
    if (!s) return;
    if (o.kind === 'detach') {
      const alive = s.units.filter((u) => u.alive);
      const ids = o.unitIds ? new Set(o.unitIds) : null;
      const n = Math.min(alive.length - 1, ids ? alive.length : Math.floor(o.count ?? 0));
      detach(s, n <= 0 ? [] : ids ? alive.filter((u) => ids.has(u.id)).slice(0, n) : alive.slice(alive.length - n));
      return;
    }
    if (o.kind === 'merge') {
      const t = squads[o.into];
      if (!t || t === s || t.team !== s.team || t.owner !== s.owner || s.alive === 0) return;
      const picked = s.units.filter((u) => u.alive);
      for (const u of picked) if (u.job) works.setJob(u, null);
      move(s, t, picked);
      s.order = 'hold';
      s.path = [];
      s.goal = null;
      if (t.order === 'gather' || t.order === 'build') for (const u of picked) works.setJob(u, t.order);
      return;
    }
    if (o.kind === 'stopWork') {
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      s.order = 'hold';
      s.path = [];
      s.goal = null;
      return;
    }
    if (o.kind === 'formation') {
      s.shape = o.shape;
      reslot(s);
      return;
    }
    if (o.kind === 'placeBuilding' || o.kind === 'placeWall' || o.kind === 'build' || o.kind === 'gather') {
      const sites =
        o.kind === 'placeBuilding' ? [works.place(s.team, o.type, o.x, o.y, o.rot ?? 0)].filter((id) => id >= 0)
        : o.kind === 'placeWall' ? works.placeWall(s.team, o)
        : o.kind === 'build' ? (works.siteOk(o.site, s.team) ? [o.site] : [])
        : [];
      if (o.kind !== 'gather' && !sites.length) return; // invalid placement: the squad carries on
      if (o.kind === 'gather' && !works.nodeOk(o.node)) return;
      s.order = o.kind === 'gather' ? 'gather' : 'build';
      s.sites = sites;
      s.node = o.kind === 'gather' ? o.node : -1;
      s.path = [];
      s.goal = null;
      for (const u of s.units) if (u.alive) works.setJob(u, s.order);
      return;
    }
    if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
    s.order = o.kind;
    if (o.kind === 'move') requestPath(s, o.x, o.y);
    else if (o.kind === 'hold') {
      s.path = [];
      s.goal = null;
    } else if (squads[o.target] && squads[o.target].team !== s.team) {
      s.target = o.target;
      s.repathAt = tick;
    } else s.order = 'hold';
  };

  const dist2 = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;

  const scanNear = () => {
    for (const s of squads) {
      s.near = [];
      if (s.alive === 0) continue;
      for (const o of squads) if (o.team !== s.team && o.alive > 0 && dist2(s, o) < NEAR * NEAR) s.near.push(o);
    }
  };

  const updateAttack = (s: Squad) => {
    let t = squads[s.target];
    if (t.alive === 0) {
      // the foe is down: take on the nearest other enemy in sight, else stand
      let best: Squad | null = null;
      for (const o of s.near) if (!best || dist2(s, o) < dist2(s, best)) best = o;
      if (!best) {
        s.order = 'hold';
        s.path = [];
        s.goal = null;
        return;
      }
      s.target = best.id;
      s.repathAt = tick;
      t = best;
    }
    const stop = s.ranged ? Math.max(MELEE_STOP, warRange(s) * 0.8) : MELEE_STOP;
    // melee stop only with a walkable line to the foe: under a cliff they go round
    if (Math.hypot(t.cx - s.ax, t.cy - s.ay) < stop && (s.ranged || lineClear(grid, s.ax, s.ay, t.cx, t.cy))) {
      s.path = [];
      s.goal = null;
    } else if (tick >= s.repathAt) {
      requestPath(s, t.cx, t.cy);
      s.repathAt = tick + REPATH_TICKS;
    }
  };

  const warRange = (s: Squad) => {
    let r = 0;
    for (const u of s.units) if (u.alive && u.ammo > 0) r = Math.max(r, u.st.range);
    return r;
  };

  /**
   * Cost of walking from (x,y) in unit direction (ux,uy): the terrain just ahead, slower while
   * climbing (looking far enough ahead to feel a slope of 1 level per few tiles).
   */
  const moveCost = (x: number, y: number, ux: number, uy: number) => {
    const here = tileAt(grid, x, y);
    const ahead = tileAt(grid, x + ux * 0.5, y + uy * 0.5);
    const c = ahead >= 0 && grid.cost[ahead] > 0 ? grid.cost[ahead] : grid.cost[here];
    const up = tileAt(grid, x + ux * CLIMB_LOOK, y + uy * CLIMB_LOOK);
    return up >= 0 && grid.height[up] > grid.height[here] ? c * UPHILL : c;
  };

  /** A standing squad turns its front to the nearest enemy squad in sight. */
  const faceThreat = (s: Squad) => {
    let best: Squad | null = null;
    for (const o of s.near) if (!best || dist2(s, o) < dist2(s, best)) best = o;
    if (!best || dist2(s, best) > FACE * FACE) return;
    let turn = Math.atan2(best.cy - s.ay, best.cx - s.ax) - s.facing;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    s.facing += Math.max(-FACE_TURN, Math.min(FACE_TURN, turn));
  };

  const stepSquad = (s: Squad) => {
    if (s.alive === 0) return;
    if (s.pi >= s.path.length / 2) {
      if (!s.goal) faceThreat(s);
      return;
    }
    // slow down while the units lag behind their slots (fighters off their slot don't count)
    let lag = 0;
    let n = 0;
    for (const u of s.units) {
      if (!u.alive || u.fighting) continue;
      const [sx, sy] = slotPos(s, u.slot);
      lag += Math.hypot(sx - u.x, sy - u.y);
      n++;
    }
    lag = n ? lag / n : 0;
    let budget = SPEED * s.speed * DT * Math.min(1, Math.max(0.25, 1.25 - lag / 6));
    while (budget > 0 && s.pi < s.path.length / 2) {
      const tx = s.path[s.pi * 2];
      const ty = s.path[s.pi * 2 + 1];
      const dx = tx - s.ax;
      const dy = ty - s.ay;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const want = Math.atan2(dy, dx);
        let turn = want - s.facing;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        s.facing += Math.max(-TURN, Math.min(TURN, turn));
      }
      const cost = moveCost(s.ax, s.ay, dx / (d || 1), dy / (d || 1));
      const step = budget / cost;
      if (step >= d) {
        s.ax = tx;
        s.ay = ty;
        s.pi++;
        budget -= d * cost;
      } else {
        s.ax += (dx / d) * step;
        s.ay += (dy / d) * step;
        budget = 0;
      }
    }
  };

  /** Point the unit steers to: its detour, its slot when in sight, else the furthest visible point of the squad path. */
  const unitTarget = (u: Unit): [number, number] => {
    const s = u.squad;
    if (u.own.length) {
      while (u.oi < u.own.length / 2 - 1 && Math.hypot(u.own[u.oi * 2] - u.x, u.own[u.oi * 2 + 1] - u.y) < 0.3) u.oi++;
      const ox = u.own[u.oi * 2];
      const oy = u.own[u.oi * 2 + 1];
      if (u.oi < u.own.length / 2 - 1 || Math.hypot(ox - u.x, oy - u.y) > 0.3) return [ox, oy];
      u.own = [];
    }
    const [sx, sy] = slotPos(s, u.slot);
    if (lineClear(grid, u.x, u.y, sx, sy)) return [sx, sy];
    const last = Math.min(s.pi, s.path.length / 2 - 1);
    for (let j = last; j > u.wp; j--) {
      if (lineClear(grid, u.x, u.y, s.path[j * 2], s.path[j * 2 + 1])) {
        u.wp = j;
        break;
      }
    }
    if (u.wp < s.path.length / 2) return [s.path[u.wp * 2], s.path[u.wp * 2 + 1]];
    return [s.ax, s.ay];
  };

  /** Move by (dx,dy), sliding along blocked tiles and cliffs. */
  const tryMove = (u: Unit, dx: number, dy: number) => {
    const from = tileAt(grid, u.x, u.y);
    const ok = (x: number, y: number) => {
      const t = tileAt(grid, x, y);
      return t === from || (t >= 0 && canEnter(grid, from, t));
    };
    if (ok(u.x + dx, u.y + dy)) {
      u.x += dx;
      u.y += dy;
    } else if (ok(u.x + dx, u.y)) u.x += dx;
    else if (ok(u.x, u.y + dy)) u.y += dy;
  };

  const working = (u: Unit) => u.squad.order === 'gather' || u.squad.order === 'build';

  const hurt = (t: Unit, dmg: number) => {
    t.hp -= dmg * (working(t) ? WORK_DEFENCE : 1);
    if (t.hp > 0) return;
    t.hp = 0;
    t.alive = false;
    works.release(t);
    t.fighting = false;
    t.moving = false;
    t.tgt = null;
    t.wounded = rng.chance(COMBAT.woundedShare);
    t.squad.alive--;
    reslotQueue.add(t.squad);
  };

  /** Melee can land: at most one height level apart and a walkable line between (no cliff, no blocked tile). */
  const reachable = (u: Unit, t: Unit) => Math.abs(hAt(u.x, u.y) - hAt(t.x, t.y)) <= 1 && lineClear(grid, u.x, u.y, t.x, t.y);

  /**
   * Nearest living enemy among the squads nearby; a holding unit only looks as far as it may fight.
   * Melee skip foes near at hand they cannot reach (across a cliff): they go round with the squad instead.
   */
  const pickTarget = (u: Unit, attacking: boolean, foe: Squad | null): Unit | null => {
    const s = u.squad;
    const shoot = u.ammo > 0 && u.st.range > 0;
    const maxD = attacking ? Infinity : shoot ? u.st.range + heightRange(COMBAT.missileMaxDiff) : LEASH + u.st.reach + REACH_PAD;
    let best: Unit | null = null;
    let bestScore = maxD * maxD;
    for (const o of s.near) {
      const bias = attacking && o !== foe ? 9 : 0; // attackers prefer the ordered target unless another foe is much nearer
      for (const t of o.units) {
        if (!t.alive) continue;
        const d2 = (t.x - u.x) ** 2 + (t.y - u.y) ** 2 + bias;
        if (d2 < bestScore) {
          if (!shoot && d2 < CHARGE * CHARGE && !reachable(u, t)) continue;
          bestScore = d2;
          best = t;
        }
      }
    }
    return best;
  };

  const strike = (u: Unit, t: Unit, dh: number) => {
    const bog = groundAt(u.x, u.y) === BOG;
    u.cd = Math.round(u.st.atkTicks * (bog ? COMBAT.bogAtk : 1) * (dh < 0 ? COMBAT.uphillAtk : 1));
    u.swingAt = tick;
    if (!working(t) && rng.chance(blockChance(t.st.block, t.facing, u.x - t.x, u.y - t.y, false, groundAt(t.x, t.y) === BOG))) return;
    hurt(t, afterArmour(u.st.dmg * meleeHeight(dh) * (bog ? COMBAT.bogDmg : 1), t.st.armor, 0));
  };

  const shoot = (u: Unit, t: Unit, d: number, dh: number, range: number) => {
    u.ammo--;
    u.cd = u.st.shotTicks;
    u.swingAt = tick;
    const land = tick + Math.max(1, Math.round(d / u.st.shotSpeed / DT));
    shots.push({ x0: u.x, y0: u.y, x1: t.x, y1: t.y, t0: tick, t1: land, z0: hAt(u.x, u.y), z1: hAt(t.x, t.y), by: u.id, kind: u.st.missile });
    if (u.ammo === 0) reslotQueue.add(u.squad);
    if (!rng.chance(hitChance(u.st.accuracy, d, range, groundAt(t.x, t.y) === FOREST))) return;
    const bog = groundAt(u.x, u.y) === BOG;
    missiles.push({ at: land, by: u, t, raw: u.st.rangedDmg * COMBAT.missileDmg * missileHeight(dh) * (bog ? COMBAT.bogDmg : 1), ap: u.st.ap });
  };

  const land = () => {
    if (!missiles.length) return;
    const keep: Missile[] = [];
    for (const m of missiles) {
      if (m.at > tick) {
        keep.push(m);
        continue;
      }
      const t = m.t;
      if (!t.alive) continue;
      if (!working(t) && rng.chance(blockChance(t.st.block, t.facing, m.by.x - t.x, m.by.y - t.y, true, groundAt(t.x, t.y) === BOG))) continue;
      hurt(t, afterArmour(m.raw, t.st.armor, m.ap));
    }
    missiles = keep;
  };

  /**
   * Fighting for one unit this tick. Returns the point to walk to when it closes on a foe,
   * `null` to fall back to its formation slot, or the unit itself to stand and fight.
   */
  const fight = (u: Unit): [number, number] | null | Unit => {
    const s = u.squad;
    u.fighting = false;
    u.striking = false;
    if (u.cd > 0) u.cd--;
    if (s.order === 'move' && (s.goal || s.pi < s.path.length / 2)) {
      u.tgt = null; // marching: no fighting
      return null;
    }
    if (!s.near.length) {
      u.tgt = null;
      return null;
    }
    const attacking = s.order === 'attack';
    const foe = attacking ? squads[s.target] : null;
    if (!u.tgt || !u.tgt.alive || (tick + u.id) % RETARGET === 0) u.tgt = pickTarget(u, attacking, foe);
    const t = u.tgt;
    if (!t) return null;
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    const dh = hAt(u.x, u.y) - hAt(t.x, t.y);
    const missile = u.ammo > 0 && u.st.range > 0;
    const range = missile ? u.st.range + heightRange(dh) : u.st.reach + REACH_PAD;
    if (d <= range && (missile || reachable(u, t))) {
      u.fighting = true;
      u.striking = true;
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cd <= 0) {
        if (missile) shoot(u, t, d, dh, range);
        else strike(u, t, dh);
      }
      return u;
    }
    if (attacking ? d < CHARGE + (missile ? range : 0) : !missile && d < LEASH + range) {
      if (lineClear(grid, u.x, u.y, t.x, t.y)) {
        u.fighting = true;
        // ranged close only into range; melee all the way
        if (missile) {
          const k = (d - range * 0.9) / d;
          return [u.x + (t.x - u.x) * k, u.y + (t.y - u.y) * k];
        }
        return [t.x, t.y];
      }
    }
    return null;
  };

  /**
   * Hard spacing: no two living units end a tick closer than a body (2*RADIUS), whatever squad,
   * except two that are both fighting (the press of a melee). A unit standing (settled or
   * striking) holds its spot and the other one gives way.
   */
  /** Workers walk through their own side's bodies (a standing squad would fence them off their store or site). */
  const ghost = (a: Unit, b: Unit) => (a.job !== null || b.job !== null) && a.squad.team === b.squad.team;

  const separate = () => {
    head.fill(-1);
    for (let i = 0; i < units.length; i++) {
      if (!units[i].alive) continue;
      const c = tileAt(grid, units[i].x, units[i].y);
      next[i] = head[c];
      head[c] = i;
    }
    const MIN = 2 * RADIUS;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const cx = Math.floor(u.x);
      const cy = Math.floor(u.y);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(grid.h - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(grid.w - 1, cx + 1); xx++) {
          for (let j = head[yy * grid.w + xx]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            const o = units[j];
            let ex = u.x - o.x;
            let ey = u.y - o.y;
            const e = Math.hypot(ex, ey);
            if (e >= MIN || (u.fighting && o.fighting) || ghost(u, o)) continue;
            if (e < 1e-8) {
              ex = u.id < o.id ? 1 : -1;
              ey = 0;
            } else {
              ex /= e;
              ey /= e;
            }
            const uFix = u.settled || u.striking || u.working;
            const oFix = o.settled || o.striking || o.working;
            const k = uFix === oFix ? 0.5 : uFix ? 0 : 1;
            const gap = MIN - e;
            grid.team = u.squad.team;
            if (k > 0) tryMove(u, ex * gap * k, ey * gap * k);
            grid.team = o.squad.team;
            if (k < 1) tryMove(o, -ex * gap * (1 - k), -ey * gap * (1 - k));
          }
        }
      }
    }
  };

  const step = () => {
    const t0 = performance.now();
    for (const o of queue.splice(0)) apply(o);
    for (const s of squads) {
      if (s.alive === 0) continue;
      let x = 0;
      let y = 0;
      for (const u of s.units) {
        if (!u.alive) continue;
        x += u.x;
        y += u.y;
      }
      s.cx = x / s.alive;
      s.cy = y / s.alive;
    }
    flushSectors(grid); // sites that closed or opened tiles last tick
    if (tick % SCAN === 0) scanNear();
    for (const s of squads) if (s.order === 'attack' && s.alive > 0) (grid.team = s.team), updateAttack(s);
    for (let budget = PATH_BUDGET; budget > 0 && pathQueue.length > 0; ) {
      const s = pathQueue.shift()!;
      if (!s.goal) continue; // cancelled by hold
      budget -= Math.hypot(s.goal[0] - s.ax, s.goal[1] - s.ay);
      grid.team = s.team;
      pathTo(s, s.goal[0], s.goal[1]);
      s.goal = null;
    }
    works.tick();
    for (const u of unitPathQueue.splice(0, UNIT_PATHS_PER_TICK)) {
      u.ownReq = false;
      if (!u.alive) continue;
      grid.team = u.squad.team;
      const [tx, ty] = unitTarget(u);
      u.own = cornerPath(u.x, u.y, tx, ty);
      u.oi = 1;
    }
    for (const s of squads) stepSquad(s);

    head.fill(-1);
    if (next.length !== units.length) next = new Int32Array(units.length);
    for (let i = 0; i < units.length; i++) {
      if (!units[i].alive) continue;
      const c = tileAt(grid, units[i].x, units[i].y);
      next[i] = head[c];
      head[c] = i;
    }

    const R2 = 4 * RADIUS * RADIUS;
    /** No other unit stands within a body of (x,y). */
    const free = (x: number, y: number, i: number) => {
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(grid.h - 1, cy + 1); yy++)
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(grid.w - 1, cx + 1); xx++)
          for (let j = head[yy * grid.w + xx]; j !== -1; j = next[j]) if (j !== i && (units[j].x - x) ** 2 + (units[j].y - y) ** 2 < R2) return false;
      return true;
    };
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const ox = u.x;
      const oy = u.y;
      grid.team = u.squad.team;
      let act: [number, number] | null | Unit;
      if (u.job) {
        u.fighting = u.striking = false;
        u.tgt = null;
        const w = works.work(u);
        act = w === 'here' ? u : w;
      } else act = fight(u);
      let dx = 0;
      let dy = 0;
      let d = 0;
      if (act !== u) {
        const [tx, ty] = (act as [number, number] | null) ?? unitTarget(u);
        dx = tx - u.x;
        dy = ty - u.y;
        d = Math.hypot(dx, dy);
        // squad at rest: settle in the slot, or as near as it gets when another unit stands on it
        // (two units pulled to one spot otherwise push and sidestep round each other for ever)
        const s = u.squad;
        if (act === null && s.pi >= s.path.length / 2 && !s.goal) {
          if (u.settled) {
            const k = Math.min(1, (3 * RADIUS) / Math.max(d, 1e-6)); // the way into the slot must be open too
            const retry = d > ARRIVE && (tick + u.id) % RETRY === 0 && free(tx, ty, i) && free(u.x + dx * k, u.y + dy * k, i);
            if (d > u.settleD + WAKE || (retry && lineClear(grid, u.x, u.y, tx, ty))) {
              u.settled = false;
              u.best = d;
              u.stall = 0;
            }
          } else if (d < u.best - 0.02) {
            u.best = d;
            u.stall = 0;
          } else if (++u.stall > STALL) u.best = 0;
          if (!u.settled && (d <= ARRIVE || u.best === 0)) {
            u.settled = true;
            u.settleD = d;
          }
        } else {
          u.settled = false;
          u.best = Infinity;
          u.stall = 0;
        }
        if (u.settled) d = 0;
      } else u.settled = false;
      if (d > ARRIVE) {
        const cost = moveCost(u.x, u.y, dx / d, dy / d);
        const step = Math.min(d, (SPEED * u.st.speed * CATCH_UP * DT) / cost);
        u.vx = dx / d;
        u.vy = dy / d;
        dx = u.vx * step;
        dy = u.vy * step;
      } else {
        dx = 0;
        dy = 0;
        u.vx = 0;
        u.vy = 0;
      }
      // separation from every unit in the 3x3 tiles around (a settled unit stands; movers go round it)
      let yielded = false;
      const cx = Math.floor(u.x);
      const cy = Math.floor(u.y);
      for (let yy = u.settled ? grid.h : cy - 1; yy <= cy + 1; yy++) {
        if (yy < 0 || yy >= grid.h) continue;
        for (let xx = cx - 1; xx <= cx + 1; xx++) {
          if (xx < 0 || xx >= grid.w) continue;
          for (let j = head[yy * grid.w + xx]; j !== -1; j = next[j]) {
            if (j === i) continue;
            const o = units[j];
            if (ghost(u, o)) continue;
            const ex = u.x - o.x;
            const ey = u.y - o.y;
            const e2 = ex * ex + ey * ey;
            // head-on with another unit just ahead: both keep to their right and slip past
            if (!yielded && e2 < YIELD_R * YIELD_R && u.vx * o.vx + u.vy * o.vy < -0.3 && ex * u.vx + ey * u.vy < 0) {
              yielded = true;
              dx -= u.vy * YIELD;
              dy += u.vx * YIELD;
            }
            if (e2 >= R2) continue;
            if (e2 < 1e-8) {
              // exact overlap: split by id so the result is deterministic
              dx += u.id < o.id ? 0.05 : -0.05;
              continue;
            }
            const e = Math.sqrt(e2);
            const push = ((2 * RADIUS - e) * PUSH) / 2;
            dx += (ex / e) * push;
            dy += (ey / e) * push;
          }
        }
      }
      // never step closer into a body: slide along it instead
      if (dx || dy) {
        for (let yy = cy - 1; yy <= cy + 1; yy++) {
          if (yy < 0 || yy >= grid.h) continue;
          for (let xx = cx - 1; xx <= cx + 1; xx++) {
            if (xx < 0 || xx >= grid.w) continue;
            for (let j = head[yy * grid.w + xx]; j !== -1; j = next[j]) {
              if (j === i) continue;
              const o = units[j];
              const px = u.x + dx - o.x;
              const py = u.y + dy - o.y;
              const p2 = px * px + py * py;
              if (p2 >= R2 || p2 < 1e-8 || (u.fighting && o.fighting) || ghost(u, o)) continue;
              const now = Math.hypot(u.x - o.x, u.y - o.y);
              const p = Math.sqrt(p2);
              if (p >= now) continue;
              const keep = Math.min(2 * RADIUS, now) / p;
              dx = o.x + px * keep - u.x;
              dy = o.y + py * keep - u.y;
            }
          }
        }
      }
      tryMove(u, dx, dy);
      u.ox = ox;
      u.oy = oy;
      u.want = act === u ? -1 : d;
      u.toSlot = act === null;
    }
    for (let k = 0; k < 3; k++) separate();
    for (const u of units) {
      if (!u.alive) continue;
      const mx = u.x - u.ox;
      const my = u.y - u.oy;
      u.moving = mx * mx + my * my > 1e-4;
      if (u.want >= 0) u.facing = u.moving && u.want > ARRIVE ? Math.atan2(my, mx) : u.squad.facing;
      // walled in on the way to its slot: find a detour of its own
      if (u.toSlot && u.want > 0.5 && !u.moving) {
        if (++u.stuck > STUCK_TICKS && !u.ownReq && !u.own.length) {
          u.ownReq = true;
          unitPathQueue.push(u);
        }
      } else if (u.job && u.want > 0.5 && !u.moving) {
        // a worker caught on a corner of its path (a cliff edge): it searches again from where it stands
        if (++u.stuck > STUCK_TICKS) (u.stuck = 0), (u.wgx = u.wgy = -1);
      } else u.stuck = 0;
    }
    land();
    for (const s of reslotQueue) reslot(s);
    reslotQueue.clear();
    if (shots.length) shots = shots.filter((sh) => sh.t1 > tick);
    tick++;
    stepMs = performance.now() - t0;
  };

  return {
    region,
    spawnSquad(owner, team, cls, count, x, y) {
      const [ax, ay] = openPoint(x, y);
      const st = warStats(cls);
      const s: Squad = {
        id: squads.length, owner, team, units: [], alive: count, shape: 'line', offsets: formationOffsets('line', count, rng),
        ax, ay, cx: ax, cy: ay, facing: 0, speed: st.speed, ranged: st.range > 0, path: [], pi: 0, order: 'hold', target: -1,
        repathAt: 0, goal: null, near: [], sites: [], node: -1,
      };
      grid.team = team;
      squads.push(s);
      for (let k = 0; k < count; k++) {
        const [sx, sy] = slotPos(s, k);
        const [px, py] = lineClear(grid, ax, ay, sx, sy) ? [sx, sy] : [ax + rng.range(-0.2, 0.2), ay + rng.range(-0.2, 0.2)];
        const u: Unit = {
          id: units.length, squad: s, slot: k, x: px, y: py, facing: 0, hp: st.maxHp, maxHp: st.maxHp, cls, st, moving: false, wp: 0,
          alive: true, wounded: false, fighting: false, striking: false, swingAt: -1, cd: 0, ammo: st.ammo, tgt: null, vx: 0, vy: 0, stuck: 0, own: [], oi: 0, ownReq: false,
          settled: false, settleD: 0, best: Infinity, stall: 0, ox: px, oy: py, want: 0, toSlot: false,
          job: null, carry: null, load: 0, wnode: -1, wsite: -1, wslot: -1, wfor: -1, working: false, wgx: -1, wgy: -1, wpath: [], wpi: 0, wreq: false,
        };
        units.push(u);
        s.units.push(u);
      }
      scanNear();
      return s.id;
    },
    order(o) {
      queue.push(o);
    },
    step,
    snapshot(): Snapshot {
      return {
        tick,
        units: units.map((u) => {
          // in reach of a foe still standing, or the blow just dealt felled it
          const atk = u.alive && u.striking && (!!u.tgt?.alive || u.swingAt === tick - 1);
          return {
            id: u.id, squad: u.squad.id, x: u.x, y: u.y, facing: u.facing, hp: u.hp, maxHp: u.maxHp, cls: u.cls,
            state: !u.alive ? 'dead' : atk ? 'attack' : u.working ? u.job! : u.moving ? 'move' : 'idle',
            ...(u.alive ? {} : { wounded: u.wounded }),
            ...(u.alive && u.load > 0 ? { carry: u.carry!, load: u.load } : {}),
            ...(atk ? { ready: Math.max(0, u.cd - 1), ...(u.swingAt >= 0 ? { swing: tick - 1 - u.swingAt } : {}) } : {}),
          };
        }),
        squads: squads.map((s) => ({ id: s.id, owner: s.owner, team: s.team, units: s.units.map((u) => u.id), order: s.order })),
        shots: shots.map((sh) => ({ ...sh })),
        buildings: works.buildingSnaps(),
        stock: works.stockSnap(),
        influenceVersion: works.influence().version,
      };
    },
    stats() {
      return { stepMs, units: units.filter((u) => u.alive).length };
    },
    checkPlacement: works.checkPlacement,
    checkWall: works.checkWall,
    resourceNodes: works.resourceNodes,
    influence: works.influence,
    claim: works.claim,
    addStock: works.addStock,
    damageBuilding: works.damage,
  };
}
