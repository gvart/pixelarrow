/**
 * The region room (server/src/war/room.ts WarRoom) for the Godot port (docs/impl/godot-port.md P8): a scripted client
 * message sequence driven through the TS room headless, as the Durable Object drives it (server/src/war/regionDO.ts
 * webSocketMessage and loop) minus sockets, with the DO's D1 books held by the local store (../roomStore.ts), and every
 * server message recorded. The Godot side (godot/tests/sim/test_room.gd) replays the same messages into LocalRoom and
 * matches the outbound messages exactly (JSON messages as values, binary frames byte for byte), the room's books of
 * each tick (fights, soul claims, raids, faded souls, larder draws), the results of the room calls the DO and the world
 * make (transfers, musters, hires, level-ups, paths, saves and restores) and the store as it changes.
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
import type { BuildingType, FightReport, RegionData, Snapshot, WarBuildSim, WarPerson } from '../../war/types';
import type { PlayerPath } from '../../war/world/start';
import { makePerson } from '../../war/sim/roster';
import { RoomStore, type Soul } from '../roomStore';

type Sha = (b: string) => string;
const files = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const server = import.meta.glob('../../../server/src/war/room.ts', { eager: true }) as Record<string, {
  WarRoom: (new (o: Record<string, unknown>) => Room) & { restore(o: Record<string, unknown>, st: unknown, persons: ReadonlyMap<string, WarPerson>): Room };
  CORPSE_TICKS: number; FIGHT_QUIET: number; HOME_CLAIM_R: number;
}>;
const room = Object.values(server)[0];

/** What the harness calls of WarRoom (server/src/war/room.ts). */
interface Room {
  region: RegionData;
  currentTick: number;
  refusal: string;
  run: string;
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
  spawnsNew(pid: number): boolean;
  personsHere(): Set<string>;
  takeReleased(): string[];
  setPath(pid: number, way: PlayerPath): void;
  setArmy(pid: number, n: number): void;
  setLarder(pid: number, goods: Record<string, number>): void;
  depart(pid: number, side: string, foeRadius: number): { fight?: { id: string; report: FightReport }; ids?: string[] } & Record<string, unknown>;
  arrive(pid: number, team: number, persons: WarPerson[], side: string, lost?: Record<string, number>, cargo?: unknown): Record<string, unknown> & { msg?: ServerMsg | null };
  muster(pid: number, persons: WarPerson[]): { msg: ServerMsg | null } | null;
  hired(pid: number, persons: WarPerson[]): { msg: ServerMsg | null } | null;
  levelUp(id: string, attrs: Record<string, number>, skill?: string): string;
  saveState(): Record<string, unknown>;
  sim: WarBuildSim;
  tick(): {
    frames: Map<number, Uint8Array>; msgs: Map<number, ServerMsg[]>; admitted: Map<number, ServerMsg>;
    fights: { id: string; report: FightReport }[]; souls: { pid: number; person: WarPerson; squad: number; unit: number }[]; raided: number[]; faded: string[];
    larder: { pid: number; goods: Record<string, number> }[];
  };
}

type Out = [number, unknown];
const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
/** The room's clock in ms (regionDO.ts TICK_MS a tick): what the store's timers read. */
const TICK_MS = 100;

/**
 * The local transport and the Durable Object's books round the room (regionDO.ts), on the local store: a persons join
 * claims its men first (claimForJoin; refused: released), a welcome sets his path, army and larder and musters his men
 * off the field (W-98); each tick's fights, faded souls, raids, soul claims and larder draws go to the store as the DO
 * writes them to D1; dropped joins are released on a close and a restore.
 */
