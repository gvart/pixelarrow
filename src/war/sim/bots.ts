/**
 * Bot AI for war squads (M1c): drives squads through the public WarSim API only (snapshot in,
 * orders out), so the same bots run against the sandbox fake, a Worker or the server sim.
 *
 *   const bots = createBots(sim);
 *   bots.set(squad, { kind: 'attackMove', x: 140, y: 30 });
 *   each tick: sim.step(); bots.tick();
 *
 * Behaviours:
 *  - attackMove: march to (x,y), attacking any enemy squad that comes within AGGRO on the way,
 *    then carry on; holds once there.
 *  - hold: stand at (x,y); attack enemy squads that come within `radius` of the point, but
 *    break off and walk back when dragged further than radius + LEASH from it.
 *  - flank: march to the waypoint `via` ignoring enemies (round a ridge, through a pass), then
 *    attack-move to (x,y).
 *
 * Siege behaviours (M2c) against a walled place round (x,y), and its defence:
 *  - siegeRam: build a ram (or take an idle one of its team nearby), crew it and batter the foe gate nearest (x,y) (else
 *    the nearest wall piece); once there is a breach, leave the ram and attack-move through it.
 *  - siegeLadder: build a siege ladder, carry it to the nearest foe walkway wall, raise it, climb onto the walk and
 *    attack-move to (x,y); a ladder pushed off is raised again.
 *  - siegeArchers: fire arrows on; shoot the foes on the walls in reach, else set the nearest wood wall piece alight.
 *  - assault: wait out of bow range until a breach (rubble) or a raised ladder of its team, then go in and attack-move.
 *  - defendWalls: man the walkway nearest the threat; push off foe ladders, attack foes who got inside (within radius / 2
 *    of (x,y)), melee sally out to burn rams, beat out fires on its own wood.
 */
import type { BuildingSnap, Order, SiegeSnap, Snapshot, SquadId, WarSim } from '../types';
import { warStats } from './classes';

export type Behaviour =
  | { kind: 'attackMove'; x: number; y: number }
  | { kind: 'hold'; x: number; y: number; radius?: number }
  | { kind: 'flank'; via: [number, number]; x: number; y: number }
  | { kind: 'siegeRam' | 'siegeLadder' | 'siegeArchers' | 'assault'; x: number; y: number }
  | { kind: 'defendWalls'; x: number; y: number; radius?: number };

export interface Bots {
  set(squad: SquadId, b: Behaviour): void;
  clear(squad: SquadId): void;
  /** Call once per sim step; bots think every `every` ticks. */
  tick(): void;
  /**
   * Current phase per squad, for debug overlays: 'via' | 'march' | 'fight' | 'hold' | 'done'; siege: 'build' | 'crew' |
   * 'ram' | 'ladder' | 'up' | 'in' | 'breach' | 'suppress' | 'burn' | 'wait' | 'climb' | 'walls' | 'push' | 'sally' | 'douse'.
   */
  phase(squad: SquadId): string | undefined;
}

const AGGRO = 10; // attack-move: engage enemy squads this near
const DISENGAGE = 18; // give up a chase when the target gets this far
const ARRIVED = 3;
const HOLD_RADIUS = 8;
const LEASH = 6;
const SIEGE_NEAR = 12; // an idle engine of the team this near is taken up instead of building one
const STAND_OFF = 22; // assault: wait this far from (x,y)
const DEFEND_R = 24;
const ARCHER_R = 16; // siege archers: shoot foes on the walls this near

interface Bot {
  b: Behaviour;
  phase: string;
  issued: string; // last order sent, to avoid re-sending it
  target: SquadId;
  engine: number; // siege: its engine, -1 none yet
  at: [number, number] | null; // siege: where it ordered its engine built
  fire: boolean; // fire arrows ordered
}

interface Centre {
  x: number;
  y: number;
  alive: number;
  team: number;
}

