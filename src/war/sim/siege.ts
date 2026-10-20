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
 */
import type { ResourceKind, ShotSnap, SiegeSnap, SiegeState, SiegeType } from '../types';
import { FIRE, type Works } from './works';
import type { Rng } from '../../sim/rng';

const DT = 0.1;

export interface SiegeDef { hp: number; cost: Partial<Record<ResourceKind, number>>; labour: number; crew: number; speed: number }
export const SIEGE: Record<SiegeType, SiegeDef> = {
  ram: { hp: 900, cost: { wood: 80 }, labour: 240, crew: 6, speed: 0.45 },
  stoneThrower: { hp: 500, cost: { wood: 100, stone: 30 }, labour: 480, crew: 4, speed: 0.3 },
  siegeLadder: { hp: 150, cost: { wood: 20 }, labour: 60, crew: 4, speed: 0.9 },
};
export const RAM = { reach: 1.5, ticks: 30, dmg: 160, stone: 0.4, cover: 0.5 };
export const THROWER = { min: 8, range: 36, reload: 120, deploy: 100, dmg: 220, speed: 10, acc: 0.65, scatter: 2.5, splash: 1.5, splashDmg: 40 };
export const LADDER = { raise: 30, pushed: 0.25, fall: 0.6 }; // raise ticks; hp share the engine loses when pushed; climbers' fall (share of maxHp)
const ENGINE_FIRE_LIFE = 90;
const CREW_R = 2.5; // crew this near the engine count as beside it
const ARRIVE = 0.3;

type Mode = 'none' | 'move' | 'attack' | 'raise' | 'deploy' | 'pack';

interface Engine {
  id: number; type: SiegeType; def: SiegeDef; team: number; x: number; y: number; facing: number; hp: number; maxHp: number;
  state: SiegeState; labour: number; crew: number; mode: Mode; goal: [number, number] | null; path: number[]; pi: number;
  target: number; wall: [number, number] | null; ladder: number; cd: number; swingAt: number; prog: number; burn: number; kindle: number;
}

interface Boulder { at: number; x: number; y: number; target: number; hit: boolean }

export interface SiegeHooks {
  path(team: number, x0: number, y0: number, x1: number, y1: number): number[];
  /** Crew men of squad `crew` within r of (x,y). */
  crewNear(crew: number, x: number, y: number, r: number): number;
  /** Men within r of (x,y) take a blow of dmg (armour pierce ap). */
  splash(x: number, y: number, r: number, dmg: number, ap: number): void;
  open(x: number, y: number): boolean;
  /** Move cost of the tile at (x,y) (1 grass). */
  cost(x: number, y: number): number;
}

