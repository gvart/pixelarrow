/**
 * RegionDO: one Durable Object per map region (`/ws/region/:id`), the skeleton
 * for future territories and clans. Uses the WebSocket Hibernation API, so an
 * idle region costs nothing while sockets stay open.
 *
 * The Worker authenticates the session and forwards the upgrade with
 * X-Player-Id / X-Player-Name headers; the DO trusts those (it is not
 * reachable from the internet directly).
 *
 * Client -> server (JSON text frames):
 *   { "type": "ping", "t"?: any }   -> { "type": "pong", "t": <echo>, "now": <ms> }
 *   { "type": "who" }               -> { "type": "presence", "players": [...] }
 * The bare text frame "ping" is answered "pong" without waking the object.
 *
 * Server -> client:
 *   { "type": "welcome", "region", "you", "players": [...] }   on connect
 *   { "type": "join",  "player": {...} }                        someone came online
 *   { "type": "leave", "player": {...} }                        their last socket closed
 *   { "type": "error", "message" }
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export interface PresenceInfo {
  id: number;
  name: string;
}

interface Attachment extends PresenceInfo {
  joinedAt: number;
}

const MAX_MESSAGE = 4096;

/** WebSocket subprotocol; the session token may ride along as a second protocol entry. */
export const WS_PROTOCOL = 'pixelarrow.v1';

export class RegionDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const id = Number(request.headers.get('x-player-id'));
    const name = (request.headers.get('x-player-name') ?? '').slice(0, 64);
    const region = request.headers.get('x-region-id') ?? '';
    if (!Number.isSafeInteger(id) || id <= 0) return new Response('Missing player', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const already = this.ctx.getWebSockets(`p:${id}`).length > 0;
    this.ctx.acceptWebSocket(server, [`p:${id}`]);
    const me: Attachment = { id, name, joinedAt: Date.now() };
    server.serializeAttachment(me);

    server.send(JSON.stringify({ type: 'welcome', region, you: { id, name }, players: this.online() }));
    if (!already) this.broadcast({ type: 'join', player: { id, name } }, server);

    const headers = new Headers();
    const proto = request.headers.get('x-ws-protocol');
    if (proto) headers.set('sec-websocket-protocol', proto);
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) {
      ws.send(JSON.stringify({ type: 'error', message: 'Expected a JSON text frame' }));
      return;
    }
    let msg: { type?: unknown; t?: unknown };
    try {
      msg = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', t: msg.t ?? null, now: Date.now() }));
        return;
      case 'who':
        ws.send(JSON.stringify({ type: 'presence', players: this.online() }));
        return;
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type` }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.leave(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  /** Unique online players (a player may have several sockets/tabs). */
  online(exclude?: WebSocket): PresenceInfo[] {
    const seen = new Map<number, PresenceInfo>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name });
    }
    return [...seen.values()].sort((a, b) => a.id - b.id);
  }

  private leave(ws: WebSocket): void {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    ws.serializeAttachment(null);
    const stillHere = this.ctx.getWebSockets(`p:${a.id}`).some((o) => o !== ws && o.deserializeAttachment() !== null);
    if (!stillHere) this.broadcast({ type: 'leave', player: { id: a.id, name: a.name } }, ws);
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      if (ws.deserializeAttachment() === null) continue;
      try {
        ws.send(text);
      } catch {
        // socket closing; webSocketClose will clean up
      }
    }
  }
}
