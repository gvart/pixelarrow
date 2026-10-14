/**
 * Account management (V6-LINK-05, design/ux/accounts-v6.md §1.4, §8.2–§8.4, §8.8): the API calls of
 * the sign-in method actions, the re-auth step (AU-10) and its one retry, the sign-in method rows,
 * the server codes as clear messages, and the pending add-email hint.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from '../src/platform/api';
import type { KV } from '../src/game/save';
import { LoginGuard } from '../src/ui/account/flows';
import { forgetAddPending, manageError, maskEmail, methodRows, passwordFailed, proveSilently, readAddPending, ReauthCancelled, reauthStep, rememberAddPending, withReauth } from '../src/ui/account/methods';

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

// ---------------------------------------------------------------- the rules (src/ui/account/methods.ts)

const err = (status: number, code: string) => new ApiError(status, code, code);

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
}

const TG = { kind: 'telegram' as const, telegramUsername: 'nikias_k' };
const MAIL = { kind: 'password' as const, emailMasked: 'j***@g***.com' };

describe('sign-in method rows (§8.2)', () => {
  it('both linked: Telegram offers Remove, email the ⋯ menu, and neither is the last one', () => {
    expect(methodRows({ identities: [TG, MAIL] }, null)).toEqual([
      { kind: 'telegram', state: 'linked', sub: { text: '@nikias_k' }, action: 'remove', last: false },
      { kind: 'password', state: 'linked', sub: { text: 'j***@g***.com' }, action: 'menu', last: false },
    ]);
  });

  it('Telegram only: Remove is off as the last method; email reads Not added with Add', () => {
    expect(methodRows({ identities: [{ kind: 'telegram', telegramUsername: null }] }, null)).toEqual([
      { kind: 'telegram', state: 'linked', sub: { key: 'account.linked' }, action: 'remove', last: true },
      { kind: 'password', state: 'notLinked', sub: { key: 'account.emailNone' }, action: 'add', last: false },
    ]);
  });

  it('email only: Telegram reads Not linked with Link; the email is the last method', () => {
    expect(methodRows({ identities: [MAIL] }, null)).toEqual([
      { kind: 'telegram', state: 'notLinked', sub: { key: 'account.notLinked' }, action: 'link', last: false },
      { kind: 'password', state: 'linked', sub: { text: 'j***@g***.com' }, action: 'menu', last: true },
    ]);
  });

  it('an add-email link waiting on this device: Waiting with its masked address; a linked email wins over the hint', () => {
    expect(methodRows({ identities: [TG] }, 'a***@b***.co')[1]).toEqual({ kind: 'password', state: 'pending', sub: { key: 'account.emailPending', params: { email: 'a***@b***.co' } }, action: 'pendingMenu', last: false });
    expect(methodRows({ identities: [TG, MAIL] }, 'a***@b***.co')[1].state).toBe('linked');
  });
});

describe('re-auth: call, and on 401 reauth_required confirm it is you, then retry once (§1.4)', () => {
  it('a call that needs no proof runs once and never asks', async () => {
    let asked = 0;
    expect(await withReauth(async () => 7, async () => (asked++, true))).toBe(7);
    expect(asked).toBe(0);
  });

  it('reauth_required asks once and retries once', async () => {
    let calls = 0;
    let asked = 0;
    const call = async () => {
      if (++calls === 1) throw err(401, 'reauth_required');
      return 'done';
    };
    expect(await withReauth(call, async () => (asked++, true))).toBe('done');
    expect([calls, asked]).toEqual([2, 1]);
  });

  it('a cancelled confirm stops the action (ReauthCancelled) without a retry', async () => {
    let calls = 0;
    const r = await withReauth(async () => (calls++, Promise.reject(err(401, 'reauth_required'))), async () => false).catch((e) => e);
    expect(r).toBeInstanceOf(ReauthCancelled);
    expect(calls).toBe(1);
  });

  it('a second reauth_required is not looped: it reaches the caller', async () => {
    let asked = 0;
    const r = await withReauth(async () => Promise.reject(err(401, 'reauth_required')), async () => (asked++, true)).catch((e) => e);
    expect([r.code, asked]).toEqual(['reauth_required', 1]);
  });

  it('other errors pass through without asking', async () => {
    let asked = 0;
    const r = await withReauth(async () => Promise.reject(err(409, 'last_login_method')), async () => (asked++, true)).catch((e) => e);
    expect([r.code, asked]).toEqual(['last_login_method', 0]);
  });
});

describe("Confirm it's you: Telegram's initData first, silently; then the form that fits (§1.4, §8.6)", () => {
  const api = (reply: unknown) => {
    const sent: unknown[] = [];
    return {
      sent,
      api: {
        reauthWith: async (p: { password: string } | { initData: string }) => {
          sent.push(p);
          if (reply instanceof Error) throw reply;
          return { reauthUntil: 1 };
        },
      },
    };
  };

  it('fresh initData proves it with nothing on screen', async () => {
    const a = api(null);
    expect(await proveSilently(a.api, 'query_id=1')).toEqual({ ok: true });
    expect(a.sent).toEqual([{ initData: 'query_id=1' }]);
    expect(reauthStep({ ok: true }, { hasPassword: false, canReopen: true })).toBe('done');
  });

  it('no initData (the web): the password form, without a request', async () => {
    const a = api(null);
    const r = await proveSilently(a.api, null);
    expect(r).toEqual({ ok: false, why: 'none' });
    expect(a.sent).toEqual([]);
    expect(reauthStep(r, { hasPassword: true, canReopen: false })).toBe('password');
  });

  it('initData older than 10 minutes: Reopen, plus the password where the account has one', async () => {
    const r = await proveSilently(api(err(401, 'init_data_expired')).api, 'query_id=1');
    expect(r).toMatchObject({ ok: false, why: 'expired' });
    expect(reauthStep(r, { hasPassword: false, canReopen: true })).toBe('reopen');
    expect(reauthStep(r, { hasPassword: true, canReopen: true })).toBe('passwordReopen');
    expect(reauthStep(r, { hasPassword: true, canReopen: false })).toBe('password');
  });

  it('refused initData with no password to fall back on is an error the player can read', async () => {
    const r = await proveSilently(api(err(403, 'wrong_account')).api, 'query_id=1');
    expect(r).toMatchObject({ ok: false, why: 'error' });
    expect(reauthStep(r, { hasPassword: false, canReopen: true })).toBe('error');
    expect(reauthStep(r, { hasPassword: true, canReopen: true })).toBe('password');
  });
});

describe('server codes as clear messages (V6-049, V6-079)', () => {
  it('the re-auth form', () => {
    expect(manageError(err(401, 'invalid_credentials'), 'reauth')).toEqual({ field: 'password', key: 'reauth.err.password', clear: true });
    expect(manageError(err(401, 'init_data_expired'), 'reauth')).toEqual({ key: 'reauth.reopen' });
    expect(manageError(err(401, 'invalid_init_data'), 'reauth')).toEqual({ key: 'reauth.err.telegram' });
    expect(manageError(err(403, 'wrong_account'), 'reauth')).toEqual({ key: 'reauth.err.wrongAccount' });
    expect(manageError(err(400, 'no_password'), 'reauth')).toEqual({ key: 'account.err.noPassword', reload: true });
    expect(manageError(err(429, 'rate_limited'), 'reauth')).toEqual({ key: 'reauth.err.rate' });
  });

  it('add and change email', () => {
    expect(manageError(err(400, 'invalid_email'), 'addEmail')).toEqual({ field: 'email', key: 'auth.err.email' });
    expect(manageError(err(400, 'bad_request'), 'changeEmail')).toEqual({ field: 'email', key: 'auth.err.email' });
    expect(manageError(err(400, 'common'), 'addEmail')).toEqual({ field: 'password', key: 'auth.err.pwCommon' });
    expect(manageError(err(400, 'matches_email'), 'addEmail')).toEqual({ field: 'password', key: 'auth.err.pwEmail' });
    expect(manageError(err(400, 'same_email'), 'changeEmail')).toEqual({ field: 'email', key: 'account.err.sameEmail' });
    expect(manageError(err(400, 'no_password'), 'changeEmail')).toEqual({ key: 'account.err.noPassword', reload: true });
    expect(manageError(err(409, 'already_has_email'), 'addEmail')).toEqual({ key: 'account.err.hasEmail', reload: true });
    expect(manageError(err(409, 'email_taken'), 'changeEmail')).toEqual({ field: 'email', key: 'account.err.emailTaken' });
    expect(manageError(err(429, 'rate_limited'), 'addEmail')).toEqual({ key: 'account.err.addLimit' });
    expect(manageError(err(429, 'rate_limited'), 'changeEmail')).toEqual({ key: 'account.err.addLimit' });
  });

  it('change password and remove a method', () => {
    expect(manageError(err(401, 'invalid_credentials'), 'changePassword')).toEqual({ field: 'current', key: 'account.err.current', clear: true });
    expect(manageError(err(400, 'too_short'), 'changePassword')).toEqual({ field: 'next', key: 'auth.err.pwShort' });
    expect(manageError(err(409, 'last_login_method'), 'remove')).toEqual({ key: 'account.remove.last', reload: true });
    expect(manageError(err(404, 'not_found'), 'remove')).toEqual({ key: 'account.removed', reload: true });
  });

  it('every action: a second reauth_required, a lost session, banned, offline, the email service down, anything else', () => {
    for (const op of ['reauth', 'addEmail', 'changeEmail', 'changePassword', 'remove'] as const) {
      expect(manageError(err(401, 'reauth_required'), op)).toEqual({ key: 'reauth.err.again' });
      expect(manageError(err(401, 'unauthorized'), op)).toEqual({ key: 'auth.expired', reload: true });
      expect(manageError(err(403, 'banned'), op)).toEqual({ key: 'auth.banned.body', reload: true });
      expect(manageError(err(0, 'network'), op)).toEqual({ key: 'auth.err.offline' });
      expect(manageError(err(503, 'email_unavailable'), op)).toEqual({ key: 'auth.err.unavailable' });
      expect(manageError(err(500, 'internal'), op)).toEqual({ key: 'auth.err.unavailable' });
      expect(manageError(new Error('boom'), op)).toEqual({ key: 'auth.err.unavailable' });
    }
  });

  it('a wrong password counts toward the lockout: from the 5th in a row the generic too-many message', () => {
    const g = new LoginGuard();
    const e401 = err(401, 'invalid_credentials');
    for (let i = 0; i < 4; i++) expect(passwordFailed(manageError(e401, 'reauth'), g, 1000).key).toBe('reauth.err.password');
    expect(passwordFailed(manageError(e401, 'reauth'), g, 1000)).toEqual({ field: 'password', key: 'auth.err.tooMany', clear: true });
    expect(passwordFailed(manageError(err(0, 'network'), 'reauth'), new LoginGuard(), 1000)).toEqual({ key: 'auth.err.offline' });
  });
});

describe('the add-email link waiting on this device (a hint, masked)', () => {
  it('masks like the server (server/src/account/summary.ts maskEmail)', () => {
    expect(maskEmail('jane.doe@gmail.com')).toBe('j***@g***.com');
    expect(maskEmail('a@localhost')).toBe('a***@l***');
  });

  it('keeps only the masked address, for 24 hours, until forgotten', async () => {
    const kv = memKV();
    await rememberAddPending(kv, 'jane.doe@gmail.com', 1000);
    expect([...kv.m.values()].join()).not.toContain('jane.doe');
    expect(await readAddPending(kv, 1000 + 3_600_000)).toBe('j***@g***.com');
    expect(await readAddPending(kv, 1000 + 24 * 3_600_000)).toBeNull();
    await forgetAddPending(kv);
    expect(await readAddPending(kv, 2000)).toBeNull();
  });
});
