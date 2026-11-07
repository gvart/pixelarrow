/**
 * The region room (server/src/war/room.ts WarRoom) for the Godot port (docs/impl/godot-port.md P8): a scripted client
 * message sequence driven through the TS room headless, as the Durable Object drives it (server/src/war/regionDO.ts
 * webSocketMessage and loop) minus D1, storage and sockets, and every server message recorded. The Godot side
 * (godot/tests/sim/test_room.gd) replays the same messages into LocalRoom and matches the outbound messages exactly
 * (JSON messages as values, binary frames byte for byte).
 *
 * The local transport (what LocalRoom does in place of the DO), per client in the order each first spoke:
 *  - send(pid, msg): the message parsed as the DO parses it (parseClientMsg), then join / order / view / ping / check /
 *    dev / guide / story / encounter as webSocketMessage handles them. A welcome is followed by the world events (once
 *    any were set), the settlements list (sendSettlements fresh), then his guide, story and encounters (guideStart,
 *    storyStart, encounterStart; masteryStart is D1's). pong carries no `ms` (wall clock) and idle is `alive() === 0`.
 *  - close(pid): his socket went away (webSocketClose: room.leave).
 *  - tick(): one room tick, then per client: his admitted message (a welcome from the line, then his guide, story,
 *    encounters and the settlements), his tick messages, his binary frame. What the DO books of the tick (guided,
 *    storied, met, wild, gathered, warlord) is recorded with it, the saves kept in a local store (D1 and DO storage's
 *    stand-in: the guide's, story's and encounter's per player, as the DO writes them).
 *  - world(events, next, now): the world's RPC (worldEvents): applyEvents (the events running here now onto the room, a
 *    guardian woken once per boss wake), every client told.
 * WarRoom is loaded through import.meta.glob so the root typecheck does not follow it into the server's D1 types.
 */
import { parseRegion } from '../../war/region/schema';
import { ALLIANCES, CAMERA_MARGIN, DEFAULT_CAP, GOODS, KEYFRAME_EVERY, MAX_SQUAD, MAX_SQUADS, NET_VERSION, parseClientMsg, QUANT, VISION, WILD_EVERY, type ServerMsg } from '../../war/net/protocol';
import { NODES_EVERY, STORE_NEAR } from '../../war/net/economy';
import { BOSS_NEAR } from '../../war/net/interest';
import { LABOUR_EVERY } from '../../war/net/works';
import type { RegionData, Snapshot } from '../../war/types';
import type { WorldEvent } from '../../war/world/events';

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
  tick(): { frames: Map<number, Uint8Array>; msgs: Map<number, ServerMsg[]>; admitted: Map<number, ServerMsg> } & Books;
  startGuide(pid: number, save: unknown): ServerMsg | null;
  startStory(pid: number, save: unknown): ServerMsg | null;
  startEncounters(pid: number, save: unknown): ServerMsg | null;
  storyChoose(pid: number, option: string): void;
  encounterChoose(pid: number, option: string): void;
  guide: { hide(pid: number): unknown; saveOf(pid: number): unknown };
  encounters: { road(pid: number, loads: number, key: string): void };
  setWorldEvents(evs: WorldEvent[]): void;
  wakeGuardians(): void;
  setWarlordAge(days: number): void;
  warlordMemory(): unknown;
  recallWarlords(m: unknown): void;
  memory(): unknown;
  recall(m: unknown, elapsed: number): void;
  summary(): unknown;
  present(): number;
}

/** What the DO books of a tick (room.ts tick). */
interface Books {
  guided: { pid: number; save: unknown }[];
  storied: { pid: number; save: unknown }[];
  met: { pid: number; save: unknown }[];
  wild: unknown[];
  gathered: unknown[];
  warlord: unknown[];
}
const BOOKS = ['guided', 'storied', 'met', 'wild', 'gathered', 'warlord'] as const;

