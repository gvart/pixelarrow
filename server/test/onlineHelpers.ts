import { env, SELF } from 'cloudflare:test';
import { expect } from 'vitest';
import { Battle } from '../../src/sim/battle';
import type { BattleSetup, Order } from '../../src/sim/types';
import { getMap, WorldGraph } from '../../src/online/world';
import { rleEncode } from '../../src/online/mapSchema';
import { resetRateLimits } from '../src/rateLimit';
import { forgetSeasonCache } from '../src/online/store';
import { api, BASE, devLogin } from './helpers';

export const DB = () => env.DB!;

export function fresh(): void {
  forgetSeasonCache();
  resetRateLimits();
}

export interface Player {
  token: string;
  playerId: number;
  profile: Profile;
}

export interface Profile {
  season: { id: number };
  shard: { id: number; map: string };
  resources: { gold: number; food: number; wood: number; bronze: number; recruits: number };
  energy: number;
  home: number;
  army: { loc: number; marching: boolean };
  heroes: { hero: { id: string; name: string; group: number }; garrison: number | null; busy: boolean; woundedUntil: number }[];
  stash: { uid: string; def: string }[];
  clan: { id: number; name: string; tag: string; role: string } | null;
  income: { pending: { gold: number; food: number }; regions: number };
}

/** The world graph of a player's shard. */
export function worldOf(p: { profile: Profile }): WorldGraph {
  return getMap(p.profile.shard.map);
}

