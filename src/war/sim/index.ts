/**
 * Live region war sim (docs/impl/global-war-rebuild.md, M1a): deterministic 10 Hz tick.
 * Positions are in tiles (floats; tile i spans [i, i+1)); facing is radians, atan2(dy, dx).
 *
 * A squad has an anchor that walks its A* path; each unit steers to its formation slot
 * around the anchor, or, when the slot is out of sight (behind a corner or cliff), along the
 * squad path. Units are pushed apart through a spatial hash and never step onto blocked tiles.
 * Combat is M1c: an attack order only walks to the target squad.
 */
import { Rng } from '../../sim/rng';
import type { Order, RegionData, Snapshot, SquadId, WarSim } from '../types';
import { formationOffsets, type Shape } from './formation';
import { buildGrid, canEnter, findPath, lineClear, nearestOpen, stepCost, tileAt, type Grid } from './grid';

const DT = 0.1;
const SPEED = 1.5; // tiles/s on grass
const CATCH_UP = 1.35; // units may outpace the anchor to reach their slot
const RADIUS = 0.35; // units closer than 2*RADIUS are pushed apart
const PUSH = 0.5; // fraction of the overlap resolved per tick
const TURN = 0.35; // max anchor turn per tick (rad)
const ARRIVE = 0.05;
const REPATH_TICKS = 20; // attack: re-path to the moving target
const PATHS_PER_TICK = 4; // A* searches per tick (~1.5 ms each cross-map on test-ridge); the rest wait in FIFO order

interface Unit {
  id: number;
  squad: Squad;
  slot: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  cls: string;
  moving: boolean;
  wp: number; // index into squad.path when following it
}

interface Squad {
  id: SquadId;
  owner: string;
  team: number;
  units: Unit[];
  shape: Shape;
  offsets: number[];
  ax: number;
  ay: number;
  facing: number;
  path: number[]; // flat x,y points; path[0..1] is where the order was given
  pi: number; // next path point
  order: Order['kind'];
  target: SquadId;
  repathAt: number;
  goal: [number, number] | null; // queued path request
}

