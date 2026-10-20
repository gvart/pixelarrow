import { env, SELF } from 'cloudflare:test';
import { expect } from 'vitest';
import { Battle } from '../../src/sim/battle';
import type { BattleSetup, Order } from '../../src/sim/types';
import { resetRateLimits } from '../src/rateLimit';
import { currentSeason, forgetSeasonCache } from '../src/online/store';
import { seasonId } from '../../src/duel/season';
import { api, BASE, devLogin, GAME_ORIGIN } from './helpers';
import { SIM_VERSION } from '../../src/sim/version';

export const DB = () => env.DB!;

export function fresh(): void {
  forgetSeasonCache();
  resetRateLimits();
}

export interface Player {
  token: string;
  playerId: number;
  /** The generated display name (presence, events), never the Telegram name. */
  name: string;
  profile: Profile;
}

export interface Profile {
  season: { id: number };
  resources: { gold: number; food: number; wood: number; bronze: number; recruits: number };
  energy: number;
  heroes: { hero: { id: string; name: string; group: number }; busy: boolean; woundedUntil: number }[];
  stash: { uid: string; def: string }[];
  clan: { id: number; name: string; tag: string; role: string } | null;
}

/** Sets a player's Drachmae balance (creating the wallet). */
export async function giveDrachmae(pid: number, n: number): Promise<void> {
  await DB().prepare('INSERT INTO wallets (player_id, drachmae, updated_at) VALUES (?1, ?2, 0) ON CONFLICT (player_id) DO UPDATE SET drachmae = excluded.drachmae').bind(pid, n).run();
}

/** Sets a player's gold in the current season (other resources unchanged). */
export async function setGold(p: Player, gold: number): Promise<void> {
  const season = await currentSeason(DB());
  await DB().prepare('UPDATE online_profiles SET gold = ?1 WHERE season_id = ?2 AND player_id = ?3').bind(gold, season.id, p.playerId).run();
}

/** Sets a player's gold and wood in the current season (wood 0 unless given). */
export async function setPurse(p: Player, gold: number, wood = 0): Promise<void> {
  const season = await currentSeason(DB());
  await DB().prepare('UPDATE online_profiles SET gold = ?1, wood = ?2 WHERE season_id = ?3 AND player_id = ?4').bind(gold, wood, season.id, p.playerId).run();
}

/**
 * Logs in (as `name`, else devLogin's default) and opens the duel mode.
 * `level5` gives the XP of duel level 5 (ranked); `rating` seeds a live
 * rating with 20 games in the current season.
 */
export async function openDuellist<P = unknown>(tg: number, opts: { name?: string; level5?: boolean; rating?: number } = {}): Promise<{ token: string; pid: number; name: string; profile: P }> {
  const { token, playerId, name } = await devLogin(tg, opts.name);
  const r = await post<P>('/api/duel/profile', token);
  expect(r.status).toBe(200);
  if (opts.level5) await DB().prepare('UPDATE duel_profiles SET xp = 500 WHERE player_id = ?1').bind(playerId).run();
  if (opts.rating !== undefined) {
    await DB()
      .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, updated_at, season, played_at) VALUES (?1, 'live', ?2, 80, 0.06, 20, 0, ?3, ?4)")
      .bind(playerId, opts.rating, seasonId(Date.now()), Date.now())
      .run();
  }
  return { token, pid: playerId, name, profile: r.body };
}

/**
 * A test precondition: the value a lookup found, or a clear error naming what
 * was missing (instead of an `undefined` that only fails later, e.g. as a D1
 * "Type 'undefined' not supported" when it is bound to a query).
 */
export function must<T>(v: T | null | undefined, what: string): T {
  if (v === undefined || v === null) throw new Error(`test precondition failed: no ${what}`);
  return v;
}

export async function join(id: number, name = `P${id}`): Promise<Player> {
  const { token, playerId, name: displayName } = await devLogin(id, name);
  const res = await api('/api/online/profile', { method: 'POST', token });
  expect(res.status).toBe(200);
  return { token, playerId, name: displayName, profile: await res.json<Profile>() };
}

export async function getJson<T>(path: string, token: string): Promise<{ status: number; body: T }> {
  const res = await api(path, { token });
  return { status: res.status, body: await res.json<T>() };
}

