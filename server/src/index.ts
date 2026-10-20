/**
 * Pixelarrow Worker entry. Static assets (dist/) are served by the assets
 * layer; only /api/*, /ws/* and /admin run this code (assets.run_worker_first).
 * A daily cron (wrangler.jsonc triggers) prunes old client error reports.
 */
import { Hono, type Context } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { readJson } from './body';
import { LIMITS, verifyBattle, VerifyBody } from './battle';
import type { AppEnv } from './env';
import { ApiError, errorBody, unauthorized } from './errors';
import { assertPlayable, credentials, db, requirePlayable, requireSession } from './middleware';
import { originCheck } from './auth/origin';
import { WAR_REGIONS } from './war/regions';
import { war } from './war/routes';
import { worldApi, worldStub } from './war/world/routes';
import { allianceOf } from './war/world/members';
import { lookupSession, pruneAuth } from './auth/sessions';
import { finishDeletions } from './account/delete';
import { pruneLinks } from './account/cron';
import { gameOrigins } from './urls';
import { getPlayer, publicPlayer } from './players';
import { auth } from './routes/auth';
import { account } from './account/routes';
import { save } from './routes/save';
import { entitlements, shop } from './routes/shop';
import { webhook } from './routes/webhook';
import { checkSocketSimVersion } from './simVersion';
import { SIM_VERSION_CLOSE, SIM_VERSION_REJECTED } from '../../src/online/protocol';
import { online } from './online/routes';
import { economy } from './economy/routes';
import { duel } from './duel/routes';
import { requireDuelProfile } from './duel/store';
import { notifyRoutes } from './notify/routes';
import { runScheduled } from './notify/jobs';
import { buildPublicSnapshot } from './public/snapshot';
import { PUBLIC_PREFIX, publicRoute, readSnapshot, type SnapshotRow } from './public/routes';
import { pruneClientErrors, telemetry } from './telemetry/routes';
import { logError, log } from './telemetry/log';
import { admin } from './admin/routes';
import { adminPage } from './admin/page';

/** WebSocket subprotocol; the session token may ride along as a second protocol entry. */
const WS_PROTOCOL = 'pixelarrow.v1';

// Only handlers, Durable Object classes and entrypoints may be exported from the entry module.
export { MatchmakerDO } from './duel/matchmaker';
export { DuelDO } from './duel/duelDO';
export { WarRegionDO } from './war/regionDO';
export { WarWorldDO } from './war/world/worldDO';

/**
 * The landing Worker's way in (ADR-0010 §4): its GAME service binding names
 * this entrypoint, so the call never crosses the internet and needs no IP
 * limit. Same row as GET /api/public/v1/summary; null before the first
 * snapshot (or without D1), which the landing treats as unavailable.
 */
export class PublicApi extends WorkerEntrypoint<AppEnv['Bindings']> {
  async summary(): Promise<SnapshotRow | null> {
    return this.env.DB ? readSnapshot(this.env.DB) : null;
  }
}

const app = new Hono<AppEnv>();

/**
 * Play may be framed by itself and by Telegram Web, which shows the Mini App
 * in an iframe (ADR-0007); never X-Frame-Options. Responses that set their own
 * policy (the admin page: frame-ancestors 'none') keep it. The game's static
 * HTML gets the same header from public/_headers.
 */
const FRAMING = "frame-ancestors 'self' https://web.telegram.org";
app.use('*', async (c, next) => {
  await next();
  if (c.res.status === 101 || c.res.headers.has('content-security-policy')) return; // 101: rebuilding would drop the socket
  c.res = new Response(c.res.body, c.res); // asset responses have immutable headers
  c.res.headers.set('content-security-policy', FRAMING);
});

// The game and its API are same-origin on play (ADR-0007); this only matters for
// Telegram web clients and local tooling. Never the apex, never credentials.
const TELEGRAM_WEB = 'https://web.telegram.org';
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowed = !!origin && (origin === TELEGRAM_WEB || gameOrigins(c.env).includes(origin));
  if (allowed && c.req.method === 'OPTIONS') {
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
  if (allowed) {
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.append('vary', 'origin');
  }
  c.res.headers.set('cache-control', 'no-store');
});
app.use('/api/*', originCheck);
app.use('/ws/*', originCheck);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    time: Date.now(),
    db: !!c.env.DB,
    secrets: {
      telegramBotToken: !!c.env.TELEGRAM_BOT_TOKEN,
      telegramWebhookSecret: !!c.env.TELEGRAM_WEBHOOK_SECRET,
      adminToken: !!c.env.ADMIN_TOKEN,
    },
    analyticsEngine: !!c.env.ANALYTICS,
  }),
);

