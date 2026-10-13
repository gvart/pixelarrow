/**
 * Cloudflare Turnstile server-side check (ADR-0008 §6, M-AF-2) for the
 * anonymous web auth forms. Never used on /api/auth/telegram (N-AF-3).
 *
 * Accepts a token only when siteverify says `success`, the `action` is the
 * endpoint's, the `hostname` is on the allow-list and `challenge_ts` is at most
 * 300 s old. A siteverify network error, a 5xx or a secret problem fails
 * closed with 503: failing open would let a flood of siteverify errors turn
 * Turnstile off. https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Cloudflare's published testing secrets (1x… pass, 2x… fail, 3x…
 * timeout-or-duplicate) answer with `metadata.result_with_testing_key` and no
 * action or a placeholder hostname; such a result is accepted only when
 * DEV_AUTH=1 (local and tests), so a testing secret left in production lets
 * nobody in. https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
import type { Env } from '../env';
import { ApiError } from '../errors';
import { log } from '../telemetry/log';
import { gameUrl } from '../urls';

export type TurnstileAction = 'signup' | 'login' | 'reset' | 'resend';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** A token is valid for 300 s from the challenge (ADR-0008 §6). */
export const MAX_CHALLENGE_AGE_MS = 300_000;
const SITEVERIFY_TIMEOUT_MS = 5_000;
/** Error codes that mean our configuration is wrong or Cloudflare failed, not the visitor. */
const SERVER_SIDE = new Set(['missing-input-secret', 'invalid-input-secret', 'bad-request', 'internal-error']);

interface SiteverifyReply {
  success?: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  'error-codes'?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

const unavailable = () => new ApiError(503, 'turnstile_unavailable', 'The human check is unavailable, try again later');

/** The hostnames a token may come from: the game's, plus localhost when DEV_AUTH=1. */
export function turnstileHostnames(env: Env): string[] {
  const hosts = [new URL(gameUrl(env)).hostname];
  if (env.DEV_AUTH === '1') hosts.push('localhost');
  return hosts;
}

/**
 * True when siteverify accepts `token` for `action`; false for a bad, expired,
 * reused, foreign or missing token. Throws 503 `turnstile_unavailable` when it
 * can't tell (no secret, network error, 5xx, secret rejected).
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  action: TurnstileAction,
  ip: string,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) {
    log('error', 'turnstile_no_secret');
    throw unavailable();
  }
  if (!token) return false;

  // One idempotency key per attempt, reused on the retry, so a retried
  // request is not answered `timeout-or-duplicate`.
  const idempotencyKey = crypto.randomUUID();
  let reply: SiteverifyReply | null = null;
  for (let attempt = 0; attempt < 2 && reply === null; attempt++) {
    const form = new FormData();
    form.set('secret', secret);
    form.set('response', token);
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    form.set('idempotency_key', idempotencyKey);
    try {
      const res = await fetchFn(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
      if (res.ok) reply = (await res.json()) as SiteverifyReply;
      else log('warn', 'turnstile_http', { status: res.status });
    } catch (err) {
      log('warn', 'turnstile_fetch_failed', { error: err instanceof Error ? err.name : 'non-error' });
    }
  }
  if (reply === null) throw unavailable();

  const codes = Array.isArray(reply['error-codes']) ? reply['error-codes'] : [];
  if (reply.success !== true && codes.some((c) => SERVER_SIDE.has(c))) {
    log('error', 'turnstile_rejected_request', { codes: codes.join(',').slice(0, 200) });
    throw unavailable();
  }
  if (reply.success !== true) return false;

  if (reply.metadata?.result_with_testing_key === true) {
    if (env.DEV_AUTH === '1') return true;
    log('error', 'turnstile_testing_key_in_production');
    return false;
  }
  if (reply.action !== action) return false;
  if (!reply.hostname || !turnstileHostnames(env).includes(reply.hostname)) return false;
  const solvedAt = Date.parse(reply.challenge_ts ?? '');
  return Number.isFinite(solvedAt) && now - solvedAt <= MAX_CHALLENGE_AGE_MS;
}

/** The route gate: 400 `turnstile_failed` (the client calls turnstile.reset()) unless the token passes. */
export async function requireTurnstile(env: Env, token: string | undefined, action: TurnstileAction, ip: string): Promise<void> {
  if (!(await verifyTurnstile(env, token, action, ip))) {
    throw new ApiError(400, 'turnstile_failed', 'The human check failed, try again');
  }
}
