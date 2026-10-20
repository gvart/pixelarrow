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
 *
 * Wall-walks (W-27, W-28, ./works.ts, grid.deck): a move order onto a walkway or tower platform gives the squad fixed
 * standing points along the deck (`fixed`) instead of its formation; units climb by placed stairs, a ladder or a stone
 * tower's door and fight from the top with the height rules above (a foe on the ground is 2+ levels below: no melee either
 * way). A tower platform or ladder takes at most its cap.
 *
 * Siege (M2c, ./siege.ts, fire and breaches in ./works.ts): a crewing squad (`siege`) stands at its engine's crew points and
 * drives it with its orders; it does not fight while the engine has work. Task orders (ignite, extinguish, pushLadder,
 * attackBuilding without an engine, buildSiege) send the squad's men to standing points round the target (`fixed`); each
 * man there does the task, and the squad holds once it is done. Men under a ram's roof dodge RAM.cover of missiles.
 *
 * Bridges (./works.ts): a man on a finished bridge's deck or ramp keeps to one of its lanes (as many as the bridge is tiles
 * wide, LANE apart across the centre line), never beside them over the water. A squad whose path near its anchor runs over
 * a bridge (or with a man on one) marches as a column as wide as the bridge (`col`: slots along the path, FILE apart, one
 * lane a file), the rest queueing behind on the bank, and takes its formation again once over.
 *
 * Neutral regions (W-12, ./mobs.ts): spawnMobs() puts a squad of team MOB_TEAM on every region lair; the mob controller
 * orders them each tick (wander, aggro, leash back). claimRegion walks a squad to a claim point, where it channels.
 */
import { Rng } from '../../sim/rng';
import type { Order, RegionData, ShotSnap, Snapshot, SquadId, SquadSnap, UnitSnap, WarBuildSim, WarPerson, WarSkillId } from '../types';
import { warStats, warStatsOf, type WarStats } from './classes';
import { afterArmour, blockChance, COMBAT, heightRange, hitChance, meleeHeight, missileHeight } from './combat';
import { formationOffsets, type Shape } from './formation';
import { BRAZIER, BUILDINGS, WORK_DEFENCE } from './economy';
import { BOG, buildGrid, canEnter, DECK, findPath, flushSectors, FOREST, lineClear, nearestOpen, tileAt, UPHILL, type Grid } from './grid';
import { createWorks, type Worker } from './works';
import { createSiege, LADDER, RAM } from './siege';
import { createMobs, MOB_OWNER, MOB_TEAM, mobClass } from './mobs';
import { createVision } from './vision';
import { DETACH_MIN, SQUAD_MAX } from './soldiers';
import { ACTIVE, ACTIVES, activeCooldown, F, FLAG_FX } from './skills';

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
const FALL = 0.4; // share of max hp a man loses when the bridge under him collapses over a ford
const UNIT_PATHS_PER_TICK = 2; // short A* searches for stuck units
const SCAN = 5; // ticks between squad-level scans for enemy squads nearby
const NEAR = 26; // enemy squads whose centre is this close are target candidates
const RETARGET = 5; // ticks between target picks per unit (staggered by id)
const LEASH = 4; // holding melee leave their slot this far to fight
const CHARGE = 10; // attacking units break formation for a target this near
const MELEE_STOP = 1.5; // attack: the anchor stops this near the foe's centre
const REACH_PAD = 0.3; // body: reach is measured centre to centre
const HOLD_OFF = 2.5; // an attack path that cannot reach its foe (cut off): melee stop this far back along it
const YIELD = 0.08; // keep-right sidestep per tick when meeting another squad head-on
const YIELD_R = 1.2; // ... felt this far ahead (bodies never touch, see `separate`)
const STUCK_TICKS = 8;
const CLIMB_LOOK = 1.5; // tiles ahead a climb is felt
const FACE = 18; // a standing squad turns to face enemies this near
const FACE_TURN = 0.08; // rad per tick
const EVICT_R = 4; // a closing site moves the units on it to the nearest open tile on their level this near
const TASK_AT = 1.6; // a man this near a target's footprint tile (or engine) works on it
const BUILDING_MELEE = 0.08; // share of a blow's damage a building or engine takes
const ARROW_BUILDING = 0.05; // ... of an arrow's
const FIRE_RELOAD = 1.5; // fire arrows: slower reload
const FIRE_ARROW = 0.2; // chance a fire arrow sets the wood it is shot at alight
const FIRE_DECK = 0.08; // ... the wood deck under the man it is shot at
const RAM_ROOF = 2; // crew this near their ram are under its roof
const FILE = 0.75; // tiles between men in file on a bridge (1.5 m; a tile is 2 m, a body 1.4 m)
const LANE = 0.8; // tiles between the lanes of a bridge 2 or 3 wide
const COL_AHEAD = 3; // tiles of path ahead of the anchor that put its squad in column for a bridge
const TASK_REPOINT = 10; // ticks between standing point updates for a task on a moving engine

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
  crossing: boolean; // on a bridge, its slot off it: walks on along its lane (does not settle there)
  settled: boolean; // squad at rest and the unit is in its slot (or as near as it gets): no steering, not pushed
  settleD: number; // distance to its slot when it settled
  best: number; // nearest it has come to its slot since the squad came to rest
  stall: number; // ticks without getting nearer
  ox: number; // position at the start of the tick
  oy: number;
  want: number; // distance it set out to walk this tick, -1 when it stood to strike
  toSlot: boolean; // walking to its slot (not closing on a foe)
  doing: UnitSnap['task'] | null; // its siege task this tick
  person: WarPerson | null; // M5b: the soldier record it was spawned from (null: a class spawn)
}

/** A task order (M2c): the target building b or engine e (-1 none). */
interface Task { kind: 'ignite' | 'extinguish' | 'pushLadder' | 'attackBuilding' | 'buildSiege'; b: number; e: number }

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
  fixed: number[] | null; // standing points (flat x,y) on a wall walkway, by slot, instead of the formation
  col: number[] | null; // crossing a bridge: column slots (flat x,y) along the path, by slot, instead of the formation
  siege: number; // the engine it crews, -1 none
  task: Task | null;
  fire: boolean; // fire arrows
  claimPt: number; // claimRegion: the claim point it goes to and channels at, -1 none
  pair: SquadId; // M5a: the other detachment of its split (-1 none): a split squad splits no further until merged back
  // M5c squad active: from its best-ranked man holding one (null none), his WIL; ready again / buff over at these ticks;
  // while on, damage it deals and takes is multiplied by out / inn (1 otherwise): read in hit resolution
  act: WarSkillId | null;
  actWil: number;
  actReady: number;
  actUntil: number;
  out: number;
  inn: number;
}

