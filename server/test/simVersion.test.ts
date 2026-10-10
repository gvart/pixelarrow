import { beforeEach, describe, expect, inject, it } from 'vitest';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';
import { SELF } from 'cloudflare:test';
import { SIM_VERSION_CLOSE, SIM_VERSION_REJECTED } from '../../src/online/protocol';
import { newRelay } from '../src/online/relay';
import { DB, fresh, freeNeighbour, join, openDuellist, play, post, wsPath, type Ticket } from './onlineHelpers';
import { SIM_VERSION } from '../../src/sim/version';
import { REPLAYERS, replayBattle } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { BattleV1 } from '../src/sims/v1';
import replayV1 from '../../tests/fixtures/replay-v1.json';
import { MIN_SIM_VERSION, resolveSimVersion, SOCKET_MIN_SIM_VERSION, socketSimVersion } from '../src/simVersion';
import { DuelHub, type Out } from '../src/online/duel';
import { pairBySimVersion, type Waiting } from '../src/duel/matchmaker';
import { onlineBattleSetup } from '../../src/online/battle';
import { DEFAULT_FORMATIONS, starterOnlineArmy } from '../../src/online/rules';
import { ApiError } from '../src/errors';
import { verifyBattle as verifySubmission, type Submission } from '../src/duel/verify';
import { api, BASE, devLogin } from './helpers';

const fx = inject('battleFixture');

/** Battles recorded under SIM_VERSION 1, before the v2 bump (never regenerated; ADR-0001). */
interface RecordedBattle {
  name: string;
  setup: BattleSetup;
  orders: LoggedOrder[];
  deployOrders: number;
  winner: 0 | 1 | -1;
  ticks: number;
  retreated: 0 | 1 | null;
  hash: string;
}
const recorded = (replayV1 as unknown as { battles: RecordedBattle[] }).battles;
/** The one recorded battle with a human (non-bot) side and an order log. */
const v1fx = recorded.find((b) => b.name === 'standard-4242')!;

/** An old (v1) client's submission: the same orders as play(), with the claim the frozen v1 sim gives. */
function playV1(setup: BattleSetup) {
  const p = play(setup);
  const s = replayBattle(structuredClone(setup), p.orders as LoggedOrder[], p.deployOrders, 1).summary;
  return { ...p, claim: { winner: s.winner as 0 | 1 | -1, ticks: s.ticks, hash: s.hash } };
}

function rejection(v: number | undefined): ApiError {
  try {
    resolveSimVersion(v);
  } catch (e) {
    return e as ApiError;
  }
  throw new Error(`version ${v} was accepted`);
}