app.route('/api/auth', auth);

app.get('/api/me', requireSession, async (c) => {
  const player = await getPlayer(db(c.env), c.get('session').pid);
  if (!player) throw new ApiError(404, 'not_found', 'Player not found');
  return c.json({ player: publicPlayer(player), session: { expiresAt: c.get('session').expiresAt, transport: c.get('session').transport } });
});

app.route('/api/account', account);
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
app.route('/api/duel', duel);
app.route('/api/notify', notifyRoutes);
app.route('/api/war/world', worldApi);
app.route('/api/war', war);

app.post('/api/battle/verify', requirePlayable, async (c) => {
  const req = await readJson(c, VerifyBody, LIMITS.maxBodyBytes);
  try {
    return c.json(verifyBattle(req));
  } catch (e) {
    if (e instanceof ApiError) throw e; // 426 sim_version_unsupported
    throw new ApiError(422, 'sim_rejected', `The simulation rejected this battle: ${(e as Error).message ?? e}`);
  }
});

/** A socket the server will not serve (a sim version it does not run): opened only to say why, then closed. */
class SocketRefused extends Error {
  constructor(
    readonly reason: ApiError,
    readonly protocol: string | null,
  ) {
    super(reason.message);
  }
}

/** The browser cannot read an HTTP error on an upgrade, so the refusal is an `error` frame and close SIM_VERSION_CLOSE. */
function refuseSocket(r: SocketRefused): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ type: 'error', code: r.reason.code, message: r.reason.message }));
  server.close(SIM_VERSION_CLOSE, r.reason.code);
  const headers = new Headers();
  if (r.protocol) headers.set('sec-websocket-protocol', r.protocol);
  return new Response(null, { status: 101, webSocket: client, headers });
}

/**
 * The socket's session (ADR-0008 §3): the web's cookie (the same-origin upgrade
 * sends it; originCheck has already matched the Origin), or Telegram's bearer
 * token in `Sec-WebSocket-Protocol: pixelarrow.v1, <token>`. Never `?token=`.
 * The player must be playable (M-OG-1). `?sim=` must be SIM_VERSION, else the
 * socket is refused.
 */