/** The shard row (seed, map) of a player. */
export async function shardOf(p: { profile: Profile }): Promise<{ season: number; id: number; seed: number; world: WorldGraph }> {
  const r = await DB().prepare('SELECT seed, map_id FROM online_shards WHERE season_id = ?1 AND id = ?2').bind(p.profile.season.id, p.profile.shard.id).first<{ seed: number; map_id: string }>();
  return { season: p.profile.season.id, id: p.profile.shard.id, seed: r!.seed, world: getMap(r!.map_id) };
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

/** Test shortcut for a march: puts a player's army in `loc` of `shard` (moving them into that shard when needed). */
export async function placeArmy(p: Player, loc: number, shard = p.profile.shard.id): Promise<void> {
  if (!Number.isInteger(loc) || !Number.isInteger(shard)) throw new Error(`placeArmy: bad region ${loc} / shard ${shard}`);
  await DB().prepare('UPDATE online_profiles SET army_loc = ?1, shard_id = ?2, march = NULL WHERE season_id = ?3 AND player_id = ?4').bind(loc, shard, p.profile.season.id, p.playerId).run();
  p.profile = { ...p.profile, shard: { ...p.profile.shard, id: shard }, army: { loc, marching: false } };
}

export async function join(id: number, name = `P${id}`): Promise<Player> {
  const { token, playerId } = await devLogin(id, name);
  const res = await api('/api/online/profile', { method: 'POST', token });
  expect(res.status).toBe(200);
  return { token, playerId, profile: await res.json<Profile>() };
}

export async function getJson<T>(path: string, token: string): Promise<{ status: number; body: T }> {
  const res = await api(path, { token });
  return { status: res.status, body: await res.json<T>() };
}

export async function post<T>(path: string, token: string, json: unknown = {}): Promise<{ status: number; body: T }> {
  const res = await api(path, { method: 'POST', token, json });
  return { status: res.status, body: await res.json<T>() };
}

/** A neighbour of the player's army (one route away) that is attackable now (no live attack lock) and held by plain neutrals. */
export async function freeNeighbour(p: Player, filter?: (loc: number) => boolean): Promise<number> {
  const w = worldOf(p);
  const tryFrom = async (): Promise<number | null> => {
    for (const n of w.neighbours(p.profile.army.loc)) {
      if (filter && !filter(n)) continue;
      const r = await getJson<{ region: { occupant: string; owner: number | null }; canAttack: boolean; locked: boolean }>(`/api/online/region/${n}`, p.token);
      // (beast lairs are not plain neutrals: weakenNeutrals cannot touch them;
      // a region another test's open ticket still locks cannot be attacked or garrisoned now)
      if (r.status === 200 && r.body.canAttack && !r.body.locked && r.body.region.owner === null && r.body.region.occupant !== 'beast') return n;
    }
    return null;
  };
  const here = await tryFrom();
  if (here !== null) return here;
  // Homes are random spawn plots, sometimes boxed in by other players' land: march (test shortcut) somewhere freer.
  const held = new Set(
    (await DB().prepare('SELECT loc FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id IS NOT NULL').bind(p.profile.season.id, p.profile.shard.id).all<{ loc: number }>()).results.map((x) => x.loc),
  );
  for (const r of w.all()) {
    if (!r.passable || held.has(r.id)) continue;
    await placeArmy(p, r.id);
    const n = await tryFrom();
    if (n !== null) return n;
  }
  throw new Error('no attackable neighbour');
}

/** Replaces the neutrals of a region with a single weak levy (so an attack is a sure win). */
export async function weakenNeutrals(p: Player, loc: number): Promise<void> {
  const prof = p.profile;
  const levy = {
    id: 'weak_levy',
    name: 'Old Man',
    culture: 'greek',
    level: 1,
    xp: 0,
    traits: [],
    look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicBlue' },
    equip: {},
    kills: 0,
    battles: 0,
    group: 0,
    attrs: { str: 1, agi: 1, end: 1, wil: 1 },
    points: 0,
    perks: [],
    wound: 0,
    arch: 'raw',
  };
  await DB()
    .prepare(
      `INSERT INTO online_regions (season_id, shard_id, loc, npc, npc_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (season_id, shard_id, loc) DO UPDATE SET npc = excluded.npc, npc_at = excluded.npc_at`,
    )
    .bind(prof.season.id, prof.shard.id, loc, JSON.stringify([levy]), Date.now())
    .run();
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
  msgs: Record<string, unknown>[];
  next(type: string, pred?: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>;
  send(m: unknown): void;
  onMessage?: (m: Record<string, unknown>) => void;
}

export function wsOnline(token: string): Promise<WsClient> {
  return wsPath(token, '/ws/online');
}

/** A socket on any /ws/* path (the shard, the duel queue, a duel match). */
export async function wsPath(token: string, path: string): Promise<WsClient> {
  const res = await SELF.fetch(`${BASE}${path}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const msgs: Record<string, unknown>[] = [];
  const waiters: { type: string; pred?: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  const taken = new Set<number>();
  const client: WsClient = {
    ws,
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (type, pred) =>
      new Promise((resolve, reject) => {
        waiters.push({ type, pred, resolve });
        pump();
        setTimeout(() => reject(new Error(`timeout waiting for ${type}; got ${JSON.stringify(msgs.map((m) => m.type))}`)), 10_000);
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
    const m = JSON.parse(e.data as string) as Record<string, unknown>;
    msgs.push(m);
    client.onMessage?.(m);
    pump();
  });
  ws.accept();
  return client;
}

/** A test world: `n` regions in a row (1 - 2 - ... - n), one minute per route. */
export function lineWorld(n: number): WorldGraph {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const site = { base: 'plain', river: false, coast: false, rocky: false, woods: 0 } as const;
  return new WorldGraph({
    id: `line${n}`,
    version: 1,
    cell: 10,
    w: n,
    h: 1,
    mask: rleEncode(ids),
    terrain: rleEncode(ids.map(() => 3)),
    regions: ids.map((id) => ({ id, name: `R${id}`, kind: id === 1 ? 'capital' : 'plot', tier: 1, site, spawn: id === n, label: [id * 10 - 5, 5] as [number, number] })),
    edges: ids.slice(0, -1).map((a) => ({ a, b: a + 1, minutes: 1, waypoints: [] })),
  });
}

/** Moves `others` into `p`'s shard (their armies stay where their loc says), so they meet on one map. */
export async function sameShard(p: Player, ...others: Player[]): Promise<void> {
  for (const o of others) if (o.profile.shard.id !== p.profile.shard.id) await placeArmy(o, o.profile.army.loc, p.profile.shard.id);
}
