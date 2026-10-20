/**
 * V6-LINK-02 (ADR-0009 §1, §2, §4, §7): re-auth, add email (Telegram → web),
 * change email, unlink, DELETE /api/account, and the email and bot notices on
 * every identity change. Mail goes to dev_outbox (DEV_EMAIL=1); bot calls are
 * recorded by mockTelegram.
 */
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, BOT_TOKEN, devLogin, GAME_ORIGIN, mockTelegram, type BotCall } from './helpers';
import { forgetSessions } from '../src/auth/sessions';
import { signInitData } from '../src/telegramAuth';
import { resetRateLimits } from '../src/rateLimit';
import { banIdentityHash } from '../src/account/banTombstone';
import { peppersFromEnv } from '../src/auth/password';

const DB = () => env.DB!;
const PW = 'battle-standard-42';
const MIN = 60_000;
let n = 0;
const fresh = (p: string) => `${p}.${++n}.${Date.now()}@Example.com`;
let tg = 7_300_000;
let ipN = 0;
const ip = () => `198.19.${Math.floor(++ipN / 250)}.${ipN % 250}`;

let bot: BotCall[] = [];
beforeEach(() => {
  resetRateLimits();
  bot = mockTelegram();
});
afterEach(async () => {
  vi.restoreAllMocks();
  // The identity–mirror invariant holds after every identity write (M-ID-3).
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
}
async function mailTo(to: string, count = 1, timeoutMs = 3_000): Promise<Mail[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await DB().prepare('SELECT to_addr, subject, text FROM dev_outbox WHERE to_addr = ?1 ORDER BY id').bind(to).all<Mail>()).results;
    if (rows.length >= count || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
}
const linkToken = (m: Mail) => /#t=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1] ?? null;
const sidOf = (res: Response) => /__Host-pa_sid=(pa2_[A-Za-z0-9_-]{43})/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;
const errorOf = async (r: Response) => (await r.json<{ error: { code: string } }>()).error.code;
/** Bot messages sent to a chat (after the response, so this waits a little). */
async function botTo(chat: number, count = 1): Promise<BotCall[]> {
  const until = Date.now() + 3_000;
  for (;;) {
    const got = bot.filter((c) => c.method === 'sendMessage' && c.params.chat_id === chat);
    if (got.length >= count || Date.now() > until) return got;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Anonymous web forms (fresh IP, game origin, a passing Turnstile token). */
const form = (path: string, json: Record<string, unknown>) =>
  api(path, { method: 'POST', json: { turnstile: 'XXXX.DUMMY.TOKEN.XXXX', ...json }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });
const verify = (token: string | null) => api('/api/auth/verify', { method: 'POST', json: { token }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });

/** A verified email-only web account. */
async function webAccount(): Promise<{ email: string; cookie: string; pid: number }> {
  const email = fresh('web');
  expect((await form('/api/auth/signup', { email, password: PW })).status).toBe(202);
  const [m] = await mailTo(email);
  const res = await verify(linkToken(m));
  expect(res.status).toBe(200);
  return { email, cookie: sidOf(res)!, pid: (await res.json<{ player: { id: number } }>()).player.id };
}

/** A Telegram player with a bearer session. */
async function tgAccount(): Promise<{ token: string; pid: number; tgId: number }> {
  const id = ++tg;
  const me = await devLogin(id);
  return { token: me.token, pid: me.playerId, tgId: id };
}

/** Ages the re-auth of every session of the player past the 10-minute window. */
async function staleReauth(pid: number): Promise<void> {
  await DB().prepare('UPDATE sessions SET reauth_at = ?2 WHERE player_id = ?1').bind(pid, Date.now() - 11 * MIN).run();
  forgetSessions(pid);
}

const initDataFor = (id: number, ageSec = 0) =>
  signInitData({ auth_date: String(Math.floor(Date.now() / 1000) - ageSec), user: JSON.stringify({ id, first_name: `Tester${id}` }) }, BOT_TOKEN);

type Auth = { token?: string; cookie?: string };
const reauth = (a: Auth, json: unknown) => api('/api/account/reauth', { method: 'POST', ...a, json, headers: { 'cf-connecting-ip': ip() } });

describe('re-auth (ADR-0009 §1, accounts-v6.md §14 Q1)', () => {
  it('a sensitive action without a fresh proof is 401 reauth_required', async () => {
    const me = await tgAccount();
    await staleReauth(me.pid);
    const r = await api('/api/account', { method: 'DELETE', token: me.token, json: { confirm: 'DELETE' } });
    expect(r.status).toBe(401);
    expect(await errorOf(r)).toBe('reauth_required');
  });

  it('a password re-auth refreshes the window; a wrong password is invalid_credentials and counts toward the lockout', async () => {
    const me = await webAccount();
    await staleReauth(me.pid);
    const bad = await reauth({ cookie: me.cookie }, { password: 'not-the-password-1' });
    expect(bad.status).toBe(401);
    expect(await errorOf(bad)).toBe('invalid_credentials');
    const ok = await reauth({ cookie: me.cookie }, { password: PW });
    expect(ok.status).toBe(200);
    const row = await DB().prepare('SELECT reauth_at FROM sessions WHERE player_id = ?1').bind(me.pid).first<{ reauth_at: number }>();
    expect(Date.now() - row!.reauth_at).toBeLessThan(MIN);
  });

  it('five wrong passwords lock re-auth like log-in, even for the right password', async () => {
    const me = await webAccount();
    for (let i = 0; i < 5; i++) expect((await reauth({ cookie: me.cookie }, { password: `wrong-password-${i}x` })).status).toBe(401);
    expect((await reauth({ cookie: me.cookie }, { password: PW })).status).toBe(401);
  });

  it('a Telegram re-auth needs initData of the same Telegram user, at most 10 minutes old', async () => {
    const me = await tgAccount();
    await staleReauth(me.pid);
    const old = await reauth({ token: me.token }, { initData: await initDataFor(me.tgId, 11 * 60) });
    expect(old.status).toBe(401);
    expect(await errorOf(old)).toBe('init_data_expired');
    const other = await reauth({ token: me.token }, { initData: await initDataFor(me.tgId + 50_000) });
    expect(other.status).toBe(403);
    expect(await errorOf(other)).toBe('wrong_account');
    const forged = await reauth({ token: me.token }, { initData: (await initDataFor(me.tgId)).replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`) });
    expect(forged.status).toBe(401);
    expect((await reauth({ token: me.token }, { initData: await initDataFor(me.tgId, 60) })).status).toBe(200);
    const r = await api('/api/account', { method: 'DELETE', token: me.token, json: { confirm: 'nope' } });
    expect(await errorOf(r)).toBe('confirm_required'); // past the re-auth gate now
  });

  it('a password re-auth on an account without a password is 400 no_password', async () => {
    const me = await tgAccount();
    const r = await reauth({ token: me.token }, { password: PW });
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe('no_password');
  });

  it('a Telegram session started from initData older than 10 minutes is not a fresh proof', async () => {
    const id = ++tg;
    const res = await api('/api/auth/telegram', { method: 'POST', json: { initData: await initDataFor(id, 30 * 60) }, headers: { 'cf-connecting-ip': ip() } });
    expect(res.status).toBe(200);
    const { token } = await res.json<{ token: string }>();
    const r = await api('/api/account', { method: 'DELETE', token, json: { confirm: 'DELETE' } });
    expect(await errorOf(r)).toBe('reauth_required');
  });
});

const addEmail = (a: Auth, email: string, password = PW) => api('/api/account/email', { method: 'POST', ...a, json: { email, password } });
const hasPassword = async (pid: number) => !!(await DB().prepare(`SELECT 1 FROM auth_identities WHERE player_id = ?1 AND kind = 'password'`).bind(pid).first());

describe('add email and password, Telegram → web (ADR-0009 §2)', () => {
  it('completes only through the emailed link: the web gets a cookie session for the same player, with notices by email and bot', async () => {
    const me = await tgAccount();
    const email = fresh('add');
    const r = await addEmail({ token: me.token }, email);
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ status: 'check_email' });
    // Nothing is linked before the link is opened (M-LK-3).
    expect(await hasPassword(me.pid)).toBe(false);
    const [m] = await mailTo(email);
    expect(m.text).toContain('/auth/add_email#t=');
    const res = await verify(linkToken(m));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ purpose: 'add_email', player: { id: me.pid } });
    const cookie = sidOf(res)!;
    expect((await api('/api/account', { cookie })).status).toBe(200);
    // The Telegram side is unchanged.
    expect((await api('/api/account', { token: me.token })).status).toBe(200);
    // Log-in on the web with the new password works.
    const login = await form('/api/auth/login', { email, password: PW });
    expect(login.status).toBe(200);
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(me.pid);
    // Notices: a confirmation to the address, a bot message to the chat.
    const mails = await mailTo(email, 2);
    expect(mails[1].subject).toMatch(/added/i);
    const [msg] = await botTo(me.tgId);
    expect(String(msg.params.text)).toMatch(/email/i);
    // Single use.
    expect((await verify(linkToken(m))).status).toBe(400);
  });

  it('needs a fresh re-auth', async () => {
    const me = await tgAccount();
    await staleReauth(me.pid);
    const r = await addEmail({ token: me.token }, fresh('add'));
    expect(r.status).toBe(401);
    expect(await errorOf(r)).toBe('reauth_required');
  });

  it('applies the password policy and refuses a second email', async () => {
    const me = await tgAccount();
    const short = await addEmail({ token: me.token }, fresh('add'), 'short');
    expect(short.status).toBe(400);
    expect(await errorOf(short)).toBe('too_short');
    const web = await webAccount();
    const again = await addEmail({ cookie: web.cookie }, fresh('add'));
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('already_has_email');
  });

  it('allows 5 requests per hour per account', async () => {
    const me = await tgAccount();
    for (let i = 0; i < 5; i++) expect((await addEmail({ token: me.token }, fresh('add'))).status).toBe(202);
    const r = await addEmail({ token: me.token }, fresh('add'));
    expect(r.status).toBe(429);
    expect(await errorOf(r)).toBe('rate_limited');
  });

  it('an address that belongs to another account gets the same 202 and a conflict email; its link links nothing', async () => {
    const other = await webAccount();
    const me = await tgAccount();
    const r = await addEmail({ token: me.token }, other.email);
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ status: 'check_email' });
    const mails = await mailTo(other.email, 2);
    expect(mails[1].subject).toMatch(/already has/i);
    const res = await verify(linkToken(mails[1]));
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('email_conflict');
    expect(await hasPassword(me.pid)).toBe(false);
  });

  it('a ban-tombstoned address is refused when the link is opened', async () => {
    const me = await tgAccount();
    const email = fresh('banned');
    const now = Date.now();
    const hash = await banIdentityHash(peppersFromEnv(env).current, 'password', email.toLowerCase());
    await DB().prepare('INSERT INTO ban_tombstones (identity_hash, banned_at, expires_at) VALUES (?1, ?2, ?3)').bind(hash, now, now + 86_400_000).run();
    try {
      expect((await addEmail({ token: me.token }, email)).status).toBe(202);
      const [m] = await mailTo(email);
      const res = await verify(linkToken(m));
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toBe('banned');
      expect(await hasPassword(me.pid)).toBe(false);
    } finally {
      await DB().prepare('DELETE FROM ban_tombstones WHERE identity_hash = ?1').bind(hash).run();
    }
  });
});

const changeEmail = (a: Auth, email: string) => api('/api/account/email/change', { method: 'POST', ...a, json: { email } });

describe('change email (ADR-0009 §4)', () => {
  it('moves the identity to the new address through its link; the old address is told and stops working', async () => {
    const me = await webAccount();
    // A reset link already sent to the old address must die with the change.
    expect((await form('/api/auth/reset/request', { email: me.email })).status).toBe(202);
    const [, resetMail] = await mailTo(me.email, 2);
    const next = fresh('next');
    const r = await changeEmail({ cookie: me.cookie }, next);
    expect(r.status).toBe(202);
    const [m] = await mailTo(next);
    expect(m.text).toContain('/auth/change_email#t=');
    // Until the link is opened, the old address keeps working.
    expect((await form('/api/auth/login', { email: me.email, password: PW })).status).toBe(200);
    const res = await verify(linkToken(m));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ purpose: 'change_email', player: { id: me.pid } });
    expect((await form('/api/auth/login', { email: me.email, password: PW })).status).toBe(401);
    expect((await form('/api/auth/login', { email: next, password: PW })).status).toBe(200);
    const old = await mailTo(me.email, 4);
    expect(old.map((x) => x.subject)).toContainEqual(expect.stringMatching(/email was changed/i));
    const reset = await api('/api/auth/reset/confirm', { method: 'POST', json: { token: linkToken(resetMail), password: 'another-password-77' }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });
    expect(reset.status).toBe(400);
  });

  it('an address with an account gets the same 202 and an "in use" email, with no link', async () => {
    const me = await webAccount();
    const other = await webAccount();
    expect((await changeEmail({ cookie: me.cookie }, other.email)).status).toBe(202);
    const mails = await mailTo(other.email, 2);
    expect(mails[1].subject).toMatch(/already has/i);
    expect(linkToken(mails[1])).toBeNull();
  });

  it('needs re-auth, an existing email and a different address', async () => {
    const tgOnly = await tgAccount();
    const r1 = await changeEmail({ token: tgOnly.token }, fresh('x'));
    expect(await errorOf(r1)).toBe('no_password');
    const me = await webAccount();
    const r2 = await changeEmail({ cookie: me.cookie }, me.email.toUpperCase());
    expect(await errorOf(r2)).toBe('same_email');
    await staleReauth(me.pid);
    const r3 = await changeEmail({ cookie: me.cookie }, fresh('x'));
    expect(r3.status).toBe(401);
    expect(await errorOf(r3)).toBe('reauth_required');
  });
});

/** A Telegram player who added an email: a bearer session and a cookie session. */
async function linkedAccount(): Promise<{ token: string; cookie: string; pid: number; tgId: number; email: string }> {
  const me = await tgAccount();
  const email = fresh('linked');
  expect((await addEmail({ token: me.token }, email)).status).toBe(202);
  const [m] = await mailTo(email);
  const res = await verify(linkToken(m));
  expect(res.status).toBe(200);
  await botTo(me.tgId); // the email_added notice
  bot.length = 0;
  return { ...me, email, cookie: sidOf(res)! };
}
const unlink = (a: Auth, kind: string) => api(`/api/account/identities/${kind}`, { method: 'DELETE', ...a });
const count = async (sql: string, ...args: unknown[]) => (await DB().prepare(`SELECT COUNT(*) AS n FROM ${sql}`).bind(...args).first<{ n: number }>())!.n;

describe('unlink (ADR-0009 §4)', () => {
  it('refuses to remove the last sign-in method', async () => {
    const t = await tgAccount();
    const r1 = await unlink({ token: t.token }, 'telegram');
    expect(r1.status).toBe(409);
    expect(await errorOf(r1)).toBe('last_login_method');
    const w = await webAccount();
    const r2 = await unlink({ cookie: w.cookie }, 'password');
    expect(r2.status).toBe(409);
    expect(await errorOf(r2)).toBe('last_login_method');
    expect(await errorOf(await unlink({ cookie: w.cookie }, 'telegram'))).toBe('not_found');
    expect((await unlink({ cookie: w.cookie }, 'google')).status).toBe(400);
  });

  it('unlinking Telegram clears the mirror, the bot rows and the bearer sessions; purchases stay; email and bot are told', async () => {
    const me = await linkedAccount();
    const now = Date.now();
    await DB().batch([
      DB().prepare('INSERT INTO notify_settings (player_id, updated_at) VALUES (?1, ?2)').bind(me.pid, now),
      DB().prepare(`INSERT INTO bot_state (telegram_id, state, until) VALUES (?1, 'support', ?2)`).bind(me.tgId, now + 60_000),
      DB().prepare(`INSERT INTO notify_outbox (player_id, type, event, dedupe, data, created_at) VALUES (?1, 'income', 'income_full', ?2, '{}', ?3)`).bind(me.pid, `d${me.pid}`, now),
      DB().prepare(`INSERT INTO purchases (telegram_payment_charge_id, player_id, product_id, currency, stars_amount, payload, created_at) VALUES (?1, ?2, 'founder', 'XTR', 100, '{}', ?3)`).bind(`ch_u${me.pid}`, me.pid, now),
    ]);
    const r = await unlink({ cookie: me.cookie }, 'telegram');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, signedOut: false });
    expect(await DB().prepare('SELECT telegram_id FROM players WHERE id = ?1').bind(me.pid).first()).toEqual({ telegram_id: null });
    expect(await count('notify_settings WHERE player_id = ?1', me.pid)).toBe(0);
    expect(await count('bot_state WHERE telegram_id = ?1', me.tgId)).toBe(0);
    expect(await count(`notify_outbox WHERE player_id = ?1 AND status = 'pending'`, me.pid)).toBe(0);
    expect(await count('purchases WHERE player_id = ?1', me.pid)).toBe(1);
    expect((await api('/api/account', { token: me.token })).status).toBe(401);
    expect((await api('/api/account', { cookie: me.cookie })).status).toBe(200);
    const mails = await mailTo(me.email, 3);
    expect(mails[2].subject).toMatch(/Telegram removed/i);
    expect(String((await botTo(me.tgId))[0].params.text)).toMatch(/unlinked/i);
    // The same Telegram user signs in to a new, empty player.
    const again = await devLogin(me.tgId);
    expect(again.playerId).not.toBe(me.pid);
  });

  it('unlinking the email revokes cookie sessions and tells the old address and the bot', async () => {
    const me = await linkedAccount();
    const r = await unlink({ token: me.token }, 'password');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, signedOut: false });
    expect((await api('/api/account', { cookie: me.cookie })).status).toBe(401);
    expect((await api('/api/account', { token: me.token })).status).toBe(200);
    expect((await form('/api/auth/login', { email: me.email, password: PW })).status).toBe(401);
    const mails = await mailTo(me.email, 3);
    expect(mails[2].subject).toMatch(/Email removed/i);
    expect(String((await botTo(me.tgId))[0].params.text)).toMatch(/email was removed/i);
  });

  it('a session that unlinks its own method is signed out (and the cookie is cleared)', async () => {
    const me = await linkedAccount();
    const r = await unlink({ cookie: me.cookie }, 'password');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, signedOut: true });
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('needs re-auth', async () => {
    const me = await linkedAccount();
    await staleReauth(me.pid);
    const r = await unlink({ cookie: me.cookie }, 'telegram');
    expect(r.status).toBe(401);
    expect(await errorOf(r)).toBe('reauth_required');
  });
});

describe('DELETE /api/account (ADR-0009 §7)', () => {
  it('needs re-auth and the typed confirmation, then deletes, with a confirmation email and a bot notice', async () => {
    const me = await linkedAccount();
    const bad = await api('/api/account', { method: 'DELETE', cookie: me.cookie, json: { confirm: 'delete' } });
    expect(bad.status).toBe(400);
    expect(await errorOf(bad)).toBe('confirm_required');
    const r = await api('/api/account', { method: 'DELETE', cookie: me.cookie, json: { confirm: 'DELETE' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'done' });
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    const p = await DB().prepare('SELECT deleted_at, telegram_id, display_name FROM players WHERE id = ?1').bind(me.pid).first<{ deleted_at: number | null; telegram_id: number | null; display_name: string }>();
    expect(p).toMatchObject({ telegram_id: null, display_name: 'Deleted player' });
    expect(p!.deleted_at).not.toBeNull();
    expect(await count('auth_identities WHERE player_id = ?1', me.pid)).toBe(0);
    // The confirmation email went out before the identities were removed (LINK-04's beforeRevoke hook).
    const mails = await mailTo(me.email, 3);
    expect(mails[2].subject).toMatch(/deleted/i);
    expect(String((await botTo(me.tgId))[0].params.text)).toMatch(/deleted/i);
    expect((await api('/api/account', { token: me.token })).status).toBe(401);
  });

  it('a busy player gets 409 busy_try_later and nothing changes', async () => {
    const me = await tgAccount();
    const now = Date.now();
    await DB()
      .prepare(
        `INSERT INTO duel_tickets (id, player_id, floor, seed, setup, team, created_at, expires_at)
         VALUES (?1, ?2, 1, 1, '{}', '[]', ?3, ?4)`,
      )
      .bind(`bl${me.pid}`, me.pid, now, now + 60_000)
      .run();
    const r = await api('/api/account', { method: 'DELETE', token: me.token, json: { confirm: 'DELETE' } });
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe('busy_try_later');
    expect((await api('/api/account', { token: me.token })).status).toBe(200);
  });
});
