import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { gameOrigins } from '../urls';
import { hasSessionCookie } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard (ADR-0007, ADR-0008 §3, M-SE-3): a request that carries the
 * session cookie and changes state (POST, PUT, PATCH, DELETE or a WebSocket
 * upgrade) must come from the game's origin or a dev origin; a foreign or
 * missing Origin is 403 `bad_origin`. Requests without the cookie (bearer
 * tokens, anonymous) are exempt: a browser cannot attach a bearer token
 * cross-site, and a cross-site page cannot read one.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  const upgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';
  if (hasSessionCookie(c.req.header('cookie')) && (upgrade || !SAFE_METHODS.has(c.req.method)) && !gameOrigins(c.env).includes(c.req.header('origin') ?? '')) {
    throw new ApiError(403, 'bad_origin', 'Cross-origin request refused');
  }
  await next();
};
