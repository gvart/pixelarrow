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
import type { BuildingType, FightReport, Order, PersonResult, RegionData, ResourceKind, ShotSnap, Snapshot, SquadId, SquadSnap, UnitSnap, WarBuildSim, WarEvent, WarPerson, WarSkillId } from '../types';
import { salvageValue, type Item } from '../../data/items';
import { warStats, warStatsOf, type WarStats } from './classes';
import { afterArmour, blockChance, COMBAT, heightRange, hitChance, meleeHeight, missileHeight } from './combat';
import { formationOffsets, type Shape } from './formation';
import { BRAZIER, BUILDINGS, FIELD, WORK_DEFENCE } from './economy';
import { BOG, buildGrid, canEnter, DECK, findPath, flushSectors, FOREST, lineClear, nearestOpen, tileAt, UPHILL, type Grid } from './grid';
import { createWorks, type Worker } from './works';
import { createSiege, LADDER } from './siege';
import { createMobs, MOB_OWNER, MOB_TEAM, mobClass } from './mobs';
import { createVision } from './vision';
import { CAPTURE_R, DETACH_MIN, gainXp, SQUAD_MAX, XP } from './soldiers';
import { ACTIVE, ACTIVES, activeCooldown, F, FLAG_FX } from './skills';
import { AT_BUILDING, CIV, CIV_QUOTA, CIV_XP, civJob, CLIP, COOK, ENGINEER, FORAGER, PHYSICIAN, SMITH, wornest, type CivJob } from './civilians';
import { isCivClass } from '../../data/classes';
import { heldNodes } from '../../data/professions';
import { toolMods, type Product } from '../../data/recipes';
import { createCrafting, fedOf, type Crafter } from './crafting';
import { fallShare, FORAGE, HUNT, REMEDY, VENOM } from './civilians';
import { mobKindOf, MOBS } from './mobs';
import { decodeGraph, encodeGraph, externals, STATE_VERSION, type SimState } from './state';
import { CART_ARMOR, isCartType, SIEGE } from './siege';
import { CHEST, NEUTRAL_TEAM } from './economy';
import { BLESS, createTowns } from './prebuilt';
import { CART_FORD, CART_UPHILL } from './grid';
import { itemList, loads, move as moveHold, newHold, perLoad, totals, type Hold, type Lot } from './holders';
import { CART, createPiles, ESCORT, inRect, PILE, PORTER, SAFE } from './trade';
import { CRAFT, itemRecipe } from './crafting';
import type { HolderRef } from '../types';

/** Save and restore: the constants a sim's state points at (named, not copied) and a fresh sim's root per region (typed-array diffs). */
const exts = new WeakMap<RegionData, Map<object, string>>();
const constsOf = (region: RegionData) => {
  let m = exts.get(region);
  if (!m) exts.set(region, (m = externals({ region, BUILDINGS, SIEGE, MOBS })));
  return m;
};
const fresh = new WeakMap<RegionData, unknown>();
const roots = new WeakMap<WarBuildSim, () => unknown>();

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
/** M5e: buildings that hold captives, the raid reach (tiles from the footprint), scan period and per-building cooldown (ticks). */
const HOLD = { types: new Set<string>(['fort', 'camp']), r: 4, every: 10, cooldown: 600 };
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
const SPOT_NEAR = 0.5; // tiles: a crafter this near a workplace station stands at it
const FIRE_DECK = 0.08; // ... the wood deck under the man it is shot at
const RAM_ROOF = 2; // crew this near their ram are under its roof
const NO_NODES: ReadonlySet<string> = new Set();
const STAKES_EVERY = 5; // M5h3: ticks between stakes wounding the foe men crossing them
/** M5h3: building types that need an engineer node of the team to place; towerBridge is never placed. */
const PLACE_NODE: Partial<Record<BuildingType, string>> = { stakes: 'fortifier', ditch: 'fortifier', towerBridge: '-' };
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
  // M5d tallies since the last endFight: damage dealt, kills, objective XP, took part (dealt or took a blow); reported: fallen and reported once
  dealt: number;
  kills: number;
  obj: number;
  engaged: boolean;
  reported: boolean;
  // M5f civilians (./civilians.ts): his job (null: a soldier), seconds of work towards his next batch, at work at his
  // building since the last civilian tick; repaired: a smith mended his gear (reported by endFight)
  civ: CivJob | null;
  civT: number;
  civAt: boolean;
  repaired: boolean;
  // M5h: a venomous bite holds until this tick (falling with it: VENOM.share off the wounded share); his blows bite
  // (a venomous mob); a beast (its kill brings a hunter hides); a physician's field radius (Field Surgeon)
  venomUntil: number;
  venom: boolean;
  beast: boolean;
  fieldR: number;
  // M6: his pack (a porter's load, null empty so far); combat tag (no safe-zone entry) until this tick; ticks inside a safe zone
  pack: Hold | null;
  tag: number;
  safeT: number;
}

