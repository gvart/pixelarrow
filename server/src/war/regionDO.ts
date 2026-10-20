/**
 * WarRegionDO: one Durable Object per war region (M3; W-05..W-07). Hosts a WarRoom (./room.ts) and steps it at 10 Hz
 * with a timer loop while anyone is connected or armies stand in the region; an alarm every KEEPALIVE_MS keeps the
 * object resident meanwhile. Sockets use the hibernation API; the object cannot hibernate while the loop runs.
 *
 * The Worker authenticates the socket (/ws/war/:region) and forwards it with X-Player-Id; the DO trusts that header.
 * Protocol: src/war/net/protocol.ts. GET /stats (dev only, routed by the Worker) reports tick times and bandwidth.
 *
 * M5e persistence:
 *  - a join names persons by id: they are claimed in D1 for this region (./persons.ts claimForJoin) and spawned;
 *    refused or abandoned joins send them home again.
 *  - every finished fight (WarRoom tick `fights`) is written to D1 in one idempotent batch (applyFight), in order,
 *    retried on failure.
 *  - the room's whole state (WarRoom.saveState: the sim's exact state and the room's books) goes to DO storage every
 *    SAVE_TICKS, after joins and fights, as gzipped JSON in chunks (`state:meta` + `state:<i>`, one atomic put); an
 *    evicted object restores it on its next socket or its pending alarm (WarRoom.restore, persons reloaded from D1) and
 *    the region steps on exactly where it was saved. A region with no saved state starts fresh and sends home anyone D1
 *    still has deployed there.
 *
 * M5h4 crafting: a `mend` message takes the stash item from D1 to the workplace (./crafting.ts takeForMend) and the
 * room queues it; every tick's `crafted` events are written back (applyCrafts: minted items, repairs, salvage; keyed,
 * idempotent) and mend items whose order went go back to the stash.
 *
 * M4 world: WarWorldDO calls depart / arrive over RPC for transfers between regions (./world/world.ts); a world region
 * reports its summary (live men, claim points, claims in progress) to the world every REPORT_TICKS when it changed.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { WarRoom, type RoomOptions, type RoomState, type TickTimes } from './room';
import { warRegion } from './regions';
import { DEFAULT_CAP, parseClientMsg, type JoinMsg, type MendMsg, type ServerMsg } from '../../../src/war/net/protocol';
import type { WarPerson } from '../../../src/war/types';
import { logError } from '../telemetry/log';
import { applyFight, claimForJoin, deployed, freeRaided, release, releaseRegion } from './persons';
import { applyCrafts, keepMends, returnMends, takeForMend } from './crafting';
import { isWorldRegion } from '../../../src/war/world/graph';
import type { Side } from '../../../src/war/world/types';
import { WORLD_NAME, type ArriveResult, type DepartResult } from './world/world';

const TICK_MS = 100;
/** Ticks between summaries to the world map (sent only when changed). */
const REPORT_TICKS = 50;
const KEEPALIVE_MS = 10_000;
/** Tick history kept for /stats. */
const HISTORY = 600;
/** Ticks between state saves to DO storage (30 s). */
const SAVE_TICKS = 300;
/** D1 write attempts before a write is dropped (logged). */
const WRITE_TRIES = 5;

interface Attachment { pid: number }

export class WarRegionDO extends DurableObject<Env> {
  private room: WarRoom | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  private times: (TickTimes & { totalMs: number; sendMs: number; bytes: number; units: number; clients: number; lateMs: number })[] = [];
  private overruns = 0;
  private savedAt = 0;
  private saving: Promise<void> = Promise.resolve();
  /** D1 writes in order (fights, releases); `writing` drains it. */
  private writes: { what: string; run: () => Promise<unknown> }[] = [];
  private writing: Promise<void> | null = null;
  /** M4: the last summary sent to the world. */
  private reported = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private options(region: string): RoomOptions | null {
    const data = warRegion(region);
    if (!data) return null;
    return { region: data, seed: 1, cap: Number(this.env.WAR_CAP) || DEFAULT_CAP, allowArmy: this.env.DEV_AUTH === '1' };
  }

