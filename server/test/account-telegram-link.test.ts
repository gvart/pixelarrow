/**
 * V6-LINK-03 (ADR-0009 §3, §5; M-LK-1, M-LK-2, M-LK-5..7, N-LK-1, N-LK-3):
 * web → Telegram link codes with two-sided confirmation, and the conflicts
 * (one account is kept, the other deleted; never a merge). Mail goes to
 * dev_outbox (DEV_EMAIL=1); bot calls are recorded by mockTelegram.
 */
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, BOT_TOKEN, devLogin, GAME_ORIGIN, mockTelegram, type BotCall } from './helpers';
import { forgetSessions, hashToken } from '../src/auth/sessions';
import { signInitData } from '../src/telegramAuth';
import { resetRateLimits } from '../src/rateLimit';
import { banIdentityHash } from '../src/account/banTombstone';
import { peppersFromEnv } from '../src/auth/password';
import { pruneLinks } from '../src/account/cron';

const DB = () => env.DB!;
const PW = 'battle-standard-42';
const MIN = 60_000;
let n = 0;
const fresh = (p: string) => `${p}.${++n}.${Date.now()}@Example.com`;
let tg = 7_600_000;
let ipN = 0;
const ip = () => `198.20.${Math.floor(++ipN / 250)}.${ipN % 250}`;

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
async function botTo(chat: number, count = 1): Promise<BotCall[]> {
  const until = Date.now() + 3_000;
  for (;;) {
    const got = bot.filter((c) => c.method === 'sendMessage' && c.params.chat_id === chat);
    if (got.length >= count || Date.now() > until) return got;
    await new Promise((r) => setTimeout(r, 20));
  }
}

const form = (path: string, json: Record<string, unknown>) =>
  api(path, { method: 'POST', json: { turnstile: 'XXXX.DUMMY.TOKEN.XXXX', ...json }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });
const verify = (token: string | null) => api('/api/auth/verify', { method: 'POST', json: { token }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });

/** A verified email-only web account. */
async function webAccount(): Promise<{ email: string; cookie: string; pid: number; name: string }> {
  const email = fresh('web');
  expect((await form('/api/auth/signup', { email, password: PW })).status).toBe(202);
  const [m] = await mailTo(email);
  const res = await verify(linkToken(m));
  expect(res.status).toBe(200);
  const p = (await res.json<{ player: { id: number; displayName: string } }>()).player;
  return { email, cookie: sidOf(res)!, pid: p.id, name: p.displayName };
}

/** A Telegram player with a bearer session (the Mini App signs in before it links). */
async function tgAccount(): Promise<{ token: string; pid: number; tgId: number; name: string }> {
  const id = ++tg;
  const me = await devLogin(id);
  return { token: me.token, pid: me.playerId, tgId: id, name: me.name };
}

const count = async (where: string, ...binds: unknown[]) => (await DB().prepare(`SELECT COUNT(*) AS n FROM ${where}`).bind(...binds).first<{ n: number }>())!.n;
const telegramOf = async (pid: number) =>
  (await DB().prepare(`SELECT subject FROM auth_identities WHERE player_id = ?1 AND kind = 'telegram'`).bind(pid).first<{ subject: string }>())?.subject ?? null;
const deletedAt = async (pid: number) => (await DB().prepare('SELECT deleted_at FROM players WHERE id = ?1').bind(pid).first<{ deleted_at: number | null }>())!.deleted_at;

async function staleReauth(pid: number): Promise<void> {
  await DB().prepare('UPDATE sessions SET reauth_at = ?2 WHERE player_id = ?1').bind(pid, Date.now() - 11 * MIN).run();
  forgetSessions(pid);
}

/** Campaign progress beyond the first battle (ADR-0009 §5.1: not "empty"). */
async function giveProgress(pid: number, won = 5): Promise<void> {
  const data = JSON.stringify({ v: 1, won, heroes: [{}, {}, {}], world: { time: 24 * 6 + 3 } });
  await DB().prepare('INSERT INTO saves (player_id, revision, version, data, size, updated_at) VALUES (?1, 1, 1, ?2, ?3, ?4)').bind(pid, data, data.length, Date.now()).run();
}
async function givePurchase(pid: number): Promise<void> {
  await DB()
    .prepare(`INSERT INTO purchases (telegram_payment_charge_id, player_id, product_id, currency, stars_amount, payload, created_at) VALUES (?1, ?2, 'founder', 'XTR', 100, '{}', ?3)`)
    .bind(`ch_l3_${pid}_${Date.now()}`, pid, Date.now())
    .run();
}

