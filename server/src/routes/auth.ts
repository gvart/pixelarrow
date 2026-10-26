import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Env } from '../env';
import { ApiError, badRequest } from '../errors';
import { clientIp, db, requireSession } from '../middleware';
import { bannedError } from '../ban';
import { publicPlayer, type PlayerRow } from '../players';
import { playerByTelegramIdentity, upsertTelegramPlayer } from '../auth/identity';
import { isBanTombstoned } from '../account/banTombstone';
import { clearSessionCookie, sessionCookie } from '../auth/cookies';
import { createSession, deviceLabel, listSessions, revokeAll, revokeSession, type Method } from '../auth/sessions';
import { changePassword, confirmReset, login, requestReset, resendSignup, signup, tokenPurpose, verifySignup, type EmailPurpose, type FlowDeps } from '../auth/flows';
import { verifyAddEmail, verifyChangeEmail } from '../account/email';
import { bindWebSession, proveEmailConflict } from '../account/conflicts';
import { notifierFor, type Notifier } from '../account/notices';
import { peppersFromEnv } from '../auth/password';
import { emailSenderFor } from '../email/sender';
import { pickLang } from '../email/templates';
import { readJson } from '../body';
import { gameOrigins, gameUrl } from '../urls';
import type { Context, MiddlewareHandler } from 'hono';
import { optedOut, requestCtx, writeEvent } from '../telemetry/analytics';
import { requireLimit } from '../rateLimit';
import { requireTurnstile } from '../auth/turnstile';

const MAX_BODY = 8 * 1024;

/** The dev player to sign in as (DEV_AUTH=1 only): the war sandbox and world view sign in this way. */
const Body = z.object({
  dev: z.object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    username: z.string().max(64).optional(),
    first_name: z.string().max(128).optional(),
    language_code: z.string().max(16).optional(),
  }),
});

/**
 * DEV_AUTH=1 comes only from the local .dev.vars (never set it as a Worker
 * secret or var). Note `wrangler dev` rewrites the request host to the route's
 * domain, so the host cannot be used to tell local from production.
 */
function devAuthAllowed(env: Env): boolean {
  return env.DEV_AUTH === '1';
}

export const auth = new Hono<AppEnv>();

/**
 * Dev sign-in (DEV_AUTH=1, local only): `{ dev: { id, first_name } }` signs in
 * the dev player with that id, made on first use. The Telegram Mini App login
 * (initData) is gone; the path stays because the war dev pages call it.
 */