describe('sim version resolution', () => {
  it('the window is 2..2: FO-01 changed the rules, so the floor rose to 2', () => {
    expect(SIM_VERSION).toBe(2);
    expect(MIN_SIM_VERSION).toBe(2);
  });

  it('refuses a v1 client (426, reload)', () => {
    const e = rejection(1);
    expect(e.status).toBe(426);
    expect(e.code).toBe('sim_version_unsupported');
    expect(e.extra).toMatchObject({ simVersion: 1, min: 2, max: SIM_VERSION });
  });

  it('a missing version is a client from before versioning: v1, refused', () => {
    expect(rejection(undefined).extra).toMatchObject({ simVersion: 1, min: 2 });
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
  it('REPLAYERS holds the frozen v1 sim and the current sim as v2, and nothing else', () => {
    expect(Object.keys(REPLAYERS).map(Number)).toEqual([1, 2]);
    expect(REPLAYERS[1](structuredClone(v1fx.setup))).toBeInstanceOf(BattleV1);
    expect(REPLAYERS[2](structuredClone(v1fx.setup))).toBeInstanceOf(Battle);
    expect(BattleV1).not.toBe(Battle);
  });

  it('every version in the window has a replayer', () => {
    for (let v = MIN_SIM_VERSION; v <= SIM_VERSION; v++) expect(REPLAYERS[v], `v${v}`).toBeTypeOf('function');
  });

  for (const r of recorded) {
    it(`the frozen v1 sim replays the recorded v1 battle ${r.name} to its hash (in workerd)`, () => {
      const out = replayBattle(structuredClone(r.setup), r.orders, r.deployOrders, 1);
      expect(out.summary).toMatchObject({ winner: r.winner, ticks: r.ticks, retreated: r.retreated, hash: r.hash });
    });

    it(`v2 replays ${r.name} deterministically under its own rules (FO-03 changed them)`, () => {
      // FO-03 (cohesion, army break) is the first train-2 rule that changes
      // bot-only battles; the recorded v2 fixture comes with ST-04.
      const out = replayBattle(structuredClone(r.setup), r.orders, r.deployOrders, 2).summary;
      expect(replayBattle(structuredClone(r.setup), r.orders, r.deployOrders, 2).summary).toEqual(out);
      expect(out.ticks).toBeGreaterThan(0);
    });
  }

  it('an unversioned replay is v1', () => {
    expect(replayBattle(structuredClone(v1fx.setup), v1fx.orders, v1fx.deployOrders).summary.hash).toBe(v1fx.hash);
  });

  it('refuses a version it has no sim for', () => {
    expect(() => replayBattle(fx.setup, fx.orders, fx.deployOrders, 99)).toThrow(/sim version 99/);
  });
});

describe('in-flight tickets replay under the version they were issued with', () => {
  const v1body = (simVersion?: number): Submission => ({
    simVersion,
    ticket: '0'.repeat(32),
    orders: v1fx.orders,
    deployOrders: v1fx.deployOrders,
    claim: { winner: v1fx.winner, ticks: v1fx.ticks, hash: v1fx.hash },
  });
  /** Runs `fn` while counting calls to REPLAYERS[v]. */
  async function countReplays(v: number, fn: () => Promise<unknown>): Promise<number> {
    const table = REPLAYERS as Record<number, (typeof REPLAYERS)[number]>;
    const orig = table[v];
    let n = 0;
    table[v] = (setup) => (n++, orig(setup));
    try {
      await fn();
    } finally {
      table[v] = orig;
    }
    return n;
  }
  const keepOpen = async () => {
    throw new Error('the ticket must not be closed');
  };

  it('an old client (no version) on a v1 ticket is replayed by the frozen v1 sim, below the floor', async () => {
    expect(MIN_SIM_VERSION).toBeGreaterThan(1);
    const n = await countReplays(1, async () => {
      const out = await verifySubmission({ setup: structuredClone(v1fx.setup), simVersion: 1 }, v1body(), keepOpen);
      expect(out.summary.hash).toBe(v1fx.hash);
    });
    expect(n).toBe(1);
  });

  it('a v2 client on a v1 ticket is a 409 mismatch, and the ticket is closed', async () => {
    let closed = false;
    const e = await verifySubmission({ setup: structuredClone(v1fx.setup), simVersion: 1 }, v1body(SIM_VERSION), async () => void (closed = true)).catch((x: ApiError) => x);
    expect(e).toMatchObject({ status: 409, code: 'sim_version_mismatch' });
    expect(closed).toBe(true);
  });

  it('an old client on a v2 ticket is a 426 and the ticket stays open', async () => {
    const e = await verifySubmission({ setup: structuredClone(v1fx.setup), simVersion: SIM_VERSION }, v1body(), keepOpen).catch((x: ApiError) => x);
    expect(e).toMatchObject({ status: 426, code: 'sim_version_unsupported' });
  });

  it('a ticket version this server has no sim for is not replayed (426, open)', async () => {
    const e = await verifySubmission({ setup: structuredClone(v1fx.setup), simVersion: 0 }, v1body(0), keepOpen).catch((x: ApiError) => x);
    expect(e).toMatchObject({ status: 426, code: 'sim_version_unsupported' });
  });
});

describe('battle tickets record and replay the sim version (duel ladder)', () => {
  beforeEach(fresh);
  type Err = { error: { code: string } };
  const ticketVersion = async (id: string) => (await DB().prepare('SELECT sim_version, status FROM duel_tickets WHERE id = ?1').bind(id).first<{ sim_version: number; status: string }>())!;

  it('a v2 client gets a v2 ticket, and its submission replays with v2', async () => {
    const { token } = await openDuellist(9701);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    expect((await ticketVersion(t.body.ticket)).sim_version).toBe(SIM_VERSION);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(r.status).toBe(200);
    expect(await ticketVersion(t.body.ticket)).toMatchObject({ sim_version: SIM_VERSION, status: 'used' });
  });

  it('a v1 client gets no ticket (426, reload)', async () => {
    const { token } = await openDuellist(9705);
    const t = await post<Err>('/api/duel/ladder/start', token, { floor: 1, simVersion: 1 });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });

  it('an old client (no simVersion) finishes a v1 ticket issued before the raise: replayed with the frozen v1 sim, resolved', async () => {
    const { token } = await openDuellist(9706);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    // as if the row predates the raise (migration 0016 default)
    await DB().prepare('UPDATE duel_tickets SET sim_version = 1 WHERE id = ?1').bind(t.body.ticket).run();
    const r = await post<{ replayed?: boolean }>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: undefined, ...playV1(t.body.setup) });
    expect(r.status).toBe(200);
    expect(await ticketVersion(t.body.ticket)).toMatchObject({ sim_version: 1, status: 'used' });
  });

  it('an old client cannot finish a v1 ticket after it expired (410, no replay)', async () => {
    const { token } = await openDuellist(9707);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    await DB().prepare('UPDATE duel_tickets SET sim_version = 1, expires_at = 1 WHERE id = ?1').bind(t.body.ticket).run();
    const r = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: undefined, ...playV1(t.body.setup) });
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('ticket_expired');
  });

  it('an old client cannot submit a ticket that does not exist (404)', async () => {
    const { token } = await openDuellist(9708);
    const r = await post<Err>('/api/duel/ladder/submit', token, { ticket: '0'.repeat(32), simVersion: undefined, ...playV1(fx.setup) });
    expect(r.status).toBe(404);
  });

  it('a v2 client submitting a v1 ticket is void (409 sim_version_mismatch)', async () => {
    const { token } = await openDuellist(9709);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    await DB().prepare('UPDATE duel_tickets SET sim_version = 1 WHERE id = ?1').bind(t.body.ticket).run();
    const r = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('sim_version_mismatch');
    expect((await ticketVersion(t.body.ticket)).status).toBe('rejected');
  });

  it('an old client submitting a v2 ticket is refused with 426 and leaves the ticket open', async () => {
    const { token } = await openDuellist(9710);
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 1, simVersion: SIM_VERSION });
    const r = await post<Err>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: undefined, ...play(t.body.setup) });
    expect(r.status).toBe(426);
    expect(r.body.error.code).toBe('sim_version_unsupported');
    expect(await ticketVersion(t.body.ticket)).toMatchObject({ sim_version: SIM_VERSION, status: 'open' });
  });

  it('the old client payload shape (no simVersion anywhere) is refused as v1', async () => {
    const { token } = await openDuellist(9702);
    const t = await post<Err>('/api/duel/ladder/start', token, { floor: 1, simVersion: undefined });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
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

  it('an attack started on v1 before the raise still resolves for the old client (frozen v1 replay)', async () => {
    const p = await join(9713);
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    await DB().prepare('UPDATE battle_tickets SET sim_version = 1 WHERE id = ?1').bind(t.body.ticket).run();
    const sub = await post('/api/online/attack/submit', p.token, { ticket: t.body.ticket, simVersion: undefined, ...playV1(t.body.setup) });
    expect(sub.status).toBe(200);
    const row = await DB().prepare('SELECT sim_version, status FROM battle_tickets WHERE id = ?1').bind(t.body.ticket).first();
    expect(row).toMatchObject({ sim_version: 1, status: 'used' });
  });

  it('an old client cannot start a new attack (426, reload)', async () => {
    const p = await join(9714);
    const t = await post<{ error: { code: string } }>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: undefined });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });

  it('an unknown version cannot start an attack', async () => {
    const p = await join(9712);
    const t = await post<{ error: { code: string } }>('/api/online/attack/start', p.token, { loc: await freeNeighbour(p), simVersion: SIM_VERSION + 1 });
    expect(t.status).toBe(426);
    expect(t.body.error.code).toBe('sim_version_unsupported');
  });
});

