/**
 * /api/account/* (ADR-0009 key interfaces). Every route needs a session and
 * acts on the caller's own player only. Cookie requests are covered by the
 * app-wide Origin check (auth/origin.ts).
 *
 * V6-LINK-01: the summary, renames and the public-boards opt-out.
 * V6-LINK-02: re-auth, add and change email, unlink and deletion. Every
 * sensitive route (*) needs a proof from the last 10 minutes (reauth.ts), else
 * `401 reauth_required`.
 *
 *   POST   /reauth              {password} | {initData}  → {reauthUntil}
 *   POST   /email             * {email, password}        → 202 {status: 'check_email'}
 *   POST   /email/change      * {email}                  → 202 {status: 'check_email'}
 *   DELETE /identities/:kind   * (telegram | password)    → {ok: true, signedOut}
 *   DELETE /                  * {confirm: 'DELETE'}      → {status: 'done' | 'resumable'}
 *
 * V6-LINK-03: web → Telegram linking and conflicts (link.ts, conflicts.ts).
 *
 *   POST   /link/telegram          *                      → {code, expiresAt, deepLink}
 *   DELETE /link/telegram                                   → {ok} ("Not me": the session's code goes)
 *   GET    /link/telegram/:code      (Mini App)             → {displayName, emailMasked, conflict}
 *   POST   /link/telegram/complete   (Mini App) {initData}  → {status: 'awaiting_web'}
 *   GET    /link/telegram/status     (creating session)     → {status, expiresAt?, telegram?, conflict?}
 *   POST   /link/telegram/confirm  * (creating session)     → {linked, removedEmpty?} | {conflict}
 *   GET    /conflict/:id           *                      → {kind, this, other, forced?, reason?, expiresAt}
 *   POST   /conflict/:id/resolve   * {keep, confirm}        → {kept, switched}
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { clientIp, db, requireSession, secret } from '../middleware';
import { createSession, deviceLabel, forgetSessions } from '../auth/sessions';
import { peppersFromEnv } from '../auth/password';
import { clearSessionCookie, sessionCookie } from '../auth/cookies';
import { deleteAccount } from './delete';
import { reauthWithInitData, reauthWithPassword, requireReauth } from './reauth';
import { requestAddEmail, requestChangeEmail } from './email';
import { flowDeps, notifier } from '../routes/auth';
import { unlinkIdentity } from './unlink';
import { noticeTargets, sendNoticeBot, sendNoticeEmail } from './notices';
import { validateDisplayName } from '../names/validate';
import { getPlayer, nameKeyHeld, setDisplayName, type PlayerRow } from '../players';
import { requireLimit } from '../rateLimit';
import { accountSummary, nameStatus } from './summary';
import { cancelLink, completeLinkCode, confirmLink, createLinkCode, deepLinkFor, linkStatus, peekLinkCode } from './link';
import { conflictView, resolveConflict } from './conflicts';
import { resolveBot } from '../online/clans';

export const account = new Hono<AppEnv>();
account.use('*', requireSession);

async function me(d: D1Database, pid: number): Promise<PlayerRow> {
  const p = await getPlayer(d, pid);
  if (!p) throw new ApiError(404, 'not_found', 'Player not found');
  return p;
}

account.get('/', async (c) => {
  const d = db(c.env);
  const now = Date.now();
  return c.json(await accountSummary(d, await me(d, c.get('session').pid), now));
});

const NameBody = z.object({ name: z.string().max(64) });

account.put('/name', async (c) => {
  const pid = c.get('session').pid;
  // Each try reveals whether a name is taken or allowed: keep probing slow.
  // RL_AUTH_IP (10 / 60 s), shared by every isolate in the location, not the per-isolate map (V6-041).
  await requireLimit(c.env.RL_AUTH_IP, `rename:${pid}`);
  const body = await readJson(c, NameBody, 1024);
  const v = validateDisplayName(body.name);
  // One message for every reason: the client words each reason itself, and the blocklist is never shown.
  if (!v.ok) throw new ApiError(400, 'invalid_name', "This name isn't allowed", { reason: v.reason });
  const d = db(c.env);
  const now = Date.now();
  const p = await me(d, pid);
  if (v.name === p.display_name) return c.json({ displayName: p.display_name, name: await nameStatus(d, p, now) });
  const status = await nameStatus(d, p, now);
  if (status.lockedUntil !== null) throw new ApiError(423, 'locked', 'Your name was reset by a moderator', { lockedUntil: status.lockedUntil });
  if (status.nextChangeAt !== null) throw new ApiError(429, 'cooldown', 'You changed your name recently', { nextChangeAt: status.nextChangeAt });
  const taken = () => new ApiError(409, 'taken', 'That name is taken, or too close to one that is');
  if (v.key !== p.display_name_key && (await nameKeyHeld(d, v.key, pid, now))) throw taken();
  let changed: boolean;
  try {
    changed = await setDisplayName(d, pid, v.name, v.key, now, { admin: false });
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw taken();
    throw e;
  }
  const after = await me(d, pid);
  const fresh = await nameStatus(d, after, now);
  // Refused by the guard: a concurrent rename or an admin lock won the race.
  if (!changed) throw new ApiError(429, 'cooldown', 'You changed your name recently', { nextChangeAt: fresh.nextChangeAt ?? fresh.lockedUntil });
  forgetSessions(pid);
  return c.json({ displayName: after.display_name, name: fresh });
});

const BoardsBody = z.object({ enabled: z.boolean() });

account.put('/public-boards', async (c) => {
  const body = await readJson(c, BoardsBody, 256);
  await db(c.env).prepare('UPDATE players SET public_boards = ?2 WHERE id = ?1').bind(c.get('session').pid, body.enabled ? 1 : 0).run();
  return c.json({ publicBoards: body.enabled });
});

// ---- V6-LINK-02 ----

const ReauthBody = z.union([z.object({ password: z.string().max(4096) }).strict(), z.object({ initData: z.string().min(1).max(8 * 1024) }).strict()]);

account.post('/reauth', async (c) => {
  const s = c.get('session');
  // Before any hash or HMAC (N-PW-2): the location-wide per-account limit; the D1 lockout follows for passwords.
  await requireLimit(c.env.RL_AUTH_IP, `reauth:${s.pid}`, 'Too many attempts, try again in a minute');
  const body = await readJson(c, ReauthBody, 10 * 1024);
  const d = db(c.env);
  const reauthUntil =
    'password' in body
      ? await reauthWithPassword(d, peppersFromEnv(c.env), s, body.password)
      : await reauthWithInitData(d, secret(c.env, 'TELEGRAM_BOT_TOKEN'), s, body.initData);
  return c.json({ reauthUntil });
});

const CHECK_EMAIL = { status: 'check_email' } as const;
const AddEmailBody = z.object({ email: z.string().max(320), password: z.string().max(4096) });
const ChangeEmailBody = z.object({ email: z.string().max(320) });

/** Telegram → web (ADR-0009 §2): no Turnstile (the caller is signed in and re-authed; the Mini App can't run it). */
account.post('/email', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const body = await readJson(c, AddEmailBody, 8 * 1024);
  await requestAddEmail(flowDeps(c), s, body.email, body.password);
  return c.json(CHECK_EMAIL, 202);
});

