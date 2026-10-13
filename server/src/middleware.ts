import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from './env';
import { assertNotBanned } from './ban';
import { ApiError, notConfigured, unauthorized } from './errors';
import { verifySession, type Session } from './session';
import { gameOrigins } from './urls';

type SecretName = 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_WEBHOOK_SECRET' | 'SESSION_SECRET';

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

/** Session token from `Authorization: Bearer <token>`. */
export function bearer(c: Context): string | null {
  const h = c.req.header('authorization');
  const m = h ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  return m ? m[1] : null;
}

export async function sessionFromToken(env: Env, token: string | null): Promise<Session> {
  const sessionSecret = secret(env, 'SESSION_SECRET');
  if (!token) throw unauthorized();
  const s = await verifySession(token, sessionSecret);
  if (!s) throw unauthorized();
  await assertNotBanned(env.DB, s.pid);
  return s;
}

/** Requires a valid session; exposes it as c.get('session'). */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('session', await sessionFromToken(c.env, bearer(c)));
  await next();
};

/** The web session cookie (ADR-0007, ADR-0008): host-only on play. */
export const SESSION_COOKIE = '__Host-pa_sid';
const HAS_SESSION_COOKIE = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=`);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard (ADR-0007, ADR-0008): a request that carries the session cookie
 * and changes state (an unsafe method or a WebSocket upgrade) must come from
 * the game's origin or a dev origin, else 403. Requests without the cookie
 * (bearer tokens, anonymous) are exempt. Scaffold: cookie sessions arrive in
 * V6-ACCT-02, which finishes this check.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  const upgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';
  const cookie = HAS_SESSION_COOKIE.test(c.req.header('cookie') ?? '');
  if (cookie && (upgrade || !SAFE_METHODS.has(c.req.method)) && !gameOrigins(c.env).includes(c.req.header('origin') ?? '')) {
    throw new ApiError(403, 'bad_origin', 'Cross-origin request refused');
  }
  await next();
};