type Auth = { token?: string; cookie?: string };
const startLink = (a: Auth) => api('/api/account/link/telegram', { method: 'POST', ...a, json: {} });
const peek = (a: Auth, code: string) => api(`/api/account/link/telegram/${code}`, { ...a, headers: { 'cf-connecting-ip': ip() } });
const initDataFor = (id: number, startParam: string | null, ageSec = 0) =>
  signInitData(
    { auth_date: String(Math.floor(Date.now() / 1000) - ageSec), user: JSON.stringify({ id, first_name: `Tester${id}`, username: `user${id}` }), ...(startParam ? { start_param: startParam } : {}) },
    BOT_TOKEN,
  );
const complete = (a: Auth, initData: string) => api('/api/account/link/telegram/complete', { method: 'POST', ...a, json: { initData }, headers: { 'cf-connecting-ip': ip() } });
const status = (a: Auth) => api('/api/account/link/telegram/status', a);
const confirm = (a: Auth) => api('/api/account/link/telegram/confirm', { method: 'POST', ...a, json: {} });
const conflictOf = (a: Auth, id: string) => api(`/api/account/conflict/${id}`, a);
const resolve = (a: Auth, id: string, keep: 'this' | 'other', name: string) => api(`/api/account/conflict/${id}/resolve`, { method: 'POST', ...a, json: { keep, confirm: name } });

