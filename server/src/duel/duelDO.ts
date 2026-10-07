/**
 * DuelDO: one live ranked or unranked match (docs/DUELS.md "Ranked live"),
 * started by the MatchmakerDO (init RPC) and joined by both players over
 * `/ws/duel/<match>`. The battle runs on the shared lockstep relay
 * (server/src/online/relay.ts): a timed deployment, sealed 2-tick turns, hash
 * checks and a server replay of the whole log at the end. Then the match is
 * settled in D1 (server/src/duel/live.ts) and both players get match_result.
 *
 * Reconnects: a player whose socket drops has RANKED.reconnectMs (30 s) to
 * come back; a new socket gets duel_start (resume) and every sealed turn
 * again (relayResume) and the client fast-forwards. A player who does not
 * come back, never connects, or stops reporting turns while the other waits,
 * abandons: the match is theirs to lose (and counts towards the queue
 * cooldown). Both gone, a desync or a match running far past its time limit:
 * void (no rating change, nothing paid). `leave_duel` is a surrender: a loss,
 * but not an abandon.
 *
 * The match, the relay state and the order log (in chunks) are kept in
 * storage: written on every change that matters and by an alarm every few
 * seconds, so the object can hibernate between messages and still settle.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { logError } from '../telemetry/log';
import { emitForPlayer } from '../telemetry/analytics';
import { DEPLOY_MS, type ClientMsg } from '../../../src/online/protocol';
import type { LoggedOrder, Side } from '../../../src/sim/types';
import { RANKED } from '../../../src/duel/rating';
import type { DuelLiveServerMsg, MatchReport } from '../../../src/duel/protocol';
import { newRelay, relayMessage, relayResume, relayTick, startMsg, type DuelState, type Out, type RelayMsg } from '../online/relay';
import { settleMatch, type MatchInit, type MatchOutcome } from './live';

/** Extra deployment time for both players to open the match socket. */
export const CONNECT_MS = 5000;
/** The relay state is saved at least this often during a battle (alarm). */
export const SNAPSHOT_MS = 5000;
/** A match still running after this long is void (deployment, a 5-minute battle and reconnects fit easily). */
export const MATCH_MAX_MS = 12 * 60_000;
const LOG_CHUNK = 500;
const MAX_MESSAGE = 16 * 1024;
const RELAY_TYPES = new Set(['d_order', 'd_ready', 'cmd', 'reach', 'end']);

interface Attachment {
  id: number;
  side: Side;
}

interface Snapshot {
  d: Omit<DuelState, 'log' | 'hashes'>;
  logLen: number;
  away: [number | null, number | null];
  progress: [number, number];
  joined: [boolean, boolean];
}

