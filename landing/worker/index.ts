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

/** The game's validator for a snapshot (server/src/public/routes.ts), so both hosts tag it alike. */
const etagOf = (generatedAt: number) => `"s1-${generatedAt.toString(36)}"`;

/** RFC 9110 §13.1.2: weak comparison, a list of tags or `*`, as on the game. */
function matches(ifNoneMatch: string | null, etag: string | null): boolean {
  if (!ifNoneMatch || !etag) return false;
  return ifNoneMatch.split(',').some((t) => {
    const tag = t.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

type GameAnswer = { body: string; generatedAt: number } | 'warming' | 'unavailable';

/**
 * The snapshot from the game; 'warming' when the game has none yet (its HTTP route's 503 warming);
 * 'unavailable' on an error, a timeout or anything but a v1 body.
 */
async function snapshotFromGame(env: Env): Promise<GameAnswer> {
  let timer: number | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), GAME_TIMEOUT_MS); });
  try {
    const snap = await Promise.race([env.GAME.summary(), timeout]);
    if (snap === 'timeout') return 'unavailable';
    if (!snap) return 'warming';
    // Only a valid v1 body may reach the cache, so an error body can't poison it (ADR-0010 Risks).
    return (JSON.parse(snap.body) as { v?: unknown })?.v === 1 ? { body: snap.body, generatedAt: snap.generatedAt } : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function summary(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json('{"error":"method not allowed"}', 'no-store', 405, { Allow: 'GET, HEAD' });
  }
  const res = await summary200(request, url, env, ctx);
  if (res.status === 200 && matches(request.headers.get('if-none-match'), res.headers.get('etag'))) {
    return new Response(null, { status: 304, headers: res.headers });
  }
  return res;
}

/** The summary before conditionals: the edge copy, a fresh one from the game, the last good one, or an error. */
async function summary200(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
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
  const snap = await snapshotFromGame(env);
  if (typeof snap === 'string') {
    const stale = await cache.match(lastGoodKey);
    if (!stale) return json(JSON.stringify({ status: snap }), 'no-store', 503, { 'Retry-After': '60' });
    const etag = stale.headers.get('etag');
    return json(await stale.text(), 'no-store', 200, { 'X-Stale': '1', ...(etag ? { ETag: etag } : {}) });
  }
  const etag = etagOf(snap.generatedAt);
  const fresh = json(snap.body, 'public, max-age=60, s-maxage=300', 200, { ETag: etag });
  ctx.waitUntil(Promise.all([
    cache.put(key, fresh.clone()),
    cache.put(lastGoodKey, json(snap.body, `public, s-maxage=${LAST_GOOD_TTL_S}`, 200, { ETag: etag })),
  ]));
  return fresh;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SUMMARY_PATH) {
      const res = secured(await summary(request, url, env, ctx));
      // HEAD gets the GET answer's status and headers, without the body (the game does the same).
      return request.method === 'HEAD' ? new Response(null, res) : res;
    }
    // ADR-0010 §5: no other public route exists.
    if (url.pathname.startsWith('/api/')) return secured(json('{"error":"not found"}', 'no-store', 404));
    if (url.pathname === '/' && (url.searchParams.has('startapp') || url.searchParams.has('tgWebAppStartParam'))) {
      return Response.redirect(PLAY_URL + url.search, 302);
    }
    return secured(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
