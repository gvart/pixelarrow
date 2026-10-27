/**
 * WarRegionDO: one Durable Object per war region (M3; W-05..W-07). Hosts a WarRoom (./room.ts) and steps it at 10 Hz
 * with a timer loop while a socket is open and the room is active (players or armies); an alarm every KEEPALIVE_MS keeps
 * the object resident meanwhile. Sockets use the hibernation API; the object cannot hibernate while the loop runs.
 * Dormant regions (armies stand, no socket open): the loop stops and the object may hibernate or be evicted; an alarm
 * every DORMANT_MS runs the missed ticks in one batch (catchUp: the same sim ticks, only faster, ≤ BATCH a call, a gap
 * over MAX_LAG cut), saves and sleeps again. A socket, an arrival or any other RPC that touches the room catches up to
 * now first. A catch-up runs in slices of SLICE ticks that yield between them (caughtUp), so pings, a connecting socket
 * and RPCs are served meanwhile; a socket is accepted at once and its join waits for the catch-up. The saved state
 * carries the wall time its tick stands for (`at`), so an evicted region catches up too.
 *
 * The Worker authenticates the socket (/ws/war/:region) and forwards it with X-Player-Id; the DO trusts that header.
 * Protocol: src/war/net/protocol.ts. GET /stats (dev only, routed by the Worker) reports tick times and bandwidth, and the neutral state (lairs, guardians, claim points: `wild`).
 *
 * M5e persistence:
 *  - a join names persons by id: they are claimed in D1 for this region (./persons.ts claimForJoin) and spawned;
 *    refused or abandoned joins send them home again.
 *  - every finished fight (WarRoom tick `fights`) is written to D1 in one idempotent batch (applyFight), in order,
 *    retried on failure.
 *  - the room's whole state (WarRoom.saveState: the sim's exact state and the room's books) goes to DO storage every
 *    SAVE_TICKS, after joins and fights, as gzipped JSON in chunks (`state:meta` + `state:<i>`, one atomic put); an
 *    evicted object restores it on its next socket or its pending alarm (WarRoom.restore, persons reloaded from D1) and
 *    the region steps on from where it was saved, catching up the time since. A region with no saved state starts fresh and sends home anyone D1
 *    still has deployed there.
 *
 * M6e holders: every save also snapshots the room's player holders (chests, carts, packs) to D1 war_region_holds.
 *
 * M5h4 crafting: a `mend` message takes the stash item from D1 to the workplace (./crafting.ts takeForMend) and the
 * room queues it; every tick's `crafted` events are written back (applyCrafts: minted items, repairs, salvage; keyed,
 * idempotent) and mend items whose order went go back to the stash.
 *
 * M4 world: WarWorldDO calls depart / arrive over RPC for transfers between regions (./world/world.ts): a departing
 * squad's unsaved fight (XP, kills) is written to D1 before it leaves and its hit points ride along; a world region
 * reports its summary (live men, claim points, claims in progress) to the world every REPORT_TICKS when it changed.
 *
 * W-62 world events: the world tells every room the running and next events (worldEvents; kept in DO storage, asked of
 * the world when a room starts with none); the room applies the one in its region (a soul storm, a guardian woken once
 * per event: `woke`) and every client hears them (`worldEvents`). seasonReset (the season war's rollover): the room
 * stops, its clients are closed (4001 'season'), its men go home with their gear (D1), and its saved state and memory
 * are dropped: it starts over from its authored data (landmarks, claim points, guardians).
 *
 * W-63 shared settlements (./settlements.ts in D1, ./roomSettlements.ts on the field): the region's settlements are
 * polled every SETTLE_POLL ticks (and before each join) into the room, which flies each player's banner by ground and
 * turns squads and towns whose banner changed; clients hear `settlements` when their view changes. Finished camps are
 * founded, attacks logged (the lords told over the world), level, tending and persisting pieces reported every
 * SETTLE_REPORT, tribute levied every LEVY_MS (the vassal's store gain and its citizens' stall coin since the last levy,
 * taken out of them). PRESENCE.check asks the room (presence RPC). A fresh room lays its settlements' persisting pieces
 * down again under their lord's alliance; seasonReset writes them first.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { WarRoom, type RoomOptions, type RoomState, type TickTimes } from './room';
import { regionVersion, warRegion } from './regions';
import { DEFAULT_CAP, parseClientMsg, type HandoffMsg, type JoinMsg, type MendMsg, type ServerMsg, type StowMsg } from '../../../src/war/net/protocol';
import { cartArrived, contract, deliver, guardCheck, labourDone, sealedFor, workContracts } from './contracts';
import { addLabour, bonusesOf, openWorks } from './works';
import { contractPoints, scorePeace } from './peace';
import { handoffDone, handoffRefusal, linkedCaptures } from './abuse';
import { loads } from '../../../src/war/sim/holders';
import { ApiError } from '../errors';
import { batch, ensureHolder, guard, lotsOf, placeItemStmt, planTake, putStmt, strongroom } from './holders';
import { loadsIn, SITE, site } from './market';
import { holderOf } from './tradeRoutes';
import { bundleGoods, bundleLoads, type Bundle } from './cargo';
import { homeOf } from '../../../src/war/world/graph';
import type { Item } from '../../../src/data/items';
import type { WarPerson } from '../../../src/war/types';
import { log, logError } from '../telemetry/log';
import { applyBossKill } from './bosses';
import { elapsedTicks, loadMemory, MEMORY_KEY, remembered, storeMemory, writeMemory } from './memory';
import type { WorldEvent } from '../../../src/war/world/events';
import { applyFight, armyCount, claimForJoin, claimSoul, deployed, freeRaided, release, releaseRegion } from './persons';
import { applyCrafts, keepMends, returnMends, takeForMend } from './crafting';
import { saveRegionHolds } from './holders';
import { json } from './persons';
import { isWorldRegion } from '../../../src/war/world/graph';
import { joinRefusal } from '../../../src/war/world/access';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import { allianceOf } from './world/members';
import type { AllianceId, Side } from '../../../src/war/world/types';
import { WORLD_NAME, type ArriveResult, type DepartResult } from './world/world';
import type { TransitCargo } from '../../../src/war/net/world';
import { guideStorageKey, type GuideDone } from './guide';
import { storyStorageKey, type StoryDone } from './stories';
import type { StorySave } from '../../../src/war/sim/stories';
import { fightTallies, tallyStmt } from './tasks';
import type { GuideSave } from '../../../src/war/net/guide';
import { bookFight, pactAttack } from './crown';
import { found, levy, logAttack, PRESENCE, report as reportSettlement, SETTLE, tributeOf } from './settlements';
import { foundRefusal, loadRegionSettlements, tiedTo, type Persist, type RoomSettlement } from './roomSettlements';
import { goodsOf } from './holders';
import { stallId } from './market';

const TICK_MS = 100;
/** Ticks between summaries to the world map (sent only when changed). */
const REPORT_TICKS = 50;
const KEEPALIVE_MS = 10_000;
/**
 * Dormant regions (armies stand, no socket): the alarm wakes the object every DORMANT_MS to run the missed ticks in one
 * batch (≤ BATCH a call; still behind: again after BEHIND_MS). A gap over MAX_LAG (an outage) is cut to MAX_LAG. Tick cost
 * with men parked and nobody online (WarRoom.tick, M-series laptop): ~0.4 ms at 72 men, ~1 ms at 250, ~3.6 ms at 360 on a
 * home map; a save ~0.1-0.2 s. So a 2 min batch (1200 ticks) is ~0.5 s CPU, ~4.5 s at 360 men, and BATCH stays near a
 * third of the 30 s CPU limit even for the heaviest region.
 */
export const DORMANT_MS = 120_000;
export const BATCH = 3_000;
export const BEHIND_MS = 1_000;
export const MAX_LAG = 18_000;
/**
 * A catch-up runs in slices of SLICE ticks (~0.4 s at the heaviest) and yields between them, so the object keeps serving
 * sockets (pings, a connecting player) and RPCs while it plays out a dormant gap instead of blocking for seconds.
 */
