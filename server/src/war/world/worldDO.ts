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
 *  - W-62 E6 chat (`?chat=1`: a chat-only socket, tagged `chat:<alliance>` and `chat`, no snapshots): on connect the
 *    alliance's and the World channel's last messages and the player's mutes; a message or mark goes to every chat
 *    socket of the sender's alliance only, a W-69 World message (`ch: 'world'`) to every chat socket; both through the
 *    rate gate (./chat.ts ChatGate), free text masked and kept in D1 (./chat.ts), linked men checked as the sender's.
 *  - W-63: notify() passes a region room's notice (a settlement attacked) to players' world sockets; the rollover sweeps
 *    the settlements once every region wrote what persists of them (../settlements.ts seasonSweep).
 *  - W-64: the rollover also ends every crown's term (../crown.ts crownSeason); notify() carries crown news too. The
 *    snapshot carries the crown layer (../crown.ts crownMap: monarchs, pacts), read at most every CROWN_MS and again after news.
 *  - The online cap (`?gate=1`: a gate socket, tagged `gate`, src/war/net/gate.ts; ./gate.ts plans it): at most
 *    WAR_MAX_ONLINE players in the war (admins exempt), the rest in line. The sockets' attachments are the state (no
 *    storage); a tab silent past GATE_EXPIRE_MS (its last auto-answered ping) is closed. While anyone waits or holds a
 *    dropped place, a GATE_SWEEP_MS timer sweeps; else the sweep runs on the gate's events. admitted() answers the
 *    Worker's region socket route.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../../env';
import { log, logError } from '../../telemetry/log';
import { regionStub, runningColo } from '../placement';
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
import { ChatGate, chatHistory, chatMute, chatMutes, chatOwns, chatReport, chatStore, WORLD } from './chat';
import type { ChatMsg, Mark } from '../../../../src/war/net/chat';
import { seasonSweep } from '../settlements';
import { crownMap, crownSeason } from '../crown';
import type { CrownMap } from '../../../../src/war/net/world';
import { GATE_HOLD_MS, GATE_LEAVE, type GateMsg } from '../../../../src/war/net/gate';
import { gateCap, gateEta, planGate, type GateTab } from './gate';

const STATE = 'world';
const PUSH_MS = 1000;
/** W-64: how long the crown layer of the snapshot is reused before D1 is read again. */
const CROWN_MS = 30_000;
/** The gate's sweep while players wait or hold a place. */
const GATE_SWEEP_MS = 10_000;

interface Attachment { pid: number; alliance: AllianceId | null; /** W-62 E6: a chat socket (its player's name). */ chat?: string; /** A gate socket (the online cap): its tab, last place sent (0: in). */ gate?: Omit<GateTab, 'pid' | 'seen'> & { place: number } }

export class WarWorldDO extends DurableObject<Env> {
  private world: World | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private arriving: Promise<void> = Promise.resolve();
  /** W-62: each player's banners and crests (D1), read once per player and dropped at a rollover. */
  private crests = new Map<number, Crest[]>();
  /** W-64: the crown layer (monarchs, pacts) and when it was read; dropped on crown news and at a rollover. */
  private crown: { at: number; map: CrownMap } | null = null;
  /** W-62 E6: the chat's rate gate; mark ids (marks are not kept). */
  private gate = new ChatGate();
  private markSeq = 0;
  /** The gate: places held for players whose last tab dropped by accident (until), when players were let in from the line, the sweep timer. */
  private held = new Map<number, number>();
  private letIn: number[] = [];
  private gateTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tests: the cap instead of WAR_MAX_ONLINE. */
  gateCapOverride: number | null = null;