auth.post('/telegram', async (c) => {
  if (!devAuthAllowed(c.env)) throw new ApiError(403, 'forbidden', 'Dev auth is disabled');
  const text = await c.req.text();
  if (text.length > MAX_BODY) throw new ApiError(413, 'too_large', 'Body too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest('Body is not valid JSON');
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw badRequest('Expected { dev: { id } }');
  const user = parsed.data.dev;
  const now = Date.now();

  const d = db(c.env);
  if ((await playerByTelegramIdentity(d, user.id))?.banned_at) throw bannedError();
  // A deleted banned player's Telegram id stays refused for 180 days (ADR-0009 §7.7).
  if (await isBanTombstoned(d, () => peppersFromEnv(c.env), 'telegram', String(user.id), now)) throw bannedError();
  const { prev, player } = await upsertTelegramPlayer(d, user, now);
  if (!optedOut(c) && !prev?.analytics_opt_out) {
    for (const event of retentionEvents(prev, now)) writeEvent(c.env, requestCtx(c, player.id, 'server', daysSince(player.created_at, now)), event, {});
  }
  // A bearer session: the war dev pages send it as a header and a socket subprotocol.
  const { token, session } = await createSession(d, player.id, 'bearer', 'telegram', deviceLabel(c.req.header('user-agent')), now, now);
  return c.json({ token, expiresAt: session.expiresAt, player: publicPlayer(player) });
});

/** Ends this session; a cookie session also gets its cookie cleared. */
auth.post('/logout', requireSession, async (c) => {
  const s = c.get('session');
  await revokeSession(db(c.env), s.pid, s.sid);
  if (s.transport === 'cookie') c.header('set-cookie', clearSessionCookie());
  return c.json({ ok: true });
});

/** Ends every session of the player, this one included. */
auth.post('/logout-all', requireSession, async (c) => {
  const s = c.get('session');
  await revokeAll(db(c.env), s.pid);
  if (s.transport === 'cookie') c.header('set-cookie', clearSessionCookie());
  return c.json({ ok: true });
});

/** The player's signed-in devices: a 12-character handle each, never the token or its hash. */
auth.get('/sessions', requireSession, async (c) => {
  const s = c.get('session');
  return c.json({ sessions: await listSessions(db(c.env), s.pid, s.sid) });
});

/** Ends one of the player's sessions by its handle. */
auth.delete('/sessions/:handle', requireSession, async (c) => {
  const s = c.get('session');
  const handle = c.req.param('handle');
  if (!/^[A-Za-z0-9_-]{12}$/.test(handle)) throw badRequest('Bad session handle');
  if (!(await revokeSession(db(c.env), s.pid, handle))) throw new ApiError(404, 'not_found', 'No such session');
  if (s.transport === 'cookie' && s.sid.startsWith(handle)) c.header('set-cookie', clearSessionCookie());
  return c.json({ ok: true });
});

// ---- Email and password (V6-ACCT-03; ADR-0008 §4) ----
//
// Gate order (M-AF-1, ADR-0008 §2): Origin → Rate Limiting binding per IP
// (RL_AUTH_IP, `<route>:<ip>`) → Turnstile (forms without a link token) → D1
// throttle and lockout (auth/flows.ts) → the password hash. Each gate is
// cheaper than the next, so a flood never reaches the hash or D1.

const AUTH_BODY = 8 * 1024;
const Email = z.string().max(320);
/** Long enough that the policy (not zod) answers too_long; never truncated. */
const Password = z.string().max(4096);
/** Required: a missing token is `400 turnstile_failed` from requireTurnstile, like a bad one. 2048 is Turnstile's maximum. */
const Turnstile = z.string().max(2048).optional();
const Token = z.string().max(128);

const SignupBody = z.object({ email: Email, password: Password, turnstile: Turnstile });
const EmailBody = z.object({ email: Email, turnstile: Turnstile });
const LoginBody = z.object({ email: Email, password: Password, turnstile: Turnstile });
const TokenBody = z.object({ token: Token });
const ResetConfirmBody = z.object({ token: Token, password: Password });
const ChangeBody = z.object({ current: Password, next: Password });

export function flowDeps(c: Context<AppEnv>): FlowDeps {
  return {
    db: db(c.env),
    peppers: peppersFromEnv(c.env),
    mail: emailSenderFor(c.env),
    gameUrl: gameUrl(c.env),
    lang: pickLang(c.req.header('accept-language')),
    defer: (p) => c.executionCtx.waitUntil(p),
    now: Date.now(),
  };
}

/** A fresh cookie session for the web (rotation on every log-in, ADR-0008 §3). */
async function cookieSession(
  c: Context<AppEnv>,
  player: PlayerRow,
  method: Method,
  purpose?: EmailPurpose,
  extra: Record<string, unknown> = {},
  bind?: (sid: string) => Promise<void>,
) {
  const { token, session } = await createSession(db(c.env), player.id, 'cookie', method, deviceLabel(c.req.header('user-agent')));
  if (bind) await bind(session.sid);
  c.header('set-cookie', sessionCookie(token));
  c.header('cache-control', 'no-store');
  return c.json({ ...(purpose ? { purpose } : {}), ...extra, player: publicPlayer(player), expiresAt: session.expiresAt });
}

/** The email and bot notices of identity changes (account/notices.ts), sent after the response. */
export function notifier(c: Context<AppEnv>, d: FlowDeps): Notifier {
  return notifierFor(c.env, d.mail, d.defer, c.req.header('accept-language'));
}

const CHECK_EMAIL = { status: 'check_email' } as const;

/** The per-IP gate for the email forms (ADR-0008 §5.1). */
const ipGate = (c: Context<AppEnv>, route: string) => requireLimit(c.env.RL_AUTH_IP, `${route}:${clientIp(c)}`, 'Too many attempts, try again in a minute');

/**
 * The email forms are posted only by the web game, from its own origin. A
 * foreign or missing Origin is 403 `bad_origin` even without a cookie: it
 * stops login CSRF (a cross-site form signing the victim into the attacker's
 * account through login, verify or reset/confirm, which set the cookie).
 */
const fromGame: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!gameOrigins(c.env).includes(c.req.header('origin') ?? '')) throw new ApiError(403, 'bad_origin', 'Cross-origin request refused');
  await next();
};

/** Always 202 for a well-formed request, whether or not the address has an account (M-AF-3). */
auth.post('/signup', fromGame, async (c) => {
  await ipGate(c, 'signup');
  const body = await readJson(c, SignupBody, AUTH_BODY);
  await requireTurnstile(c.env, body.turnstile, 'signup', clientIp(c));
  await signup(flowDeps(c), body.email, body.password);
  return c.json(CHECK_EMAIL, 202);
});