export const SLICE = 100;
/** Tick history kept for /stats. */
const HISTORY = 600;
/** Ticks between state saves to DO storage (30 s). */
const SAVE_TICKS = 300;
/** D1 write attempts before a write is dropped (logged). */
const WRITE_TRIES = 5;
/** W-61: ticks between polls of the region's guard contracts, open works and work bonuses (30 s). */
const PEACE_POLL = 300;
/** W-63: ticks between polls of the region's settlements (10 s), between their reports to D1 (60 s); ms between levies. */
const SETTLE_POLL = 100;
const SETTLE_REPORT = 600;
export const LEVY_MS = 6 * 3_600_000;
const levyKey = (id: number) => `levy:${id}`;
interface LevyBase { store: Record<string, number>; stalls: Record<number, number> }

/** W-63: the terms route asks the settlement's region room whether the offerer's men stand on its ground. */
export function wirePresence(env: Env): void {
  PRESENCE.check = async (pid, s) => {
    const stub = env.WAR_REGION.get(env.WAR_REGION.idFromName(s.region));
    return stub.presence(s.region, pid, s.id).catch(() => false);
  };
}

interface Attachment { pid: number }

export class WarRegionDO extends DurableObject<Env> {
  private room: WarRoom | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  /** Wall time (ms) the room's current tick stands for: the live loop keeps it at now, a dormant region falls behind. */
  private clockAt = Date.now();
  private times: (TickTimes & { totalMs: number; sendMs: number; bytes: number; units: number; clients: number; lateMs: number })[] = [];
  private overruns = 0;
  /** Ticks run in catch-up batches since the object started (/stats). */
  private ran = 0;
  private savedAt = 0;
  private saving: Promise<void> = Promise.resolve();
  /** D1 writes in order (fights, releases); `writing` drains it. */
  private writes: { what: string; run: () => Promise<unknown> }[] = [];
  private writing: Promise<void> | null = null;
  /** M4: the last summary sent to the world. */
  private reported = '';
  /** M7f: the region memory last written to D1. */
  private memory = '';
  /** W-62: the world events as the world last told them (null: not loaded yet). */
  private worldEv: { events: WorldEvent[]; next: WorldEvent | null } | null = null;
  /** W-63: the region's settlements as last polled; each player's view as last sent; persisted pieces as last reported. */
  private settles: RoomSettlement[] = [];
  private settleSent = new Map<number, string>();
  private persisted = new Map<number, string>();
  /** The catch-up running in slices (caughtUp), shared by every caller meanwhile. */
  private draining: Promise<number> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private options(region: string): RoomOptions | null {
    const data = warRegion(region);
    if (!data) return null;
    // M7f: a fresh region wakes its authored lairs and guardians
    const wild = !!(data.lairs?.length || data.guardians?.length);
    // a home is its alliance's from the season's start: it builds there at once (WarRoom home anchor)
    const home = ALLIANCES.find((a) => a.home === region)?.id;
    return { region: data, seed: 1, cap: Number(this.env.WAR_CAP) || DEFAULT_CAP, allowArmy: this.env.DEV_AUTH === '1', allowDev: this.env.DEV_AUTH === '1', wild, home };
  }

