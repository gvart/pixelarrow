/** Minimal Telegram Bot API client. */
import { ApiError } from './errors';

export const TELEGRAM_API = 'https://api.telegram.org';

export async function callBot<T = unknown>(token: string, method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  let body: { ok?: boolean; result?: T; description?: string } = {};
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (!res.ok || !body.ok) {
    throw new ApiError(502, 'telegram_error', `Telegram ${method} failed: ${body.description ?? res.status}`);
  }
  return body.result as T;
}

export interface BotResult<T = unknown> {
  ok: boolean;
  /** HTTP status (0 for a network failure). */
  status: number;
  result?: T;
  description?: string;
  /** Seconds to wait after a 429. */
  retryAfter?: number;
}

/** Like callBot, but never throws: the caller decides what a 403 or a 429 means. */
export async function tryBot<T = unknown>(token: string, method: string, params: Record<string, unknown>): Promise<BotResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch (e) {
    return { ok: false, status: 0, description: (e as Error)?.message ?? 'network error' };
  }
  let body: { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } } = {};
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  const ok = res.ok && body.ok === true;
  return { ok, status: res.status, result: body.result, description: body.description, retryAfter: body.parameters?.retry_after };
}

/**
 * True when Telegram refuses to deliver to this chat for good: the user
 * blocked the bot, never started it, or deleted the account.
 */
export function isUnreachable(r: BotResult): boolean {
  if (r.status === 403) return true;
  return r.status === 400 && /chat not found|user is deactivated|bot can't initiate/i.test(r.description ?? '');
}
