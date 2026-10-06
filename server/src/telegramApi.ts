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