type Out = [number, unknown];
const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

class TsLocal {
  readonly room: Room;
  private conns: number[] = [];
  /** The local store: each player's saves as the DO keeps them (D1 guide, DO storage story and encounter). */
  private saves = { guide: new Map<number, unknown>(), story: new Map<number, unknown>(), encounter: new Map<number, unknown>() };
  private worldEv: { events: WorldEvent[]; next: WorldEvent | null } | null = null;
  private woke: number | null = null;
  books: Partial<Books> | null = null;
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
      if (res.msg.t === 'welcome' && this.worldEv) tell({ t: 'worldEvents', ...this.worldEv }); // W-62
      if (res.msg.t === 'welcome') tell({ t: 'settlements', list: r.settlementsFor(pid) }); // W-63
      if (res.msg.t === 'welcome') this.welcomed(pid, tell);
    } else if (m.t === 'order') {
      const err = r.order(pid, m.o);
      if (err) tell({ t: 'error', code: err, detail: err === 'notYourGround' || err === 'atPeace' ? r.refusal : m.o.kind });
    } else if (m.t === 'view') r.view(pid, m);
    else if (m.t === 'ping') tell({ t: 'pong', c: m.c, tick: r.currentTick, idle: r.alive() === 0 });
    else if (m.t === 'check') tell(r.check(pid, m));
    else if (m.t === 'dev') {
      const err = r.dev(pid, m);
      if (err) tell({ t: 'error', code: err, detail: `dev ${m.op}${err === 'forbidden' ? ': needs DEV_AUTH=1' : ''}` });
    } else if (m.t === 'guide') {
      const g = r.guide.hide(pid);
      if (g) this.saves.guide.set(pid, g);
    } else if (m.t === 'story') r.storyChoose(pid, m.option); // W-65
    else if (m.t === 'encounter') r.encounterChoose(pid, m.option); // W-65
    return out;
  }
  /** regionDO.ts guideStart, storyStart, encounterStart, each from the local store. */
  private welcomed(pid: number, tell: (m: unknown) => void) {
    const r = this.room, save = this.saves.guide.get(pid) ?? null;
    const g = r.startGuide(pid, save);
    const fresh = save ? null : r.guide.saveOf(pid); // W-79: kept at once, so the rations are packed only once
    if (fresh) this.saves.guide.set(pid, fresh);
    if (g) tell(g);
    const st = r.startStory(pid, this.saves.story.get(pid) ?? null);
    if (st) tell(st);
    const en = r.startEncounters(pid, this.saves.encounter.get(pid) ?? null);
    if (en) tell(en);
  }
  /** The world's RPC (regionDO.ts worldEvents and applyEvents). */
  world(events: WorldEvent[], next: WorldEvent | null, now: number): Out[] {
    this.worldEv = { events, next };
    const mine = events.filter((e) => e.region === this.room.region.id && e.startAt <= now && now < e.endAt);
    this.room.setWorldEvents(mine);
    const wake = mine.find((e) => e.kind === 'bossWake');
    if (wake && this.woke !== wake.startAt) {
      this.room.wakeGuardians();
      this.woke = wake.startAt;
    }
    return this.conns.map((pid) => [pid, { t: 'worldEvents', events, next }]);
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
      if (w?.t === 'welcome') this.welcomed(pid, (m) => out.push([pid, m])); // W-62, W-65: in from the line
      if (w?.t === 'welcome') out.push([pid, { t: 'settlements', list: this.room.settlementsFor(pid) }]); // W-63
      for (const m of res.msgs.get(pid) ?? []) out.push([pid, m]);
      const f = res.frames.get(pid);
      if (f) out.push([pid, { frame: b64(f) }]);
    }
    // what the DO books (regionDO.ts outputs): the saves into the local store, the rest recorded
    for (const g of res.guided) this.saves.guide.set(g.pid, g.save);
    for (const g of res.storied) this.saves.story.set(g.pid, g.save);
    for (const g of res.met) this.saves.encounter.set(g.pid, g.save);
    const books: Partial<Books> = {};
    for (const k of BOOKS) if (res[k].length) (books as Record<string, unknown>)[k] = res[k];
    this.books = Object.keys(books).length ? books : null;
    return out;
  }
}

