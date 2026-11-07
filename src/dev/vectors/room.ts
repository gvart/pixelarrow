/**
 * The region room (server/src/war/room.ts WarRoom) for the Godot port (docs/impl/godot-port.md P8): a scripted client
 * message sequence driven through the TS room headless, as the Durable Object drives it (server/src/war/regionDO.ts
 * webSocketMessage and loop) minus D1, storage and sockets, and every server message recorded. The Godot side
 * (godot/tests/sim/test_room.gd) replays the same messages into LocalRoom and matches the outbound messages exactly
 * (JSON messages as values, binary frames byte for byte).
 *
 * The local transport (what LocalRoom does in place of the DO), per client in the order each first spoke:
 *  - send(pid, msg): the message parsed as the DO parses it (parseClientMsg), then join / order / view / ping / check /
 *    dev as webSocketMessage handles them. A welcome is followed by the settlements list (sendSettlements fresh). pong
 *    carries no `ms` (wall clock) and idle is `alive() === 0` (the local loop never rests).
 *  - close(pid): his socket went away (webSocketClose: room.leave).
 *  - tick(): one room tick, then per client: his admitted message (a welcome from the line, with its settlements),
 *    his tick messages, his binary frame.
 * WarRoom is loaded through import.meta.glob so the root typecheck does not follow it into the server's D1 types.
 */
import { parseRegion } from '../../war/region/schema';
import { ALLIANCES, CAMERA_MARGIN, DEFAULT_CAP, GOODS, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, parseClientMsg, QUANT, VISION, WILD_EVERY, type ServerMsg } from '../../war/net/protocol';
import { NODES_EVERY, STORE_NEAR } from '../../war/net/economy';
import { BOSS_NEAR } from '../../war/net/interest';
import { LABOUR_EVERY } from '../../war/net/works';
import type { RegionData, Snapshot } from '../../war/types';

const files = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const server = import.meta.glob('../../../server/src/war/room.ts', { eager: true }) as Record<string, { WarRoom: new (o: Record<string, unknown>) => Room; CORPSE_TICKS: number; FIGHT_QUIET: number; HOME_CLAIM_R: number }>;
const room = Object.values(server)[0];

/** What the harness calls of WarRoom (server/src/war/room.ts). */
interface Room {
  region: RegionData;
  currentTick: number;
  refusal: string;
  join(pid: number, m: unknown, persons?: unknown): { msg: ServerMsg; admitted: boolean };
  order(pid: number, o: unknown): string | null;
  view(pid: number, r: unknown): void;
  leave(pid: number): void;
  check(pid: number, c: unknown): ServerMsg;
  dev(pid: number, m: unknown): string | null;
  alive(): number;
  settlementsFor(pid: number): unknown[];
  squadsOf(pid: number): number[];
  snapshot(): Snapshot;
  sim: { checkPlacement(team: number, type: string, x: number, y: number): { ok: boolean } };
  tick(): { frames: Map<number, Uint8Array>; msgs: Map<number, ServerMsg[]>; admitted: Map<number, ServerMsg> };
}

type Out = [number, unknown];
const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

class TsLocal {
  readonly room: Room;
  private conns: number[] = [];
  constructor(o: Record<string, unknown>) {
    this.room = new room.WarRoom({ epoch: 'e', ...o });
  }
  private conn(pid: number) {
    if (!this.conns.includes(pid)) this.conns.push(pid);
  }
  send(pid: number, raw: unknown): Out[] {
    this.conn(pid);
    const out: Out[] = [], tell = (m: unknown) => out.push([pid, m]);
    const m = parseClientMsg(JSON.stringify(raw));
    const r = this.room;
    if (!m) return tell({ t: 'error', code: 'parse' }), out;
    if (m.t === 'join') {
      const res = r.join(pid, m);
      tell(res.msg);
      if (res.msg.t === 'welcome') tell({ t: 'settlements', list: r.settlementsFor(pid) });
    } else if (m.t === 'order') {
      const err = r.order(pid, m.o);
      if (err) tell({ t: 'error', code: err, detail: err === 'notYourGround' || err === 'atPeace' ? r.refusal : m.o.kind });
    } else if (m.t === 'view') r.view(pid, m);
    else if (m.t === 'ping') tell({ t: 'pong', c: m.c, tick: r.currentTick, idle: r.alive() === 0 });
    else if (m.t === 'check') tell(r.check(pid, m));
    else if (m.t === 'dev') {
      const err = r.dev(pid, m);
      if (err) tell({ t: 'error', code: err, detail: `dev ${m.op}${err === 'forbidden' ? ': needs DEV_AUTH=1' : ''}` });
    }
    return out;
  }
  /** The socket went away (regionDO.ts webSocketClose): his squads hold where they stand. */
  close(pid: number): Out[] {
    this.room.leave(pid);
    return [];
  }
  tick(): Out[] {
    const res = this.room.tick(), out: Out[] = [];
    for (const pid of this.conns) {
      const w = res.admitted.get(pid);
      if (w) out.push([pid, w]);
      if (w?.t === 'welcome') out.push([pid, { t: 'settlements', list: this.room.settlementsFor(pid) }]);
      for (const m of res.msgs.get(pid) ?? []) out.push([pid, m]);
      const f = res.frames.get(pid);
      if (f) out.push([pid, { frame: b64(f) }]);
    }
    return out;
  }
}

/** One scripted step: a client message (made from the room as it stands) or `n` ticks. */
type Step = { pid: number; msg: (r: Room) => unknown } | { ticks: number } | { close: number };
const army = (region: string, pid: number, team: number, groups: [string, number][], v = NET_VERSION) =>
  ({ t: 'join', v, region, playerId: pid, team, army: groups.map(([cls, count]) => ({ cls, count })) });