export function createSiege(works: Works, rng: Rng, hooks: SiegeHooks) {
  const engines: Engine[] = [];
  const boulders: Boulder[] = [];
  let shots: ShotSnap[] = [];
  let pathsLeft = 0;

  const alive = (e: Engine | undefined): e is Engine => !!e && e.state !== 'destroyed';
  const built = (e: Engine | undefined): e is Engine => alive(e) && e.state !== 'building';
  const crewHere = (e: Engine) => (e.crew >= 0 ? hooks.crewNear(e.crew, e.x, e.y, CREW_R) : 0);
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
    e.burn = 0;
    e.mode = 'none';
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
      e.path = hooks.path(e.team, e.x, e.y, e.goal[0], e.goal[1]);
      e.pi = 1;
    }
    if (n < e.def.crew) return false;
    if (e.state === 'deployed') return false;
    let budget = e.def.speed * DT;
    while (budget > 0 && e.pi < e.path.length / 2) {
      const tx = e.path[e.pi * 2], ty = e.path[e.pi * 2 + 1];
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) e.facing = Math.atan2(dy, dx);
      const step = budget / Math.max(0.5, hooks.cost(e.x + (dx / (d || 1)) * 0.5, e.y + (dy / (d || 1)) * 0.5));
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
    if (n < e.def.crew) return void settle(e);
    e.state = 'attack';
    if (e.cd > 0) return;
    e.cd = RAM.ticks;
    e.swingAt = tick;
    works.damage(e.target, RAM.dmg * (works.piece(e.target)!.def.material === 'stone' ? RAM.stone : 1));
  };

  const thrower = (e: Engine, n: number, tick: number) => {
    if (e.cd > 0) e.cd--;
    const [tx, ty] = works.nearestTile(e.target, e.x, e.y);
    const d = Math.hypot(tx - e.x, ty - e.y);
    if (d > THROWER.range || d < THROWER.min) {
      if (e.state === 'deployed' || e.state === 'packing') return pack(e, n);
      const k = (THROWER.range * 0.8) / (d || 1);
      if (!e.goal) goTo(e, tx + (e.x - tx) * k, ty + (e.y - ty) * k);
      if (roll(e, n)) {
        const d2 = Math.hypot(tx - e.x, ty - e.y);
        if (d2 > THROWER.range || d2 < THROWER.min) e.mode = 'none';
      }
      return;
    }
    e.goal = null;
    if (e.state !== 'deployed') return deploy(e, n);
    e.facing = Math.atan2(ty - e.y, tx - e.x);
    if (n < e.def.crew || e.cd > 0) return;
    e.cd = THROWER.reload;
    e.swingAt = tick;
    const hit = rng.chance(THROWER.acc * (1 - 0.4 * (d / THROWER.range)));
    let lx = tx, ly = ty;
    if (!hit) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(1, THROWER.scatter);
      (lx += Math.cos(a) * r), (ly += Math.sin(a) * r);
    }
    const at = tick + Math.max(1, Math.round(d / THROWER.speed / DT));
    boulders.push({ at, x: lx, y: ly, target: e.target, hit });
    shots.push({ x0: e.x, y0: e.y, x1: lx, y1: ly, t0: tick, t1: at, z0: 0, z1: 0, by: -1 - e.id, kind: 'stone', siege: e.id });
  };

  const deploy = (e: Engine, n: number) => {
    if (e.state === 'deployed') return;
    e.state = 'deploying';
    if (n >= e.def.crew) e.prog = Math.min(1, e.prog + 1 / THROWER.deploy);
    if (e.prog >= 1) e.state = 'deployed';
  };
  /** Packs up; true once packed (idle). */
  const pack = (e: Engine, n: number): void => {
    if (e.state !== 'deployed' && e.state !== 'packing') return;
    e.state = 'packing';
    if (n >= e.def.crew) e.prog = Math.max(0, e.prog - 1 / THROWER.deploy);
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
    if (n < e.def.crew) return;
    e.prog = Math.min(1, e.prog + 1 / LADDER.raise);
    if (e.prog < 1) return;
    const id = works.raiseLadder(e.team, wx, wy, e.id);
    if (id < 0) return void ((e.mode = 'none'), (e.state = 'idle'), (e.prog = 0));
    e.ladder = id;
    e.target = works.piece(id)!.attach;
    e.state = 'raised';
    e.mode = 'none';
    e.x = fx;
    e.y = fy;
    e.crew = -1; // the crew is free to climb
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ engines, boulders, shots, pathsLeft }),
    loadRoot: (o: { shots: ShotSnap[]; pathsLeft: number }) => void ((shots = o.shots), (pathsLeft = o.pathsLeft)),
    /** A new engine of `team` at (x,y), its cost paid; its id, or -1 (no stock, no ground). */
    build(team: number, type: SiegeType, x: number, y: number): number {
      if (!hooks.open(x, y) || !works.takeStock(team, SIEGE[type].cost)) return -1;
      const def = SIEGE[type];
      engines.push({
        id: engines.length, type, def, team, x, y, facing: 0, hp: def.hp * 0.1, maxHp: def.hp, state: 'building', labour: 0, crew: -1,
        mode: 'none', goal: null, path: [], pi: 0, target: -1, wall: null, ladder: -1, cd: 0, swingAt: -1, prog: 0, burn: 0, kindle: 0,
      });
      return engines.length - 1;
    },
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
      if (!built(e) || e.state === 'raised') return;
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
      if (!built(e) || e.type === 'siegeLadder' || !works.piece(building) || works.piece(building)!.team === e.team) return false;
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
      if (!built(e) || e.type !== 'siegeLadder' || e.state === 'raised' || works.ladderFoot(e.team, Math.floor(x), Math.floor(y)) < 0) return false;
      e.mode = 'raise';
      e.wall = [Math.floor(x), Math.floor(y)];
      e.prog = 0;
      return true;
    },
    /** True while the engine has work (crew should stay with it, not fight). */
    busy: (id: number) => {
      const e = engines[id];
      return built(e) && e.mode !== 'none';
    },
    kindle(id: number, dt: number): boolean {
      const e = engines[id];
      if (!alive(e)) return false;
      if (e.burn > 0) return true;
      e.kindle += dt;
      if (e.kindle >= FIRE.kindle) e.burn = FIRE.start;
      return true;
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
        const along = 0.9 - row * 0.9, perp = side * (e.type === 'siegeLadder' ? 0.55 : 0.8);
        const x = e.x + c * along - s * perp, y = e.y + s * along + c * perp;
        if (hooks.open(x, y)) out.push(x, y);
        else out.push(e.x, e.y);
      }
      return out;
    },
    /** Per tick, after the units moved. */
    tick(tick: number) {
      pathsLeft = 2;
      for (const e of engines) {
        if (!alive(e)) continue;
        if (e.burn > 0) {
          e.burn = Math.min(1, e.burn + FIRE.grow * DT);
          damage(e, (e.burn * e.maxHp * DT) / ENGINE_FIRE_LIFE);
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
            damage(e, e.maxHp * LADDER.pushed);
          }
          continue;
        }
        const n = crewHere(e);
        if (e.mode === 'attack' && !targetOk(e)) e.mode = 'none';
        if (e.mode === 'none') settle(e);
        else if (e.mode === 'move') {
          if (e.state === 'deployed' || e.state === 'packing') pack(e, n);
          else if (roll(e, n)) (e.mode = 'none'), settle(e);
        } else if (e.mode === 'attack') e.type === 'ram' ? ram(e, n, tick) : thrower(e, n, tick);
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
        if (b.hit) works.damage(b.target, THROWER.dmg);
        hooks.splash(b.x, b.y, THROWER.splash, THROWER.splashDmg, 0.5);
      }
      if (shots.length) shots = shots.filter((sh) => sh.t1 > tick);
    },
    shots: () => shots,
    snaps: (tick: number): SiegeSnap[] =>
      engines.map((e) => ({
        id: e.id, type: e.type, team: e.team, x: e.x, y: e.y, facing: e.facing, hp: e.hp, maxHp: e.maxHp, state: e.state,
        progress: e.state === 'building' ? e.labour / e.def.labour : e.state === 'raising' || e.state === 'deploying' || e.state === 'packing' ? e.prog : e.state === 'deployed' ? 1 : 0,
        crew: e.crew, crewNeed: e.def.crew, crewHere: alive(e) ? crewHere(e) : 0,
        ...(e.swingAt >= 0 ? { reload: e.cd, swing: tick - 1 - e.swingAt } : {}),
        ...(e.target >= 0 && (e.mode === 'attack' || e.state === 'raised') ? { target: e.target } : {}),
        ...(e.burn > 0 ? { burning: e.burn } : {}),
        ...(e.ladder >= 0 ? { ladder: e.ladder } : {}),
      })),
  };
}

export type Siege = ReturnType<typeof createSiege>;