account.post('/email/change', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const body = await readJson(c, ChangeEmailBody, 1024);
  await requestChangeEmail(flowDeps(c), s, body.email);
  return c.json(CHECK_EMAIL, 202);
});

account.delete('/identities/:kind', async (c) => {
  const s = c.get('session');
  const kind = c.req.param('kind');
  if (kind !== 'telegram' && kind !== 'password') throw new ApiError(400, 'bad_request', 'Unknown sign-in method');
  requireReauth(s);
  const d = flowDeps(c);
  const out = await unlinkIdentity(d.db, notifier(c, d), s, kind);
  if (out.signedOut && s.transport === 'cookie') c.header('set-cookie', clearSessionCookie());
  return c.json({ ok: true, signedOut: out.signedOut });
});

const DeleteBody = z.object({ confirm: z.string().max(32) });

/** ADR-0009 §7: immediate and irreversible; idempotent (a retry resumes or does nothing). */
account.delete('/', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const body = await readJson(c, DeleteBody, 256);
  if (body.confirm !== 'DELETE') throw new ApiError(400, 'confirm_required', 'Type DELETE to confirm');
  const d = flowDeps(c);
  const to = await noticeTargets(d.db, s.pid);
  const acceptLanguage = c.req.header('accept-language');
  const result = await deleteAccount(c.env, s.pid, 'self', d.now, {
    // LINK-04's hook: the confirmation is sent before the identities go (ADR-0009 §7). A failure is logged, never fatal.
    beforeRevoke: async (emails) => {
      for (const addr of emails) await sendNoticeEmail(d.mail, 'account_deleted', addr, to.languageCode, acceptLanguage);
    },
  });
  // The chat id was read before the run; the bot can still reach it once.
  if (result !== 'busy' && to.telegramId !== null) d.defer(sendNoticeBot(c.env, 'account_deleted', to.telegramId, to.languageCode).catch(() => undefined));
  if (result === 'busy') throw new ApiError(409, 'busy_try_later', "You're in a live match, queue or battle. Finish it, then try again");
  if (s.transport === 'cookie') c.header('set-cookie', clearSessionCookie());
  return c.json({ status: result });
});

