/**
 * Siege engines of the war sim (M2c, docs/impl/global-war-rebuild.md W-29): rams, stone throwers and siege ladders.
 * An engine is built by a squad at a spot (cost paid up front, labour like a site), then crewed by a squad: it moves or
 * works only while SIEGE.crew of its crew stand beside it (index.ts keeps them at crewPoints and counts them). Engines do
 * not block tiles; they path like a man of their team over the ground.
 *
 *  - ram: rolls up to a building and batters it every RAM.ticks (stone takes RAM.stone of the blow). Its roof covers the
 *    crew from missiles (index.ts: RAM.cover).
 *  - stoneThrower: closes to within THROWER.range (no nearer than THROWER.min) of its target, deploys (stationary), shoots a
 *    boulder every THROWER.reload: a hit damages the building; where it lands, men within THROWER.splash take a blow.
 *  - siegeLadder: carried (slow) to the outer foot of a foe walkway wall or tower and raised (works.raiseLadder): a ladder
 *    building of the crew's team stands there until defenders push it off; the engine then lies at the foot, damaged.
 *
 * Any engine burns (wood): torches set it alight, it loses up to maxHp / ENGINE_FIRE_LIFE per second at full fire.
 *
 * M5h3 engineer designs (docs/WAR.md "Crafting and professions"; cost and labour from their recipes): a team builds one
 * only with a living engineer holding its node (hooks.nodes).
 *  - mantlet: movable cover; its team's men within MANTLET.r behind it dodge MANTLET.cover of missiles shot from in front.
 *  - coveredRam: a ram under hides: more hp, its crew dodge COVERED.cover of missiles, it catches and burns at half pace.
 *  - oxybeles: crewed and standing (no order), it shoots a bolt every OXY.reload at the nearest foe man in sight within
 *    OXY.range; the bolt flies on a little past him and hits up to OXY.pierce men along its line.
 *  - siegeTower: carried like a ladder (slow, crew 8) to the outer foot of a foe walkway and docked (TOWER.dock ticks): a
 *    towerBridge building joins the ground to the deck (no climb, cap 8, not pushed off); it stands while the tower
 *    does (burnt or broken, the bridge goes with it).
 * Nodes: Artillerist: a stone thrower needs one crew less; Sapper: engine damage x NODE.sapper; Archimedes: a stone
 * thrower or oxybeles may be built on the team's stone tower platform, and shoots from there at range x NODE.archimedes.
 */
import type { ResourceKind, ShotSnap, SiegeSnap, SiegeState, SiegeType } from '../types';
import { FIRE, type Works } from './works';
import type { Rng } from '../../sim/rng';
import { RECIPES } from '../../data/recipes';
import { itemList, loads, newHold, totals, type Hold } from './holders';
import { CART, CART_LOADS, PACK_MULES } from './trade';

const DT = 0.1;

export interface SiegeDef { hp: number; cost: Partial<Record<ResourceKind, number>>; labour: number; crew: number; speed: number;
  /** M5h3: the engineer node a team needs to build it. */
  node?: string }