class TsLocal {
  room: Room;
  readonly store = new RoomStore();
  private conns: number[] = [];
  private saved = '';
  private readonly o: Record<string, unknown>;
  constructor(o: Record<string, unknown>) {
    this.o = { epoch: 'e', ...o };
    this.room = new room.WarRoom(this.o);
    this.room.run = 'r';
  }
  private get now() {
    return this.room.currentTick * TICK_MS;
  }
  /** regionDO.ts wakeIn: a named soul wakes in this room's sim (false: no shrine here). */
  private wake = (s: Soul) => this.room.sim.spawnNamedSoul(s.person, Math.ceil(s.lifeMs / TICK_MS), s.bar ? { owner: `p:${s.bar.pid}`, ticks: Math.ceil(s.bar.ms / TICK_MS) } : undefined);
  private conn(pid: number) {
    if (!this.conns.includes(pid)) this.conns.push(pid);
  }
  private flush() {
    this.store.release(this.room.region.id, this.room.takeReleased());
  }
  /** regionDO.ts muster: his men off the field here fall in (no room: they stay claimed, off the field). */
  private muster(pid: number, out: Out[]) {
    const r = this.room, here = r.personsHere(), ids = this.store.offField(pid, r.region.id, here, this.now, this.wake);
    if (!ids.length) return;
    const got = this.store.claimForJoin(pid, r.region.id, [ids], here, this.now, this.wake);
    if (typeof got === 'string') return;
    const m = r.muster(pid, got[0]);
    if (m?.msg) out.push([pid, m.msg]);
  }
  send(pid: number, raw: unknown): Out[] {
    this.conn(pid);
    const out: Out[] = [], tell = (m: unknown) => out.push([pid, m]);
    const m = parseClientMsg(JSON.stringify(raw));
    const r = this.room, region = r.region.id;
    if (!m) return tell({ t: 'error', code: 'parse' }), out;
    if (m.t === 'join') {
      let persons: WarPerson[][] | undefined;
      if (m.squads && m.region === region && r.spawnsNew(pid)) {
        const got = this.store.claimForJoin(pid, region, m.squads, r.personsHere(), this.now, this.wake);
        if (typeof got === 'string') return tell({ t: 'refused', reason: 'army', detail: got }), out;
        persons = got;
      }
      const res = r.join(pid, m, persons);
      tell(res.msg);
      if (res.msg.t === 'welcome') tell({ t: 'settlements', list: r.settlementsFor(pid) });
      if (res.msg.t === 'refused' && persons) this.store.release(region, m.squads!.flat());
      if (res.msg.t === 'welcome') {
        r.setPath(pid, this.store.path(pid));
        r.setArmy(pid, this.store.armyCount(pid));
        r.setLarder(pid, this.store.goodsOf(pid));
        this.muster(pid, out);
      }
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
    this.flush();
    return [];
  }
  /** One room tick: the tick's books into the store (regionDO.ts outputs), then per client his messages and frame. */
  tick(): { out: Out[]; room?: unknown } {
    const r = this.room, res = r.tick(), out: Out[] = [], region = r.region.id, s = this.store;
    for (const f of res.fights) {
      s.applyFight(f.id, region, f.report, this.now);
      for (const pid of new Set(f.report.persons.filter((x) => x.state === 'captive').map((x) => Number(x.owner.slice(2))))) r.setArmy(pid, s.armyCount(pid));
    }
    for (const id of res.faded) s.fade(id);
    s.freeRaided(region, res.raided, this.now, this.wake);
    for (const c of res.souls) {
      if (!s.claimSoul(c.pid, c.person, region)) r.sim.dropPersons([c.person.id]);
      r.setArmy(c.pid, s.armyCount(c.pid));
    }
    for (const { pid, goods } of res.larder) {
      s.take(pid, goods);
      r.setLarder(pid, s.goodsOf(pid));
    }
    for (const pid of this.conns) {
      const w = res.admitted.get(pid);
      if (w) out.push([pid, w]);
      if (w?.t === 'welcome') out.push([pid, { t: 'settlements', list: this.room.settlementsFor(pid) }]);
      for (const m of res.msgs.get(pid) ?? []) out.push([pid, m]);
      const f = res.frames.get(pid);
      if (f) out.push([pid, { frame: b64(f) }]);
    }
    const books = { fights: res.fights, souls: res.souls.map((c) => ({ pid: c.pid, person: c.person.id, squad: c.squad, unit: c.unit })), raided: res.raided, faded: res.faded, larder: res.larder };
    return { out, ...(Object.values(books).some((v) => v.length) ? { room: books } : {}) };
  }
  /** A call the DO (or the world) makes on the room, or a store seed; its result. */
  call(op: string, a: unknown[], sha: Sha): { res: unknown; out: Out[] } {
    const r = this.room, s = this.store, region = r.region.id, out: Out[] = [];
    const persons = (ids: string[]) => ids.map((id) => structuredClone(s.recs.find((x) => x.id === id)!.person));
    if (op === 'seed') {
      const [pid, ps, goods, at] = a as [number, WarPerson[], Record<string, number> | null, string | null];
      for (const p of ps) s.add(pid, p, at);
      if (goods) s.goods.set(pid, { ...goods });
      return { res: null, out };
    }
    if (op === 'depart') {
      const res = r.depart(...(a as [number, string, number]));
      if (res.fight) s.applyFight(res.fight.id, region, res.fight.report, this.now);
      if (res.ids) s.release(region, res.ids);
      return { res, out };
    }
    if (op === 'arrive') {
      const [pid, team, ids, side, lost, cargo] = a as [number, number, string[], string, Record<string, number>, unknown];
      const { msg, ...res } = r.arrive(pid, team, persons(ids), side, lost, cargo ?? undefined);
      if (!('error' in res)) for (const id of ids) s.recs.find((x) => x.id === id)!.region = region;
      if (msg) out.push([pid, msg]);
      return { res, out };
    }
    if (op === 'muster') return this.muster(a[0] as number, out), { res: null, out };
    if (op === 'hired') {
      const [pid, ids] = a as [number, string[]];
      const got = s.claimForJoin(pid, region, [ids], r.personsHere(), this.now, this.wake);
      if (typeof got === 'string') return { res: got, out };
      const res = r.hired(pid, got[0]);
      if (res?.msg) out.push([pid, res.msg]);
      return { res: res === null ? null : 'ok', out };
    }
    if (op === 'levelUp') return { res: r.levelUp(a[0] as string, a[1] as Record<string, number>, (a[2] as string | null) ?? undefined), out };
    if (op === 'setPath') {
      s.paths.set(a[0] as number, a[1] as PlayerPath);
      r.setPath(a[0] as number, a[1] as PlayerPath);
      return { res: null, out };
    }
    if (op === 'spawnSoul') return { res: r.sim.spawnSoul(...(a as [number, number, string, number])), out };
    if (op === 'save') {
      const st = r.saveState(), { sim, bots, ...head } = st;
      this.saved = JSON.stringify(st);
      return { res: { sha: sha(this.saved), len: this.saved.length, head, sim: sha(JSON.stringify(sim)), bots: sha(JSON.stringify(bots)) }, out };
    }
    if (op === 'restore') {
      const st = JSON.parse(this.saved) as { pids: string[] };
      this.room = room.WarRoom.restore(this.o, st, s.deployed(region, st.pids));
      this.flush();
      return { res: null, out };
    }
    throw new Error(`unknown op ${op}`);
  }
}

/** One scripted step: a client message (made from the room as it stands), `n` ticks, a close, or a call (TsLocal.call). */
type Step = { pid: number; msg: (r: Room) => unknown } | { ticks: number } | { close: number } | { op: string; args: (r: Room, s: RoomStore) => unknown[] };
const army = (region: string, pid: number, team: number, groups: [string, number][], v = NET_VERSION) =>
  ({ t: 'join', v, region, playerId: pid, team, army: groups.map(([cls, count]) => ({ cls, count })) });
const squads = (region: string, pid: number, team: number, ids: string[][]) => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, squads: ids });
const squad = (r: Room, pid: number, i = 0) => r.squadsOf(pid)[i];
const centre = (r: Room, sq: number) => {
  const us = r.snapshot().units.filter((u) => u.squad === sq && u.state !== 'dead');
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
};
/** The nearest tile centre round (x,y) where `team` may place `type` (a spiral out to 30 tiles). */
const spotFor = (r: Room, team: number, type: BuildingType, x: number, y: number) => {
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

/** Men of a player for the store: ids `${p}1..n` of class cls at `level` (roster.ts makePerson). */
const men = (p: string, cls: string, n: number, level = 1) => Array.from({ length: n }, (_, i) => makePerson(`${p}${i + 1}`, cls, { level }));

/**
 * test-ridge as alliance 0's home (the W-80 larder), with persons: joins claimed from the store and their refusals, a
 * muster of men lying here, a camp (his men's packs topped up from his strongroom by it), level-ups and a path, a foe
 * arriving over the border into a fight (wounded, dead, captives held at the camp, honours, the fight written back),
 * soul claims (one taken, one refused by the cap), the captives freed by a raid on the camp, hires, transfers out and
 * in, then a save and a restore that plays on and a rejoin.
 */
function persons(): Step[] {
  const R = 'test-ridge';
  const h = men('h', 'hoplite', 8, 3), a = men('a', 'archer', 6, 2), f = men('f', 'hoplite', 5).concat(men('g', 'peltast', 4));
  h[0] = { ...h[0], hero: { ...h[0].hero, points: 2 } };
  const site = (r: Room) => (r.snapshot().buildings ?? []).find((b) => b.type === 'camp') ?? { id: 0, x: 190, y: 64 };
  return [
    { op: 'seed', args: () => [1, [...h, ...a], { food: 40, ration: 5 }, null] },
    { op: 'seed', args: () => [1, men('m', 'hoplite', 2), null, R] }, // healed men lying here: they muster on his join
    { op: 'seed', args: () => [2, [...f, ...men('c', 'civ_forager', 3)], null, null] },
    { pid: 1, msg: () => squads(R, 1, 0, [h.map((p) => p.id), a.map((p) => p.id)]) },
    { pid: 3, msg: () => squads(R, 3, 0, [['h1']]) }, // not his
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // already in the field
    { pid: 1, msg: () => squads(R, 1, 0, [['a1', 'a1']]) }, // listed twice
    { pid: 1, msg: () => squads(R, 1, 0, [['zz']]) }, // nobody
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 40, y0: c.y - 10, x1: c.x + 40, y1: c.y + 70 }; } },
    { pid: 1, msg: () => ({ t: 'dev', op: 'claim', x: 190, y: 62, r: 30 }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'placeBuilding', type: 'camp', ...spotFor(r, 0, 'camp', 190, 64) } }) },
    { ticks: 2 },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1), site: site(r).id } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'build', squad: squad(r, 1, 2), site: site(r).id } }) },
    { ticks: 420 },
    { op: 'levelUp', args: () => ['h1', { str: 1, end: 1 }, null] },
    { op: 'levelUp', args: () => ['a2', { str: 9 }, null] },
    { op: 'levelUp', args: () => ['zz', { str: 1 }, null] },
    { op: 'setPath', args: () => [1, { path: 'warrior', family: 'line', level: 3 }] },
    // a foe over the north border, by his archers at the entry: they fight
    { op: 'arrive', args: () => [2, 1, f.map((p) => p.id), 'N', { f1: 6, g2: 3 }, { packs: { f2: { lots: [{ r: 'wood', n: 3, o: 'elaia' }], items: [] }, zz: { lots: [{ r: 'food', n: 2, o: 'elaia' }], items: [] } } }] },
    { op: 'arrive', args: () => [2, 0, ['c1'], 'N', {}, null] }, // another alliance
    { pid: 2, msg: () => squads(R, 2, 1, [['f1']]) }, // a rejoin of the men standing here
    { pid: 2, msg: (r) => { const c = centre(r, squad(r, 2)); return { t: 'view', x0: c.x - 40, y0: c.y - 10, x1: c.x + 40, y1: c.y + 70 }; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: squad(r, 2) } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2), target: squad(r, 1, 1) } }) },
    { ticks: 70 },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: 236, y: 14 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'hold', squad: squad(r, 1, 1) } }) },
    { ticks: 110 },
    // souls: his rival takes one; his own is refused by his cap (warrior: 12)
    { op: 'spawnSoul', args: (r) => { const c = centre(r, squad(r, 2)); return [Math.round(c.x) + 0.5, Math.round(c.y) + 3.5, 'hoplite', 2]; } },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 2), soul: (r.sim.snapshot().souls ?? []).at(-1)!.id } }) },
    { op: 'spawnSoul', args: (r) => { const c = centre(r, squad(r, 1, 1)); return [Math.round(c.x) + 0.5, Math.round(c.y) + 3.5, 'hoplite', 1]; } },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1, 1), soul: (r.sim.snapshot().souls ?? []).at(-1)!.id } }) },
    { ticks: 60 },
    // his men walk off and he goes; the rival's raid the camp: the captives held there go free (no shrine here: they fade)
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1), x: 120, y: 62 } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 1, 2), x: 124, y: 66 } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'move', squad: squad(r, 2), x: site(r).x, y: site(r).y + 3 } }) },
    { ticks: 60 },
    { close: 1 },
    { ticks: 430 },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // a rejoin: his squads back
    { op: 'muster', args: () => [1] },
    { op: 'hired', args: () => [2, ['c2']] }, // none of his workers here: a squad of his own
    { op: 'hired', args: () => [2, ['c3']] }, // into it
    { ticks: 2 },
    { op: 'depart', args: () => [1, 'W', 400] }, // foes in reach
    { op: 'depart', args: () => [2, 'N', 2] },
    { ticks: 5 },
    { op: 'arrive', args: (_r, s) => [2, 1, s.recs.filter((x) => x.pid === 2 && x.state === 'active' && x.region === null && !x.person.hero.cls?.startsWith('civ_')).map((x) => x.id), 'N', {}, null] },
    { ticks: 20 },
    { op: 'save', args: () => [] },
    { op: 'restore', args: () => [] },
    { ticks: 30 },
    { pid: 1, msg: () => squads(R, 1, 0, [['h1']]) }, // a rejoin after the restore
    { op: 'save', args: () => [] },
    { ticks: 40 },
  ];
}