/**
 * One scripted step: a client message (made from the room as it stands), `n` ticks, a socket closed, the world's
 * events, the warlords' age, a road crossed (W-197: robbers?), or a look at the room: its memory (and a recall of the
 * last one, `recall` ticks later), its summary, the warlords' memory (and a recall of it).
 */
type Step =
  | { pid: number; msg: (r: Room) => unknown }
  | { ticks: number }
  | { close: number }
  | { world: { events: WorldEvent[]; next: WorldEvent | null; now: number } }
  | { age: number }
  | { road: { pid: number; loads: number; key: string } }
  | { look: 'memory' | 'summary' | 'lords' }
  | { recall: number }
  | { recallLords: true };
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

/**
 * Elaia, the home of alliance 0 (W-62 the guide): new players' guides (their rations packed, the guide's camp woken; a
 * full army closes the soul step unpaid, a small one wakes the guide's soul), his men at the camp (the lair step,
 * paid), the guide hidden and his save kept; a player of another alliance has none. The wild's deeds (a lair cleared
 * near his men).
 */
function home(): Step[] {
  const R = 'elaia';
  const at = (r: Room) => (r.snapshot().lairs ?? []).filter((l) => l.kind === 'bandit').at(-1)!; // the guide's camp, woken last
  return [
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 12], ['hoplite', 12]]) }, // a full army: the soul step unpaid
    { pid: 2, msg: () => army(R, 2, 1, [['peltast', 8]]) }, // not of the home alliance: no guide
    { pid: 3, msg: () => army(R, 3, 0, [['hoplite', 3]]) }, // a new player of the home alliance, under his cap: the guide's soul woken (its camp stands)
    { ticks: 2 },
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    ...[0, 1, 2].map((i): Step => ({ pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, i), target: at(r).squad } }) })),
    { ticks: 20 },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { ticks: 30 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1), x: at(r).x, y: at(r).y } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) },
    { ticks: 60 },
    { pid: 1, msg: () => ({ t: 'guide', op: 'hide' }) },
    { pid: 1, msg: () => ({ t: 'story', op: 'choose', option: 'none' }) }, // no story here: nothing
    { close: 1 },
    { ticks: 5 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 4]]) }, // back: his hidden guide's save
    { ticks: 5 },
    { look: 'summary' },
  ];
}

/**
 * Elaia North (Kelaino's domain, W-72 proposal; the story "Bones in the Reeds", W-65): the warlords aged and thinking
 * with players in, their feed and notes, the story started and stepped, an encounter run, robbers on the road (W-197),
 * his men falling while he is away (W-221: told once he is back), the summary, the warlords' memory and its recall.
 */
