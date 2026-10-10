import { beforeEach, describe, expect, inject, it } from 'vitest';
import type { BattleSetup } from '../../src/sim/types';
import { DB, fresh, freeNeighbour, join, openDuellist, play, post, type Ticket } from './onlineHelpers';
import { SIM_VERSION } from '../../src/sim/version';
import { replayBattle } from '../src/battle';
import { MIN_SIM_VERSION, resolveSimVersion } from '../src/simVersion';
import { ApiError } from '../src/errors';
import { api, devLogin } from './helpers';

const fx = inject('battleFixture');

function rejection(v: number | undefined): ApiError {
  try {
    resolveSimVersion(v);
  } catch (e) {
    return e as ApiError;
  }
  throw new Error(`version ${v} was accepted`);
}

describe('sim version resolution', () => {
  it('today the window is exactly version 1', () => {
    expect(SIM_VERSION).toBe(1);
    expect(MIN_SIM_VERSION).toBe(1);
  });

  it('a missing version is a client from before versioning: v1', () => {
    expect(resolveSimVersion(undefined)).toBe(1);
  });

  it('accepts the current version', () => {
    expect(resolveSimVersion(SIM_VERSION)).toBe(SIM_VERSION);
  });

  it('rejects a newer version than the server knows (426, reload)', () => {
    const e = rejection(SIM_VERSION + 1);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(426);
    expect(e.code).toBe('sim_version_unsupported');
    expect(e.extra).toMatchObject({ simVersion: SIM_VERSION + 1, min: MIN_SIM_VERSION, max: SIM_VERSION });
  });

  it('rejects a version below MIN_SIM_VERSION (a stale client)', () => {
    const e = rejection(MIN_SIM_VERSION - 1);
    expect(e.status).toBe(426);
    expect(e.code).toBe('sim_version_unsupported');
  });
});

describe('replay dispatch by sim version', () => {
  it('replays v1 exactly like the unversioned call', () => {
    const v1 = replayBattle(fx.setup, fx.orders, fx.deployOrders, 1);
    expect(v1.summary).toMatchObject({ winner: fx.winner, ticks: fx.ticks, hash: fx.hash });
    expect(replayBattle(fx.setup, fx.orders, fx.deployOrders).summary.hash).toBe(fx.hash);
  });

  it('refuses a version it has no sim for', () => {
    expect(() => replayBattle(fx.setup, fx.orders, fx.deployOrders, 99)).toThrow(/sim version 99/);
  });
});

describe('battle tickets record and replay the sim version (duel ladder)', () => {
  beforeEach(fresh);
  type Err = { error: { code: string } };
  const ticketVersion = async (id: string) => (await DB().prepare('SELECT sim_version, status FROM duel_tickets WHERE id = ?1').bind(id).first<{ sim_version: number; status: string }>())!;

  it('a versioned round trip: the ticket records the version, the submission replays with it', async () => {
    const { token } = await openDuellist(9701);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    expect((await ticketVersion(t.body.ticket)).sim_version).toBe(SIM_VERSION);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(r.status).toBe(200);
    expect(await ticketVersion(t.body.ticket)).toMatchObject({ sim_version: SIM_VERSION, status: 'used' });
  });

  it('the old client payload shape (no simVersion anywhere) is still accepted, as v1', async () => {
    const { token } = await openDuellist(9702);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1 });
    expect(t.status).toBe(200);
    expect((await ticketVersion(t.body.ticket)).sim_version).toBe(1);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...play(t.body.setup) });
    expect(r.status).toBe(200);
  });

  it('an unknown version gets no ticket, and its submission is refused without closing the ticket', async () => {
    const { token } = await openDuellist(9703);
    const start = await post<Err>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION + 1 });
    expect(start.status).toBe(426);
    expect(start.body.error.code).toBe('sim_version_unsupported');
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1 });
    const sub = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION + 1, ...play(t.body.setup) });
    expect(sub.status).toBe(426);
    expect(sub.body.error.code).toBe('sim_version_unsupported');
    expect((await ticketVersion(t.body.ticket)).status).toBe('open');
  });

  it('a submission under another version than its ticket is void (409 sim_version_mismatch)', async () => {
    const { token } = await openDuellist(9704);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1 });
    // a ticket issued under a version this client no longer runs (a reload across a version bump)
    await DB().prepare('UPDATE duel_tickets SET sim_version = 0 WHERE id = ?1').bind(t.body.ticket).run();
    const sub = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...play(t.body.setup) });
    expect(sub.status).toBe(409);
    expect(sub.body.error.code).toBe('sim_version_mismatch');
    expect((await ticketVersion(t.body.ticket)).status).toBe('rejected');
  });
});

describe('war attacks carry the sim version', () => {
  beforeEach(fresh);

  it('a versioned attack round trip records the version on the battle ticket', async () => {
    const p = await join(9711);
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    const sub = await post('/api/online/attack/submit', p.token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(sub.status).toBe(200);
    const row = await DB().prepare('SELECT sim_version, status FROM battle_tickets WHERE id = ?1').bind(t.body.ticket).first();
    expect(row).toMatchObject({ sim_version: SIM_VERSION, status: 'used' });
  });

  it('an unknown version cannot start an attack', async () => {
    const p = await join(9712);
    const t = await post<{ error: { code: string } }>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION + 1 });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });
});

describe('POST /api/battle/verify carries the sim version', () => {
  const body = (extra: Record<string, unknown> = {}) => ({ setup: fx.setup, orders: fx.orders, deployOrders: fx.deployOrders, claim: { winner: fx.winner, ticks: fx.ticks, hash: fx.hash }, ...extra });

  it('a versioned round trip replays with that version', async () => {
    const { token } = await devLogin(4101);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion: SIM_VERSION }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ match: true, simVersion: SIM_VERSION });
  });

  it('the old client payload (no simVersion) is still accepted, as v1', async () => {
    const { token } = await devLogin(4102);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ match: true, simVersion: 1 });
  });

  it('an unknown version is refused with 426 before any replay', async () => {
    const { token } = await devLogin(4103);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion: SIM_VERSION + 1 }) });
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