/**
 * test-ridge, an open fight between persons: two souls claimed in the same tick by a warrior one short of his cap (the
 * soul gate lets both by, the store's count takes one and the other leaves the field), then his veterans, one XP short
 * of a level, against a dozen militia: level-ups baked in the fight, honours (Veteran), the wounded beside their friends
 * (deeds and scars), captives with no camp to hold them, the dead stripped of their gear, all written back.
 */
function veterans(): Step[] {
  const R = 'test-ridge';
  const v = men('v', 'hoplite', 6, 4).map((p) => ({ ...p, hero: { ...p.hero, xp: 155 } })), w = men('w', 'hoplite', 5, 2), x = men('x', 'militia', 12);
  const soulBy = (r: Room, sq: number): unknown[] => { const c = centre(r, sq); return [Math.round(c.x) + 0.5, Math.round(c.y) + 0.5, 'hoplite', 1]; };
  const last = (r: Room) => (r.sim.snapshot().souls ?? []).at(-1)!.id;
  return [
    { op: 'seed', args: () => [1, [...v, ...w], null, null] },
    { op: 'seed', args: () => [2, x, null, null] },
    { op: 'setPath', args: () => [1, { path: 'warrior', family: 'line', level: 1 }] },
    { pid: 1, msg: () => squads(R, 1, 0, [v.map((p) => p.id), w.map((p) => p.id)]) },
    { ticks: 3 },
    { pid: 1, msg: (r) => { const c = centre(r, squad(r, 1)); return { t: 'view', x0: c.x - 40, y0: c.y - 30, x1: c.x + 40, y1: c.y + 50 }; } },
    { op: 'spawnSoul', args: (r) => soulBy(r, squad(r, 1)) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1), soul: last(r) } }) },
    { op: 'spawnSoul', args: (r) => soulBy(r, squad(r, 1, 1)) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'claimSoul', squad: squad(r, 1, 1), soul: last(r) } }) },
    { ticks: 50 },
    // the fight: militia come over the north border by him; both his squads on them, they on his first
    { op: 'arrive', args: () => [2, 1, x.map((p) => p.id), 'N', {}, null] },
    { pid: 2, msg: () => squads(R, 2, 1, [x.map((p) => p.id)]) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1), target: squad(r, 2) } }) },
    { pid: 1, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 1, 1), target: squad(r, 2) } }) },
    { pid: 2, msg: (r) => ({ t: 'order', o: { kind: 'attack', squad: squad(r, 2), target: squad(r, 1) } }) },
    { ticks: 200 },
    // a save mid-fight, restored after it: the fallen are gone from the store and leave the room
    { op: 'save', args: () => [] },
    { ticks: 130 },
    { op: 'restore', args: () => [] },
    { ticks: 20 },
    { op: 'save', args: () => [] },
  ];
}