function north(): Step[] {
  const R = 'elaia-n';
  // his run's spots (where the giver and the first marks stand, as the runner snapped them)
  const spots = (r: Room) => (r as unknown as { stories: { runs: Map<number, { run: { spots: { giver: { x: number; y: number }; steps: Record<string, { x: number; y: number }[]> } } }> } }).stories.runs.get(1)!.run.spots;
  return [
    { age: 40 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 12]]) },
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 10]]) },
    { ticks: 30 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), ...spots(r).giver } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1, 1), ...spots(r).giver } }) },
    { pid: 1, msg: () => ({ t: 'story', op: 'choose', option: 'nope' }) }, // no choice open: nothing
    { pid: 1, msg: () => ({ t: 'encounter', op: 'choose', option: 'nope' }) },
    { ticks: 20 },
    ...[1, 2, 3, 4, 5].map((): Step => ({ pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 600 }) })),
    { ticks: 30 },
    { road: { pid: 1, loads: 5, key: 'elaia-n:S:1' } },
    { road: { pid: 1, loads: 5, key: 'elaia-n:S:2' } },
    ...[3, 4, 5, 6, 7, 8].map((k): Step => ({ road: { pid: 1, loads: 5, key: `elaia-n:S:${k}` } })),
    { ticks: 60 },
    { pid: 1, msg: () => ({ t: 'encounter', op: 'choose', option: 'pay' }) }, // the robbers' toll
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), ...spots(r).steps.poles[0] } }) },
    { pid: 1, msg: () => ({ t: 'dev', op: 'skip', ticks: 400 }) },
    { ticks: 60 },
    { look: 'lords' },
    { look: 'summary' },
    { close: 1 },
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 12, x: Math.round(c.x) + 3, y: Math.round(c.y) + 2 }; } }, // his men fall while he is away
    { ticks: 150 },
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 4]]) }, // back: what befell them
    { ticks: 20 },
    { age: 41 },
    { recallLords: true },
    { ticks: 30 },
    { look: 'summary' },
  ];
}

const T0 = 1_000_000;
const ev = (id: number, kind: string, region: string, from: number, to: number) => ({ id, kind, region, startAt: T0 + from, endAt: T0 + to }) as WorldEvent;

/**
 * The Moors (W-62 world events): a soul storm and a boss wake running here (the guardian woken once, stronger), an event
 * elsewhere and one to come (not applied), told to every client and to a player on his welcome; the region's memory
 * (M7f) taken and recalled later, and its summary.
 */
