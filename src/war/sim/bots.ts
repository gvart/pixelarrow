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
 *  - siegeArchers: fire arrows on; shoot the foes on the walls in reach, else set the nearest wood wall piece alight;
 *    while shooting with no lit brazier near (W-35), set one down on the ground just behind the squad's centre.
 *  - assault: wait out of bow range until a breach (rubble) or a raised ladder of its team, then go in and attack-move.
 *  - M5h3 engineer designs (`engine`; a refused build falls back to the plain engine): siegeRam with a coveredRam,
 *    siegeLadder with a siegeTower (docked like a ladder), siegeArchers with a mantlet (rolled to bow range of the
 *    nearest foe wall, the archers shoot from behind it); siegeBolts: an oxybeles rolled to OXY.range * 0.6 of the
 *    nearest foe wall, where it shoots at the men it sees.
 *  - defendWalls: man the walkway nearest the threat; push off foe ladders, attack foes who got inside (within radius / 2
 *    of (x,y)), melee sally out to burn rams (covered rams, siege towers), beat out fires on its own wood.
 *
 * Trade behaviours (M6j; docs/WAR.md "Carts", "Ambushes"):
 *  - raider: waits on an ambush rect (x, y, w, h; RegionData.ambush) and takes on foes that come into it; a foe cart
 *    within `reach` of the rect whose guard is weak (at most `weak` living men of its team within GUARD_R) is gone for:
 *    the guards near it are fought, then the raiders stand beside it until the sim's capture rule hands it over; a
 *    taken cart is crewed and pulled back to the rect. Strong escorts are let by (fought only inside the rect).
 *  - bandit lairs: raiders whose rect sits on a coast track (lairSites(region) picks road or dirt tiles by deep water).
 *  - escort (offline players): keeps the squad on the `escort` order of its cart; a lost cart is gone after and retaken.
 *  - haul (offline players): crews its cart and pulls it along `path` (tile waypoints) to the last one, then holds.
 *
 * Fog of war (W-39): on a sim with vision (visibleTo / lastSeen) each team's bots think on what the team knows: foe squads
 * it sees now (any man in sight), or saw within MEMORY ticks (at the spot last seen); foe men and engines in sight; foe
 * buildings as last seen.
 */
import { decodeGraph, encodeGraph } from './state';
import type { BuildingSnap, Order, RegionData, SiegeSnap, Snapshot, SquadId, WarBuildSim, WarSim } from '../types';
import { warStats } from './classes';
import { OXY } from './siege';

export type Behaviour =
  | { kind: 'attackMove'; x: number; y: number }
  | { kind: 'hold'; x: number; y: number; radius?: number }
  | { kind: 'flank'; via: [number, number]; x: number; y: number }
  | { kind: 'siegeRam' | 'siegeLadder' | 'siegeArchers' | 'assault'; x: number; y: number; engine?: SiegeSnap['type'] }
  | { kind: 'siegeBolts'; x: number; y: number }
  | { kind: 'defendWalls'; x: number; y: number; radius?: number }
  | { kind: 'raider'; x: number; y: number; w: number; h: number; weak?: number; reach?: number }
  | { kind: 'escort'; cart: number }
  | { kind: 'haul'; cart: number; path: [number, number][] };

export interface Bots {
  set(squad: SquadId, b: Behaviour): void;
  clear(squad: SquadId): void;
  /** Call once per sim step; bots think every `every` ticks. */
  tick(): void;
  /**
   * Current phase per squad, for debug overlays: 'via' | 'march' | 'fight' | 'hold' | 'done'; siege: 'build' | 'crew' |
   * 'ram' | 'ladder' | 'up' | 'in' | 'breach' | 'suppress' | 'burn' | 'wait' | 'climb' | 'walls' | 'push' | 'sally' | 'douse' | 'scout' (fog: no wall of the place seen yet).
   */
  phase(squad: SquadId): string | undefined;
  /** M5e eviction resume: the controllers' state as JSON-safe data, and back (into fresh bots of a restored sim). */
  exportState(): unknown;
  importState(s: unknown): void;
}

