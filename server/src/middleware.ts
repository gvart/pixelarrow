import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from './env';
import { assertNotBanned } from './ban';
import { notConfigured, unauthorized } from './errors';
import { verifySession, type Session } from './session';

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