const squad = (r: Room, pid: number, i = 0) => r.squadsOf(pid)[i];
const centre = (r: Room, sq: number) => {
  const us = r.snapshot().units.filter((u) => u.squad === sq && u.state !== 'dead');
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
};
/** The nearest tile centre round (x,y) where `team` may place `type` (a spiral out to 30 tiles). */
const spotFor = (r: Room, team: number, type: string, x: number, y: number) => {
  for (let d = 0; d < 30; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const p = { x: Math.round(x) + dx + 0.5, y: Math.round(y) + dy + 0.5 };
        if (r.sim.checkPlacement(team, type, p.x, p.y).ok) return p;
      }
  return { x: Math.round(x) + 0.5, y: Math.round(y) + 0.5 };
};
const lair = (r: Room) => (r.snapshot().lairs ?? []).find((l) => l.state !== 'cleared')!;

/** test-ridge with its lairs: joins, the line, orders and refusals, checks, dev helpers, a fight, a camp. */
function ridge(): Step[] {
  const R = 'test-ridge';
  return [
    { pid: 1, msg: () => ({ t: 'ping', c: 7 }) },
    { pid: 1, msg: () => ({ t: 'order', o: { kind: 'hold', squad: 0 } }) }, // not joined
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12]], 99) }, // wrong version
    { pid: 1, msg: () => ({ t: 'nonsense' }) }, // parse
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 10]]) },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 12]]) },
    { pid: 3, msg: () => army(R, 3, 0, [['peltast', 10]]) }, // over the quota: the line
    { pid: 2, msg: () => army(R, 2, 0, [['hoplite', 4]]) }, // already in alliance 1
    { ticks: 3 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 30, y0: c.y - 20, x1: c.x + 30, y1: c.y + 20 }; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: 190, y: 62 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: 10, y: 10 } }) }, // not his
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1), target: squad(r, 1, 1) } }) }, // his own
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: -4, y: 10 } }) }, // off the map
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'formation', squad: squad(r, 1, 1), shape: 'wedge' } }) },
    { ticks: 20 },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'wood', n: 400 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'stock', res: 'stone', n: 200 }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', x: 190, y: 66, r: 24 }) },
    { ticks: 1 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'check', id: 1, kind: 'building', type: 'camp', x: Math.round(c.x) + 0.5, y: Math.round(c.y + 8) + 0.5 }; } },
    { pid: 1, msg: (r) => ({ t: 'check', id: 4, kind: 'building', type: 'camp', ...spotFor(r, 0, 'camp', 190, 68) }) },
    { pid: 1, msg: () => ({ t: 'check', id: 2, kind: 'wall', material: 'wood', points: [182, 76, 196, 76] }) },
    { pid: 2, msg: () => ({ t: 'check', id: 3, kind: 'building', type: 'storehouse', x: 5, y: 5 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', 190, 68) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => { const s = (r.snapshot().buildings ?? []).find((b) => b.team === 0 && b.state !== 'done'); return { t: 'order', o: { kind: 'build', squad: squad(r, 1), site: s?.id ?? 0 } }; } },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 6, x: Math.round(c.x) + 9, y: Math.round(c.y) + 3 }; } }, // a foe at hand: a fight
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 1, cls: 'archer', count: 5, x: Math.round(c.x) - 10, y: Math.round(c.y) + 6 }; } }, // his own
    { pid: 2, msg: () => ({ t: 'dev', op: 'skip', ticks: 15 }) },
    { ticks: 60 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: lair(r).squad } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 2), x: centre(r, squad(r, 1)).x, y: centre(r, squad(r, 1)).y } }) },
    { pid: 1, msg: () => ({ t: 'ping', c: 8 }) },
    { ticks: 120 },
    { close: 2 }, // his squads hold
    { ticks: 140 },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 12]]) }, // a rejoin: his squads back, none spawned
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { ticks: 150 },
  ];
}

const RUNS: { id: string; region: string; seed: number; opts: Record<string, unknown>; steps: () => Step[] }[] = [
  { id: 'ridge', region: 'test-ridge', seed: 1, opts: { cap: 96, wild: true }, steps: ridge },
];

function run(r: (typeof RUNS)[number]) {
  const region = parseRegion(files[`../../war/regions/${r.region}.json`]);
  const local = new TsLocal({ region, seed: r.seed, ...r.opts });
  const steps: unknown[] = [];
  for (const s of r.steps()) {
    if ('ticks' in s) for (let i = 0; i < s.ticks; i++) steps.push({ tick: true, out: local.tick() });
    else if ('close' in s) steps.push({ close: s.close, out: local.close(s.close) });
    else {
      const msg = s.msg(local.room);
      steps.push({ pid: s.pid, msg, out: local.send(s.pid, msg) });
    }
  }
  return { id: r.id, region: r.region, seed: r.seed, opts: r.opts, steps };
}

/** The wire constants LocalRoom keeps in C++ (godot/native/src/room.h Net): protocol.ts and room.ts are no data tables. */
const consts = () => ({
  NET_VERSION, QUANT, KEYFRAME_EVERY, WILD_EVERY, VISION, CAMERA_MARGIN, MAX_SQUAD, MAX_SQUADS, DEFAULT_CAP, ALLIANCES, NODES_EVERY, STORE_NEAR, BOSS_NEAR,
  LABOUR_EVERY, CORPSE_TICKS: room.CORPSE_TICKS, FIGHT_QUIET: room.FIGHT_QUIET, HOME_CLAIM_R: room.HOME_CLAIM_R, GOODS: [...GOODS],
});

export const vectors = () => ({ consts: consts(), runs: RUNS.map(run) });
