/**
 * WarWorldDO: the one strategic world object (M4, named WORLD_NAME; binding WAR_WORLD). Owns a World (./world.ts):
 * region ownership and influence fed by the region rooms (report), squads in transit between regions, and the world
 * map pushed to players.
 *
 *  - State: the World's state as one value in DO storage, written after every change; an evicted object reloads it on
 *    its next call or its alarm. The alarm fires at the next arrival (or queued retry).
 *  - D1: persons in transit carry `region = '>' + to` (no join, no API change touches them meanwhile); the destination
 *    room sets `region = to` when they arrive. On load, persons marked in transit that the world does not know (a crash
 *    between the departure and the save) are sent home.
 *  - Region rooms are reached over RPC (WarRegionDO.depart / arrive).
 *  - Season: the alarm also fires at the season's end (or when the hegemony clock runs out); the World accrues the
 *    score on every report and alarm. At the end the result is frozen in the world state and kept under
 *    `result:<season id>` (seasonEnded, the hook later rewards hang on); resetSeason() starts the next one.
 *  - W-62 world events (src/war/world/events.ts): the same alarm opens and closes them (next due wins: arrivals, retries,
 *    event boundaries, the season's end); each change is told to every region room (WarRegionDO.worldEvents: the effect
 *    where it runs, a banner for everyone).
 *  - W-62 season war: once the season is over the alarm rolls it over (rollover): the board is kept (D1
 *    war_season_results and `last` in the world state), the winners' banners and the titles' crests awarded
 *    (./seasonWar.ts), every region but the homes starts over (WarRegionDO.seasonReset: landmarks and control; its men go
 *    home with their gear) and the next season begins with fresh owners and score. Men, gear and titles stay.
 *  - Sockets (/ws/war/world, hibernation API): the Worker authenticates and forwards x-player-id and x-alliance; each
 *    gets the snapshot on connect and again after changes, at most once per PUSH_MS. Messages: src/war/net/world.ts.
 *  - W-62 E6 chat (`?chat=1`: a chat-only socket, tagged `chat:<alliance>`, no snapshots): on connect the alliance's
 *    last messages and the player's mutes; a message or mark goes to every chat socket of the sender's alliance only,
 *    through the rate gate (./chat.ts ChatGate), free text masked and kept in D1 (./chat.ts).
 *  - W-63: notify() passes a region room's notice (a settlement attacked) to players' world sockets; the rollover sweeps
 *    the settlements once every region wrote what persists of them (../settlements.ts seasonSweep).
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../../env';
import { logError } from '../../telemetry/log';
import { parseWorldMsg, type WorldClientMsg, type RegionState, type SeasonResult, type SeasonSnap, type TransferError, type TransferOrder, type TransitSnap, type WorldServerMsg, type WorldSnapshot } from '../../../../src/war/net/world';
import type { AllianceId, Side } from '../../../../src/war/world/types';
import { scoreRate } from '../../../../src/war/world/season';
import { WAR_SEASON } from '../../../../src/war/world/alliances';
import { allianceCounts } from './members';
import { boardsSeen, hasNode } from '../tradeScore';
import type { TransitCargo } from '../../../../src/war/net/world';
import { snapOf, World, type ArriveResult, type DepartResult, type Ports, type RegionReport, type WorldState } from './world';
import { WORLD_REGIONS } from '../../../../src/war/world/regions';
import type { Crest } from '../../../../src/war/net/world';
import { buildBoard, crestsOf, recordSeason } from './seasonWar';
import { ChatGate, chatHistory, chatMute, chatMutes, chatReport, chatStore } from './chat';
import type { ChatMsg, Mark } from '../../../../src/war/net/chat';
import { seasonSweep } from '../settlements';

const STATE = 'world';
const PUSH_MS = 1000;

interface Attachment { pid: number; alliance: AllianceId | null; /** W-62 E6: a chat socket (its player's name). */ chat?: string }