const isGate = (b: BuildingSnap) => b.type === 'woodGate' || b.type === 'stoneGate';
const isWall = (b: BuildingSnap) => isGate(b) || b.type === 'palisade' || b.type === 'rampart' || b.type === 'stoneWall' || b.type === 'woodTower' || b.type === 'stoneTower';
const standing = (b: BuildingSnap) => b.state === 'done' || b.state === 'damaged';
const WOOD = new Set<string>(['palisade', 'rampart', 'woodGate', 'woodTower']);

/** Nearest footprint tile (x, y, squared distance to its centre) of b to (x,y). */
function nearTile(b: BuildingSnap, x: number, y: number): [number, number, number] {
  let best: [number, number, number] = [b.x, b.y, Infinity];
  for (let i = 0; i < b.tiles.length; i += 2) {
    const d = (b.tiles[i] + 0.5 - x) ** 2 + (b.tiles[i + 1] + 0.5 - y) ** 2;
    if (d < best[2]) best = [b.tiles[i], b.tiles[i + 1], d];
  }
  return best;
}

function nearest<T>(items: T[], d: (t: T) => number): T | null {
  let best: T | null = null, bd = Infinity;
  for (const t of items) {
    const v = d(t);
    if (v < bd) (bd = v), (best = t);
  }
  return best;
}

function centres(snap: Snapshot): Centre[] {
  const out: Centre[] = snap.squads.map((s) => ({ x: 0, y: 0, alive: 0, team: s.team }));
  for (const u of snap.units) {
    if (u.state === 'dead') continue;
    const c = out[u.squad];
    c.x += u.x;
    c.y += u.y;
    c.alive++;
  }
  for (const c of out) if (c.alive) (c.x /= c.alive), (c.y /= c.alive);
  return out;
}