/** M5h3: an engineer design's cost, labour (worker-seconds = recipe secs) and node from its recipe. */
const design = (id: string) => ({ cost: RECIPES[id].inputs as Partial<Record<ResourceKind, number>>, labour: RECIPES[id].secs, node: RECIPES[id].node });
export const SIEGE: Record<SiegeType, SiegeDef> = {
  ram: { hp: 900, cost: { wood: 80 }, labour: 240, crew: 6, speed: 0.45 },
  stoneThrower: { hp: 500, cost: { wood: 100, stone: 30 }, labour: 480, crew: 4, speed: 0.3 },
  siegeLadder: { hp: 150, cost: { wood: 20 }, labour: 60, crew: 4, speed: 0.9 },
  mantlet: { hp: 300, ...design('mantlet'), crew: 2, speed: 0.7 },
  coveredRam: { hp: 1400, ...design('covered_ram'), crew: 6, speed: 0.4 },
  oxybeles: { hp: 350, ...design('oxybeles'), crew: 2, speed: 0.5 },
  siegeTower: { hp: 2400, ...design('siege_tower'), crew: 8, speed: 0.2 },
  // M6b carts (docs/WAR.md "Carts": x0.8 and x0.6 a man's 1.5 tiles/s): made at a workshop (recipes handcart, wagon)
  handcart: { hp: 200, ...design('handcart'), crew: 2, speed: 1.2 },
  wagon: { hp: 450, ...design('wagon'), crew: 1, speed: 0.9 },
};
/** M6b: a cart's armour (a blow on it as on a man of this armour). */
export const CART_ARMOR: Partial<Record<SiegeType, number>> = { handcart: 2, wagon: 6 };
export const isCartType = (t: SiegeType) => t === 'handcart' || t === 'wagon';
export const RAM = { reach: 1.5, ticks: 30, dmg: 160, stone: 0.4, cover: 0.5 };
export const THROWER = { min: 8, range: 36, reload: 120, deploy: 100, dmg: 220, speed: 10, acc: 0.65, scatter: 2.5, splash: 1.5, splashDmg: 40 };
export const LADDER = { raise: 30, pushed: 0.25, fall: 0.6 }; // raise ticks; hp share the engine loses when pushed; climbers' fall (share of maxHp)
/** M5h3 designs and engineer nodes. */
export const MANTLET = { cover: 0.6, r: 3.5, side: 1.3 }; // dodge share; reach behind it and to each side
export const COVERED = { cover: 0.7, fire: 0.5 }; // crew dodge share; kindle, fire-arrow and burn pace
export const OXY = { range: 30, min: 2, reload: 60, dmg: 70, ap: 0.7, pierce: 3, width: 0.6, speed: 30, past: 4 };
export const TOWER = { dock: 60 };
export const NODE = { sapper: 1.3, archimedes: 1.2 };
const ENGINE_FIRE_LIFE = 90;
const CREW_R = 2.5; // crew this near the engine count as beside it
const ARRIVE = 0.3;

type Mode = 'none' | 'move' | 'attack' | 'raise' | 'deploy' | 'pack';

interface Engine {
  id: number; type: SiegeType; def: SiegeDef; team: number; x: number; y: number; facing: number; hp: number; maxHp: number;
  state: SiegeState; labour: number; crew: number; mode: Mode; goal: [number, number] | null; path: number[]; pi: number;
  target: number; wall: [number, number] | null; ladder: number; cd: number; swingAt: number; prog: number; burn: number; kindle: number;
  /** M5h3: built on its team's stone tower platform. */
  tower: boolean;
  /** M6b carts: the owning player, cargo, halted (a foe near) until this tick, capture progress (ticks) by team capT / owner capO. */
  owner: string; hold: Hold | null; halt: number; cap: number; capT: number; capO: string;
}

interface Boulder { at: number; x: number; y: number; target: number; hit: boolean; dmg: number }
interface Bolt { at: number; team: number; x0: number; y0: number; x1: number; y1: number; dmg: number }

export interface SiegeHooks {
  path(team: number, x0: number, y0: number, x1: number, y1: number): number[];
  /** Crew men of squad `crew` within r of (x,y). */
  crewNear(crew: number, x: number, y: number, r: number): number;
  /** Men within r of (x,y) take a blow of dmg (armour pierce ap). */
  splash(x: number, y: number, r: number, dmg: number, ap: number): void;
  open(x: number, y: number): boolean;
  /** Move cost of the tile at (x,y) (1 grass). */
  cost(x: number, y: number): number;
  /** M5h3: engineer nodes held by the team's living engineers. */
  nodes(team: number): ReadonlySet<string>;
  /** The nearest foe man of `team` in its sight within r of (x,y), or null. */
  foe(team: number, x: number, y: number, r: number): [number, number] | null;
  /** A bolt of `team` from (x0,y0) to (x1,y1): up to n foe men within w of the line, nearest first, take dmg (pierce ap). */
  pierce(team: number, x0: number, y0: number, x1: number, y1: number, w: number, dmg: number, ap: number, n: number): void;
  /** (x,y) is on a stone tower platform of `team`. */
  stoneTower(team: number, x: number, y: number): boolean;
  /** M6b: a cart's path (ground rules: grid.cart) and its pace multiplier stepping from (x,y) along (dx,dy) (0: closed). */
  cartPath?(team: number, x0: number, y0: number, x1: number, y1: number): number[];
  cartCost?(x: number, y: number, dx: number, dy: number): number;
  /** M6b: a living foe of `team` (not fauna) within r of (x,y). */
  foeNear?(team: number, x: number, y: number, r: number): boolean;
  /** M6b: who would take cart e now: the team and owner of a foe unit beside it with none of e's team within guard; null none. */
  taker?(e: Readonly<Engine>): [number, string] | null;
  /** M6b: cart e changed hands; e wrecked or burnt (its cargo to a pile). */
  captured?(e: Readonly<Engine>, by: string): void;
  wreck?(e: Readonly<Engine>, burnt: boolean): void;
  /** M6b: the crew of e holds this merchant node (Pack Mules). */
  crewNode?(crew: number, node: string): boolean;
}

