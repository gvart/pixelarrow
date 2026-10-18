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
import type { Battle } from '../src/sim/battle';
import type { BattleSetup } from '../src/sim/types';

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

  it('other errors show their own localized words (G12: never the server text)', () => {
    expect(errorText(new ApiError(409, 'ticket_used', 'This battle was already reported'))).toBe(t('gap.err.ticket_used'));
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