const AGGRO = 10; // attack-move: engage enemy squads this near
const ACTIVE_MELEE = 4; // M5c: fire the squad active with a foe squad's centre this near
const ACTIVE_MISSILE = 14; // ... a volley this near
const DISENGAGE = 18; // give up a chase when the target gets this far
const ARRIVED = 3;
const HOLD_RADIUS = 8;
const LEASH = 6;
const SIEGE_NEAR = 12; // an idle engine of the team this near is taken up instead of building one
const STAND_OFF = 22; // assault: wait this far from (x,y)
const DEFEND_R = 24;
const ARCHER_R = 16; // siege archers: shoot foes on the walls this near
const BRAZIER_BACK = 1.5; // ... their brazier goes this far behind their centre (away from the target)
const BRAZIER_EVERY = 30; // ... ticks between tries while none is lit near
const MEMORY = 100; // ticks a foe squad out of sight is still chased at the spot last seen
const RAID_REACH = 28; // raider: foe carts this near its ambush rect are looked at
const GUARD_R = 12; // ... men of the cart's team this near it guard it
const LAIR_GAP = 40; // bandit lairs at least this far apart

interface Bot {
  b: Behaviour;
  phase: string;
  issued: string; // last order sent, to avoid re-sending it
  target: SquadId;
  engine: number; // siege: its engine, -1 none yet
  at: [number, number] | null; // siege: where it ordered its engine built
  fire: boolean; // fire arrows ordered
  brazier: number; // siege archers: tick of the last brazier set down, tries so far
  tries: number;
  plain?: boolean; // M5h3: its design was refused: it builds the plain engine
  cart?: number; // M6j raider: the foe cart it goes for (-1 none)
}

interface Centre {
  x: number;
  y: number;
  alive: number;
  team: number;
}

const isCart = (e: SiegeSnap) => (e.type === 'handcart' || e.type === 'wagon') && e.state !== 'destroyed';

/**
 * M6j bandit lairs on coast tracks: up to `n` road or dirt tiles within 3 of deep water, at least LAIR_GAP apart, as
 * tile centres (none on a region without such a track).
 */
export function lairSites(r: RegionData, n = 2): [number, number][] {
  const out: [number, number][] = [];
  const coast = (x: number, y: number) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < r.w && ty < r.h && r.water[ty * r.w + tx] === 2) return true;
    }
    return false;
  };
  for (let y = 0; y < r.h && out.length < n; y += 2) for (let x = 0; x < r.w && out.length < n; x += 2) {
    const i = y * r.w + x;
    if ((r.terrain[i] === 'road' || r.terrain[i] === 'dirt') && !r.water[i] && coast(x, y) && out.every(([ox, oy]) => Math.hypot(ox - x, oy - y) >= LAIR_GAP)) out.push([x + 0.5, y + 0.5]);
  }
  return out;
}