  /**
   * The room of `region`: in memory, restored from storage after an eviction, or fresh. Null for an unknown region. A
   * saved state or memory of another war season or another version of the authored region is not taken: the region
   * starts over from its authored data (pre-built town, lairs, guardians, claim points, safe zones).
   */
  private async ensure(region: string): Promise<WarRoom | null> {
    if (this.room) return this.room.region.id === region ? this.room : null;
    const o = this.options(region);
    if (!o) return null;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.room) return;
      const st = await loadState(this.ctx.storage);
      const d = this.env.DB;
      let restored: WarRoom | null = null;
      if (st && st.region === region && st.edition === edition(region)) {
        try {
          const persons = d ? await deployed(d, region, st.pids) : new Map();
          restored = WarRoom.restore(o, st, persons);
          if (d) await keepMends(d, region, restored.mendUids());
        } catch (e) {
          logError('war_restore_failed', e, { region }); // a state the code no longer reads: start the region over
        }
      }
      if (restored) {
        this.room = restored;
        // it was saved at `at`: the time since is caught up (catchUp), as if it had never stopped
        this.clockAt = (await this.ctx.storage.get<{ at?: number }>(STATE_META))?.at ?? Date.now();
        this.flushReleased(restored);
      } else {
        this.clockAt = Date.now();
        if (d) await releaseRegion(d, region);
        this.room = new WarRoom(o);
        // M7f: what the region remembers (razed towns, slain guardians, restored landmarks) since it was left
        const m = await loadMemory(this.ctx.storage, d, region, WAR_SEASON.id, regionVersion(region));
        if (m) {
          try {
            this.room.recall(m.mem, elapsedTicks(m, Date.now()));
            this.memory = JSON.stringify(m.mem);
          } catch (e) {
            logError('war_recall_failed', e, { region });
          }
        }
        if (d) await this.restoreSettlements(this.room).catch((e) => logError('war_settle_restore_failed', e, { region }));
      }
      if (d && this.room) await this.loadSettlements(this.room).catch((e) => logError('war_settle_poll_failed', e, { region }));
      await this.ctx.storage.put('region', region);
      await this.loadEvents();
      if (this.room) await this.applyEvents(this.room);
    });
    return this.room;
  }

  /** W-62: the world events from DO storage, else asked of the world (a room that never heard them). */
  private async loadEvents(): Promise<void> {
    if (this.worldEv) return;
    this.worldEv = (await this.ctx.storage.get<{ events: WorldEvent[]; next: WorldEvent | null }>('worldEvents')) ?? null;
    if (!this.worldEv && this.env.WAR_WORLD) this.worldEv = await this.world().worldEvents().catch(() => null);
  }

  /** W-62: the events running in this region now onto the room; a guardian wakes once per event. */
  private async applyEvents(room: WarRoom, now = Date.now()): Promise<void> {
    const mine = (this.worldEv?.events ?? []).filter((e) => e.region === room.region.id && e.startAt <= now && now < e.endAt);
    room.setWorldEvents(mine);
    const wake = mine.find((e) => e.kind === 'bossWake');
    if (wake && (await this.ctx.storage.get<number>('woke')) !== wake.startAt) {
      room.wakeGuardians();
      await this.ctx.storage.put('woke', wake.startAt);
      this.save();
    }
  }

  /** W-62 (RPC from WarWorldDO): the world events running now (any region) and the next; applied here, told to all. */
  async worldEvents(region: string, events: WorldEvent[], next: WorldEvent | null): Promise<void> {
    this.worldEv = { events, next };
    await this.ctx.storage.put('worldEvents', this.worldEv);
    const room = this.room;
    if (!room || room.region.id !== region) return;
    if (await this.caughtUp()) this.save();
    await this.applyEvents(room);
    for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()) send(ws, { t: 'worldEvents', events, next });
  }

  /**
   * W-62 (RPC from WarWorldDO, the season's rollover): the region starts over. Its loop stops, its clients are closed,
   * queued writes finish, its men (and their gear) go home in D1, and its saved state and memory are dropped.
   */
  async seasonReset(region: string): Promise<void> {
    // W-63: what persists of its settlements goes to D1 first (seasonSweep, after every region, keeps or drops them)
    if (this.env.DB) {
      const room = await this.ensure(region).catch(() => null);
      if (room) await this.reportSettlements(room, 'persist').catch((e) => logError('war_settle_persist_failed', e, { region }));
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.room = null;
    for (const ws of this.ctx.getWebSockets()) {
      ws.serializeAttachment(null);
      try {
        ws.close(4001, 'season');
      } catch {
        // gone
      }
    }
    await this.settled();
    await storeState(this.ctx.storage, null);
    await this.ctx.storage.delete([MEMORY_KEY, 'woke']);
    this.memory = '';
    this.reported = '';
    this.settles = [];
    this.settleSent.clear();
    this.persisted.clear();
    const d = this.env.DB;
    if (d) {
      await releaseRegion(d, region);
      await d.batch([d.prepare('DELETE FROM war_region_state WHERE region = ?1').bind(region), d.prepare('DELETE FROM war_region_holds WHERE region = ?1').bind(region)]);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const region = request.headers.get('x-region-id') ?? '';
    if (url.pathname.endsWith('/stats')) return Response.json(this.stats());
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const pid = Number(request.headers.get('x-player-id'));
    if (!Number.isSafeInteger(pid) || pid <= 0) return new Response('Missing player', { status: 400 });
    const room = await this.ensure(region);
    if (!room) return new Response('Unknown region', { status: 404 });
    // one socket per player: a new one replaces the old
    for (const old of this.ctx.getWebSockets(`p:${pid}`)) {
      old.serializeAttachment(null);
      old.close(4000, 'replaced');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [`p:${pid}`]);
    server.serializeAttachment({ pid } satisfies Attachment);
    const headers = new Headers();
    const proto = request.headers.get('x-ws-protocol');
    if (proto) headers.set('sec-websocket-protocol', proto);
    // a dormant region plays out the time since its last batch (in slices: the socket opens and pings meanwhile), then runs live
    this.ctx.waitUntil(this.caughtUp().then(() => this.room === room && this.resume(room)));
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    const room = this.room;
    if (!me || !room) return;
    if (typeof message !== 'string') return send(ws, { t: 'error', code: 'parse', detail: 'text JSON only' });
    const m = parseClientMsg(message);
    if (!m) return send(ws, { t: 'error', code: 'parse' });
    try {
      if (m.t === 'join') await this.join(ws, me.pid, room, m);
      else if (m.t === 'order') {
        const err = room.order(me.pid, m.o);
        if (err) send(ws, { t: 'error', code: err, detail: err === 'notYourGround' ? room.refusal : m.o.kind });
      } else if (m.t === 'view') room.view(me.pid, m);
      else if (m.t === 'ping') send(ws, { t: 'pong', c: m.c, tick: room.currentTick, ms: this.tickMs() });
      else if (m.t === 'check') send(ws, room.check(me.pid, m));
      else if (m.t === 'dev') {
        const err = room.dev(me.pid, m);
        if (err) send(ws, { t: 'error', code: err, detail: `dev ${m.op}${err === 'forbidden' ? ': needs DEV_AUTH=1' : ''}` });
        else this.save();
      }
      else if (m.t === 'mend') await this.mend(ws, me.pid, room, m);
      else if (m.t === 'stow') await this.stow(ws, me.pid, room, m);
      else if (m.t === 'handoff') await this.handoff(ws, me.pid, room, m);
      else if (m.t === 'guide') {
        const g = room.guide.hide(me.pid);
        if (g) await this.ctx.storage.put(guideStorageKey(WAR_SEASON.id, me.pid), g);
      }
      else if (m.t === 'story') room.storyChoose(me.pid, m.option); // W-65
    } catch (e) {
      logError('war_message_failed', e);
    }
  }

  private async join(ws: WebSocket, pid: number, room: WarRoom, m: JoinMsg): Promise<void> {
    const region = room.region.id;
    await this.caughtUp(); // the region as it stands now before he comes in
    // M4: in a world region the player serves his alliance; fresh squads only where it may bring them (joinRefusal)
    const db = this.env.DB;
    // W-63: the settlements as they stand now: the room flies his banner by ground (the client's team is not asked)
    if (db) await this.loadSettlements(room).catch((e) => logError('war_settle_poll_failed', e, { region }));
    if (db && isWorldRegion(region) && m.region === region) {
      const a = await allianceOf(db, pid);
      if (a === null) return send(ws, { t: 'refused', reason: 'team', detail: 'join an alliance first' });
      m = { ...m, team: a };
      if (room.spawnsNew(pid)) {
        const st = await this.world().regionState(region).catch(() => null);
        const why = joinRefusal(region, a, st, tiedTo(this.settles, pid));
        if (why) return send(ws, { t: 'refused', reason: 'region', detail: why });
      }
    }
    let persons: WarPerson[][] | undefined;
    if (m.squads && m.region === region && room.spawnsNew(pid)) {
      const d = this.env.DB;
      if (!d) return send(ws, { t: 'refused', reason: 'army', detail: 'no database' });
      const got = await claimForJoin(d, pid, region, m.squads, room.personsHere(), Date.now());
      if (typeof got === 'string') return send(ws, { t: 'refused', reason: 'army', detail: got });
      persons = got;
    }
    const here = persons ? null : room.personsHere();
    let res: ReturnType<WarRoom['join']>;
    try {
      res = room.join(pid, m, persons);
    } catch (e) {
      // a spawn that threw leaves no squad: the men claimed for it go home, not stay listed in the region
      if (persons) this.write('release', () => release(this.env.DB!, region, m.squads!.flat()));
      throw e;
    }
    send(ws, res.msg);
    if (res.msg.t === 'welcome' && this.worldEv) send(ws, { t: 'worldEvents', ...this.worldEv }); // W-62
    if (res.msg.t === 'welcome') this.sendSettlements(room, pid, true); // W-63
    if (res.msg.t === 'refused' && persons) this.write('release', () => release(this.env.DB!, region, m.squads!.flat()));
    // W-60: the soul gate counts his whole army (every region)
    if (db && res.msg.t === 'welcome') room.setArmy(pid, await armyCount(db, pid));
    if (res.msg.t === 'welcome') await this.guideStart(pid, room);
    if (res.msg.t === 'welcome') await this.storyStart(pid, room); // W-65
    this.save();
    this.start();
    // a rejoin that also names men not here (entering again with some at home): they follow as a fresh squad
    const fresh = here && res.msg.t === 'welcome' ? m.squads?.map((g) => g.filter((id) => id !== 'none' && !here.has(id))).filter((g) => g.length) : undefined;
    if (fresh?.length && room.spawnsNew(pid)) await this.join(ws, pid, room, { ...m, squads: fresh });
  }

  /** W-62: his first-hour guide here (his save from this DO's storage): started by the room, told to him. */
  private async guideStart(pid: number, room: WarRoom): Promise<void> {
    const save = (await this.ctx.storage.get<GuideSave>(guideStorageKey(WAR_SEASON.id, pid))) ?? null;
    const m = room.startGuide(pid, save);
    if (m) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, m);
  }

  /** W-65: his story here (his save from this DO's storage): started by the room, told to him. */
  private async storyStart(pid: number, room: WarRoom): Promise<void> {
    const save = (await this.ctx.storage.get<StorySave>(storyStorageKey(WAR_SEASON.id, pid))) ?? null;
    const m = room.startStory(pid, save);
    if (m) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, m);
  }

  /** W-65: story runs moved: the save into storage, goods owed into his home strongroom. */
  private storied(done: readonly StoryDone[]): void {
    const d = this.env.DB;
    for (const g of done) {
      this.ctx.waitUntil(this.ctx.storage.put(storyStorageKey(WAR_SEASON.id, g.pid), g.save).catch((e) => logError('war_story_save_failed', e)));
      const pay = Object.entries(g.goods).filter(([, n]) => n > 0);
      if (d && pay.length) this.write(`story ${g.pid} ${g.save.at ?? 'end'}`, () => batch(d, [ensureHolder(d, strongroom(g.pid), 'strongroom', { pid: g.pid }, Date.now()), ...pay.map(([r, n]) => putStmt(d, strongroom(g.pid), r, n))]));
    }
  }

  /** W-62: guide steps done: the save into storage, the reward into his home strongroom. */
  private guided(done: readonly GuideDone[]): void {
    const d = this.env.DB;
    for (const g of done) {
      this.ctx.waitUntil(this.ctx.storage.put(guideStorageKey(WAR_SEASON.id, g.pid), g.save).catch((e) => logError('war_guide_save_failed', e)));
      const pay = Object.entries(g.reward).filter(([, n]) => n > 0);
      if (d && pay.length) this.write(`guide ${g.pid} ${g.step}`, () => batch(d, [ensureHolder(d, strongroom(g.pid), 'strongroom', { pid: g.pid }, Date.now()), ...pay.map(([r, n]) => putStmt(d, strongroom(g.pid), r, n))]));
    }
  }

  /** M5h4: the stash item goes to the workplace (D1), then into the room's queue; refused: straight back. */
  private async mend(ws: WebSocket, pid: number, room: WarRoom, m: MendMsg): Promise<void> {
    const d = this.env.DB;
    if (!d) return send(ws, { t: 'error', code: 'bad', detail: 'no database' });
    const region = room.region.id;
    const item = await takeForMend(d, pid, m.uid, region);
    if (!item) return send(ws, { t: 'error', code: 'badTarget', detail: 'no such item in your stash' });
    const err = room.mend(pid, m.kind, m.building, item);
    if (err) {
      this.write('unmend', () => returnMends(d, region, [item.uid]));
      send(ws, { t: 'error', code: err, detail: m.kind });
    } else this.save();
  }

  /**
   * M6f: goods and items between the player's packs (or cart) and his site here: his stall or warehouse in this
   * market town (the carrier in the court), or his home strongroom at home (any region off the world map counts as
   * home: dev and test regions). `in`: out of the room first, back on a D1 failure; `out`: out of D1 first, what does
   * not fit goes back. Sealed loads (carry contracts) never go in here.
   */
  private async stow(ws: WebSocket, pid: number, room: WarRoom, m: StowMsg): Promise<void> {
    const d = this.env.DB;
    if (!d) return send(ws, { t: 'error', code: 'bad', detail: 'no database' });
    const region = room.region.id, now = Date.now();
    const from = m.squad !== undefined ? { squad: m.squad } : { cart: m.cart! };
    if (!room.carrier(pid, from)) return send(ws, { t: 'error', code: 'notOwner', detail: 'stow' });
    const fail = (e: unknown) => {
      if (!(e instanceof ApiError)) throw e;
      send(ws, { t: 'error', code: 'badTarget', detail: `${e.code}: ${e.message}` });
    };
    if (m.site === 'contract') return this.stowContract(ws, pid, room, m, from);
    const kind = m.site;
    let id: string;
    try {
      if (kind === 'strongroom') {
        if (isWorldRegion(region)) {
          const a = await allianceOf(d, pid);
          if (a === null || homeOf(a) !== region) throw new ApiError(409, 'not_home', 'Your strongroom is at home');
        }
        id = strongroom(pid);
      } else {
        if (!room.inCourt(pid, from)) throw new ApiError(409, 'not_in_court', 'Bring them into the market court');
        id = (await site(d, pid, region, kind, await holderOf(this.env, region), now)).id;
      }
    } catch (e) {
      return fail(e);
    }
    const goods = m.goods ?? {}, uids = m.uids ?? [];
    // M6g: an escort's cart arriving: its loads before anything leaves it
    const cartLoads = from.cart !== undefined && m.dir === 'in' ? room.carrier(pid, from)!.slots.reduce((a, s) => a + loads(s.hold), 0) : 0;
    if (m.dir === 'in') {
      const b = room.takeCargo(pid, from, goods, uids);
      if (!b) return send(ws, { t: 'error', code: 'badTarget', detail: 'they do not carry that' });
      try {
        if (id.startsWith('wh:') && (await loadsIn(d, id)) + bundleLoads(b) > SITE.loads + 1e-6) throw new ApiError(409, 'warehouse_full', `A warehouse holds ${SITE.loads} loads`);
        await batch(d, [...b.lots.map((l) => putStmt(d, id, l.r, l.n, l.o, l.s ?? 0)), ...b.items.map((it) => placeItemStmt(d, pid, id, it, now))]);
      } catch (e) {
        room.giveCargo(pid, from, b);
        return fail(e);
      }
      send(ws, { t: 'stowed', dir: 'in', site: id, goods: bundleGoods(b), items: b.items.length });
      room.guide.mark(pid, 'haul'); // W-62
      const stowed = b.lots.reduce((a, l) => a + l.n, 0);
      if (stowed > 0) this.write('tasks', () => tallyStmt(d, pid, 'deliver', stowed, Date.now()).run()); // W-62 E7
      if (cartLoads > 0) this.write('escort', () => cartArrived(d, pid, region, cartLoads, Date.now()));
    } else {
      let b: Bundle;
      try {
        const plan = planTake(d, id, await lotsOf(d, id), goods);
        const list = JSON.stringify([...new Set(uids)]);
        const rows = uids.length ? (await d.prepare('SELECT item FROM war_items WHERE place = ?1 AND uid IN (SELECT value FROM json_each(?2))').bind(id, list).all<{ item: string }>()).results : [];
        if (rows.length !== new Set(uids).size) throw new ApiError(409, 'no_item', 'An item is not there');
        await batch(d, [
          ...plan.stmts,
          ...(uids.length
            ? [guard(d, '(SELECT COUNT(*) FROM war_items WHERE place = ?1 AND uid IN (SELECT value FROM json_each(?2))) = ?3', id, list, rows.length), d.prepare('DELETE FROM war_items WHERE place = ?1 AND uid IN (SELECT value FROM json_each(?2))').bind(id, list)]
            : []),
        ]);
        b = { lots: plan.taken.map((l) => ({ r: l.res as never, n: l.amount, o: l.origin, ...(l.seal ? { s: l.seal } : {}) })), items: rows.map((r) => json<Item>(r.item, { uid: '', def: '', rarity: 'common', cond: 0 })) };
      } catch (e) {
        return fail(e);
      }
      const rest = room.giveCargo(pid, from, b);
      if (rest.lots.length || rest.items.length)
        this.write('stow back', () => d.batch([...rest.lots.map((l) => putStmt(d, id, l.r, l.n, l.o, l.s ?? 0)), ...rest.items.map((it) => placeItemStmt(d, pid, id, it, now))]));
      send(ws, { t: 'stowed', dir: 'out', site: id, goods: bundleGoods(b), items: b.items.length - rest.items.length, ...(rest.lots.length ? { left: bundleGoods(rest) } : {}) });
      // W-62 E7: "Fill the stores" counts the day's net, so taking goods out and stowing them back earns nothing
      const out = b.lots.reduce((a, l) => a + l.n, 0) - rest.lots.reduce((a, l) => a + l.n, 0);
      if (out > 0) this.write('tasks', () => tallyStmt(d, pid, 'deliver', -out, Date.now()).run());
    }
    this.save();
  }

  /** M6g: a carry's sealed loads out of escrow into the carrier's packs at A; a carry (sealed) or supply delivered at B. */
  private async stowContract(ws: WebSocket, pid: number, room: WarRoom, m: StowMsg, from: { squad?: number; cart?: number }): Promise<void> {
    const d = this.env.DB!, region = room.region.id, id = m.contract!, now = Date.now();
    const fail = (e: unknown) => {
      if (!(e instanceof ApiError)) throw e;
      send(ws, { t: 'error', code: 'badTarget', detail: `${e.code}: ${e.message}` });
    };
    if (!room.inCourt(pid, from)) return send(ws, { t: 'error', code: 'badTarget', detail: 'not_in_court: Bring them into the market court' });
    if (m.dir === 'out') {
      try {
        const s = await sealedFor(d, pid, id, region, now);
        await batch(d, s.stmts);
        const rest = room.giveCargo(pid, from, { lots: s.lots.map((l) => ({ r: l.res as never, n: l.amount, o: l.origin, s: id })), items: [] });
        if (rest.lots.length) this.write('seal back', () => d.batch(rest.lots.map((l) => putStmt(d, `ct:${id}:g`, l.r, l.n, l.o, id))));
        send(ws, { t: 'stowed', dir: 'out', site: `ct:${id}`, goods: bundleGoods({ lots: s.lots.map((l) => ({ r: l.res as never, n: l.amount, o: l.origin })), items: [] }), items: 0, ...(rest.lots.length ? { left: bundleGoods(rest) } : {}) });
      } catch (e) {
        return fail(e);
      }
    } else {
      let c;
      try {
        c = await contract(d, id);
      } catch (e) {
        return fail(e);
      }
      const want = m.goods ?? (c.res ? { [c.res]: Math.max(0, c.n - c.delivered) } : {});
      const b = room.takeCargo(pid, from, want, [], c.kind === 'carry' ? id : undefined);
      if (!b) return send(ws, { t: 'error', code: 'badTarget', detail: 'they do not carry that' });
      try {
        const r = await deliver(d, pid, id, region, b.lots.map((l) => ({ res: l.r, origin: l.o, seal: 0, amount: l.n })), now);
        if (r.refused) throw new ApiError(409, 'refused', r.refused);
        await batch(d, r.stmts);
        send(ws, { t: 'stowed', dir: 'in', site: `ct:${id}`, goods: bundleGoods(b), items: 0 });
        // W-61: a filled carry or supply contract scores its taker's alliance (peace score, capped a day)
        if (r.done) this.write('peace', async () => scorePeace(this.env, await allianceOf(d, pid), 'contracts', contractPoints(c.reward), Date.now()));
      } catch (e) {
        room.giveCargo(pid, from, b);
        return fail(e);
      }
    }
    this.save();
  }

  /** M6g: the hand-off window (WarRoom.handoff); both confirmed: the M6i checks, then the swap at once. */
  private async handoff(ws: WebSocket, pid: number, room: WarRoom, m: HandoffMsg): Promise<void> {
    const half = m.op === 'offer' ? { from: m.squad !== undefined ? { squad: m.squad } : { cart: m.cart! }, goods: m.goods ?? {}, uids: m.uids ?? [] } : undefined;
    const r = room.handoff(pid, m.with, m.op, half);
    if ('error' in r) return send(ws, { t: 'error', code: r.error, detail: `handoff: ${r.detail}` });
    const tell = (msg: (other: number) => ServerMsg) => {
      for (const p of [r.window.a, r.window.b]) for (const s of this.ctx.getWebSockets(`p:${p}`)) send(s, msg(p === r.window.a ? r.window.b : r.window.a));
    };
    if (m.op === 'cancel') return tell((w) => ({ t: 'handoff', with: w, state: 'closed', why: 'cancelled' }));
    const halves = Object.fromEntries(Object.entries(r.window.halves).map(([k, h]) => [k, { goods: h.goods, uids: h.uids }]));
    if (!r.ready) return tell((w) => ({ t: 'handoff', with: w, state: 'open', halves, ok: r.window.ok, until: r.window.until }));
    const d = this.env.DB;
    const why = d ? await handoffRefusal(d, r.window, Date.now()) : null;
    if (why) {
      room.handoff(pid, m.with, 'cancel');
      return tell((w) => ({ t: 'handoff', with: w, state: 'closed', why }));
    }
    const s = room.swapHandoff(r.window.a, r.window.b);
    if ('error' in s) return tell((w) => ({ t: 'handoff', with: w, state: 'closed', why: s.error }));
    if (d) this.write('handoff', () => handoffDone(d, r.window, s.gave, Date.now()));
    tell((w) => ({ t: 'handoff', with: w, state: 'done', halves }));
    for (const p of [r.window.a, r.window.b]) room.guide.mark(p, 'haul'); // W-62
    this.save();
  }

  /**
   * M4 (RPC from WarWorldDO): the player's squad leaves for `to` over the entry on `side`; its persons are marked in
   * transit in D1 (`region = '>' + to`) before the world records the transfer.
   */
  async depart(region: string, pid: number, who: number | string[], side: Side, to: string, foeRadius: number): Promise<DepartResult> {
    const room = await this.ensure(region);
    if (!room) return { error: 'region', detail: region };
    await this.caughtUp();
    const r = room.depart(pid, who, side, foeRadius);
    if ('error' in r) return r;
    const d = this.env.DB;
    // their fight so far goes to D1 before they leave (the destination loads them from there); queued writes first
    if (d && r.fight) {
      await this.settled();
      await applyFight(d, r.fight.id, region, r.fight.report, Date.now());
    }
    if (d) await d.prepare('UPDATE war_persons SET region = ?3, updated_at = ?4 WHERE region = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(r.ids), `>${to}`, Date.now()).run();
    this.save();
    this.report(room, true);
    this.resume(room);
    return { ids: r.ids, off: r.off, lost: r.lost, ...(r.cargo ? { cargo: r.cargo } : {}) };
  }

  /**
   * M4 (RPC from WarWorldDO): persons `ids` of the player (alliance `team`) in transit to this region come in over the
   * entry on `side`, if the alliance's quota has room (else the world keeps them waiting). D1 marks them deployed here.
   */
  async arrive(region: string, pid: number, team: number, ids: string[], side: Side, lost: Record<string, number> = {}, cargo?: TransitCargo): Promise<ArriveResult> {
    const room = await this.ensure(region);
    const d = this.env.DB;
    if (!room || !d) return { error: 'unavailable' };
    await this.caughtUp();
    const road = `>${region}`;
    const got = await deployed(d, road, ids);
    const persons = ids.flatMap((id) => got.get(id) ?? []);
    if (!persons.length) return { error: 'gone' };
    const r = room.arrive(pid, team, persons, side, lost, cargo);
    if ('error' in r) return r;
    if (cargo) room.guide.mark(pid, 'haul'); // W-62: a caravan in
    await d.batch([
      d.prepare('UPDATE war_persons SET region = ?1, updated_at = ?4 WHERE region = ?3 AND id IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(persons.map((p) => p.id)), road, Date.now()),
      d.prepare('UPDATE war_persons SET region = NULL WHERE region = ?2 AND id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(ids), road),
      ...(cargo ? [tallyStmt(d, pid, 'caravan', 1, Date.now())] : []), // W-62 E7 tasks
    ]);
    if (r.msg) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, r.msg);
    this.save();
    this.report(room, true);
    this.resume(room);
    return { ok: true };
  }

  private world() {
    return this.env.WAR_WORLD.get(this.env.WAR_WORLD.idFromName(WORLD_NAME));
  }

  /** M4: tell the world what its map shows of this region, when it changed (world regions only). */
  private report(room: WarRoom, now = false): void {
    if (!isWorldRegion(room.region.id) || (!now && room.currentTick % REPORT_TICKS !== 0)) return;
    const s = JSON.stringify(room.summary());
    if (s === this.reported) return;
    this.reported = s;
    const world = this.world();
    this.ctx.waitUntil(world.report(room.region.id, room.summary()).then(() => undefined, (e) => {
      this.reported = '';
      logError('war_report_failed', e, { region: room.region.id });
    }));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private drop(ws: WebSocket): void {
    const me = ws.deserializeAttachment() as Attachment | null;
    ws.serializeAttachment(null);
    if (me && this.room && !this.ctx.getWebSockets(`p:${me.pid}`).some((o) => o !== ws && o.deserializeAttachment() !== null)) {
      this.room.leave(me.pid);
      this.flushReleased(this.room);
    }
  }

  async alarm(): Promise<void> {
    if (this.timer) return void (await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS));
    // dormant, or evicted while armies stood: the region comes back (from its saved state), catches up and sleeps again
    if (!this.room) {
      const region = await this.ctx.storage.get<string>('region');
      if (region && (await this.ctx.storage.get(STATE_META))) await this.ensure(region);
    }
    const room = this.room;
    if (!room) return;
    // a stale keepalive on a region already at rest: nothing to do (the loop rested it when it stopped)
    if (!room.active()) return;
    const behind = await this.caughtUp();
    if (this.room === room) this.resume(room, behind);
    await this.saving;
  }

  /** A socket is open (its player may not have joined yet). */
  private connected(): boolean {
    return this.ctx.getWebSockets().some((ws) => ws.deserializeAttachment() !== null);
  }

  /**
   * The loop is not running: run live when armies stand and a socket is open; with armies and nobody here, sleep till the
   * next batch (DORMANT_MS; BEHIND_MS while still `behind`); an empty region rests (its state dropped, its memory kept).
   */
  private resume(room: WarRoom, behind = 0): void {
    if (this.timer) return;
    if (room.active() && this.connected()) return this.start();
    this.report(room, true);
    if (room.active()) {
      this.save();
      void this.ctx.storage.setAlarm(Date.now() + (behind > 0 ? BEHIND_MS : DORMANT_MS));
      return;
    }
    if (this.env.DB) this.write('settle report', () => this.reportSettlements(room, 'all')); // W-63: before its state goes
    this.save();
  }

  /**
   * A dormant region plays out the ticks it missed since clockAt, in one go: the same sim ticks as the live loop, with
   * their D1 writes, but no frames (nobody is connected) and the D1 polls (guards, works, settlements and levies, world
   * events) once after the batch instead of every few seconds. At most BATCH ticks a call; a gap over MAX_LAG is cut.
   * An empty region does not tick (as live). No-op while the loop runs. Returns the ticks still behind. `polls`: false
   * for a slice of caughtUp (it polls once at its end).
   */
  catchUp(now = Date.now(), max = BATCH, polls = true): number {
    const room = this.room;
    if (!room || this.timer) return 0;
    if (!room.active()) {
      this.clockAt = now;
      return 0;
    }
    let due = Math.floor((now - this.clockAt) / TICK_MS);
    if (due > MAX_LAG) {
      log('warn', 'war_catchup_cut', { region: room.region.id, ticks: due - MAX_LAG });
      this.clockAt = now - MAX_LAG * TICK_MS;
      due = MAX_LAG;
    }
    if (due <= 0) return 0;
    const n = Math.min(due, max);
    let i = 0;
    for (; i < n && room.active(); i++) {
      let r: ReturnType<WarRoom['tick']>;
      try {
        r = room.tick();
      } catch (e) {
        logError('war_tick_failed', e, { region: room.region.id, catchUp: true });
        this.clockAt = now; // do not retry a broken tick on every alarm
        return 0;
      }
      this.outputs(room, r, true);
    }
    this.clockAt = room.active() ? this.clockAt + i * TICK_MS : now;
    this.ran += i;
    if (polls) this.polls(room);
    return room.active() ? due - i : 0;
  }

  /** After a catch-up: the D1 polls (guards, works, settlements and levies) and world events, once. */
  private polls(room: WarRoom): void {
    const d = this.env.DB;
    if (d) this.write('peace poll', () => this.pollPeace(room));
    if (d) this.write('settle poll', async () => (await this.pollSettlements(room), await this.reportSettlements(room)));
    void this.applyEvents(room).catch((e) => logError('war_world_events_failed', e));
  }

  /**
   * catchUp in slices of SLICE ticks, yielding to the event loop between them (sockets, RPCs and the alarm are served
   * meanwhile), at most `max` ticks in all (one event's CPU); callers meanwhile share the run. Stops once the loop runs or
   * the room is gone. Returns the ticks still behind.
   */
  private caughtUp(max = BATCH): Promise<number> {
    const room = this.room;
    if (!room || this.timer) return Promise.resolve(0);
    if (this.draining) return this.draining;
    const run = (async () => {
      let left = max, behind = 0, ran = false;
      while (left > 0 && this.room === room && !this.timer) {
        const t = room.currentTick;
        behind = this.catchUp(Date.now(), Math.min(SLICE, left), false);
        left -= room.currentTick - t;
        ran ||= room.currentTick > t;
        if (behind <= 0 || room.currentTick === t) break;
        await new Promise((ok) => setTimeout(ok, 0));
      }
      if (ran && this.room === room) this.polls(room);
      return this.room === room && !this.timer ? behind : 0;
    })();
    this.draining = run;
    void run.finally(() => this.draining === run && (this.draining = null));
    return run;
  }

  private start(): void {
    if (this.timer) return;
    this.next = performance.now() + TICK_MS;
    this.timer = setTimeout(() => this.loop(), TICK_MS);
    void this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  /** Save the room's state to DO storage (or drop it once the region is empty). Saves run one at a time, in order. */
  private save(): void {
    const room = this.room;
    if (!room) return;
    this.savedAt = room.currentTick;
    const st = room.alive() === 0 && room.online() === 0 ? null : { ...room.saveState(), edition: edition(room.region.id) };
    const at = this.clockAt;
    this.saving = this.saving.then(() => storeState(this.ctx.storage, st, at)).catch((e) => logError('war_save_failed', e));
    this.ctx.waitUntil(this.saving);
    // M7f: what the region remembers once it empties (DO storage always; D1 when it changed)
    const mem = room.memory(), mjson = JSON.stringify(mem), rem = remembered(mem, Date.now(), WAR_SEASON.id, regionVersion(room.region.id));
    this.saving = this.saving.then(() => storeMemory(this.ctx.storage, rem)).catch((e) => logError('war_memory_failed', e));
    // M6e: what its holders hold, for the stash screen (D1 snapshot; the room state above is the truth)
    const d = this.env.DB, rows = room.holdRows();
    if (d && mjson !== this.memory) {
      this.memory = mjson;
      this.write('memory', () => writeMemory(d, room.region.id, rem));
    }
    if (d) this.write('holds', () => saveRegionHolds(d, room.region.id, rows, Date.now()));
  }

  private flushReleased(room: WarRoom): void {
    const ids = room.takeReleased();
    if (ids.length && this.env.DB) this.write('release', () => release(this.env.DB!, room.region.id, ids));
  }

  /** Queue a D1 write; writes run one at a time, in order, each retried a few times (they are idempotent). */
  private write(what: string, run: () => Promise<unknown>): void {
    this.writes.push({ what, run });
    this.writing ??= this.drain().finally(() => (this.writing = null));
    this.ctx.waitUntil(this.writing);
  }

  private async drain(): Promise<void> {
    for (let w = this.writes.shift(); w; w = this.writes.shift()) {
      for (let k = 1; ; k++) {
        try {
          await w.run();
          break;
        } catch (e) {
          if (k >= WRITE_TRIES) {
            logError('war_write_failed', e, { what: w.what });
            break;
          }
          await new Promise((r) => setTimeout(r, 200 * 2 ** k));
        }
      }
    }
  }

  /** Test hook: wait for queued D1 writes and state saves. */
  async settled(): Promise<void> {
    while (this.writing) await this.writing;
    await this.saving;
  }

  private loop(): void {
    const room = this.room;
    // nothing standing, or nobody connected: the loop stops (the region rests or goes dormant: resume)
    if (!room || !room.active() || !this.connected()) {
      this.timer = null;
      if (room) this.resume(room);
      return;
    }
    const t0 = performance.now();
    const late = t0 - this.next;
    let r: ReturnType<WarRoom['tick']>;
    try {
      r = room.tick(() => performance.now());
    } catch (e) {
      logError('war_tick_failed', e);
      this.timer = null;
      return;
    }
    this.clockAt = Date.now();
    const t1 = performance.now();
    let bytes = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a) continue;
      const w = r.admitted.get(a.pid);
      if (w) send(ws, w);
      if (w?.t === 'welcome') void this.guideStart(a.pid, room); // W-62: in from the line
      if (w?.t === 'welcome') void this.storyStart(a.pid, room); // W-65
      if (w?.t === 'welcome') this.sendSettlements(room, a.pid, true); // W-63
      for (const m of r.msgs.get(a.pid) ?? []) send(ws, m); // the economy view (nodes, influence)
      const f = r.frames.get(a.pid);
      if (f) {
        try { ws.send(f); bytes += f.length; } catch { /* closing */ }
      }
    }
    this.outputs(room, r, false);
    const t2 = performance.now();
    const total = t2 - t0;
    if (total > TICK_MS) this.overruns++;
    this.times.push({ ...r.times, totalMs: total, sendMs: t2 - t1, bytes, units: room.alive(), clients: r.frames.size, lateMs: late });
    if (this.times.length > HISTORY) this.times.shift();
    // fixed-rate schedule; if far behind, skip ahead rather than burst
    this.next += TICK_MS;
    const now = performance.now();
    if (this.next < now - TICK_MS) this.next = now;
    this.timer = setTimeout(() => this.loop(), Math.max(0, this.next - now));
  }

  /** A tick's outputs into D1, the world and storage (`catching`: a catch-up tick; its polls and save come after the batch). */
  private outputs(room: WarRoom, r: ReturnType<WarRoom['tick']>, catching: boolean): void {
    const d = this.env.DB;
    // W-62 E7: a fight written now also tallies wins and kills for the tasks
    // W-64: and books shares in the crown's war goals in this region
    if (d) for (const f of r.fights) this.write(`fight ${f.id}`, async () => (await applyFight(d, f.id, room.region.id, f.report, Date.now())) && (await batch(d, fightTallies(d, f.report, Date.now())), await bookFight(d, room.region.id, f.report, Date.now())));
    if (d && r.gathered.length) this.write('gathered', () => d.batch(r.gathered.map(([p, m, n]) => tallyStmt(d, p, m, n, Date.now()))));
    if (d && r.raided.length) {
      const at = Date.now();
      this.write('raid', () => freeRaided(d, room.region.id, r.raided, at));
    }
    // W-60: a claimed soul is a new man of the player, deployed here; the insert checks the cap again (another region may
    // have filled the army meanwhile): refused, the man leaves the field
    if (d) for (const c of r.souls) this.write(`soul ${c.person.id}`, async () => {
      const ok = await claimSoul(d, c.pid, c.person, room.region.id, Date.now());
      if (!ok) room.sim.dropPersons([c.person.id]);
      else await tallyStmt(d, c.pid, 'soul', 1, Date.now()).run(); // W-62 E7
      room.setArmy(c.pid, await armyCount(d, c.pid));
    });
    if (r.guided.length) this.guided(r.guided);
    if (r.storied.length) this.storied(r.storied); // W-65
    if (d && r.crafted.length) this.write('crafted', () => applyCrafts(d, room.region.id, room.run, r.crafted, Date.now()));
    if (d) for (const b of r.bosses) this.write(`boss ${b.boss}`, () => applyBossKill(d, room.region.id, room.run, b, Date.now()));
    // M7f: a temple or shrine razed costs the razer's alliance score
    if (r.sacrilege.length && isWorldRegion(room.region.id)) {
      const world = this.world();
      for (const a of r.sacrilege) this.ctx.waitUntil(world.sacrilege(a as AllianceId).catch((e) => logError('war_sacrilege_failed', e)));
    }
    if (d && r.freed.length) this.write('unmend', () => returnMends(d, room.region.id, r.freed));
    // W-61: build labour, guard checks and alliance-work labour into D1; the watched contracts, works and bonuses polled
    const pz = r.peace;
    if (d && pz) this.write('peace', async () => {
      const at = Date.now(), region = room.region.id;
      for (const l of pz.labour) await labourDone(this.env, l.pid, region, l.site, l.secs, at);
      for (const g of pz.guards) await guardCheck(this.env, g.id, g.held, g.secs, at);
      for (const w of pz.works) await addLabour(this.env, w.team, w.work, w.by, at);
    });
    if (d && !catching && room.currentTick % PEACE_POLL === 1) this.write('peace poll', () => this.pollPeace(room));
    // W-63: camps founded, attacks logged and told; the settlements polled, reported and levied
    const st = r.settle;
    if (d && st?.found.length) this.write('found', () => this.foundAll(room, st.found));
    if (d && st?.attacks.length) this.write('attacks', () => this.attacked(room, st.attacks));
    if (d && !catching && room.currentTick % SETTLE_POLL === 3) this.write('settle poll', () => this.pollSettlements(room));
    // W-62: an event that ran out while the world could not tell us ends here too
    if (!catching && room.currentTick % PEACE_POLL === 2) void this.applyEvents(room).catch((e) => logError('war_world_events_failed', e));
    // M6i: a cart captured between linked accounts goes back to its owner
    if (d && r.captured.length) this.write('captures', async () => {
      for (const c of await linkedCaptures(d, r.captured, Date.now())) room.sim.setCartOwner(c.cart, c.team, c.from);
    });
    this.flushReleased(room);
    if (catching) return;
    this.report(room);
    if (r.fights.length || r.crafted.length || r.bosses.length || r.freed.length || r.souls.length || r.admitted.size || room.currentTick - this.savedAt >= SAVE_TICKS) this.save();
  }

  /** W-61: the region's taken guard contracts, its alliance's open works (a home) and every alliance's work bonuses. */
  private async pollPeace(room: WarRoom): Promise<void> {
    const d = this.env.DB;
    if (!d) return;
    const region = room.region.id, now = Date.now();
    const guards = [];
    for (const c of await workContracts(d, region, now)) {
      if (c.kind !== 'guard' || !c.taker) continue;
      const team = await allianceOf(d, c.poster);
      if (team !== null) guards.push({ id: c.id, team, taker: c.taker, men: c.men });
    }
    room.setGuards(guards);
    const home = ALLIANCES.find((a) => a.home === region);
    if (home) room.setWorks(home.id, await openWorks(d, home.id));
    const b = await bonusesOf(d);
    for (const a of ALLIANCES) room.sim.setBonus(a.id, b.get(a.id) ?? {});
  }

  // ---------------------------------------------------------------- W-63 shared settlements

  /** The region's settlements from D1 into the room (banners turn there); clients whose view changed hear it. */
  private async loadSettlements(room: WarRoom): Promise<void> {
    const d = this.env.DB;
    if (!d) return;
    this.settles = await loadRegionSettlements(d, room.region.id);
    room.setSettlements(this.settles);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && this.settleSent.has(a.pid)) this.sendSettlements(room, a.pid);
    }
  }

  /** The player's view of the settlements, when it changed (`fresh`: anyway, a welcome). */
  private sendSettlements(room: WarRoom, pid: number, fresh = false): void {
    const list = room.settlementsFor(pid), k = JSON.stringify(list);
    if (!fresh && this.settleSent.get(pid) === k) return;
    this.settleSent.set(pid, k);
    for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, { t: 'settlements', list });
  }

  /** A fresh field: each settlement's persisting pieces laid down again under its lord's alliance; centres re-keyed in D1. */
  private async restoreSettlements(room: WarRoom): Promise<void> {
    const d = this.env.DB!, region = room.region.id;
    const rows = (await d.prepare('SELECT id, persist FROM war_settlements WHERE region = ?1 ORDER BY id').bind(region).all<{ id: number; persist: string }>()).results;
    if (!rows.length) return;
    const list = await loadRegionSettlements(d, region), moved: [number, number][] = [];
    for (const row of rows) {
      const s = list.find((x) => x.id === row.id), pieces = json<Persist>(row.persist, {}).pieces ?? [];
      if (!s || s.team === null || !pieces.length) continue;
      const centre = room.restorePieces(s.team, s, pieces);
      if (centre !== null) moved.push([s.id, centre]);
    }
    // the old centre ids mean nothing on the new field: off them all first (unique per region), then the new ones
    await d.batch([
      d.prepare('UPDATE war_settlements SET centre_piece = -id WHERE region = ?1').bind(region),
      ...moved.map(([id, c]) => d.prepare('UPDATE war_settlements SET centre_piece = ?2 WHERE id = ?1').bind(id, c)),
    ]);
  }

  /** Finished camps reported: each founds a settlement round it (the spot the map allows), its placer the lord. */
  private async foundAll(room: WarRoom, list: readonly { centre: number; x: number; y: number; lord: number }[]): Promise<void> {
    const d = this.env.DB!, region = room.region.id, home = ALLIANCES.some((a) => a.home === region);
    for (const f of list) {
      try {
        await found(d, { region, centre: f.centre, x: f.x, y: f.y, lord: f.lord }, (c) => foundRefusal(room.snapshot(), home, c), Date.now());
      } catch (e) {
        if (!(e instanceof ApiError)) throw e; // too close, a bad spot: it stays a plain camp
      }
    }
    await this.loadSettlements(room);
  }

  /** Attacks on settlements: logged (truces broken), their lord and overlords' lords told over the world. */
  private async attacked(room: WarRoom, list: readonly { by: number; victim: number }[]): Promise<void> {
    const d = this.env.DB!, region = room.region.id;
    for (const a of list) {
      const r = await logAttack(d, a.by, a.victim, Date.now());
      const name = this.settles.find((s) => s.id === a.victim)?.name ?? '';
      if (r.tell.length && this.env.WAR_WORLD) await this.world().notify(r.tell, { t: 'settlementAttacked', settlement: a.victim, name, region, by: a.by, broken: r.broken }).catch((e) => logError('war_settle_notify_failed', e, { region }));
      // W-64: a pact or truce between the attacker's alliance and the victim's breaks; both alliances hear it
      const p = await pactAttack(d, a.by, a.victim, Date.now());
      if (p.tell.length && this.env.WAR_WORLD) await this.world().notify(p.tell, { t: 'crownNews', kind: 'pactBroken', text: p.text, region }).catch((e) => logError('war_crown_notify_failed', e, { region }));
    }
  }

  /** Every SETTLE_POLL: the settlements again; every SETTLE_REPORT their reports; tribute when a levy is due. */
  private async pollSettlements(room: WarRoom): Promise<void> {
    await this.loadSettlements(room);
    if (room.currentTick % SETTLE_REPORT === 3) await this.reportSettlements(room);
    for (const s of this.settles) if (s.overlord !== null) await this.levyOne(room, s);
  }

  /** Level, tending and persisting pieces into D1 (`all`: the pieces even when unchanged; `persist`: only them, the season's end). */
  private async reportSettlements(room: WarRoom, mode: 'tick' | 'all' | 'persist' = 'tick'): Promise<void> {
    const d = this.env.DB!, now = Date.now();
    for (const r of room.settlementReports()) {
      const p = JSON.stringify(r.persist), fresh = mode !== 'tick' || this.persisted.get(r.id) !== p;
      const live = mode === 'persist' ? {} : { ...(r.level > 0 ? { level: r.level } : {}), tended: r.tended };
      await reportSettlement(d, r.id, { ...live, ...(fresh ? { persist: r.persist } : {}) }, now);
      this.persisted.set(r.id, p);
    }
  }

  /**
   * A vassal's tribute, every LEVY_MS: its store gain and its citizens' stall coin since the last levy (DO storage keeps
   * where they stood then); the overlord's lord credited, the same taken out of the store (the room) and the stalls (the
   * credit's batch). A failed levy puts the store's share back.
   */
  async levyOne(room: WarRoom, s: RoomSettlement, now = Date.now()): Promise<void> {
    const d = this.env.DB!, region = room.region.id;
    const citizens = s.members.filter((m) => m.role === 'citizen').map((m) => m.pid);
    const stalls: Record<number, number> = {};
    for (const pid of citizens) stalls[pid] = (await goodsOf(d, stallId(region, pid))).coin ?? 0;
    const store = room.storeGoods(s.id);
    const base = await this.ctx.storage.get<LevyBase>(levyKey(s.id));
    if (!base) return void (await this.ctx.storage.put(levyKey(s.id), { store, stalls } satisfies LevyBase));
    if (now - s.leviedAt < LEVY_MS) return;
    const gain: Record<string, number> = {};
    for (const [k, n] of Object.entries(store)) if (n - (base.store[k] ?? 0) > 1e-6) gain[k] = n - (base.store[k] ?? 0);
    const k = Math.max(0, Math.min(SETTLE.tributeMax, s.tribute)) / 100, coin: Record<number, number> = {}, takeStall: Record<number, number> = {};
    for (const pid of citizens) {
      coin[pid] = Math.max(0, stalls[pid] - (base.stalls[pid] ?? 0));
      const t = Math.round(coin[pid] * k * 1000) / 1000;
      if (t > 0) takeStall[pid] = t;
    }
    const stallCoin = Object.values(coin).reduce((a, b) => a + b, 0), fromStalls = Object.values(takeStall).reduce((a, b) => a + b, 0);
    const want = tributeOf(s.tribute, gain, stallCoin), fromStore: Record<string, number> = { ...want };
    if (fromStore.coin !== undefined) fromStore.coin = Math.round((fromStore.coin - fromStalls) * 1000) / 1000;
    for (const [g, n] of Object.entries(fromStore)) if (n <= 1e-9) delete fromStore[g];
    if (!room.takeStore(s.id, fromStore)) return;
    let got: Awaited<ReturnType<typeof levy>> = null;
    try {
      const extra: D1PreparedStatement[] = [];
      for (const [pid, n] of Object.entries(takeStall)) {
        const id = stallId(region, Number(pid));
        extra.push(...planTake(d, id, await lotsOf(d, id), { coin: n }).stmts);
      }
      got = await levy(d, s.id, gain, stallCoin, now, extra);
    } finally {
      if (!got) room.putStore(s.id, fromStore);
    }
    const after: Record<number, number> = {};
    for (const pid of citizens) after[pid] = stalls[pid] - (takeStall[pid] ?? 0);
    await this.ctx.storage.put(levyKey(s.id), { store: room.storeGoods(s.id), stalls: after } satisfies LevyBase);
    this.save();
  }

  /** W-63 (RPC, the terms route): do at least SETTLE.presence of the player's men stand on settlement `id`'s ground? */
  async presence(region: string, pid: number, id: number): Promise<boolean> {
    const room = await this.ensure(region);
    if (!room) return false;
    if (await this.caughtUp()) this.save();
    if (!room.settlement(id)) await this.loadSettlements(room);
    return room.presence(pid, id);
  }

  /** The live loop's mean tick time (ms: step, frames, sends) over its last 10 ticks, for the client's network readout (pong). */
  private tickMs(): number {
    const h = this.times.slice(-10);
    return h.length ? +(h.reduce((a, x) => a + x.totalMs, 0) / h.length).toFixed(1) : 0;
  }

  /** Tick-time and bandwidth figures over the last HISTORY ticks (or ?last=N). */
  private stats() {
    const room = this.room, h = this.times;
    const pick = (k: keyof (typeof h)[number]) => {
      const v = h.map((x) => x[k]).sort((a, b) => a - b);
      if (!v.length) return null;
      const avg = v.reduce((a, b) => a + b, 0) / v.length;
      return { avg: +avg.toFixed(3), p95: +v[Math.floor(v.length * 0.95)].toFixed(3), max: +v[v.length - 1].toFixed(3) };
    };
    return {
      region: room?.region.id ?? null, tick: room?.currentTick ?? 0, running: !!this.timer, caughtUp: this.ran, behindMs: this.timer ? 0 : Date.now() - this.clockAt, ticks: h.length, overruns: this.overruns,
      units: room?.alive() ?? 0, online: room?.online() ?? 0, quota: room?.quota() ?? null,
      totalMs: pick('totalMs'), stepMs: pick('stepMs'), snapMs: pick('snapMs'), netMs: pick('netMs'), sendMs: pick('sendMs'), lateMs: pick('lateMs'),
      bytesPerTick: pick('bytes'), clientsPerTick: pick('clients'),
      ...(room ? { wild: room.wild() } : {}),
    };
  }
}

