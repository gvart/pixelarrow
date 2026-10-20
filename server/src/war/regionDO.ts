/**
 * WarRegionDO: one Durable Object per war region (M3; W-05..W-07). Hosts a WarRoom (./room.ts) and steps it at 10 Hz
 * with a timer loop while anyone is connected or armies stand in the region; an alarm every KEEPALIVE_MS keeps the
 * object resident meanwhile. Sockets use the hibernation API; the object cannot hibernate while the loop runs, and once
 * it stops (no one here, no armies) there is nothing to lose.
 *
 * The Worker authenticates the socket (/ws/war/:region) and forwards it with X-Player-Id; the DO trusts that header.
 * Protocol: src/war/net/protocol.ts. GET /stats (dev only, routed by the Worker) reports tick times and bandwidth.
 *
 * Not yet (later M3 slices): the sim state is in memory only (an evicted object starts the region over), armies come
 * from the join message instead of D1, no building or siege orders.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { WarRoom, type TickTimes } from './room';
import { warRegion } from './regions';
import { DEFAULT_CAP, parseClientMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { logError } from '../telemetry/log';

const TICK_MS = 100;
const KEEPALIVE_MS = 10_000;
/** Tick history kept for /stats. */
const HISTORY = 600;

interface Attachment { pid: number }

export class WarRegionDO extends DurableObject<Env> {
  private room: WarRoom | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  private times: (TickTimes & { totalMs: number; sendMs: number; bytes: number; units: number; clients: number; lateMs: number })[] = [];
  private overruns = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private load(region: string): WarRoom | null {
    if (this.room) return this.room.region.id === region ? this.room : null;
    const data = warRegion(region);
    if (!data) return null;
    const cap = Number(this.env.WAR_CAP) || DEFAULT_CAP;
    this.room = new WarRoom({ region: data, seed: 1, cap });
    return this.room;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const region = request.headers.get('x-region-id') ?? '';
    if (url.pathname.endsWith('/stats')) return Response.json(this.stats());
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const pid = Number(request.headers.get('x-player-id'));
    if (!Number.isSafeInteger(pid) || pid <= 0) return new Response('Missing player', { status: 400 });
    if (!this.load(region)) return new Response('Unknown region', { status: 404 });
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
      if (m.t === 'join') {
        send(ws, room.join(me.pid, m).msg);
        this.start();
      } else if (m.t === 'order') {
        const err = room.order(me.pid, m.o);
        if (err) send(ws, { t: 'error', code: err, detail: m.o.kind });
      } else if (m.t === 'view') room.view(me.pid, m);
      else if (m.t === 'ping') send(ws, { t: 'pong', c: m.c, tick: room.currentTick });
    } catch (e) {
      logError('war_message_failed', e);
    }
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
    if (me && this.room && !this.ctx.getWebSockets(`p:${me.pid}`).some((o) => o !== ws && o.deserializeAttachment() !== null)) this.room.leave(me.pid);
  }

  async alarm(): Promise<void> {
    if (this.timer) await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  private start(): void {
    if (this.timer) return;
    this.next = performance.now() + TICK_MS;
    this.timer = setTimeout(() => this.loop(), TICK_MS);
    void this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  private loop(): void {
    const room = this.room;
    if (!room || !room.active()) { this.timer = null; return; }
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
    const t1 = performance.now();
    let bytes = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a) continue;
      const w = r.admitted.get(a.pid);
      if (w) send(ws, w);
      const f = r.frames.get(a.pid);
      if (f) {
        try { ws.send(f); bytes += f.length; } catch { /* closing */ }
      }
    }
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
      region: room?.region.id ?? null, tick: room?.currentTick ?? 0, running: !!this.timer, ticks: h.length, overruns: this.overruns,
      units: room?.alive() ?? 0, online: room?.online() ?? 0, quota: room?.quota() ?? null,
      totalMs: pick('totalMs'), stepMs: pick('stepMs'), snapMs: pick('snapMs'), netMs: pick('netMs'), sendMs: pick('sendMs'), lateMs: pick('lateMs'),
      bytesPerTick: pick('bytes'), clientsPerTick: pick('clients'),
    };
  }
}

function send(ws: WebSocket, m: ServerMsg): void {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // closing; webSocketClose cleans up
  }
}