/** M6 load / unload under way: the holder, which way, the good and how many goods are still wanted. */
interface Xfer { ref: HolderRef; dir: 'load' | 'unload'; res?: ResourceKind; n: number }
/** A holder as the trade orders see it. */
interface HolderAt { hold: Hold; x: number; y: number; kind: 'store' | 'chest' | 'cart' | 'pile'; team: number; owner: string; cap: number; id: number }

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
  // attackMove: where it marches; target >= 0 while it fights a foe met on the way (it resumes the march after)
  amx: number;
  amy: number;
  // M5f: all its men civilians; running from a foe (calm: ticks with none near; resume: the order it dropped); the
  // building it works at (civWork, -1 none); fed by a cook until this tick
  civ: boolean;
  flee: boolean;
  calm: number;
  resume: Order | null;
  work: number;
  fedUntil: number;
  // M5h: the fed record (one per squad, the last dish eaten): damage taken x fedInn, melee / missile damage +, accuracy +,
  // physician heal x fedHeal; bandages carried (<= SQUAD_MAX, one used by each man who falls); theriac (venom ignored) until
  fedInn: number;
  fedMelee: number;
  fedMissile: number;
  fedAcc: number;
  fedHeal: number;
  dish: Product | null;
  bandages: number;
  theriacUntil: number;
  // M6: a load / unload under way; the cart it escorts (-1 none); a man of it carries a load; a pile item a smith breaks up
  xfer: Xfer | null;
  escort: number;
  laden: boolean;
  salv: { pile: number; uid: string; t: number } | null;
}
/** M5f: the orders a civilian squad takes (work orders only). */
const CIV_ORDERS = new Set<Order['kind']>(['move', 'hold', 'stop', 'formation', 'gather', 'build', 'civWork', 'detach', 'merge', 'stopWork', 'placeBuilding', 'placeWall', 'placeBridge', 'upgrade', 'buildSiege', 'load', 'unload', 'salvagePile', 'crew', 'uncrew']);
/** M5f: seconds of work per batch, by job at a building. */
const BATCH: Partial<Record<CivJob, number>> = { cook: COOK.batch, smith: SMITH.batch, physician: 1 };
/** M5f: HP a physician heals for one job's XP. */
const PATIENT_HP = 50;

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
  // M6c: loot piles; items picked up per team since the last report; the event log
  const piles = createPiles(region);
  let loot: Record<number, Item[]> = {};
  // M6d: safe-zone tiles (1 inside a region `safe` rect)
  const safeMask = new Uint8Array(grid.w * grid.h);
  for (const r of region.safe ?? []) for (let y = Math.max(0, r.y); y < Math.min(grid.h, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(grid.w, r.x + r.w); x++) safeMask[y * grid.w + x] = 1;
  const anySafe = !!region.safe?.length;
  const inSafe = (x: number, y: number) => {
    if (!anySafe) return false;
    const t = tileAt(grid, x, y);
    return t >= 0 && safeMask[t] === 1;
  };
  let log: WarEvent[] = [];
  const LOG_MAX = 5000;
  const note = (e: WarEvent) => {
    if (log.length < LOG_MAX) log.push(e);
  };
  // M5f: the civilians (all ever spawned, in id order), rations per team
  const civs: Unit[] = [];
  const rations = new Map<number, number>();
  // M5h: teams with a Battle Dresser physician on the field (a bandage counts double), refreshed on the civilian loop
  const dresser = new Set<number>();

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
    // M6c: a store or chest that falls leaves its contents in a pile
    {
      spill: (x, y, h, burnt) => void piles.drop(x, y, h.lots, h.items, tick, burnt ? PILE.spoil : 0),
      // M7a: a pre-built piece razed (a temple or shrine: sacrilege); a safe court's pieces take no harm; wells help douse
      razed: (b, by) => note({ t: tick, kind: 'razed', building: b.id, type: b.type, owner: b.team, by, ...(b.type === 'temple' || b.type === 'shrine' ? { sacrilege: true as const } : {}) }),
      immune: (b) => anySafe && b.ti.some((t) => safeMask[t] === 1), // M7b: a court's corner towers stand half outside it
      douse: (b) => towns.douse(b),
    },
  );

  /** M5h3: engineer nodes held by the living engineers of each team (once a tick). */
  let nodesAt = -1;
  const teamNodes = new Map<number, Set<string>>();
  const engineerNodes = (team: number): ReadonlySet<string> => {
    if (nodesAt !== tick) {
      nodesAt = tick;
      teamNodes.clear();
      for (const u of units) {
        if (!u.alive || u.civ !== 'engineer') continue;
        let set = teamNodes.get(u.squad.team);
        if (!set) teamNodes.set(u.squad.team, (set = new Set()));
        for (const n of heldNodes('engineer', u.person?.hero.perks)) set.add(n);
      }
    }
    return teamNodes.get(team) ?? NO_NODES;
  };
  const placeable = (type: BuildingType, team: number | undefined) => {
    const n = PLACE_NODE[type];
    return !n || (team !== undefined && engineerNodes(team).has(n));
  };
  /** M5h3: foe men moving over stakes are wounded. */
  const stakes = () => {
    for (const u of units) {
      if (!u.alive || !u.moving) continue;
      const t = tileAt(grid, u.x, u.y);
      const f = t >= 0 ? works.fieldAt(t) : undefined;
      if (f && f.def.field === 'stakes' && f.team !== u.squad.team) hurt(u, FIELD.stakes.dmg * STAKES_EVERY * DT);
    }
  };

  const siege = createSiege(works, rng, {

    path: (team, x0, y0, x1, y1) => {
      grid.team = team;
      grid.engine = true; // M5h3: off stakes and ditches
      const p = cornerPath(x0, y0, x1, y1);
      grid.engine = false;
      return p;
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
    nodes: engineerNodes,
    foe(team, x, y, r) {
      let best: Unit | null = null, bd = r * r;
      for (const u of units) {
        if (!u.alive || u.squad.team === team || u.civ) continue;
        const d = (u.x - x) ** 2 + (u.y - y) ** 2;
        if (d < bd && vision.visibleTo(team, u.x, u.y)) (bd = d), (best = u);
      }
      return best ? [best.x, best.y] : null;
    },
    pierce(team, x0, y0, x1, y1, w, dmg, ap, n) {
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
      const hit: [number, Unit][] = [];
      for (const u of units) {
        if (!u.alive || u.squad.team === team) continue;
        const k = ((u.x - x0) * dx + (u.y - y0) * dy) / l2;
        if (k < 0 || k > 1) continue;
        if ((x0 + dx * k - u.x) ** 2 + (y0 + dy * k - u.y) ** 2 <= w * w) hit.push([k, u]);
      }
      hit.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
      for (const [, u] of hit.slice(0, n)) hurt(u, afterArmour(dmg, u.st.armor, ap));
    },
    stoneTower(team, x, y) {
      const t = tileAt(grid, x, y);
      const b = t >= 0 && grid.deck[t] === DECK ? works.piece(grid.plat[t]) : undefined;
      return !!b && b.type === 'stoneTower' && b.team === team && (b.state === 'done' || b.state === 'damaged');
    },
    // M6b carts
    cartPath(team, x0, y0, x1, y1) {
      grid.team = team;
      grid.engine = grid.cart = true;
      const p = cornerPath(x0, y0, x1, y1);
      grid.engine = grid.cart = false;
      return p;
    },
    cartCost(x, y, dx, dy) {
      const a = tileAt(grid, x, y), b = tileAt(grid, x + dx * 0.5, y + dy * 0.5);
      if (b < 0) return 0;
      if (a !== b) {
        grid.cart = grid.engine = true;
        const ok = a < 0 || canEnter(grid, a, b);
        grid.cart = grid.engine = false;
        if (!ok) return 0;
      }
      const k = grid.cartMul[b] > 0 ? grid.cartMul[b] : CART_FORD;
      return a >= 0 && grid.height[b] > grid.height[a] ? k * CART_UPHILL : k;
    },
    foeNear(team, x, y, r) {
      for (const u of units) if (u.alive && u.squad.team !== team && u.squad.team !== MOB_TEAM && !u.civ && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) return true;
      return false;
    },
    taker(e) {
      if (inSafe(e.x, e.y)) return null; // M6d: no capture in a safe zone
      let by: Unit | null = null;
      for (const u of units) {
        if (!u.alive || u.squad.team === MOB_TEAM) continue;
        const d = (u.x - e.x) ** 2 + (u.y - e.y) ** 2;
        if (u.squad.team === e.team && d <= CART.guard * CART.guard) return null;
        if (u.squad.team !== e.team && d <= CART.beside * CART.beside && (!by || u.id < by.id)) by = u;
      }
      return by ? [by.squad.team, by.squad.owner] : null;
    },
    captured(e, by) {
      note({ t: tick, kind: 'cartCaptured', cart: e.id, team: e.team, owner: by });
      // CART.captureXp to the taking squad (the nearest of its owner)
      let best: Squad | null = null;
      for (const q of squads) if (q.owner === by && q.alive > 0 && (!best || dist2(q, { cx: e.x, cy: e.y }) < dist2(best, { cx: e.x, cy: e.y }))) best = q;
      if (best) for (const u of best.units) if (u.alive) u.obj += CART.captureXp;
      for (const q of squads) if (q.escort === e.id && q.team !== e.team) (q.escort = -1), (q.order = 'hold');
    },
    wreck: (e, burnt) => void piles.drop(e.x, e.y, e.hold!.lots, e.hold!.items, tick, burnt ? PILE.spoil : 0),
    crewNode(crew, node) {
      for (const u of squads[crew]?.units ?? []) if (u.alive && u.civ === 'merchant' && heldNodes('merchant', u.person?.hero.perks).has(node)) return true;
      return false;
    },
  });

  // M5h: crafting queues of the workplaces (./crafting.ts), run on the civilian loop
  const crafting = createCrafting({
    seed, takeAt: works.takeAt, addAt: works.addAt, emit: note,
    // M6b: a cart rolls out in front of the workshop for the crafter's player, within his cap and the civilian quota
    cart(b, owner, type, check) {
      if (!isCartType(type as never) || siege.carts({ owner }) >= cartCapOf(owner) || civRoom(b.team) <= 0) return false;
      if (check) return true;
      const p = works.ringPoints(b.id, 1, b.x, b.y + 10);
      const [x, y] = p.length ? [p[0], p[1]] : openPoint(b.x, b.y + 3);
      siege.cart(b.team, owner, type as never, x, y);
      return true;
    },
  });
  const mobs = createMobs(region, {
    squads,
    spawn: (kind, count, x, y, k) => {
      const id = api.spawnSquad(MOB_OWNER, MOB_TEAM, mobClass(kind), count, x, y);
      // M7c: depth and the host's elite guard over the kind's stats; a captain leads (the first man)
      squads[id]?.units.forEach((u, i) => {
        const hp = k.hp * (i === 0 && k.lead ? k.lead.hp : 1), dmg = k.dmg * (i === 0 && k.lead ? k.lead.dmg : 1);
        if (hp === 1 && dmg === 1) return;
        u.st = { ...u.st, maxHp: u.st.maxHp * hp, dmg: u.st.dmg * dmg, rangedDmg: u.st.rangedDmg * dmg };
        u.maxHp = u.hp = u.st.maxHp;
      });
      return id;
    },
    held: (on) => works.setFallback(on ? MOB_TEAM : NEUTRAL_TEAM),
    captainDown: (lair, by) => note({ t: tick, kind: 'captainSlain', lair, by }),
    towers: () => works.prebuilt().filter((b) => b.def.wall === 'tower' && (b.team === MOB_TEAM || b.team === NEUTRAL_TEAM) && (b.state === 'done' || b.state === 'damaged')).map((b) => ({ id: b.id, x: b.x, y: b.y })),
    carts: () => siege.snaps(tick).filter((e) => isCartType(e.type) && e.state !== 'destroyed' && e.team !== MOB_TEAM).map((e) => ({ id: e.id, x: e.x, y: e.y, team: e.team })),
    order: (o) => apply(o),
    arrived: (id) => !squads[id].goal && squads[id].pi >= squads[id].path.length / 2,
    nodes: () => works.resourceNodes(),
    lockNodes: works.lockNodes,
    claim: (team, x, y, r) => {
      works.claim(team, x, y, r);
      // M5d: the squad that channelled it (the nearest of the team on a claim order) has an objective
      let best: Squad | null = null;
      for (const s of squads) if (s.team === team && s.claimPt >= 0 && s.alive > 0 && (!best || dist2(s, { cx: x, cy: y }) < dist2(best, { cx: x, cy: y }))) best = s;
      if (best) objective(best, 'claim');
    },
    influenced: (x, y) => works.influence().mask[tileAt(grid, x, y)] !== 0,
    range: (lo, hi) => rng.range(lo, hi),
    w: grid.w,
    h: grid.h,
  });

  // M7a: the region's pre-built pieces and their functions (./prebuilt.ts)
  const towns = createTowns(works, { squads, units, mob: MOB_TEAM });
  works.prebuild(NEUTRAL_TEAM);

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
    // M6b escort at its cart (no foe taken on): a ring ESCORT.ring out round it, so the cart stays in sight
    if (s.order === 'escort' && s.target < 0) {
      const e = siege.get(s.escort);
      if (e && (s.ax - e.x) ** 2 + (s.ay - e.y) ** 2 <= (ESCORT.ring + 4) ** 2) {
        // a second squad on the same cart: its own ring 1.5 further out, turned half a slot, so the two never stack
        const r = ESCORT.ring + (s.id % 2) * 1.5, a = e.facing + ((slot + 0.5 + (s.id % 2) * 0.5) / Math.max(1, s.offsets.length / 2)) * Math.PI * 2;
        return [e.x + Math.cos(a) * r, e.y + Math.sin(a) * r];
      }
    }
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
    if ((s.order === 'attack' || (s.order === 'attackMove' && s.target >= 0)) && !s.ranged && n >= 4 && tileAt(grid, s.path[n - 2], s.path[n - 1]) !== tileAt(grid, ...openPoint(x, y))) trimEnd(s.path, HOLD_OFF);
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
      near: [], sites: [], node: -1, fixed: null, col: null, siege: -1, task: null, claimPt: -1, pair: s.id, flee: false, calm: 0, resume: null, work: -1,
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
    if (o.kind === 'craft' || o.kind === 'cancelCraft' || o.kind === 'repair' || o.kind === 'salvage') {
      const b = works.piece(o.building);
      if (b && !b.cancelled && (b.state === 'done' || b.state === 'damaged')) crafting.order(o, b);
      return;
    }
    if (o.kind === 'fortify') {
      // M5h3: a Fortifier of the team iron-binds a gate or hangs wet hides, paid at once
      if (engineerNodes(o.team).has('fortifier')) works.fortify(o.team, o.building, o.fort);
      return;
    }
    if (o.kind === 'placeBuilding' && !placeable(o.type, o.squad === undefined ? o.team : squads[o.squad]?.team)) return;
    if (o.kind === 'rebuild') {
      // M7a: a ruin on the team's ground becomes a site; a squad given builds it
      const team = o.squad === undefined ? o.team : squads[o.squad]?.team;
      if (team === undefined || !works.rebuild(o.building, team, MOB_TEAM)) return;
      if (o.squad !== undefined) apply({ kind: 'build', squad: o.squad, site: o.building });
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
    if (s.civ && !CIV_ORDERS.has(o.kind)) return; // M5f: civilians take work orders only
    // M5f: an order ends a civilian squad's flight (the flee controller sets it again after its own move)
    s.flee = false;
    s.resume = null;
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
    // M6d: no attack, fire or capture on what stands in a safe zone
    if (o.kind === 'attack' && squads[o.target] && inSafe(squads[o.target].cx, squads[o.target].cy)) return;
    if ((o.kind === 'attackBuilding' || o.kind === 'ignite') && (o.building !== undefined ? safeBuilding(o.building) : o.siege !== undefined && !!siege.get(o.siege) && inSafe(siege.get(o.siege)!.x, siege.get(o.siege)!.y))) return;
    if (o.kind === 'load' || o.kind === 'unload' || o.kind === 'escort' || o.kind === 'salvagePile') return tradeOrder(s, o);
    if (o.kind !== 'formation' && o.kind !== 'detach') (s.xfer = null), (s.escort = -1), (s.salv = null);
    if (s.siege >= 0 && siege.get(s.siege)?.crew !== s.id) (s.siege = -1), (s.fixed = null); // its ladder or tower went up: the crew is free
    if (s.siege >= 0 && (o.kind === 'move' || o.kind === 'hold' || o.kind === 'stop' || o.kind === 'attackMove' || o.kind === 'attackBuilding' || o.kind === 'deploy' || o.kind === 'raiseLadder')) {
      // the crew drives its engine (an attack-move rolls it like a move, stop holds it)
      const id = s.siege;
      if (o.kind === 'move' || o.kind === 'attackMove') {
        siege.move(id, o.x, o.y);
        s.order = 'move';
        return;
      }
      if (o.kind === 'hold' || o.kind === 'stop') {
        siege.hold(id);
        s.order = 'hold';
        return;
      }
      if (o.kind === 'deploy') siege.deploy(id, !!o.pack);
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
    if (o.kind === 'repairBuilding') {
      // M7a: the squad mends a damaged building of its team (paid as it goes)
      if (!works.mend(o.building, s.team)) return;
      apply({ kind: 'build', squad: s.id, site: o.building });
      return;
    }
    if (o.kind === 'claimRegion') {
      const cp = region.claimPoints?.[o.point];
      if (cp && inSafe(cp.x, cp.y)) return; // M6d: no claim in a safe zone
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
      if ((s.civ && !siege.isCart(o.siege)) || (siege.isCart(o.siege) && siege.get(o.siege)!.owner !== s.owner) || !siege.crew(o.siege, s.id, s.team)) return; // M6b: civilians pull only carts, a player only his own
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
        if (!l || l.type !== 'ladder' || l.team === s.team) return; // M5h3: a siege tower's bridge is not pushed off
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
      if (!t || t === s || t.team !== s.team || t.owner !== s.owner || t.civ !== s.civ || s.alive === 0 || t.alive + s.alive > SQUAD_MAX) return;
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
    if (o.kind === 'civWork') {
      // M5f: the men stand round the building (its ring) and work there by class; at a workplace the first of them at
      // its stations inside
      const b = works.piece(o.building);
      if (!s.civ || !b || b.cancelled || b.team !== s.team || !(b.def.store || b.def.workplace) || (b.state !== 'done' && b.state !== 'damaged')) return;
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      s.order = 'civWork';
      s.work = o.building;
      s.sites = [];
      s.node = -1;
      s.path = [];
      s.goal = null;
      const spots = works.workSpots(o.building).slice(0, Math.max(1, s.alive)).flatMap(([x, y]) => [x, y]);
      const pts = [...spots, ...works.ringPoints(o.building, Math.max(1, s.alive) - spots.length / 2, s.cx, s.cy)];
      s.fixed = pts.length ? pts : null;
      if (pts.length) requestPath(s, pts[0], pts[1]);
      return;
    }
    if (o.kind === 'placeBuilding' && BUILDINGS[o.type].brazier) {
      works.place(s.team, o.type, o.x, o.y, o.rot ?? 0); // W-35: set down done and lit; the squad carries on
      return;
    }
    if (o.kind === 'placeBuilding' || o.kind === 'placeWall' || o.kind === 'placeBridge' || o.kind === 'build' || o.kind === 'gather') {
      const sites =
        o.kind === 'placeBuilding' ? [works.place(s.team, o.type, o.x, o.y, o.rot ?? 0, s.owner)].filter((id) => id >= 0)
        : o.kind === 'placeWall' ? works.placeWall(s.team, o)
        : o.kind === 'placeBridge' ? works.placeBridge(s.team, o)
        : o.kind === 'build' ? (works.siteOk(o.site, s.team) ? [o.site] : [])
        : [];
      if (o.kind !== 'gather' && !sites.length) return; // invalid placement: the squad carries on
      if (o.kind === 'gather' && !works.nodeOk(o.node, s.team)) return; // M7e: rare nodes for the region's holder only
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
    if (o.kind === 'stop') {
      // halt: the march ends where the men are; they form up there (same shape and facing) and hold
      const arrived = s.pi >= s.path.length / 2 && !s.goal;
      s.order = 'hold';
      s.path = [];
      s.pi = 0;
      s.goal = null;
      s.target = -1;
      if (!(s.fixed && arrived)) {
        s.fixed = null;
        [s.ax, s.ay] = openPoint(s.cx, s.cy);
        for (const u of s.units) (u.own = []), (u.wp = 0), (u.settled = false);
      }
      return;
    }
    s.order = o.kind;
    if (o.kind !== 'hold') s.fixed = null; // holding on a wall stays up there
    if (o.kind === 'attackMove') {
      s.amx = o.x;
      s.amy = o.y;
      s.target = -1;
      requestPath(s, o.x, o.y);
    } else if (o.kind === 'move') {
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
      const dmg = u.st.dmg * BUILDING_MELEE * (1 + (u.st.breach ?? 0)); // M5h Breaching
      const ca = k.e >= 0 ? CART_ARMOR[e!.type] : undefined; // M6b: a cart takes a blow like a man of its armour
      if (k.b >= 0) hitBuilding(s, k.b, dmg);
      else siege.damage(k.e, ca !== undefined ? afterArmour(u.st.dmg, ca, 0) : dmg);
    } else if (k.kind === 'buildSiege') {
      if (siege.labour(k.e, DT * (u.brate ?? 1))) u.working = true;
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
    chase(s, t);
  };

  /**
   * attackMove: march to (amx, amy); a foe squad in sight (s.near) on the way is taken on as by an attack order (the
   * nearest, kept while it lives and stays in sight); with none left the march resumes; at the end the squad holds.
   */
  const updateAttackMove = (s: Squad) => {
    let t: Squad | null = s.target >= 0 ? squads[s.target] : null;
    if (t && (t.alive === 0 || !s.near.includes(t))) t = null;
    if (!t) for (const o of s.near) if (!t || dist2(s, o) < dist2(s, t)) t = o;
    if (t) {
      if (s.target !== t.id) (s.target = t.id), (s.repathAt = tick);
      chase(s, t);
    } else if (s.target >= 0) {
      s.target = -1;
      requestPath(s, s.amx, s.amy);
    } else if (!s.goal && s.pi >= s.path.length / 2) s.order = 'hold';
  };

  /** The anchor closes on foe squad t: stops within striking (or shooting) distance, else re-paths to it now and then. */
  const chase = (s: Squad, t: Squad) => {
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
    let budget = SPEED * s.speed * (s.flee ? CIV.fleeSpeed : 1) * (s.laden ? PORTER.slow : 1) * DT * Math.min(1, Math.max(0.25, 1.25 - lag / 6));
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
      if (anySafe && safeMask[t] && !safeMask[from] && !safeEntry(u)) return false; // M6d: the gate refuses him
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

  const hurt = (t: Unit, dmg: number, by?: Unit) => {
    if (anySafe && inSafe(t.x, t.y) && dmg !== Infinity) return; // M6d: no combat in a safe zone (a bridge fall aside)
    if (by) by.tag = t.tag = tick + SAFE.tag; // M6d: combat tag
    const d = dmg * (working(t) ? WORK_DEFENCE : 1) * (t.squad.fedUntil > tick ? t.squad.fedInn : 1); // M5f: a fed squad takes less
    if (by?.venom && t.squad.theriacUntil <= tick) t.venomUntil = tick + VENOM.ticks; // M5h: a venomous bite
    if (by) {
      by.dealt += Math.min(d, t.hp);
      by.engaged = t.engaged = true;
    }
    t.hp -= d;
    if (t.hp > 0) return;
    t.hp = 0;
    t.alive = false;
    works.release(t);
    t.fighting = false;
    t.moving = false;
    t.tgt = null;
    // M5d: by his END (docs/WAR.md "Lifecycle"); M5f: a physician near; M5h: a bandage of his squad, venom
    const bandage = t.squad.bandages > 0 ? (t.squad.bandages--, dresser.has(t.squad.team) ? 2 : 1) : 0;
    t.wounded = rng.chance(fallShare(t.st.ws + (towns.blessed(t.squad.id) ? BLESS.share : 0), physicianNear(t), bandage, t.venomUntil > tick));
    if (t.squad.team === MOB_TEAM && t.beast) hides(t);
    t.squad.alive--;
    reslotQueue.add(t.squad);
    if (by) by.kills++;
    note({ t: tick, kind: 'fall', unit: t.id, by: by?.id ?? -1, wounded: t.wounded });
    // M6c (docs/WAR.md "Loot piles"): what he carried goes to a pile; the killed leave their worn kit too, worn by PILE.wear
    const lots: Lot[] = t.pack ? t.pack.lots.filter((l) => l.n > 1e-9) : [];
    if (t.carry && t.load > 0 && t.wfor < 0) lots.push({ r: t.carry, n: t.load, o: region.id });
    const items = t.pack ? t.pack.items.slice() : [];
    if (!t.wounded && t.person) {
      for (const it of Object.values(t.person.hero.equip)) if (it) items.push({ ...it, cond: Math.max(0, it.cond - PILE.wear) });
      t.person = { ...t.person, hero: { ...t.person.hero, equip: {} } };
    }
    if (t.carry && t.wfor < 0) (t.carry = null), (t.load = 0);
    t.pack = null;
    piles.drop(t.x, t.y, lots, items, tick);
  };
  /** M6d: a building of the region stands in a safe zone. */
  const safeBuilding = (id: number) => {
    const b = works.piece(id);
    return !!b && anySafe && inSafe(b.x, b.y);
  };

  /** M5h Hunter: a beast killed within HUNT.r of a hunter forager brings his team HUNT.hides. */
  const hides = (t: Unit) => {
    const got = new Set<number>();
    for (const c of civs) {
      const team = c.squad.team;
      if (!c.alive || c.civ !== 'forager' || got.has(team) || !heldNodes('forager', c.person?.hero.perks).has('hunter') || (c.x - t.x) ** 2 + (c.y - t.y) ** 2 > HUNT.r * HUNT.r) continue;
      got.add(team);
      works.addAt(team, c.x, c.y, 'hides', HUNT.hides);
    }
  };

  /** M5d: objective XP to the living men of s. */
  const objective = (s: Squad, what: 'claim' | 'building') => {
    for (const u of s.units) if (u.alive) u.obj += XP.objective;
    note({ t: tick, kind: 'objective', squad: s.id, what });
  };
  /** Damage building b for squad s; its fall is an objective of s. */
  const hitBuilding = (s: Squad, b: number, dmg: number) => {
    const was = works.piece(b)?.state;
    works.damage(b, dmg, s.team);
    if (was !== undefined && was !== 'destroyed' && works.piece(b)?.state === 'destroyed') objective(s, 'building');
  };

  // --- M6 trade (./trade.ts): holders, porters, carts, escorts, piles, safe zones ---
  /** Most carts a player has out (Emporos: one more). */
  const cartCapOf = (owner: string) => {
    for (const u of civs) if (u.alive && u.civ === 'merchant' && u.squad.owner === owner && heldNodes('merchant', u.person?.hero.perks).has('emporos')) return CART.emporos;
    return CART.cap;
  };
  const holderAt = (ref: HolderRef): HolderAt | null => {
    if (ref.building !== undefined) {
      const b = works.piece(ref.building), hd = works.holdOf(ref.building);
      return b && hd ? { hold: hd, x: b.x, y: b.y, kind: b.def.chest ? 'chest' : 'store', team: b.team, owner: b.owner, cap: b.def.chest ?? Infinity, id: b.id } : null;
    }
    if (ref.cart !== undefined) {
      const e = siege.get(ref.cart);
      return e && e.hold && e.state !== 'destroyed' ? { hold: e.hold, x: e.x, y: e.y, kind: 'cart', team: e.team, owner: e.owner, cap: siege.cartCap(e.id), id: e.id } : null;
    }
    if (ref.pile !== undefined) {
      const p = piles.get(ref.pile);
      return p ? { hold: p.hold, x: p.x, y: p.y, kind: 'pile', team: -1, owner: '', cap: 0, id: p.id } : null;
    }
    return null;
  };
  /** (x,y) within r of the holder (a building: of its footprint). */
  const byHolder = (h: HolderAt, x: number, y: number, r: number) => (h.kind === 'store' || h.kind === 'chest' ? works.dist2(h.id, x, y) <= r * r : (h.x - x) ** 2 + (h.y - y) ** 2 <= r * r);
  const unitNear = (pred: (u: Unit) => boolean, x: number, y: number, r: number) => units.some((u) => u.alive && pred(u) && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r);
  /** May squad s take from h? A pile: anyone; his cart, his chest, his team's store; looting: see TradeOrder. In a safe zone only his own. */
  const mayTake = (s: Squad, h: HolderAt): boolean => {
    if (h.kind === 'pile') return true;
    if (h.kind === 'cart') return h.owner === s.owner;
    if (h.kind === 'store' && works.piece(h.id)?.def.cache) return !inSafe(h.x, h.y); // M7a: a town's cache: anyone's
    const own = h.kind === 'chest' ? h.owner === s.owner : h.team === s.team;
    if (own) return true;
    if (inSafe(h.x, h.y) || h.team === s.team) return false;
    if (h.kind === 'chest') return !unitNear((u) => u.squad.owner === h.owner, h.x, h.y, CHEST.guard);
    return works.storeNet(h.id) < 0 && !unitNear((u) => u.squad.team === h.team, h.x, h.y, CHEST.guard);
  };
  const mayPut = (s: Squad, h: HolderAt) => (h.kind === 'store' ? h.team === s.team && !works.piece(h.id)?.def.cache : h.kind !== 'pile' && h.owner === s.owner);
  /** What a take from h draws: an own store also opens the home strongroom. */
  const takeHolds = (s: Squad, h: HolderAt): Hold[] => (h.kind === 'store' && h.team === s.team ? [h.hold, works.reserveOf(h.team)] : [h.hold]);
  const crewCart = (s: Squad) => (s.siege >= 0 && siege.isCart(s.siege) && siege.get(s.siege)!.crew === s.id ? s.siege : -1);

  /** M6: a load, unload, escort or salvagePile order. */
  const tradeOrder = (s: Squad, o: Extract<Order, { kind: 'load' | 'unload' | 'escort' | 'salvagePile' }>) => {
    const stopWork = () => {
      if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null);
      s.task = null;
      s.claimPt = -1;
      s.xfer = null;
      s.escort = -1;
      s.salv = null;
    };
    if (o.kind === 'escort') {
      const e = siege.get(o.cart);
      if (s.civ || !e || !siege.isCart(o.cart) || e.state === 'destroyed' || e.team !== s.team) return;
      stopWork();
      if (s.siege >= 0) uncrew(s);
      s.escort = o.cart;
      s.order = 'escort';
      s.target = -1;
      s.fixed = null;
      requestPath(s, e.x, e.y);
      return;
    }
    if (o.kind === 'salvagePile') {
      const p = piles.get(o.pile);
      if (!p || !p.hold.items.some((it) => it.uid === o.uid) || !s.units.some((u) => u.alive && u.civ === 'smith')) return;
      stopWork();
      if (s.siege >= 0) uncrew(s);
      s.salv = { pile: o.pile, uid: o.uid, t: 0 };
      s.order = 'salvagePile';
      s.fixed = null;
      requestPath(s, p.x, p.y);
      return;
    }
    const ref = o.kind === 'load' ? o.from : o.to, h = holderAt(ref);
    if (!h || (o.kind === 'load' ? !mayTake(s, h) : !mayPut(s, h))) return;
    stopWork();
    s.xfer = { ref, dir: o.kind, ...(o.res ? { res: o.res } : {}), n: o.kind === 'load' ? o.n ?? Infinity : Infinity };
    s.order = o.kind;
    const c = crewCart(s);
    if (c >= 0) {
      siege.move(c, h.x, h.y); // the cart rolls up to it; the crew stays with the cart
      return;
    }
    if (s.siege >= 0) uncrew(s);
    const pts = h.kind === 'store' || h.kind === 'chest' ? works.ringPoints(h.id, Math.max(1, s.alive), s.cx, s.cy) : [];
    s.fixed = pts.length ? pts : null;
    if (pts.length) requestPath(s, pts[0], pts[1]);
    else requestPath(s, h.x, h.y);
  };

  /** Every tick: loads move, one a man (or a crew man at a cart) every PORTER.every ticks; done, the squad holds. */
  const tradeTick = () => {
    for (const s of squads) {
      if (s.alive === 0) continue;
      s.laden = s.units.some((u) => u.alive && !!u.pack && loads(u.pack) > 1e-9);
      if (s.salv) salvTick(s);
      if (!s.xfer || (tick + s.id) % PORTER.every) continue;
      const x = s.xfer, h = holderAt(x.ref), load = x.dir === 'load';
      const end = () => {
        s.xfer = null;
        s.order = 'hold';
      };
      if (!h || (load ? !mayTake(s, h) : !mayPut(s, h))) {
        end();
        continue;
      }
      const pile = h.kind === 'pile', c = crewCart(s);
      if (c >= 0) {
        const e = siege.get(c)!;
        if (!byHolder(h, e.x, e.y, CART.reach)) {
          if (e.mode === 'none') siege.move(c, h.x, h.y);
          continue;
        }
        let n = 0;
        for (const u of s.units) if (u.alive && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 <= 9) n++;
        const room = load ? siege.cartCap(c) - loads(e.hold!) : h.cap - loads(h.hold);
        const amt = Math.min(Math.max(1, n) * PORTER.loads, room, x.n / perLoad(x.res));
        let moved = 0;
        if (load) for (const src of takeHolds(s, h)) moved += moveHold(src, e.hold!, amt - moved, x.res, pile ? 1 : Infinity);
        else moved = moveHold(e.hold!, h.hold, amt, x.res, Infinity, true);
        x.n -= moved * perLoad(x.res);
        if (moved <= 1e-9) end();
        continue;
      }
      let pending = false, moved = 0;
      for (const u of s.units) {
        if (!u.alive) continue;
        if (!byHolder(h, u.x, u.y, PILE.reach + 0.5)) {
          pending = true;
          continue;
        }
        const pack = (u.pack ??= newHold());
        if (load) {
          const amt = Math.min(PORTER.loads - loads(pack), x.n / perLoad(x.res));
          let m = 0;
          const was = pack.items.length;
          for (const src of takeHolds(s, h)) m += moveHold(src, pack, amt - m, x.res, pile ? 1 : Infinity);
          if (pile && pack.items.length > was) {
            const got = (loot[s.team] ??= []);
            for (const it of pack.items.slice(was)) got.push({ ...it });
            note({ t: tick, kind: 'pickup', drop: h.id, team: s.team, items: pack.items.length - was });
          }
          x.n -= m * perLoad(x.res);
          moved += m;
        } else moved += moveHold(pack, h.hold, Math.min(loads(pack), h.cap - loads(h.hold)), x.res, Infinity, true);
      }
      if (!pending && moved <= 1e-9) end();
    }
  };

  /** M6c: a smith squad beside its pile breaks the item up after PILE.salvage ticks: CRAFT.salvage of its recipe's goods into the pile. */
  const salvTick = (s: Squad) => {
    const v = s.salv!, p = piles.get(v.pile), i = p ? p.hold.items.findIndex((it) => it.uid === v.uid) : -1;
    if (!p || i < 0) return void ((s.salv = null), (s.order = 'hold'));
    if (!s.units.some((u) => u.alive && u.civ === 'smith' && (u.x - p.x) ** 2 + (u.y - p.y) ** 2 <= (PILE.reach + 0.5) ** 2)) return;
    p.salv = ++v.t;
    if (v.t < PILE.salvage) return;
    const [it] = p.hold.items.splice(i, 1), r = itemRecipe(it.def);
    // at least one of its main material (a small item would round to nothing)
    (Object.entries(r?.inputs ?? {}) as [ResourceKind, number][]).forEach(([k, n], j) => {
      const got = Math.max(j === 0 ? 1 : 0, Math.round(n * CRAFT.salvage));
      if (got > 0) p.hold.lots.push({ r: k, n: got, o: region.id });
    });
    p.salv = 0;
    p.until = Math.max(p.until, tick + 1);
    s.salv = null;
    s.order = 'hold';
  };

  /** M6b escort, every tick: round the cart; foes within ESCORT.engage of it are taken on, chased no further than ESCORT.leash. */
  const escortTick = (s: Squad) => {
    const e = siege.get(s.escort);
    if (!e || e.state === 'destroyed' || e.team !== s.team) {
      s.escort = -1;
      s.order = 'hold';
      return;
    }
    const far = (s.cx - e.x) ** 2 + (s.cy - e.y) ** 2;
    if (s.target >= 0) {
      const t = squads[s.target];
      if (t.alive === 0 || far > ESCORT.leash * ESCORT.leash || (t.cx - e.x) ** 2 + (t.cy - e.y) ** 2 > ESCORT.leash * ESCORT.leash) s.target = -1;
      else return chase(s, t);
    }
    let best: Squad | null = null, bd = ESCORT.engage * ESCORT.engage;
    for (const o of s.near) {
      const d = (o.cx - e.x) ** 2 + (o.cy - e.y) ** 2;
      if (o.team !== s.team && o.alive > 0 && !inSafe(o.cx, o.cy) && d <= bd) (bd = d), (best = o);
    }
    if (best) {
      s.target = best.id;
      s.repathAt = tick;
      return chase(s, best);
    }
    // keep a column round the cart: walk up to it when it pulls away
    if ((s.ax - e.x) ** 2 + (s.ay - e.y) ** 2 > ESCORT.ring * ESCORT.ring && !s.goal && tick >= s.repathAt) {
      requestPath(s, e.x - Math.cos(e.facing) * 2, e.y - Math.sin(e.facing) * 2);
      s.repathAt = tick + REPATH_TICKS;
    }
  };

  /** M6d, every SCAN ticks: units in a safe zone count their time; a fighter there past SAFE.fighter walks out to the yard. */
  const safeTick = () => {
    for (const s of squads) {
      if (s.alive === 0) continue;
      let out = false;
      for (const u of s.units) {
        if (!u.alive) continue;
        if (inSafe(u.x, u.y)) {
          u.safeT += SCAN;
          if (!u.civ && u.safeT > SAFE.fighter) out = true;
        } else u.safeT = 0;
      }
      if (out) walkSquadOut(s);
    }
  };
  /** The squad walks to the nearest yard rect (else straight out past the zone it is in). */
  const walkSquadOut = (s: Squad) => {
    let best: [number, number] | null = null, bd = Infinity;
    for (const r of region.yard ?? []) {
      const x = r.x + r.w / 2, y = r.y + r.h / 2, d = (x - s.cx) ** 2 + (y - s.cy) ** 2;
      if (d < bd) (bd = d), (best = [x, y]);
    }
    if (!best) {
      const z = (region.safe ?? []).find((r) => inRect(r, s.cx, s.cy));
      if (!z) return;
      best = [z.x + z.w / 2, Math.min(grid.h - 1, z.y + z.h + 3)];
    }
    if (s.siege >= 0) uncrew(s);
    apply({ kind: 'move', squad: s.id, x: best[0], y: best[1] });
    for (const u of s.units) u.safeT = 0;
  };
  /** M6d: may u step into a safe tile? Not with a combat tag, not past SAFE.units of his player inside already. */
  const safeEntry = (u: Unit): boolean => {
    if (u.tag > tick) return false;
    let n = 0;
    for (const o of units) if (o.alive && o.squad.owner === u.squad.owner && inSafe(o.x, o.y)) n++;
    return n < SAFE.units;
  };

  /** M5d: a person's new hero after a level-up: baked again (HP keeps its wounds). */
  const rebake = (u: Unit) => {
    const st = warStatsOf(u.person!);
    u.hp = Math.max(1, Math.min(st.maxHp, u.hp + st.maxHp - u.maxHp));
    u.maxHp = st.maxHp;
    u.st = st;
    setRates(u);
    reslotQueue.add(u.squad);
  };

  /** M5e: building b holds captives: a fort or camp of a team, standing. */
  const holds = (b: ReturnType<typeof works.piece>): b is NonNullable<typeof b> =>
    !!b && HOLD.types.has(b.type) && !b.cancelled && b.state !== 'foundation' && b.state !== 'destroyed';
  /** M5e: the nearest building of `team` that holds captives to (x, y), or undefined. */
  const holdOf = (team: number, x: number, y: number): number | undefined => {
    let best: number | undefined, bd = Infinity;
    for (let id = 0; ; id++) {
      const b = works.piece(id);
      if (!b) break;
      if (b.team !== team || !holds(b)) continue;
      const d = works.dist2(id, x, y);
      if (d < bd) (bd = d), (best = id);
    }
    return best;
  };
  // M5e raids: holding buildings reported fallen; tick of the last raid reported per building
  const fallen = new Set<number>();
  const raidAt = new Map<number, number>();
  /**
   * M5e: every HOLD.every ticks: a holding building that fell, or one that a foe soldier (not fauna, not a civilian)
   * reached within HOLD.r tiles with no soldier of its team within HOLD.r, is raided (at most once per HOLD.cooldown).
   */
  const raidScan = () => {
    for (let id = 0; ; id++) {
      const b = works.piece(id);
      if (!b) break;
      if (!HOLD.types.has(b.type) || b.cancelled) continue;
      if (b.state === 'destroyed') {
        if (!fallen.has(id)) fallen.add(id), note({ t: tick, kind: 'raid', building: id, team: b.team, fell: true });
        continue;
      }
      if (!holds(b) || tick - (raidAt.get(id) ?? -Infinity) < HOLD.cooldown) continue;
      let by: number | undefined, own = false;
      const far = (HOLD.r + Math.max(b.w, b.h)) ** 2;
      for (const u of units) {
        const tm = u.squad.team;
        if (!u.alive || u.civ || tm === MOB_TEAM || (u.x - b.x) ** 2 + (u.y - b.y) ** 2 > far || works.dist2(id, u.x, u.y) > HOLD.r * HOLD.r) continue;
        if (tm === b.team) {
          own = true;
          break;
        }
        by ??= tm;
      }
      if (by === undefined || own) continue;
      raidAt.set(id, tick);
      note({ t: tick, kind: 'raid', building: id, team: b.team, by, fell: false });
    }
  };

  /** M5d: the fight report (WarBuildSim.endFight). */
  const endFight = (): FightReport => {
    const persons = resultsOf(units);
    for (const u of units) (u.dealt = u.kills = u.obj = 0), (u.engaged = u.repaired = false);
    for (const s of reslotQueue) reslot(s);
    reslotQueue.clear();
    const out: FightReport = { tick, persons, loot };
    loot = {};
    return out;
  };

  /** The fight results of `of` so far (each person's XP, kills, state); their tallies stay for the caller to clear. */
  const resultsOf = (of: Iterable<Unit>): PersonResult[] => {
    const took = new Map<number, number>(); // team -> its soldiers who took part
    for (const u of units) if (u.engaged && u.squad.team !== MOB_TEAM) took.set(u.squad.team, (took.get(u.squad.team) ?? 0) + 1);
    const persons: PersonResult[] = [];
    for (const u of of) {
      const p = u.person;
      if (!p || u.reported || (u.alive && !u.engaged && !u.obj && !u.repaired)) continue;
      const team = u.squad.team;
      let foes = 0;
      for (const [tm, n] of took) if (tm !== team) foes += n;
      let state: PersonResult['state'] = u.alive ? 'fit' : u.wounded ? 'wounded' : 'dead';
      let captor: number | undefined, fort: number | undefined;
      if (state === 'wounded') {
        // captive: no friendly within CAPTURE_R, the nearest foe soldier within it takes him
        let friend = false, bd = CAPTURE_R * CAPTURE_R;
        for (const o of units) {
          if (!o.alive || o.squad.team === MOB_TEAM) continue;
          const d2 = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
          if (d2 > CAPTURE_R * CAPTURE_R) continue;
          if (o.squad.team === team) {
            friend = true;
            break;
          }
          if (d2 <= bd) (bd = d2), (captor = o.squad.team);
        }
        if (friend) captor = undefined;
        if (captor !== undefined) {
          state = 'captive';
          fort = holdOf(captor, u.x, u.y);
          note({ t: tick, kind: 'capture', unit: u.id, pid: p.id, captor });
          // M6c: his worn kit to a pile at the capture tile (he walks home in a militia tunic)
          piles.drop(u.x, u.y, [], Object.values(p.hero.equip).filter((it): it is Item => !!it), tick);
        }
      }
      let xp = Math.floor(u.dealt * XP.perDmg) + u.kills * XP.kill + u.obj + (u.alive && foes >= SQUAD_MAX ? XP.survived : 0);
      if (state === 'wounded' || state === 'captive') xp = Math.floor(xp / 2);
      if (state === 'dead') xp = 0;
      const g = gainXp(p.hero, xp);
      const hero = { ...g.hero, kills: p.hero.kills + u.kills, battles: p.hero.battles + (u.engaged ? 1 : 0), ...(state === 'dead' || state === 'captive' ? { equip: {} } : {}) };
      u.person = { ...p, hero };
      if (g.levelUps) note({ t: tick, kind: 'levelUp', unit: u.id, pid: p.id, level: hero.level });
      if (g.levelUps && u.alive) rebake(u);
      if (!u.alive) u.reported = true;
      persons.push({ pid: p.id, owner: u.squad.owner, team, state, ...(captor !== undefined ? { captor } : {}), ...(fort !== undefined ? { fort } : {}), xp, kills: u.kills, dmg: Math.round(u.dealt), levelUps: g.levelUps, hero });
    }
    return persons;
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
        if (!t.alive || (anySafe && inSafe(t.x, t.y))) continue; // M6d: none inside a safe zone
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
  const dmgMult = (u: Unit, t: Unit, missile = false) => {
    const m = u.squad.out * t.squad.inn * (u.squad.fedUntil > tick ? 1 + (missile ? u.squad.fedMissile : u.squad.fedMelee) : 1);
    return u.st.flags & F.finisher && t.hp < FLAG_FX.finishHp * t.maxHp ? m * FLAG_FX.finishDmg : m;
  };

  const strike = (u: Unit, t: Unit, dh: number) => {
    const bog = groundAt(u.x, u.y) === BOG;
    u.cd = Math.round(u.st.atkTicks * (bog ? COMBAT.bogAtk : 1) * (dh < 0 ? COMBAT.uphillAtk : 1));
    u.swingAt = tick;
    if (!working(t) && rng.chance(blockChance(blockOf(u, t), t.facing, u.x - t.x, u.y - t.y, false, groundAt(t.x, t.y) === BOG))) return;
    hurt(t, afterArmour(u.st.dmg * meleeHeight(dh) * (bog ? COMBAT.bogDmg : 1) * dmgMult(u, t), t.st.armor, 0), u);
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
    return !near ? 'noBrazier' : works.pitch(s.team, s.cx, s.cy) < pitch - 1e-9 ? 'noPitch' : null;
  };
  /** A fire arrow for this shot? Only by a lit brazier, and it takes its pitch (else a plain arrow). */
  const fireShot = (u: Unit) =>
    u.squad.fire && u.st.missile === 'arrow' && works.litNear(u.squad.team, u.x, u.y, hAt(u.x, u.y), fireReach(u)) &&
    works.takeAt(u.squad.team, u.x, u.y, { pitch: u.st.flags & F.fireArcher ? BRAZIER.pitch * FLAG_FX.firePitch : BRAZIER.pitch });
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
    const hit = rng.chance(hitChance(u.st.accuracy + (u.squad.fedUntil > tick ? u.squad.fedAcc : 0), d, range, groundAt(t.x, t.y) === FOREST));
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

  /** Share of a missile from `by` that man t dodges: crew under their ram's roof (covered ram: more), men behind a mantlet. */
  const cover = (t: Unit, by: Unit) => Math.max(t.squad.siege >= 0 ? siege.roof(t.squad.siege, t.x, t.y, RAM_ROOF) : 0, siege.cover(t.squad.team, t.x, t.y, by.x, by.y));

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
          hitBuilding(m.by.squad, m.b, dmg);
          if (m.raw < 0) works.fireHit(m.b, FIRE_ARROW);
        } else {
          siege.damage(m.e!, dmg);
          if (m.raw < 0 && rng.chance(FIRE_ARROW * siege.fireK(m.e!))) siege.kindle(m.e!, 99);
        }
        continue;
      }
      const t = m.t;
      if (!t || !t.alive) continue;
      const cv = cover(t, m.by);
      if (cv > 0 && rng.chance(cv)) continue;
      if (!working(t) && rng.chance(blockChance(blockOf(m.by, t), t.facing, m.by.x - t.x, m.by.y - t.y, true, groundAt(t.x, t.y) === BOG))) continue;
      hurt(t, afterArmour(m.raw * dmgMult(m.by, t, true), t.st.armor, m.ap), m.by);
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
    if (u.civ || (s.order === 'move' && (s.goal || s.pi < s.path.length / 2)) || (s.siege >= 0 && siege.busy(s.siege)) || (anySafe && inSafe(u.x, u.y))) {
      u.tgt = null; // marching (or crewing a working engine): no fighting
      return null;
    }
    if (!s.near.length) {
      u.tgt = null;
      return null;
    }
    const attacking = s.order === 'attack' || ((s.order === 'attackMove' || s.order === 'escort') && s.target >= 0);
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

  // --- M5f civilians (./civilians.ts) ---
  /** A fit physician of t's team within PHYSICIAN.r of him. */
  const physicianNear = (t: Unit) => {
    for (const p of civs)
      if (p.civ === 'physician' && p.alive && p !== t && p.squad.team === t.squad.team && (p.x - t.x) ** 2 + (p.y - t.y) ** 2 <= p.fieldR * p.fieldR) return true;
    return false;
  };
  /** Gather and build speed by job and work rate (forager, engineer). */
  const setRates = (u: Unit) => {
    const w = u.st.work ?? 1;
    u.wrate = u.civ === 'forager' ? FORAGER.gather * w : u.civ ? w : undefined;
    u.brate = u.civ === 'engineer' ? ENGINEER.build * w : u.civ ? w : undefined;
    // M5h node effects: Master Builder, the forager's yields (Woodsman, Prospector, Pitchman, Herb Finder, Weaver), Field Surgeon
    const held = u.civ ? heldNodes(u.civ, u.person?.hero.perks) : null;
    if (held?.has('masterBuilder') && u.brate) u.brate *= FORAGE.masterBuilder;
    u.gmul = undefined;
    if (u.civ === 'forager' && held) {
      const m: Partial<Record<ResourceKind, number>> = {};
      if (held.has('woodsman')) m.wood = FORAGE.woodsman;
      if (held.has('prospector')) m.copper = m.tin = m.iron = m.silver = m.salt = FORAGE.prospector;
      if (held.has('pitchman')) m.pitch = FORAGE.pitchman;
      u.gmul = m;
      u.herbs = held.has('herbFinder');
      u.flax = held.has('weaver');
    }
    u.fieldR = held?.has('fieldSurgeon') ? PHYSICIAN.surgeonR : PHYSICIAN.r;
    u.venom = mobKindOf(u.cls) ? !!MOBS[mobKindOf(u.cls)!].venom : false;
    u.beast = !!mobKindOf(u.cls) && mobKindOf(u.cls) !== 'bandit';
  };
  /** Living civilians of the team, and the most it may field: CIV_QUOTA split evenly between the teams present. */
  const civRoom = (team: number) => {
    const teams = new Set([team]);
    for (const q of squads) if (q.team !== MOB_TEAM && q.alive > 0) teams.add(q.team);
    let n = siege.carts({ team }); // M6b: carts are in the civilian quota
    for (const u of civs) if (u.alive && u.squad.team === team) n++;
    return Math.floor(CIV_QUOTA / teams.size) + towns.population(team).cap - n; // M7a: a town's houses feed more
  };
  /** No living foe soldier (civilians aside) within CIV.calmR of (x, y). */
  const safeAt = (team: number, x: number, y: number) => {
    for (const q of squads) {
      if (q.team === team || q.civ || q.alive === 0) continue;
      for (const t of q.units) if (t.alive && (t.x - x) ** 2 + (t.y - y) ** 2 <= CIV.calmR * CIV.calmR) return false;
    }
    return true;
  };
  /** The order a fleeing civilian squad takes up again once it is calm. */
  const resumeOf = (s: Squad): Order | null =>
    s.order === 'civWork' ? { kind: 'civWork', squad: s.id, building: s.work }
    : s.order === 'gather' ? { kind: 'gather', squad: s.id, node: s.node }
    : s.order === 'build' && s.sites.length ? { kind: 'build', squad: s.id, site: s.sites[0] }
    : null;
  /** Run from the foe at (fx, fy): to the nearest own camp, fort, outpost or storehouse it is not at, else straight away. */
  const flee = (s: Squad, fx: number, fy: number) => {
    const resume = s.flee ? s.resume : resumeOf(s);
    let tx = NaN, ty = NaN, bd = Infinity;
    for (let id = 0; ; id++) {
      const b = works.piece(id);
      if (!b) break;
      if (b.team !== s.team || b.cancelled || (b.state !== 'done' && b.state !== 'damaged') || !(b.def.store || b.def.influence > 0) || b.def.wall) continue;
      if ((b.x - fx) ** 2 + (b.y - fy) ** 2 <= CIV.calmR * CIV.calmR) continue; // the foe is there
      const d = (b.x - s.cx) ** 2 + (b.y - s.cy) ** 2;
      if (d < bd) (bd = d), ([tx, ty] = works.ringPoints(id, 1, s.cx, s.cy));
    }
    if (Number.isNaN(tx)) {
      const dx = s.cx - fx, dy = s.cy - fy, l = Math.hypot(dx, dy) || 1;
      tx = Math.max(1, Math.min(grid.w - 1, s.cx + (dx / l) * CIV.away));
      ty = Math.max(1, Math.min(grid.h - 1, s.cy + (dy / l) * CIV.away));
    }
    apply({ kind: 'move', squad: s.id, x: tx, y: ty });
    s.flee = true;
    s.calm = 0;
    s.resume = resume;
  };
  /** Every SCAN ticks: civilian squads with a foe (not another civilian) within CIV.fleeR run; calm again, they go back. */
  const civScan = () => {
    for (const s of squads) {
      if (!s.civ || s.alive === 0) continue;
      let best = Infinity, fx = 0, fy = 0;
      for (const o of s.near) {
        if (o.civ || o.alive === 0) continue;
        for (const t of o.units) {
          if (!t.alive) continue;
          const d2 = (t.x - s.cx) ** 2 + (t.y - s.cy) ** 2;
          if (d2 < best) (best = d2), (fx = t.x), (fy = t.y);
        }
      }
      if (best <= CIV.fleeR * CIV.fleeR) {
        // run, or run on: the refuge it reached has the foe at the door
        if (!s.flee || (s.pi >= s.path.length / 2 && !s.goal)) flee(s, fx, fy);
        s.calm = 0;
      } else if (s.flee && best > CIV.calmR * CIV.calmR && (s.calm += SCAN) >= CIV.calm) {
        // back to work once no foe is at the work place either (else they wait where they are)
        const r = s.resume;
        const at = !r ? null : r.kind === 'civWork' ? works.piece(r.building) : r.kind === 'build' ? works.piece(r.site) : r.kind === 'gather' ? works.resourceNodes()[r.node] : null;
        if (at && !safeAt(s.team, at.x, at.y)) {
          s.calm = 0;
          continue;
        }
        s.flee = false;
        s.resume = null;
        if (r) apply(r);
      }
    }
  };
  /** A cook's or smith's batch at building b, from its network (M6a); false: nothing to work with (he waits). The merchant has no batch (M6: stalls, carts). */
  const civJobDone = (u: Unit, team: number, b: { x: number; y: number }): boolean => {
    if (u.civ === 'cook') {
      if (!works.takeAt(team, b.x, b.y, { food: COOK.food })) return false;
      const salt = works.takeAt(team, b.x, b.y, { salt: COOK.salt });
      rations.set(team, (rations.get(team) ?? 0) + COOK.rations * (salt ? 1 + COOK.saltBonus : 1));
      return true;
    }
    if (u.civ === 'smith') {
      if (works.takeAt(team, b.x, b.y, { copper: SMITH.copper, tin: SMITH.tin })) {
        works.addAt(team, b.x, b.y, 'bronze', SMITH.bronze);
        return true;
      }
      // no ore: mend the most worn item of a man of his team near the forge
      let best: Unit | null = null, bc = 100;
      for (const o of units) {
        if (!o.alive || !o.person || o.squad.team !== team || (o.x - u.x) ** 2 + (o.y - u.y) ** 2 > SMITH.repairR * SMITH.repairR) continue;
        const w = wornest(o.person);
        if (w && w[1].cond < bc) (bc = w[1].cond), (best = o);
      }
      if (!best) return false;
      const p = best.person!, [slot, it] = wornest(p)!;
      best.person = { ...p, hero: { ...p.hero, equip: { ...p.hero.equip, [slot]: { ...it, cond: Math.min(100, it.cond + SMITH.repair) } } } };
      best.repaired = true;
      return true;
    }
    return false;
  };
  /** M5h: a civilian as the crafting queue sees him. */
  const crafter = (u: Unit): Crafter => {
    const h = u.person?.hero, tool = h?.equip.weapon;
    return { id: u.id, prof: u.civ, level: h?.level ?? 1, perks: h?.perks ?? [], tool, work: u.st.work ?? 1, bountiful: toolMods(tool).bountiful, owner: u.squad.owner, name: h?.name ?? 'civilian', ...(u.person ? { pid: u.person.id } : {}) };
  };
  /** M5h: dishes a squad eats, best first (the M5f rations last). */
  const DISH_PREF: Product[] = ['feast', 'fish_stew', 'lentil_soup', 'black_broth', 'kykeon', 'bread', 'salt_pork', 'ration'];
  /** M5h: s eats dish d (one fed record, ./crafting.ts fedOf); `long`: a Head Cook served it. */
  const eat = (s: Squad, d: Product, long: boolean) => {
    const f = fedOf(d, long);
    s.dish = d;
    s.fedInn = f.inn;
    s.fedMelee = f.melee;
    s.fedMissile = f.missile;
    s.fedAcc = f.acc;
    s.fedHeal = f.heal;
    s.fedUntil = tick + f.ticks;
  };
  /**
   * Every CIV.every ticks: civilians at their building work. At a workplace the first `level` of them work its crafting
   * queue (./crafting.ts); the rest, and those at a store, do their M5f batches (healing at a camp, fort or infirmary).
   * Fed squads eat from the dishes and rations; squads near a physician at work take bandages and theriac.
   */
  const civTick = () => {
    const sec = CIV.every * DT;
    const at: Unit[] = [];
    const shops = new Map<number, Unit[]>();
    dresser.clear();
    for (const u of civs) {
      u.civAt = false;
      const s = u.squad;
      if (u.alive && u.civ === 'physician' && heldNodes('physician', u.person?.hero.perks).has('battleDresser')) dresser.add(s.team);
      if (!u.alive || s.flee || s.order !== 'civWork') continue;
      const b = works.piece(s.work);
      if (!b || b.cancelled || b.team !== s.team || b.state === 'destroyed' || works.dist2(s.work, u.x, u.y) > CIV.at * CIV.at) continue;
      if (!b.def.workplace && !AT_BUILDING.includes(u.civ!)) continue;
      if (u.civ === 'physician' && !b.def.workplace && b.type !== 'camp' && b.type !== 'fort') continue;
      u.civAt = true;
      const spot = works.workSpots(b.id).find(([x, y]) => (x - u.x) ** 2 + (y - u.y) ** 2 < SPOT_NEAR * SPOT_NEAR);
      u.facing = spot ? Math.atan2(spot[3] - u.y, spot[2] - u.x) : Math.atan2(b.y - u.y, b.x - u.x); // at a station: facing it
      if (b.def.workplace && (b.state === 'done' || b.state === 'damaged') && crafting.has(b.id)) {
        let l = shops.get(b.id);
        if (!l) shops.set(b.id, (l = []));
        l.push(u);
      } else at.push(u);
    }
    for (const [id, list] of shops) {
      const busy = crafting.work(works.piece(id)!, list.map(crafter), sec, tick);
      for (const u of list) {
        const xp = busy.get(u.id);
        if (xp === undefined) at.push(u);
        else u.obj += xp;
      }
    }
    for (const u of at) {
      const s = u.squad, b = works.piece(s.work)!;
      if (!AT_BUILDING.includes(u.civ!)) continue;
      const w = u.st.work ?? 1;
      if (u.civ === 'physician') {
        if (b.type !== 'camp' && b.type !== 'fort' && b.def.workplace?.kind !== 'infirmary') continue;
        // the hurt of his team near him heal (fed men faster); every PATIENT_HP healed is a job
        for (const o of units) {
          if (!o.alive || o.hp >= o.maxHp || o.squad.team !== s.team || works.dist2(s.work, o.x, o.y) > PHYSICIAN.r * PHYSICIAN.r || (anySafe && inSafe(o.x, o.y))) continue; // M6d: no healing in a safe zone
          const add = Math.min(o.maxHp - o.hp, o.maxHp * PHYSICIAN.heal * sec * w * (o.squad.fedUntil > tick ? o.squad.fedHeal : 1) * (towns.blessed(o.squad.id) ? BLESS.heal : 1));
          o.hp += add;
          u.civT += add;
        }
        if (u.civT >= PATIENT_HP) (u.civT -= PATIENT_HP), (u.obj += CIV_XP);
        continue;
      }
      u.civT += sec * w;
      const batch = BATCH[u.civ!]!;
      if (u.civT < batch) continue;
      if (civJobDone(u, s.team, b)) (u.civT -= batch), (u.obj += CIV_XP);
      else u.civT = batch;
    }
    if (!civs.some((c) => c.civAt && (c.civ === 'cook' || c.civ === 'physician'))) return;
    for (const s of squads) {
      if (s.civ || s.alive === 0 || s.team === MOB_TEAM) continue;
      let cook: Unit | null = null, doc = false;
      for (const c of civs) {
        if (!c.civAt || c.squad.team !== s.team || (c.x - s.cx) ** 2 + (c.y - s.cy) ** 2 > COOK.feedR * COOK.feedR) continue;
        if (c.civ === 'cook') cook = c;
        else if (c.civ === 'physician') doc = true;
      }
      if (doc) {
        // M5h: bandages up to SQUAD_MAX, theriac when it has run out
        const need = Math.min(SQUAD_MAX, s.alive) - s.bandages, have = Math.floor(crafting.supply(s.team).bandage ?? 0), n = Math.min(need, have);
        if (n > 0 && crafting.use(s.team, 'bandage', n)) s.bandages += n;
        if (s.theriacUntil <= tick && crafting.use(s.team, 'theriac', 1)) s.theriacUntil = tick + REMEDY.theriac;
      }
      if (!cook || s.fedUntil > tick) continue;
      // squads near a cook at work eat a dish (or a ration) a man, if the team has it for all
      const long = heldNodes('cook', cook.person?.hero.perks).has('headCook');
      const dish = DISH_PREF.find((d) => crafting.use(s.team, d, s.alive));
      if (dish) eat(s, dish, long);
      else if ((rations.get(s.team) ?? 0) >= s.alive) {
        rations.set(s.team, rations.get(s.team)! - s.alive);
        eat(s, 'ration', long);
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
    if (civs.length && tick % SCAN === 0) civScan();
    if (civs.length && tick % CIV.every === 0) civTick();
    mobs.tick(tick);
    towns.tick(tick);
    for (const s of squads) {
      if (s.alive === 0) continue;
      if (s.order === 'attack') (grid.team = s.team), updateAttack(s);
      else if (s.order === 'attackMove') (grid.team = s.team), updateAttackMove(s);
      else if (s.order === 'escort') (grid.team = s.team), escortTick(s);
    }
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
        const step = Math.min(d, (SPEED * u.st.speed * (u.squad.flee ? CIV.fleeSpeed : 1) * (u.squad.laden ? PORTER.slow : 1) * CATCH_UP * DT) / cost);
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
    tradeTick();
    if (tick % SCAN === 0) piles.tick(tick);
    if (anySafe && tick % SCAN === 0) safeTick();
    if (tick % HOLD.every === 0) raidScan();
    keepToLanes();
    for (const u of units) {
      if (!u.alive) continue;
      const mx = u.x - u.ox;
      const my = u.y - u.oy;
      u.moving = mx * mx + my * my > 1e-4;
      if (u.want >= 0 && !(u.civAt && !u.moving)) u.facing = u.moving && u.want > ARRIVE ? Math.atan2(my, mx) : u.squad.facing; // a civilian at work keeps facing his station
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
    if (tick % STAKES_EVERY === 0) stakes();
    land();
    siege.tick(tick);

    for (const s of reslotQueue) reslot(s);
    reslotQueue.clear();
    if (shots.length) shots = shots.filter((sh) => sh.t1 > tick);
    vision.tick(tick);
    tick++;
    stepMs = performance.now() - t0;
  };

  /** Everything a step reads that is not rebuilt each tick (head / next, files, platLoad are per-tick scratch). */
  const saveRoot = () => ({
    grid, rng, squads, units, queue, pathQueue, unitPathQueue, missiles, shots, reslotQueue, tick, loot, log, civs, rations, dresser,
    crafting: crafting.saveRoot(), works: works.saveRoot(), siege: siege.saveRoot(), mobs: mobs.saveRoot(), vision: vision.saveRoot(), piles: piles.saveRoot(),
    towns: towns.saveRoot(),
  });

  const api: WarBuildSim = {
    region,
    exportState(): SimState {
      let base = fresh.get(region);
      if (!base) fresh.set(region, (base = roots.get(createSim(region, seed))!()));
      return { v: STATE_VERSION, region: region.id, seed, ...encodeGraph(saveRoot(), constsOf(region), base) };
    },
    importState(st: SimState) {
      if (st.v !== STATE_VERSION || st.region !== region.id) throw new Error(`sim state v${st.v} of ${st.region} does not fit v${STATE_VERSION} of ${region.id}`);
      if (tick !== 0 || units.length) throw new Error('importState: only into a fresh sim');
      const keyed = new Map([...constsOf(region)].map(([o, k]) => [k, o]));
      const r = decodeGraph(st, keyed, saveRoot()) as ReturnType<typeof saveRoot>;
      if (r.grid !== grid || r.squads !== squads || r.units !== units || r.rng !== rng) throw new Error('importState: live state not bound');
      ({ missiles, shots, tick, loot, log } = r);
      piles.loadRoot(r.piles);
      works.loadRoot(r.works);
      siege.loadRoot(r.siege);
      mobs.loadRoot(r.mobs);
      vision.loadRoot(r.vision);
      crafting.loadRoot(r.crafting);
      towns.loadRoot(r.towns);
    },
    dropPersons(ids) {
      // a resumed region whose save predates a fight write-back: men D1 has already sent home leave without a report
      const gone = new Set(ids);
      for (const u of units) {
        if (!u.alive || !u.person || !gone.has(u.person.id)) continue;
        u.alive = false;
        u.hp = 0;
        u.reported = true;
        u.squad.alive--;
        u.tgt = null;
        if (u.job) works.setJob(u, null);
        reslotQueue.add(u.squad);
      }
      for (const s of reslotQueue) if (s.alive > 0) reslot(s);
      reslotQueue.clear();
    },
    reportPersons(ids) {
      // M4: these living men leave mid-fight (a transfer): their fight so far, reported now, tallies cleared
      const of = new Set(ids), sel = units.filter((u) => u.alive && u.person && of.has(u.person.id));
      const out = resultsOf(sel);
      for (const u of sel) (u.dealt = u.kills = u.obj = 0), (u.engaged = u.repaired = false);
      for (const s of reslotQueue) reslot(s);
      reslotQueue.clear();
      return out;
    },
    hurtPersons(lost) {
      // M4: men arriving from another region come in with the hit points they left with
      for (const u of units) {
        const n = u.alive && u.person ? lost[u.person.id] : undefined;
        if (n !== undefined && n > 0) u.hp = Math.max(1, Math.min(u.hp, u.maxHp - n));
      }
    },
    spawnSquad(owner, team, cls, count, x, y, persons) {
      // M5b: one man per person, each with his own baked stats
      let ps = persons?.slice(0, SQUAD_MAX) ?? null;
      count = ps ? ps.length : Math.min(count, SQUAD_MAX);
      // M5f: civilians only within the team's share of the civilian quota (-1: no room, no squad)
      if (ps ? ps.some((p) => isCivClass(p.hero.cls)) : isCivClass(cls)) {
        let room = civRoom(team);
        if (ps) ps = ps.filter((p) => !isCivClass(p.hero.cls) || room-- > 0);
        else count = Math.min(count, Math.max(0, room));
        if (ps) count = ps.length;
        if (count === 0) return -1;
      }
      const [ax, ay] = openPoint(x, y);
      const sts = ps ? ps.map((p) => warStatsOf(p)) : null;
      const st = sts?.[0] ?? warStats(cls);
      const s: Squad = {
        id: squads.length, owner, team, units: [], alive: count, shape: 'line', offsets: formationOffsets('line', count, rng),
        ax, ay, cx: ax, cy: ay, facing: 0, speed: st.speed, ranged: st.range > 0, path: [], pi: 0, order: 'hold', target: -1,
        repathAt: 0, goal: null, near: [], sites: [], node: -1, fixed: null, col: null, siege: -1, task: null, fire: false, claimPt: -1, pair: -1,
        act: null, actWil: 5, actReady: 0, actUntil: -1, out: 1, inn: 1, amx: ax, amy: ay,
        civ: ps ? ps.every((p) => isCivClass(p.hero.cls)) : isCivClass(cls), flee: false, calm: 0, resume: null, work: -1, fedUntil: -1,
        fedInn: 1, fedMelee: 0, fedMissile: 0, fedAcc: 0, fedHeal: 1, dish: null, bandages: 0, theriacUntil: -1,
        xfer: null, escort: -1, laden: false, salv: null,
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
          dealt: 0, kills: 0, obj: 0, engaged: false, reported: false, civ: civJob(ps?.[k].hero.cls ?? cls), civT: 0, civAt: false, repaired: false, venomUntil: -1, venom: false, beast: false, fieldR: 0,
          pack: null, tag: 0, safeT: 0,
        };
        setRates(u);
        if (u.civ) civs.push(u);
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
            ...(u.alive && u.civAt && CLIP[u.civ!] ? { work: CLIP[u.civ!] } : {}),
            ...(u.alive && u.squad.flee ? { flee: true as const } : {}),
            ...(u.alive && u.load > 0 ? { carry: u.carry!, load: u.load } : {}),
            ...(u.alive && u.pack && loads(u.pack) > 1e-9 ? { pack: loads(u.pack) } : {}),
            ...(u.alive && u.tag > tick ? { tag: u.tag - tick } : {}),
            ...(atk ? { ready: Math.max(0, u.cd - 1), ...(u.swingAt >= 0 ? { swing: tick - 1 - u.swingAt } : {}) } : {}),
          };
        }),
        squads: squads.map((s) => {
          const snap: SquadSnap = { id: s.id, owner: s.owner, team: s.team, units: s.units.map((u) => u.id), order: s.order };
          if (s.act) snap.active = { skill: s.act, ready: Math.max(0, s.actReady - tick), on: Math.max(0, s.actUntil - tick) };
          if (s.civ) snap.civ = true;
          if (s.flee) snap.flee = true;
          if (s.fedUntil > tick) {
            snap.fed = true;
            if (s.dish) snap.dish = s.dish;
          }
          if (s.bandages > 0) snap.bandages = s.bandages;
          if (s.theriacUntil > tick) snap.theriac = true;
          if (towns.blessed(s.id)) snap.blessed = true;
          const st = s.units[0]?.st;
          if (st && st.range > 0 && st.missile === 'arrow') {
            const why = fireBlock(s);
            snap.fireArrows = { on: s.fire, available: !why, ...(why ? { reason: why } : {}) };
          }
          return snap;
        }),
        shots: [...shots, ...siege.shots()].map((sh) => ({ ...sh })),
        buildings: works.buildingSnaps().map((b) => {
          const q = b.type in BUILDINGS && BUILDINGS[b.type].workplace ? crafting.snaps(b.id) : undefined;
          return q ? { ...b, queue: q } : b;
        }),
        stock: works.stockSnap(),
        influenceVersion: works.influence().version,
        sieges: siege.snaps(tick),
        ...(region.lairs?.length || region.claimPoints?.length ? { lairs: mobs.lairSnaps(), claims: mobs.claimSnaps() } : {}),
        ...(region.prebuilt?.length ? { towns: towns.towns() } : {}),
        ...(rations.size ? { rations: Object.fromEntries(rations) } : {}),
        ...(crafting.supplies.size ? { supplies: crafting.suppliesSnap() } : {}),
        ...(piles.piles.length ? { piles: piles.piles.map((p) => ({ id: p.id, x: p.x, y: p.y, goods: totals(p.hold), items: p.hold.items.length, ...(p.hold.items.length ? { list: itemList(p.hold) } : {}), loads: loads(p.hold), left: p.until - tick, ...(p.salv > 0 ? { salvage: p.salv / PILE.salvage } : {}) })) } : {}),
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
    spawnCart: (team, owner, type, x, y) => siege.cart(team, owner, type, x, y),
    spawnMobs: () => mobs.spawn(),
    towns: () => towns.towns(),
    population: (team) => towns.population(team),
    prestige: (team) => towns.prestige(team),
    upkeepAt: (team, x, y) => towns.upkeepAt(team, x, y),
    setBoss: (id) => mobs.setBoss(id),
    bossDown: () => mobs.bossDown(),
    visibleTo: vision.visibleTo,
    teamGrid: vision.teamGrid,
    lastSeen: vision.lastSeen,
    endFight,
    salvage(id) {
      const p = piles.get(id);
      if (!p || !p.hold.items.length) return 0;
      const v = p.hold.items.reduce((a, it) => a + salvageValue(it), 0);
      p.hold.items = [];
      return v;
    },
    // M6e-M6i (server bridges): live holds the server moves goods in and out of (stalls, hand-offs, transits)
    cargo(ref) {
      if (ref.reserve !== undefined) return { slots: [{ hold: works.reserveOf(ref.reserve), cap: Infinity, x: -1, y: -1 }], team: ref.reserve, owner: '' };
      if (ref.building !== undefined) {
        const b = works.piece(ref.building), hd = works.holdOf(ref.building);
        return b && hd ? { slots: [{ hold: hd, cap: b.def.chest ?? Infinity, x: b.x, y: b.y }], team: b.team, owner: b.owner } : null;
      }
      if (ref.cart !== undefined) {
        const e = siege.get(ref.cart);
        return e && e.hold && e.state !== 'destroyed' ? { slots: [{ hold: e.hold, cap: siege.cartCap(e.id), x: e.x, y: e.y }], team: e.team, owner: e.owner } : null;
      }
      const want = ref.persons ? new Set(ref.persons) : null;
      const men = units.filter((u) => u.alive && (want ? !!u.person && want.has(u.person.id) : u.squad.id === ref.squad));
      if (!men.length) return null;
      return { slots: men.map((u) => ({ hold: (u.pack ??= newHold()), cap: PORTER.loads, x: u.x, y: u.y })), team: men[0].squad.team, owner: men[0].squad.owner };
    },
    stowCart: (id) => siege.stow(id),
    setCartOwner: (id, team, owner) => siege.setOwner(id, team, owner),
    dropPile(x, y, lots, items) {
      return piles.drop(x, y, lots, items, tick)?.id ?? -1;
    },
    drawAt: (team, x, y, cost) => works.takeAt(team, x, y, cost),
    goodsAt: (team, x, y) => works.haveAt(team, x, y),
    walkOut(owner) {
      for (const s of squads) if (s.owner === owner && s.alive > 0 && s.units.some((u) => u.alive && inSafe(u.x, u.y))) walkSquadOut(s);
    },
    events() {
      const out = log;
      log = [];
      return out;
    },
    setPerson(p) {
      const u = units.find((x) => x.alive && x.person?.id === p.id);
      if (!u) return false;
      u.person = p;
      rebake(u);
      for (const s of reslotQueue) reslot(s);
      reslotQueue.clear();
      return true;
    },
  };
  roots.set(api, saveRoot);
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