/**
 * Opens an email link and signs this browser in: a sign-up creates the
 * account; add_email and change_email (V6-LINK-02, ADR-0009 §2, §4) change
 * the identities of an existing one. The reply names the purpose.
 */
auth.post('/verify', fromGame, async (c) => {
  await ipGate(c, 'verify'); // no Turnstile: the link token is the proof
  const body = await readJson(c, TokenBody, AUTH_BODY);
  const d = flowDeps(c);
  const purpose = await tokenPurpose(d, body.token);
  if (purpose === 'add_email') return cookieSession(c, await verifyAddEmail(d, notifier(c, d), body.token), 'email_link', purpose);
  if (purpose === 'change_email') return cookieSession(c, await verifyChangeEmail(d, notifier(c, d), body.token), 'email_link', purpose);
  // Sign-up, and everything else (a reset token, an unknown or spent one) answers as an invalid sign-up link.
  return cookieSession(c, await verifySignup(d, body.token), 'email_link', 'signup');
});

const ConflictProofBody = z.object({ token: Token, password: Password });

/**
 * V6-LINK-03 (ADR-0009 §5.2): an add_email link that answered 409
 * email_conflict, plus the password of the address's own account. Signs this
 * browser in to the Telegram player that asked, with `{conflict}` to choose
 * from, or `{removedEmpty}` when the other account was empty and is gone.
 */
auth.post('/verify/conflict', fromGame, async (c) => {
  await ipGate(c, 'verify');
  const body = await readJson(c, ConflictProofBody, AUTH_BODY);
  const d = flowDeps(c);
  const { player, ...extra } = await proveEmailConflict(c.env, d, notifier(c, d), body.token, body.password);
  // The conflict's web side is this browser's new session (V6-053); the Telegram owner chooses in the Mini App.
  return cookieSession(c, player, 'email_link', 'add_email', extra, extra.conflict ? (sid) => bindWebSession(d.db, extra.conflict!, sid) : undefined);
});

auth.post('/verify/resend', fromGame, async (c) => {
  await ipGate(c, 'resend');
  const body = await readJson(c, EmailBody, AUTH_BODY);
  await requireTurnstile(c.env, body.turnstile, 'resend', clientIp(c));
  await resendSignup(flowDeps(c), body.email);
  return c.json(CHECK_EMAIL, 202);
});

/** One `401 invalid_credentials` for an unknown email, a wrong password and a locked address. */
auth.post('/login', fromGame, async (c) => {
  await ipGate(c, 'login');
  const body = await readJson(c, LoginBody, AUTH_BODY);
  await requireTurnstile(c.env, body.turnstile, 'login', clientIp(c));
  const player = await login(flowDeps(c), body.email, body.password);
  return cookieSession(c, player, 'password');
});

auth.post('/reset/request', fromGame, async (c) => {
  await ipGate(c, 'reset');
  const body = await readJson(c, EmailBody, AUTH_BODY);
  await requireTurnstile(c.env, body.turnstile, 'reset', clientIp(c));
  await requestReset(flowDeps(c), body.email);
  return c.json(CHECK_EMAIL, 202);
});

/** Sets the new password, signs out everywhere, and signs this browser in. */
auth.post('/reset/confirm', fromGame, async (c) => {
  await ipGate(c, 'reset'); // no Turnstile: the link token is the proof
  const body = await readJson(c, ResetConfirmBody, AUTH_BODY);
  const player = await confirmReset(flowDeps(c), body.token, body.password);
  return cookieSession(c, player, 'email_link');
});

/** Changes the password of a signed-in player; every other session ends. */
auth.post('/password', requireSession, async (c) => {
  const body = await readJson(c, ChangeBody, AUTH_BODY);
  await changePassword(flowDeps(c), c.get('session'), body.current, body.next);
  return c.json({ ok: true });
});

const DAY_MS = 86_400_000;
const utcDay = (ms: number) => Math.floor(ms / DAY_MS);
const daysSince = (createdAt: number, now: number) => utcDay(now) - utcDay(createdAt);

/**
 * Retention markers from the player row as it was before this sign-in:
 * "install" for a new player; "return_d1" / "return_d7" on the first sign-in
 * of UTC calendar day 1 / 7 after the install day.
 */
export function retentionEvents(prev: Pick<PlayerRow, 'created_at' | 'last_seen_at'> | null, now: number): ('install' | 'return_d1' | 'return_d7')[] {
  if (!prev) return ['install'];
  if (utcDay(now) <= utcDay(prev.last_seen_at)) return [];
  const d = daysSince(prev.created_at, now);
  return d === 1 ? ['return_d1'] : d === 7 ? ['return_d7'] : [];
}
