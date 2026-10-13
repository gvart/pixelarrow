import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';

const ASSET_BODY = '<!doctype html><title>landing</title>';

function stubEnv(): Env {
  return {
    ASSETS: { fetch: async () => new Response(ASSET_BODY, { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher,
    GAME: { summary: async () => null } as unknown as Env['GAME'],
    RL_LANDING_PUBLIC: { limit: async () => ({ success: true }) } as unknown as RateLimit,
  };
}

async function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('landing Worker: home page', () => {
  it('sends old ?startapp= links to play with the query kept', async () => {
    const res = await call('https://pixelarrow.app/?startapp=clan_x&utm=a', stubEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://play.pixelarrow.app/?startapp=clan_x&utm=a');
  });

  it('sends ?tgWebAppStartParam= launches to play with the query kept', async () => {
    const res = await call('https://pixelarrow.app/?tgWebAppStartParam=duel_7', stubEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://play.pixelarrow.app/?tgWebAppStartParam=duel_7');
  });

  it('serves the landing page otherwise, never framable', async () => {
    const res = await call('https://pixelarrow.app/?utm_source=x', stubEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ASSET_BODY);
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });
});

const SNAPSHOT = { v: 1, generatedAt: 1760352000000, totals: { players: 12 } };

/** A GAME stub that counts calls; `next` decides what the PublicApi entrypoint answers. */
function game(next: () => Promise<{ body: string; generatedAt: number } | null>) {
  const stub = { calls: 0, summary: async () => { stub.calls++; return next(); } };
  return stub;
}
const ok = async () => ({ body: JSON.stringify(SNAPSHOT), generatedAt: SNAPSHOT.generatedAt });

// The Cache API is shared by every test in the file, so each test uses its own host.
let hostN = 0;
const summaryUrl = () => `https://t${++hostN}.landing.test/api/public/v1/summary`;

describe('landing Worker: /api/public/v1/summary proxy', () => {
  it('answers a miss from the GAME PublicApi entrypoint, then serves the cached copy', async () => {
    const g = game(ok);
    const env = { ...stubEnv(), GAME: g as unknown as Env['GAME'] };
    const url = summaryUrl();

    const miss = await call(url, env);
    expect(miss.status).toBe(200);
    expect(miss.headers.get('content-type')).toContain('application/json');
    expect(miss.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(await miss.json()).toEqual(SNAPSHOT);

    const hit = await call(url + '?bust=1', env);
    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual(SNAPSHOT);
    expect(g.calls).toBe(1);
  });

  it('serves the last good copy with X-Stale: 1 when the game fails after the edge copy expired', async () => {
    let up = true;
    const g = game(async () => { if (up) return ok(); throw new Error('game Worker down'); });
    const env = { ...stubEnv(), GAME: g as unknown as Env['GAME'] };
    const url = summaryUrl();
    await call(url, env);
    // The 5-minute edge copy expires (its key is the URL without the query, ADR-0010 §3).
    await caches.default.delete(new Request(url));
    up = false;

    const res = await call(url, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-stale')).toBe('1');
    expect(await res.json()).toEqual(SNAPSHOT);
    expect(g.calls).toBe(2);
  });

  it('answers 503 when the game fails and there is no copy', async () => {
    const env = { ...stubEnv(), GAME: game(async () => { throw new Error('down'); }) as unknown as Env['GAME'] };
    const res = await call(summaryUrl(), env);
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ state: 'unavailable' });
  });

  it('answers 429 on a cache miss over the per-IP limit, and never asks the limiter on a hit', async () => {
    const keys: string[] = [];
    let allowed = true;
    const g = game(ok);
    const env = {
      ...stubEnv(),
      GAME: g as unknown as Env['GAME'],
      RL_LANDING_PUBLIC: { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: allowed }; } } as unknown as RateLimit,
    };
    const headers = { 'cf-connecting-ip': '203.0.113.9' };

    allowed = false;
    const limited = await call(summaryUrl(), env, { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(g.calls).toBe(0);
    expect(keys).toEqual(['203.0.113.9']);

    allowed = true;
    const url = summaryUrl();
    await call(url, env, { headers });
    allowed = false;
    const hit = await call(url, env, { headers });
    expect(hit.status).toBe(200);
    expect(keys).toHaveLength(2);
  });

  it('answers 405 to anything but GET', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const res = await call(summaryUrl(), stubEnv(), { method });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
    }
  });

  it('answers 404 for any other /api/public/ path', async () => {
    const res = await call('https://pixelarrow.app/api/public/v1/players', stubEnv());
    expect(res.status).toBe(404);
  });

  it('never caches a snapshot that is not a v1 body', async () => {
    const g = game(async () => ({ body: '{"v":2}', generatedAt: 1 }));
    const env = { ...stubEnv(), GAME: g as unknown as Env['GAME'] };
    const url = summaryUrl();
    expect((await call(url, env)).status).toBe(503);
    expect((await call(url, env)).status).toBe(503);
    expect(g.calls).toBe(2);
  });

  it('gives up on the game after 3 s', async () => {
    const env = { ...stubEnv(), GAME: game(() => new Promise(() => {})) as unknown as Env['GAME'] };
    const started = Date.now();
    const res = await call(summaryUrl(), env);
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(4500);
  }, 10_000);
});
