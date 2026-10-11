/**
 * The one sim version check (ADR-0001, V5-074): the server takes only
 * SIM_VERSION, on HTTP (426) and on sockets (error frame, close 4426).
 */
import { beforeEach, describe, expect, inject, it } from 'vitest';
import type { BattleSetup } from '../../src/sim/types';
import { SELF } from 'cloudflare:test';
import { SIM_VERSION_CLOSE, SIM_VERSION_REJECTED } from '../../src/online/protocol';
import { DB, fresh, freeNeighbour, join, openDuellist, play, post, wsPath, type Ticket } from './onlineHelpers';
import { SIM_VERSION } from '../../src/sim/version';
import { checkSimVersion, checkSocketSimVersion } from '../src/simVersion';
import { ApiError } from '../src/errors';
import { api, BASE, devLogin } from './helpers';

const fx = inject('battleFixture');

function rejection(check: () => void): ApiError {
  try {
    check();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('the version was accepted');
}

describe('sim version check', () => {
  it('accepts SIM_VERSION', () => {
    expect(() => checkSimVersion(SIM_VERSION)).not.toThrow();
    expect(() => checkSocketSimVersion(String(SIM_VERSION))).not.toThrow();
  });

  it.each([SIM_VERSION - 1, SIM_VERSION + 1, undefined])('refuses %s with 426 (reload)', (v) => {
    for (const e of [rejection(() => checkSimVersion(v)), rejection(() => checkSocketSimVersion(v === undefined ? undefined : String(v)))]) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(426);
      expect(e.code).toBe(SIM_VERSION_REJECTED);
      expect(e.extra).toMatchObject({ simVersion: v ?? null, expected: SIM_VERSION });
    }
  });

  it('a malformed socket version is a 400', () => {
    expect(rejection(() => checkSocketSimVersion('abc')).status).toBe(400);
  });
});

describe('battle tickets (duel ladder)', () => {
  beforeEach(fresh);
  type Err = { error: { code: string } };
  const ticketRow = async (id: string) => (await DB().prepare('SELECT sim_version, status FROM duel_tickets WHERE id = ?1').bind(id).first<{ sim_version: number; status: string }>())!;

  it('a current client gets a ticket stamped with SIM_VERSION, and its submission replays', async () => {
    const { token } = await openDuellist(9701);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(r.status).toBe(200);
    expect(await ticketRow(t.body.ticket)).toMatchObject({ sim_version: SIM_VERSION, status: 'used' });
  });

  it.each([SIM_VERSION - 1, SIM_VERSION + 1, undefined])('version %s gets no ticket (426)', async (simVersion) => {
    const { token } = await openDuellist(9702);
    const t = await post<Err>('/api/duel/ladder/start', token, { floor: 1, simVersion });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });

  it('a submission under another version is refused with 426 and leaves the ticket open', async () => {
    const { token } = await openDuellist(9703);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1 });
    const sub = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION + 1, ...play(t.body.setup) });
    expect(sub.status).toBe(426);
    expect(sub.body.error.code).toBe('sim_version_unsupported');
    expect((await ticketRow(t.body.ticket)).status).toBe('open');
  });
});

describe('war attacks', () => {
  beforeEach(fresh);

  it('a round trip records SIM_VERSION on the battle ticket', async () => {
    const p = await join(9711);
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    const sub = await post('/api/online/attack/submit', p.token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(sub.status).toBe(200);
    const row = await DB().prepare('SELECT sim_version, status FROM battle_tickets WHERE id = ?1').bind(t.body.ticket).first();
    expect(row).toMatchObject({ sim_version: SIM_VERSION, status: 'used' });
  });

  it('another version cannot start an attack (426)', async () => {
    const p = await join(9712);
    const t = await post<{ error: { code: string } }>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION + 1 });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });
});

describe('live sockets (?sim=)', () => {
  beforeEach(fresh);

  it('SIM_VERSION gets in; another version or none gets an error frame and close 4426', async () => {
    const p = await join(9721);
    const ok = await wsPath(p.token, `/ws/online?sim=${SIM_VERSION}`);
    expect((await ok.next('welcome')).type).toBe('welcome');
    ok.ws.close(1000);
    const { token } = await openDuellist(9725);
    const okDuel = await wsPath(token, `/ws/duel?sim=${SIM_VERSION}`);
    expect((await okDuel.next('mm_welcome')).type).toBe('mm_welcome');
    okDuel.ws.close(1000);
    const other = `sim=${SIM_VERSION + 1}`;
    for (const [tok, path] of [[p.token, `/ws/online?${other}`], [p.token, '/ws/online'], [token, `/ws/duel?${other}`], [token, '/ws/duel']]) {
      const ws = await wsPath(tok, path, { legacy: true });
      const closed = new Promise<number>((resolve) => ws.ws.addEventListener('close', (e) => resolve(e.code)));
      expect(await ws.next('error'), path).toMatchObject({ code: SIM_VERSION_REJECTED });
      expect(await closed, path).toBe(SIM_VERSION_CLOSE);
      expect(ws.msgs.map((m) => m.type), path).toEqual(['error']);
    }
  });

  it('a malformed version is refused before the upgrade', async () => {
    const p = await join(9723);
    const res = await SELF.fetch(`${BASE}/ws/online?sim=abc`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${p.token}` } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/battle/verify', () => {
  const body = (extra: Record<string, unknown> = {}) => ({ setup: fx.setup, orders: fx.orders, deployOrders: fx.deployOrders, claim: { winner: fx.winner, ticks: fx.ticks, hash: fx.hash }, ...extra });

  it('replays a SIM_VERSION battle', async () => {
    const { token } = await devLogin(4101);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion: SIM_VERSION }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ match: true, simVersion: SIM_VERSION });
  });

  it.each([SIM_VERSION - 1, SIM_VERSION + 1, undefined])('refuses version %s with 426 before any replay', async (simVersion) => {
    const { token } = await devLogin(4102);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion }) });
    expect(res.status).toBe(426);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('sim_version_unsupported');
  });

  it('a malformed version is a 400 from the schema', async () => {
    const { token } = await devLogin(4104);
    for (const simVersion of ['1', 1.5, -1]) {
      expect((await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion }) })).status).toBe(400);
    }
  });
});
