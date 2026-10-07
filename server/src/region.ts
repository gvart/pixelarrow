/**
 * RegionDO: one Durable Object per room. Online shards use the room
 * `shard-<season>-<shard>` (via /ws/online); `/ws/region/:id` opens any other
 * room for plain presence. Uses the WebSocket Hibernation API, so idle
 * connections cost nothing; presence lives in socket attachments and survives
 * hibernation.
 *
 * The Worker authenticates the session and forwards the upgrade with
 * X-Player-Id / X-Player-Name (and X-Season / X-Shard for shards); the DO
 * trusts those (it is not reachable from the internet directly).
 *
 * Besides presence it hosts, per shard:
 *  - hex attack locks (RPC lockHex / unlockHex / hexLock): one attack per hex
 *    at a time, expiring with the attack ticket (lazily; no alarms needed);
 *  - the live duel lobby and lockstep relay (server/src/online/duel.ts).
 * Protocol: src/online/protocol.ts and server/README.md.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { DuelHub, type Out } from './online/duel';
import type { ClientMsg, PresencePlayer } from '../../src/online/protocol';
import type { Hero } from '../../src/data/units';
import { onlineBattleSetup } from '../../src/online/battle';
import { randomSite } from '../../src/world/battlefield';
import { Rng } from '../../src/sim/rng';
import { fieldReady, formationsOf, getProfile, loadHeroes, randomToken, randomU32 } from './online/store';
import { withConsumables } from './online/attack';
import type { ConsumableId } from '../../src/data/consumables';
import { PASS } from './economy/catalog';
import { passXpStmt } from './economy/pass';
import type { LiveArrival, LiveOut } from './online/live';

export interface PresenceInfo {
  id: number;
  name: string;
}

interface Attachment extends PresenceInfo {
  joinedAt: number;
}

interface ShardMeta {
  season: number;
  shard: number;
}

export interface HexLock {
  ticket: string;
  player: number;
  until: number;
}

const MAX_MESSAGE = 16 * 1024;

/** WebSocket subprotocol; the session token may ride along as a second protocol entry. */
export const WS_PROTOCOL = 'pixelarrow.v1';