export class DuelDO extends DurableObject<Env> {
  private m: MatchInit | null = null;
  private d: DuelState | null = null;
  /** Since when each side has no socket (null: connected). */
  private away: [number | null, number | null] = [null, null];
  /** When each side last reported a new turn (or the battle started). */
  private progress: [number, number] = [0, 0];
  private joined: [boolean, boolean] = [false, false];
  private reports: [MatchReport, MatchReport] | null = null;
  private outcome: MatchOutcome | null = null;
  private settling = false;
  private savedLog = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void this.ctx.blockConcurrencyWhile(() => this.load());
  }

  private async load(): Promise<void> {
    const s = this.ctx.storage;
    this.m = (await s.get<MatchInit>('match')) ?? null;
    this.reports = (await s.get<[MatchReport, MatchReport]>('reports')) ?? null;
    this.outcome = (await s.get<MatchOutcome>('outcome')) ?? null;
    const snap = await s.get<Snapshot>('state');
    if (!snap) return;
    const chunks = await s.list<LoggedOrder[]>({ prefix: 'log:' });
    const log: LoggedOrder[] = [];
    for (let k = 0; k * LOG_CHUNK < snap.logLen; k++) log.push(...(chunks.get(`log:${k}`) ?? []));
    this.d = { ...snap.d, log: log.slice(0, snap.logLen), hashes: new Map() };
    this.away = snap.away;
    this.progress = snap.progress;
    this.joined = snap.joined;
    this.savedLog = this.d.log.length;
  }

  private async save(): Promise<void> {
    const d = this.d;
    if (!d) return;
    const { log, hashes: _h, ...rest } = d;
    const put: Record<string, unknown> = { state: { d: rest, logLen: log.length, away: this.away, progress: this.progress, joined: this.joined } satisfies Snapshot };
    for (let k = Math.floor(this.savedLog / LOG_CHUNK); k * LOG_CHUNK < log.length; k++) put[`log:${k}`] = log.slice(k * LOG_CHUNK, (k + 1) * LOG_CHUNK);
    await this.ctx.storage.put(put);
    this.savedLog = log.length;
  }

  /** The next alarm: the deployment deadline, a reconnect deadline or the next snapshot, whichever comes first. */
  private async schedule(now = Date.now()): Promise<void> {
    if (this.reports || !this.d) return this.ctx.storage.deleteAlarm();
    let t = now + SNAPSHOT_MS;
    if (this.d.phase === 'deploy') t = Math.min(t, this.d.deployUntil);
    for (const a of this.away) if (a !== null) t = Math.min(t, a + RANKED.reconnectMs);
    await this.ctx.storage.setAlarm(Math.max(now + 50, t));
  }

  // ------------------------------------------------------------------ RPC

  /** Starts the match (from the MatchmakerDO). Idempotent. */
  async init(m: MatchInit): Promise<{ ok: boolean }> {
    if (this.m) return { ok: this.m.id === m.id };
    const now = Date.now();
    this.m = m;
    this.d = newRelay(m.id, m.players, m.names, m.setup, now, DEPLOY_MS + CONNECT_MS);
    // nobody is connected yet: the reconnect window is also the window to join
    this.away = [now, now];
    this.progress = [now, now];
    await this.ctx.storage.put('match', m);
    await this.save();
    await this.schedule(now);
    return { ok: true };
  }

  /** Where the match stands (tests, ops). */
  async status(): Promise<{ phase: string | null; away: [number | null, number | null]; reports: [MatchReport, MatchReport] | null; next: number }> {
    return { phase: this.d?.phase ?? null, away: this.away, reports: this.reports, next: this.d?.next ?? 0 };
  }

  // ------------------------------------------------------------------ sockets

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const id = Number(request.headers.get('x-player-id'));
    const m = this.m;
    if (!m || !this.d) return new Response('No such match', { status: 404 });
    const side = m.players.indexOf(id) as Side | -1;
    if (side === -1) return new Response('Not your match', { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`p:${id}`]);
    server.serializeAttachment({ id, side } satisfies Attachment);
    const now = Date.now();
    if (this.reports) this.send(server, { type: 'match_result', duel: m.id, report: this.reports[side] });
    else {
      const d = this.d;
      const wasAway = this.away[side] !== null;
      const start = startMsg(d, side, m.heroes, now, { mode: m.mode, ...(this.joined[side] ? { resume: true } : {}) });
      for (const msg of relayResume(d, side, start)) this.send(server, msg);
      this.away[side] = null;
      this.progress[side] = now;
      this.joined[side] = true;
      const other = (1 - side) as Side;
      if (wasAway) this.deliver(m.players[other], { type: 'peer', duel: m.id, side, online: true, until: null });
      const oa = this.away[other];
      if (oa !== null && this.joined[other]) this.send(server, { type: 'peer', duel: m.id, side: other, online: false, until: oa + RANKED.reconnectMs });
      await this.save();
      await this.schedule(now);
    }
    const headers = new Headers();
    const proto = request.headers.get('x-ws-protocol');
    if (proto) headers.set('sec-websocket-protocol', proto);
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      await this.onMessage(ws, message);
    } catch (e) {
      logError('do.duel', e, { op: 'message', match: this.m?.id ?? null });
      this.send(ws, { type: 'error', message: 'Internal error' });
    }
  }

  private async onMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return this.send(ws, { type: 'error', message: 'Expected a JSON text frame' });
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      return this.send(ws, { type: 'error', message: 'Invalid JSON' });
    }
    const me = ws.deserializeAttachment() as Attachment | null;
    const { m, d } = this;
    if (!me || !m || !d || !msg || typeof msg !== 'object') return;
    const now = Date.now();
    if (msg.type === 'ping') return this.send(ws, { type: 'pong', t: msg.t ?? null, now });
    if (this.reports) return this.send(ws, { type: 'match_result', duel: m.id, report: this.reports[me.side] });
    if (d.phase === 'ended') return;
    const phase = d.phase;
    const logLen = d.log.length;
    this.deliverAll(relayTick(d, now));
    if (msg.type === 'leave_duel') {
      // a surrender: a loss, not an abandon
      return this.settle({ ...this.base(), end: 'forfeit', winner: (1 - me.side) as Side, abandoned: [false, false] });
    }
    if (!RELAY_TYPES.has(msg.type)) return this.send(ws, { type: 'error', message: 'Unknown message type' });
    const reached = d.reached[me.side];
    const step = relayMessage(d, me.side, msg as RelayMsg);
    this.deliverAll(step.out);
    if (d.reached[me.side] > reached) this.progress[me.side] = now;
    if (phase === 'deploy' && d.phase === 'battle') this.progress = [now, now];
    if (step.ended === 'desync') return this.settle({ ...this.base(), end: 'void', winner: -1, abandoned: [false, false] });
    if (step.ended === 'result') {
      const r = d.result!;
      return this.settle({ ...this.base(), end: 'battle', winner: r.winner, verified: r.verified, ticks: r.ticks, hash: r.hash, result: step.replay?.result ?? null, abandoned: [false, false] });
    }
    if (d.phase !== phase || d.log.length !== logLen) {
      await this.save();
      await this.schedule(now);
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.leave(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    ws.serializeAttachment(null);
    if (this.reports || !this.m || !this.d || this.d.phase === 'ended') return;
    if (this.ctx.getWebSockets(`p:${a.id}`).some((o) => o !== ws && o.deserializeAttachment() !== null)) return;
    const now = Date.now();
    this.away[a.side] = now;
    this.deliver(this.m.players[1 - a.side], { type: 'peer', duel: this.m.id, side: a.side, online: false, until: now + RANKED.reconnectMs });
    await this.save();
    await this.schedule(now);
  }

  // ------------------------------------------------------------------ time

  async alarm(): Promise<void> {
    try {
      await this.onAlarm();
    } catch (e) {
      logError('do.duel', e, { op: 'alarm', match: this.m?.id ?? null });
      throw e;
    }
  }

  private async onAlarm(now = Date.now()): Promise<void> {
    const { m, d } = this;
    if (!m || !d || this.reports) return;
    if (this.outcome) return this.settle(this.outcome); // a settlement that failed: retry
    if (d.phase === 'deploy') {
      this.deliverAll(relayTick(d, now));
      if ((d.phase as DuelState['phase']) === 'battle') this.progress = [now, now];
    }
    const R = RANKED.reconnectMs;
    const gone = ([0, 1] as Side[]).map((s) => {
      const a = this.away[s];
      if (a !== null) return now - a >= R;
      // connected but silent while the other waits for its turns (the app was put away)
      return d.phase === 'battle' && now - this.progress[s] >= R && d.reached[s] <= d.reached[1 - s];
    }) as [boolean, boolean];
    if ((gone[0] && gone[1]) || now - m.createdAt > MATCH_MAX_MS) return this.settle({ ...this.base(), end: 'void', winner: -1, abandoned: gone });
    if (gone[0] || gone[1]) return this.settle({ ...this.base(), end: 'forfeit', winner: gone[0] ? 1 : 0, abandoned: gone });
    await this.save();
    await this.schedule(now);
  }

  // ------------------------------------------------------------------ settlement

  private base(): Omit<MatchOutcome, 'end' | 'winner' | 'abandoned'> {
    const d = this.d!;
    return { verified: false, ticks: d.next * 2, hash: null, result: null, log: d.log, deployOrders: d.phase === 'deploy' ? d.log.length : d.deployOrders };
  }

  /** Writes the result once (D1), then tells both players. A failure is retried by the alarm. */
  private async settle(o: MatchOutcome): Promise<void> {
    const { m, d } = this;
    if (!m || !d || this.reports || this.settling) return;
    this.settling = true;
    d.phase = 'ended';
    try {
      if (!this.outcome) {
        this.outcome = o;
        await this.ctx.storage.put('outcome', o);
      }
      if (!this.env.DB) throw new Error('database not configured');
      const reports = await settleMatch(this.env.DB, m, this.outcome, Date.now());
      this.reports = reports;
      await this.ctx.storage.put('reports', reports);
      await this.ctx.storage.delete(['outcome', 'state', ...[...(await this.ctx.storage.list({ prefix: 'log:' })).keys()]]);
      this.outcome = null;
      for (const side of [0, 1] as Side[]) this.deliver(m.players[side], { type: 'match_result', duel: m.id, report: reports[side] });
      await this.ctx.storage.deleteAlarm();
      const env = this.env;
      this.ctx.waitUntil(
        Promise.all(
          reports.map((r, side) =>
            r.end === 'void'
              ? null
              : emitForPlayer(env, m.players[side], 'battle_result', { mode: m.mode, result: r.winner === side ? 'win' : r.winner === -1 ? 'draw' : 'loss', ticks: r.ticks }, { name: 'first_battle', props: { mode: m.mode } }),
          ),
        ),
      );
    } catch (e) {
      logError('do.duel', e, { op: 'settle', match: m.id });
      await this.ctx.storage.setAlarm(Date.now() + SNAPSHOT_MS);
    } finally {
      this.settling = false;
    }
  }

  // ------------------------------------------------------------------ delivery

  private send(ws: WebSocket, msg: DuelLiveServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // closing
    }
  }

  private deliver(pid: number, msg: DuelLiveServerMsg): void {
    for (const ws of this.ctx.getWebSockets(`p:${pid}`)) if (ws.deserializeAttachment() !== null) this.send(ws, msg);
  }

  private deliverAll(out: Out[]): void {
    for (const o of out) this.deliver(o.to, o.msg);
  }
}