/** Web player W starts a link and the Telegram player T completes it in the Mini App. */
async function linkUpTo(w: { cookie: string }, t: { token: string; tgId: number }): Promise<string> {
  const r = await startLink({ cookie: w.cookie });
  expect(r.status).toBe(200);
  const { code } = await r.json<{ code: string }>();
  const c = await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`));
  expect(c.status).toBe(200);
  return code;
}

describe('link codes (ADR-0009 §3, M-LK-2)', () => {
  it('a code is 16 random bytes, stored only as its hash, 10 minutes, and needs a fresh re-auth', async () => {
    const w = await webAccount();
    await staleReauth(w.pid);
    const stale = await startLink({ cookie: w.cookie });
    expect(stale.status).toBe(401);
    expect(await errorOf(stale)).toBe('reauth_required');
    await DB().prepare('UPDATE sessions SET reauth_at = ?2 WHERE player_id = ?1').bind(w.pid, Date.now()).run();
    forgetSessions(w.pid);
    const r = await startLink({ cookie: w.cookie });
    expect(r.status).toBe(200);
    const body = await r.json<{ code: string; expiresAt: number; deepLink: string | null }>();
    expect(body.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body.expiresAt - Date.now()).toBeGreaterThan(9 * MIN);
    expect(body.expiresAt - Date.now()).toBeLessThanOrEqual(10 * MIN);
    const rows = (await DB().prepare('SELECT code_hash, status FROM link_codes WHERE player_id = ?1').bind(w.pid).all<{ code_hash: string; status: string }>()).results;
    expect(rows).toEqual([{ code_hash: await hashToken(body.code), status: 'pending' }]);
    // A new code retires the old one.
    const again = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    expect(await count('link_codes WHERE player_id = ?1', w.pid)).toBe(1);
    expect((await peek({ token: (await tgAccount()).token }, body.code)).status).toBe(410);
    expect((await peek({ token: (await tgAccount()).token }, again.code)).status).toBe(200);
  });

  it('an account that already has Telegram cannot start a link', async () => {
    const t = await tgAccount();
    const r = await startLink({ token: t.token });
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe('already_linked');
  });

  it('the Mini App sees only the display name and the masked email', async () => {
    const w = await webAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    const t = await tgAccount();
    const r = await peek({ token: t.token }, code);
    expect(r.status).toBe(200);
    const body = await r.json<Record<string, unknown>>();
    expect(body).toEqual({ displayName: w.name, emailMasked: expect.stringMatching(/^w\*\*\*@e\*\*\*\.com$/), conflict: false });
    expect((await peek({ token: t.token }, 'A'.repeat(22))).status).toBe(410);
    expect((await peek({ token: t.token }, 'not a code')).status).toBe(410);
  });

  it('complete checks the HMAC, auth_date ≤ 10 min and start_param = link_<code>; nothing is linked before the web confirms', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    const forged = (await initDataFor(t.tgId, `link_${code}`)).replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
    expect(await errorOf(await complete({ token: t.token }, forged))).toBe('invalid_init_data');
    const old = await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`, 11 * 60));
    expect(old.status).toBe(401);
    expect(await errorOf(old)).toBe('init_data_expired');
    const noParam = await complete({ token: t.token }, await initDataFor(t.tgId, null));
    expect(noParam.status).toBe(400);
    expect(await errorOf(noParam)).toBe('bad_start_param');
    expect((await complete({ token: t.token }, await initDataFor(t.tgId, `link_${'B'.repeat(22)}`))).status).toBe(410);
    const ok = await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`, 60));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'awaiting_web' });
    // Single use: a second Telegram user can't take over the code.
    const t2 = await tgAccount();
    expect((await complete({ token: t2.token }, await initDataFor(t2.tgId, `link_${code}`))).status).toBe(410);
    // Nothing is linked until the web confirms (N-LK-3).
    expect(await telegramOf(w.pid)).toBeNull();
    expect(await telegramOf(t.pid)).toBe(String(t.tgId));
  });

  it('status and confirm accept only the creating web session', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    await linkUpTo(w, t);
    // The same player on another browser.
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    const otherCookie = sidOf(login)!;
    expect(await (await status({ cookie: otherCookie })).json()).toEqual({ status: 'none' });
    const c2 = await confirm({ cookie: otherCookie });
    expect(c2.status).toBe(410);
    expect(await errorOf(c2)).toBe('link_expired');
    const s = await status({ cookie: w.cookie });
    expect(await s.json()).toMatchObject({ status: 'awaiting_web', telegram: { username: null, firstName: `Tester${t.tgId}` } });
  });

  it('an expired code can be neither completed nor confirmed', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    await DB().prepare('UPDATE link_codes SET expires_at = ?2 WHERE player_id = ?1').bind(w.pid, Date.now() - 1).run();
    expect((await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`))).status).toBe(410);
    expect(await (await status({ cookie: w.cookie })).json()).toEqual({ status: 'expired' });
    const w2 = await webAccount();
    await linkUpTo(w2, t);
    await DB().prepare('UPDATE link_codes SET expires_at = ?2 WHERE player_id = ?1').bind(w2.pid, Date.now() - 1).run();
    expect((await confirm({ cookie: w2.cookie })).status).toBe(410);
    expect(await telegramOf(w2.pid)).toBeNull();
  });

  it('a ban-tombstoned Telegram id is refused', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    const h = await banIdentityHash(peppersFromEnv(env).current, 'telegram', String(t.tgId));
    await DB().prepare('INSERT INTO ban_tombstones (identity_hash, banned_at, expires_at) VALUES (?1, ?2, ?3)').bind(h, Date.now(), Date.now() + 86_400_000).run();
    const r = await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`));
    expect(r.status).toBe(403);
    expect(await errorOf(r)).toBe('banned');
    await DB().prepare('DELETE FROM ban_tombstones WHERE identity_hash = ?1').bind(h).run();
  });

  it('a Telegram user that has no player yet is linked directly: identity and mirror in one batch, with notices', async () => {
    const w = await webAccount();
    const tgId = ++tg;
    // The Mini App session here belongs to some other player: the initData is the proof, not the session.
    const viewer = await tgAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    expect((await complete({ token: viewer.token }, await initDataFor(tgId, `link_${code}`))).status).toBe(200);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ linked: true });
    expect(await telegramOf(w.pid)).toBe(String(tgId));
    expect(await DB().prepare('SELECT telegram_id FROM players WHERE id = ?1').bind(w.pid).first()).toEqual({ telegram_id: tgId });
    expect(await (await status({ cookie: w.cookie })).json()).toEqual({ status: 'linked' });
    // A second confirm does nothing.
    expect((await confirm({ cookie: w.cookie })).status).toBe(410);
    // The Telegram user now signs in to W.
    expect((await devLogin(tgId)).playerId).toBe(w.pid);
    const mails = await mailTo(w.email, 2);
    expect(mails[1].subject).toMatch(/Telegram linked/i);
    expect(String((await botTo(tgId))[0].params.text)).toMatch(/linked/i);
  });

  it('confirm needs a fresh re-auth', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    await linkUpTo(w, t);
    await staleReauth(w.pid);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(401);
    expect(await errorOf(r)).toBe('reauth_required');
  });

  it('cancel (Not me) abandons the code', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    await linkUpTo(w, t);
    expect((await api('/api/account/link/telegram', { method: 'DELETE', cookie: w.cookie })).status).toBe(200);
    expect((await confirm({ cookie: w.cookie })).status).toBe(410);
    expect(await count('link_codes WHERE player_id = ?1', w.pid)).toBe(0);
  });
});

describe('conflicts (ADR-0009 §5; M-LK-5..7, N-LK-1)', () => {
  it('an empty other account is deleted automatically and the link completes', async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount(); // fresh from the Mini App: empty
    await linkUpTo(w, t);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ linked: true, removedEmpty: true });
    expect(await telegramOf(w.pid)).toBe(String(t.tgId));
    expect(await deletedAt(t.pid)).not.toBeNull();
    expect(await DB().prepare('SELECT finished_at FROM deletion_jobs WHERE player_id = ?1').bind(t.pid).first<{ finished_at: number | null }>()).toMatchObject({ finished_at: expect.any(Number) });
    // W's progress is untouched (never a merge).
    expect(await count('saves WHERE player_id = ?1', w.pid)).toBe(1);
    expect((await api('/api/account', { token: t.token })).status).toBe(401);
    expect((await devLogin(t.tgId)).playerId).toBe(w.pid);
  });

  it('a busy other account is 409 busy_try_later and nothing changes', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    await linkUpTo(w, t);
    const now = Date.now();
    await DB()
      .prepare(
        `INSERT INTO battle_tickets (id, season_id, shard_id, player_id, loc, seed, setup, attackers, defenders, defender_kind, region_version, created_at, expires_at)
         VALUES (?1, 1, 1, ?2, 1, 1, '{}', '[]', '[]', 'npc', 0, ?3, ?4)`,
      )
      .bind(`l3busy${t.pid}`, t.pid, now, now + 60_000)
      .run();
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe('busy_try_later');
    expect(await telegramOf(t.pid)).toBe(String(t.tgId));
    expect(await deletedAt(t.pid)).toBeNull();
    expect(await (await status({ cookie: w.cookie })).json()).toMatchObject({ status: 'awaiting_web' });
  });

  it('both with progress: the player picks after typing the loser name; keep this moves Telegram and deletes the other', async () => {
    const w = await webAccount();
    await giveProgress(w.pid, 9);
    const t = await tgAccount();
    await giveProgress(t.pid, 4);
    await linkUpTo(w, t);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(200);
    const { conflict } = await r.json<{ conflict: string }>();
    expect(conflict).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // The code is spent; nothing is linked yet.
    expect(await (await status({ cookie: w.cookie })).json()).toEqual({ status: 'conflict', conflict });
    expect(await telegramOf(w.pid)).toBeNull();
    const view = await conflictOf({ cookie: w.cookie }, conflict);
    expect(view.status).toBe(200);
    const v = await view.json<Record<string, unknown>>();
    expect(v).toMatchObject({
      kind: 'telegram',
      this: { displayName: w.name, signIn: ['password'], campaignDay: 7, heroes: 3, duelRating: null, war: null, purchases: false },
      other: { displayName: t.name, signIn: ['telegram'], purchases: false },
    });
    expect(v.forced).toBeUndefined();
    // Another player can't see it.
    expect((await conflictOf({ cookie: (await webAccount()).cookie }, conflict)).status).toBe(404);
    const wrong = await resolve({ cookie: w.cookie }, conflict, 'this', 'Somebody');
    expect(wrong.status).toBe(400);
    expect(await errorOf(wrong)).toBe('confirm_mismatch');
    const ok = await resolve({ cookie: w.cookie }, conflict, 'this', `  ${t.name.toUpperCase()} `);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ kept: 'this', switched: false });
    expect(await telegramOf(w.pid)).toBe(String(t.tgId));
    expect(await deletedAt(t.pid)).not.toBeNull();
    expect(await count('saves WHERE player_id = ?1', t.pid)).toBe(0);
    expect(await count('saves WHERE player_id = ?1', w.pid)).toBe(1);
    // Single use.
    expect((await resolve({ cookie: w.cookie }, conflict, 'this', t.name)).status).toBe(404);
    expect((await devLogin(t.tgId)).playerId).toBe(w.pid);
  });

  it('keep other: the email moves to the Telegram account, the web account is deleted, and this browser is switched', async () => {
    const w = await webAccount();
    await giveProgress(w.pid, 2);
    const t = await tgAccount();
    await giveProgress(t.pid, 30);
    await linkUpTo(w, t);
    const { conflict } = await (await confirm({ cookie: w.cookie })).json<{ conflict: string }>();
    const ok = await resolve({ cookie: w.cookie }, conflict, 'other', w.name);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ kept: 'other', switched: true });
    const cookie = sidOf(ok)!;
    expect(await (await api('/api/account', { cookie })).json()).toMatchObject({ displayName: t.name });
    expect(await deletedAt(w.pid)).not.toBeNull();
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    expect(login.status).toBe(200);
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(t.pid);
    expect(await telegramOf(t.pid)).toBe(String(t.tgId));
  });

  it('purchases force the survivor; both with purchases is 409 contact_support', async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount();
    await givePurchase(t.pid);
    await linkUpTo(w, t);
    const { conflict } = await (await confirm({ cookie: w.cookie })).json<{ conflict: string }>();
    expect(await (await conflictOf({ cookie: w.cookie }, conflict)).json()).toMatchObject({ forced: 'other', reason: 'purchases' });
    const refused = await resolve({ cookie: w.cookie }, conflict, 'this', t.name);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe('forced_survivor');
    expect(await deletedAt(t.pid)).toBeNull();

    const w2 = await webAccount();
    await givePurchase(w2.pid);
    const t2 = await tgAccount();
    await givePurchase(t2.pid);
    await linkUpTo(w2, t2);
    const both = await confirm({ cookie: w2.cookie });
    expect(both.status).toBe(409);
    expect(await errorOf(both)).toBe('contact_support');
    expect(await telegramOf(w2.pid)).toBeNull();
    expect(await deletedAt(t2.pid)).toBeNull();
  });

  it('resolve needs a fresh re-auth, refuses a busy loser, and a conflict expires after 15 minutes', async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount();
    await giveProgress(t.pid);
    await linkUpTo(w, t);
    const { conflict } = await (await confirm({ cookie: w.cookie })).json<{ conflict: string }>();
    const now = Date.now();
    await DB()
      .prepare(
        `INSERT INTO battle_tickets (id, season_id, shard_id, player_id, loc, seed, setup, attackers, defenders, defender_kind, region_version, created_at, expires_at)
         VALUES (?1, 1, 1, ?2, 1, 1, '{}', '[]', '[]', 'npc', 0, ?3, ?4)`,
      )
      .bind(`l3busy2${t.pid}`, t.pid, now, now + 60_000)
      .run();
    const busy = await resolve({ cookie: w.cookie }, conflict, 'this', t.name);
    expect(busy.status).toBe(409);
    expect(await errorOf(busy)).toBe('busy_try_later');
    expect(await deletedAt(t.pid)).toBeNull();
    expect(await telegramOf(w.pid)).toBeNull();
    await staleReauth(w.pid);
    expect(await errorOf(await resolve({ cookie: w.cookie }, conflict, 'this', t.name))).toBe('reauth_required');
    await DB().prepare('UPDATE sessions SET reauth_at = ?2 WHERE player_id = ?1').bind(w.pid, Date.now()).run();
    forgetSessions(w.pid);
    await DB().prepare('UPDATE link_conflicts SET expires_at = ?2 WHERE id = ?1').bind(conflict, Date.now() - 1).run();
    const gone = await resolve({ cookie: w.cookie }, conflict, 'this', t.name);
    expect(gone.status).toBe(410);
    expect(await errorOf(gone)).toBe('conflict_expired');
  });
});

describe('email conflicts (ADR-0009 §5.2: the live email_conflict link plus the other account password)', () => {
  const addEmail = (a: Auth, email: string) => api('/api/account/email', { method: 'POST', ...a, json: { email, password: 'another-password-77' } });
  const proveOther = (token: string | null, password: string) =>
    api('/api/auth/verify/conflict', { method: 'POST', json: { token, password }, headers: { origin: GAME_ORIGIN, 'cf-connecting-ip': ip() } });

  async function conflictLink(t: { token: string }, w: { email: string }): Promise<string> {
    expect((await addEmail({ token: t.token }, w.email)).status).toBe(202);
    const mails = await mailTo(w.email, 2);
    expect(mails[1].subject).toMatch(/already has/i);
    return linkToken(mails[1])!;
  }

  it('the email link plus the other account password opens a conflict for the Telegram account, signed in on this browser', async () => {
    const w = await webAccount();
    await giveProgress(w.pid, 3);
    const t = await tgAccount();
    await giveProgress(t.pid, 8);
    const token = await conflictLink(t, w);
    const bad = await proveOther(token, 'not-the-password-1');
    expect(bad.status).toBe(401);
    expect(await errorOf(bad)).toBe('invalid_credentials');
    const r = await proveOther(token, PW);
    expect(r.status).toBe(200);
    const body = await r.json<{ conflict: string; player: { id: number } }>();
    expect(body.player.id).toBe(t.pid);
    const cookie = sidOf(r)!;
    // The link is spent.
    expect((await proveOther(token, PW)).status).toBe(400);
    const v = await (await conflictOf({ cookie }, body.conflict)).json<Record<string, unknown>>();
    expect(v).toMatchObject({ kind: 'email', this: { displayName: t.name, signIn: ['telegram'] }, other: { displayName: w.name, signIn: ['password'] } });
    const ok = await resolve({ cookie }, body.conflict, 'this', w.name);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ kept: 'this', switched: false });
    expect(await deletedAt(w.pid)).not.toBeNull();
    // The email (with the password just proven) now signs in to the Telegram account.
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(t.pid);
    expect(String((await botTo(t.tgId))[0].params.text)).toMatch(/email/i);
  });

  it('an empty email account is removed automatically', async () => {
    const w = await webAccount();
    const t = await tgAccount();
    await giveProgress(t.pid);
    const token = await conflictLink(t, w);
    const r = await proveOther(token, PW);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ purpose: 'add_email', removedEmpty: true, player: { id: t.pid } });
    expect(await deletedAt(w.pid)).not.toBeNull();
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(t.pid);
  });
});

describe('housekeeping', () => {
  it('prunes spent and expired link codes and expired conflicts', async () => {
    const w = await webAccount();
    await startLink({ cookie: w.cookie });
    const t = await tgAccount();
    const now = Date.now();
    await DB().batch([
      DB().prepare('UPDATE link_codes SET expires_at = ?2 WHERE player_id = ?1').bind(w.pid, now - 1),
      DB().prepare(`INSERT INTO link_conflicts (id, player_id, other_player_id, kind, created_at, expires_at) VALUES (?1, ?2, ?3, 'telegram', ?4, ?5)`).bind(`old${w.pid}`, w.pid, t.pid, now - 20 * MIN, now - 5 * MIN),
    ]);
    const out = await pruneLinks(DB(), now);
    expect(out.codes).toBeGreaterThanOrEqual(1);
    expect(out.conflicts).toBeGreaterThanOrEqual(1);
    expect(await count('link_codes WHERE player_id = ?1', w.pid)).toBe(0);
    expect(await count('link_conflicts WHERE player_id = ?1', w.pid)).toBe(0);
  });
});
