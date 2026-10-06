import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Env } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, secret } from '../middleware';
import { displayName, publicPlayer, upsertPlayer } from '../players';
import { rateLimit } from '../rateLimit';
import { signSession } from '../session';
import { validateInitData, type TelegramUser } from '../telegramAuth';

const MAX_BODY = 8 * 1024;
/** Per-IP, per-isolate: at most AUTH_LIMIT logins per AUTH_WINDOW_MS. */
export const AUTH_LIMIT = 20;
const AUTH_WINDOW_MS = 60_000;

const Body = z.union([
  z.object({ initData: z.string().min(1).max(MAX_BODY) }),
  z.object({
    dev: z.object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      username: z.string().max(64).optional(),
      first_name: z.string().max(128).optional(),
      language_code: z.string().max(16).optional(),
    }),
  }),
]);

/**
 * DEV_AUTH=1 comes only from the local .dev.vars (never set it as a Worker
 * secret or var). Note `wrangler dev` rewrites the request host to the route's
 * domain, so the host cannot be used to tell local from production.
 */
function devAuthAllowed(env: Env): boolean {
  return env.DEV_AUTH === '1';
}

export const auth = new Hono<AppEnv>();

auth.post('/telegram', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (!rateLimit(`auth:${ip}`, AUTH_LIMIT, AUTH_WINDOW_MS)) {
    throw new ApiError(429, 'rate_limited', 'Too many login attempts, slow down');
  }
  const sessionSecret = secret(c.env, 'SESSION_SECRET');

  // Accept either JSON { initData } or the raw initData string as the body.
  let body: z.infer<typeof Body>;
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('application/json')) {
    const text = await c.req.text();
    if (text.length > MAX_BODY) throw new ApiError(413, 'too_large', 'Body too large');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw badRequest('Body is not valid JSON');
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) throw badRequest('Expected { initData: string }');
    body = parsed.data;
  } else {
    const text = (await c.req.text()).trim();
    if (!text || text.length > MAX_BODY) throw badRequest('Expected the Telegram WebApp initData string');
    body = { initData: text };
  }

  let user: TelegramUser;
  if ('dev' in body) {
    if (!devAuthAllowed(c.env)) throw new ApiError(403, 'forbidden', 'Dev auth is disabled');
    user = body.dev;
  } else {
    const botToken = secret(c.env, 'TELEGRAM_BOT_TOKEN');
    const result = await validateInitData(body.initData, botToken);
    if (!result.ok) throw new ApiError(401, 'invalid_init_data', `initData rejected: ${result.reason}`);
    user = result.user;
  }

  const player = await upsertPlayer(db(c.env), user);
  const { token, session } = await signSession({ pid: player.id, tg: player.telegram_id, name: displayName(player) }, sessionSecret);
  return c.json({ token, expiresAt: session.exp, player: publicPlayer(player) });
});
