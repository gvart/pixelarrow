/**
 * The web's email forms against the Worker (V6-ACCT-05; server/src/routes/auth.ts): each posts
 * same-origin with the session cookie and never a bearer token, and the server's error codes
 * reach the forms as ApiError codes.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init = {}) => (calls.push({ url, init }), answer(url, init));
  return { api: new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => 'cookie' }), calls };
}

describe('the email forms API', () => {
  it('posts sign-up, log-in, reset and resend with the Turnstile token, same-origin and with no bearer', async () => {
    const { api, calls } = client((url) => (url === '/api/auth/login' ? json(200, { player: { id: 3, displayName: 'Swift Fox 1' }, expiresAt: 9 }) : json(202, { status: 'check_email' })));
    expect(await api.signup('a@b.co', 'long enough pw', 'tok1')).toEqual({ status: 'check_email' });
    expect((await api.login('a@b.co', 'long enough pw', 'tok2')).player.id).toBe(3);
    await api.resetRequest('a@b.co', 'tok3');
    await api.resendVerify('a@b.co', 'tok4');
    expect(calls.map((c) => [c.init.method, c.url, JSON.parse(String(c.init.body))])).toEqual([
      ['POST', '/api/auth/signup', { email: 'a@b.co', password: 'long enough pw', turnstile: 'tok1' }],
      ['POST', '/api/auth/login', { email: 'a@b.co', password: 'long enough pw', turnstile: 'tok2' }],
      ['POST', '/api/auth/reset/request', { email: 'a@b.co', turnstile: 'tok3' }],
      ['POST', '/api/auth/verify/resend', { email: 'a@b.co', turnstile: 'tok4' }],
    ]);
    for (const c of calls) {
      expect(c.init.credentials).toBe('same-origin');
      expect((c.init.headers as Record<string, string>).authorization).toBeUndefined();
    }
  });

  it('log-out ends the cookie session, and a 401 there is final (no re-auth)', async () => {
    let reauths = 0;
    const { api, calls } = client(() => json(401, { error: { code: 'unauthorized', message: 'x' } }));
    api.reauth = async () => (reauths++, null);
    await expect(api.logout()).rejects.toMatchObject({ status: 401 });
    expect(calls[0].url).toBe('/api/auth/logout');
    expect(reauths).toBe(0);
  });

  it('the server codes come through: 401 invalid_credentials, 400 common, 429, 403 bad_origin', async () => {
    for (const [status, code] of [[401, 'invalid_credentials'], [400, 'common'], [429, 'rate_limited'], [403, 'bad_origin']] as const) {
      const { api } = client(() => json(status, { error: { code, message: 'x' } }));
      await expect(api.login('a@b.co', 'pw', 't')).rejects.toMatchObject({ status, code });
    }
  });
});