export function createBots(sim: WarSim, every = 5): Bots {
  const bots = new Map<SquadId, Bot>();
  let ticks = 0;

  const send = (bot: Bot, key: string, o: Order) => {
    if (bot.issued === key) return;
    bot.issued = key;
    sim.order(o);
  };

  /** Nearest living enemy squad within `r` of (x,y), or -1. */
  const nearestEnemy = (cs: Centre[], team: number, x: number, y: number, r: number): SquadId => {
    let best = -1;
    let bestD = r * r;
    cs.forEach((c, id) => {
      if (!c.alive || c.team === team) return;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  };

  const attackMove = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], x: number, y: number) => {
    const t = cs[bot.target];
    if (t?.alive && Math.hypot(t.x - me.x, t.y - me.y) < DISENGAGE) return; // still fighting it
    const foe = nearestEnemy(cs, me.team, me.x, me.y, AGGRO);
    if (foe >= 0) {
      bot.target = foe;
      bot.phase = 'fight';
      send(bot, `attack:${foe}`, { kind: 'attack', squad: id, target: foe });
      return;
    }
    bot.target = -1;
    if (Math.hypot(x - me.x, y - me.y) > ARRIVED) {
      bot.phase = 'march';
      send(bot, `move:${x},${y}`, { kind: 'move', squad: id, x, y });
    } else {
      bot.phase = 'done';
      send(bot, 'hold', { kind: 'hold', squad: id });
    }
  };

  /** Its engine of `type`, crewed: the one it had built, else an idle uncrewed one of its team nearby, else it orders one built; null meanwhile. */
  const engineFor = (id: SquadId, bot: Bot, me: Centre, snap: Snapshot, type: SiegeSnap['type']): SiegeSnap | null => {
    const sg = snap.sieges ?? [];
    let e = bot.engine >= 0 ? sg[bot.engine] : undefined;
    if (e && e.state === 'destroyed') {
      bot.phase = 'nostock'; // lost it: fight on foot
      return null;
    }
    if (!e && bot.at) {
      const [ax, ay] = bot.at;
      e = sg.find((o) => o.type === type && o.team === me.team && o.state !== 'destroyed' && Math.hypot(o.x - ax, o.y - ay) < 0.5);
      if (e) bot.engine = e.id;
      else if (snap.squads[id].order !== 'buildSiege') {
        bot.phase = 'nostock'; // the build order was refused
        return null;
      }
    }
    if (!e && !bot.at) {
      const idle = nearest(sg.filter((o) => o.type === type && o.team === me.team && o.crew < 0 && o.state === 'idle'), (o) => (o.x - me.x) ** 2 + (o.y - me.y) ** 2);
      if (idle && Math.hypot(idle.x - me.x, idle.y - me.y) < SIEGE_NEAR) (bot.engine = idle.id), (e = idle);
      else {
        bot.at = [Math.floor(me.x) + 0.5, Math.floor(me.y) + 0.5];
        bot.phase = 'build';
        send(bot, 'buildSiege', { kind: 'buildSiege', squad: id, type, x: bot.at[0], y: bot.at[1] });
        return null;
      }
    }
    if (!e || e.state === 'building') return null;
    if (e.crew !== id && e.state !== 'raised') {
      bot.phase = 'crew';
      send(bot, `crew:${e.id}:${ticks}`, { kind: 'crew', squad: id, siege: e.id }); // afresh each time (it may have been relieved)
      return null;
    }
    return e;
  };

  const onFoot = (p: string) => p === 'nostock' || p === 'in' || p === 'breach' || p === 'fight' || p === 'march' || p === 'done';

  const siegeRam = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (onFoot(bot.phase) && bot.phase !== 'breach') return attackMove(id, bot, me, cs, x, y);
    const blds = snap.buildings ?? [];
    const breached = blds.some((b) => b.team !== me.team && b.rubble && Math.hypot(b.x - x, b.y - y) < DEFEND_R * 1.5);
    const foes = blds.filter((b) => b.team !== me.team && isWall(b) && standing(b));
    if (bot.phase === 'breach' || breached || !foes.length) {
      if (bot.phase !== 'breach') send(bot, 'uncrew', { kind: 'uncrew', squad: id });
      bot.phase = 'in';
      return;
    }
    const e = engineFor(id, bot, me, snap, 'ram');
    if (!e) {
      if (bot.phase === 'nostock') attackMove(id, bot, me, cs, x, y);
      return;
    }
    const gate = nearest(foes.filter(isGate), (b) => (b.x - x) ** 2 + (b.y - y) ** 2) ?? nearest(foes, (b) => nearTile(b, e.x, e.y)[2])!;
    bot.phase = 'ram';
    send(bot, `ram:${gate.id}`, { kind: 'attackBuilding', squad: id, building: gate.id });
  };

  const siegeLadder = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    const blds = snap.buildings ?? [];
    if (bot.phase === 'up') {
      const l = blds.find((b) => b.siege === bot.engine && b.state !== 'destroyed');
      const wall = l && blds.find((b) => b.id === l.attach);
      if (!l || !wall) bot.phase = 'ladder'; // pushed off: raise it again
      else {
        const up = snap.units.filter((u) => u.squad === id && u.state !== 'dead' && u.on === wall.id).length;
        if (up * 2 >= me.alive) bot.phase = 'in';
        else {
          const [tx, ty] = nearTile(wall, l.tiles[0] + 0.5, l.tiles[1] + 0.5);
          send(bot, `climb:${l.id}`, { kind: 'move', squad: id, x: tx + 0.5, y: ty + 0.5 });
          return;
        }
      }
    }
    if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
    const e = engineFor(id, bot, me, snap, 'siegeLadder');
    if (!e) {
      if (bot.phase === 'nostock') attackMove(id, bot, me, cs, x, y);
      return;
    }
    if (e.state === 'raised') {
      bot.phase = 'up';
      return;
    }
    const walls = blds.filter((b) => b.team !== me.team && (b.walk ?? 0) > 0 && standing(b));
    const w = nearest(walls, (b) => nearTile(b, e.x, e.y)[2]);
    if (!w) {
      bot.phase = 'in';
      return;
    }
    const [tx, ty] = nearTile(w, e.x, e.y);
    bot.phase = 'ladder';
    send(bot, `raise:${tx},${ty}:${e.crew}`, { kind: 'raiseLadder', squad: id, wallTile: [tx, ty] });
  };

  const siegeArchers = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (!bot.fire) {
      bot.fire = true;
      sim.order({ kind: 'fireArrows', squad: id, on: true });
    }
    let foe = -1, fd = ARCHER_R * ARCHER_R; // foes up on the walls in reach
    for (const u of snap.units) {
      if (u.state === 'dead' || u.on === undefined || cs[u.squad].team === me.team) continue;
      const d = (u.x - me.x) ** 2 + (u.y - me.y) ** 2;
      if (d < fd) (fd = d), (foe = u.squad);
    }
    if (foe >= 0) {
      bot.phase = 'suppress';
      send(bot, `attack:${foe}`, { kind: 'attack', squad: id, target: foe });
      return;
    }
    const wood = (snap.buildings ?? []).filter((b) => b.team !== me.team && WOOD.has(b.type) && standing(b) && !b.burning && Math.hypot(b.x - x, b.y - y) < DEFEND_R * 1.5);
    const w = nearest(wood, (b) => nearTile(b, me.x, me.y)[2]);
    if (w) {
      bot.phase = 'burn';
      send(bot, `burn:${w.id}`, { kind: 'attackBuilding', squad: id, building: w.id });
      return;
    }
    attackMove(id, bot, me, cs, x, y);
  };

  const assault = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
    const blds = snap.buildings ?? [];
    const breach = nearest(blds.filter((b) => b.team !== me.team && b.rubble && Math.hypot(b.x - x, b.y - y) < DEFEND_R * 1.5), (b) => (b.x - me.x) ** 2 + (b.y - me.y) ** 2);
    if (breach) {
      if (Math.hypot(breach.x - me.x, breach.y - me.y) < ARRIVED) bot.phase = 'in';
      else {
        bot.phase = 'breach-go';
        send(bot, `move:${breach.x},${breach.y}`, { kind: 'move', squad: id, x: breach.x, y: breach.y });
      }
      return;
    }
    const ladder = nearest(blds.filter((b) => b.team === me.team && b.siege !== undefined && b.state !== 'destroyed'), (b) => (b.x - me.x) ** 2 + (b.y - me.y) ** 2);
    const wall = ladder && blds.find((b) => b.id === ladder.attach);
    if (ladder && wall) {
      if (snap.units.some((u) => u.squad === id && u.state !== 'dead' && u.on === wall.id)) bot.phase = 'in';
      else {
        const [tx, ty] = nearTile(wall, ladder.tiles[0] + 0.5, ladder.tiles[1] + 0.5);
        bot.phase = 'climb';
        send(bot, `climb:${ladder.id}`, { kind: 'move', squad: id, x: tx + 0.5, y: ty + 0.5 });
      }
      return;
    }
    // wait out of bow range, on the line from (x,y) to where it stands
    const d = Math.hypot(me.x - x, me.y - y);
    bot.phase = 'wait';
    if (d < STAND_OFF - 2) {
      const k = STAND_OFF / (d || 1);
      const wx = Math.round(x + (me.x - x) * k), wy = Math.round(y + (me.y - y) * k);
      send(bot, `wait:${wx},${wy}`, { kind: 'move', squad: id, x: wx, y: wy });
    }
  };

  const defendWalls = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number, r: number) => {
    const blds = snap.buildings ?? [];
    const near = (px: number, py: number) => Math.hypot(px - x, py - y) < r;
    const mine = new Set(blds.filter((b) => b.team === me.team).map((b) => b.id));
    const dist = (b: { x: number; y: number }) => (b.x - me.x) ** 2 + (b.y - me.y) ** 2;
    const ladder = nearest(blds.filter((b) => b.type === 'ladder' && b.team !== me.team && b.state !== 'destroyed' && near(b.x, b.y) && mine.has(b.attach ?? -1)), dist);
    if (ladder) {
      bot.phase = 'push';
      send(bot, `push:${ladder.id}`, { kind: 'pushLadder', squad: id, ladder: ladder.id });
      return;
    }
    const inside = nearestEnemy(cs, me.team, x, y, r / 2);
    if (inside >= 0) {
      bot.phase = 'fight';
      send(bot, `attack:${inside}`, { kind: 'attack', squad: id, target: inside });
      return;
    }
    const melee = snap.units.filter((u) => u.squad === id && u.state !== 'dead' && warStats(u.cls).range === 0).length * 2 > me.alive;
    const ram = melee ? nearest((snap.sieges ?? []).filter((e) => e.type === 'ram' && e.team !== me.team && e.state !== 'destroyed' && !e.burning && near(e.x, e.y)), dist) : null;
    if (ram) {
      bot.phase = 'sally';
      send(bot, `ignite:${ram.id}`, { kind: 'ignite', squad: id, siege: ram.id });
      return;
    }
    const fire = nearest(blds.filter((b) => b.team === me.team && b.burning && near(b.x, b.y)), dist);
    if (fire) {
      bot.phase = 'douse';
      send(bot, `douse:${fire.id}`, { kind: 'extinguish', squad: id, building: fire.id });
      return;
    }
    // man the walk nearest the nearest foe (or the centre)
    const foe = nearestEnemy(cs, me.team, x, y, r * 2);
    const [fx, fy] = foe >= 0 ? [cs[foe].x, cs[foe].y] : [x, y];
    const w = nearest(blds.filter((b) => b.team === me.team && (b.walk ?? 0) > 0 && standing(b) && b.type !== 'ladder' && near(b.x, b.y)), (b) => nearTile(b, fx, fy)[2]);
    if (!w) {
      bot.phase = 'hold';
      send(bot, 'hold', { kind: 'hold', squad: id });
      return;
    }
    const [tx, ty] = nearTile(w, fx, fy);
    bot.phase = 'walls';
    send(bot, `walls:${w.id}`, { kind: 'move', squad: id, x: tx + 0.5, y: ty + 0.5 });
  };

  const think = (snap: Snapshot) => {
    const cs = centres(snap);
    for (const [id, bot] of bots) {
      const me = cs[id];
      if (!me?.alive) continue;
      const b = bot.b;
      if (b.kind === 'siegeRam') siegeRam(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'siegeLadder') siegeLadder(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'siegeArchers') siegeArchers(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'assault') assault(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'defendWalls') defendWalls(id, bot, me, cs, snap, b.x, b.y, b.radius ?? DEFEND_R);
      else if (b.kind === 'attackMove') attackMove(id, bot, me, cs, b.x, b.y);
      else if (b.kind === 'flank') {
        if (bot.phase === 'via') {
          if (Math.hypot(b.via[0] - me.x, b.via[1] - me.y) > ARRIVED) send(bot, 'via', { kind: 'move', squad: id, x: b.via[0], y: b.via[1] });
          else bot.phase = 'march';
        }
        if (bot.phase !== 'via') attackMove(id, bot, me, cs, b.x, b.y);
      } else if (b.kind === 'hold') {
        const r = b.radius ?? HOLD_RADIUS;
        const away = Math.hypot(b.x - me.x, b.y - me.y);
        const foe = away > r + LEASH ? -1 : nearestEnemy(cs, me.team, b.x, b.y, r);
        if (foe >= 0) {
          bot.phase = 'fight';
          send(bot, `attack:${foe}`, { kind: 'attack', squad: id, target: foe });
        } else if (away > ARRIVED) {
          bot.phase = 'march';
          send(bot, `move:${b.x},${b.y}`, { kind: 'move', squad: id, x: b.x, y: b.y });
        } else {
          bot.phase = 'hold';
          send(bot, 'hold', { kind: 'hold', squad: id });
        }
      }
    }
  };

  return {
    set(squad, b) {
      const start = b.kind === 'flank' ? 'via' : b.kind === 'attackMove' || b.kind === 'hold' ? 'march' : 'start';
      bots.set(squad, { b, phase: start, issued: '', target: -1, engine: -1, at: null, fire: false });
    },
    clear(squad) {
      bots.delete(squad);
    },
    tick() {
      if (bots.size && ticks % every === 0) think(sim.snapshot());
      ticks++;
    },
    phase(squad) {
      return bots.get(squad)?.phase;
    },
  };
}
