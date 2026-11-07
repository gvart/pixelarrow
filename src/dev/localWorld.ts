/**
 * The offline world layer (docs/impl/godot-port.md P11), in TS: the spec the C++ LocalWorld (godot/native/src/
 * local_world.h) is checked against. It stands where WarWorldDO (server/src/war/world/worldDO.ts) stands round the World
 * (server/src/war/world/world.ts), with the region rooms as local rooms (./vectors/room.ts TsLocal, the regionDO.ts
 * round each WarRoom) on one store (./roomStore.ts, D1 for all of them), and no sockets, storage or alarms:
 *
 *  - Rooms: the regions given, each a TsLocal on its own seed and options, in the order given. They all tick in step;
 *    one world tick is one tick of every room. A region with no room is away (a transfer there: unavailable).
 *  - Clock: now = tick * msPerTick (season time; the rooms' own clock, and the store's, stay tick * 100 ms). Fast worlds
 *    (msPerTick > 100) bring the season's events and ends within a few thousand ticks, as WAR_TRAVEL_SCALE does online.
 *  - Each tick, room by room (regionDO.ts loop and outputs): the room's tick; a warlord fallen here told to the other
 *    rooms of his domain (tellFallen, kept per room as warlordFell keeps it); the warlords' age every 600 ticks; temples
 *    razed off the razer's score (sacrilege); the alliance AIs of the room (src/war/sim/allianceAi.ts on the room's sim
 *    and bots, on a fresh snapshot after the tick); its report to the world every REPORT_TICKS when the summary changed
 *    (lords in world times, lordReport). Then the world's alarm, when due (worldDO.ts arrive): world events opened and
 *    closed, the season advanced, arrivals and haul legs, and either the rollover (a season over) or the rooms told the
 *    events (announce).
 *  - Transfers (worldDO.ts transfer): his alliance is the store's (`ally`); depart and arrive are the rooms'
 *    (TsLocal.worldDepart, worldArrive) and each reports at once. No Safe Roads (tradeScore is D1's): `safe` is false.
 *  - Online (W-97): who has a socket is told (setOnline); a player coming online wakes his haul.
 *  - The rollover (worldDO.ts rollover, W-96): the board kept (no D1: no ladders, no banners), every room built anew
 *    (seasonReset), the store wiped (seasonWipe: every player's men, goods and titles), then the next season and its
 *    events told.
 *  - The map (worldDO.ts snapshot): World.snapshot with the store's members per alliance (no clans), no boards, crests
 *    or crowns (D1's).
 * Not here (online or D1 only): chat, the gate, the crown layer, boards seen, crests, the season's D1 roll, sweeps.
 */
import { parseRegion } from '../war/region/schema';
import { ALLIANCES, WAR_SEASON } from '../war/world/alliances';
import { isWorldRegion } from '../war/world/graph';
import { WORLD_REGIONS } from '../war/world/regions';
import { PATH_IDS } from '../war/world/start';
import type { AllianceId, SeasonConfig, Side } from '../war/world/types';
import type { LordWorld, SeasonBoard, TransferOrder, TransitCargo, WorldServerMsg } from '../war/net/world';
import { createAllianceAi, type AllianceAi } from '../war/sim/allianceAi';
import { domainOf, warlord } from '../data/warWarlords';
import { freshWorld, snapOf, World, type ArriveResult, type DepartResult, type Ports } from '../../server/src/war/world/world';
import { RoomStore } from './roomStore';
import { TsLocal, type Out } from './vectors/room';

const files = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });
const server = import.meta.glob('../../server/src/war/room.ts', { eager: true }) as Record<string, { lordReport(lords: readonly unknown[], from: number, now: number): LordWorld[] }>;
const { lordReport } = Object.values(server)[0];

/** regionDO.ts: a room reports to the world every REPORT_TICKS (when its summary changed); a day of the warlords' age. */
export const REPORT_TICKS = 50;
const DAY_MS = 86_400_000;
const LORD_AGE_TICKS = 600;

/**
 * A region room of the world: its region, seed, room options (room.ts RoomOptions), the alliances the AI plays there and
 * the claim points held as the season starts (by point, -1: nobody; the room recalls them as its memory, as aiSeason.ts).
 */