export async function post<T>(path: string, token: string, json: unknown = {}): Promise<{ status: number; body: T }> {
  const res = await api(path, { method: 'POST', token, json });
  return { status: res.status, body: await res.json<T>() };
}

export interface Ticket {
  ticket: string;
  setup: BattleSetup;
  attackers: { id: string }[];
  defenders: { id: string }[];
  defenderKind: string;
  expiresAt: number;
}

/** Plays a ticket's battle headless the way the client does (player orders at given ticks, then runs to the end). */
export function play(setup: BattleSetup, script: { tick: number; order: Order }[] = [{ tick: 0, order: { kind: 'order', group: 0, order: 'charge' } }, { tick: 0, order: { kind: 'order', group: 1, order: 'charge' } }]) {
  const b = new Battle(JSON.parse(JSON.stringify(setup)));
  b.startBattle();
  let i = 0;
  while (b.phase !== 'ended' && b.tick < 20 * 320) {
    while (i < script.length && script[i].tick === b.tick) b.issue(0, script[i++].order);
    b.step();
    b.drainEvents();
  }
  return {
    orders: b.orderLog.filter((o) => o.side === 0).map((o) => ({ tick: o.tick, side: o.side, order: o.order })),
    deployOrders: 0,
    claim: { winner: (b.winner ?? -1) as 0 | 1 | -1, ticks: b.tick, hash: b.hash() },
  };
}


// ------------------------------------------------------------------ sockets

export interface WsClient {
  ws: WebSocket;
  /** The Sec-WebSocket-Protocol the server answered with (null: none). */
  protocol: string | null;
  /** Every message so far; a non-JSON frame is recorded as `{ type: 'raw', data }`. */
  msgs: Record<string, unknown>[];
  next(type: string, pred?: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>;
  send(m: unknown): void;
  onMessage?: (m: Record<string, unknown>) => void;
}

/**
 * A socket on any /ws/* path (a war region, the duel queue, a duel
 * match). The session token goes in the Sec-WebSocket-Protocol header
 * (`auth: 'protocol'`, the default: Telegram's bearer) or in the session
 * cookie from the game's origin (`auth: 'cookie'`: the web).
 * Like today's client it adds `?sim=SIM_VERSION` unless the path names `sim=`
 * or `legacy` is set (a client from before versioning, which sends none).
 */
export async function wsPath(token: string, path: string, opts: { auth?: 'protocol' | 'cookie'; legacy?: boolean } = {}): Promise<WsClient> {
  const headers: Record<string, string> = { upgrade: 'websocket' };
  let url = `${BASE}${path}`;
  if (opts.auth === 'cookie') Object.assign(headers, { cookie: `__Host-pa_sid=${token}`, origin: GAME_ORIGIN, 'sec-websocket-protocol': 'pixelarrow.v1' });
  else headers['sec-websocket-protocol'] = `pixelarrow.v1, ${token}`;
  if (!opts.legacy && !/[?&]sim=/.test(path)) url += `${url.includes('?') ? '&' : '?'}sim=${SIM_VERSION}`;
  const res = await SELF.fetch(url, { headers });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const msgs: Record<string, unknown>[] = [];
  const waiters: { type: string; pred?: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  const taken = new Set<number>();
  const client: WsClient = {
    ws,
    protocol: res.headers.get('sec-websocket-protocol'),
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (type, pred) =>
      new Promise((resolve, reject) => {
        waiters.push({ type, pred, resolve });
        pump();
        setTimeout(() => reject(new Error(`timeout waiting for ${type}; got ${JSON.stringify(msgs.map((m) => m.type))}`)), 30_000);
      }),
  };
  const pump = () => {
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i];
      const idx = msgs.findIndex((m, j) => !taken.has(j) && m.type === w.type && (!w.pred || w.pred(m)));
      if (idx >= 0) {
        taken.add(idx);
        waiters.splice(i, 1);
        w.resolve(msgs[idx]);
        i--;
      }
    }
  };
  ws.addEventListener('message', (e) => {
    const m = (typeof e.data === 'string' && e.data.startsWith('{') ? JSON.parse(e.data) : { type: 'raw', data: e.data }) as Record<string, unknown>;
    msgs.push(m);
    client.onMessage?.(m);
    pump();
  });
  ws.accept();
  return client;
}
