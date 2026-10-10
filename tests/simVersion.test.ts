/**
 * The client side of sim versioning (design/adr/ADR-0001-determinism-replay.md):
 * every online battle call carries SIM_VERSION, sockets carry ?sim=, and a
 * version rejection reads as "please reload".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION } from '../src/sim/version';
import { SIM_VERSION_CLOSE, SIM_VERSION_REJECTED } from '../src/online/protocol';
import { online } from '../src/platform/cloud';
import { ApiError } from '../src/platform/api';
import { errorText, onlineApi, ShardSocket, simSocketPath } from '../src/online/client';
import { ApiDuelSource } from '../src/duel/client';
import { setLang, t } from '../src/i18n';
import { reportBattle } from '../src/platform/verify';
import { Battle } from '../src/sim/battle';
import type { BattleSetup } from '../src/sim/types';
import { BattleV1 } from '../server/src/sims/v1';
import type { LoggedOrder as LoggedOrderV1 } from '../server/src/sims/v1/sim/types';
import replayV1 from './fixtures/replay-v1.json';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setLang('en');
});

/** Captures the bodies the client posts. */
function capture() {
  const bodies: Record<string, Record<string, unknown>> = {};
  vi.spyOn(online.api, 'request').mockImplementation(async (_method: string, path: string, opts?: { body?: unknown }) => {
    bodies[path] = opts?.body as Record<string, unknown>;
    return {} as never;
  });
  vi.spyOn(online, 'available', 'get').mockReturnValue(true);
  vi.spyOn(online, 'signIn').mockResolvedValue(true);
  return bodies;
}

const claim = { winner: 0 as const, ticks: 10, hash: 'abc' };

describe('online battle calls carry the sim version', () => {
  it('war attacks and boss raids: start and submit', async () => {
    const bodies = capture();
    await onlineApi.attackStart(5);
    await onlineApi.attackSubmit('t1', [], 0, claim);
    await onlineApi.raidStart('kraken');
    await onlineApi.raidSubmit('t2', [], 0, claim);
    for (const path of ['/api/online/attack/start', '/api/online/attack/submit', '/api/online/boss/start', '/api/online/boss/submit']) {
      expect(bodies[path], path).toMatchObject({ simVersion: SIM_VERSION });
    }
  });

  it('duel ladder and async raids: start and submit', async () => {
    const bodies = capture();
    const src = new ApiDuelSource();
    await src.ladderStart(1);
    await src.ladderSubmit('t1', { orders: [], deployOrders: 0, claim });
    await src.asyncStart(7);
    await src.asyncSubmit('t2', { orders: [], deployOrders: 0, claim });
    for (const path of ['/api/duel/ladder/start', '/api/duel/ladder/submit', '/api/duel/async/start', '/api/duel/async/submit']) {
      expect(bodies[path], path).toMatchObject({ simVersion: SIM_VERSION });
    }
  });

  it('the campaign battle report (POST /api/battle/verify)', () => {
    vi.spyOn(online, 'signedIn', 'get').mockReturnValue(true);
    const sent = vi.spyOn(online, 'verifyBattle').mockImplementation(() => {});
    const sim = { orderLog: [], winner: 0, tick: 10, retreated: null, hash: () => 'abc' } as unknown as Battle;
    reportBattle({} as BattleSetup, sim, 0);
    expect(sent.mock.calls[0][0]).toMatchObject({ simVersion: SIM_VERSION });
  });

  it('sockets carry ?sim=', () => {
    expect(simSocketPath('/ws/online')).toBe(`/ws/online?sim=${SIM_VERSION}`);
    expect(simSocketPath('/ws/duel/abc')).toBe(`/ws/duel/abc?sim=${SIM_VERSION}`);
  });
});