interface Missile {
  at: number;
  by: Unit;
  t: Unit | null; // null: at a building b or engine e, or a fire arrow that missed its man
  raw: number;
  ap: number;
  b?: number;
  e?: number;
  fb?: number; // fire arrow: the wood deck under its man
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
    (p) => rng.chance(p),
    (tiles) => {
      // a bridge piece collapsed: men on its tiles fall in; deep water drowns them (killed or wounded), a ford hurts
      const down = new Set(tiles);
      for (const u of units) {
        const t = tileAt(grid, u.x, u.y);
        if (!u.alive || !down.has(t)) continue;
        hurt(u, grid.cost[t] === 0 ? Infinity : u.maxHp * FALL);
      }
    },
  );

  const siege = createSiege(works, rng, {
    path: (team, x0, y0, x1, y1) => {
      grid.team = team;
      return cornerPath(x0, y0, x1, y1);
    },
    crewNear(crew, x, y, r) {
      let n = 0;
      for (const u of squads[crew]?.units ?? []) if (u.alive && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) n++;
      return n;
    },
    splash(x, y, r, dmg, ap) {
      for (const u of units) if (u.alive && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) hurt(u, afterArmour(dmg, u.st.armor, ap));
    },
    open(x, y) {
      const t = tileAt(grid, x, y);
      return t >= 0 && grid.cost[t] > 0 && grid.deck[t] === 0;
    },
    cost(x, y) {
      const t = tileAt(grid, x, y);
      return t >= 0 && grid.cost[t] > 0 ? grid.cost[t] : 1;
    },
  });

  const mobs = createMobs(region, {
    squads,
    spawn: (kind, count, x, y) => api.spawnSquad(MOB_OWNER, MOB_TEAM, mobClass(kind), count, x, y),
    order: (o) => apply(o),
    arrived: (id) => !squads[id].goal && squads[id].pi >= squads[id].path.length / 2,
    nodes: () => works.resourceNodes(),
    lockNodes: works.lockNodes,
    claim: (team, x, y, r) => works.claim(team, x, y, r),
    influenced: (x, y) => works.influence().mask[tileAt(grid, x, y)] !== 0,
    range: (lo, hi) => rng.range(lo, hi),
    w: grid.w,
    h: grid.h,
  });

  const vision = createVision(grid, { units: () => units, buildings: () => works.buildingSnaps() });

  const hAt = (x: number, y: number) => grid.height[tileAt(grid, x, y)];
  const groundAt = (x: number, y: number) => grid.ground[tileAt(grid, x, y)];

  const openPoint = (x: number, y: number): [number, number] => {
    const t = tileAt(grid, x, y);
    if (t >= 0 && grid.cost[t] > 0) return [x, y];
    const o = nearestOpen(grid, Math.min(grid.w - 1, Math.max(0, Math.floor(x))), Math.min(grid.h - 1, Math.max(0, Math.floor(y))));
    return [(o % grid.w) + 0.5, Math.floor(o / grid.w) + 0.5];
  };

  const slotPos = (s: Squad, slot: number): [number, number] => {
    if (s.fixed && slot * 2 < s.fixed.length) return [s.fixed[slot * 2], s.fixed[slot * 2 + 1]];
    if (s.col && slot * 2 < s.col.length) return [s.col[slot * 2], s.col[slot * 2 + 1]];
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
      if (b - a !== c - b || grid.deck[a] !== grid.deck[b] || grid.deck[c] !== grid.deck[b]) pts.push((b % grid.w) + 0.5, Math.floor(b / grid.w) + 0.5); // corners, and both ends of a step on or off a stair or deck
    }
    const last = tiles[tiles.length - 1];
    if (last === goal) pts.push(gx, gy);
    else pts.push((last % grid.w) + 0.5, Math.floor(last / grid.w) + 0.5);
    return pts;
  };

  const pathTo = (s: Squad, x: number, y: number) => {
    s.path = cornerPath(s.ax, s.ay, x, y);
    // melee attacking a foe they cannot get to (up on a wall with no way up from their side): stand off short of the
    // wall's foot, not pressed against it
    const n = s.path.length;
    if (s.order === 'attack' && !s.ranged && n >= 4 && tileAt(grid, s.path[n - 2], s.path[n - 1]) !== tileAt(grid, ...openPoint(x, y))) trimEnd(s.path, HOLD_OFF);
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
    // M5c: the squad's active is its best-ranked man's (highest level, then first in the squad) who holds one
    let lead: Unit | null = null, act: WarSkillId | null = null;
    for (const u of s.units) {
      if (!u.alive || !u.person || (lead && lead.person!.hero.level >= u.person.hero.level)) continue;
      const a = u.person.skills?.find((id) => ACTIVES[id]);
      if (a) (lead = u), (act = a);
    }
    s.act = act;
    s.actWil = lead?.person!.hero.attrs.wil ?? 5;
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
      near: [], sites: [], node: -1, fixed: null, col: null, siege: -1, task: null, claimPt: -1, pair: s.id,
    };
    s.pair = ns.id;
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
    if (o.kind === 'upgrade' && o.squad === undefined) {
      if (o.team !== undefined) works.upgrade(o.building, o.team);
      return;
    }
    if ((o.kind === 'placeBuilding' || o.kind === 'placeWall' || o.kind === 'placeBridge') && o.squad === undefined) {
      // no squad: a planned site, built once a squad gets a build order for it
      if (o.team === undefined) return;
      if (o.kind === 'placeBuilding') works.place(o.team, o.type, o.x, o.y, o.rot ?? 0);
      else if (o.kind === 'placeBridge') works.placeBridge(o.team, o);
      else works.placeWall(o.team, o);
      return;
    }
    const s = squads[o.squad ?? -1];
    if (!s) return;
    if (o.kind === 'fireArrows') {
      s.fire = o.on;
      return;
    }
    if (o.kind === 'active') {
      // M5c: fires when ready (no other effect on the squad's order)
      const fx = s.act ? ACTIVES[s.act] : undefined;
      if (!fx || tick < s.actReady || s.alive === 0) return;
      s.out = fx.out;
      s.inn = fx.in;
      s.actUntil = tick + ACTIVE.buff;
      s.actReady = tick + activeCooldown(s.actWil);
      return;
    }
    if (s.siege >= 0 && (o.kind === 'move' || o.kind === 'hold' || o.kind === 'attackBuilding' || o.kind === 'deploy' || o.kind === 'raiseLadder')) {
      // the crew drives its engine
      const id = s.siege;
      if (o.kind === 'move') siege.move(id, o.x, o.y);
      else if (o.kind === 'hold') siege.hold(id);
      else if (o.kind === 'deploy') siege.deploy(id, !!o.pack);
      else if (o.kind === 'raiseLadder') {
        if (!siege.raise(id, o.wallTile[0], o.wallTile[1])) return;
      } else if (o.building === undefined || !siege.attack(id, o.building)) return;
      s.order = o.kind;
      return;
    }
    if (o.kind === 'deploy' || o.kind === 'raiseLadder') return; // no engine
    if (o.kind !== 'formation' && o.kind !== 'detach') {
      if (s.siege >= 0) uncrew(s);
      s.task = null;
      s.claimPt = -1;
    }
    if (o.kind === 'claimRegion') {
      if (!mobs.startClaim(s.id, o.point)) return;
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      const c = mobs.claimPoint(o.point);
      s.order = 'claimRegion';
      s.claimPt = o.point;
      s.fixed = null;
      requestPath(s, c.x, c.y);
      return;
    }
    if (o.kind === 'uncrew') {
      if (s.order === 'crew' || s.order === 'move' || s.order === 'attackBuilding' || s.order === 'deploy' || s.order === 'raiseLadder') s.order = 'hold';
      return;
    }
    if (o.kind === 'crew') {
      if (!siege.crew(o.siege, s.id, s.team)) return;
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      s.siege = o.siege;
      s.order = 'crew';
      s.path = [];
      s.goal = null;
      return;
    }
    if (o.kind === 'buildSiege' || o.kind === 'ignite' || o.kind === 'extinguish' || o.kind === 'pushLadder' || o.kind === 'attackBuilding') {
      let k: Task;
      if (o.kind === 'buildSiege') {
        const id = siege.build(s.team, o.type, o.x, o.y);
        if (id < 0) return;
        k = { kind: o.kind, b: -1, e: id };
      } else if (o.kind === 'pushLadder') {
        const l = works.piece(o.ladder);
        if (!l || l.def.access !== 'ladder' || l.team === s.team) return;
        k = { kind: o.kind, b: o.ladder, e: -1 };
      } else {
        k = { kind: o.kind, b: o.building ?? -1, e: o.building === undefined ? o.siege ?? -1 : -1 };
        const tt = k.b >= 0 ? works.piece(k.b)?.team : siege.get(k.e)?.team;
        if (tt === undefined || (o.kind !== 'extinguish' && tt === s.team)) return;
      }
      if (!taskLive(k)) return;
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      s.task = k;
      s.order = o.kind;
      taskPoints(s);
      return;
    }
    if (o.kind === 'detach') {
      const alive = s.units.filter((u) => u.alive);
      const ids = o.unitIds ? new Set(o.unitIds) : null;
      // M5a: two detachments of DETACH_MIN or more; a squad already split splits no further
      if (s.pair >= 0 && squads[s.pair].alive > 0) return;
      const n = Math.min(alive.length - DETACH_MIN, ids ? alive.length : Math.floor(o.count ?? 0));
      const picked = n < DETACH_MIN ? [] : ids ? alive.filter((u) => ids.has(u.id)).slice(0, n) : alive.slice(alive.length - n);
      if (picked.length >= DETACH_MIN) detach(s, picked);
      return;
    }
    if (o.kind === 'merge') {
      const t = squads[o.into];
      if (!t || t === s || t.team !== s.team || t.owner !== s.owner || s.alive === 0 || t.alive + s.alive > SQUAD_MAX) return;
      if (t.pair === s.id) t.pair = -1;
      if (s.pair === t.id) s.pair = -1;
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
    if (o.kind === 'upgrade') {
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      if (!works.upgrade(o.building, s.team) && !works.siteOk(o.building, s.team)) return;
      s.order = 'build';
      s.fixed = null;
      s.sites = [o.building];
      s.node = -1;
      s.path = [];
      s.goal = null;
      for (const u of s.units) if (u.alive) works.setJob(u, 'build');
      return;
    }
    if (o.kind === 'formation') {
      s.shape = o.shape;
      reslot(s);
      return;
    }
    if (o.kind === 'placeBuilding' && BUILDINGS[o.type].brazier) {
      works.place(s.team, o.type, o.x, o.y, o.rot ?? 0); // W-35: set down done and lit; the squad carries on
      return;
    }
    if (o.kind === 'placeBuilding' || o.kind === 'placeWall' || o.kind === 'placeBridge' || o.kind === 'build' || o.kind === 'gather') {
      const sites =
        o.kind === 'placeBuilding' ? [works.place(s.team, o.type, o.x, o.y, o.rot ?? 0)].filter((id) => id >= 0)
        : o.kind === 'placeWall' ? works.placeWall(s.team, o)
        : o.kind === 'placeBridge' ? works.placeBridge(s.team, o)
        : o.kind === 'build' ? (works.siteOk(o.site, s.team) ? [o.site] : [])
        : [];
      if (o.kind !== 'gather' && !sites.length) return; // invalid placement: the squad carries on
      if (o.kind === 'gather' && !works.nodeOk(o.node)) return;
      s.order = o.kind === 'gather' ? 'gather' : 'build';
      s.sites = sites;
      s.fixed = null;
      s.node = o.kind === 'gather' ? o.node : -1;
      s.path = [];
      s.goal = null;
      for (const u of s.units) if (u.alive) works.setJob(u, s.order);
      return;
    }
    if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
    s.order = o.kind;
    if (o.kind !== 'hold') s.fixed = null; // holding on a wall stays up there
    if (o.kind === 'move') {
      requestPath(s, o.x, o.y);
      const pts = works.deckPoints(tileAt(grid, o.x, o.y), s.alive);
      if (pts.length) s.fixed = pts;
    }
    else if (o.kind === 'hold') {
      s.path = [];
      s.goal = null;
    } else if (squads[o.target] && squads[o.target].team !== s.team) {
      s.target = o.target;
      s.repathAt = tick;
    } else s.order = 'hold';
  };

  const dist2 = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;

  // --- siege (M2c) ---
  const uncrew = (s: Squad) => {
    if (siege.get(s.siege)?.crew === s.id) siege.uncrew(s.siege);
    s.siege = -1;
    s.fixed = null;
  };

  /** Is there still something to do for task k? */
  const taskLive = (k: Task): boolean => {
    const b = k.b >= 0 ? works.piece(k.b) : undefined;
    const e = k.e >= 0 ? siege.get(k.e) : undefined;
    if (k.b >= 0 && (!b || b.cancelled || b.state === 'destroyed')) return false;
    if (k.e >= 0 && (!e || e.state === 'destroyed')) return false;
    if (!b && !e) return false;
    if (k.kind === 'buildSiege') return e!.state === 'building';
    if (k.kind === 'ignite') return b ? !!b.def.burnable && b.state !== 'foundation' && b.burn <= 0 : e!.burn <= 0;
    if (k.kind === 'extinguish') return (b ?? e)!.burn > 0;
    return true;
  };

  /** A deck tile beside ladder building id (where defenders push it from), -1 none. */
  const ladderTop = (id: number): number => {
    const l = works.piece(id);
    if (!l) return -1;
    const lx = l.tiles[0], ly = l.tiles[1];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const t = tileAt(grid, lx + dx, ly + dy);
      if (t >= 0 && grid.deck[t] === DECK) return t;
    }
    return -1;
  };

  /** The squad's standing points for its task (round the target; on the deck by a ladder); a ranged attacker takes a spot in range. */
  const taskPoints = (s: Squad) => {
    const k = s.task!;
    const n = Math.max(1, s.alive);
    if (k.kind === 'attackBuilding' && s.ranged) {
      s.fixed = null;
      const [tx, ty] = k.b >= 0 ? works.nearestTile(k.b, s.cx, s.cy) : [siege.get(k.e)!.x, siege.get(k.e)!.y];
      const d = Math.hypot(s.cx - tx, s.cy - ty), r = warRange(s) * 0.7;
      if (d > r) requestPath(s, tx + ((s.cx - tx) * r) / d, ty + ((s.cy - ty) * r) / d);
      return;
    }
    const pts = k.kind === 'pushLadder' ? works.deckPoints(ladderTop(k.b), n) : k.b >= 0 ? works.ringPoints(k.b, n, s.cx, s.cy) : siege.crewPoints(k.e, n);
    s.fixed = pts.length ? pts : null;
    if (pts.length) requestPath(s, pts[0], pts[1]);
  };

  /** A man's task this tick: the unit itself when it works at the target (stands), null to walk to its point. */
  const taskAct = (u: Unit): Unit | null => {
    const s = u.squad, k = s.task!;
    u.fighting = u.striking = false;
    u.tgt = null;
    if (u.cd > 0) u.cd--;
    const e = k.e >= 0 ? siege.get(k.e) : undefined;
    const [tx, ty] = k.b >= 0 ? works.nearestTile(k.b, u.x, u.y) : [e!.x, e!.y];
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (k.kind === 'attackBuilding' && u.ammo > 0 && u.st.range > 0) {
      const dh = hAt(u.x, u.y) - hAt(tx, ty);
      const range = u.st.range + heightRange(dh);
      if (d > range) return null;
      u.striking = true;
      u.facing = Math.atan2(ty - u.y, tx - u.x);
      if (u.cd <= 0) shootAt(u, tx, ty, d, dh, range, k);
      return u;
    }
    if (d > TASK_AT) return null;
    const here = tileAt(grid, u.x, u.y);
    if (k.kind === 'pushLadder' && grid.deck[here] !== DECK) return null;
    if (k.kind !== 'pushLadder' && grid.deck[here] === DECK) return null; // up on a wall: not at its foot
    u.facing = Math.atan2(ty - u.y, tx - u.x);
    if (k.kind === 'attackBuilding') {
      u.striking = true;
      if (u.cd > 0) return u;
      u.cd = u.st.atkTicks;
      u.swingAt = tick;
      const dmg = u.st.dmg * BUILDING_MELEE;
      if (k.b >= 0) works.damage(k.b, dmg);
      else siege.damage(k.e, dmg);
    } else if (k.kind === 'buildSiege') {
      if (siege.labour(k.e, DT)) u.working = true;
    } else if (k.kind === 'ignite') {
      u.doing = 'ignite';
      if (k.b >= 0) works.kindle(k.b, DT);
      else siege.kindle(k.e, DT);
    } else if (k.kind === 'extinguish') {
      u.doing = 'extinguish';
      if (k.b >= 0) works.douse(k.b, DT);
      else siege.douse(k.e, DT);
    } else {
      u.doing = 'push';
      const l = works.piece(k.b)!;
      const lt = l.ti[0];
      if (works.push(k.b, DT)) for (const o of units) if (o.alive && tileAt(grid, o.x, o.y) === lt) hurt(o, o.maxHp * LADDER.fall); // climbers fall
    }
    return u;
  };

  /** Crews stand by their engines; tasks that are done end (the squad holds). */
  const siegeSquads = () => {
    for (const s of squads) {
      if (s.alive === 0) continue;
      if (s.siege >= 0) {
        const e = siege.get(s.siege);
        if (!e || e.state === 'destroyed' || e.crew !== s.id) {
          s.siege = -1;
          s.fixed = null;
          s.order = 'hold';
          continue;
        }
        s.fixed = siege.crewPoints(s.siege, s.alive);
        s.ax = e.x;
        s.ay = e.y;
        s.path = [];
        s.pi = 0;
        s.goal = null;
        for (const u of s.units) if (u.alive && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < 6.25) u.doing = 'crew';
      } else if (s.task) {
        if (!taskLive(s.task)) {
          s.task = null;
          s.fixed = null;
          s.order = 'hold';
          s.path = [];
          s.goal = null;
        } else if (s.task.e >= 0 && (tick + s.id) % TASK_REPOINT === 0 && s.task.kind !== 'attackBuilding') s.fixed = siege.crewPoints(s.task.e, Math.max(1, s.alive));
        else if (s.task.kind === 'attackBuilding' && s.ranged && (tick + s.id) % REPATH_TICKS === 0 && s.pi >= s.path.length / 2 && !s.goal) taskPoints(s);
      }
    }
  };

  const scanNear = () => {
    for (const s of squads) {
      s.near = [];
      if (s.alive === 0) continue;
      // by its centre or its anchor (a squad strung out, some men stuck far behind, still sees the foe its anchor reached)
      for (const o of squads)
        if (o.team !== s.team && o.alive > 0 && (dist2(s, o) < NEAR * NEAR || (s.ax - o.cx) ** 2 + (s.ay - o.cy) ** 2 < NEAR * NEAR)) s.near.push(o);
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

  /**
   * The lanes of the finished bridge piece on tile t: unit vectors along (e) and across (n) its line, the line's offset
   * across (cl: a point p is on it at p.n = cl), lane count. A point is e * a + n * (cl + c): a along, c off the centre line.
   */
  const laneOf = (t: number) => {
    const b = works.bridgeAt(t);
    if (!b) return null;
    const l = Math.hypot(b.dir[0], b.dir[1]), ex = b.dir[0] / l, ey = b.dir[1] / l;
    return { id: b.ids[0], ex, ey, nx: -ey, ny: ex, cl: -ey * b.rows[0] + ex * b.rows[1], w: b.width };
  };
  type Lanes = NonNullable<ReturnType<typeof laneOf>>;
  /** Across offset of lane j (0 .. w-1) from the centre line. */
  const laneC = (L: Lanes, j: number) => (j - (L.w - 1) / 2) * LANE;

  /** The point d tiles along squad s's path from its anchor (ahead > 0, behind < 0; past the start straight on) and the way there. */
  const alongPath = (s: Squad, d: number): [number, number, number, number] => {
    const P = s.path, ahead = d >= 0;
    let x = s.ax, y = s.ay, left = Math.abs(d), k = ahead ? s.pi : s.pi - 1, ux = Math.cos(s.facing), uy = Math.sin(s.facing);
    for (;;) {
      const last = ahead ? k >= P.length / 2 : k < 0;
      const tx = last ? x + (ahead ? 0 : -ux * left) : P[k * 2], ty = last ? y + (ahead ? 0 : -uy * left) : P[k * 2 + 1];
      const sx = tx - x, sy = ty - y, sl = Math.hypot(sx, sy);
      if (sl > 1e-6) (ux = (ahead ? sx : -sx) / sl), (uy = (ahead ? sy : -sy) / sl);
      if (last || sl >= left) {
        if (sl >= left && sl > 1e-6) return [x + (sx / sl) * left, y + (sy / sl) * left, ux, uy];
        return [tx, ty, ux, uy];
      }
      left -= sl;
      x = tx;
      y = ty;
      k += ahead ? 1 : -1;
    }
  };

  /**
   * Column slots for a squad near a bridge (null: none on its way): w abreast (the bridge's width), FILE apart along the
   * path, centred on the anchor; a slot on the bridge sits on its lane.
   */
  const columnFor = (s: Squad): number[] | null => {
    if (s.fixed || s.siege >= 0 || s.task || s.order === 'gather' || s.order === 'build' || s.pi >= s.path.length / 2) return null;
    const n = s.offsets.length / 2;
    let L: Lanes | null = null;
    for (const u of s.units) if (u.alive && (L = laneOf(tileAt(grid, u.x, u.y)))) break;
    const ranks = (w: number) => Math.ceil(n / w), back = (w: number) => ((ranks(w) - 1) / 2) * FILE;
    for (let d = -back(1) - 1; !L && d <= Math.max(COL_AHEAD, back(1)); d += 0.5) {
      const [x, y] = alongPath(s, d);
      L = laneOf(tileAt(grid, x, y));
    }
    if (!L) return null;
    const w = L.w, out: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / w), j = i % w;
      const [x, y, ux, uy] = alongPath(s, back(w) - r * FILE);
      const B = laneOf(tileAt(grid, x, y));
      if (B) {
        // on the bridge: the lane, the same side of the way as off it
        const a = x * B.ex + y * B.ey, jj = -uy * B.nx + ux * B.ny >= 0 ? j : B.w - 1 - j, c = B.cl + laneC(B, Math.min(jj, B.w - 1));
        out.push(B.ex * a + B.nx * c, B.ey * a + B.ny * c);
      } else {
        const c = (j - (w - 1) / 2) * LANE;
        out.push(x - uy * c, y + ux * c);
      }
    }
    return out;
  };

  /**
   * A man on a bridge (not a worker at his job) stands on its nearest lane: never beside the deck over the water. Men in
   * one lane keep a body apart along it (the press is passed back along the file, not out over the side).
   */
  const files = new Map<number, { u: Unit; a: number; L: Lanes; c: number }[]>();
  const keepToLanes = () => {
    files.clear();
    for (const u of units) {
      if (!u.alive || u.job) continue;
      const L = laneOf(tileAt(grid, u.x, u.y));
      if (!L) continue;
      const a = u.x * L.ex + u.y * L.ey, c = u.x * L.nx + u.y * L.ny - L.cl;
      // within the outer lanes (on the one lane of a footbridge), else nearer the middle where the deck's tiles end here
      const j = Math.max(0, Math.min(L.w - 1, Math.round(c / LANE + (L.w - 1) / 2))), m = laneC(L, L.w - 1);
      const cc = Math.max(-m, Math.min(m, c));
      let lc = 0, x = 0, y = 0;
      for (const q of [cc, cc / 2, 0]) {
        lc = L.cl + q;
        x = L.ex * a + L.nx * lc;
        y = L.ey * a + L.ny * lc;
        if (works.bridgeAt(tileAt(grid, x, y))) break;
      }
      if (!works.bridgeAt(tileAt(grid, x, y))) continue;
      u.x = x;
      u.y = y;
      const k = L.id * 4 + j, f = files.get(k);
      if (f) f.push({ u, a, L, c: lc });
      else files.set(k, [{ u, a, L, c: lc }]);
    }
    const MIN = 2 * RADIUS;
    for (const f of files.values()) {
      if (f.length < 2) continue;
      f.sort((p, q) => p.a - q.a || p.u.id - q.u.id);
      for (let pass = 0; pass < 4; pass++)
        for (let i = 1; i < f.length; i++) {
          const gap = MIN - (f[i].a - f[i - 1].a);
          if (gap <= 0 || meet(f[i].u, f[i - 1].u)) continue;
          f[i - 1].a -= gap / 2;
          f[i].a += gap / 2;
        }
      for (const { u, a, L, c } of f) {
        const x = L.ex * a + L.nx * c, y = L.ey * a + L.ny * c, t = tileAt(grid, x, y);
        if (t >= 0 && grid.cost[t] > 0) (u.x = x), (u.y = y);
      }
    }
  };

  const stepSquad = (s: Squad) => {
    if (s.alive === 0) return;
    if (s.pi >= s.path.length / 2) {
      s.col = null;
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
    s.col = columnFor(s);
  };

  /** Point the unit steers to: its detour, its slot when in sight, else the furthest visible point of the squad path. */
  const unitTarget = (u: Unit): [number, number] => {
    const s = u.squad;
    // a man on a bridge whose slot is off it walks on along his lane to the end towards the anchor (not into its side; tile
    // waypoints of a detour lie off his lane)
    const L = s.col || s.fixed ? null : laneOf(tileAt(grid, u.x, u.y));
    if (L) {
      const [sx, sy] = slotPos(s, u.slot);
      u.crossing = !works.bridgeAt(tileAt(grid, sx, sy));
      if (u.crossing) {
        u.own = [];
        const a = u.x * L.ex + u.y * L.ey, c = u.x * L.nx + u.y * L.ny, na = a + (s.ax * L.ex + s.ay * L.ey >= a ? 1.5 : -1.5); // the end towards the anchor
        return [L.ex * na + L.nx * c, L.ey * na + L.ny * c];
      }
    } else u.crossing = false;
    if (u.own.length) {
      while (u.oi < u.own.length / 2 - 1 && Math.hypot(u.own[u.oi * 2] - u.x, u.own[u.oi * 2 + 1] - u.y) < (s.fixed ? 0.5 : 0.3)) u.oi++; // wall-walk climbers: a looser hold on waypoints at a crowded stair foot
      const ox = u.own[u.oi * 2];
      const oy = u.own[u.oi * 2 + 1];
      if (u.oi < u.own.length / 2 - 1 || Math.hypot(ox - u.x, oy - u.y) > 0.3) return [ox, oy];
      u.own = [];
    }
    const [sx, sy] = slotPos(s, u.slot);
    if (lineClear(grid, u.x, u.y, sx, sy)) return [sx, sy];
    if (s.fixed && !u.ownReq) {
      // a wall-walk point out of sight (up a stair, round a tower): a way of its own there
      u.ownReq = true;
      unitPathQueue.push(u);
    }
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

  /** Units on each tower platform (tower id -> count), kept up to date as units step on and off. */
  const platLoad = new Map<number, number>();
  const countPlatforms = () => {
    platLoad.clear();
    for (const u of units) {
      if (!u.alive) continue;
      const p = grid.plat[tileAt(grid, u.x, u.y)];
      if (p >= 0) platLoad.set(p, (platLoad.get(p) ?? 0) + 1);
    }
  };

  /** Move by (dx,dy), sliding along blocked tiles and cliffs; a full tower platform takes no one else. */
  const tryMove = (u: Unit, dx: number, dy: number) => {
    const from = tileAt(grid, u.x, u.y);
    const pf = grid.plat[from];
    const ok = (x: number, y: number) => {
      const t = tileAt(grid, x, y);
      if (t === from) return true;
      if (t < 0 || !canEnter(grid, from, t)) return false;
      const p = grid.plat[t];
      return p < 0 || p === pf || (platLoad.get(p) ?? 0) < works.platCap(p);
    };
    if (ok(u.x + dx, u.y + dy)) {
      u.x += dx;
      u.y += dy;
    } else if (ok(u.x + dx, u.y)) u.x += dx;
    else if (ok(u.x, u.y + dy)) u.y += dy;
    else return;
    const p = grid.plat[tileAt(grid, u.x, u.y)];
    if (p !== pf) {
      if (pf >= 0) platLoad.set(pf, platLoad.get(pf)! - 1);
      if (p >= 0) platLoad.set(p, (platLoad.get(p) ?? 0) + 1);
    }
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

  /** M5c: t's block against u: less by u's block pierce, more with Hold Fast while t's squad holds. */
  const blockOf = (u: Unit, t: Unit) => {
    const b = t.st.block * (1 - u.st.bp);
    return t.st.flags & F.holdFast && t.squad.order === 'hold' ? b * FLAG_FX.holdBlock : b;
  };
  /** M5c: damage multiplier of u's blow on t: the squad actives (dealt, taken) and Finisher. */
  const dmgMult = (u: Unit, t: Unit) => {
    const m = u.squad.out * t.squad.inn;
    return u.st.flags & F.finisher && t.hp < FLAG_FX.finishHp * t.maxHp ? m * FLAG_FX.finishDmg : m;
  };

  const strike = (u: Unit, t: Unit, dh: number) => {
    const bog = groundAt(u.x, u.y) === BOG;
    u.cd = Math.round(u.st.atkTicks * (bog ? COMBAT.bogAtk : 1) * (dh < 0 ? COMBAT.uphillAtk : 1));
    u.swingAt = tick;
    if (!working(t) && rng.chance(blockChance(blockOf(u, t), t.facing, u.x - t.x, u.y - t.y, false, groundAt(t.x, t.y) === BOG))) return;
    hurt(t, afterArmour(u.st.dmg * meleeHeight(dh) * (bog ? COMBAT.bogDmg : 1) * dmgMult(u, t), t.st.armor, 0));
    if (u.st.knock && t.alive) {
      // a charge (boar): the man is thrown back, in short steps so no wall is jumped
      const d = Math.hypot(t.x - u.x, t.y - u.y) || 1, k = u.st.knock / 3;
      grid.team = t.squad.team;
      for (let i = 0; i < 3; i++) tryMove(t, ((t.x - u.x) / d) * k, ((t.y - u.y) / d) * k);
      grid.team = u.squad.team;
      t.settled = false;
    }
  };

  /** W-35: why the squad's fire arrows are out, null when they may loose them (a man by a lit brazier, pitch in stock). */
  const fireBlock = (s: Squad): 'noBrazier' | 'noPitch' | null => {
    let near = false;
    let pitch = BRAZIER.pitch;
    for (const u of s.units) {
      if (!u.alive) continue;
      if (u.st.flags & F.fireArcher) pitch = BRAZIER.pitch * FLAG_FX.firePitch;
      if (!near && works.litNear(s.team, u.x, u.y, hAt(u.x, u.y), fireReach(u))) near = true;
    }
    return !near ? 'noBrazier' : works.pitch(s.team) < pitch - 1e-9 ? 'noPitch' : null;
  };
  /** A fire arrow for this shot? Only by a lit brazier, and it takes its pitch (else a plain arrow). */
  const fireShot = (u: Unit) =>
    u.squad.fire && u.st.missile === 'arrow' && works.litNear(u.squad.team, u.x, u.y, hAt(u.x, u.y), fireReach(u)) &&
    works.takeStock(u.squad.team, { pitch: u.st.flags & F.fireArcher ? BRAZIER.pitch * FLAG_FX.firePitch : BRAZIER.pitch });
  /** M5c Fire Archer: twice the brazier reach. */
  const fireReach = (u: Unit) => (u.st.flags & F.fireArcher ? BRAZIER.radius * FLAG_FX.fireReach : BRAZIER.radius);

  const shoot = (u: Unit, t: Unit, d: number, dh: number, range: number) => {
    const fire = fireShot(u);
    u.ammo--;
    u.cd = Math.round(u.st.shotTicks * (fire ? FIRE_RELOAD : 1));
    u.swingAt = tick;
    const land = tick + Math.max(1, Math.round(d / u.st.shotSpeed / DT));
    shots.push({ x0: u.x, y0: u.y, x1: t.x, y1: t.y, t0: tick, t1: land, z0: hAt(u.x, u.y), z1: hAt(t.x, t.y), by: u.id, kind: u.st.missile, ...(fire ? { fire: true as const } : {}) });
    if (u.ammo === 0) reslotQueue.add(u.squad);
    const fb = fire ? works.onBuilding(tileAt(grid, t.x, t.y)) : -1;
    const hit = rng.chance(hitChance(u.st.accuracy, d, range, groundAt(t.x, t.y) === FOREST));
    if (!hit && fb < 0) return;
    const bog = groundAt(u.x, u.y) === BOG;
    missiles.push({ at: land, by: u, t: hit ? t : null, raw: u.st.rangedDmg * COMBAT.missileDmg * missileHeight(dh) * (bog ? COMBAT.bogDmg : 1), ap: u.st.ap, ...(fb >= 0 ? { fb } : {}) });
  };

  /** A shot at a building or engine (attackBuilding): arrows barely scratch it, fire arrows may set it alight. */
  const shootAt = (u: Unit, tx: number, ty: number, d: number, dh: number, range: number, k: Task) => {
    const fire = fireShot(u);
    u.ammo--;
    u.cd = Math.round(u.st.shotTicks * (fire ? FIRE_RELOAD : 1));
    u.swingAt = tick;
    const land = tick + Math.max(1, Math.round(d / u.st.shotSpeed / DT));
    shots.push({ x0: u.x, y0: u.y, x1: tx, y1: ty, t0: tick, t1: land, z0: hAt(u.x, u.y), z1: hAt(tx, ty), by: u.id, kind: u.st.missile, ...(fire ? { fire: true as const } : {}) });
    if (u.ammo === 0) reslotQueue.add(u.squad);
    if (!rng.chance(hitChance(u.st.accuracy, d, range, false))) return;
    missiles.push({ at: land, by: u, t: null, raw: u.st.rangedDmg * COMBAT.missileDmg * missileHeight(dh) * (fire ? -1 : 1), ap: u.st.ap, ...(k.b >= 0 ? { b: k.b } : { e: k.e }) });
  };

  /** Crew under their ram's roof. */
  const underRoof = (t: Unit) => {
    const e = t.squad.siege >= 0 ? siege.get(t.squad.siege) : undefined;
    return !!e && e.type === 'ram' && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= RAM_ROOF * RAM_ROOF;
  };

  const land = () => {
    if (!missiles.length) return;
    const keep: Missile[] = [];
    for (const m of missiles) {
      if (m.at > tick) {
        keep.push(m);
        continue;
      }
      if (m.fb !== undefined) works.fireHit(m.fb, FIRE_DECK);
      if (m.b !== undefined || m.e !== undefined) {
        // at a building or engine: raw < 0 marks a fire arrow
        const dmg = Math.abs(m.raw) * ARROW_BUILDING;
        if (m.b !== undefined) {
          works.damage(m.b, dmg);
          if (m.raw < 0) works.fireHit(m.b, FIRE_ARROW);
        } else {
          siege.damage(m.e!, dmg);
          if (m.raw < 0 && rng.chance(FIRE_ARROW)) siege.kindle(m.e!, 99);
        }
        continue;
      }
      const t = m.t;
      if (!t || !t.alive) continue;
      if (underRoof(t) && rng.chance(RAM.cover)) continue;
      if (!working(t) && rng.chance(blockChance(blockOf(m.by, t), t.facing, m.by.x - t.x, m.by.y - t.y, true, groundAt(t.x, t.y) === BOG))) continue;
      hurt(t, afterArmour(m.raw * dmgMult(m.by, t), t.st.armor, m.ap));
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
    if ((s.order === 'move' && (s.goal || s.pi < s.path.length / 2)) || (s.siege >= 0 && siege.busy(s.siege))) {
      u.tgt = null; // marching (or crewing a working engine): no fighting
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
  /**
   * Workers walk through their own side's bodies (a standing squad would fence them off their store or site), and so do men
   * on a stair or ladder (one file: they squeeze past whoever stands at its head or foot).
   */
  const ghost = (a: Unit, b: Unit) =>
    (a.squad.team === b.squad.team && (a.job !== null || b.job !== null || grid.deck[tileAt(grid, a.x, a.y)] > DECK || grid.deck[tileAt(grid, b.x, b.y)] > DECK)) ||
    meet(a, b);
  /** Two men meeting head-on in a bridge's lane squeeze past each other (else a footbridge jams for good). */
  const meet = (a: Unit, b: Unit) => a.vx * b.vx + a.vy * b.vy < -0.3 && !!works.bridgeAt(tileAt(grid, a.x, a.y)) && !!works.bridgeAt(tileAt(grid, b.x, b.y));

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
            // a man standing on a bridge gives way along the file (it has no room to go round him)
            const uFix = (u.settled && !works.bridgeAt(tileAt(grid, u.x, u.y))) || u.striking || u.working;
            const oFix = (o.settled && !works.bridgeAt(tileAt(grid, o.x, o.y))) || o.striking || o.working;
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
      if (s.actUntil === tick) s.out = s.inn = 1;
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
    mobs.tick(tick);
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
      const [tx, ty] = u.squad.fixed ? slotPos(u.squad, u.slot) : unitTarget(u);
      u.own = cornerPath(u.x, u.y, tx, ty);
      if (u.squad.fixed) (u.settled = false), (u.best = Infinity), (u.stall = 0); // walk it, however long it stood
      u.oi = 1;
    }
    for (const s of squads) stepSquad(s);
    for (const u of units) u.doing = null;
    siegeSquads();

    countPlatforms();
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
      } else if (u.squad.task) {
        u.working = false;
        act = taskAct(u);
      } else {
        u.working = false;
        act = fight(u);
      }
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
        if (act === null && s.pi >= s.path.length / 2 && !s.goal && s.siege < 0 && !u.crossing) {
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
      for (let yy = u.settled && !works.bridgeAt(tileAt(grid, u.x, u.y)) ? grid.h : cy - 1; yy <= cy + 1; yy++) {
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
    keepToLanes();
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
    siege.tick(tick);
    for (const s of reslotQueue) reslot(s);
    reslotQueue.clear();
    if (shots.length) shots = shots.filter((sh) => sh.t1 > tick);
    vision.tick(tick);
    tick++;
    stepMs = performance.now() - t0;
  };

  const api: WarBuildSim = {
    region,
    spawnSquad(owner, team, cls, count, x, y, persons) {
      // M5b: one man per person, each with his own baked stats
      const ps = persons?.slice(0, SQUAD_MAX) ?? null;
      count = ps ? ps.length : Math.min(count, SQUAD_MAX);
      const [ax, ay] = openPoint(x, y);
      const sts = ps ? ps.map((p) => warStatsOf(p)) : null;
      const st = sts?.[0] ?? warStats(cls);
      const s: Squad = {
        id: squads.length, owner, team, units: [], alive: count, shape: 'line', offsets: formationOffsets('line', count, rng),
        ax, ay, cx: ax, cy: ay, facing: 0, speed: st.speed, ranged: st.range > 0, path: [], pi: 0, order: 'hold', target: -1,
        repathAt: 0, goal: null, near: [], sites: [], node: -1, fixed: null, col: null, siege: -1, task: null, fire: false, claimPt: -1, pair: -1,
        act: null, actWil: 5, actReady: 0, actUntil: -1, out: 1, inn: 1,
      };
      grid.team = team;
      squads.push(s);
      for (let k = 0; k < count; k++) {
        const [sx, sy] = slotPos(s, k);
        const [px, py] = lineClear(grid, ax, ay, sx, sy) ? [sx, sy] : [ax + rng.range(-0.2, 0.2), ay + rng.range(-0.2, 0.2)];
        const ust = sts?.[k] ?? st;
        const u: Unit = {
          id: units.length, squad: s, slot: k, x: px, y: py, facing: 0, hp: ust.maxHp, maxHp: ust.maxHp, cls: ps?.[k].hero.cls ?? cls, st: ust, moving: false, wp: 0,
          alive: true, wounded: false, fighting: false, striking: false, swingAt: -1, cd: 0, ammo: ust.ammo, tgt: null, vx: 0, vy: 0, stuck: 0, own: [], oi: 0, ownReq: false,
          crossing: false, settled: false, settleD: 0, best: Infinity, stall: 0, ox: px, oy: py, want: 0, toSlot: false,
          job: null, carry: null, load: 0, wnode: -1, wsite: -1, wslot: -1, wfor: -1, working: false, wgx: -1, wgy: -1, wpath: [], wpi: 0, wreq: false, doing: null, person: ps?.[k] ?? null,
        };
        units.push(u);
        s.units.push(u);
      }
      if (ps) reslot(s); // speed and ranged from the men themselves
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
          const atk = u.alive && u.striking && (!!u.tgt?.alive || u.swingAt === tick - 1 || !!u.squad.task);
          const t = tileAt(grid, u.x, u.y);
          const on = works.onBuilding(t);
          return {
            id: u.id, squad: u.squad.id, x: u.x, y: u.y, facing: u.facing, hp: u.hp, maxHp: u.maxHp, cls: u.cls, z: grid.height[t],
            ...(on >= 0 ? { on } : {}),
            state: !u.alive ? 'dead' : atk ? 'attack' : u.working ? (u.job ?? 'build') : u.moving ? 'move' : 'idle',
            ...(u.alive && u.doing ? { task: u.doing } : {}),
            ...(u.alive ? {} : { wounded: u.wounded }),
            ...(u.person ? { pid: u.person.id, level: u.person.hero.level } : {}),
            ...(u.alive && u.load > 0 ? { carry: u.carry!, load: u.load } : {}),
            ...(atk ? { ready: Math.max(0, u.cd - 1), ...(u.swingAt >= 0 ? { swing: tick - 1 - u.swingAt } : {}) } : {}),
          };
        }),
        squads: squads.map((s) => {
          const snap: SquadSnap = { id: s.id, owner: s.owner, team: s.team, units: s.units.map((u) => u.id), order: s.order };
          if (s.act) snap.active = { skill: s.act, ready: Math.max(0, s.actReady - tick), on: Math.max(0, s.actUntil - tick) };
          const st = s.units[0]?.st;
          if (st && st.range > 0 && st.missile === 'arrow') {
            const why = fireBlock(s);
            snap.fireArrows = { on: s.fire, available: !why, ...(why ? { reason: why } : {}) };
          }
          return snap;
        }),
        shots: [...shots, ...siege.shots()].map((sh) => ({ ...sh })),
        buildings: works.buildingSnaps(),
        stock: works.stockSnap(),
        influenceVersion: works.influence().version,
        sieges: siege.snaps(tick),
        ...(region.lairs?.length || region.claimPoints?.length ? { lairs: mobs.lairSnaps(), claims: mobs.claimSnaps() } : {}),
      };
    },
    stats() {
      return { stepMs, units: units.filter((u) => u.alive).length, visionMs: vision.ms() };
    },
    checkPlacement: works.checkPlacement,
    checkWall: works.checkWall,
    checkBridge: works.checkBridge,
    resourceNodes: works.resourceNodes,
    influence: works.influence,
    claim: works.claim,
    addStock: works.addStock,
    damageBuilding: works.damage,
    finishBridges: works.finishBridges,
    spawnMobs: () => mobs.spawn(),
    visibleTo: vision.visibleTo,
    teamGrid: vision.teamGrid,
    lastSeen: vision.lastSeen,
  };
  return api;
}

/** Shorten a flat point path by `by` along its length from the end (never past its first segment's start). */
function trimEnd(pts: number[], by: number): void {
  while (pts.length >= 4 && by > 0) {
    const n = pts.length, dx = pts[n - 2] - pts[n - 4], dy = pts[n - 1] - pts[n - 3], l = Math.hypot(dx, dy);
    if (l > by) {
      pts[n - 2] -= (dx / l) * by;
      pts[n - 1] -= (dy / l) * by;
      return;
    }
    by -= l;
    if (n === 4) { pts[2] = pts[0]; pts[3] = pts[1]; return; }
    pts.length = n - 2;
  }
}
