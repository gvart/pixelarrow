/**
 * Who the war pages play as (the menu, the world map, the region view and its worker share it):
 *
 *  - an email account: the web session cookie the menu's sign-in set (same-origin fetches and socket upgrades carry it;
 *    no Authorization header, or the server answers two_transports);
 *  - a dev player (local only, wrangler dev with DEV_AUTH=1): POST /api/auth/telegram { dev } gives a bearer token;
 *    the menu's dev login keeps the id in localStorage `war.devId`, and `?dev=<id>` on a page forces one.
 *
 * Order: an asked dev id, else the cookie session, else a kept dev id. None of them: null (the page sends the player
 * to the menu).
 */

export interface WarAuth {
  /** The player id. */
  pid: number;
  /** Headers for /api calls (JSON; the bearer token for a dev player). */
  headers: Record<string, string>;
  /** Sec-WebSocket-Protocol for /ws sockets. */
  protocols: string[];
  /** The bearer token (dev players), '' with the cookie. */
  token: string;
  dev: boolean;
}

export const DEV_KEY = 'war.devId';
const JSON_HEADERS = { 'content-type': 'application/json' };

/** The dev id kept by the menu's dev login (localStorage is not there in a worker). */
export function keptDevId(): number | null {
  try {
    const v = Number(globalThis.localStorage?.getItem(DEV_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function devAuth(id: number, name = `Dev${id}`): Promise<WarAuth> {
  const res = await fetch('/api/auth/telegram', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ dev: { id, first_name: name } }) });
  if (!res.ok) throw new Error(`dev login failed (${res.status}): is wrangler dev running with DEV_AUTH=1?`);
  const s = (await res.json()) as { token: string; player: { id: number } };
  return { pid: s.player.id, headers: { ...JSON_HEADERS, authorization: `Bearer ${s.token}` }, protocols: ['pixelarrow.v1', s.token], token: s.token, dev: true };
}

/** The cookie session's player, or null when there is none. */
export async function cookieAuth(): Promise<WarAuth | null> {
  const r = await fetch('/api/me', { credentials: 'same-origin' }).catch(() => null);
  if (!r?.ok) return null;
  const me = (await r.json()) as { player: { id: number } };
  return { pid: me.player.id, headers: { ...JSON_HEADERS }, protocols: ['pixelarrow.v1'], token: '', dev: false };
}

/** The player this page plays as (see the module comment), or null. */
export async function warAuth(askedDev?: number | null): Promise<WarAuth | null> {
  if (askedDev) return devAuth(askedDev);
  const c = await cookieAuth();
  if (c) return c;
  const kept = keptDevId();
  return kept ? devAuth(kept) : null;
}