// ---- V6-LINK-03: web → Telegram link codes and conflicts (ADR-0009 §3, §5) ----

const peppers = (c: Context<AppEnv>) => () => peppersFromEnv(c.env);
/** Code lookups and the Mini App step: the location-wide per-IP gate (codes are 128-bit; this keeps guessing and HMAC work slow). */
const linkGate = (c: Context<AppEnv>) => requireLimit(c.env.RL_AUTH_IP, `link:${clientIp(c)}`, 'Too many attempts, try again in a minute');

account.post('/link/telegram', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const out = await createLinkCode(db(c.env), s, Date.now());
  const deepLink = deepLinkFor(await resolveBot(c.env), c.env.TELEGRAM_APP_NAME || 'play', out.code);
  c.header('cache-control', 'no-store');
  return c.json({ ...out, deepLink });
});

account.delete('/link/telegram', async (c) => {
  await cancelLink(db(c.env), c.get('session'));
  return c.json({ ok: true });
});

account.get('/link/telegram/status', async (c) => c.json(await linkStatus(db(c.env), c.get('session'), Date.now())));

const CompleteBody = z.object({ initData: z.string().min(1).max(8 * 1024) });

account.post('/link/telegram/complete', async (c) => {
  await linkGate(c);
  const body = await readJson(c, CompleteBody, 10 * 1024);
  return c.json(await completeLinkCode(db(c.env), secret(c.env, 'TELEGRAM_BOT_TOKEN'), peppers(c), body.initData, Date.now()));
});

account.post('/link/telegram/confirm', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const d = flowDeps(c);
  return c.json(await confirmLink(c.env, peppers(c), notifier(c, d), s, d.now));
});

// After the fixed paths above: the Mini App's look at a code.
account.get('/link/telegram/:code', async (c) => {
  await linkGate(c);
  return c.json(await peekLinkCode(db(c.env), c.get('session'), c.req.param('code'), Date.now()));
});

account.get('/conflict/:id', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  return c.json(await conflictView(db(c.env), s.pid, c.req.param('id'), Date.now()));
});

const ResolveBody = z.object({ keep: z.enum(['this', 'other']), confirm: z.string().max(64) });

/** Keeps one account (ADR-0009 §5.2); when the kept one isn't this session's, a cookie session for it replaces this one. */
account.post('/conflict/:id/resolve', async (c) => {
  const s = c.get('session');
  requireReauth(s);
  const body = await readJson(c, ResolveBody, 1024);
  const d = flowDeps(c);
  const out = await resolveConflict(c.env, notifier(c, d), s.pid, c.req.param('id'), body.keep, body.confirm, d.now);
  const switched = out.survivor !== s.pid;
  if (switched && s.transport === 'cookie') {
    // This session's player was just deleted; the person proved both accounts. The new session carries no fresh re-auth.
    const { token } = await createSession(d.db, out.survivor, 'cookie', 'password', deviceLabel(c.req.header('user-agent')), d.now, null);
    c.header('set-cookie', sessionCookie(token));
    c.header('cache-control', 'no-store');
  }
  return c.json({ kept: out.kept, switched });
});