const RUNS: { id: string; region: string; seed: number; opts: Record<string, unknown>; steps: () => Step[] }[] = [
  { id: 'ridge', region: 'test-ridge', seed: 1, opts: { cap: 96, wild: true }, steps: ridge },
  { id: 'persons', region: 'test-ridge', seed: 3, opts: { cap: 96, home: 0, fightQuiet: 40 }, steps: persons },
  { id: 'veterans', region: 'test-ridge', seed: 5, opts: { cap: 96, fightQuiet: 40 }, steps: veterans },
];

function run(r: (typeof RUNS)[number], sha: Sha) {
  const region = parseRegion(files[`../../war/regions/${r.region}.json`]);
  const local = new TsLocal({ region, seed: r.seed, ...r.opts });
  const steps: unknown[] = [];
  let kept = JSON.stringify(local.store.dump());
  const store = () => {
    const now = JSON.stringify(local.store.dump());
    if (now === kept) return {};
    kept = now;
    return { store: JSON.parse(now) as unknown };
  };
  for (const s of r.steps()) {
    if ('ticks' in s) for (let i = 0; i < s.ticks; i++) steps.push({ tick: true, ...local.tick(), ...store() });
    else if ('close' in s) steps.push({ close: s.close, out: local.close(s.close), ...store() });
    else if ('op' in s) {
      const args = s.args(local.room, local.store);
      steps.push({ op: s.op, args, ...local.call(s.op, args, sha), ...store() });
    } else {
      const msg = s.msg(local.room);
      steps.push({ pid: s.pid, msg, out: local.send(s.pid, msg), ...store() });
    }
  }
  return { id: r.id, region: r.region, seed: r.seed, opts: r.opts, steps };
}

/** The wire constants LocalRoom keeps in C++ (godot/native/src/room.h Net): protocol.ts and room.ts are no data tables. */
const consts = () => ({
  NET_VERSION, QUANT, KEYFRAME_EVERY, WILD_EVERY, VISION, CAMERA_MARGIN, MAX_SQUAD, MAX_SQUADS, DEFAULT_CAP, ALLIANCES, NODES_EVERY, STORE_NEAR, BOSS_NEAR,
  LABOUR_EVERY, CORPSE_TICKS: room.CORPSE_TICKS, FIGHT_QUIET: room.FIGHT_QUIET, HOME_CLAIM_R: room.HOME_CLAIM_R, GOODS: [...GOODS],
});

export const vectors = (sha: Sha) => ({ consts: consts(), runs: RUNS.map((r) => run(r, sha)) });
