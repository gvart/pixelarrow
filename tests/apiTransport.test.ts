/**
 * The API transport (ADR-0006, ADR-0007, V6-034): Telegram sends a bearer token
 * and no cookies; the web relies on the same-origin session cookie, so its
 * requests and sockets go out without a token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';
import { Online } from '../src/platform/online';
import { online } from '../src/platform/cloud';
import { ShardSocket } from '../src/online/client';
import { platform, setPlatformForTests } from '../src/platform/index';
import type { KV } from '../src/game/save';
import { FakePlatform } from './fakes/platform';
import { telegramAuth } from './fakes/platform';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function recorder(body: unknown = { ok: true }) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    seen.push({ url, init: init ?? {} });
    return json(200, body);
  };
  return { seen, fetch };
}

const before = platform;
afterEach(() => {
  setPlatformForTests(before);
  vi.unstubAllGlobals();
});

describe('ApiClient follows the platform transport', () => {
  it('bearer (Telegram): sends the token and no cookies', async () => {
    const r = recorder();
    const api = new ApiClient({ base: '', fetch: r.fetch, transport: () => 'bearer' });
    api.token = 'tok';
    await api.request('GET', '/api/save', { auth: true });
    expect(r.seen[0].init.credentials).toBe('omit');
    expect((r.seen[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('bearer without a token refuses an authenticated call locally', async () => {
    const r = recorder();
    const api = new ApiClient({ base: '', fetch: r.fetch, transport: () => 'bearer' });
    await expect(api.request('GET', '/api/save', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(r.seen).toHaveLength(0);
  });

  it('cookie (web): sends same-origin cookies, and an authenticated call needs no token', async () => {
    const r = recorder();
    const api = new ApiClient({ base: '', fetch: r.fetch, transport: () => 'cookie' });
    await api.request('GET', '/api/save', { auth: true });
    expect(r.seen[0].init.credentials).toBe('same-origin');
    expect((r.seen[0].init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('defaults to the selected platform (read per request)', async () => {
    const r = recorder();
    const api = new ApiClient({ base: '', fetch: r.fetch });
    setPlatformForTests(new FakePlatform()); // the fake is a cookie platform
    await api.request('GET', '/api/health');
    expect(api.transport).toBe('cookie');
    expect(r.seen[0].init.credentials).toBe('same-origin');
  });
});

describe('sockets follow the transport', () => {
  class FakeSocket {
    static OPEN = 1;
    static made: FakeSocket[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(
      readonly url: string,
      readonly protocols: string[],
    ) {
      FakeSocket.made.push(this);
    }
    send() {}
    close() {}
  }

  function openSocket() {
    FakeSocket.made = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { origin: 'https://play.test' });
    const sock = new ShardSocket('/ws/online');
    sock.open();
    sock.close();
    return FakeSocket.made;
  }

  it('cookie with no token: opens with only the protocol name (the cookie authenticates)', () => {
    setPlatformForTests(new FakePlatform());
    const token = online.api.token;
    online.api.token = null;
    try {
      const made = openSocket();
      expect(made).toHaveLength(1);
      expect(made[0].protocols).toEqual(['pixelarrow.v1']);
    } finally {
      online.api.token = token;
    }
  });

  it('bearer: carries the token, and opens nothing without one', () => {
    const tg = new FakePlatform();
    (tg.auth as { transport: string }).transport = 'bearer';
    setPlatformForTests(tg);
    const token = online.api.token;
    try {
      online.api.token = null;
      expect(openSocket()).toHaveLength(0);
      online.api.token = 'tok';
      expect(openSocket()[0].protocols).toEqual(['pixelarrow.v1', 'tok']);
    } finally {
      online.api.token = token;
    }
  });
});

describe('the signed-in player (the v6 /api/me shape)', () => {
  const kv = (): KV => ({ get: async () => null, set: async () => {}, remove: async () => {} });

  function signIn(player: Record<string, unknown>) {
    const fetch: FetchLike = async (url) =>
      url === '/api/auth/telegram' ? json(200, { token: 'pa2_tok', expiresAt: Date.now() + 86_400_000, player }) : json(404, { error: { code: 'not_found', message: 'x' } });
    const o = new Online({ api: new ApiClient({ base: '', fetch, transport: () => 'bearer' }), kv, cache: kv(), auth: telegramAuth('query_id=1&hash=abc') });
    return o.signIn().then((ok) => ({ ok, o }));
  }

  it('a Telegram player keeps their Telegram first name', async () => {
    const { ok, o } = await signIn({ id: 1, displayName: 'Swift Fox 12', telegramId: 42, firstName: 'Ana', username: 'ana' });
    expect(ok).toBe(true);
    expect(o.playerName).toBe('Ana');
    expect(o.playerId).toBe(1);
  });

  it('a player with no Telegram identity is named by their display name', async () => {
    const { o } = await signIn({ id: 2, displayName: 'Swift Fox 12', telegramId: null, firstName: null, username: null });
    expect(o.playerName).toBe('Swift Fox 12');
  });
});
