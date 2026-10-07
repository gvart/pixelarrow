/**
 * Pixelarrow Worker entry. Static assets (dist/) are served by the assets
 * layer; only /api/*, /ws/* and /admin run this code (assets.run_worker_first).
 * A daily cron (wrangler.jsonc triggers) prunes old client error reports.
 */
import { Hono, type Context } from 'hono';
import { readJson } from './body';
import { LIMITS, verifyBattle, VerifyBody } from './battle';
import type { AppEnv } from './env';
import { ApiError, errorBody } from './errors';
import { db, requireAuth, sessionFromToken } from './middleware';
import { getPlayer, publicPlayer } from './players';
import { auth } from './routes/auth';
import { save } from './routes/save';
import { entitlements, shop } from './routes/shop';
import { webhook } from './routes/webhook';
import { WS_PROTOCOL } from './region';
import { online } from './online/routes';
import { economy } from './economy/routes';
import { currentSeason, requireProfile, shardDoName } from './online/store';
import { notifyRoutes } from './notify/routes';
import { runScheduled } from './notify/jobs';
import { pruneClientErrors, telemetry } from './telemetry/routes';
import { logError, log } from './telemetry/log';
import { admin } from './admin/routes';
import { adminPage } from './admin/page';

// Only handlers and Durable Object classes may be exported from the entry module.
export { RegionDO } from './region';

const app = new Hono<AppEnv>();

// The Mini App is same-origin; this only matters for local tooling and Telegram web clients.
const ALLOWED_ORIGINS = new Set(['https://pixelarrow.app', 'https://web.telegram.org']);
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && ALLOWED_ORIGINS.has(origin) && c.req.method === 'OPTIONS') {
    c.res = new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type, x-pa-analytics, x-pa-platform, x-pa-version',
        'access-control-max-age': '86400',
        vary: 'origin',
      },
    });
    return;
  }
  await next();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.append('vary', 'origin');
  }
  c.res.headers.set('cache-control', 'no-store');
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    time: Date.now(),
    db: !!c.env.DB,
    secrets: {
      telegramBotToken: !!c.env.TELEGRAM_BOT_TOKEN,
      telegramWebhookSecret: !!c.env.TELEGRAM_WEBHOOK_SECRET,
      sessionSecret: !!c.env.SESSION_SECRET,
      adminToken: !!c.env.ADMIN_TOKEN,
    },
    analyticsEngine: !!c.env.ANALYTICS,
  }),
);

app.route('/api/auth', auth);

app.get('/api/me', requireAuth, async (c) => {
  const player = await getPlayer(db(c.env), c.get('session').pid);
  if (!player) throw new ApiError(404, 'not_found', 'Player not found');
  return c.json({ player: publicPlayer(player), session: { expiresAt: c.get('session').exp } });
});

app.route('/api/save', save);
app.route('/api/shop', shop);
app.route('/api/entitlements', entitlements);
app.route('/api/telegram', webhook);

app.route('/api/telemetry', telemetry);
app.route('/api/admin', admin);
app.route('/admin', adminPage);
app.get('/admin/', (c) => c.redirect('/admin', 301));

app.route('/api/online', online);
app.route('/api/economy', economy);
app.route('/api/notify', notifyRoutes);

app.post('/api/battle/verify', requireAuth, async (c) => {
  const req = await readJson(c, VerifyBody, LIMITS.maxBodyBytes);
  try {
    return c.json(verifyBattle(req));
  } catch (e) {
    throw new ApiError(422, 'sim_rejected', `The simulation rejected this battle: ${(e as Error).message ?? e}`);
  }
});

/** Session token from ?token=... or Sec-WebSocket-Protocol: pixelarrow.v1, <token>. */
async function wsSession(c: Context<AppEnv>) {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') throw new ApiError(426, 'upgrade_required', 'Expected a WebSocket upgrade');
  const protocols = (c.req.header('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromProtocol = protocols.includes(WS_PROTOCOL) ? protocols.find((p) => p !== WS_PROTOCOL) : undefined;
  const session = await sessionFromToken(c.env, fromProtocol ?? c.req.query('token') ?? null);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-player-id', String(session.pid));
  headers.set('x-player-name', session.name);
  if (fromProtocol) headers.set('x-ws-protocol', WS_PROTOCOL);
  else headers.delete('x-ws-protocol');
  return { session, headers };
}

app.get('/ws/region/:id', async (c) => {
  const region = c.req.param('id');
  const { headers } = await wsSession(c);
  if (!/^[a-z0-9_-]{1,40}$/.test(region) || region.startsWith('shard-')) throw new ApiError(400, 'bad_request', 'Bad region id');
  headers.set('x-region-id', region);
  headers.delete('x-season');
  headers.delete('x-shard');
  const stub = c.env.REGION.get(c.env.REGION.idFromName(region));
  return stub.fetch(new Request(c.req.url, { headers }));
});

/** The online shard of the player's current season: presence, duel lobby and lockstep relay. */
app.get('/ws/online', async (c) => {
  const { session, headers } = await wsSession(c);
  const d = db(c.env);
  const season = await currentSeason(d);
  const profile = await requireProfile(d, season.id, session.pid);
  const room = shardDoName({ season: season.id, id: profile.shard_id });
  headers.set('x-region-id', room);
  headers.set('x-season', String(season.id));
  headers.set('x-shard', String(profile.shard_id));
  const stub = c.env.REGION.get(c.env.REGION.idFromName(room));
  return stub.fetch(new Request(c.req.url, { headers }));
});

app.all('/api/*', () => {
  throw new ApiError(404, 'not_found', 'No such endpoint');
});

// Should not be reached (run_worker_first only covers /api/* and /ws/*), but keep static hosting intact.
app.all('*', async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json(errorBody('not_found', 'Not found'), 404)));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    if (err.status >= 500) log('warn', 'api_error', { status: err.status, code: err.code, method: c.req.method, path: c.req.routePath, message: err.message });
    return c.json(errorBody(err.code, err.message, err.extra), err.status as 400);
  }
  let pid: number | null = null;
  try {
    pid = c.get('session')?.pid ?? null;
  } catch {
    // no session
  }
  logError('http', err, { method: c.req.method, path: c.req.routePath, url: new URL(c.req.url).pathname.slice(0, 200), pid, ray: c.req.header('cf-ray') ?? null });
  return c.json(errorBody('internal', 'Internal error'), 500);
});

/** Daily housekeeping (cron HOUSEKEEPING_CRON): client error reports past their retention. */
const HOUSEKEEPING_CRON = '17 3 * * *';
async function housekeeping(env: AppEnv['Bindings']): Promise<void> {
  if (!env.DB) return;
  try {
    const pruned = await pruneClientErrors(env.DB);
    log('info', 'cron_pruned', { table: 'client_errors', rows: pruned });
  } catch (e) {
    logError('cron', e);
    throw e;
  }
}

export default {
  fetch: app.fetch,
  /**
   * Cron (wrangler.jsonc triggers): every 5 minutes bot notifications that
   * wait, season and income notices, bot setup; daily housekeeping.
   */
  scheduled(controller, env, ctx) {
    if (controller.cron === HOUSEKEEPING_CRON) ctx.waitUntil(housekeeping(env));
    else ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
