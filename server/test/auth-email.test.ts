/**
 * V6-ACCT-03: email and password flows end to end through the Worker
 * (ADR-0008 §2, §4, §5): sign-up, verify, resend, log-in, reset and password
 * change; uniform responses; lockout; mail caps; single-use tokens; session
 * revocation; rehash on log-in; and a log spy. Mail goes to dev_outbox
 * (DEV_EMAIL=1 in vitest.config.ts).
 */
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, GAME_ORIGIN } from './helpers';
import { hashToken } from '../src/auth/sessions';
import { hashPassword, peppersFromEnv, PBKDF2_ITERATIONS } from '../src/auth/password';

const DB = () => env.DB!;
const PW = 'battle-standard-42';
let n = 0;
const fresh = (p: string) => `${p}.${++n}.${Date.now()}@Example.com`;
const norm = (e: string) => e.toLowerCase();

afterEach(async () => {
  // The identity–mirror invariant holds after every identity write (ADR-0008 §1).
  const bad = await DB()
    .prepare(
      `SELECT p.id FROM players p LEFT JOIN auth_identities i ON i.player_id = p.id AND i.kind = 'telegram'
       WHERE (p.telegram_id IS NULL) != (i.id IS NULL) OR CAST(p.telegram_id AS TEXT) != i.subject`,
    )
    .all();
  expect(bad.results).toEqual([]);
});

interface Mail {
  to_addr: string;
  subject: string;
  text: string;
  html: string;
}
/** Mail sent to `to` (emails go out after the response, so this waits for `count` of them). */
async function mailTo(to: string, count = 1, timeoutMs = 3_000): Promise<Mail[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await DB().prepare('SELECT to_addr, subject, text, html FROM dev_outbox WHERE to_addr = ?1 ORDER BY id').bind(to).all<Mail>()).results;
    if (rows.length >= count || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
}
/** Gives deferred sends time to land, then the full outbox for `to`. */
async function settledMail(to: string): Promise<Mail[]> {
  await new Promise((r) => setTimeout(r, 150));
  return mailTo(to, 0, 0);
}
const linkToken = (m: Mail) => /#t=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1] ?? null;

/** The forms that carry a Turnstile token (ADR-0008 §6). */
const HUMAN_CHECKED = new Set(['/api/auth/signup', '/api/auth/login', '/api/auth/reset/request', '/api/auth/verify/resend']);
let ipN = 0;
/**
 * The web game posts these forms from its own origin, with a passing Turnstile
 * token unless the body names one. Each call comes from a fresh client IP, so
 * the per-IP limit (auth-gates.test.ts) stays out of the way of these flows.
 */
