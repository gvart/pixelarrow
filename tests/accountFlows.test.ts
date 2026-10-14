/**
 * The sign-in forms' rules (V6-ACCT-05, design/ux/accounts-v6.md §5–§7): client checks that mirror the
 * server's, the server codes mapped to field or banner messages that never reveal whether an account
 * exists, the client's own failed-log-in count (UXA-09), the resend wait and cap, the pending email.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/platform/api';
import { formError, LoginGuard, newPasswordProblem, PENDING_KEY, readPending, rememberPending, forgetPending, ResendGate, runForgot, runLogin, runResend, runSignup, validEmail, type FlowDeps } from '../src/ui/account/flows';
import type { KV } from '../src/game/save';

const err = (status: number, code: string) => new ApiError(status, code, code);

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), remove: async (k) => void m.delete(k) };
}

/** A Worker stand-in for the forms: each endpoint answers from `replies` (a value or an error). */
function deps(replies: Partial<Record<'signup' | 'login' | 'resetRequest' | 'resendVerify', unknown>> = {}, token: () => Promise<string> = async () => 'tok') {
  const calls: [string, unknown[]][] = [];
  const answer = (name: keyof typeof replies) => async (...args: unknown[]) => {
    calls.push([name, args]);
    const r = replies[name];
    if (r instanceof Error) throw r;
    return r ?? { status: 'check_email' };
  };
  const d: FlowDeps = {
    api: { signup: answer('signup'), login: answer('login'), resetRequest: answer('resetRequest'), resendVerify: answer('resendVerify') } as FlowDeps['api'],
    token,
  };
  return { d, calls };
}

describe('client checks (mirror server/src/auth/flows.ts and password.ts)', () => {
  it('an email needs one @, a local part and a dotted domain, no spaces, at most 254 characters', () => {
    for (const ok of ['a@b.co', ' Ana.Lee+x@mail.example.org ']) expect(validEmail(ok)).toBe(true);
    for (const bad of ['', 'ana', 'a@b', '@b.co', 'a@@b.co', 'a b@c.de', 'a@b..c', `${'x'.repeat(250)}@b.co`]) expect(validEmail(bad)).toBe(false);
  });

  it('a new password is 10 to 128 characters (code points) and not the email', () => {
    expect(newPasswordProblem('short', 'a@b.co')).toBe('auth.err.pwShort');
    expect(newPasswordProblem('🏹'.repeat(10), 'a@b.co')).toBeNull();
    expect(newPasswordProblem('x'.repeat(129), 'a@b.co')).toBe('auth.err.pwLong');
    expect(newPasswordProblem('Ana@Mail.example', 'ana@mail.example')).toBe('auth.err.pwEmail');
    expect(newPasswordProblem('a long passphrase', 'a@b.co')).toBeNull();
  });
});

describe('server codes to messages (V6-042, accounts-v6.md §1.3, §5.2, §6.2)', () => {
  it('maps each code to its field or the banner', () => {
    expect(formError(err(401, 'invalid_credentials'))).toEqual({ key: 'auth.err.creds' });
    expect(formError(err(400, 'invalid_email'))).toEqual({ field: 'email', key: 'auth.err.email' });
    expect(formError(err(400, 'bad_request'))).toEqual({ field: 'email', key: 'auth.err.email' });
    expect(formError(err(400, 'too_short'))).toEqual({ field: 'password', key: 'auth.err.pwShort' });
    expect(formError(err(400, 'too_long'))).toEqual({ field: 'password', key: 'auth.err.pwLong' });
    expect(formError(err(400, 'common'))).toEqual({ field: 'password', key: 'auth.err.pwCommon' });
    expect(formError(err(400, 'matches_email'))).toEqual({ field: 'password', key: 'auth.err.pwEmail' });
    expect(formError(err(400, 'turnstile_failed'))).toEqual({ key: 'auth.err.turnstile', resetCheck: true });
    expect(formError(err(429, 'rate_limited'))).toEqual({ key: 'auth.err.rate', params: { min: 1 } });
    expect(formError(err(403, 'banned'))).toEqual({ key: 'auth.banned.body' });
    for (const [s, c] of [[503, 'email_unavailable'], [503, 'turnstile_unavailable'], [403, 'bad_origin'], [500, 'internal'], [404, 'not_found']] as const) expect(formError(err(s, c))).toEqual({ key: 'auth.err.unavailable' });
    expect(formError(err(0, 'network'))).toEqual({ key: 'auth.err.offline' });
    expect(formError(err(0, 'timeout'))).toEqual({ key: 'auth.err.offline' });
    expect(formError(new Error('load_failed'))).toEqual({ key: 'auth.err.turnstileLoad', retryCheck: true });
    expect(formError(new Error('failed'))).toEqual({ key: 'auth.err.turnstile', resetCheck: true });
    expect(formError(new Error('timeout'))).toEqual({ key: 'auth.err.turnstile', resetCheck: true });
  });
});

