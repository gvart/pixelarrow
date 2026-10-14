/**
 * V6-STATS-02: GET/HEAD /api/public/v1/summary and the PublicApi RPC
 * entrypoint (ADR-0010 §1, §3–§5; M-PS-1, M-PS-4, M-PS-6, N-PS-1, N-PS-3,
 * N-PS-4). The request path is the rate limit plus the one public_snapshot
 * SELECT; a D1 spy proves nothing else runs.
 */
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { PublicApi } from '../src/index';
import { buildPublicSnapshot } from '../src/public/snapshot';
import { api, BASE, GAME_ORIGIN } from './helpers';

const db = env.DB!;
const PATH = '/api/public/v1/summary';
const GENERATED = 1_760_352_000_000;
const BODY = JSON.stringify({ v: 1, generatedAt: GENERATED, marker: 'snapshot-body' });
const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
const ONE_SELECT = ['SELECT body, generated_at FROM public_snapshot WHERE id = 1'];

let ipN = 0;
/** A fresh client IP per request, so the RL_PUBLIC_IP counters never leak between tests. */
const freshIp = () => `198.51.100.${++ipN}.${Date.now() % 100000}`;
const get = (init: RequestInit = {}, path = PATH) => {
  const headers = new Headers(init.headers);
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', freshIp());
  return api(path, { ...init, headers });
};
/**
 * Miniflare's rate limiter counts in 60 s windows aligned to the wall clock (epoch = floor(now / 60 s)), so
 * every bucket empties at the top of each minute. A test that spends a bucket and expects the 61st call to be
 * refused starts with at least 30 s of its window left (waiting for the next window if not), so its calls can't
 * straddle a rollover however slow a loaded machine makes them (FLAKY.md F2).
 */
async function freshWindow(): Promise<void> {
  const left = 60_000 - (Date.now() % 60_000);
  if (left < 30_000) await new Promise((r) => setTimeout(r, left + 50));
}
const noCors = (res: Response) => {
  for (const [k] of res.headers) expect(k).not.toMatch(/^access-control-/);
};

async function storeSnapshot(body = BODY, generatedAt = GENERATED): Promise<void> {
  await db
    .prepare('INSERT INTO public_snapshot (id, body, generated_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET body = excluded.body, generated_at = excluded.generated_at')
    .bind(body, generatedAt)
    .run();
}

/** Wraps the D1 binding and records every SQL statement prepared through it; batch, exec and sessions fail. */
function spyDb(): { db: D1Database; sql: string[] } {
  const sql: string[] = [];
  const spy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (q: string) => (sql.push(q.trim()), target.prepare(q));
      if (prop === 'batch' || prop === 'exec' || prop === 'withSession') return () => Promise.reject(new Error(`unexpected ${String(prop)}`));
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return { db: spy, sql };
}

/** Calls the Worker's fetch handler directly, with a chosen env (a spied DB, a missing binding). */
async function callWorker(req: Request, e: typeof env): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch!(req as Request<unknown, IncomingRequestCfProperties>, e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(() => storeSnapshot());

describe('GET /api/public/v1/summary', () => {
  it('returns the stored body as is, with the public caching headers', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BODY);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(CACHE);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('etag')).toMatch(/^"[^"]+"$/);
  });

  it('ignores the query string', async () => {
    const res = await get({}, `${PATH}?bust=${Math.random()}&v=2`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BODY);
  });
});

