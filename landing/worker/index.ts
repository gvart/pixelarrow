// The landing Worker for pixelarrow.app (ADR-0007, ADR-0010 §3–§4). Static assets are served without
// it; it runs first only for "/" and "/api/public/*" (landing/wrangler.jsonc). It holds no secrets,
// no D1 and no Durable Objects, and forwards nothing from the visitor to the game.

const PLAY_URL = 'https://play.pixelarrow.app/';
const SUMMARY_PATH = '/api/public/v1/summary';
/** A second cache key that keeps the last good snapshot for 24 h, served when the game fails. */
const LAST_GOOD_PATH = '/api/public/v1/summary/__last-good';
const LAST_GOOD_TTL_S = 24 * 60 * 60;
const GAME_TIMEOUT_MS = 3000;

/** The game Worker's `PublicApi` RPC entrypoint, reached through the GAME service binding (ADR-0010 §4). */
export interface PublicApi {
  summary(): Promise<{ body: string; generatedAt: number } | null>;
}

export interface Env {
  ASSETS: Fetcher;
  GAME: PublicApi;
  RL_LANDING_PUBLIC: RateLimit;
}

/** The landing is never framed (ADR-0007); static assets get the same from public/_headers. */
function secured(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  out.headers.set('X-Content-Type-Options', 'nosniff');
  return out;
}

function json(body: string, cacheControl: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl, ...extra },
  });
}

/** The snapshot body from the game, or null on an error, a timeout, "warming" or anything but a v1 body. */
async function snapshotFromGame(env: Env): Promise<string | null> {
  let timer: number | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), GAME_TIMEOUT_MS); });
  try {
    const snap = await Promise.race([env.GAME.summary(), timeout]);
    if (!snap) return null;
    // Only a valid v1 body may reach the cache, so an error body can't poison it (ADR-0010 Risks).
    return (JSON.parse(snap.body) as { v?: unknown })?.v === 1 ? snap.body : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function summary(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') return json('{"error":"method not allowed"}', 'no-store', 405, { Allow: 'GET' });

  const cache = caches.default;
  // A fixed key: the query is ignored, so random URLs can't bust the cache (ADR-0010 §1, §3).
  const key = new Request(url.origin + SUMMARY_PATH);
  const hit = await cache.match(key);
  if (hit) return hit;

  // Only a miss costs anything, so only a miss counts against the visitor's limit (ADR-0010 §4).
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!(await env.RL_LANDING_PUBLIC.limit({ key: ip })).success) {
    return json('{"error":"rate limited"}', 'no-store', 429, { 'Retry-After': '60' });
  }

  const lastGoodKey = new Request(url.origin + LAST_GOOD_PATH);
  const body = await snapshotFromGame(env);
  if (body === null) {
    const stale = await cache.match(lastGoodKey);
    if (!stale) return json('{"state":"unavailable"}', 'no-store', 503);
    return json(await stale.text(), 'no-store', 200, { 'X-Stale': '1' });
  }
  const fresh = json(body, 'public, max-age=60, s-maxage=300');
  ctx.waitUntil(Promise.all([
    cache.put(key, fresh.clone()),
    cache.put(lastGoodKey, json(body, `public, s-maxage=${LAST_GOOD_TTL_S}`)),
  ]));
  return fresh;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SUMMARY_PATH) return secured(await summary(request, url, env, ctx));
    // ADR-0010 §5: no other public route exists.
    if (url.pathname.startsWith('/api/')) return secured(json('{"error":"not found"}', 'no-store', 404));
    if (url.pathname === '/' && (url.searchParams.has('startapp') || url.searchParams.has('tgWebAppStartParam'))) {
      return Response.redirect(PLAY_URL + url.search, 302);
    }
    return secured(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