export function createSim(region: RegionData, seed: number): WarSim {
  const grid: Grid = buildGrid(region);
  const rng = new Rng(seed);
  const squads: Squad[] = [];
  const units: Unit[] = [];
  const queue: Order[] = [];
  const pathQueue: Squad[] = [];
  let tick = 0;
  let stepMs = 0;

  // spatial hash, one cell per tile
  const head = new Int32Array(grid.w * grid.h);
  let next = new Int32Array(0);

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

  const pathTo = (s: Squad, x: number, y: number) => {
    const [gx, gy] = openPoint(x, y);
    const start = tileAt(grid, s.ax, s.ay);
    const goal = tileAt(grid, gx, gy);
    const tiles = findPath(grid, start, goal);
    const pts = [s.ax, s.ay];
    // keep only corners of the tile path
    for (let i = 1; i < tiles.length - 1; i++) {
      const a = tiles[i - 1], b = tiles[i], c = tiles[i + 1];
      if (b - a !== c - b) pts.push((b % grid.w) + 0.5, Math.floor(b / grid.w) + 0.5);
    }
    const last = tiles[tiles.length - 1];
    if (last === goal) pts.push(gx, gy);
    else pts.push((last % grid.w) + 0.5, Math.floor(last / grid.w) + 0.5);
    s.path = pts;
    s.pi = 1;
    for (const u of s.units) u.wp = 0;
  };

  const requestPath = (s: Squad, x: number, y: number) => {
    if (!s.goal) pathQueue.push(s);
    s.goal = [x, y];
  };

  const apply = (o: Order) => {
    const s = squads[o.squad];
    if (!s) return;
    if (o.kind === 'formation') {
      s.shape = o.shape;
      s.offsets = formationOffsets(o.shape, s.units.length, rng);
      return;
    }
    s.order = o.kind;
    if (o.kind === 'move') requestPath(s, o.x, o.y);
    else if (o.kind === 'hold') {
      s.path = [];
      s.goal = null;
    }
    else if (squads[o.target]) {
      s.target = o.target;
      s.repathAt = tick;
    }
  };

  const updateAttack = (s: Squad) => {
    const t = squads[s.target];
    if (Math.hypot(t.ax - s.ax, t.ay - s.ay) < 2) s.path = [];
    else if (tick >= s.repathAt) {
      requestPath(s, t.ax, t.ay);
      s.repathAt = tick + REPATH_TICKS;
    }
  };

  const stepSquad = (s: Squad) => {
    if (s.pi >= s.path.length / 2) return;
    // slow down while the units lag behind their slots
    let lag = 0;
    for (const u of s.units) {
      const [sx, sy] = slotPos(s, u.slot);
      lag += Math.hypot(sx - u.x, sy - u.y);
    }
    lag /= s.units.length;
    const here = tileAt(grid, s.ax, s.ay);
    let budget = SPEED * DT * Math.min(1, Math.max(0.25, 1.25 - lag / 6));
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
      const ahead = tileAt(grid, s.ax + (dx / (d || 1)) * 0.5, s.ay + (dy / (d || 1)) * 0.5);
      const cost = ahead >= 0 && grid.cost[ahead] > 0 ? stepCost(grid, here, ahead) : grid.cost[here];
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

  /** Point the unit steers to: its slot when in sight, else the furthest visible point of the squad path. */
  const unitTarget = (u: Unit): [number, number] => {
    const s = u.squad;
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

  const step = () => {
    const t0 = performance.now();
    for (const o of queue.splice(0)) apply(o);
    for (const s of squads) if (s.order === 'attack') updateAttack(s);
    for (const s of pathQueue.splice(0, PATHS_PER_TICK)) {
      if (!s.goal) continue; // cancelled by hold
      pathTo(s, s.goal[0], s.goal[1]);
      s.goal = null;
    }
    for (const s of squads) stepSquad(s);

    head.fill(-1);
    if (next.length !== units.length) next = new Int32Array(units.length);
    for (let i = 0; i < units.length; i++) {
      const c = tileAt(grid, units[i].x, units[i].y);
      next[i] = head[c];
      head[c] = i;
    }

    const R2 = 4 * RADIUS * RADIUS;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const ox = u.x;
      const oy = u.y;
      const [tx, ty] = unitTarget(u);
      let dx = tx - u.x;
      let dy = ty - u.y;
      const d = Math.hypot(dx, dy);
      if (d > ARRIVE) {
        const here = tileAt(grid, u.x, u.y);
        const ahead = tileAt(grid, u.x + (dx / d) * 0.5, u.y + (dy / d) * 0.5);
        const cost = ahead >= 0 && grid.cost[ahead] > 0 ? stepCost(grid, here, ahead) : grid.cost[here];
        const step = Math.min(d, (SPEED * CATCH_UP * DT) / cost);
        dx = (dx / d) * step;
        dy = (dy / d) * step;
      } else {
        dx = 0;
        dy = 0;
      }
      // separation from every unit in the 3x3 tiles around
      const cx = Math.floor(u.x);
      const cy = Math.floor(u.y);
      for (let yy = cy - 1; yy <= cy + 1; yy++) {
        if (yy < 0 || yy >= grid.h) continue;
        for (let xx = cx - 1; xx <= cx + 1; xx++) {
          if (xx < 0 || xx >= grid.w) continue;
          for (let j = head[yy * grid.w + xx]; j !== -1; j = next[j]) {
            if (j === i) continue;
            const ex = u.x - units[j].x;
            const ey = u.y - units[j].y;
            const e2 = ex * ex + ey * ey;
            if (e2 >= R2) continue;
            if (e2 < 1e-8) {
              // exact overlap: split by id so the result is deterministic
              dx += u.id < units[j].id ? 0.05 : -0.05;
              continue;
            }
            const e = Math.sqrt(e2);
            const push = ((2 * RADIUS - e) * PUSH) / 2;
            dx += (ex / e) * push;
            dy += (ey / e) * push;
          }
        }
      }
      tryMove(u, dx, dy);
      const mx = u.x - ox;
      const my = u.y - oy;
      u.moving = mx * mx + my * my > 1e-4;
      u.facing = u.moving && d > ARRIVE ? Math.atan2(my, mx) : u.squad.facing;
    }
    tick++;
    stepMs = performance.now() - t0;
  };

  return {
    region,
    spawnSquad(owner, team, cls, count, x, y) {
      const [ax, ay] = openPoint(x, y);
      const s: Squad = {
        id: squads.length, owner, team, units: [], shape: 'line', offsets: formationOffsets('line', count, rng),
        ax, ay, facing: 0, path: [], pi: 0, order: 'hold', target: -1, repathAt: 0, goal: null,
      };
      squads.push(s);
      for (let k = 0; k < count; k++) {
        const [sx, sy] = slotPos(s, k);
        const [px, py] = lineClear(grid, ax, ay, sx, sy) ? [sx, sy] : [ax + rng.range(-0.2, 0.2), ay + rng.range(-0.2, 0.2)];
        const u: Unit = { id: units.length, squad: s, slot: k, x: px, y: py, facing: 0, hp: 100, maxHp: 100, cls, moving: false, wp: 0 };
        units.push(u);
        s.units.push(u);
      }
      return s.id;
    },
    order(o) {
      queue.push(o);
    },
    step,
    snapshot(): Snapshot {
      return {
        tick,
        units: units.map((u) => ({
          id: u.id, squad: u.squad.id, x: u.x, y: u.y, facing: u.facing, hp: u.hp, maxHp: u.maxHp, cls: u.cls,
          state: u.moving ? 'move' : 'idle',
        })),
        squads: squads.map((s) => ({ id: s.id, owner: s.owner, team: s.team, units: s.units.map((u) => u.id), order: s.order })),
      };
    },
    stats() {
      return { stepMs, units: units.length };
    },
  };
}