export function createSiege(works: Works, rng: Rng, hooks: SiegeHooks) {
  const engines: Engine[] = [];
  const boulders: Boulder[] = [];
  const bolts: Bolt[] = [];
  let shots: ShotSnap[] = [];
  let pathsLeft = 0;
  let mantlets = 0; // M5h3: mantlets built (cover() skips the scan without one)

  const alive = (e: Engine | undefined): e is Engine => !!e && e.state !== 'destroyed';
  const cart = (e: Engine) => e.hold !== null;
  let tickNow = 0;
  /** M6b: loads a cart holds (a wagon whose crew holds Pack Mules: PACK_MULES). */
  const cartCap = (e: Engine) => (e.type === 'wagon' && e.crew >= 0 && hooks.crewNode?.(e.crew, 'packMules') ? PACK_MULES : CART_LOADS[e.type as 'handcart' | 'wagon'] ?? 0);
  const built = (e: Engine | undefined): e is Engine => alive(e) && e.state !== 'building';
  const crewHere = (e: Engine) => (e.crew >= 0 ? hooks.crewNear(e.crew, e.x, e.y, e.type === 'wagon' ? CART.driver : CREW_R) : 0);
  const has = (team: number, node: string) => hooks.nodes(team).has(node);
  /** Crew it needs (Artillerist: a stone thrower one less). */
  const need = (e: Engine) => e.def.crew - (e.type === 'stoneThrower' && has(e.team, 'artillerist') ? 1 : 0);
  const dmgK = (e: Engine) => (has(e.team, 'sapper') ? NODE.sapper : 1);
  const rangeK = (e: Engine) => (e.tower && has(e.team, 'archimedes') ? NODE.archimedes : 1);
  const isRam = (e: Engine) => e.type === 'ram' || e.type === 'coveredRam';
  const fireK = (e: Engine) => (e.type === 'coveredRam' ? COVERED.fire : 1);
  const targetOk = (e: Engine) => {
    const b = works.piece(e.target);
    return !!b && b.state !== 'destroyed' && !b.cancelled && b.state !== 'foundation';
  };

  const damage = (e: Engine, dmg: number) => {
    if (!alive(e)) return;
    e.hp -= dmg;
    if (e.hp > 0) return;
    e.hp = 0;
    e.state = 'destroyed';
    const burnt = e.burn > 0;
    e.burn = 0;
    e.mode = 'none';
    if (e.hold) {
      hooks.wreck?.(e, burnt); // M6c: its cargo to a pile
      e.hold = newHold();
    }
    if (e.type === 'siegeTower' && e.ladder >= 0) works.damage(e.ladder, Infinity); // its bridge goes with it
  };

  const goTo = (e: Engine, x: number, y: number) => {
    if (e.goal && Math.abs(e.goal[0] - x) < 0.5 && Math.abs(e.goal[1] - y) < 0.5) return;
    e.goal = [x, y];
    e.path = [];
    e.pi = 0;
  };

  /** Roll along the path at the crew's pace; true once at the goal. */
  const roll = (e: Engine, n: number): boolean => {
    if (!e.goal) return true;
    if (Math.hypot(e.goal[0] - e.x, e.goal[1] - e.y) < ARRIVE) return true;
    if (!e.path.length) {
      if (pathsLeft <= 0) return false;
      pathsLeft--;
      e.path = cart(e) && hooks.cartPath ? hooks.cartPath(e.team, e.x, e.y, e.goal[0], e.goal[1]) : hooks.path(e.team, e.x, e.y, e.goal[0], e.goal[1]);
      e.pi = 1;
    }
    // M6b: a handcart with one puller goes at half pace; a halted cart waits
    const lone = e.type === 'handcart' && n === 1;
    if (n < need(e) && !lone) return false;
    if (e.state === 'deployed' || (cart(e) && e.halt > tickNow)) return false;
    let budget = e.def.speed * DT * (lone ? 0.5 : 1);
    while (budget > 0 && e.pi < e.path.length / 2) {
      const tx = e.path[e.pi * 2], ty = e.path[e.pi * 2 + 1];
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) e.facing = Math.atan2(dy, dx);
      const k = cart(e) && hooks.cartCost ? hooks.cartCost(e.x, e.y, dx / (d || 1), dy / (d || 1)) : 0;
      if (cart(e) && k <= 0) break; // the ground ahead is closed to carts
      const step = budget / (cart(e) ? k : Math.max(0.5, hooks.cost(e.x + (dx / (d || 1)) * 0.5, e.y + (dy / (d || 1)) * 0.5)));
      if (step >= d) {
        e.x = tx;
        e.y = ty;
        e.pi++;
        budget -= d;
      } else {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
        budget = 0;
      }
    }
    e.state = 'move';
    if (e.pi >= e.path.length / 2) {
      e.goal = null; // as near as it gets
      return true;
    }
    return false;
  };

  const settle = (e: Engine) => {
    if (e.state === 'move' || e.state === 'attack') e.state = e.type === 'stoneThrower' && e.prog >= 1 ? 'deployed' : 'idle';
  };

  const ram = (e: Engine, n: number, tick: number) => {
    if (e.cd > 0) e.cd--;
    if (works.dist2(e.target, e.x, e.y) > RAM.reach * RAM.reach) {
      if (!e.goal) {
        const [px, py] = works.ringPoints(e.target, 1, e.x, e.y);
        if (px === undefined) return void (e.mode = 'none');
        goTo(e, px, py);
      }
      if (roll(e, n) && works.dist2(e.target, e.x, e.y) > RAM.reach * RAM.reach) e.mode = 'none'; // cannot get there
      return;
    }
    const [tx, ty] = works.nearestTile(e.target, e.x, e.y);
    e.facing = Math.atan2(ty - e.y, tx - e.x);
    e.goal = null;
    if (n < need(e)) return void settle(e);
    e.state = 'attack';
    if (e.cd > 0) return;
    e.cd = RAM.ticks;
    e.swingAt = tick;
    works.damage(e.target, RAM.dmg * dmgK(e) * (works.piece(e.target)!.def.material === 'stone' ? RAM.stone : 1), e.team);
  };

  const thrower = (e: Engine, n: number, tick: number) => {
    if (e.cd > 0) e.cd--;
    const [tx, ty] = works.nearestTile(e.target, e.x, e.y);
    const d = Math.hypot(tx - e.x, ty - e.y), range = THROWER.range * rangeK(e);
    if (d > range || d < THROWER.min) {
      if (e.tower) return void (e.mode = 'none'); // on a tower: it shoots from there or not at all
      if (e.state === 'deployed' || e.state === 'packing') return pack(e, n);
      const k = (range * 0.8) / (d || 1);
      if (!e.goal) goTo(e, tx + (e.x - tx) * k, ty + (e.y - ty) * k);
      if (roll(e, n)) {
        const d2 = Math.hypot(tx - e.x, ty - e.y);
        if (d2 > range || d2 < THROWER.min) e.mode = 'none';
      }
      return;
    }
    e.goal = null;
    if (e.state !== 'deployed') return deploy(e, n);
    e.facing = Math.atan2(ty - e.y, tx - e.x);
    if (n < need(e) || e.cd > 0) return;
    e.cd = THROWER.reload;
    e.swingAt = tick;
    const hit = rng.chance(THROWER.acc * (1 - 0.4 * (d / range)));
    let lx = tx, ly = ty;
    if (!hit) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(1, THROWER.scatter);
      (lx += Math.cos(a) * r), (ly += Math.sin(a) * r);
    }
    const at = tick + Math.max(1, Math.round(d / THROWER.speed / DT));
    boulders.push({ at, x: lx, y: ly, target: e.target, hit, dmg: THROWER.dmg * dmgK(e) });
    shots.push({ x0: e.x, y0: e.y, x1: lx, y1: ly, t0: tick, t1: at, z0: 0, z1: 0, by: -1 - e.id, kind: 'stone', siege: e.id });
  };

  const deploy = (e: Engine, n: number) => {
    if (e.state === 'deployed') return;
    e.state = 'deploying';
    if (n >= need(e)) e.prog = Math.min(1, e.prog + 1 / THROWER.deploy);
    if (e.prog >= 1) e.state = 'deployed';
  };
  /** Packs up; true once packed (idle). */
  const pack = (e: Engine, n: number): void => {
    if (e.state !== 'deployed' && e.state !== 'packing') return;
    e.state = 'packing';
    if (n >= need(e)) e.prog = Math.max(0, e.prog - 1 / THROWER.deploy);
    if (e.prog <= 0) e.state = 'idle';
  };

  const ladder = (e: Engine, n: number) => {
    const [wx, wy] = e.wall!;
    const foot = works.ladderFoot(e.team, wx, wy);
    if (foot < 0) return void (e.mode = 'none');
    const W = works.influence().w;
    const fx = (foot % W) + 0.5, fy = Math.floor(foot / W) + 0.5;
    goTo(e, fx, fy);
    if (!roll(e, n)) return;
    if (Math.hypot(fx - e.x, fy - e.y) > 0.8) return void (e.mode = 'none');
    e.facing = Math.atan2(wy + 0.5 - e.y, wx + 0.5 - e.x);
    e.state = 'raising';
    if (n < need(e)) return;
    const tower = e.type === 'siegeTower';
    e.prog = Math.min(1, e.prog + 1 / (tower ? TOWER.dock : LADDER.raise));
    if (e.prog < 1) return;
    const id = works.raiseLadder(e.team, wx, wy, e.id, tower ? 'towerBridge' : 'ladder');
    if (id < 0) return void ((e.mode = 'none'), (e.state = 'idle'), (e.prog = 0));
    e.ladder = id;
    e.target = works.piece(id)!.attach;
    e.state = 'raised';
    e.mode = 'none';
    e.x = fx;
    e.y = fy;
    e.crew = -1; // the crew is free to climb
  };

  /** M5h3 oxybeles: standing and crewed, a bolt at the nearest foe man in sight in range. */
  const bolt = (e: Engine, n: number, tick: number) => {
    if (e.cd > 0) e.cd--;
    if (n < need(e) || e.cd > 0) return;
    const range = OXY.range * rangeK(e);
    const f = hooks.foe(e.team, e.x, e.y, range);
    if (!f) return;
    const dx = f[0] - e.x, dy = f[1] - e.y, d = Math.hypot(dx, dy);
    if (d < OXY.min) return;
    const reach = Math.min(range, d + OXY.past);
    const x1 = e.x + (dx / d) * reach, y1 = e.y + (dy / d) * reach;
    e.facing = Math.atan2(dy, dx);
    e.cd = OXY.reload;
    e.swingAt = tick;
    const at = tick + Math.max(1, Math.round(d / OXY.speed / DT));
    bolts.push({ at, team: e.team, x0: e.x, y0: e.y, x1, y1, dmg: OXY.dmg * dmgK(e) });
    shots.push({ x0: e.x, y0: e.y, x1, y1, t0: tick, t1: at, z0: 0, z1: 0, by: -1 - e.id, kind: 'bolt', siege: e.id });
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ engines, boulders, bolts, shots, pathsLeft }),
    loadRoot: (o: { shots: ShotSnap[]; pathsLeft: number }) => {
      shots = o.shots;
      pathsLeft = o.pathsLeft;
      mantlets = engines.filter((e) => e.type === 'mantlet').length;
    },
    /** A new engine of `team` at (x,y), its cost paid; its id, or -1 (no stock, no ground). */
    build(team: number, type: SiegeType, x: number, y: number): number {
      const def = SIEGE[type];
      if (def.node && !has(team, def.node)) return -1; // M5h3: no engineer with the design
      const tower = (type === 'oxybeles' || type === 'stoneThrower') && has(team, 'archimedes') && hooks.stoneTower(team, x, y);
      if ((!tower && !hooks.open(x, y)) || !works.takeAt(team, x, y, def.cost)) return -1;
      engines.push({
        id: engines.length, type, def, team, x, y, facing: 0, hp: def.hp * 0.1, maxHp: def.hp, state: 'building', labour: 0, crew: -1,
        mode: 'none', goal: null, path: [], pi: 0, target: -1, wall: null, ladder: -1, cd: 0, swingAt: -1, prog: 0, burn: 0, kindle: 0, tower,
        owner: '', hold: null, halt: 0, cap: 0, capT: -1, capO: '',
      });
      if (type === 'mantlet') mantlets++;
      return engines.length - 1;
    },
    /** M6b: a finished cart of `owner` (team `team`) at (x,y), empty and idle; its id. */
    cart(team: number, owner: string, type: SiegeType, x: number, y: number): number {
      const def = SIEGE[type];
      engines.push({
        id: engines.length, type, def, team, x, y, facing: 0, hp: def.hp, maxHp: def.hp, state: 'idle', labour: def.labour, crew: -1,
        mode: 'none', goal: null, path: [], pi: 0, target: -1, wall: null, ladder: -1, cd: 0, swingAt: -1, prog: 0, burn: 0, kindle: 0, tower: false,
        owner, hold: newHold(), halt: 0, cap: 0, capT: -1, capO: '',
      });
      return engines.length - 1;
    },
    /** M6b: living carts (of `owner`, or of team `team`). */
    carts: (o: { owner?: string; team?: number }) => engines.filter((e) => cart(e) && alive(e) && (o.owner === undefined || e.owner === o.owner) && (o.team === undefined || e.team === o.team)).length,
    isCart: (id: number) => !!engines[id] && cart(engines[id]),
    cartCap: (id: number) => (engines[id] ? cartCap(engines[id]) : 0),
    /** dt worker-seconds of labour on engine id; false when it is not being built (done or gone). */
    labour(id: number, dt: number): boolean {
      const e = engines[id];
      if (!alive(e) || e.state !== 'building') return false;
      e.labour = Math.min(e.def.labour, e.labour + dt);
      e.hp = e.maxHp * Math.max(0.1, e.labour / e.def.labour);
      if (e.labour >= e.def.labour) e.state = 'idle';
      return true;
    },
    get: (id: number) => engines[id] as Readonly<Engine> | undefined,
    /** M6h (server): cart id leaves the field for a world transit (no wreck, no pile); its type and cargo. */
    stow(id: number): { type: 'handcart' | 'wagon'; hold: Hold } | null {
      const e = engines[id];
      if (!alive(e) || !cart(e)) return null;
      const hold = e.hold ?? newHold();
      e.hold = newHold();
      e.state = 'destroyed';
      e.hp = 0;
      e.mode = 'none';
      e.crew = -1;
      return { type: e.type as 'handcart' | 'wagon', hold };
    },
    /** M6i (server): a capture between linked accounts is undone: the cart is `owner`'s (team `team`) again. */
    setOwner(id: number, team: number, owner: string): void {
      const e = engines[id];
      if (!alive(e) || !cart(e)) return;
      e.team = team;
      e.owner = owner;
      e.crew = -1;
      e.mode = 'none';
      e.cap = 0;
      e.capT = -1;
      e.capO = '';
    },
    alive: (id: number) => alive(engines[id]),
    built: (id: number) => built(engines[id]),
    /** Squad `crew` takes the engine (of its team, built, not raised); false if it cannot. */
    crew(id: number, crew: number, team: number): boolean {
      const e = engines[id];
      if (!built(e) || e.team !== team || e.state === 'raised') return false;
      e.crew = crew;
      return true;
    },
    uncrew(id: number) {
      const e = engines[id];
      if (!e) return;
      e.crew = -1;
      e.mode = 'none';
      e.goal = null;
      settle(e);
    },
    /** Orders for the engine (from its crew). */
    move(id: number, x: number, y: number) {
      const e = engines[id];
      if (!built(e) || e.state === 'raised' || e.tower) return;
      e.mode = 'move';
      goTo(e, x, y);
    },
    hold(id: number) {
      const e = engines[id];
      if (!built(e)) return;
      e.mode = 'none';
      e.goal = null;
      settle(e);
    },
    attack(id: number, building: number): boolean {
      const e = engines[id];
      if (!built(e) || (!isRam(e) && e.type !== 'stoneThrower') || !works.piece(building) || works.piece(building)!.team === e.team) return false;
      e.mode = 'attack';
      e.target = building;
      e.goal = null;
      return true;
    },
    deploy(id: number, packUp: boolean) {
      const e = engines[id];
      if (!built(e) || e.type !== 'stoneThrower') return;
      e.mode = packUp ? 'pack' : 'deploy';
      e.goal = null;
    },
    raise(id: number, x: number, y: number): boolean {
      const e = engines[id];
      if (!built(e) || (e.type !== 'siegeLadder' && e.type !== 'siegeTower') || e.state === 'raised' || works.ladderFoot(e.team, Math.floor(x), Math.floor(y)) < 0) return false;
      e.mode = 'raise';
      e.wall = [Math.floor(x), Math.floor(y)];
      e.prog = 0;
      return true;
    },
    /** True while the engine has work (crew should stay with it, not fight). */
    busy: (id: number) => {
      const e = engines[id];
      return built(e) && (e.mode !== 'none' || (e.type === 'oxybeles' && e.crew >= 0)); // an oxybeles' crew serves it
    },
    kindle(id: number, dt: number): boolean {
      const e = engines[id];
      if (!alive(e)) return false;
      if (e.burn > 0) return true;
      e.kindle += dt * fireK(e);
      if (e.kindle >= FIRE.kindle) e.burn = FIRE.start;
      return true;
    },
    /** M5h3: a covered ram's hides: its catch chance and burn pace (1 for any other engine). */
    fireK: (id: number) => (engines[id] ? fireK(engines[id]) : 1),
    /** M5h3: share of missiles a crew man at (x,y) within r of engine id dodges under its roof (ram, covered ram), 0 else. */
    roof(id: number, x: number, y: number, r: number): number {
      const e = engines[id];
      if (!alive(e) || !isRam(e) || (e.x - x) ** 2 + (e.y - y) ** 2 > r * r) return 0;
      return e.type === 'coveredRam' ? COVERED.cover : RAM.cover;
    },
    /** M5h3: share of a missile from (sx,sy) a man of `team` at (x,y) dodges behind a mantlet of his team (0 none). */
    cover(team: number, x: number, y: number, sx: number, sy: number): number {
      if (!mantlets) return 0;
      for (const e of engines) {
        if (e.type !== 'mantlet' || e.team !== team || !built(e)) continue;
        const c = Math.cos(e.facing), sn = Math.sin(e.facing);
        const rx = x - e.x, ry = y - e.y, along = rx * c + ry * sn, perp = Math.abs(ry * c - rx * sn);
        if (along > 0.5 || along < -MANTLET.r || perp > MANTLET.side) continue;
        if ((sx - e.x) * c + (sy - e.y) * sn > 0) return MANTLET.cover;
      }
      return 0;
    },
    douse(id: number, dt: number): boolean {
      const e = engines[id];
      if (!alive(e) || e.burn <= 0) return false;
      e.burn = Math.max(0, e.burn - FIRE.douse * dt);
      if (e.burn <= 0) e.kindle = 0;
      return true;
    },
    damage: (id: number, dmg: number) => engines[id] && damage(engines[id], dmg),
    /** Crew standing points (flat x,y) for n men: two files along its sides, back to front. */
    crewPoints(id: number, n: number): number[] {
      const e = engines[id];
      const c = Math.cos(e.facing), s = Math.sin(e.facing), out: number[] = [];
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
        // a mantlet's men stand behind it, in its cover
        const along = e.type === 'mantlet' ? -0.7 - row * 0.8 : 0.9 - row * 0.9, perp = side * (e.type === 'siegeLadder' || e.type === 'mantlet' ? 0.55 : 0.8);
        const x = e.x + c * along - s * perp, y = e.y + s * along + c * perp;
        if (hooks.open(x, y)) out.push(x, y);
        else out.push(e.x, e.y);
      }
      return out;
    },
    /** Per tick, after the units moved. */
    tick(tick: number) {
      pathsLeft = 2;
      tickNow = tick;
      for (const e of engines) {
        if (!alive(e)) continue;
        if (cart(e) && tick % 5 === 0) {
          // M6b: halt while a foe is near; taken by a foe beside it with none of its team near
          if (hooks.foeNear?.(e.team, e.x, e.y, CART.halt)) e.halt = tick + CART.resume;
          const by = hooks.taker?.(e);
          if (by && by[0] === e.capT && by[1] === e.capO) e.cap += 5;
          else (e.cap = by ? 5 : 0), (e.capT = by ? by[0] : -1), (e.capO = by ? by[1] : '');
          if (by && e.cap >= CART.capture) {
            e.team = by[0];
            e.owner = by[1];
            e.crew = -1;
            e.mode = 'none';
            e.goal = null;
            e.cap = 0;
            e.capT = -1;
            e.halt = 0;
            hooks.captured?.(e, by[1]);
          }
        }
        if (e.burn > 0) {
          e.burn = Math.min(1, e.burn + FIRE.grow * DT);
          damage(e, (e.burn * e.maxHp * DT * fireK(e)) / ENGINE_FIRE_LIFE);
          if (!alive(e)) continue;
        }
        if (e.state === 'building') continue;
        if (e.state === 'raised') {
          const l = works.piece(e.ladder);
          if (!l || l.state === 'destroyed') {
            // pushed off: it lies at the foot, damaged
            e.ladder = -1;
            e.state = 'idle';
            e.prog = 0;
            if (e.type !== 'siegeTower') damage(e, e.maxHp * LADDER.pushed); // a tower whose bridge burnt stands on
          }
          continue;
        }
        const n = crewHere(e);
        if (e.mode === 'attack' && !targetOk(e)) e.mode = 'none';
        if (e.mode === 'none') {
          settle(e);
          if (e.type === 'oxybeles') bolt(e, n, tick);
        } else if (e.mode === 'move') {
          if (e.state === 'deployed' || e.state === 'packing') pack(e, n);
          else if (roll(e, n)) (e.mode = 'none'), settle(e);
        } else if (e.mode === 'attack') isRam(e) ? ram(e, n, tick) : thrower(e, n, tick);
        else if (e.mode === 'raise') ladder(e, n);
        else if (e.mode === 'deploy') {
          deploy(e, n);
          if (e.state === 'deployed') e.mode = 'none';
        } else if (e.mode === 'pack') {
          pack(e, n);
          if (e.state === 'idle') e.mode = 'none';
        }
      }
      for (let i = boulders.length - 1; i >= 0; i--) {
        const b = boulders[i];
        if (b.at > tick) continue;
        boulders.splice(i, 1);
        if (b.hit) works.damage(b.target, b.dmg);
        hooks.splash(b.x, b.y, THROWER.splash, THROWER.splashDmg, 0.5);
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        if (b.at > tick) continue;
        bolts.splice(i, 1);
        hooks.pierce(b.team, b.x0, b.y0, b.x1, b.y1, OXY.width, b.dmg, OXY.ap, OXY.pierce);
      }
      if (shots.length) shots = shots.filter((sh) => sh.t1 > tick);
    },
    shots: () => shots,
    snaps: (tick: number): SiegeSnap[] =>
      engines.map((e) => ({
        id: e.id, type: e.type, team: e.team, x: e.x, y: e.y, facing: e.facing, hp: e.hp, maxHp: e.maxHp, state: e.state,
        progress: e.state === 'building' ? e.labour / e.def.labour : e.state === 'raising' || e.state === 'deploying' || e.state === 'packing' ? e.prog : e.state === 'deployed' ? 1 : 0,
        crew: e.crew, crewNeed: need(e), crewHere:
 alive(e) ? crewHere(e) : 0,
        ...(e.swingAt >= 0 ? { reload: e.cd, swing: tick - 1 - e.swingAt } : {}),
        ...(e.target >= 0 && (e.mode === 'attack' || e.state === 'raised') ? { target: e.target } : {}),
        ...(e.burn > 0 ? { burning: e.burn } : {}),
        ...(e.ladder >= 0 ? { ladder: e.ladder } : {}),
        ...(e.hold ? { owner: e.owner, cargo: totals(e.hold), items: e.hold.items.length, ...(e.hold.items.length ? { list: itemList(e.hold) } : {}), loads: loads(e.hold), cap: cartCap(e), ...(e.halt > tick ? { halted: true as const } : {}), ...(e.cap > 0 ? { capture: Math.min(1, e.cap / CART.capture) } : {}) } : {}),
      })),
  };
}

export type Siege = ReturnType<typeof createSiege>;