describe('log in', () => {
  it('checks the fields before asking for a token or the server', async () => {
    const { d, calls } = deps();
    let tokens = 0;
    d.token = async () => (tokens++, 'tok');
    expect(await runLogin(d, ' nope ', '', new LoginGuard())).toEqual({ ok: false, error: { field: 'email', key: 'auth.err.email' } });
    expect(tokens + calls.length).toBe(0);
  });

  it('a wrong password and an unknown email take the same path; the 5th failure in a row says "too many attempts"', async () => {
    const guard = new LoginGuard();
    let now = 0;
    const { d } = deps({ login: err(401, 'invalid_credentials') });
    d.now = () => now;
    for (let i = 1; i <= 4; i++) expect(await runLogin(d, 'a@b.co', 'whatever123', guard)).toEqual({ ok: false, error: { key: 'auth.err.creds', clearPassword: true } });
    expect(await runLogin(d, 'nobody@b.co', 'whatever123', guard)).toEqual({ ok: false, error: { key: 'auth.err.tooMany', clearPassword: true, offerReset: true } });
    expect(guard.tooMany(now)).toBe(true);
    // 15 minutes after the last failure the count starts again
    now += 15 * 60_000;
    expect(guard.tooMany(now)).toBe(false);
  });

  it('a success resets the count and sends the trimmed email', async () => {
    const guard = new LoginGuard();
    guard.fail(0);
    guard.fail(0);
    const { d, calls } = deps({ login: { player: { id: 1 }, expiresAt: 1 } });
    expect(await runLogin(d, ' a@b.co ', 'pw-as-typed ', guard)).toEqual({ ok: true });
    expect(calls[0]).toEqual(['login', ['a@b.co', 'pw-as-typed ', 'tok']]);
    expect(guard.count).toBe(0);
  });

  it('a human check that fails or does not load never reaches the server', async () => {
    const { d, calls } = deps({}, async () => Promise.reject(new Error('load_failed')));
    expect(await runLogin(d, 'a@b.co', 'x', new LoginGuard())).toEqual({ ok: false, error: { key: 'auth.err.turnstileLoad', retryCheck: true } });
    expect(calls).toEqual([]);
  });
});

describe('create account, forgot password, resend', () => {
  it('sign-up: the client catches policy errors first; a taken and a new address give the same 202', async () => {
    const { d, calls } = deps();
    expect(await runSignup(d, 'a@b.co', 'short')).toEqual({ ok: false, error: { field: 'password', key: 'auth.err.pwShort' } });
    expect(calls).toEqual([]);
    expect(await runSignup(d, 'taken@b.co', 'a long passphrase')).toEqual({ ok: true, email: 'taken@b.co' });
    expect(await runSignup(d, 'new@b.co', 'a long passphrase')).toEqual({ ok: true, email: 'new@b.co' });
    const common = deps({ signup: err(400, 'common') });
    expect(await runSignup(common.d, 'a@b.co', 'password1234')).toEqual({ ok: false, error: { field: 'password', key: 'auth.err.pwCommon' } });
  });

  it('forgot password and resend: one email field, always the same answer', async () => {
    const { d, calls } = deps();
    expect(await runForgot(d, 'x')).toEqual({ ok: false, error: { field: 'email', key: 'auth.err.email' } });
    expect(await runForgot(d, 'known@b.co')).toEqual({ ok: true, email: 'known@b.co' });
    expect(await runResend(d, 'a@b.co')).toEqual({ ok: true, email: 'a@b.co' });
    expect(calls.map((c) => c[0])).toEqual(['resetRequest', 'resendVerify']);
  });
});

describe('resend wait and cap (accounts-v6.md §5.3)', () => {
  it('off for 60 s after each send, and after the third resend in an hour', () => {
    const g = new ResendGate();
    g.sent(0); // the sign-up's own email
    expect(g.state(1_000)).toEqual({ kind: 'wait', ms: 59_000 });
    expect(g.state(60_000)).toEqual({ kind: 'ok' });
    g.sent(60_000);
    g.sent(120_000);
    g.sent(180_000);
    expect(g.state(240_000)).toEqual({ kind: 'capped' });
    // an hour after the first resend, one slot is free again
    expect(g.state(60_000 + 3_600_000)).toEqual({ kind: 'ok' });
  });
});

describe('the pending email on this device (accounts-v6.md §5.5)', () => {
  it('is remembered after a sign-up, forgotten after 24 h or when cleared', async () => {
    const kv = memKV();
    await rememberPending(kv, 'a@b.co', 0);
    expect(JSON.parse(kv.m.get(PENDING_KEY)!)).toEqual({ email: 'a@b.co', purpose: 'signup', at: 0 });
    expect(await readPending(kv, 1000)).toEqual({ email: 'a@b.co', purpose: 'signup', at: 0 });
    expect(await readPending(kv, 24 * 3_600_000 + 1)).toBeNull();
    await rememberPending(kv, 'b@c.de', 5);
    await forgetPending(kv);
    expect(await readPending(kv, 6)).toBeNull();
    kv.m.set(PENDING_KEY, '{oops');
    expect(await readPending(kv, 6)).toBeNull();
  });
});
