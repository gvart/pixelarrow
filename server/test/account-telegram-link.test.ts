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
import { day1Only } from '../src/account/conflicts';

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
async function mailTo(to: string, count = 1, timeoutMs = 30_000): Promise<Mail[]> {
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
  const until = Date.now() + 30_000;
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
/** A cloud save with exactly `data` (an object is stored as JSON, a string as is). */
async function giveSave(pid: number, data: object | string): Promise<void> {
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  await DB().prepare('INSERT INTO saves (player_id, revision, version, data, size, updated_at) VALUES (?1, 1, 1, ?2, ?3, ?4)').bind(pid, raw, raw.length, Date.now()).run();
}
/** What the Mini App uploads on its first launch (and after the tutorial): campaign day 1, no battle fought. */
const DAY1 = { v: 6, gold: 160, won: 0, fought: 0, heroes: [{}, {}, {}, {}, {}, {}, {}, {}], stash: [{}, {}, {}], world: { time: 8 } };
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
/** The Mini App side (V6-053): each call carries a fresh initData from a new launch (no start_param). */
const tgConflicts = async (t: { token: string; tgId: number }) =>
  api('/api/account/conflict/telegram', { method: 'POST', token: t.token, json: { initData: await initDataFor(t.tgId, null) }, headers: { 'cf-connecting-ip': ip() } });
const tgChoose = async (t: { token: string; tgId: number }, id: string, keep: 'telegram' | 'web') =>
  api(`/api/account/conflict/${id}/telegram`, { method: 'POST', token: t.token, json: { initData: await initDataFor(t.tgId, null), keep }, headers: { 'cf-connecting-ip': ip() } });
const tgCancel = async (t: { token: string; tgId: number }, startParam: string | null = null) =>
  api('/api/account/link/telegram/cancel', { method: 'POST', token: t.token, json: { initData: await initDataFor(t.tgId, startParam) }, headers: { 'cf-connecting-ip': ip() } });

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

describe('conflicts (ADR-0009 §5 as amended by V6-053; M-LK-5..8, N-LK-1, N-LK-4)', () => {
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

  it('V6-LINK-07: an other account with only a day-1 save (the Mini App first launch) counts as empty: no conflict, its save goes', async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount();
    await giveSave(t.pid, DAY1);
    await linkUpTo(w, t);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ linked: true, removedEmpty: true });
    expect(await telegramOf(w.pid)).toBe(String(t.tgId));
    expect(await deletedAt(t.pid)).not.toBeNull();
    expect(await count('saves WHERE player_id = ?1', t.pid)).toBe(0);
    expect(await count('saves WHERE player_id = ?1', w.pid)).toBe(1);
  });

  it('day1Only: day 1 with no battle fought or won, every field a number; anything else or unknown is progress', () => {
    expect(day1Only({ hours: 8, won: 0, fought: 0 })).toBe(true);
    expect(day1Only({ hours: 0, won: 0, fought: 0 })).toBe(true);
    expect(day1Only({ hours: 23.9, won: 0, fought: 0 })).toBe(true);
    expect(day1Only({ hours: 24, won: 0, fought: 0 })).toBe(false);
    expect(day1Only({ hours: 8, won: 1, fought: 1 })).toBe(false);
    expect(day1Only({ hours: 8, won: 0, fought: 1 })).toBe(false);
    expect(day1Only({ hours: null, won: 0, fought: 0 })).toBe(false);
    expect(day1Only({ hours: 8, won: null, fought: 0 })).toBe(false);
    expect(day1Only({ hours: 8, won: 0, fought: undefined })).toBe(false);
    expect(day1Only({ hours: '8', won: 0, fought: 0 })).toBe(false);
    expect(day1Only({ hours: -1, won: 0, fought: 0 })).toBe(false);
  });

  /** Web player W (progress) and Telegram player T (progress) up to an open conflict. */
  async function openConflict(wWon = 9, tWon = 4): Promise<{ w: Awaited<ReturnType<typeof webAccount>>; t: Awaited<ReturnType<typeof tgAccount>>; conflict: string }> {
    const w = await webAccount();
    await giveProgress(w.pid, wWon);
    const t = await tgAccount();
    await giveProgress(t.pid, tWon);
    await linkUpTo(w, t);
    const r = await confirm({ cookie: w.cookie });
    expect(r.status).toBe(200);
    const { conflict } = await r.json<{ conflict: string }>();
    return { w, t, conflict };
  }

  it('both with progress: the conflict shows both sides and the bot asks the Telegram owner; nothing is linked yet', async () => {
    const { w, t, conflict } = await openConflict();
    expect(conflict).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await (await status({ cookie: w.cookie })).json()).toEqual({ status: 'conflict', conflict });
    expect(await telegramOf(w.pid)).toBeNull();
    const v = await (await conflictOf({ cookie: w.cookie }, conflict)).json<Record<string, unknown>>();
    expect(v).toMatchObject({
      kind: 'telegram',
      this: { displayName: w.name, signIn: ['password'], campaignDay: 7, heroes: 3, duelRating: null, war: null, purchases: false },
      other: { displayName: t.name, signIn: ['telegram'], purchases: false },
      choices: { web: null, telegram: null },
    });
    expect(v.forced).toBeUndefined();
    // The Mini App side sees which web account asks and both summaries.
    const mini = await tgConflicts(t);
    expect(mini.status).toBe(200);
    expect(await mini.json()).toMatchObject({
      conflicts: [{ id: conflict, kind: 'telegram', telegram: { displayName: t.name }, web: { displayName: w.name, emailMasked: expect.stringMatching(/^w\*\*\*@/) } }],
    });
    expect(String((await botTo(t.tgId))[0].params.text)).toMatch(/choose/i);
    // Another session of W, or another player, can't see it.
    const other = sidOf(await form('/api/auth/login', { email: w.email, password: PW }))!;
    expect((await conflictOf({ cookie: other }, conflict)).status).toBe(404);
    expect((await conflictOf({ cookie: (await webAccount()).cookie }, conflict)).status).toBe(404);
  });

  it("(a) an attacker's code plus the victim's one tap on complete: the attacker can't resolve from the web alone", async () => {
    // The attacker's web account, the victim's Telegram account with progress.
    const { w: attacker, t: victim, conflict } = await openConflict(2, 40);
    for (const keep of ['other', 'this'] as const) {
      const name = keep === 'this' ? victim.name : attacker.name;
      const r = await resolve({ cookie: attacker.cookie }, conflict, keep, name);
      if (keep === 'other') expect(r.status).toBe(202);
      else expect(await errorOf(r)).toBe('already_chosen');
    }
    expect(await (await resolve({ cookie: attacker.cookie }, conflict, 'other', attacker.name)).json()).toEqual({ status: 'waiting_telegram' });
    // The initData of the victim's tap on complete is refused as a choice (replay), and so is the attacker's own Telegram.
    const code = (await DB().prepare('SELECT init_hash FROM link_codes WHERE player_id = ?1').bind(attacker.pid).first<{ init_hash: string }>())!.init_hash;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const own = await tgAccount();
    expect(await errorOf(await tgChoose(own, conflict, 'web'))).toBe('wrong_account');
    // Nothing deleted, nothing attached: the attacker's email is not on the victim's account (N-LK-4).
    expect(await deletedAt(victim.pid)).toBeNull();
    expect(await deletedAt(attacker.pid)).toBeNull();
    expect(await count(`auth_identities WHERE player_id = ?1 AND kind = 'password'`, victim.pid)).toBe(0);
    expect(await telegramOf(attacker.pid)).toBeNull();
    // The victim says "Not me": the conflict ends and the attacker is told.
    expect((await tgCancel(victim)).status).toBe(200);
    expect(await errorOf(await resolve({ cookie: attacker.cookie }, conflict, 'other', attacker.name))).toBe('link_cancelled');
    expect(await (await status({ cookie: attacker.cookie })).json()).toEqual({ status: 'cancelled' });
    expect(await count(`auth_identities WHERE player_id = ?1 AND kind = 'password'`, victim.pid)).toBe(0);
  });

  it("the initData that completed the code can't be replayed as the Telegram choice", async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount();
    await giveProgress(t.pid);
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    const tap = await initDataFor(t.tgId, `link_${code}`);
    expect((await complete({ token: t.token }, tap)).status).toBe(200);
    const { conflict } = await (await confirm({ cookie: w.cookie })).json<{ conflict: string }>();
    const r = await api(`/api/account/conflict/${conflict}/telegram`, { method: 'POST', token: t.token, json: { initData: tap, keep: 'web' }, headers: { 'cf-connecting-ip': ip() } });
    expect(r.status).toBe(401);
    expect(await errorOf(r)).toBe('init_data_reused');
    const stale = await api(`/api/account/conflict/${conflict}/telegram`, { method: 'POST', token: t.token, json: { initData: await initDataFor(t.tgId, null, 11 * 60), keep: 'web' }, headers: { 'cf-connecting-ip': ip() } });
    expect(await errorOf(stale)).toBe('init_data_expired');
  });

  it('(b) both sides choose to keep the web account: Telegram moves to it and the other is deleted', async () => {
    const { w, t, conflict } = await openConflict();
    const wrong = await resolve({ cookie: w.cookie }, conflict, 'this', 'Somebody');
    expect(await errorOf(wrong)).toBe('confirm_mismatch');
    expect((await resolve({ cookie: w.cookie }, conflict, 'this', `  ${t.name.toUpperCase()} `)).status).toBe(202);
    expect(await telegramOf(w.pid)).toBeNull();
    expect(await (await tgChoose(t, conflict, 'web')).json()).toEqual({ status: 'waiting_web' });
    // Still nothing until the web completes the agreed choice.
    expect(await deletedAt(t.pid)).toBeNull();
    expect(await (await conflictOf({ cookie: w.cookie }, conflict)).json()).toMatchObject({ choices: { web: 'this', telegram: 'this' } });
    const ok = await resolve({ cookie: w.cookie }, conflict, 'this', t.name);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'resolved', kept: 'this', switched: false });
    expect(await telegramOf(w.pid)).toBe(String(t.tgId));
    expect(await deletedAt(t.pid)).not.toBeNull();
    expect(await count('saves WHERE player_id = ?1', t.pid)).toBe(0);
    expect(await count('saves WHERE player_id = ?1', w.pid)).toBe(1);
    expect((await resolve({ cookie: w.cookie }, conflict, 'this', t.name)).status).toBe(404);
    expect((await devLogin(t.tgId)).playerId).toBe(w.pid);
  });

  it('(b) the Telegram owner chooses first to keep the Telegram account: the email moves to it only then, and this browser is switched', async () => {
    const { w, t, conflict } = await openConflict(2, 30);
    expect((await tgChoose(t, conflict, 'telegram')).status).toBe(200);
    expect(await count(`auth_identities WHERE player_id = ?1 AND kind = 'password'`, t.pid)).toBe(0);
    const ok = await resolve({ cookie: w.cookie }, conflict, 'other', w.name);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'resolved', kept: 'other', switched: true });
    const cookie = sidOf(ok)!;
    expect(await (await api('/api/account', { cookie })).json()).toMatchObject({ displayName: t.name });
    expect(await deletedAt(w.pid)).not.toBeNull();
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(t.pid);
    expect(await telegramOf(t.pid)).toBe(String(t.tgId));
  });

  it('(c) the two sides disagree: nothing happens and the conflict ends', async () => {
    const { w, t, conflict } = await openConflict();
    expect((await resolve({ cookie: w.cookie }, conflict, 'this', t.name)).status).toBe(202);
    const r = await tgChoose(t, conflict, 'telegram');
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe('choices_differ');
    expect(await errorOf(await resolve({ cookie: w.cookie }, conflict, 'this', t.name))).toBe('conflict_expired');
    expect(await deletedAt(w.pid)).toBeNull();
    expect(await deletedAt(t.pid)).toBeNull();
    expect(await telegramOf(w.pid)).toBeNull();
    expect(await count(`auth_identities WHERE player_id = ?1 AND kind = 'password'`, t.pid)).toBe(0);
  });

  it('(d) the Mini App cancel works before complete, after complete and during a conflict; the owner is told and it counts toward the code limit', async () => {
    const throttle = async (pid: number) =>
      (await DB().prepare('SELECT count FROM auth_throttle WHERE key = ?1').bind(`linkcode:${pid}`).first<{ count: number }>())?.count ?? 0;
    // Before complete: whoever holds the code can cancel it.
    const w = await webAccount();
    const t = await tgAccount();
    const { code } = await (await startLink({ cookie: w.cookie })).json<{ code: string }>();
    const before = await throttle(w.pid);
    expect(await (await tgCancel(t, `link_${code}`)).json()).toEqual({ cancelled: 1 });
    expect(await throttle(w.pid)).toBe(before + 1);
    expect(await (await status({ cookie: w.cookie })).json()).toEqual({ status: 'cancelled' });
    expect((await complete({ token: t.token }, await initDataFor(t.tgId, `link_${code}`))).status).toBe(410);
    expect((await mailTo(w.email, 2))[1].subject).toMatch(/cancelled/i);
    // After complete.
    const w2 = await webAccount();
    await linkUpTo(w2, t);
    expect(await (await tgCancel(t)).json()).toEqual({ cancelled: 1 });
    expect((await confirm({ cookie: w2.cookie })).status).toBe(410);
    // During a conflict.
    const { w: w3, t: t3, conflict } = await openConflict();
    expect((await resolve({ cookie: w3.cookie }, conflict, 'this', t3.name)).status).toBe(202);
    expect(await (await tgCancel(t3)).json()).toEqual({ cancelled: 1 });
    expect(await errorOf(await tgChoose(t3, conflict, 'web'))).toBe('link_cancelled');
    expect(await deletedAt(t3.pid)).toBeNull();
    expect(await telegramOf(w3.pid)).toBeNull();
  });

  it('(e) the empty-player check: every kind of progress makes it a conflict', async () => {
    const now = Date.now();
    const kinds: Record<string, (pid: number) => Promise<unknown>> = {
      'a cloud save past day 1 (even with no battle won)': (pid) => giveProgress(pid, 0),
      'a day-1 save with a battle fought': (pid) => giveSave(pid, { v: 6, won: 0, fought: 1, gold: 140, heroes: [{}], world: { time: 9 } }),
      'a day-1 save with a battle won': (pid) => giveSave(pid, { v: 6, won: 1, fought: 1, heroes: [{}], world: { time: 9 } }),
      'an unreadable save': (pid) => giveSave(pid, '{not json'),
      'a purchase': givePurchase,
      'an entitlement': (pid) => DB().prepare(`INSERT INTO entitlements (player_id, product_id, granted_at) VALUES (?1, 'founder', ?2)`).bind(pid, now).run(),
      'a duel profile': (pid) => DB().prepare(`INSERT INTO duel_profiles (player_id, glory, next_id, team, formations, created_at, updated_at) VALUES (?1, 0, 1, '[]', '[]', ?2, ?2)`).bind(pid, now).run(),
      'a duel rating': (pid) => DB().prepare(`INSERT INTO duel_ratings (player_id, updated_at) VALUES (?1, ?2)`).bind(pid, now).run(),
      'a war profile': (pid) =>
        DB()
          .prepare(
            `INSERT INTO online_profiles (season_id, player_id, shard_id, gold, food, wood, bronze, recruits, energy, energy_at, next_id, formations, home_loc, army_loc, created_at, updated_at)
             VALUES (9999, ?1, 1, 0, 0, 0, 0, 0, 0, ?2, 1, '[]', 1, 1, ?2, ?2)`,
          )
          .bind(pid, now)
          .run(),
      'a clan': async (pid) => {
        const clan = await DB().prepare(`INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (9999, 1, ?1, ?2, ?3, ?4) RETURNING id`).bind(`L3 Clan ${pid}`, `T${pid}`.slice(0, 6), pid, now).first<{ id: number }>();
        await DB().prepare(`INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (9999, ?1, ?2, 'leader', ?3)`).bind(pid, clan!.id, now).run();
      },
      'Drachmae': (pid) =>
        DB().batch([
          DB().prepare('INSERT INTO wallets (player_id, drachmae, updated_at) VALUES (?1, 5, ?2)').bind(pid, now),
          DB().prepare(`INSERT INTO drachmae_ledger (player_id, delta, kind, ref, created_at) VALUES (?1, 5, 'admin', 'l3', ?2)`).bind(pid, now),
        ]),
    };
    for (const [what, give] of Object.entries(kinds)) {
      const w = await webAccount();
      const t = await tgAccount();
      await give(t.pid);
      await linkUpTo(w, t);
      const r = await confirm({ cookie: w.cookie });
      expect(r.status, what).toBe(200);
      expect(Object.keys(await r.json<object>()), what).toEqual(['conflict']);
      expect(await deletedAt(t.pid), what).toBeNull();
    }
  });

  it('purchases force the survivor on both sides; both with purchases is 409 contact_support', async () => {
    const w = await webAccount();
    await giveProgress(w.pid);
    const t = await tgAccount();
    await givePurchase(t.pid);
    await linkUpTo(w, t);
    const { conflict } = await (await confirm({ cookie: w.cookie })).json<{ conflict: string }>();
    expect(await (await conflictOf({ cookie: w.cookie }, conflict)).json()).toMatchObject({ forced: 'other', reason: 'purchases' });
    expect(await errorOf(await resolve({ cookie: w.cookie }, conflict, 'this', t.name))).toBe('forced_survivor');
    expect(await errorOf(await tgChoose(t, conflict, 'web'))).toBe('forced_survivor');
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

  it('the email link plus the other password opens a conflict; it resolves only when the Telegram owner agrees in the Mini App', async () => {
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
    expect((await proveOther(token, PW)).status).toBe(400);
    const v = await (await conflictOf({ cookie }, body.conflict)).json<Record<string, unknown>>();
    expect(v).toMatchObject({ kind: 'email', this: { displayName: t.name, signIn: ['telegram'] }, other: { displayName: w.name, signIn: ['password'] } });
    // The Telegram player's own Mini App session is not the bound web side.
    expect((await conflictOf({ token: t.token }, body.conflict)).status).toBe(404);
    expect((await resolve({ cookie }, body.conflict, 'this', w.name)).status).toBe(202);
    expect(await deletedAt(w.pid)).toBeNull();
    expect(await (await tgChoose(t, body.conflict, 'telegram')).json()).toEqual({ status: 'waiting_web' });
    const ok = await resolve({ cookie }, body.conflict, 'this', w.name);
    expect(await ok.json()).toEqual({ status: 'resolved', kept: 'this', switched: false });
    expect(await deletedAt(w.pid)).not.toBeNull();
    const login = await form('/api/auth/login', { email: w.email, password: PW });
    expect((await login.json<{ player: { id: number } }>()).player.id).toBe(t.pid);
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
