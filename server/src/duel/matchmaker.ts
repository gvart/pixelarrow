/**
 * MatchmakerDO: the one global queue of live ranked and unranked duels
 * (docs/DUELS.md "Matchmaking and rating"), behind `/ws/duel`. Protocol:
 * src/duel/protocol.ts and server/README.md "Ranked duels".
 *
 * A player queues with `queue {mode}`; the DO checks D1 (duel profile, team
 * within the 150-point budget, duel level 5 for ranked, no queue cooldown, no
 * live match) and keeps them in the queue (in storage: it survives
 * hibernation) until pairQueue (src/duel/rating.ts) finds an opponent within
 * both players' rating windows. The windows widen with the wait, so an alarm
 * re-runs the pairing every PAIR_EVERY_MS while anyone waits. A pair becomes a
 * match: the armies are built from D1, the match row is written, its DuelDO is
 * started, and both players get `match_found` and connect to `/ws/duel/<id>`.
 *
 * Closing the last socket leaves the queue. The Worker authenticates and
 * forwards X-Player-Id / X-Player-Name (the DO trusts those).
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { logError } from '../telemetry/log';
import { randomU32 } from '../online/store';
import { pairQueue, type DuelMode, type QueueEntry } from '../../../src/duel/rating';
import type { MatchmakerClientMsg, MatchmakerServerMsg } from '../../../src/duel/protocol';
import { createMatch, getQueueState, liveMatchOf, queueCheck, rowLeague } from './live';

/** How often the queue is paired again while anyone waits (the windows widen meanwhile). */
export const PAIR_EVERY_MS = 2000;
const MAX_MESSAGE = 4096;

interface Attachment {
  id: number;
  name: string;
}

export interface Waiting extends QueueEntry {
  name: string;
  /** Rated games so far (the opponent sees a league only after placements). */
  games: number;
}