describe('a version rejection asks the player to reload', () => {
  it('errorText turns 426 sim_version_unsupported into the reload message, in both languages', () => {
    const e = new ApiError(426, SIM_VERSION_REJECTED, 'Your game version is out of date.');
    expect(errorText(e)).toBe(t('online.reloadForUpdate'));
    setLang('ru');
    expect(errorText(e)).toBe(t('online.reloadForUpdate'));
    expect(errorText(e)).not.toBe(e.message);
  });

  it('other errors keep their message', () => {
    expect(errorText(new ApiError(409, 'ticket_used', 'This battle was already reported'))).toBe('This battle was already reported');
  });

  it('a refused socket shows the reload message and stops reconnecting', () => {
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: ((e: { code: number }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {
        sockets.push(this);
      }
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { origin: 'https://game.test' });
    const token = online.api.token;
    online.api.token = 'tok';
    vi.useFakeTimers();
    try {
      const sock = new ShardSocket('/ws/online');
      const got: { type: string; code?: string; message?: string }[] = [];
      sock.on((m) => got.push(m as never));
      sock.open();
      expect(sockets[0].url).toBe(`wss://game.test/ws/online?sim=${SIM_VERSION}`);
      sockets[0].onmessage!({ data: JSON.stringify({ type: 'error', code: SIM_VERSION_REJECTED, message: 'server text' }) });
      sockets[0].onclose!({ code: SIM_VERSION_CLOSE });
      expect(got).toEqual([{ type: 'error', code: SIM_VERSION_REJECTED, message: t('online.reloadForUpdate') }]);
      vi.advanceTimersByTime(120_000);
      expect(sockets).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      online.api.token = token;
    }
  });
});

/**
 * SIM_VERSION 2 (ST-01, ADR-0001 "Adding a version"): the v1 rules are frozen
 * into server/src/sims/v1 and the current sim becomes v2. Battles recorded
 * under v1 (tests/fixtures/replay-v1.json, never regenerated) must replay to
 * their recorded state under the frozen copy, forever.
 */
interface RecordedBattle {
  name: string;
  setup: BattleSetup;
  orders: LoggedOrderV1[];
  deployOrders: number;
  winner: 0 | 1 | -1;
  ticks: number;
  retreated: 0 | 1 | null;
  mid: string;
  hash: string;
}
const v1 = replayV1 as unknown as { simVersion: number; battles: RecordedBattle[] };

/** The server's replay protocol (server/src/battle.ts replayBattle), for any sim build. */
function replayWith(make: (setup: BattleSetup) => Battle | BattleV1, r: RecordedBattle) {
  const b = make(JSON.parse(JSON.stringify(r.setup)));
  for (const o of r.orders.slice(0, r.deployOrders)) if (!r.setup.armies[o.side].bot) b.issue(o.side, o.order);
  b.startBattle();
  const rest = r.orders.slice(r.deployOrders).filter((o) => !r.setup.armies[o.side].bot);
  let next = 0;
  let mid = '';
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks + 1) {
    while (next < rest.length && rest[next].tick === b.tick) b.issue(rest[next].side, rest[next++].order);
    b.step();
    b.drainEvents();
    if (b.tick === 600) mid = b.hash();
  }
  return { winner: b.winner ?? -1, ticks: b.tick, retreated: b.retreated ?? null, mid, hash: b.hash() };
}

const expected = (r: RecordedBattle) => ({ winner: r.winner, ticks: r.ticks, retreated: r.retreated, mid: r.mid, hash: r.hash });

describe('SIM_VERSION 2: the v1 sim is frozen', () => {
  it('the client runs version 2', () => {
    expect(SIM_VERSION).toBe(2);
  });

  it('the fixture was recorded under v1 and covers terrain, classes, beasts and human orders', () => {
    expect(v1.simVersion).toBe(1);
    expect(v1.battles.map((b) => b.name)).toEqual(['standard-4242', 'terrain-bots-9', 'classes-bots-21', 'beast-hydra-11']);
  });

  for (const r of v1.battles) {
    it(`the frozen v1 copy replays ${r.name} to the recorded hash`, () => {
      expect(replayWith((s) => new BattleV1(s), r)).toEqual(expected(r));
    });

    it(`no rule change yet: the v2 sim replays ${r.name} to the same hash`, () => {
      // Train-2 stories change the rules; the first one to do so replaces this
      // check with its own v2 fixture (the v1 check above stays).
      expect(replayWith((s) => new Battle(s), r)).toEqual(expected(r));
    });
  }
});