function moors(): Step[] {
  const R = 'moors';
  const evs = [ev(1, 'soulStorm', R, 0, 600_000), ev(2, 'bossWake', R, -1000, 600_000), ev(3, 'soulStorm', 'elaia-n', 0, 600_000), ev(4, 'bossWake', R, 700_000, 900_000)];
  return [
    { pid: 1, msg: () => army(R, 1, 0, [['hoplite', 12], ['archer', 10]]) },
    { ticks: 10 },
    { world: { events: evs, next: ev(5, 'soulStorm', 'kimmeria', 900_000, 1_200_000), now: T0 } },
    { world: { events: evs, next: null, now: T0 + 1 } }, // the same wake: woken once
    { pid: 2, msg: () => army(R, 2, 1, [['hoplite', 10]]) }, // told the events on his welcome
    { pid: 1, msg: () => ({ t: 'view', x0: 0, y0: 0, x1: 511, y1: 511 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1), x: 169, y: 93 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attackMove', squad: squad(r, 1, 1), x: 169, y: 93 } }) },
    { ticks: 200 },
    { look: 'memory' },
    { look: 'summary' },
    { world: { events: [], next: null, now: T0 + 700_000 } }, // the storm over
    { ticks: 100 },
    { recall: 300 },
    { ticks: 50 },
    { look: 'memory' },
    { look: 'summary' },
  ];
}

const RUNS: { id: string; region: string; seed: number; opts: Record<string, unknown>; steps: () => Step[] }[] = [
  { id: 'ridge', region: 'test-ridge', seed: 1, opts: { cap: 96, wild: true }, steps: ridge },
  { id: 'home', region: 'elaia', seed: 3, opts: { cap: 400, wild: true, home: 0 }, steps: home },
  { id: 'north', region: 'elaia-n', seed: 5, opts: { cap: 400, wild: true, warlords: true }, steps: north },
  { id: 'moors', region: 'moors', seed: 9, opts: { cap: 400, wild: true }, steps: moors },
];

function run(r: (typeof RUNS)[number]) {
  const region = parseRegion(files[`../../war/regions/${r.region}.json`]);
  const local = new TsLocal({ region, seed: r.seed, ...r.opts });
  const steps: unknown[] = [];
  // each step as it stood (a message holds the run's live save, mutated by the ticks after it)
  const push = (x: unknown) => steps.push(structuredClone(x));
  let memory: unknown = null, lords: unknown = null;
  for (const s of r.steps()) {
    if ('ticks' in s)
      for (let i = 0; i < s.ticks; i++) {
        const out = local.tick();
        push({ tick: true, out, ...(local.books ? { books: local.books } : {}) });
      }
    else if ('close' in s) push({ close: s.close, out: local.close(s.close) });
    else if ('world' in s) push({ world: s.world, out: local.world(s.world.events, s.world.next, s.world.now) });
    else if ('age' in s) (local.room.setWarlordAge(s.age), push({ age: s.age, out: [] }));
    else if ('road' in s) (local.room.encounters.road(s.road.pid, s.road.loads, s.road.key), push({ road: s.road, out: [] }));
    else if ('look' in s) {
      const got = s.look === 'memory' ? local.room.memory() : s.look === 'summary' ? local.room.summary() : local.room.warlordMemory();
      if (s.look === 'memory') memory = got;
      if (s.look === 'lords') lords = got;
      const snap = local.room.snapshot(); // the guardians (a boss wake's hp) and the souls (a storm's) as they stand
      push({ look: s.look, got, present: local.room.present(), bosses: snap.bosses ?? [], souls: (snap.souls ?? []).length, out: [] });
    } else if ('recall' in s) {
      // the region left with its guardians slain, back in 900 ticks: `recall` ticks later they still wait
      const m = { ...(memory as { guardians: { state: string; left: number }[] }) };
      m.guardians = m.guardians.map((g) => ({ ...g, state: 'slain', left: 900 }));
      local.room.recall(m, s.recall);
      push({ recall: m, elapsed: s.recall, out: [] });
    }
    else if ('recallLords' in s) (local.room.recallWarlords(lords), push({ recallLords: lords, out: [] }));
    else {
      const msg = s.msg(local.room);
      push({ pid: s.pid, msg, out: local.send(s.pid, msg) });
    }
  }
  return { id: r.id, region: r.region, seed: r.seed, opts: r.opts, steps };
}

/** The wire constants LocalRoom keeps in C++ (godot/native/src/room.h Net): protocol.ts and room.ts are no data tables. */
const consts = () => ({
  NET_VERSION, QUANT, KEYFRAME_EVERY, WILD_EVERY, VISION, CAMERA_MARGIN, MAX_SQUAD, MAX_SQUADS, DEFAULT_CAP, ALLIANCES, NODES_EVERY, STORE_NEAR, BOSS_NEAR,
  LABOUR_EVERY, CORPSE_TICKS: room.CORPSE_TICKS, FIGHT_QUIET: room.FIGHT_QUIET, HOME_CLAIM_R: room.HOME_CLAIM_R, GOODS: [...GOODS],
});

/**
 * parseClientMsg (src/war/net/protocol.ts, the zod schema) on raw messages: the parsed message as it comes out (unknown
 * keys stripped, keys in schema order) or null. Every message kind, its bounds and refinements, the unions' order and
 * the length cap (JSON.stringify's UTF-16 units).
 */
const PARSE: unknown[] = [
  { t: 'ping', c: 1 }, { t: 'ping', c: 1.5, extra: 2 }, { t: 'ping' }, { t: 'ping', c: '1' }, { t: 'ping', c: null }, { c: 1 }, { t: 'pong', c: 1 }, null, 7, 'join', [], [{ t: 'ping', c: 1 }],
  army('elaia', 1, 0, [['hoplite', 12]]), { ...army('elaia', 1, 0, [['hoplite', 12]]), extra: true, region: 'elaia' },
  army('elaia', 1, 4, [['hoplite', 12]]), army('elaia', 0, 0, [['hoplite', 12]]), army('elaia', 1.5, 0, [['hoplite', 12]]), army('Elaia', 1, 0, [['hoplite', 12]]),
  army('elaia', 1, 0, [['hoplite', 0]]), army('elaia', 1, 0, [['hoplite', 12], ['archer', 3], ['peltast', 2], ['hoplite', 1]]), army('elaia', 1, 0, []),
  army('elaia', 1, 0, [['Hoplite', 2]]), { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0 }, { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [['p1', 'p2'], ['p3']] },
  { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [[]] }, { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, squads: [['bad id']] },
  { t: 'join', v: 28, region: 'elaia', playerId: 1, team: 0, army: null }, { t: 'join', v: 2 ** 53, region: 'elaia', playerId: 1, team: 0 },
  { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2 } }, { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2, units: [3, 1], junk: 1 } }, { t: 'order', o: { kind: 'move', squad: -1, x: 1, y: 2 } },
  { t: 'order', o: { kind: 'move', squad: 2 ** 31 + 1, x: 1, y: 2 } }, { t: 'order', o: { kind: 'move', squad: 0, x: 1 } }, { t: 'order', o: { kind: 'fly', squad: 0 } }, { t: 'order', o: {} }, { t: 'order' },
  { t: 'order', o: { kind: 'move', squad: 0, x: 1, y: 2, units: [] } }, { t: 'order', o: { kind: 'formation', squad: 1, shape: 'wedge' } }, { t: 'order', o: { kind: 'formation', squad: 1, shape: 'box' } },
  { t: 'order', o: { kind: 'detach', squad: 1, count: 3, unitIds: [4, 5] } }, { t: 'order', o: { kind: 'detach', squad: 1, count: 0 } }, { t: 'order', o: { kind: 'man', squad: 1, unit: 2, act: 'rear' } },
  { t: 'order', o: { kind: 'placeBuilding', type: 'camp', x: 3.5, y: 4.5, rot: 1 } }, { t: 'order', o: { kind: 'placeBuilding', type: 'camp', x: 3.5, y: 4.5, rot: 2 } }, { t: 'order', o: { kind: 'placeBuilding', type: 'castle', x: 3.5, y: 4.5 } },
  { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3, 4], towers: [1, 2] } }, { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3] } }, { t: 'order', o: { kind: 'placeWall', material: 'wood', points: [1, 2, 3, 4], inside: [1, 2, 3, 4] } },
  { t: 'order', o: { kind: 'placeBridge', material: 'stone', points: [1, 2, 3, 4], width: 3 } }, { t: 'order', o: { kind: 'placeBridge', material: 'stone', points: [1, 2, 3, 4], width: 4 } },
  { t: 'order', o: { kind: 'setAccess', building: 3, access: 'public', share: 0.5, fee: 10 } }, { t: 'order', o: { kind: 'setAccess', building: 3, share: 1.5 } },
  { t: 'order', o: { kind: 'craft', building: 3, recipe: 'bread' } }, { t: 'order', o: { kind: 'craft', building: 3, recipe: 'iron_sword:t2' } }, { t: 'order', o: { kind: 'craft', building: 3, recipe: 'Bread!' } },
  { t: 'order', o: { kind: 'raiseLadder', squad: 1, wallTile: [3, 4] } }, { t: 'order', o: { kind: 'raiseLadder', squad: 1, wallTile: [] } },
  { t: 'order', o: { kind: 'attackBuilding', squad: 1, building: 3 } }, { t: 'order', o: { kind: 'attackBuilding', squad: 1, siege: 3 } }, { t: 'order', o: { kind: 'attackBuilding', squad: 1 } }, { t: 'order', o: { kind: 'ignite', squad: 1, building: 3, siege: 4 } },
  { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, res: 'wood', n: 5, send: true } }, { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, n: 0 } }, { t: 'order', o: { kind: 'load', squad: 1, from: { building: 3 }, send: false } },
  { t: 'order', o: { kind: 'unload', squad: 1, to: { cart: 2 }, res: 'gold' } }, { t: 'order', o: { kind: 'salvagePile', squad: 1, pile: 2, uid: 'abc' } }, { t: 'order', o: { kind: 'salvagePile', squad: 1, pile: 2, uid: '' } },
  { t: 'order', o: { kind: 'buildSiege', squad: 1, type: 'ram', x: 1, y: 2 } }, { t: 'order', o: { kind: 'fireArrows', squad: 1, on: 1 } }, { t: 'order', o: { kind: 'gather', squad: 1, node: 4, cart: 2 } },
  { t: 'view', x0: 0, y0: 0, x1: 10, y1: 10 }, { t: 'view', x0: 0, y0: 0, x1: 10 },
  { t: 'check', id: 1, kind: 'building', type: 'camp', x: 3.5, y: 4.5 }, { t: 'check', id: 1, kind: 'wall', material: 'stone', points: [1, 2, 3, 4], gates: [2, 3] }, { t: 'check', id: 1, kind: 'bridge', material: 'wood', points: [1, 2] },
  { t: 'check', id: 1, kind: 'tower', x: 1, y: 2 }, { t: 'check', id: -1, kind: 'building', type: 'camp', x: 3.5, y: 4.5 },
  { t: 'dev', op: 'stock', res: 'wood', n: 400 }, { t: 'dev', op: 'stock', res: 'wood', n: 0 }, { t: 'dev', op: 'stock', res: 'nothing', n: 4 }, { t: 'dev', op: 'claim', x: 1, y: 2, r: 64 }, { t: 'dev', op: 'claim', x: 1, y: 2, r: 65 },
  { t: 'dev', op: 'spawn', team: 2, cls: 'hoplite', count: 6, x: 1, y: 2 }, { t: 'dev', op: 'skip', ticks: 600 }, { t: 'dev', op: 'skip', ticks: 601 }, { t: 'dev', op: 'fly' },
  { t: 'mend', kind: 'repair', building: 3, uid: 'u1' }, { t: 'mend', kind: 'melt', building: 3, uid: 'u1' },
  { t: 'stow', dir: 'in', site: 'stall', goods: { wood: 4, coin: 2 }, uids: ['a'] }, { t: 'stow', dir: 'in', site: 'stall', goods: { wood: 4, gold: 2 } }, { t: 'stow', dir: 'in', site: 'stall', goods: { wood: -1 } },
  { t: 'stow', dir: 'out', site: 'contract', contract: 3, of: 2, squad: 1, cart: 4 },
  { t: 'handoff', op: 'offer', with: 2, goods: { food: 3 } }, { t: 'handoff', op: 'offer', with: 0 },
  { t: 'npc', op: 'sell', res: 'wood', n: 4 }, { t: 'npc', op: 'hire', cls: 'civ_porter' }, { t: 'npc', op: 'hire', cls: 'porter' }, { t: 'npc', op: 'cart', cart: 'wagon' },
  { t: 'board', op: 'take', entry: 'a.b1', job: 3 }, { t: 'board', op: 'take', entry: 'A' },
  { t: 'guide', op: 'hide' }, { t: 'guide', op: 'show' }, { t: 'story', op: 'choose', option: 'help-her' }, { t: 'story', op: 'choose', option: '' }, { t: 'encounter', op: 'choose', option: 'pay_1' }, { t: 'encounter', op: 'choose' },
  { t: 'ping', c: 1, pad: 'x'.repeat(4100) }, { t: 'ping', c: 1, pad: 'é'.repeat(4060) }, { t: 'ping', c: 1, pad: '😀'.repeat(2040) },
];
const parseCases = () => PARSE.map((raw) => ({ raw, got: parseClientMsg(JSON.stringify(raw)) }));

export const vectors = () => ({ consts: consts(), parse: parseCases(), runs: RUNS.map(run) });