export class MatchmakerDO extends DurableObject<Env> {
  private queue: Waiting[] = [];
  /** Players being paired right now (D1 work in flight): never paired twice. */
  private pairing = new Set<number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void this.ctx.blockConcurrencyWhile(async () => {
      this.queue = (await this.ctx.storage.get<Waiting[]>('queue')) ?? [];
    });
  }

  /** The queue right now (tests, ops). */
  async waiting(): Promise<Waiting[]> {
    return this.queue.map((w) => ({ ...w }));
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('queue', this.queue);
    if (this.queue.length) await this.ctx.storage.setAlarm(Date.now() + PAIR_EVERY_MS);
    else await this.ctx.storage.deleteAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const id = Number(request.headers.get('x-player-id'));
    const name = (request.headers.get('x-player-name') ?? '').slice(0, 64);
    if (!Number.isSafeInteger(id) || id <= 0) return new Response('Missing player', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`p:${id}`]);
    server.serializeAttachment({ id, name } satisfies Attachment);
    const now = Date.now();
    let match = null;
    let cooldownUntil = 0;
    if (this.env.DB) {
      [match, cooldownUntil] = await Promise.all([liveMatchOf(this.env.DB, id, now), getQueueState(this.env.DB, id).then((q) => (q.cooldownUntil > now ? q.cooldownUntil : 0))]);
    }
    this.send(server, { type: 'mm_welcome', now, match, cooldownUntil });
    const q = this.queue.find((w) => w.pid === id);
    if (q) this.send(server, { type: 'queued', mode: q.mode, since: q.since, now });
    const headers = new Headers();
    const proto = request.headers.get('x-ws-protocol');
    if (proto) headers.set('sec-websocket-protocol', proto);
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      await this.onMessage(ws, message);
    } catch (e) {
      logError('do.matchmaker', e, { op: 'message' });
      this.send(ws, { type: 'error', message: 'Internal error' });
    }
  }

  private async onMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return this.send(ws, { type: 'error', message: 'Expected a JSON text frame' });
    let msg: MatchmakerClientMsg;
    try {
      msg = JSON.parse(message) as MatchmakerClientMsg;
    } catch {
      return this.send(ws, { type: 'error', message: 'Invalid JSON' });
    }
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || !msg || typeof msg !== 'object') return;
    const now = Date.now();
    switch (msg.type) {
      case 'ping':
        return this.send(ws, { type: 'pong', t: msg.t ?? null, now });
      case 'cancel': {
        if (this.pairing.has(me.id)) return; // too late: match_found is on its way
        const had = this.queue.length;
        this.queue = this.queue.filter((w) => w.pid !== me.id);
        if (this.queue.length !== had) await this.save();
        return this.deliver(me.id, { type: 'unqueued', reason: 'cancelled' });
      }
      case 'queue': {
        const mode: DuelMode = msg.mode === 'ranked' ? 'ranked' : 'unranked';
        const had = this.queue.find((w) => w.pid === me.id);
        if (had && had.mode === mode) return this.deliver(me.id, { type: 'queued', mode, since: had.since, now });
        if (this.pairing.has(me.id)) return;
        if (!this.env.DB) return this.send(ws, { type: 'error', message: 'Database not configured', code: 'not_configured' });
        const check = await queueCheck(this.env.DB, me.id, mode, now);
        if (!check.ok) return this.deliver(me.id, { type: 'unqueued', reason: check.reason });
        this.queue = this.queue.filter((w) => w.pid !== me.id);
        this.queue.push({ pid: me.id, name: me.name, mode, rating: check.rating.rating, games: check.rating.games, since: now });
        this.deliver(me.id, { type: 'queued', mode, since: now, now });
        await this.pair();
        await this.save();
        return;
      }
      default:
        return this.send(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  async alarm(): Promise<void> {
    try {
      await this.pair();
      await this.save();
    } catch (e) {
      logError('do.matchmaker', e, { op: 'alarm' });
      throw e;
    }
  }

  /** Pairs whoever fits and starts their matches. */
  private async pair(now = Date.now()): Promise<void> {
    const db = this.env.DB;
    if (!db) return;
    const pairs = pairQueue(this.queue.filter((w) => !this.pairing.has(w.pid)), now);
    for (const p of pairs) for (const w of p) this.pairing.add(w.pid);
    await Promise.all(
      pairs.map(async (p) => {
        try {
          // side 0 by the seed: neither the longer wait nor the rating picks it
          const seed = randomU32();
          const [a, b] = seed & 1 ? [p[1], p[0]] : p;
          const made = await createMatch(db, a.mode, { pid: a.pid, name: a.name }, { pid: b.pid, name: b.name }, seed, now);
          if ('bad' in made) {
            this.queue = this.queue.filter((w) => !made.bad.includes(w.pid));
            for (const pid of made.bad) this.deliver(pid, { type: 'unqueued', reason: 'no_team' });
            return;
          }
          await this.env.DUEL.get(this.env.DUEL.idFromName(made.init.id)).init(made.init);
          this.queue = this.queue.filter((w) => w.pid !== a.pid && w.pid !== b.pid);
          for (const [side, me, foe] of [[0, a, b], [1, b, a]] as const) {
            this.deliver(me.pid, { type: 'match_found', match: made.init.id, mode: a.mode, side, opponent: { name: foe.name, league: rowLeague({ rating: foe.rating, games: foe.games }) } });
          }
        } catch (e) {
          logError('do.matchmaker', e, { op: 'pair' });
        } finally {
          for (const w of p) this.pairing.delete(w.pid);
        }
      }),
    );
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
    const still = this.ctx.getWebSockets(`p:${a.id}`).some((o) => o !== ws && o.deserializeAttachment() !== null);
    if (still || this.pairing.has(a.id)) return;
    const had = this.queue.length;
    this.queue = this.queue.filter((w) => w.pid !== a.id);
    if (this.queue.length !== had) await this.save();
  }

  private send(ws: WebSocket, msg: MatchmakerServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // closing
    }
  }

  private deliver(pid: number, msg: MatchmakerServerMsg): void {
    for (const ws of this.ctx.getWebSockets(`p:${pid}`)) if (ws.deserializeAttachment() !== null) this.send(ws, msg);
  }
}