  /** The room of `region`: in memory, restored from storage after an eviction, or fresh. Null for an unknown region. */
  private async ensure(region: string): Promise<WarRoom | null> {
    if (this.room) return this.room.region.id === region ? this.room : null;
    const o = this.options(region);
    if (!o) return null;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.room) return;
      const st = await loadState(this.ctx.storage);
      const d = this.env.DB;
      let restored: WarRoom | null = null;
      if (st && st.region === region) {
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
        this.flushReleased(restored);
      } else {
        if (d) await releaseRegion(d, region);
        this.room = new WarRoom(o);
      }
      await this.ctx.storage.put('region', region);
    });
    return this.room;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const region = request.headers.get('x-region-id') ?? '';
    if (url.pathname.endsWith('/stats')) return Response.json(this.stats());
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
    const pid = Number(request.headers.get('x-player-id'));
    if (!Number.isSafeInteger(pid) || pid <= 0) return new Response('Missing player', { status: 400 });
    if (!(await this.ensure(region))) return new Response('Unknown region', { status: 404 });
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
    if (this.room!.active()) this.start(); // a restored region runs on
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
        if (err) send(ws, { t: 'error', code: err, detail: m.o.kind });
      } else if (m.t === 'view') room.view(me.pid, m);
      else if (m.t === 'ping') send(ws, { t: 'pong', c: m.c, tick: room.currentTick });
      else if (m.t === 'check') send(ws, room.check(me.pid, m));
      else if (m.t === 'mend') await this.mend(ws, me.pid, room, m);
    } catch (e) {
      logError('war_message_failed', e);
    }
  }

  private async join(ws: WebSocket, pid: number, room: WarRoom, m: JoinMsg): Promise<void> {
    const region = room.region.id;
    let persons: WarPerson[][] | undefined;
    if (m.squads && m.region === region && room.spawnsNew(pid)) {
      const d = this.env.DB;
      if (!d) return send(ws, { t: 'refused', reason: 'army', detail: 'no database' });
      const got = await claimForJoin(d, pid, region, m.squads, room.personsHere(), Date.now());
      if (typeof got === 'string') return send(ws, { t: 'refused', reason: 'army', detail: got });
      persons = got;
    }
    const res = room.join(pid, m, persons);
    send(ws, res.msg);
    if (res.msg.t === 'refused' && persons) this.write('release', () => release(this.env.DB!, region, m.squads!.flat()));
    this.save();
    this.start();
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
   * M4 (RPC from WarWorldDO): the player's squad leaves for `to` over the entry on `side`; its persons are marked in
   * transit in D1 (`region = '>' + to`) before the world records the transfer.
   */
  async depart(region: string, pid: number, squad: number, side: Side, to: string, foeRadius: number): Promise<DepartResult> {
    const room = await this.ensure(region);
    if (!room) return { error: 'region', detail: region };
    const r = room.depart(pid, squad, side, foeRadius);
    if ('error' in r) return r;
    const d = this.env.DB;
    if (d) await d.prepare('UPDATE war_persons SET region = ?3, updated_at = ?4 WHERE region = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(r.ids), `>${to}`, Date.now()).run();
    this.save();
    this.report(room, true);
    return r;
  }

  /**
   * M4 (RPC from WarWorldDO): persons `ids` of the player (alliance `team`) in transit to this region come in over the
   * entry on `side`, if the alliance's quota has room (else the world keeps them waiting). D1 marks them deployed here.
   */
  async arrive(region: string, pid: number, team: number, ids: string[], side: Side): Promise<ArriveResult> {
    const room = await this.ensure(region);
    const d = this.env.DB;
    if (!room || !d) return { error: 'unavailable' };
    const road = `>${region}`;
    const got = await deployed(d, road, ids);
    const persons = ids.flatMap((id) => got.get(id) ?? []);
    if (!persons.length) return { error: 'gone' };
    const r = room.arrive(pid, team, persons, side);
    if ('error' in r) return r;
    await d.batch([
      d.prepare('UPDATE war_persons SET region = ?1, updated_at = ?4 WHERE region = ?3 AND id IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(persons.map((p) => p.id)), road, Date.now()),
      d.prepare('UPDATE war_persons SET region = NULL WHERE region = ?2 AND id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(ids), road),
    ]);
    if (r.msg) for (const ws of this.ctx.getWebSockets(`p:${pid}`)) send(ws, r.msg);
    this.save();
    this.start();
    this.report(room, true);
    return { ok: true };
  }

  /** M4: tell the world what its map shows of this region, when it changed (world regions only). */
  private report(room: WarRoom, now = false): void {
    if (!isWorldRegion(room.region.id) || (!now && room.currentTick % REPORT_TICKS !== 0)) return;
    const s = JSON.stringify(room.summary());
    if (s === this.reported) return;
    this.reported = s;
    const world = this.env.WAR_WORLD.get(this.env.WAR_WORLD.idFromName(WORLD_NAME));
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
    // evicted while armies stood: the pending alarm brings the region back
    if (!this.room) {
      const region = await this.ctx.storage.get<string>('region');
      if (region && (await this.ctx.storage.get(STATE_META))) await this.ensure(region);
      if (this.room && (this.room as WarRoom).active()) this.start();
    }
    if (this.timer) await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
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
    const st = room.alive() === 0 && room.online() === 0 ? null : room.saveState();
    this.saving = this.saving.then(() => storeState(this.ctx.storage, st)).catch((e) => logError('war_save_failed', e));
    this.ctx.waitUntil(this.saving);
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
    if (!room || !room.active()) {
      this.timer = null;
      if (room) this.report(room, true);
      this.save();
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
    const d = this.env.DB;
    if (d) for (const f of r.fights) this.write(`fight ${f.id}`, () => applyFight(d, f.id, room.region.id, f.report, Date.now()));
    if (d && r.raided.length) {
      const at = Date.now();
      this.write('raid', () => freeRaided(d, room.region.id, r.raided, at));
    }
    if (d && r.crafted.length) this.write('crafted', () => applyCrafts(d, room.region.id, room.run, r.crafted, Date.now()));
    if (d && r.freed.length) this.write('unmend', () => returnMends(d, room.region.id, r.freed));
    this.flushReleased(room);
    this.report(room);
    if (r.fights.length || r.crafted.length || r.freed.length || r.admitted.size || room.currentTick - this.savedAt >= SAVE_TICKS) this.save();
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
export async function storeState(storage: DurableObjectStorage, st: RoomState | null): Promise<void> {
  const old = (await storage.get<{ n: number }>(STATE_META))?.n ?? 0;
  if (!st) {
    await storage.delete([STATE_META, ...Array.from({ length: old }, (_, i) => `state:${i}`)]);
    return;
  }
  const z = await gzip(JSON.stringify(st));
  const n = Math.ceil(z.length / CHUNK);
  const put: Record<string, unknown> = { [STATE_META]: { n, region: st.region, tick: st.tick, bytes: z.length } };
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
