/**
 * Admin authentication (docs/OPS.md "Admin panel").
 *
 * The panel is a plain browser page outside Telegram, so it cannot use the
 * game's Telegram initData login. It uses a dedicated secret instead:
 * ADMIN_TOKEN holds one token, or comma-separated `name:token` pairs so each
 * operator has their own token and the audit log names them. A token must be
 * at least 32 characters (`openssl rand -hex 32`). Game session tokens are
 * never accepted here, so a stolen player session cannot reach the panel.
 *
 * Failed attempts are rate limited per IP (per isolate); comparisons are
 * constant time; every request is logged with the actor.
 */
import type { MiddlewareHandler } from 'hono';
import { safeEqual } from '../crypto';
import type { AppEnv, Env } from '../env';
import { ApiError, notConfigured } from '../errors';
import { bearer } from '../middleware';
import { overLimit, rateLimit } from '../rateLimit';
import { log } from '../telemetry/log';

export const MIN_ADMIN_TOKEN = 32;
export const ADMIN_FAILS_PER_10MIN = 10;

export interface AdminCredential {
  name: string;
  token: string;
}

/** Parses ADMIN_TOKEN; tokens shorter than MIN_ADMIN_TOKEN are ignored. */
export function adminCredentials(env: Env): AdminCredential[] {
  const raw = (env.ADMIN_TOKEN ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts
    .map((p, i) => {
      const at = p.indexOf(':');
      return at > 0 ? { name: p.slice(0, at).trim().slice(0, 32), token: p.slice(at + 1).trim() } : { name: parts.length > 1 ? `admin${i + 1}` : 'admin', token: p };
    })
    .filter((c) => c.token.length >= MIN_ADMIN_TOKEN && /^[A-Za-z0-9_.-]{1,32}$/.test(c.name));
}

/** The operator a token belongs to, or null. Checks every credential (no early exit). */
export function adminFor(env: Env, token: string | null): string | null {
  if (!token) return null;
  let who: string | null = null;
  for (const c of adminCredentials(env)) if (safeEqual(token, c.token) && who === null) who = c.name;
  return who;
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (adminCredentials(c.env).length === 0) throw notConfigured('ADMIN_TOKEN');
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  // An IP that failed too often is locked out for the window, even with a right token.
  if (overLimit(`admin:fail:${ip}`, ADMIN_FAILS_PER_10MIN, 600_000)) throw new ApiError(429, 'rate_limited', 'Too many failed admin logins');
  const who = adminFor(c.env, bearer(c));
  if (!who) {
    rateLimit(`admin:fail:${ip}`, ADMIN_FAILS_PER_10MIN, 600_000);
    log('warn', 'admin_auth_failed', { ip, path: c.req.path });
    throw new ApiError(401, 'unauthorized', 'Admin token required');
  }
  c.set('admin', who);
  log('info', 'admin_request', { actor: who, method: c.req.method, path: c.req.path });
  await next();
};
