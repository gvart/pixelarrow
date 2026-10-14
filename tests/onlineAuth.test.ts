/**
 * Signing in through the platform's Auth (ADR-0006 M6, ADR-0008 §3): Telegram
 * signs in silently with initData and holds a 24 h bearer token; the web has
 * no method yet (ACCT-05) but may already hold a session cookie, which a
 * GET /api/me probe finds. `signedIn` is "a session is live", whichever the
 * transport; `canSignIn()` is "this platform has a way to sign in".
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';
import { Online, type OnlineDeps } from '../src/platform/online';
import type { Auth } from '../src/platform/core/auth';
import type { KV } from '../src/game/save';
import { telegramAuth } from './fakes/platform';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const kv = (): KV => ({ get: async () => null, set: async () => {}, remove: async () => {} });

const telegram = (initData: string | null = 'query_id=1&hash=abc'): Auth => telegramAuth(initData);
const web = (): Auth => ({ transport: 'cookie', methods: () => [], silentProof: () => null });

type Call = { method: string; url: string; init: RequestInit };

/** A Worker stand-in: `routes` answers by "METHOD /path"; everything else 404. */
function server(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, init });
    const h = routes[`${method} ${url}`];
    return h ? h(init) : json(404, { error: { code: 'not_found', message: 'nope' } });
  };
  return { calls, fetch, hits: (key: string) => calls.filter((c) => `${c.method} ${c.url}` === key).length };
}

function make(auth: Auth, fetch: FetchLike, over: Partial<OnlineDeps> = {}) {
  let t = 0;
  return new Online({
    api: new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => auth.transport }),
    kv,
    cache: kv(),
    auth,
    now: () => t,
    sleep: async () => {},
    log: { warn: () => {}, info: () => {} },
    ...over,
  });
}

const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];
const me = (displayName = 'Swift Fox 12') => () => json(200, { player: { id: 7, displayName, telegramId: null }, session: { expiresAt: 1, transport: 'cookie' } });
const unauthorized = () => json(401, { error: { code: 'unauthorized', message: 'no session' } });

describe('Telegram (bearer)', () => {
  it('signs in silently with initData and sends the token with no cookies', async () => {
    let n = 0;
    const srv = server({
      'POST /api/auth/telegram': () => json(200, { token: `tok${++n}`, expiresAt: 0, player: { id: 1, firstName: 'Ana' } }),
      'GET /api/save': () => json(200, { revision: 0, version: 3, data: null, updatedAt: 1 }),
    });
    const o = make(telegram(), srv.fetch);
    expect(o.canSignIn()).toBe(true);
    expect(o.signedIn).toBe(false);
    expect(await o.signIn()).toBe(true);
    expect(o.signedIn).toBe(true);
    expect(o.playerName).toBe('Ana');
    await o.api.getSave();
    const get = srv.calls.find((c) => c.url === '/api/save')!;
    expect(header(get, 'authorization')).toBe('Bearer tok1');
    expect(get.init.credentials).toBe('omit');
  });

  it('a 401 on the 24 h token re-authenticates once with initData and retries', async () => {
    let n = 0;
    let saves = 0;
    const srv = server({
      'POST /api/auth/telegram': () => json(200, { token: `tok${++n}`, expiresAt: 0, player: { id: 1 } }),
      'GET /api/save': (init) => (++saves === 1 || (init.headers as Record<string, string>).authorization !== 'Bearer tok2' ? unauthorized() : json(200, { revision: 3, version: 3, data: null, updatedAt: 1 })),
    });
    const o = make(telegram(), srv.fetch);
    await o.signIn();
    expect((await o.api.getSave()).revision).toBe(3);
    expect(srv.hits('POST /api/auth/telegram')).toBe(2);
    expect(srv.hits('GET /api/save')).toBe(2);
    const body = JSON.parse(String(srv.calls.filter((c) => c.url === '/api/auth/telegram')[1].init.body));
    expect(body).toEqual({ initData: 'query_id=1&hash=abc' });
  });

  it('a second 401 after the re-auth is final (no loop)', async () => {
    const srv = server({
      'POST /api/auth/telegram': () => json(200, { token: 'tok', expiresAt: 0, player: { id: 1 } }),
      'GET /api/save': unauthorized,
    });
    const o = make(telegram(), srv.fetch);
    await o.signIn();
    await expect(o.api.getSave()).rejects.toMatchObject({ status: 401 });
    expect(srv.hits('POST /api/auth/telegram')).toBe(2);
    expect(srv.hits('GET /api/save')).toBe(2);
  });

  it('without initData (the SDK did not load) it sends nothing and has no session', async () => {
    const srv = server({});
    const o = make(telegram(null), srv.fetch);
    expect(await o.signIn()).toBe(false);
    expect(o.signedIn).toBe(false);
    expect(o.status).toBe('local');
    expect(srv.calls).toHaveLength(0);
  });
});