/** The war season and the authored region's version a saved room belongs to. */
export const edition = (region: string): string => `${WAR_SEASON.id}:${regionVersion(region)}`;

const STATE_META = 'state:meta';
/** Bytes per stored chunk (under the 128 KiB value limit of either storage backend). */
const CHUNK = 120_000;

async function gzip(s: string): Promise<Uint8Array> {
  const body = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(body).arrayBuffer());
}
async function gunzip(b: Uint8Array): Promise<string> {
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** The room state gzipped in chunks, written in one atomic put (null: the region is empty, drop it). */
export async function storeState(storage: DurableObjectStorage, st: RoomState | null, at = Date.now()): Promise<void> {
  const old = (await storage.get<{ n: number }>(STATE_META))?.n ?? 0;
  if (!st) {
    await storage.delete([STATE_META, ...Array.from({ length: old }, (_, i) => `state:${i}`)]);
    return;
  }
  const z = await gzip(JSON.stringify(st));
  const n = Math.ceil(z.length / CHUNK);
  const put: Record<string, unknown> = { [STATE_META]: { n, region: st.region, tick: st.tick, bytes: z.length, at } };
  for (let i = 0; i < n; i++) put[`state:${i}`] = z.slice(i * CHUNK, (i + 1) * CHUNK);
  await storage.put(put);
  if (old > n) await storage.delete(Array.from({ length: old - n }, (_, i) => `state:${n + i}`));
}

export async function loadState(storage: DurableObjectStorage): Promise<RoomState | null> {
  const meta = await storage.get<{ n: number }>(STATE_META);
  if (!meta) return null;
  const parts = await storage.get<Uint8Array>(Array.from({ length: meta.n }, (_, i) => `state:${i}`));
  const z = new Uint8Array(meta.n * CHUNK);
  let at = 0;
  for (let i = 0; i < meta.n; i++) {
    const p = parts.get(`state:${i}`);
    if (!p) return null;
    z.set(p, at);
    at += p.length;
  }
  const st = JSON.parse(await gunzip(z.subarray(0, at))) as RoomState;
  return st.v === 2 ? st : null;
}

function send(ws: WebSocket, m: ServerMsg): void {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // closing; webSocketClose cleans up
  }
}