export class RegionDO extends DurableObject<Env> {
  private hub: DuelHub;
  private meta: ShardMeta | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.hub = new DuelHub({
      now: () => Date.now(),
      randomId: () => randomToken(8),
      randomSeed: () => randomU32(),
      online: (pid) => this.ctx.getWebSockets(`p:${pid}`).some((w) => w.deserializeAttachment() !== null),
      buildDuel: (a, b, seed, picks) => this.buildDuel(a, b, seed, picks),
      release: (a, b, picks) => this.giveBack([a.id, b.id], picks),
      record: async (d, r) => {
        const m = await this.shardMeta();
        if (!this.env.DB || !m) return;
        if (r.verified) {
          // Season pass XP for both duellists (the winner gets a bonus).
          const now = Date.now();
          await this.env.DB.batch(
            d.players.map((pid, side) => passXpStmt(this.env.DB!, m.season, pid, PASS.xp.duel + (r.winner === side ? PASS.xp.duelWin : 0), '1', now)),
          );
        }
        await this.env.DB.prepare(
          `INSERT INTO battle_log (season_id, shard_id, kind, ref, attacker_id, defender_id, winner, ticks, hash, verified, summary, created_at)
           VALUES (?1, ?2, 'duel', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        )
          .bind(m.season, m.shard, d.id, d.players[0], d.players[1], r.winner, r.ticks, r.hash, r.verified ? 1 : 0, JSON.stringify({ orders: d.log.length, mismatches: r.mismatches }), Date.now())
          .run();
      },
    });
  }

  // ------------------------------------------------------------------ hex locks (RPC)

  /** Takes the attack lock of a hex unless someone else holds a live one. */
  async lockHex(key: string, ticket: string, player: number, until: number, now = Date.now()): Promise<{ ok: boolean; until?: number }> {
    const cur = await this.ctx.storage.get<HexLock>(`lock:${key}`);
    if (cur && cur.until > now && cur.ticket !== ticket) return { ok: false, until: cur.until };
    await this.ctx.storage.put(`lock:${key}`, { ticket, player, until } satisfies HexLock);
    return { ok: true };
  }

  async unlockHex(key: string, ticket: string): Promise<void> {
    const cur = await this.ctx.storage.get<HexLock>(`lock:${key}`);
    if (cur && cur.ticket === ticket) await this.ctx.storage.delete(`lock:${key}`);
  }

  /** The live lock of a hex, if any (expired locks are dropped lazily). */
  async hexLock(key: string, now = Date.now()): Promise<HexLock | null> {
    const cur = await this.ctx.storage.get<HexLock>(`lock:${key}`);
    if (!cur) return null;
    if (cur.until <= now) {
      await this.ctx.storage.delete(`lock:${key}`);
      return null;
    }
    return cur;
  }

  // ------------------------------------------------------------------ live armies (RPC)

  /** Players with an open socket here (live army updates go to them). */
  async livePlayers(): Promise<number[]> {
    return this.online().map((p) => p.id);
  }

  /**
   * Delivers a player's army move (messages already cut to each receiver's
   * vision by server/src/online/live.ts) and keeps the march's arrival to
   * announce later (alarm). A move replacing an unfinished march hides the
   * army from those who saw the old march but get nothing about the new move.
   */
  async liveMove(pid: number, out: LiveOut[], arrival: LiveArrival | null, now = Date.now()): Promise<void> {
    const key = `arrive:${pid}`;
    const prev = await this.ctx.storage.get<LiveArrival>(key);
    const sent = new Set(out.map((o) => o.to));
    const hides: Out[] = prev && prev.at > now ? prev.told.filter((v) => !sent.has(v)).map((v) => ({ to: v, msg: { type: 'army_hide', player: pid, now } })) : [];
    this.deliver([...out, ...hides] as Out[]);
    if (arrival && arrival.told.length && arrival.at > now) await this.ctx.storage.put(key, arrival);
    else if (prev) await this.ctx.storage.delete(key);
    await this.scheduleArrivals();
  }

  private async scheduleArrivals(): Promise<void> {
    await this.scheduleAlarm();
  }

  /** One alarm for both jobs: the next march arrival or timed duel deployment, whichever comes first. */
  private async scheduleAlarm(): Promise<void> {
    const all = await this.ctx.storage.list<LiveArrival>({ prefix: 'arrive:' });
    let next = this.hub.nextDeadline() ?? Infinity;
    for (const a of all.values()) next = Math.min(next, a.at);
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAlarm();
  }

  /** Starts timed duel deployments that are over and announces the marches that arrived. */
  async alarm(): Promise<void> {
    this.deliver(this.hub.tick());
    const now = Date.now();
    const all = await this.ctx.storage.list<LiveArrival>({ prefix: 'arrive:' });
    const out: Out[] = [];
    const done: string[] = [];
    for (const [k, a] of all) {
      if (a.at > now) continue;
      const pid = Number(k.slice('arrive:'.length));
      for (const v of a.to) out.push({ to: v, msg: { type: 'army_arrive', player: pid, q: a.q, r: a.r, now } } as Out);
      done.push(k);
    }
    if (done.length) await this.ctx.storage.delete(done);
    this.deliver(out);
    await this.scheduleArrivals();
  }

  // ------------------------------------------------------------------ duels

  private async shardMeta(): Promise<ShardMeta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<ShardMeta>('meta')) ?? null;
    return this.meta;
  }

  /** Spends one consumable per side that picked one; all or nothing (compensating on a partial failure). */
  private async spend(pids: [number, number], picks: [ConsumableId | null, ConsumableId | null]): Promise<boolean> {
    const m = await this.shardMeta();
    const db = this.env.DB;
    if (!m || !db) return false;
    const sides = [0, 1].filter((i) => picks[i]);
    if (!sides.length) return true;
    const res = await db.batch(
      sides.map((i) =>
        db.prepare('UPDATE online_consumables SET qty = qty - 1 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3 AND qty >= 1').bind(m.season, pids[i], picks[i]),
      ),
    );
    const ok = res.map((r) => r.meta.changes === 1);
    if (ok.every(Boolean)) return true;
    const back: [ConsumableId | null, ConsumableId | null] = [null, null];
    sides.forEach((i, k) => {
      if (ok[k]) back[i] = picks[i];
    });
    await this.giveBack(pids, back);
    return false;
  }

  private async giveBack(pids: [number, number], picks: [ConsumableId | null, ConsumableId | null]): Promise<void> {
    const m = await this.shardMeta();
    const db = this.env.DB;
    if (!m || !db) return;
    const stmts = [0, 1]
      .filter((i) => picks[i])
      .map((i) => db.prepare('UPDATE online_consumables SET qty = qty + 1 WHERE season_id = ?1 AND player_id = ?2 AND consumable_id = ?3').bind(m.season, pids[i], picks[i]));
    if (stmts.length) await db.batch(stmts);
  }

  private async buildDuel(a: PresencePlayer, b: PresencePlayer, seed: number, picks: [ConsumableId | null, ConsumableId | null]) {
    const m = await this.shardMeta();
    const db = this.env.DB;
    if (!m || !db) return null;
    const now = Date.now();
    const sides = await Promise.all(
      [a, b].map(async (p) => {
        const [profile, heroes] = await Promise.all([getProfile(db, m.season, p.id), loadHeroes(db, m.season, p.id)]);
        const ready = fieldReady(heroes, now).map((h) => h.hero);
        return profile && ready.length ? { heroes: ready, formations: formationsOf(profile.formations), bot: false } : null;
      }),
    );
    if (!sides[0] || !sides[1]) return null;
    if (!(await this.spend([a.id, b.id], picks))) return null;
    const setup = withConsumables(onlineBattleSetup(seed, sides[0], sides[1], randomSite(new Rng(seed ^ 0x2f6b9e1d))), picks);
    return { setup, heroes: [sides[0].heroes, sides[1].heroes] as [Hero[], Hero[]] };
  }

  private deliver(out: Out[]): void {
    for (const o of out) {
      const text = JSON.stringify(o.msg);
      for (const ws of this.ctx.getWebSockets(`p:${o.to}`)) {
        if (ws.deserializeAttachment() === null) continue;
        try {
          ws.send(text);
        } catch {
          // closing; webSocketClose cleans up
        }
      }
    }
  }

  /** Timed duel deployments: wake up when the next one is over (DuelHub.tick starts it). */
  private async scheduleDeploy(): Promise<void> {
    await this.scheduleAlarm();
  }

  // ------------------------------------------------------------------ sockets

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const id = Number(request.headers.get('x-player-id'));
    const name = (request.headers.get('x-player-name') ?? '').slice(0, 64);
    const region = request.headers.get('x-region-id') ?? '';
    if (!Number.isSafeInteger(id) || id <= 0) return new Response('Missing player', { status: 400 });
    const season = Number(request.headers.get('x-season'));
    const shard = Number(request.headers.get('x-shard'));
    if (Number.isSafeInteger(season) && season > 0 && Number.isSafeInteger(shard) && shard > 0 && !(await this.shardMeta())) {
      this.meta = { season, shard };
      await this.ctx.storage.put('meta', this.meta);
    }

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
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || !msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', t: msg.t ?? null, now: Date.now() }));
        return;
      case 'who':
        ws.send(JSON.stringify({ type: 'presence', players: this.online() }));
        return;
      case 'challenge':
      case 'challenge_cancel':
      case 'challenge_reply':
      case 'd_order':
      case 'd_ready':
      case 'cmd':
      case 'reach':
      case 'end':
      case 'leave_duel': {
        const before = new Set([...this.hub.duels.values()].flatMap((d) => d.players));
        const out = await this.hub.handle({ id: me.id, name: me.name }, msg, (pid) => this.lookup(pid));
        this.deliver(out);
        await this.scheduleDeploy();
        const after = new Set([...this.hub.duels.values()].flatMap((d) => d.players));
        if (before.size !== after.size || [...after].some((p) => !before.has(p))) this.broadcast({ type: 'presence', players: this.online() });
        return;
      }
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

  private lookup(pid: number): PresencePlayer | null {
    for (const ws of this.ctx.getWebSockets(`p:${pid}`)) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) return { id: a.id, name: a.name };
    }
    return null;
  }

  /** Unique online players (a player may have several sockets/tabs). */
  online(exclude?: WebSocket): PresencePlayer[] {
    const seen = new Map<number, PresencePlayer>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !seen.has(a.id)) seen.set(a.id, this.hub.busy(a.id) ? { id: a.id, name: a.name, busy: true } : { id: a.id, name: a.name });
    }
    return [...seen.values()].sort((a, b) => a.id - b.id);
  }

  private leave(ws: WebSocket): void {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    ws.serializeAttachment(null);
    const stillHere = this.ctx.getWebSockets(`p:${a.id}`).some((o) => o !== ws && o.deserializeAttachment() !== null);
    if (!stillHere) {
      this.deliver(this.hub.disconnect(a.id));
      this.broadcast({ type: 'leave', player: { id: a.id, name: a.name } }, ws);
    }
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
