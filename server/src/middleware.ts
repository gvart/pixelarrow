import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from './env';
import { ApiError, notConfigured, unauthorized } from './errors';
import { readSessionCookie } from './auth/cookies';
import { lookupSession, type Session, type Transport } from './auth/sessions';

type SecretName = 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_WEBHOOK_SECRET';

/** A secret's value, or a 503 "<NAME> not configured". */
export function secret(env: Env, name: SecretName): string {
  const v = env[name];
  if (!v) throw notConfigured(name);
  return v;
}

/** The D1 binding, or a 503 "database not configured" (D1_DATABASE_ID unset at deploy). */
export function db(env: Env): D1Database {
  if (!env.DB) throw notConfigured('database');
  return env.DB;
}

/** The client IP Cloudflare reports, or 'unknown'. */
export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

/** The token from `Authorization: Bearer <token>` (sessions and the admin token). */
export function bearer(c: Context): string | null {
  const h = c.req.header('authorization');
  const m = h ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  return m ? m[1] : null;
}

/**
 * The session token and how it arrived (ADR-0008 §3): the `__Host-pa_sid`
 * cookie, or a bearer token (the `Authorization` header; sockets pass it in
 * `Sec-WebSocket-Protocol`). One transport per request: both is 400
 * `two_transports`. A token in the URL (`?token=`) is never read and is
 * refused with 400 `token_in_url`, because URLs end up in logs. Null when the
 * request carries neither.
 */
export function credentials(c: Context, bearerToken: string | null = bearer(c)): { token: string; transport: Transport } | null {
  if (c.req.query('token') !== undefined) throw new ApiError(400, 'token_in_url', 'Session tokens are never accepted in the URL');
  const cookie = readSessionCookie(c.req.header('cookie'));
  if (cookie !== null && (bearerToken !== null || c.req.header('authorization') !== undefined)) {
    throw new ApiError(400, 'two_transports', 'Send the session cookie or a bearer token, not both');
  }
  if (cookie !== null) return { token: cookie, transport: 'cookie' };
  if (bearerToken !== null) return { token: bearerToken, transport: 'bearer' };
  return null;
}

/** The request's live session, else 401 (403 `banned` for a banned player). */
export async function sessionOf(c: Context<AppEnv>, bearerToken: string | null = bearer(c)): Promise<Session> {
  const cred = credentials(c, bearerToken);
  if (!cred) throw unauthorized();
  const s = await lookupSession(db(c.env), cred.token, cred.transport);
  if (!s) throw unauthorized();
  return s;
}

/**
 * 403 `not_playable` unless the player has a log-in identity (ADR-0008 §7).
 * Bans (403) and deleted players (401) are already refused by the lookup.
 */
export function assertPlayable(s: Session): Session {
  if (!s.hasIdentity) throw new ApiError(403, 'not_playable', 'This account cannot play online');
  return s;
}

/** Any valid session (`/api/me`, `/api/save`, `/api/account/*`, `/api/auth/*`); exposes it as c.get('session'). */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', await sessionOf(c));
  await next();
};

/** A valid session whose player may play online: every online route and socket (M-OG-1). */
export const requirePlayable: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', assertPlayable(await sessionOf(c)));
  await next();
};