describe('live sockets carry the sim version (?sim=)', () => {
  beforeEach(fresh);

  it('the socket floor is 2: v2 gets in; v1 (sim=1) and a client that sends no version get an error frame and close 4426', async () => {
    expect(SOCKET_MIN_SIM_VERSION).toBe(2);
    const p = await join(9721);
    const ok = await wsPath(p.token, `/ws/online?sim=${SIM_VERSION}`);
    expect((await ok.next('welcome')).type).toBe('welcome');
    ok.ws.close(1000);
    const { token } = await openDuellist(9725);
    const okDuel = await wsPath(token, `/ws/duel?sim=${SIM_VERSION}`);
    expect((await okDuel.next('mm_welcome')).type).toBe('mm_welcome');
    okDuel.ws.close(1000);
    for (const [tok, path] of [[p.token, '/ws/online?sim=1'], [p.token, '/ws/online'], [token, '/ws/duel?sim=1'], [token, '/ws/duel']]) {
      const ws = await wsPath(tok, path, { legacy: true });
      const closed = new Promise<number>((resolve) => ws.ws.addEventListener('close', (e) => resolve(e.code)));
      expect(await ws.next('error'), path).toMatchObject({ code: SIM_VERSION_REJECTED });
      expect(await closed, path).toBe(SIM_VERSION_CLOSE);
    }
  });

  it('a socket below the floor is refused with 426 (the gateway turns it into close 4426)', () => {
    for (const raw of ['1', undefined]) {
      const e = (() => {
        try {
          socketSimVersion(raw);
        } catch (err) {
          return err as ApiError;
        }
        throw new Error(`sim=${raw} was accepted under the floor`);
      })();
      expect(e.status).toBe(426);
      expect(e.code).toBe(SIM_VERSION_REJECTED);
      expect(e.extra).toMatchObject({ simVersion: 1, min: 2, max: SIM_VERSION });
    }
    expect(socketSimVersion('2')).toBe(2);
  });

  it('an unknown version gets an error frame and close 4426, not a lobby', async () => {
    const p = await join(9722);
    for (const path of [`/ws/online?sim=${SIM_VERSION + 1}`, `/ws/duel?sim=${SIM_VERSION + 1}`]) {
      const ws = await wsPath(p.token, path);
      const closed = new Promise<number>((resolve) => ws.ws.addEventListener('close', (e) => resolve(e.code)));
      expect(await ws.next('error')).toMatchObject({ code: SIM_VERSION_REJECTED });
      expect(await closed).toBe(SIM_VERSION_CLOSE);
      expect(ws.msgs.map((m) => m.type)).toEqual(['error']);
    }
  });

  it('a malformed version is refused before the upgrade', async () => {
    const p = await join(9723);
    const res = await SELF.fetch(`${BASE}/ws/online?sim=abc`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${p.token}` } });
    expect(res.status).toBe(400);
  });

  it('a live duel replays with the version it was created under', () => {
    const d = newRelay('d1', [1, 2], ['a', 'b'], fx.setup, 0);
    expect(d.simVersion).toBe(SIM_VERSION);
    expect(d.simVersion).toBe(2);
  });
});

describe('POST /api/battle/verify carries the sim version', () => {
  const body = (extra: Record<string, unknown> = {}) => ({ setup: fx.setup, orders: fx.orders, deployOrders: fx.deployOrders, claim: { winner: fx.winner, ticks: fx.ticks, hash: fx.hash }, ...extra });
  /** A battle recorded under v1: its claim must hold under the frozen v1 sim. */
  const v1body = (extra: Record<string, unknown> = {}) => ({
    setup: v1fx.setup,
    orders: v1fx.orders,
    deployOrders: v1fx.deployOrders,
    claim: { winner: v1fx.winner, ticks: v1fx.ticks, retreated: v1fx.retreated, hash: v1fx.hash },
    ...extra,
  });

  it('a versioned round trip replays with that version', async () => {
    const { token } = await devLogin(4101);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: body({ simVersion: SIM_VERSION }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ match: true, simVersion: SIM_VERSION });
  });

  it('a v1 client battle is refused with 426 before any replay', async () => {
    const { token } = await devLogin(4105);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: v1body({ simVersion: 1 }) });
    expect(res.status).toBe(426);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('sim_version_unsupported');
  });

  it('the old client payload (no simVersion) is refused as v1', async () => {
    const { token } = await devLogin(4102);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: v1body({ simVersion: undefined }) });
    expect(res.status).toBe(426);
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

describe('live duels pair only clients of the same sim version (V5-033)', () => {
  const W = (pid: number, sim: number | undefined): Waiting => ({ pid, name: `p${pid}`, mode: 'unranked', rating: 1500, games: 0, since: 0, sim });

  it('the duel queue never pairs v1 with v2', () => {
    expect(pairBySimVersion([W(1, 1), W(2, 2)], 0)).toEqual([]);
    expect(pairBySimVersion([W(1, 1), W(2, 2), W(3, 2), W(4, undefined)], 0).map((p) => p.map((w) => w.pid).sort())).toEqual(
      expect.arrayContaining([[1, 4], [2, 3]]),
    );
  });

  function hub(sims: Record<number, number>) {
    const p0 = starterOnlineArmy(1, { nextId: 1 }, 'a_');
    const p1 = starterOnlineArmy(2, { nextId: 1 }, 'b_');
    let n = 0;
    return new DuelHub({
      now: () => 0,
      randomId: () => `id${n++}`,
      randomSeed: () => 4242,
      online: () => true,
      simOf: (pid) => sims[pid],
      buildDuel: async (_a, _b, seed) => ({
        setup: onlineBattleSetup(seed, { heroes: p0, formations: DEFAULT_FORMATIONS, bot: false }, { heroes: p1, formations: DEFAULT_FORMATIONS, bot: false }, null),
        heroes: [p0, p1],
      }),
    });
  }
  const A = { id: 1, name: 'A' };
  const B = { id: 2, name: 'B' };
  const lookup = (id: number) => (id === 1 ? A : id === 2 ? B : null);
  const errors = (out: Out[]) => out.filter((o) => o.msg.type === 'error').map((o) => (o.msg as { code?: string }).code);

  it('a shard challenge between v1 and v2 is refused with sim_version_mismatch', async () => {
    const h = hub({ 1: 1, 2: 2 });
    expect(errors(await h.handle(A, { type: 'challenge', to: 2 } as never, lookup))).toEqual(['sim_version_mismatch']);
    expect(h.challenges.size).toBe(0);
  });

  it('a challenge accepted after one side reloaded onto other rules is refused, not started', async () => {
    const sims: Record<number, number> = { 1: 1, 2: 1 };
    const h = hub(sims);
    const sent = await h.handle(A, { type: 'challenge', to: 2 } as never, lookup);
    const id = (sent.find((o) => o.msg.type === 'challenge_sent')!.msg as { id: string }).id;
    sims[2] = 2;
    expect(errors(await h.handle(B, { type: 'challenge_reply', id, accept: true } as never, lookup))).toEqual(['sim_version_mismatch']);
    expect(h.duels.size).toBe(0);
  });

  it('same-version players duel under their own version', async () => {
    const h = hub({ 1: 1, 2: 1 });
    const sent = await h.handle(A, { type: 'challenge', to: 2 } as never, lookup);
    const id = (sent.find((o) => o.msg.type === 'challenge_sent')!.msg as { id: string }).id;
    await h.handle(B, { type: 'challenge_reply', id, accept: true } as never, lookup);
    expect([...h.duels.values()].map((d) => d.simVersion)).toEqual([1]);
  });
});