export class WarWorldDO extends DurableObject<Env> {
  private world: World | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private arriving: Promise<void> = Promise.resolve();
  /** W-62: each player's banners and crests (D1), read once per player and dropped at a rollover. */
  private crests = new Map<number, Crest[]>();
  /** W-62 E6: the chat's rate gate; mark ids (marks are not kept). */
  private gate = new ChatGate();
  private markSeq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async ensure(): Promise<World> {
    if (this.world) return this.world;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.world) return;
      const st = await this.ctx.storage.get<WorldState>(STATE);
      const fast = this.env.DEV_AUTH === '1' ? Number(this.env.WAR_TRAVEL_SCALE) : NaN;
      const w = new World(st?.v === 2 ? st : undefined, fast > 0 ? { ...WAR_SEASON, travelScale: fast, offExitMsPerTile: WAR_SEASON.offExitMsPerTile * fast } : WAR_SEASON);
      const d = this.env.DB;
      if (d) {
        // persons marked on the road that the world does not carry go home
        const known = w.personsInTransit();
        const rows = (await d.prepare("SELECT id FROM war_persons WHERE region LIKE '>%'").all<{ id: string }>()).results;
        const lost = rows.map((r) => r.id).filter((id) => !known.has(id));
        if (lost.length) await d.prepare("UPDATE war_persons SET region = NULL WHERE region LIKE '>%' AND id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(lost)).run();
      }
      this.world = w;
    });
    return this.world!;
  }

  private ports(): Ports {
    const stub = (id: string) => this.env.WAR_REGION.get(this.env.WAR_REGION.idFromName(id));
    return {
      depart: (from: string, pid: number, who: number | string[], side: Side, to: string, foeRadius: number) => stub(from).depart(from, pid, who, side, to, foeRadius) as Promise<DepartResult>,
      arrive: (to: string, pid: number, alliance: AllianceId, ids: string[], side: Side, lost?: Record<string, number>, cargo?: TransitCargo) => stub(to).arrive(to, pid, alliance, ids, side, lost, cargo) as Promise<ArriveResult>,
    };
  }

  /** Save the state, set the alarm for the next arrival (or the season's end) and push the map to sockets. */
  private async commit(w: World): Promise<void> {
    await this.ctx.storage.put(STATE, w.st);
    // a season over rolls over at once (W-62); else the next arrival, event boundary or the season's end
    const at = w.st.season.ended ? Date.now() : w.nextAlarm();
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 10));
    this.schedulePush();
  }

  /** A transfer order of player `pid` (alliance looked up by the Worker). */
  async transfer(pid: number, alliance: AllianceId | null, o: TransferOrder): Promise<{ transit: TransitSnap } | { error: TransferError; detail?: string }> {
    const w = await this.ensure();
    const safe = this.env.DB ? await hasNode(this.env.DB, pid, 'safeRoads') : false;
    const t = await w.transfer(pid, alliance, o, Date.now(), this.ports(), safe);
    if ('error' in t) return t;
    await this.commit(w);
    return { transit: snapOf(t) };
  }

  /** M6h: trade score to an alliance (a scoring fill or contract). */
  async addTrade(alliance: AllianceId, pts: number): Promise<void> {
    const w = await this.ensure();
    w.addTrade(alliance, pts, Date.now());
    await this.commit(w);
  }

  /** W-61: peace score to an alliance (volume, contracts, works: server/src/war/peace.ts). */
  async addPeace(alliance: AllianceId, kind: string, pts: number): Promise<void> {
    const w = await this.ensure();
    w.addPeace(alliance, kind, pts, Date.now());
    await this.commit(w);
  }

  /** W-61: an alliance work stood: its transfer bonus (a road) for the rest of the season. */
  async setTravel(alliance: AllianceId, k: number): Promise<void> {
    const w = await this.ensure();
    w.setTravel(alliance, k);
    await this.commit(w);
  }

  /** M7f: alliance `alliance` razed a temple or shrine (WarRegionDO). */
  async sacrilege(alliance: AllianceId): Promise<void> {
    const w = await this.ensure();
    w.sacrilege(alliance, Date.now());
    await this.commit(w);
  }

  /** A region room's report (WarRegionDO, every few seconds while it changes). */
  async report(region: string, rep: RegionReport): Promise<{ rejected: boolean }> {
    const w = await this.ensure();
    const r = w.report(region, rep, Date.now());
    if (r.ended) await this.seasonEnded(r.ended, w.st.season.id);
    if (r.changed) await this.commit(w); // the hegemony clock may have moved the season's end
    return { rejected: r.rejected };
  }

  /** The season is over: its result is frozen in the world state; it is also kept on its own key for later rewards. */
  private async seasonEnded(r: SeasonResult, id: number): Promise<void> {
    await this.ctx.storage.put(`result:${id}`, r);
  }

  /** A finished season's result (null: none, or not over yet). */
  async seasonResult(id: number): Promise<SeasonResult | null> {
    return (await this.ctx.storage.get<SeasonResult>(`result:${id}`)) ?? null;
  }

  /** The dev reset hook: the season ends now and rolls over (W-62: its board kept, the partial reset); the new id. */
  async resetSeason(now = Date.now()): Promise<number> {
    await this.arriving;
    const w = await this.ensure();
    const s = w.st.season;
    if (!s.ended) {
      s.endAt = Math.min(s.endAt, now);
      s.hegemony = null;
      const r = w.advance(now);
      if (r) await this.seasonEnded(r, s.id);
    }
    await this.rollover(w, now);
    await this.commit(w);
    return w.st.season.id;
  }

  /**
   * W-62 season war: the finished season's board kept and its cosmetics awarded, every region but the homes reset
   * (landmarks, control; men home with their gear), then the next season with fresh owners, score and events.
   */
  private async rollover(w: World, now: number): Promise<void> {
    const s = w.st.season, r = s.ended;
    if (!r) return;
    const d = this.env.DB;
    let board;
    try {
      board = await buildBoard(d, s.id, s.startAt, r, s.event ?? r.scores.map(() => 0));
      if (d) await recordSeason(d, board, now);
    } catch (e) {
      logError('war_season_record_failed', e, { season: s.id });
      board ??= await buildBoard(undefined, s.id, s.startAt, r, s.event ?? r.scores.map(() => 0));
    }
    const stub = (id: string) => this.env.WAR_REGION.get(this.env.WAR_REGION.idFromName(id));
    await Promise.all(WORLD_REGIONS.filter((x) => x.role !== 'home').map((x) => stub(x.id).seasonReset(x.id).catch((e: unknown) => logError('war_season_reset_failed', e, { region: x.id }))));
    // W-63: every region wrote what persists of its settlements; Town level and up, or tended lately, stay; the rest go
    if (d) await seasonSweep(d, now).catch((e: unknown) => logError('war_settle_sweep_failed', e));
    w.st.last = board;
    w.newSeason(now);
    this.crests.clear();
    this.announce(w, now);
  }

  /**
   * W-63 (RPC from WarRegionDO): a message to these players' world sockets (a settlement of theirs attacked), the
   * chat-only ones too: a region view holds only that one (its HUD shows the notice).
   */
  async notify(pids: number[], m: WorldServerMsg): Promise<void> {
    for (const pid of pids) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, m);
  }

  /** W-62: every region room hears the running and next world events (the effect where one runs, a banner for all). */
  private announce(w: World, now: number): void {
    const events = w.activeEvents(now), next = w.nextEvent(now);
    for (const r of WORLD_REGIONS) {
      const stub = this.env.WAR_REGION.get(this.env.WAR_REGION.idFromName(r.id));
      this.ctx.waitUntil(stub.worldEvents(r.id, events, next).catch((e: unknown) => logError('war_world_events_failed', e, { region: r.id })));
    }
  }

  /** W-62: the world events running now and the next (a region room asks on its start). */
  async worldEvents(now = Date.now()) {
    const w = await this.ensure();
    return { events: w.activeEvents(now), next: w.nextEvent(now) };
  }

  private async crestsFor(pid: number): Promise<Crest[]> {
    const d = this.env.DB;
    if (!d) return [];
    let c = this.crests.get(pid);
    if (!c) this.crests.set(pid, (c = await crestsOf(d, pid)));
    return c;
  }

  /** The public boards' view (server/src/public/snapshot.ts): the season's score and every region's owner. */
  async standings(): Promise<{ season: SeasonSnap; regions: { id: string; owner: number; rate: number }[] }> {
    const w = await this.ensure();
    return { season: w.seasonSnap(Date.now()), regions: Object.values(w.st.regions).map((r) => ({ id: r.id, owner: r.owner, rate: scoreRate(r) })) };
  }

  /** What the world knows of one region (null: not a world region). */
  async regionState(id: string): Promise<RegionState | null> {
    return (await this.ensure()).region(id) ?? null;
  }

  async snapshot(pid: number, alliance: AllianceId | null): Promise<WorldSnapshot> {
    const w = await this.ensure();
    const counts = this.env.DB ? await allianceCounts(this.env.DB) : { members: [0, 0, 0, 0], clans: [0, 0, 0, 0] };
    const snap = w.snapshot(pid, alliance, counts, Date.now());
    if (this.env.DB && alliance !== null) snap.boards = await boardsSeen(this.env.DB, alliance);
    snap.crests = await this.crestsFor(pid);
    return snap;
  }

  /** Arrivals due by `now` (the alarm; tests call it with a later time). One run at a time. */
  async arrivals(now = Date.now()): Promise<void> {
    const run = this.arriving.then(() => this.arrive(now));
    this.arriving = run.catch((e) => logError('war_world_arrivals_failed', e));
    await run;
  }

  private async arrive(now: number): Promise<void> {
    const w = await this.ensure();
    const ev = w.eventTick(now); // first: an event closing with the season still closes
    const ended = w.advance(now);
    if (ended) await this.seasonEnded(ended, w.st.season.id);
    const moved = await w.due(now, this.ports());
    const over = !!w.st.season.ended;
    if (over) await this.rollover(w, now);
    else if (ev.changed) this.announce(w, now);
    if (moved || ended || ev.changed || over) await this.commit(w);
    else {
      const at = w.nextAlarm();
      if (at !== null) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 10));
    }
  }

  async alarm(): Promise<void> {
    await this.arrivals();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const pid = Number(request.headers.get('x-player-id'));
    if (!Number.isSafeInteger(pid) || pid <= 0) return new Response('Missing player', { status: 400 });
    const a = request.headers.get('x-alliance');
    const alliance = a === null || a === '' ? null : (Number(a) as AllianceId);
    const chat = new URL(request.url).searchParams.get('chat') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, chat ? [`p:${pid}`, `chat:${alliance ?? 'none'}`] : [`p:${pid}`]);
    server.serializeAttachment({ pid, alliance, ...(chat ? { chat: request.headers.get('x-player-name') || `Player ${pid}` } : {}) } satisfies Attachment);
    if (chat) {
      const d = this.env.DB;
      send(server, { t: 'chat', you: pid, msgs: d && alliance !== null ? await chatHistory(d, alliance) : [], muted: d ? await chatMutes(d, pid) : [] });
    } else send(server, { t: 'world', ...(await this.snapshot(pid, alliance)) });
    const headers = new Headers();
    const proto = request.headers.get('x-ws-protocol');
    if (proto) headers.set('sec-websocket-protocol', proto);
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me) return;
    const m = typeof message === 'string' ? parseWorldMsg(message) : null;
    if (!m) return send(ws, { t: 'error', code: 'parse' });
    try {
      if (m.t === 'ping') send(ws, { t: 'pong', c: m.c });
      else if (m.t === 'say' || m.t === 'mark' || m.t === 'mute' || m.t === 'report') await this.chat(ws, me, m);
      else {
        const r = await this.transfer(me.pid, me.alliance, { from: m.from, to: m.to, squad: m.squad, ids: m.ids });
        send(ws, 'error' in r ? { t: 'error', code: r.error, detail: r.detail } : { t: 'transferred', transit: r.transit });
      }
    } catch (e) {
      logError('war_world_message_failed', e);
    }
  }

  /** W-62 E6: a chat socket's message (./chat.ts); other sockets may not chat. */
  private async chat(ws: WebSocket, me: Attachment, m: Extract<WorldClientMsg, { t: 'say' | 'mark' | 'mute' | 'report' }>): Promise<void> {
    if (me.chat === undefined) return send(ws, { t: 'error', code: 'parse', detail: 'not a chat socket' });
    const d = this.env.DB, now = Date.now();
    if (m.t === 'mute') return void (d && (await chatMute(d, me.pid, m.pid, m.on, now)));
    if (me.alliance === null) return send(ws, { t: 'chatError', code: 'noAlliance' });
    if (m.t === 'report') {
      if (d) await chatReport(d, me.pid, me.alliance, m.id, now);
      return send(ws, { t: 'chatError', code: 'reported' });
    }
    if (m.t === 'say' && m.text !== undefined && !m.text.trim()) return;
    const g = this.gate.check(me.pid, now);
    if (!g.ok) return send(ws, { t: 'chatError', code: g.code, ...(g.until ? { until: g.until } : {}) });
    if (m.t === 'mark') {
      const mark: Mark = { id: ++this.markSeq, pid: me.pid, name: me.chat, kind: m.kind, at: m.at, x: m.x, y: m.y, t: now };
      return this.toAlliance(me.alliance, { t: 'marked', mark });
    }
    const said = m.phrase !== undefined ? { phrase: m.phrase } : { text: m.text! };
    const msg: ChatMsg = d ? await chatStore(d, me.alliance, me.pid, me.chat, said, now) : { id: ++this.markSeq, pid: me.pid, name: me.chat, at: now, ...said };
    this.toAlliance(me.alliance, { t: 'said', msg });
  }

  private toAlliance(alliance: AllianceId, m: WorldServerMsg): void {
    for (const ws of this.ctx.getWebSockets(`chat:${alliance}`)) send(ws, m);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.serializeAttachment(null);
  }

  private schedulePush(): void {
    if (this.pushTimer || !this.ctx.getWebSockets().length) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.ctx.waitUntil(this.push().catch((e) => logError('war_world_push_failed', e)));
    }, PUSH_MS);
  }

  private async push(): Promise<void> {
    const w = await this.ensure();
    const counts = this.env.DB ? await allianceCounts(this.env.DB) : { members: [0, 0, 0, 0], clans: [0, 0, 0, 0] };
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a || a.chat !== undefined) continue;
      const snap = w.snapshot(a.pid, a.alliance, counts, now);
      if (this.env.DB && a.alliance !== null) snap.boards = await boardsSeen(this.env.DB, a.alliance);
      snap.crests = await this.crestsFor(a.pid);
      send(ws, { t: 'world', ...snap });
    }
  }
}

function send(ws: WebSocket, m: WorldServerMsg): void {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // closing
  }
}
