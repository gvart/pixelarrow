/**
 * Game Worker on play.pixelarrow.app (ADR-0007, V6-HOST-02): the CORS
 * allow-list, the framing header and the Origin check for cookie requests.
 * Static HTML from dist/ gets its framing header from public/_headers
 * (tests/playHeaders.test.ts); these cover what the Worker itself answers.
 */
import { describe, expect, it } from 'vitest';
import { api } from './helpers';

const PLAY = 'https://play.pixelarrow.app';
const APEX = 'https://pixelarrow.app';
/** The dev origin set in server/vitest.config.ts (DEV_ORIGINS, as .dev.vars would). */
const DEV = 'http://localhost:6160';
const FRAMING = "frame-ancestors 'self'";
const COOKIE = '__Host-pa_sid=test-session';

function preflight(origin: string): Promise<Response> {
  return api('/api/health', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
}

describe('CORS', () => {
  it.each([PLAY, DEV])('allows %s, never with credentials', async (origin) => {
    const pre = await preflight(origin);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    const res = await api('/api/health', { headers: { origin } });
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it.each([APEX, 'https://www.pixelarrow.app', 'https://web.telegram.org', 'https://evil.example', 'null'])('refuses %s', async (origin) => {
    const pre = await preflight(origin);
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const res = await api('/api/health', { headers: { origin } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('framing', () => {
  it('lets only play frame play, with no X-Frame-Options', async () => {
    for (const path of ['/api/health', '/api/nope']) {
      const res = await api(path);
      expect(res.headers.get('content-security-policy')).toBe(FRAMING);
      expect(res.headers.get('x-frame-options')).toBeNull();
    }
  });

  it('keeps the admin page unframable', async () => {
    const res = await api('/admin');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBeNull();
  });
});

describe('Origin check for cookie requests (scaffold, finished in V6-ACCT-02)', () => {
  const postWith = (headers: Record<string, string>) => api('/api/auth/telegram', { method: 'POST', json: { dev: { id: 99001, first_name: 'Csrf' } }, headers });

  it.each([
    ['a foreign origin', { cookie: COOKIE, origin: 'https://evil.example' }],
    ['the apex', { cookie: COOKIE, origin: APEX }],
    ['no origin', { cookie: COOKIE }],
  ])('refuses a cookie POST from %s with 403', async (_, headers) => {
    const res = await postWith(headers);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'bad_origin' } });
  });

  it.each([PLAY, DEV])('lets a cookie POST from %s through', async (origin) => {
    const res = await postWith({ cookie: COOKIE, origin, 'cf-connecting-ip': '10.9.0.1' });
    expect(res.status).toBe(200);
  });

  it('exempts requests without the session cookie (bearer and anonymous)', async () => {
    expect((await postWith({ origin: 'https://evil.example', 'cf-connecting-ip': '10.9.0.2' })).status).toBe(200);
  });

  it('leaves safe methods alone', async () => {
    expect((await api('/api/health', { headers: { cookie: COOKIE, origin: 'https://evil.example' } })).status).toBe(200);
  });

  it('refuses a cookie WebSocket upgrade from a foreign origin', async () => {
    const res = await api('/ws/duel', { headers: { cookie: COOKIE, origin: 'https://evil.example', upgrade: 'websocket' } });
    expect(res.status).toBe(403);
  });
});