async function wsSession(c: Context<AppEnv>) {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') throw new ApiError(426, 'upgrade_required', 'Expected a WebSocket upgrade');
  const protocols = (c.req.header('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const offered = protocols.includes(WS_PROTOCOL);
  const cred = credentials(c, (offered ? protocols.find((p) => p !== WS_PROTOCOL) : undefined) ?? null);
  if (!cred) throw unauthorized();
  const session = await lookupSession(db(c.env), cred.token, cred.transport);
  if (!session) throw unauthorized();
  assertPlayable(session);
  try {
    checkSocketSimVersion(c.req.query('sim'));
  } catch (e) {
    if (e instanceof ApiError && e.code === SIM_VERSION_REJECTED) throw new SocketRefused(e, offered ? WS_PROTOCOL : null);
    throw e;
  }
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-player-id', String(session.pid));
  headers.set('x-player-name', session.name);
  if (offered) headers.set('x-ws-protocol', WS_PROTOCOL);
  else headers.delete('x-ws-protocol');
  return { session, headers };
}

/** The war world map (M4, server/src/war/world/): snapshots pushed, transfer orders; protocol src/war/net/world.ts. */
app.get('/ws/war/world', async (c) => {
  const { session, headers } = await wsSession(c);
  headers.set('x-alliance', String((await allianceOf(db(c.env), session.pid)) ?? ''));
  return worldStub(c.env).fetch(new Request(c.req.url, { headers }));
});

/** A live war region (M3, server/src/war/): the region's WarRegionDO runs the sim; protocol src/war/net/protocol.ts. */
app.get('/ws/war/:region', async (c) => {
  const region = c.req.param('region');
  const { headers } = await wsSession(c);
  if (!WAR_REGIONS.includes(region)) throw new ApiError(404, 'not_found', 'No such war region');
  headers.set('x-region-id', region);
  const stub = c.env.WAR_REGION.get(c.env.WAR_REGION.idFromName(region));
  return stub.fetch(new Request(c.req.url, { headers }));
});

/** Dev only (DEV_AUTH=1): the region's tick times and bandwidth (scripts/war/loadtest.mjs). */
app.get('/api/war/:region/stats', async (c) => {
  const region = c.req.param('region');
  if (c.env.DEV_AUTH !== '1' || !WAR_REGIONS.includes(region)) throw new ApiError(404, 'not_found', 'No such endpoint');
  const stub = c.env.WAR_REGION.get(c.env.WAR_REGION.idFromName(region));
  return c.json(await (await stub.fetch(new Request(`https://war/${region}/stats`))).json());
});

/** The global duel queue (ranked and unranked): needs a duel profile. */
app.get('/ws/duel', async (c) => {
  const { session, headers } = await wsSession(c);
  await requireDuelProfile(db(c.env), session.pid);
  const stub = c.env.MATCHMAKER.get(c.env.MATCHMAKER.idFromName('global'));
  return stub.fetch(new Request(c.req.url, { headers }));
});

/** One live match (its DuelDO checks that the player is in it). */
app.get('/ws/duel/:match', async (c) => {
  const match = c.req.param('match');
  if (!/^[0-9a-f]{32}$/.test(match)) throw new ApiError(400, 'bad_request', 'Bad match id');
  const { headers } = await wsSession(c);
  const stub = c.env.DUEL.get(c.env.DUEL.idFromName(match));
  return stub.fetch(new Request(c.req.url, { headers }));
});

app.all('/api/*', () => {
  throw new ApiError(404, 'not_found', 'No such endpoint');
});

// Should not be reached (run_worker_first only covers /api/* and /ws/*), but keep static hosting intact.
app.all('*', async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json(errorBody('not_found', 'Not found'), 404)));

app.onError((err, c) => {
  if (err instanceof SocketRefused) return refuseSocket(err);
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

/** Daily housekeeping (cron HOUSEKEEPING_CRON): client error reports past their retention; expired sessions, email tokens and idle throttle rows; interrupted account deletions (ADR-0009 §7); expired link codes and conflicts (§3, §5). */
const HOUSEKEEPING_CRON = '17 3 * * *';
async function housekeeping(env: AppEnv['Bindings']): Promise<void> {
  if (!env.DB) return;
  try {
    const pruned = await pruneClientErrors(env.DB);
    log('info', 'cron_pruned', { table: 'client_errors', rows: pruned });
    log('info', 'cron_pruned', { table: 'auth', ...(await pruneAuth(env.DB)) });
    log('info', 'cron_deletions', await finishDeletions(env));
    log('info', 'cron_pruned', { table: 'links', ...(await pruneLinks(env.DB)) });
  } catch (e) {
    logError('cron', e);
    throw e;
  }
}

/** The landing page's stats snapshot (ADR-0010 §2), every 5 minutes. A failed run keeps the last good snapshot. */
async function publicSnapshot(env: AppEnv['Bindings'], now: number): Promise<void> {
  if (!env.DB) return;
  try {
    await buildPublicSnapshot(env, now);
  } catch (e) {
    logError('cron', e, { step: 'public snapshot' });
  }
}

export default {
  // /api/public/* never enters the Hono app: no session, CORS or Origin middleware (ADR-0010 §1, §5).
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith(PUBLIC_PREFIX)) return publicRoute(request, env);
    return app.fetch(request, env, ctx);
  },
  /**
   * Cron (wrangler.jsonc triggers): every 5 minutes bot notifications that
   * wait, season and income notices, bot setup, the public stats snapshot;
   * daily housekeeping.
   */
  scheduled(controller, env, ctx) {
    if (controller.cron === HOUSEKEEPING_CRON) ctx.waitUntil(housekeeping(env));
    else {
      ctx.waitUntil(runScheduled(env, controller.scheduledTime));
      ctx.waitUntil(publicSnapshot(env, controller.scheduledTime));
    }
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