describe('conditional and HEAD requests', () => {
  it('answers 304 with no body when If-None-Match carries the current ETag', async () => {
    const etag = (await get()).headers.get('etag')!;
    for (const inm of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const res = await get({ headers: { 'if-none-match': inm } });
      expect(res.status, inm).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('etag')).toBe(etag);
      expect(res.headers.get('cache-control')).toBe(CACHE);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('a new snapshot gets a new ETag, so the old one no longer matches', async () => {
    const old = (await get()).headers.get('etag')!;
    const next = JSON.stringify({ v: 1, generatedAt: GENERATED + 300_000 });
    await storeSnapshot(next, GENERATED + 300_000);
    const res = await get({ headers: { 'if-none-match': old } });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).not.toBe(old);
    expect(await res.text()).toBe(next);
  });

  it('HEAD has the GET headers and no body', async () => {
    const res = await get({ method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe(CACHE);
    expect(res.headers.get('etag')).toBe((await get()).headers.get('etag'));
  });
});

describe('no session, cookies or CORS (N-PS-3)', () => {
  it('sets no cookie and no CORS header, even from an allowed origin with a session cookie', async () => {
    const res = await get({ headers: { origin: GAME_ORIGIN, cookie: '__Host-pa_sid=whatever', authorization: 'Bearer junk' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('vary')).toBeNull();
    noCors(res);
  });

  it('an OPTIONS preflight is a 405 with no CORS headers', async () => {
    const res = await get({ method: 'OPTIONS', headers: { origin: GAME_ORIGIN, 'access-control-request-method': 'GET' } });
    expect(res.status).toBe(405);
    noCors(res);
  });
});

describe('errors', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('%s is 405 with Allow: GET, HEAD', async (method) => {
    const res = await get({ method, headers: { origin: GAME_ORIGIN } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['/api/public/', '/api/public/v1', '/api/public/v1/summary/', '/api/public/v2/summary', '/api/public/v1/players'])('%s does not exist (ADR-0010 §5)', async (path) => {
    const res = await get({ headers: { origin: GAME_ORIGIN } }, path);
    expect(res.status).toBe(404);
    noCors(res);
  });

  it('before the first snapshot: 503 warming with Retry-After, never cached', async () => {
    await db.prepare('DELETE FROM public_snapshot').run();
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'warming' });
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('the 61st call from one IP in a minute is 429 with Retry-After; another IP still gets through', async () => {
    await freshWindow();
    const ip = freshIp();
    for (let i = 0; i < 60; i++) expect((await get({ headers: { 'cf-connecting-ip': ip } })).status).toBe(200);
    const res = await get({ headers: { 'cf-connecting-ip': ip } });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('rate_limited');
    expect((await get()).status).toBe(200);
  });

  it('keys the limit on cf-connecting-ip only; forwarded headers change nothing (N-PS-4)', async () => {
    await freshWindow();
    const ip = freshIp();
    for (let i = 0; i < 60; i++) await get({ headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': `203.0.113.${i}`, 'x-real-ip': `203.0.113.${i}` } });
    expect((await get({ headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': '203.0.113.250', 'true-client-ip': '203.0.113.251' } })).status).toBe(429);
  });

  it('fails closed without the RL_PUBLIC_IP binding', async () => {
    const { RL_PUBLIC_IP: _unused, ...noLimit } = env;
    const res = await callWorker(new Request(`${BASE}${PATH}`), noLimit as typeof env);
    expect(res.status).toBe(503);
  });
});

describe('the request path (N-PS-1)', () => {
  it('runs only the single SELECT, even with a cookie and a bearer token', async () => {
    const spy = spyDb();
    const req = new Request(`${BASE}${PATH}`, { headers: { 'cf-connecting-ip': freshIp(), origin: GAME_ORIGIN, cookie: '__Host-pa_sid=x', authorization: 'Bearer y' } });
    const res = await callWorker(req, { ...env, DB: spy.db });
    expect(res.status).toBe(200);
    expect(spy.sql).toEqual(ONE_SELECT);
  });

  it('a 304 and a HEAD run the same single SELECT; 405, 404 and 429 run none', async () => {
    const etag = (await get()).headers.get('etag')!;
    const spy = spyDb();
    const e = { ...env, DB: spy.db };
    expect((await callWorker(new Request(`${BASE}${PATH}`, { headers: { 'cf-connecting-ip': freshIp(), 'if-none-match': etag } }), e)).status).toBe(304);
    expect((await callWorker(new Request(`${BASE}${PATH}`, { method: 'HEAD', headers: { 'cf-connecting-ip': freshIp() } }), e)).status).toBe(200);
    expect(spy.sql).toEqual([...ONE_SELECT, ...ONE_SELECT]);
    spy.sql.length = 0;
    expect((await callWorker(new Request(`${BASE}${PATH}`, { method: 'POST' }), e)).status).toBe(405);
    expect((await callWorker(new Request(`${BASE}/api/public/v1/other`), e)).status).toBe(404);
    // The 429 comes from a limiter that refuses (FLAKY.md F2): this test is about what runs on a refusal, not
    // the limiter's count, which the 'errors' tests above cover. Spending a real bucket with 60 calls raced
    // Miniflare's wall-clock-aligned 60 s window: under load the calls straddled the minute and the 61st was a
    // 200 that ran the SELECT.
    const refuse = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    expect((await callWorker(new Request(`${BASE}${PATH}`, { headers: { 'cf-connecting-ip': freshIp() } }), { ...e, RL_PUBLIC_IP: refuse })).status).toBe(429);
    expect(spy.sql).toEqual([]);
  });
});

describe('PublicApi entrypoint (ADR-0010 §4)', () => {
  const entry = (e: typeof env) => new PublicApi(createExecutionContext(), e);

  it('summary() returns the row the HTTP route serves, with the single SELECT', async () => {
    const spy = spyDb();
    expect(await entry({ ...env, DB: spy.db }).summary()).toEqual({ body: BODY, generatedAt: GENERATED });
    expect(spy.sql).toEqual(ONE_SELECT);
    expect(await (await get()).text()).toBe(BODY);
  });

  it('summary() is null before the first snapshot', async () => {
    await db.prepare('DELETE FROM public_snapshot').run();
    expect(await entry(env).summary()).toBeNull();
  });

  it('serves the snapshot the cron builds, unchanged, over both paths', async () => {
    const snap = await buildPublicSnapshot(env, GENERATED + 600_000);
    const fromRpc = await entry(env).summary();
    expect(fromRpc?.generatedAt).toBe(GENERATED + 600_000);
    expect(JSON.parse(fromRpc!.body)).toEqual(snap);
    expect(await (await get()).text()).toBe(fromRpc!.body);
  });
});