const post = (path: string, json: unknown, init: { cookie?: string; headers?: Record<string, string> } = {}) => {
  const body = HUMAN_CHECKED.has(path) && json !== null && typeof json === 'object' && !('turnstile' in json) ? { ...json, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' } : json;
  return api(path, { method: 'POST', json: body, ...init, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': `198.18.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...init.headers } });
};
const sidOf = (res: Response) => /__Host-pa_sid=(pa2_[A-Za-z0-9_-]{43})/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;

/** A verified account with password PW; returns its address and the cookie token from the verification. */
async function account(prefix = 'acct', pw = PW): Promise<{ email: string; cookie: string; pid: number }> {
  const email = fresh(prefix);
  expect((await post('/api/auth/signup', { email, password: pw, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' })).status).toBe(202);
  const [m] = await mailTo(email);
  const res = await post('/api/auth/verify', { token: linkToken(m) });
  expect(res.status).toBe(200);
  const body = await res.json<{ player: { id: number } }>();
  return { email, cookie: sidOf(res)!, pid: body.player.id };
}

const login = (email: string, password: string) => post('/api/auth/login', { email, password, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' });
const sessionsOf = async (pid: number) => (await DB().prepare('SELECT method, transport FROM sessions WHERE player_id = ?1').bind(pid).all<{ method: string; transport: string }>()).results;

describe('sign-up and verification', () => {
  it('holds the sign-up as a pending token until the link is opened, then creates the account and a cookie session', async () => {
    const email = fresh('new');
    const res = await post('/api/auth/signup', { email, password: PW });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'check_email' });
    expect(res.headers.get('set-cookie')).toBeNull();
    // N-ID-1: no player or identity before the link is opened
    expect(await DB().prepare(`SELECT 1 FROM auth_identities WHERE subject = ?1`).bind(norm(email)).first()).toBeNull();

    const [m] = await mailTo(email);
    expect(m.subject).toMatch(/Confirm/);
    expect(m.text).toContain(`${env.GAME_URL}/auth/signup#t=`);
    const token = linkToken(m)!;
    // stored hashed, never raw
    expect(await DB().prepare('SELECT 1 FROM email_tokens WHERE token_hash = ?1').bind(await hashToken(token)).first()).not.toBeNull();
    expect(await DB().prepare('SELECT 1 FROM email_tokens WHERE token_hash = ?1').bind(token).first()).toBeNull();

    const v = await post('/api/auth/verify', { token });
    expect(v.status).toBe(200);
    expect(v.headers.get('set-cookie')).toMatch(/^__Host-pa_sid=pa2_[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    const player = (await v.json<{ player: { id: number; displayName: string; telegramId: null } }>()).player;
    expect(player.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/);
    expect(player.telegramId).toBeNull();
    const ident = await DB().prepare(`SELECT kind, subject, email, verified_at FROM auth_identities WHERE player_id = ?1`).bind(player.id).first();
    expect(ident).toMatchObject({ kind: 'password', subject: norm(email), email });
    expect(await sessionsOf(player.id)).toEqual([{ method: 'email_link', transport: 'cookie' }]);
    const me = await api('/api/me', { cookie: sidOf(v)! });
    expect(me.status).toBe(200);

    // single use
    const again = await post('/api/auth/verify', { token });
    expect(again.status).toBe(400);
    expect((await again.json<{ error: { code: string } }>()).error.code).toBe('invalid_token');
  });

  it('refuses an expired, unknown or malformed link', async () => {
    const email = fresh('exp');
    await post('/api/auth/signup', { email, password: PW });
    const token = linkToken((await mailTo(email))[0])!;
    await DB().prepare('UPDATE email_tokens SET expires_at = 0 WHERE token_hash = ?1').bind(await hashToken(token)).run();
    for (const t of [token, 'A'.repeat(43), 'short', '../../etc']) {
      const r = await post('/api/auth/verify', { token: t });
      expect(r.status).toBe(400);
      expect((await r.json<{ error: { code: string } }>()).error.code).toBe('invalid_token');
    }
  });

  it('answers 409 email_taken when the address was verified for another account meanwhile', async () => {
    const { email } = await account('taken');
    const raw = 'B'.repeat(43);
    const hash = await hashPassword(PW, peppersFromEnv(env).current);
    await DB()
      .prepare(`INSERT INTO email_tokens (token_hash, purpose, email_norm, email, pending_hash, created_at, expires_at) VALUES (?1, 'signup', ?2, ?3, ?4, ?5, ?6)`)
      .bind(await hashToken(raw), norm(email), email, hash, Date.now(), Date.now() + 60_000)
      .run();
    const r = await post('/api/auth/verify', { token: raw });
    expect(r.status).toBe(409);
    expect((await r.json<{ error: { code: string } }>()).error.code).toBe('email_taken');
  });

  it('applies the password policy with the codes the UX expects, before anything is stored', async () => {
    const email = fresh('policy');
    const code = async (password: string) => (await (await post('/api/auth/signup', { email, password })).json<{ error: { code: string } }>()).error.code;
    expect(await code('short')).toBe('too_short');
    expect(await code('x'.repeat(129))).toBe('too_long');
    expect(await code('Password123')).toBe('common');
    expect(await code(email)).toBe('matches_email');
    expect(await code(email.split('@')[0])).toBe('matches_email');
    expect((await post('/api/auth/signup', { email: 'not-an-email', password: PW })).status).toBe(400);
    expect(await settledMail(email)).toEqual([]);
  });

  it('resend issues a new link and retires the old one; an unknown or registered address gets nothing, same reply', async () => {
    const email = fresh('resend');
    await post('/api/auth/signup', { email, password: PW });
    const first = linkToken((await mailTo(email))[0])!;
    const r = await post('/api/auth/verify/resend', { email });
    expect(r.status).toBe(202);
    const second = linkToken((await mailTo(email, 2))[1])!;
    expect(second).not.toBe(first);
    expect((await post('/api/auth/verify', { token: first })).status).toBe(400);
    expect((await post('/api/auth/verify', { token: second })).status).toBe(200);

    const ghost = fresh('ghost');
    const r2 = await post('/api/auth/verify/resend', { email: ghost });
    expect(r2.status).toBe(202);
    expect(await r2.json()).toEqual({ status: 'check_email' });
    expect(await settledMail(ghost)).toEqual([]);
    // registered now: nothing more is sent
    await post('/api/auth/verify/resend', { email });
    expect(await settledMail(email)).toHaveLength(2);
  });
});

describe('uniform responses (M-AF-3, N-AF-2)', () => {
  it('sign-up answers the same for a registered and a new address; the registered one gets a no-token notice', async () => {
    const { email: known } = await account('uniform');
    const unknown = fresh('uniform-new');
    const a = await post('/api/auth/signup', { email: known, password: 'another-pass-77' });
    const b = await post('/api/auth/signup', { email: unknown, password: 'another-pass-77' });
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    const notice = (await mailTo(known, 2))[1];
    expect(notice.subject).toMatch(/already have/);
    expect(linkToken(notice)).toBeNull();
  });

  it('reset request answers the same for a registered and an unknown address', async () => {
    const { email: known } = await account('reset-uni');
    const unknown = fresh('reset-uni-new');
    const a = await post('/api/auth/reset/request', { email: known });
    const b = await post('/api/auth/reset/request', { email: unknown });
    expect([a.status, await a.text()]).toEqual([202, JSON.stringify({ status: 'check_email' })]);
    expect([b.status, await b.text()]).toEqual([202, JSON.stringify({ status: 'check_email' })]);
    expect(await settledMail(unknown)).toEqual([]);
  });

  it('log-in answers one 401 invalid_credentials for an unknown email and a wrong password', async () => {
    const { email } = await account('login-uni');
    const a = await login(email, 'wrong-password-1');
    const b = await login(fresh('nobody'), 'wrong-password-1');
    expect(a.status).toBe(401);
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    expect(a.headers.get('set-cookie')).toBeNull();
  });
});

describe('log-in', () => {
  it('starts a new cookie session on every log-in (rotation), case-insensitive on the address', async () => {
    const { email, pid } = await account('login');
    const r1 = await login(email.toUpperCase(), PW);
    expect(r1.status).toBe(200);
    const r2 = await login(` ${email} `, PW);
    expect(sidOf(r1)).not.toBe(sidOf(r2));
    expect((await sessionsOf(pid)).filter((s) => s.method === 'password')).toHaveLength(2);
    expect((await api('/api/me', { cookie: sidOf(r2)! })).status).toBe(200);
  });

  it('locks after 5 failures: even the right password then gets the same 401, until the lock runs out', async () => {
    const { email } = await account('lock');
    const wrong = await login(email, 'wrong-password-1');
    const wrongBody = await wrong.text();
    for (let i = 0; i < 4; i++) await login(email, 'wrong-password-1');
    const locked = await login(email, PW);
    expect([locked.status, await locked.text()]).toEqual([401, wrongBody]);
    const row = await DB().prepare(`SELECT failures, locked_until FROM auth_throttle WHERE key LIKE 'login:%' AND failures = 5 AND locked_until > ?1`).bind(Date.now()).all();
    expect(row.results.length).toBeGreaterThan(0);
    // the lock runs out (simulated): the right password works and resets the count
    await DB().prepare(`UPDATE auth_throttle SET locked_until = 1 WHERE key LIKE 'login:%' AND failures >= 5`).run();
    expect((await login(email, PW)).status).toBe(200);
  });

  it('rehashes on log-in when the stored count or pepper id is old, and the old hash keeps working until then', async () => {
    const { email, pid } = await account('rehash');
    const peppers = peppersFromEnv(env);
    const stored = async () => (await DB().prepare(`SELECT h.hash FROM password_hashes h JOIN auth_identities i ON i.id = h.identity_id WHERE i.player_id = ?1`).bind(pid).first<{ hash: string }>())!.hash;
    const setHash = async (h: string) => DB().prepare(`UPDATE password_hashes SET hash = ?2 WHERE identity_id = (SELECT id FROM auth_identities WHERE player_id = ?1)`).bind(pid, h).run();

    await setHash(await hashPassword(PW, peppers.current, 100_000));
    expect((await login(email, PW)).status).toBe(200);
    expect((await stored()).split('$').slice(0, 3)).toEqual(['pbkdf2-sha256', String(PBKDF2_ITERATIONS), env.PASSWORD_PEPPER_ID]);

    await setHash(await hashPassword(PW, peppers.previous[0]));
    expect((await login(email, PW)).status).toBe(200);
    expect((await stored()).split('$')[2]).toBe(env.PASSWORD_PEPPER_ID);
    const settled = await stored();
    expect((await login(email, PW)).status).toBe(200);
    expect(await stored()).toBe(settled); // current parameters: no rewrite
  });
});

describe('password reset', () => {
  it('a 30-minute single-use link sets the password, revokes every session and issues one', async () => {
    const { email, cookie, pid } = await account('reset');
    const other = sidOf(await login(email, PW))!;
    expect(await post('/api/auth/reset/request', { email })).toHaveProperty('status', 202);
    const mails = await mailTo(email, 2);
    const m = mails[1];
    expect(m.text).toContain(`${env.GAME_URL}/auth/reset#t=`);
    const token = linkToken(m)!;
    const row = await DB().prepare('SELECT expires_at - created_at AS ttl FROM email_tokens WHERE token_hash = ?1').bind(await hashToken(token)).first<{ ttl: number }>();
    expect(row!.ttl).toBe(30 * 60_000);

    // a weak password doesn't burn the link
    const weak = await post('/api/auth/reset/confirm', { token, password: 'qwertyuiop' });
    expect(weak.status).toBe(400);
    const NEW = 'a-brand-new-secret';
    const ok = await post('/api/auth/reset/confirm', { token, password: NEW });
    expect(ok.status).toBe(200);
    const fresh = sidOf(ok)!;
    expect((await api('/api/me', { cookie })).status).toBe(401);
    expect((await api('/api/me', { cookie: other })).status).toBe(401);
    expect((await api('/api/me', { cookie: fresh })).status).toBe(200);
    expect(await sessionsOf(pid)).toEqual([{ method: 'email_link', transport: 'cookie' }]);
    expect((await post('/api/auth/reset/confirm', { token, password: 'yet-another-pass' })).status).toBe(400);
    expect((await login(email, PW)).status).toBe(401);
    expect((await login(email, NEW)).status).toBe(200);
    expect((await mailTo(email, 3))[2].subject).toMatch(/password was changed/);
  });

  it('a newer reset link retires the older one; an expired link is refused', async () => {
    const { email } = await account('reset2');
    await post('/api/auth/reset/request', { email });
    const t1 = linkToken((await mailTo(email, 2))[1])!;
    await post('/api/auth/reset/request', { email });
    const t2 = linkToken((await mailTo(email, 3))[2])!;
    expect((await post('/api/auth/reset/confirm', { token: t1, password: 'some-new-pass-1' })).status).toBe(400);
    await DB().prepare('UPDATE email_tokens SET expires_at = 0 WHERE token_hash = ?1').bind(await hashToken(t2)).run();
    const r = await post('/api/auth/reset/confirm', { token: t2, password: 'some-new-pass-1' });
    expect(r.status).toBe(400);
    expect((await r.json<{ error: { code: string } }>()).error.code).toBe('invalid_token');
  });

  it('works while the address is locked, and clears the lock (a lockout never blocks the owner)', async () => {
    const { email } = await account('reset-lock');
    for (let i = 0; i < 5; i++) await login(email, 'wrong-password-1');
    await post('/api/auth/reset/request', { email });
    const token = linkToken((await mailTo(email, 2))[1])!;
    expect((await post('/api/auth/reset/confirm', { token, password: 'unlocked-at-last' })).status).toBe(200);
    expect((await login(email, 'unlocked-at-last')).status).toBe(200);
  });
});

describe('mail caps (M-AF-5)', () => {
  it('sends at most 3 emails per address per hour, silently, with the same 202', async () => {
    const { email } = await account('cap'); // 1 email (verify)
    for (let i = 0; i < 4; i++) {
      const r = await post('/api/auth/reset/request', { email });
      expect(r.status).toBe(202);
    }
    expect(await settledMail(email)).toHaveLength(3);
  });
});

describe('password change', () => {
  it('re-checks the current password, sets the new one and revokes only the other sessions', async () => {
    const { email, cookie, pid } = await account('change');
    const other = sidOf(await login(email, PW))!;
    const bad = await post('/api/auth/password', { current: 'not-my-password', next: 'changed-secret-1' }, { cookie });
    expect(bad.status).toBe(401);
    expect((await bad.json<{ error: { code: string } }>()).error.code).toBe('invalid_credentials');
    const weak = await post('/api/auth/password', { current: PW, next: '1234567890' }, { cookie });
    expect(weak.status).toBe(400);
    const ok = await post('/api/auth/password', { current: PW, next: 'changed-secret-1' }, { cookie });
    expect(ok.status).toBe(200);
    expect((await api('/api/me', { cookie })).status).toBe(200);
    expect((await api('/api/me', { cookie: other })).status).toBe(401);
    expect(await sessionsOf(pid)).toHaveLength(1);
    expect((await login(email, 'changed-secret-1')).status).toBe(200);
    expect((await mailTo(email, 2))[1].subject).toMatch(/password was changed/);
  });

  it('counts wrong current passwords toward the address lockout', async () => {
    const { email, cookie } = await account('change-lock');
    for (let i = 0; i < 5; i++) await post('/api/auth/password', { current: 'not-my-password', next: 'changed-secret-1' }, { cookie });
    expect((await login(email, PW)).status).toBe(401);
    expect((await post('/api/auth/password', { current: PW, next: 'changed-secret-1' }, { cookie })).status).toBe(401);
  });

  it('needs a session, and a password identity', async () => {
    expect((await post('/api/auth/password', { current: PW, next: 'changed-secret-1' })).status).toBe(401);
  });
});

describe('login CSRF (ADR-0007 Origin rule on the session-issuing forms)', () => {
  it('refuses the anonymous email forms from a foreign or missing Origin', async () => {
    const { email } = await account('csrf');
    for (const path of ['/api/auth/login', '/api/auth/signup', '/api/auth/verify', '/api/auth/verify/resend', '/api/auth/reset/request', '/api/auth/reset/confirm']) {
      for (const origin of ['https://evil.example', null]) {
        const res = await api(path, { method: 'POST', json: { email, password: PW, token: 'A'.repeat(43) }, headers: origin ? { origin } : {} });
        expect(res.status, `${path} from ${origin}`).toBe(403);
        expect((await res.json<{ error: { code: string } }>()).error.code).toBe('bad_origin');
      }
    }
    expect((await login(email, PW)).status).toBe(200);
  });
});

describe('logs (N-PW-1, ADR-0008 implementation guidelines)', () => {
  it('never contain a password, a hash, a raw email token or a session token', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(capture));
    try {
      const NEW = 'log-spy-new-password';
      const { email, cookie, pid } = await account('logspy');
      await login(email, 'log-spy-wrong-pass');
      const s = sidOf(await login(email, PW))!;
      await post('/api/auth/reset/request', { email });
      const resetToken = linkToken((await mailTo(email, 2))[1])!;
      await post('/api/auth/reset/confirm', { token: resetToken, password: NEW });
      await post('/api/auth/verify', { token: resetToken });
      await post('/api/auth/signup', { email, password: 'x' });
      await settledMail(email);
      const hash = (await DB().prepare(`SELECT h.hash FROM password_hashes h JOIN auth_identities i ON i.id = h.identity_id WHERE i.player_id = ?1`).bind(pid).first<{ hash: string }>())!.hash;
      const verifyToken = linkToken((await mailTo(email))[0])!;
      const secrets = [PW, NEW, 'log-spy-wrong-pass', hash, hash.split('$')[4], resetToken, verifyToken, cookie, s, env.PASSWORD_PEPPER!];
      const all = lines.join('\n');
      for (const secret of secrets) expect(all.includes(secret), `log leaked ${secret.slice(0, 6)}…`).toBe(false);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
