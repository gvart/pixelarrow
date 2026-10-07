import { env, SELF } from 'cloudflare:test';
import { expect } from 'vitest';
import { Battle } from '../../src/sim/battle';
import type { BattleSetup, Order } from '../../src/sim/types';
import { hexDistance, neighbours, type Axial } from '../../src/online/hex';
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
  shard: { id: number; radius: number };
  resources: { gold: number; food: number; wood: number; bronze: number; recruits: number };
  energy: number;
  home: Axial;
  army: Axial & { marching: boolean };
  heroes: { hero: { id: string; name: string; group: number }; garrison: Axial | null; busy: boolean; woundedUntil: number }[];
  stash: { uid: string; def: string }[];
  clan: { id: number; name: string; tag: string; role: string } | null;
  income: { pending: { gold: number; food: number }; hexes: number };
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

/** A passable neighbour of the player's army that is not owned by anyone. */
export async function freeNeighbour(p: Player, seedFilter?: (h: Axial) => boolean): Promise<Axial> {
  const pos = p.profile.army;
  for (const n of neighbours(pos)) {
    if (seedFilter && !seedFilter(n)) continue;
    const r = await getJson<{ hex: { occupant: string; owner: number | null; type: string }; canAttack: boolean }>(`/api/online/hex/${n.q}/${n.r}`, p.token);
    // (beast lairs are not plain neutrals: weakenNeutrals cannot touch them)
    if (r.status === 200 && r.body.canAttack && r.body.hex.owner === null && r.body.hex.occupant !== 'beast') return n;
  }
  throw new Error('no attackable neighbour');
}

/** Replaces the neutrals of a hex with a single weak levy (so an attack is a sure win). */
export async function weakenNeutrals(p: Player, h: Axial): Promise<void> {
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
      `INSERT INTO online_hexes (season_id, shard_id, q, r, npc, npc_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (season_id, shard_id, q, r) DO UPDATE SET npc = excluded.npc, npc_at = excluded.npc_at`,
    )
    .bind(prof.season.id, prof.shard.id, h.q, h.r, JSON.stringify([levy]), Date.now())
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

export { hexDistance, neighbours };

// ------------------------------------------------------------------ sockets

export interface WsClient {
  ws: WebSocket;
  msgs: Record<string, unknown>[];
  next(type: string, pred?: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>;
  send(m: unknown): void;
  onMessage?: (m: Record<string, unknown>) => void;
}

export async function wsOnline(token: string): Promise<WsClient> {
  const res = await SELF.fetch(`${BASE}/ws/online`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
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
