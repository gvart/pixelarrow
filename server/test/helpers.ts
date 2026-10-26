import { env, SELF } from 'cloudflare:test';
import { vi } from 'vitest';
import { SIM_VERSION } from '../../src/sim/version';

export const BASE = 'https://test.pixelarrow.local';
/** The game's origin (GAME_URL): the only Origin a cookie request may change state from. */
export const GAME_ORIGIN = new URL(env.GAME_URL ?? 'https://play.pixelarrow.app').origin;

/** Battle calls that carry `simVersion`; like today's client, tests send SIM_VERSION unless the body names the key (even as undefined). */
const VERSIONED = /\/(start|submit|verify)$/;

/** `token` goes in `Authorization: Bearer`; `cookie` in the web session cookie, sent from the game's origin unless `headers` names one. */
export function api(path: string, init: RequestInit & { token?: string; cookie?: string; json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.cookie) {
    headers.set('cookie', `__Host-pa_sid=${init.cookie}`);
    if (!headers.has('origin')) headers.set('origin', GAME_ORIGIN);
  }
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    const j = init.json;
    const versioned = VERSIONED.test(path) && j !== null && typeof j === 'object' && !Array.isArray(j) && !('simVersion' in j);
    body = JSON.stringify(versioned ? { ...j, simVersion: SIM_VERSION } : j);
  }
  return SELF.fetch(`${BASE}${path}`, { ...init, headers, body });
}

let nextIp = 1;
/** Logs in a fake user through DEV_AUTH (a fresh client IP each time, so the rate limiter stays out of the way). */
export async function devLogin(id: number, first_name = `Tester${id}`): Promise<{ token: string; playerId: number; name: string }> {
  const res = await api('/api/auth/telegram', {
    method: 'POST',
    json: { dev: { id, first_name } },
    headers: { 'cf-connecting-ip': `10.0.0.${nextIp++}` },
  });
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${await res.text()}`);
  const body = await res.json<{ token: string; player: { id: number; displayName: string } }>();
  return { token: body.token, playerId: body.player.id, name: body.player.displayName };
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

export const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN!;