/** M6j: a raider behaviour waiting on an 8 x 8 rect round (x, y) (a bandit lair). */
export const lairRaider = (x: number, y: number): Behaviour => ({ kind: 'raider', x: x - 4, y: y - 4, w: 8, h: 8 });

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
  const vis = 'visibleTo' in sim ? (sim as WarBuildSim) : null;
  const memo = new Map<number, Map<SquadId, { x: number; y: number; at: number }>>(); // team -> foe squad -> last seen

  /** What `team` knows of the field: its own side whole, foes as seen or remembered (see the header). */
  const viewOf = (snap: Snapshot, cs: Centre[], team: number): { cs: Centre[]; snap: Snapshot } => {
    if (!vis) return { cs, snap };
    let mem = memo.get(team);
    if (!mem) memo.set(team, (mem = new Map()));
    const seen = new Set<SquadId>();
    const units = snap.units.filter((u) => {
      if (cs[u.squad].team === team) return true;
      if (u.state === 'dead' || !vis.visibleTo(team, u.x, u.y)) return false;
      seen.add(u.squad);
      return true;
    });
    const known = cs.map((c, id): Centre => {
      if (c.team === team || !c.alive) return c;
      if (seen.has(id)) {
        mem.set(id, { x: c.x, y: c.y, at: snap.tick });
        return c;
      }
      const m = mem.get(id);
      return m && snap.tick - m.at <= MEMORY ? { ...c, x: m.x, y: m.y } : { ...c, alive: 0 };
    });
    const buildings = [...(snap.buildings ?? []).filter((b) => b.team === team), ...vis.lastSeen(team)];
    const sieges = snap.sieges?.filter((e) => e.team === team || vis.visibleTo(team, e.x, e.y));
    return { cs: known, snap: { ...snap, units, buildings, ...(sieges ? { sieges } : {}) } };
  };

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
        send(bot, `buildSiege:${type}`, { kind: 'buildSiege', squad: id, type, x: bot.at[0], y: bot.at[1] });
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

  /**
   * M5h3: engineFor the design `want` (else `base`); a refused design build (no engineer, no stock) falls back to `base`
   * on the next think.
   */
  const designFor = (id: SquadId, bot: Bot, me: Centre, snap: Snapshot, base: SiegeSnap['type'] | null, want?: SiegeSnap['type']): SiegeSnap | null => {
    const type = want && !bot.plain ? want : base;
    if (!type) return null;
    const e = engineFor(id, bot, me, snap, type);
    if (!e && bot.phase === 'nostock' && bot.engine < 0 && type !== base) {
      bot.plain = true;
      bot.at = null;
      if (base) bot.phase = 'start';
    }
    return e;
  };

  /** M5h3: roll its crewed engine to `dist` of the nearest foe wall tile (towards it); true once there. */
  const rollTo = (id: SquadId, bot: Bot, e: SiegeSnap, walls: BuildingSnap[], dist: number, x: number, y: number): boolean => {
    const w = nearest(walls, (b) => nearTile(b, e.x, e.y)[2]);
    const [tx, ty] = w ? nearTile(w, e.x, e.y) : [x, y];
    const d = Math.hypot(e.x - tx - 0.5, e.y - ty - 0.5);
    if (d <= dist + ARRIVED) return true;
    const k = dist / (d || 1);
    const gx = Math.round(tx + 0.5 + (e.x - tx - 0.5) * k), gy = Math.round(ty + 0.5 + (e.y - ty - 0.5) * k);
    send(bot, `roll:${gx},${gy}`, { kind: 'move', squad: id, x: gx, y: gy });
    return false;
  };

  const onFoot = (p: string) => p === 'nostock' || p === 'in' || p === 'breach' || p === 'fight' || p === 'march' || p === 'done';

  /** Fog (W-39): no foe wall of the place known yet (standing or fallen): walk towards it until one is seen. */
  const scout = (id: SquadId, bot: Bot, me: Centre, blds: BuildingSnap[], x: number, y: number): boolean => {
    if (bot.engine >= 0 || bot.at || blds.some((b) => b.team !== me.team && isWall(b))) return false;
    bot.phase = 'scout';
    send(bot, `scout:${x},${y}`, { kind: 'move', squad: id, x, y });
    return true;
  };

  const siegeRam = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (onFoot(bot.phase) && bot.phase !== 'breach') return attackMove(id, bot, me, cs, x, y);
    const blds = snap.buildings ?? [];
    if (scout(id, bot, me, blds, x, y)) return;
    const breached = blds.some((b) => b.team !== me.team && b.rubble && Math.hypot(b.x - x, b.y - y) < DEFEND_R * 1.5);
    const foes = blds.filter((b) => b.team !== me.team && isWall(b) && standing(b));
    if (bot.phase === 'breach' || breached || !foes.length) {
      if (bot.phase !== 'breach') send(bot, 'uncrew', { kind: 'uncrew', squad: id });
      bot.phase = 'in';
      return;
    }
    const e = designFor(id, bot, me, snap, 'ram', bot.b.kind === 'siegeRam' ? bot.b.engine : undefined);
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
    if (scout(id, bot, me, blds, x, y)) return;
    const e = designFor(id, bot, me, snap, 'siegeLadder', bot.b.kind === 'siegeLadder' ? bot.b.engine : undefined);
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

  /** W-35: siege archers shooting from where they stand with no lit brazier near set one down behind their centre. */
  const brazier = (id: SquadId, bot: Bot, me: Centre, snap: Snapshot, tx: number, ty: number) => {
    if (snap.squads[id].fireArrows?.reason !== 'noBrazier' || snap.tick - bot.brazier < BRAZIER_EVERY || !me.alive) return;
    // a different spot each try (a tile may be taken): turn round the centre
    const a = Math.atan2(me.y - ty, me.x - tx) + ((bot.tries % 5) - 2) * 0.5;
    const r = bot.tries % 5 ? BRAZIER_BACK + 0.5 : BRAZIER_BACK;
    bot.brazier = snap.tick;
    bot.tries++;
    sim.order({ kind: 'placeBuilding', team: me.team, type: 'brazier', x: Math.floor(me.x + Math.cos(a) * r) + 0.5, y: Math.floor(me.y + Math.sin(a) * r) + 0.5 });
  };

  const siegeArchers = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (!bot.fire) {
      bot.fire = true;
      sim.order({ kind: 'fireArrows', squad: id, on: true });
    }
    // M5h3: behind a mantlet, rolled to bow range of the nearest foe wall
    if (bot.b.kind === 'siegeArchers' && bot.b.engine === 'mantlet' && !bot.plain && bot.phase !== 'nostock') {
      const walls = (snap.buildings ?? []).filter((b) => b.team !== me.team && isWall(b) && standing(b));
      if (walls.length) {
        const e = designFor(id, bot, me, snap, null, 'mantlet');
        if (!e) {
          if (bot.phase === 'nostock') bot.plain = true; // refused or lost: plain siege archers from now on
          return;
        }
        if (bot.phase === 'covered' || rollTo(id, bot, e, walls, ARCHER_R * 0.7, x, y)) {
          bot.phase = 'covered';
          send(bot, 'covered', { kind: 'hold', squad: id });
        } else bot.phase = 'mantlet';
        return;
      }
    }
    let foe = -1, fd = ARCHER_R * ARCHER_R; // foes up on the walls in reach
    for (const u of snap.units) {
      if (u.state === 'dead' || u.on === undefined || cs[u.squad].team === me.team) continue;
      const d = (u.x - me.x) ** 2 + (u.y - me.y) ** 2;
      if (d < fd) (fd = d), (foe = u.squad);
    }
    if (foe >= 0) {
      bot.phase = 'suppress';
      brazier(id, bot, me, snap, cs[foe].x, cs[foe].y);
      send(bot, `attack:${foe}`, { kind: 'attack', squad: id, target: foe });
      return;
    }
    const wood = (snap.buildings ?? []).filter((b) => b.team !== me.team && WOOD.has(b.type) && standing(b) && !b.burning && Math.hypot(b.x - x, b.y - y) < DEFEND_R * 1.5);
    const w = nearest(wood, (b) => nearTile(b, me.x, me.y)[2]);
    if (w) {
      bot.phase = 'burn';
      brazier(id, bot, me, snap, w.x, w.y);
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

  /** M5h3: an oxybeles rolled to bow-shot of the walls; it shoots by itself. */
  const siegeBolts = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, x: number, y: number) => {
    if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
    const blds = snap.buildings ?? [];
    if (scout(id, bot, me, blds, x, y)) return;
    const e = designFor(id, bot, me, snap, null, 'oxybeles');
    if (!e) {
      if (bot.phase === 'nostock' || bot.plain) (bot.phase = 'nostock'), attackMove(id, bot, me, cs, x, y);
      return;
    }
    const walls = blds.filter((b) => b.team !== me.team && isWall(b) && standing(b));
    if (bot.phase === 'bolts' || rollTo(id, bot, e, walls, OXY.range * 0.6, x, y)) {
      bot.phase = 'bolts';
      send(bot, 'bolts', { kind: 'hold', squad: id });
    } else bot.phase = 'roll';
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
    const ram = melee ? nearest((snap.sieges ?? []).filter((e) => (e.type === 'ram' || e.type === 'coveredRam' || e.type === 'siegeTower') && e.team !== me.team && e.state !== 'destroyed' && !e.burning && near(e.x, e.y)), dist) : null;
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

  /** Hold round (x, y): attack foes within r of it, walk back when dragged past r + LEASH. */
  const holdAt = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], x: number, y: number, r: number) => {
    const away = Math.hypot(x - me.x, y - me.y);
    const foe = away > r + LEASH ? -1 : nearestEnemy(cs, me.team, x, y, r);
    if (foe >= 0) {
      bot.phase = 'fight';
      send(bot, `attack:${foe}`, { kind: 'attack', squad: id, target: foe });
    } else if (away > ARRIVED) {
      bot.phase = 'march';
      send(bot, `move:${x},${y}`, { kind: 'move', squad: id, x, y });
    } else {
      bot.phase = 'hold';
      send(bot, 'hold', { kind: 'hold', squad: id });
    }
  };

  /** Living men of `team` within GUARD_R of (x, y). */
  const guardsOf = (snap: Snapshot, cs: Centre[], team: number, x: number, y: number) => {
    let n = 0;
    for (const u of snap.units) if (u.state !== 'dead' && cs[u.squad]?.team === team && (u.x - x) ** 2 + (u.y - y) ** 2 <= GUARD_R * GUARD_R) n++;
    return n;
  };

  /** Crew cart e and pull it to (x, y); true once it is there. */
  const pull = (id: SquadId, bot: Bot, e: SiegeSnap, x: number, y: number, key: string): boolean => {
    if (e.crew !== id) {
      bot.phase = 'crew';
      send(bot, `crew:${e.id}:${Math.floor(ticks / 50)}`, { kind: 'crew', squad: id, siege: e.id });
      return false;
    }
    if (Math.hypot(e.x - x, e.y - y) <= ARRIVED) return true;
    bot.phase = 'haul';
    send(bot, `${key}:${Math.floor(ticks / 100)}`, { kind: 'move', squad: id, x, y }); // again now and then: a halt drops it
    return false;
  };

  const raider = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, b: Extract<Behaviour, { kind: 'raider' }>) => {
    const hx = b.x + b.w / 2, hy = b.y + b.h / 2;
    const carts = (snap.sieges ?? []).filter(isCart);
    // the cart it went for is ours now: it is the prize
    if ((bot.cart ?? -1) >= 0) {
      const c = carts.find((e) => e.id === bot.cart);
      if (c?.team === me.team) bot.engine = c.id;
      if (!c || c.team === me.team) bot.cart = -1;
    }
    const prize = bot.engine >= 0 ? carts.find((e) => e.id === bot.engine && e.team === me.team) : undefined;
    if (prize) {
      if (pull(id, bot, prize, hx, hy, 'home')) {
        bot.phase = 'done';
        send(bot, 'hold', { kind: 'hold', squad: id });
      }
      return;
    }
    bot.engine = -1;
    const weak = b.weak ?? Math.max(3, Math.floor(me.alive * 0.6)), reach = b.reach ?? RAID_REACH;
    const prey = nearest(carts.filter((e) => e.team !== me.team && Math.hypot(e.x - hx, e.y - hy) <= reach + Math.max(b.w, b.h) / 2 && guardsOf(snap, cs, e.team, e.x, e.y) <= weak), (e) => (e.x - me.x) ** 2 + (e.y - me.y) ** 2);
    if (prey) {
      bot.cart = prey.id;
      const g = nearestEnemy(cs, me.team, prey.x, prey.y, GUARD_R);
      if (g >= 0) {
        bot.phase = 'fight';
        send(bot, `attack:${g}`, { kind: 'attack', squad: id, target: g });
      } else {
        bot.phase = 'raid';
        send(bot, `raid:${Math.round(prey.x)},${Math.round(prey.y)}`, { kind: 'move', squad: id, x: prey.x, y: prey.y });
      }
      return;
    }
    holdAt(id, bot, me, cs, hx, hy, Math.max(b.w, b.h) / 2 + 4);
    if (bot.phase === 'hold') bot.phase = 'wait';
  };

  const escort = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot, cart: number) => {
    const c = (snap.sieges ?? []).find((e) => e.id === cart && isCart(e));
    if (!c) {
      bot.phase = 'done';
      send(bot, 'hold', { kind: 'hold', squad: id });
    } else if (c.team === me.team) {
      bot.phase = 'escort';
      if (snap.squads[id].order !== 'escort') send(bot, `escort:${c.id}:${ticks}`, { kind: 'escort', squad: id, cart: c.id });
    } else {
      // taken: go and take it back (its new guards first)
      const g = nearestEnemy(cs, me.team, c.x, c.y, GUARD_R);
      bot.phase = 'retake';
      if (g >= 0) send(bot, `attack:${g}`, { kind: 'attack', squad: id, target: g });
      else send(bot, `retake:${Math.round(c.x)},${Math.round(c.y)}`, { kind: 'move', squad: id, x: c.x, y: c.y });
    }
  };

  const haul = (id: SquadId, bot: Bot, me: Centre, snap: Snapshot, b: Extract<Behaviour, { kind: 'haul' }>) => {
    const c = (snap.sieges ?? []).find((e) => e.id === b.cart && isCart(e));
    if (!c || c.team !== me.team) {
      bot.phase = 'lost';
      send(bot, 'hold', { kind: 'hold', squad: id });
      return;
    }
    while (bot.tries < b.path.length && Math.hypot(c.x - b.path[bot.tries][0], c.y - b.path[bot.tries][1]) <= ARRIVED) bot.tries++;
    if (bot.tries >= b.path.length) {
      bot.phase = 'arrived';
      send(bot, 'hold', { kind: 'hold', squad: id });
      return;
    }
    const [x, y] = b.path[bot.tries];
    pull(id, bot, c, x, y, `haul:${bot.tries}`);
  };

  const think = (full: Snapshot) => {
    const all = centres(full);
    const views = new Map<number, { cs: Centre[]; snap: Snapshot }>();
    for (const [id, bot] of bots) {
      const mine = all[id];
      if (!mine?.alive) continue;
      let v = views.get(mine.team);
      if (!v) views.set(mine.team, (v = viewOf(full, all, mine.team)));
      const { cs, snap } = v;
      const me = cs[id];
      const b = bot.b;
      if (b.kind === 'siegeRam') siegeRam(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'siegeLadder') siegeLadder(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'siegeArchers') siegeArchers(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'siegeBolts') siegeBolts(id, bot, me, cs, snap, b.x, b.y);

      else if (b.kind === 'assault') assault(id, bot, me, cs, snap, b.x, b.y);
      else if (b.kind === 'defendWalls') defendWalls(id, bot, me, cs, snap, b.x, b.y, b.radius ?? DEFEND_R);
      else if (b.kind === 'attackMove') attackMove(id, bot, me, cs, b.x, b.y);
      else if (b.kind === 'raider') raider(id, bot, me, cs, snap, b);
      else if (b.kind === 'escort') escort(id, bot, me, cs, snap, b.cart);
      else if (b.kind === 'haul') haul(id, bot, me, snap, b);
      else if (b.kind === 'flank') {
        if (bot.phase === 'via') {
          if (Math.hypot(b.via[0] - me.x, b.via[1] - me.y) > ARRIVED) send(bot, 'via', { kind: 'move', squad: id, x: b.via[0], y: b.via[1] });
          else bot.phase = 'march';
        }
        if (bot.phase !== 'via') attackMove(id, bot, me, cs, b.x, b.y);
      } else if (b.kind === 'hold') holdAt(id, bot, me, cs, b.x, b.y, b.radius ?? HOLD_RADIUS);
      useActive(id, bot, me, cs, snap);
    }
  };

  /** M5c: a fighting bot fires its squad active once a foe is close (missiles: in bow range). */
  const useActive = (id: SquadId, bot: Bot, me: Centre, cs: Centre[], snap: Snapshot) => {
    const a = snap.squads[id]?.active;
    if (!a || a.ready > 0 || a.on > 0 || (bot.phase !== 'fight' && bot.phase !== 'suppress' && bot.phase !== 'walls' && bot.phase !== 'in')) return;
    if (nearestEnemy(cs, me.team, me.x, me.y, a.skill === 'volley' ? ACTIVE_MISSILE : ACTIVE_MELEE) >= 0) sim.order({ kind: 'active', squad: id });
  };

  return {
    set(squad, b) {
      const start = b.kind === 'flank' ? 'via' : b.kind === 'attackMove' || b.kind === 'hold' ? 'march' : 'start';
      bots.set(squad, { b, phase: start, issued: '', target: -1, engine: -1, at: null, fire: false, brazier: -Infinity, tries: 0, cart: -1 });
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
    exportState: () => encodeGraph({ bots, ticks, memo }, new Map()),
    importState(s) {
      const r = decodeGraph(s as ReturnType<typeof encodeGraph>, new Map(), { bots, ticks, memo }) as { ticks: number };
      ticks = r.ticks;
    },
  };
}