describe('web (cookie)', () => {
  it('has no way to sign in yet (ACCT-05) and is signed out without a cookie', async () => {
    const srv = server({ 'GET /api/me': unauthorized });
    const o = make(web(), srv.fetch);
    expect(o.canSignIn()).toBe(false);
    expect(await o.signIn()).toBe(false);
    expect(o.signedIn).toBe(false);
    expect(await o.ensureSession()).toBe('signed_out');
  });

  it('finds an existing session cookie through GET /api/me (same-origin cookies, no token)', async () => {
    const srv = server({ 'GET /api/me': me() });
    const o = make(web(), srv.fetch);
    expect(await o.signIn()).toBe(true);
    expect(o.signedIn).toBe(true);
    expect(o.playerName).toBe('Swift Fox 12');
    expect(o.playerId).toBe(7);
    const probe = srv.calls[0];
    expect(probe.init.credentials).toBe('same-origin');
    expect(header(probe, 'authorization')).toBeUndefined();
    expect(await o.ensureSession()).toBe('live');
    expect(srv.hits('GET /api/me')).toBe(1);
  });

  it('asks once: a "no session" answer is remembered until recheckSession()', async () => {
    let live = false;
    const srv = server({ 'GET /api/me': () => (live ? me('Bold Owl 3')() : unauthorized()) });
    const o = make(web(), srv.fetch);
    await o.signIn();
    await o.signIn();
    expect(srv.hits('GET /api/me')).toBe(1);
    live = true; // e.g. ACCT-05 logged in: the server set the cookie
    expect(await o.recheckSession()).toBe(true);
    expect(o.signedIn).toBe(true);
    expect(o.playerName).toBe('Bold Owl 3');
    live = false; // logged out
    expect(await o.recheckSession()).toBe(false);
    expect(o.signedIn).toBe(false);
    expect(o.playerName).toBeNull();
  });

  it('an expired cookie (401 mid-session) signs the player out without a retry loop', async () => {
    let live = true;
    const srv = server({
      'GET /api/me': () => (live ? me()() : unauthorized()),
      'GET /api/economy/wallet': unauthorized,
    });
    const o = make(web(), srv.fetch);
    await o.signIn();
    live = false;
    await expect(o.api.wallet()).rejects.toMatchObject({ status: 401 });
    expect(o.signedIn).toBe(false);
    expect(srv.hits('GET /api/economy/wallet')).toBe(1);
    expect(srv.hits('GET /api/me')).toBe(2);
  });

  it('a probe that cannot reach the server leaves the sync badge alone and retries later', async () => {
    let down = true;
    const srv = server({ 'GET /api/me': () => (down ? json(503, { error: { code: 'unavailable', message: 'x' } }) : me()()) });
    let t = 0;
    const o = make(web(), srv.fetch, { now: () => t });
    expect(await o.signIn()).toBe(false);
    expect(o.status).toBe('local');
    expect(await o.signIn()).toBe(false); // backing off
    expect(srv.hits('GET /api/me')).toBe(1);
    down = false;
    t += 60_000;
    expect(await o.signIn()).toBe(true);
  });

  it('a cookie session does not sync the save yet (the guest save upload is ACCT-07)', async () => {
    const srv = server({ 'GET /api/me': me() });
    const o = make(web(), srv.fetch);
    expect(await o.pullOnLoad(null)).toBeNull();
    expect(o.signedIn).toBe(true); // boot found the session
    expect(o.status).toBe('local');
    expect(srv.calls.filter((c) => c.url.startsWith('/api/save'))).toEqual([]);
  });

  it('a bearer token (dev auth on the web) never rides with cookies', async () => {
    const srv = server({ 'POST /api/auth/telegram': () => json(200, { token: 'devtok', expiresAt: 0, player: { id: 1 } }), 'GET /api/save': () => json(200, { revision: 0, version: 3, data: null, updatedAt: 1 }) });
    const o = make(web(), srv.fetch, { devAuth: true });
    expect(o.canSignIn()).toBe(true);
    await o.signIn();
    await o.api.getSave();
    const get = srv.calls.find((c) => c.url === '/api/save')!;
    expect(header(get, 'authorization')).toBe('Bearer devtok');
    expect(get.init.credentials).toBe('omit');
  });
});