export interface WorldRoom { id: string; seed: number; opts?: Record<string, unknown>; ai?: number[]; held?: number[] }
export interface WorldOpts {
  /** Season ms a tick (default 100, the rooms' clock). */
  msPerTick?: number;
  /** The season (WAR_SEASON overridden). */
  season?: Partial<SeasonConfig>;
  /** The season's start (ms, default 0). */
  start?: number;
}
/** An outbound message: [region ('' for the world's own), pid, message]. */
export type WorldOut = [string, number, unknown];

interface Here { local: TsLocal; ais: AllianceAi[]; reported: string; fallen: Map<string, number> }

export class TsWorld {
  readonly world: World;
  store = new RoomStore();
  readonly rooms = new Map<string, Here>();
  readonly msPerTick: number;
  tick = 0;
  private online = new Set<number>();
  private lordsFrom: number;
  private out: WorldOut[] = [];

  constructor(private readonly specs: readonly WorldRoom[], o: WorldOpts = {}) {
    this.msPerTick = o.msPerTick ?? 100;
    const season: SeasonConfig = { ...WAR_SEASON, ...o.season };
    this.world = new World(freshWorld(o.start ?? 0, season), season);
    this.lordsFrom = this.world.st.season.startAt;
    this.build();
  }

  get now(): number {
    return this.tick * this.msPerTick;
  }

  /** Every room fresh (regionDO.ts ensure: its warlords' clock from the season's start, the world's events on it). */
  private build(): void {
    this.rooms.clear();
    for (const s of this.specs) {
      const local = new TsLocal({ region: parseRegion(files[`../war/regions/${s.id}.json`]), seed: s.seed, ...s.opts }, this.store);
      const r = local.room;
      if (s.held) r.recall({ ...(r.memory() as object), claims: s.held }, 0);
      if (r.warlords) r.setWarlordAge((this.now - this.lordsFrom) / DAY_MS);
      this.rooms.set(s.id, { local, ais: (s.ai ?? []).map((t) => createAllianceAi(r.sim, r.bots, t)), reported: '', fallen: new Map() });
    }
    this.announce();
  }

  /** The rooms as the world reaches them (worldDO.ts ports). */
  private ports(): Ports {
    return {
      depart: async (from: string, pid: number, side: Side, to: string, foeRadius: number): Promise<DepartResult> => {
        const h = this.rooms.get(from);
        if (!h) return { error: 'region', detail: from };
        const r = h.local.worldDepart(pid, side, to, foeRadius) as DepartResult;
        if ('error' in r) return r;
        this.report(from, true);
        return r;
      },
      arrive: async (to: string, pid: number, alliance: AllianceId, ids: string[], side: Side, lost?: Record<string, number>, cargo?: TransitCargo): Promise<ArriveResult> => {
        const h = this.rooms.get(to);
        if (!h) return { error: 'unavailable' };
        const { res, out } = h.local.worldArrive(pid, alliance, ids, side, lost, cargo);
        this.tell(to, out);
        if ('ok' in res) this.report(to, true);
        return res as ArriveResult;
      },
      online: (pid) => this.online.has(pid),
    };
  }

  private tell(region: string, out: Out[]): void {
    for (const [pid, m] of out) this.out.push([region, pid, m]);
  }

  /** regionDO.ts report: what the map shows of this region, when it changed (every REPORT_TICKS; `now`: at once). */
  private report(id: string, force = false): void {
    const h = this.rooms.get(id)!, room = h.local.room;
    if (!isWorldRegion(id) || (!force && room.currentTick % REPORT_TICKS !== 0)) return;
    const sum = room.summary() as { lords?: unknown[] }, s = JSON.stringify(sum);
    if (s === h.reported) return;
    h.reported = s;
    const { lords, ...rest } = sum, rep = lords ? { ...rest, lords: lordReport(lords, this.lordsFrom, this.now) } : rest;
    this.world.report(id, rep as Parameters<World['report']>[1], this.now);
  }

  /** W-62: every room hears the running and next world events (worldDO.ts announce; regionDO.ts worldEvents). */
  private announce(): void {
    const w = this.world, now = this.now, events = w.activeEvents(now), next = w.nextEvent(now);
    for (const r of WORLD_REGIONS) {
      const h = this.rooms.get(r.id);
      if (h) this.tell(r.id, h.local.world(events, next, now));
    }
  }

