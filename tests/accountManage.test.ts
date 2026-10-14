/**
 * Account management (V6-LINK-05, design/ux/accounts-v6.md §1.4, §8.2–§8.4, §8.8): the API calls of
 * the sign-in method actions, the re-auth step (AU-10) and its one retry, the sign-in method rows,
 * the server codes as clear messages, and the pending add-email hint.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(answer: (url: string, init: RequestInit) => Response, transport: 'cookie' | 'bearer' = 'cookie') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init = {}) => (calls.push({ url, init }), answer(url, init));
  const api = new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => transport });
  if (transport === 'bearer') api.token = 'tok';
  return { api, calls };
}

describe('the account management API (server/src/account/routes.ts, V6-049)', () => {
  it('posts re-auth, add email, change email, remove a method and change password to their routes', async () => {
    const { api, calls } = client((url, init) =>
      url === '/api/account/reauth'
        ? json(200, { reauthUntil: 9 })
        : init.method === 'DELETE'
          ? json(200, { ok: true, signedOut: false })
          : url === '/api/auth/password'
            ? json(200, { ok: true })
            : json(202, { status: 'check_email' }),
    );
    expect(await api.reauthWith({ password: 'pw pw pw pw' })).toEqual({ reauthUntil: 9 });
    await api.reauthWith({ initData: 'query_id=1' });
    await api.addEmail('a@b.co', 'long enough pw');
    await api.changeEmail('c@d.co');
    expect(await api.removeMethod('telegram')).toEqual({ ok: true, signedOut: false });
    await api.changePassword('old password', 'new password!');
    expect(calls.map((c) => [c.init.method, c.url, c.init.body ? JSON.parse(String(c.init.body)) : null])).toEqual([
      ['POST', '/api/account/reauth', { password: 'pw pw pw pw' }],
      ['POST', '/api/account/reauth', { initData: 'query_id=1' }],
      ['POST', '/api/account/email', { email: 'a@b.co', password: 'long enough pw' }],
      ['POST', '/api/account/email/change', { email: 'c@d.co' }],
      ['DELETE', '/api/account/identities/telegram', null],
      ['POST', '/api/auth/password', { current: 'old password', next: 'new password!' }],
    ]);
  });

  it("a 401 that isn't a lost session (reauth_required, a wrong password, stale initData) never signs in again", async () => {
    for (const code of ['reauth_required', 'invalid_credentials', 'init_data_expired', 'invalid_init_data']) {
      let resigns = 0;
      const { api, calls } = client(() => json(401, { error: { code, message: 'x' } }), 'bearer');
      api.reauth = async () => (resigns++, 'fresh');
      await expect(api.addEmail('a@b.co', 'long enough pw')).rejects.toMatchObject({ status: 401, code });
      expect([resigns, calls.length]).toEqual([0, 1]);
    }
  });

  it('a lost session (401 unauthorized) still signs in again and retries once', async () => {
    let resigns = 0;
    const { api, calls } = client(
      (_u, init) => ((init.headers as Record<string, string>).authorization === 'Bearer fresh' ? json(202, { status: 'check_email' }) : json(401, { error: { code: 'unauthorized', message: 'x' } })),
      'bearer',
    );
    api.reauth = async () => (resigns++, 'fresh');
    await expect(api.changeEmail('c@d.co')).resolves.toEqual({ status: 'check_email' });
    expect([resigns, calls.length]).toEqual([1, 2]);
  });
});
