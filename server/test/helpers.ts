import { env, SELF } from 'cloudflare:test';
import { vi } from 'vitest';

export const BASE = 'https://test.pixelarrow.local';

export function api(path: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  return SELF.fetch(`${BASE}${path}`, { ...init, headers, body });
}

let nextIp = 1;
/** Logs in a fake user through DEV_AUTH (a fresh client IP each time, so the rate limiter stays out of the way). */
export async function devLogin(id: number, first_name = `Tester${id}`): Promise<{ token: string; playerId: number }> {
  const res = await api('/api/auth/telegram', {
    method: 'POST',
    json: { dev: { id, first_name } },
    headers: { 'cf-connecting-ip': `10.0.0.${nextIp++}` },
  });
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${await res.text()}`);
  const body = await res.json<{ token: string; player: { id: number } }>();
  return { token: body.token, playerId: body.player.id };
}

export interface BotCall {
  method: string;
  params: Record<string, unknown>;
}

/** Intercepts fetch() to api.telegram.org; returns the recorded calls. */
export function mockTelegram(results: Record<string, unknown> = {}): BotCall[] {
  const calls: BotCall[] = [];
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'api.telegram.org') return real(input, init);
    const method = url.pathname.split('/').pop()!;
    const params = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ method, params });
    return Response.json({ ok: true, result: method in results ? results[method] : true });
  });
  return calls;
}

export const WEBHOOK_SECRET = env.TELEGRAM_WEBHOOK_SECRET!;
export const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN!;

export function webhook(update: unknown, secret = WEBHOOK_SECRET): Promise<Response> {
  return api('/api/telegram/webhook', { method: 'POST', json: update, headers: { 'x-telegram-bot-api-secret-token': secret } });
}
