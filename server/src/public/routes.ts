/**
 * The public stats API (ADR-0010 §1, §3–§5): `GET`/`HEAD /api/public/v1/summary`
 * serves the snapshot the cron stored (public/snapshot.ts) as is.
 *
 * It runs outside the Hono app (server/src/index.ts), so none of the /api/*
 * middleware applies: no session, no cookie or Authorization read, no CORS,
 * no Origin check, and never a Set-Cookie. The request path is the rate limit
 * plus one primary-key SELECT; nothing else touches D1 (N-PS-1).
 */
import type { Env } from '../env';
import { errorBody } from '../errors';
import { logError } from '../telemetry/log';

export const PUBLIC_PREFIX = '/api/public/';
const SUMMARY_PATH = '/api/public/v1/summary';
/** M-PS-4: browsers keep it a minute, the edge five, and may serve it stale for ten more while refetching. */
const SUMMARY_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
const RETRY_S = '60';

/** The stored snapshot: what the HTTP route and the PublicApi entrypoint both serve. */
export interface SnapshotRow {
  body: string;
  generatedAt: number;
}

/** The one query on the request path: the snapshot row, or null before the first cron run. */
export async function readSnapshot(db: D1Database): Promise<SnapshotRow | null> {
  const row = await db.prepare('SELECT body, generated_at FROM public_snapshot WHERE id = 1').first<{ body: string; generated_at: number }>();
  return row ? { body: row.body, generatedAt: row.generated_at } : null;
}

/** A strong validator per snapshot: generated_at changes on every rebuild. */
const etagOf = (generatedAt: number) => `"s1-${generatedAt.toString(36)}"`;

/** RFC 9110 §13.1.2: weak comparison, a list of tags or `*`. */
function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((t) => {
    const tag = t.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });
}

/** Handles every request under /api/public/; only the summary exists (ADR-0010 §5). */
export async function publicRoute(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname !== SUMMARY_PATH) return json(404, errorBody('not_found', 'No such endpoint'));
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, errorBody('method_not_allowed', 'Use GET or HEAD'), { allow: 'GET, HEAD' });
  }
  try {
    // Every HTTP call counts, 304s included; only Cloudflare's own header names the client (N-PS-4).
    // A missing binding fails closed, as requireLimit does on the auth routes.
    if (!env.RL_PUBLIC_IP) return json(503, errorBody('rate_limit_unavailable', 'Rate limiting is not configured'));
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (!(await env.RL_PUBLIC_IP.limit({ key: `public:${ip}` })).success) {
      return json(429, errorBody('rate_limited', 'Too many requests, slow down'), { 'retry-after': RETRY_S });
    }
    const snap = env.DB ? await readSnapshot(env.DB) : null;
    if (!snap) return json(503, { status: 'warming' }, { 'retry-after': RETRY_S });

    const etag = etagOf(snap.generatedAt);
    const headers = { 'cache-control': SUMMARY_CACHE, etag, 'x-content-type-options': 'nosniff' };
    if (matches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : snap.body, {
      status: 200,
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    logError('http', e, { method: request.method, path: SUMMARY_PATH });
    return json(500, errorBody('internal', 'Internal error'));
  }
}
