import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Env } from '../env';
import { ApiError, badRequest } from '../errors';
import { clientIp, db, secret } from '../middleware';
import { bannedError } from '../ban';
import { displayName, getPlayerByTelegramId, publicPlayer, upsertPlayer, type PlayerRow } from '../players';
import { optedOut, requestCtx, writeEvent } from '../telemetry/analytics';
import { requireRate } from '../rateLimit';
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
  requireRate(`auth:${clientIp(c)}`, AUTH_LIMIT, AUTH_WINDOW_MS, 'Too many login attempts, slow down');
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

  const d = db(c.env);
  const prev = await getPlayerByTelegramId(d, user.id);
  if (prev?.banned_at) throw bannedError();
  const now = Date.now();
  const player = await upsertPlayer(d, user, now);
  if (!optedOut(c) && !prev?.analytics_opt_out) {
    for (const event of retentionEvents(prev, now)) writeEvent(c.env, requestCtx(c, player.id, 'server', daysSince(player.created_at, now)), event, {});
  }
  const { token, session } = await signSession({ pid: player.id, tg: player.telegram_id, name: displayName(player) }, sessionSecret);
  return c.json({ token, expiresAt: session.exp, player: publicPlayer(player) });
});

const DAY_MS = 86_400_000;
const utcDay = (ms: number) => Math.floor(ms / DAY_MS);
export const daysSince = (createdAt: number, now: number) => utcDay(now) - utcDay(createdAt);

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
