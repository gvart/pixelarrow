/**
 * Pixelarrow Worker entry. Static assets (dist/) are served by the assets
 * layer; only /api/* and /ws/* run this code (assets.run_worker_first).
 */
import { Hono } from 'hono';
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
        'access-control-allow-headers': 'authorization, content-type',
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
    },
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

app.post('/api/battle/verify', requireAuth, async (c) => {
  const req = await readJson(c, VerifyBody, LIMITS.maxBodyBytes);
  try {
    return c.json(verifyBattle(req));
  } catch (e) {
    throw new ApiError(422, 'sim_rejected', `The simulation rejected this battle: ${(e as Error).message ?? e}`);
  }
});

app.get('/ws/region/:id', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') throw new ApiError(426, 'upgrade_required', 'Expected a WebSocket upgrade');
  const region = c.req.param('id');
  if (!/^[a-z0-9_-]{1,40}$/.test(region)) throw new ApiError(400, 'bad_request', 'Bad region id');

  // Token: ?token=... or Sec-WebSocket-Protocol: pixelarrow.v1, <token>
  const protocols = (c.req.header('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromProtocol = protocols.includes(WS_PROTOCOL) ? protocols.find((p) => p !== WS_PROTOCOL) : undefined;
  const session = await sessionFromToken(c.env, fromProtocol ?? c.req.query('token') ?? null);

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-player-id', String(session.pid));
  headers.set('x-player-name', session.name);
  headers.set('x-region-id', region);
  if (fromProtocol) headers.set('x-ws-protocol', WS_PROTOCOL);
  else headers.delete('x-ws-protocol');
  const stub = c.env.REGION.get(c.env.REGION.idFromName(region));
  return stub.fetch(new Request(c.req.url, { headers }));
});

app.all('/api/*', () => {
  throw new ApiError(404, 'not_found', 'No such endpoint');
});

// Should not be reached (run_worker_first only covers /api/* and /ws/*), but keep static hosting intact.
app.all('*', async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json(errorBody('not_found', 'Not found'), 404)));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(errorBody(err.code, err.message, err.extra), err.status as 400);
  console.error('unhandled', err);
  return c.json(errorBody('internal', 'Internal error'), 500);
});

export default app satisfies ExportedHandler<AppEnv['Bindings']>;