  /** One world tick: every room's, then the world's alarm when due. */
  async step(): Promise<void> {
    this.tick++;
    const now = this.now;
    for (const [id, h] of this.rooms) {
      const r = h.local.tick();
      this.tell(id, r.out);
      const room = h.local.room;
      // W-72 proposal (regionDO.ts tellFallen): a lord fallen here is told to the other rooms of his domain
      const notes = ((r.books as { warlord?: { what: string; warlord: string }[] } | undefined)?.warlord ?? []);
      for (const n of notes) {
        const w = n.what === 'fallen' ? warlord(n.warlord) : undefined;
        if (!w) continue;
        const at = (now - this.lordsFrom) / DAY_MS;
        for (const x of domainOf(w)) {
          const o = this.rooms.get(x);
          if (x === id || !o || (o.fallen.get(w.id) ?? -Infinity) >= at) continue;
          o.fallen.set(w.id, at);
          o.local.room.warlordFell(w.id, at);
        }
      }
      if (room.warlords && room.currentTick % LORD_AGE_TICKS === 0) room.setWarlordAge((now - this.lordsFrom) / DAY_MS);
      // M7f: a temple or shrine razed costs the razer's alliance score
      if (isWorldRegion(id)) for (const a of h.local.sacrilege) this.world.sacrilege(a as AllianceId, now);
      if (h.ais.length) {
        const snap = room.sim.snapshot();
        for (const ai of h.ais) ai.tick(snap);
      }
      this.report(id);
    }
    const w = this.world, at = w.st.season.ended ? now : w.nextAlarm();
    if (at !== null && at <= now) await this.alarm(now);
  }

  /** worldDO.ts arrive: events first (one closing with the season still closes), the season, arrivals, then the rollover or the news. */
  private async alarm(now: number): Promise<void> {
    const w = this.world;
    const ev = w.eventTick(now);
    w.advance(now);
    await w.due(now, this.ports());
    if (w.st.season.ended) this.rollover(now);
    else if (ev.changed) this.announce();
  }

  /** worldDO.ts rollover (W-62, W-96): the board kept, every room anew, the store wiped, the next season. */
  private rollover(now: number): void {
    const w = this.world, s = w.st.season, r = s.ended;
    if (!r) return;
    const board: SeasonBoard = { ...r, season: s.id, startAt: s.startAt, event: (s.event ?? r.scores.map(() => 0)).map(Math.floor), ladders: Object.fromEntries(PATH_IDS.map((p) => [p, []])) as unknown as SeasonBoard['ladders'], banners: 0 };
    this.store = new RoomStore();
    w.st.last = board;
    w.newSeason(now);
    this.lordsFrom = w.st.season.startAt;
    this.build();
  }

  /** A transfer order of player `pid` (worldDO.ts transfer and its socket's answer). */
  async transfer(pid: number, o: TransferOrder): Promise<WorldServerMsg> {
    const t = await this.world.transfer(pid, (this.store.alliances.get(pid) ?? null) as AllianceId | null, o, this.now, this.ports(), false);
    return 'error' in t ? { t: 'error', code: t.error, ...(t.detail !== undefined ? { detail: t.detail } : {}) } as WorldServerMsg : { t: 'transferred', transit: snapOf(t) };
  }

  /** W-97: he has a socket (a map or a region) or none; back online, his haul waiting at a stop goes on. */
  setOnline(pid: number, on: boolean): void {
    if (!on) return void this.online.delete(pid);
    this.online.add(pid);
    this.world.wake(pid, this.now);
  }

  /** The world map for player `pid` (worldDO.ts snapshot, its socket's `world` message). */
  snapshot(pid: number): WorldServerMsg {
    const members = ALLIANCES.map(() => 0);
    for (const [, a] of this.store.alliances) if (a >= 0 && a < members.length) members[a]++;
    const snap = this.world.snapshot(pid, (this.store.alliances.get(pid) ?? null) as AllianceId | null, { members, clans: ALLIANCES.map(() => 0) }, this.now);
    return { t: 'world', ...snap, crests: [] };
  }

  /** A client message to a room (null: no room there). */
  send(region: string, pid: number, msg: unknown): void {
    const h = this.rooms.get(region);
    if (h) this.tell(region, h.local.send(pid, msg));
  }

  /** The messages since the last take. */
  take(): WorldOut[] {
    return this.out.splice(0);
  }
}