  /** The data centre this object runs in (docs/OPS.md "War DO placement"), logged once at start. */
  private readonly where: Promise<string>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.where = runningColo(env).catch(() => 'unknown');
    this.ctx.waitUntil(this.where.then((colo) => colo !== 'local' && log('info', 'war_do_colo', { do: 'world', name: ctx.id.name, colo })));
  }

  /** RPC (GET /api/admin/war/where): the data centre this object runs in. */
  colo(): Promise<string> {
    return this.where;
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
    const stub = (id: string) => regionStub(this.env, id);
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
    const stub = (id: string) => regionStub(this.env, id);
    await Promise.all(WORLD_REGIONS.filter((x) => x.role !== 'home').map((x) => stub(x.id).seasonReset(x.id).catch((e: unknown) => logError('war_season_reset_failed', e, { region: x.id }))));
    // W-63: every region wrote what persists of its settlements; Town level and up, or tended lately, stay; the rest go
    if (d) await seasonSweep(d, now).catch((e: unknown) => logError('war_settle_sweep_failed', e));
    // W-64: every crown's term ends (regents until the new elections), votes void, open orders settle
    if (d) await crownSeason(this.env, now).catch((e: unknown) => logError('war_crown_season_failed', e));
    w.st.last = board;
    w.newSeason(now);
    this.crests.clear();
    this.crown = null;
    this.announce(w, now);
  }

  /**
   * W-63 (RPC from WarRegionDO): a message to these players' world sockets (a settlement of theirs attacked), the
   * chat-only ones too: a region view holds only that one (its HUD shows the notice).
   */
  async notify(pids: number[], m: WorldServerMsg): Promise<void> {
    for (const pid of pids) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, m);
    if (m.t === 'crownNews') (this.crown = null), this.schedulePush(); // W-64: the map's crowns and pacts again
  }

  /** W-62: every region room hears the running and next world events (the effect where one runs, a banner for all). */
  private announce(w: World, now: number): void {
    const events = w.activeEvents(now), next = w.nextEvent(now);
    for (const r of WORLD_REGIONS) {
      const stub = regionStub(this.env, r.id);
      this.ctx.waitUntil(stub.worldEvents(r.id, events, next).catch((e: unknown) => logError('war_world_events_failed', e, { region: r.id })));
    }
  }

  /** W-62: the world events running now and the next (a region room asks on its start). */
  async worldEvents(now = Date.now()) {
    const w = await this.ensure();
    // W-72 proposal: the season's start too (the region rooms' warlords count their age from it)
    return { events: w.activeEvents(now), next: w.nextEvent(now), start: w.st.season.startAt };
  }

  private async crownFor(now: number): Promise<CrownMap | undefined> {
    const d = this.env.DB;
    if (!d) return undefined;
    if (!this.crown || now - this.crown.at > CROWN_MS) this.crown = { at: now, map: await crownMap(d, now) };
    return this.crown.map;
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
    snap.crown = await this.crownFor(Date.now());
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
    if (new URL(request.url).searchParams.get('gate') === '1') {
      this.ctx.acceptWebSocket(server, ['gate']);
      server.serializeAttachment({ pid, alliance, gate: { admin: request.headers.get('x-war-admin') === '1', in: false, at: Date.now(), place: -1 } } satisfies Attachment);
      this.gateRun();
      return upgraded(client, request);
    }
    this.ctx.acceptWebSocket(server, chat ? [`p:${pid}`, `chat:${alliance ?? 'none'}`, 'chat'] : [`p:${pid}`]);
    server.serializeAttachment({ pid, alliance, ...(chat ? { chat: request.headers.get('x-player-name') || `Player ${pid}` } : {}) } satisfies Attachment);
    if (chat) {
      const d = this.env.DB;
      send(server, { t: 'chat', you: pid, msgs: d ? await chatHistory(d, alliance) : [], muted: d ? await chatMutes(d, pid) : [] });
    } else send(server, { t: 'world', ...(await this.snapshot(pid, alliance)) });
    return upgraded(client, request);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || me.gate) return; // a gate socket only pings (auto-answered)
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
    if (m.t === 'report') {
      if (d) await chatReport(d, me.pid, me.alliance, m.id, now);
      return send(ws, { t: 'chatError', code: 'reported' });
    }
    const world = m.t === 'say' && m.ch === 'world';
    if (me.alliance === null && !world) return send(ws, { t: 'chatError', code: 'noAlliance' });
    if (m.t === 'say' && m.text !== undefined && !m.text.trim()) return;
    if (m.t === 'say' && m.links && d && !(await chatOwns(d, me.pid, m.links))) return send(ws, { t: 'chatError', code: 'link' });
    const g = this.gate.check(me.pid, now);
    if (!g.ok) return send(ws, { t: 'chatError', code: g.code, ...(g.until ? { until: g.until } : {}) });
    if (m.t === 'mark') {
      const mark: Mark = { id: ++this.markSeq, pid: me.pid, name: me.chat, kind: m.kind, at: m.at, x: m.x, y: m.y, t: now };
      return this.toChat(`chat:${me.alliance}`, { t: 'marked', mark });
    }
    const said = m.phrase !== undefined ? { phrase: m.phrase } : { text: m.text!, ...(m.links ? { links: m.links } : {}) };
    const msg: ChatMsg = d ? await chatStore(d, world ? WORLD : me.alliance!, me.pid, me.chat, said, now) : { id: ++this.markSeq, pid: me.pid, name: me.chat, at: now, ...said, ...(world ? { ch: 'world' as const } : {}) };
    this.toChat(world ? 'chat' : `chat:${me.alliance}`, { t: 'said', msg });
  }

  /** Every chat socket under a tag: `chat:<alliance>` an alliance's, `chat` all (W-69 World). */
  private toChat(tag: string, m: WorldServerMsg): void {
    for (const ws of this.ctx.getWebSockets(tag)) send(ws, m);
  }

  async webSocketClose(ws: WebSocket, code?: number): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    ws.serializeAttachment(null);
    if (!me?.gate) return;
    // a dropped tab (not a leave) keeps its player's place a while, unless another tab of his is still in
    if (me.gate.in && !me.gate.admin && code !== GATE_LEAVE && !this.gateTabs().some((t) => t.tab.pid === me.pid && t.tab.in)) this.held.set(me.pid, Date.now() + GATE_HOLD_MS);
    this.gateRun();
  }

  private gateTabs(): { ws: WebSocket; a: Attachment & { gate: NonNullable<Attachment['gate']> }; tab: GateTab }[] {
    const out = [];
    for (const ws of this.ctx.getWebSockets('gate')) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a?.gate) continue;
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      out.push({ ws, a: a as Attachment & { gate: NonNullable<Attachment['gate']> }, tab: { pid: a.pid, admin: a.gate.admin, in: a.gate.in, at: a.gate.at, seen: Math.max(ping, a.gate.at) } });
    }
    return out;
  }

  private gateCap(): number {
    return this.gateCapOverride ?? gateCap(this.env.WAR_MAX_ONLINE);
  }

  /** Sweep the gate (./gate.ts planGate): close silent tabs, let in who may come in, tell the line its places. */
  gateRun(now = Date.now()): { online: number; waiting: number } {
    const tabs = this.gateTabs(), cap = this.gateCap();
    const plan = planGate(tabs.map((t) => t.tab), this.held, cap, now);
    for (const i of plan.expired) {
      const ws = tabs[i].ws;
      ws.serializeAttachment(null);
      try { ws.close(4000, 'expired'); } catch { /* gone */ }
    }
    this.letIn.push(...plan.fromLine.map(() => now));
    this.letIn = this.letIn.filter((t) => now - t < 15 * 60_000);
    const send1 = (ws: WebSocket, m: GateMsg) => send(ws, m as unknown as WorldServerMsg);
    for (const i of plan.admit) {
      const { ws, a } = tabs[i];
      a.gate.in = true;
      a.gate.place = 0;
      ws.serializeAttachment(a);
      this.held.delete(a.pid); // in again: a later drop holds anew
      send1(ws, { t: 'gate', s: 'in' });
    }
    for (const [i, place] of plan.place) {
      const { ws, a } = tabs[i];
      if (a.gate.place === place) continue;
      a.gate.place = place;
      ws.serializeAttachment(a);
      send1(ws, { t: 'gate', s: 'queue', place, of: plan.waiting, eta: gateEta(place, this.letIn, cap, now) });
    }
    if (plan.waiting || this.held.size) {
      this.gateTimer ??= setTimeout(() => ((this.gateTimer = null), this.gateRun()), GATE_SWEEP_MS);
    } else if (this.gateTimer) clearTimeout(this.gateTimer), (this.gateTimer = null);
    return { online: plan.online, waiting: plan.waiting };
  }

  /**
   * The Worker's region socket route: may player `pid` play? Admins always; anyone while the war has room (a client
   * that skipped the gate is refused only once it is full); else only a player who is in (or holds his place).
   */
  async admitted(pid: number, admin: boolean): Promise<boolean> {
    if (admin) return true;
    const { online } = this.gateRun();
    return online < this.gateCap() || this.held.has(pid) || this.gateTabs().some((t) => t.tab.pid === pid && t.tab.in);
  }

  private schedulePush(): void {
    if (this.pushTimer || this.ctx.getWebSockets().length === this.ctx.getWebSockets('gate').length) return; // gate sockets get no map
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
      if (!a || a.chat !== undefined || a.gate) continue;
      const snap = w.snapshot(a.pid, a.alliance, counts, now);
      if (this.env.DB && a.alliance !== null) snap.boards = await boardsSeen(this.env.DB, a.alliance);
      snap.crests = await this.crestsFor(a.pid);
      snap.crown = await this.crownFor(now);
      send(ws, { t: 'world', ...snap });
    }
  }
}

function upgraded(client: WebSocket, request: Request): Response {
  const headers = new Headers();
  const proto = request.headers.get('x-ws-protocol');
  if (proto) headers.set('sec-websocket-protocol', proto);
  return new Response(null, { status: 101, webSocket: client, headers });
}

function send(ws: WebSocket, m: WorldServerMsg): void {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // closing
  }
}
