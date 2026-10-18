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
 */
import type { Order, Snapshot, SquadId, WarSim } from '../types';

export type Behaviour =
  | { kind: 'attackMove'; x: number; y: number }
  | { kind: 'hold'; x: number; y: number; radius?: number }
  | { kind: 'flank'; via: [number, number]; x: number; y: number };

export interface Bots {
  set(squad: SquadId, b: Behaviour): void;
  clear(squad: SquadId): void;
  /** Call once per sim step; bots think every `every` ticks. */
  tick(): void;
  /** Current phase per squad, for debug overlays: 'via' | 'march' | 'fight' | 'hold' | 'done'. */
  phase(squad: SquadId): string | undefined;
}

const AGGRO = 10; // attack-move: engage enemy squads this near
const DISENGAGE = 18; // give up a chase when the target gets this far
const ARRIVED = 3;
const HOLD_RADIUS = 8;
const LEASH = 6;

interface Bot {
  b: Behaviour;
  phase: string;
  issued: string; // last order sent, to avoid re-sending it
  target: SquadId;
}

interface Centre {
  x: number;
  y: number;
  alive: number;
  team: number;
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

  const think = (snap: Snapshot) => {
    const cs = centres(snap);
    for (const [id, bot] of bots) {
      const me = cs[id];
      if (!me?.alive) continue;
      const b = bot.b;
      if (b.kind === 'attackMove') attackMove(id, bot, me, cs, b.x, b.y);
      else if (b.kind === 'flank') {
        if (bot.phase === 'via') {
          if (Math.hypot(b.via[0] - me.x, b.via[1] - me.y) > ARRIVED) send(bot, 'via', { kind: 'move', squad: id, x: b.via[0], y: b.via[1] });
          else bot.phase = 'march';
        }
        if (bot.phase !== 'via') attackMove(id, bot, me, cs, b.x, b.y);
      } else {
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
      bots.set(squad, { b, phase: b.kind === 'flank' ? 'via' : 'march', issued: '', target: -1 });
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
