/**
 * The menu's server calls: the email account (sign in, create, reset; /api/auth/*, the session cookie), the local dev
 * login, the start (/api/war/start, server/src/war/start.ts) and what Continue needs (roster, world).
 */
import { cookieAuth, DEV_KEY, devAuth, type WarAuth } from '../net/session';
import type { AllianceId, RegionRole } from '../world/types';
import { humanCheck } from './turnstile';

export type StartStep = 'alliance' | 'home' | 'squad' | 'done';
export interface StartView {
  step: StartStep;
  alliance: AllianceId | null;
  home: string | null;
  alliances: { id: AllianceId; name: string; members: number }[];
  homes: { id: string; name: string; role: RegionRole; players: number; men: number; quota: number; refusal: string | null }[];
  classes: string[];
  squadMax: number;
}
export interface RosterMan { id: string; cls: string; name: string; level: number; state: string; region: string | null; slot: number | null }

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

let auth: WarAuth | null = null;
export const signedIn = () => auth;

export async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: auth?.headers ?? { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } | string; message?: string };
  if (!r.ok) {
    const e = typeof j.error === 'object' ? j.error : { code: j.error, message: j.message };
    throw new ApiError(e?.code ?? `http_${r.status}`, e?.message ?? `The server answered ${r.status}`, r.status);
  }
  return j;
}

/** The session this browser has: the cookie, else the kept dev player (local). */
export async function resume(): Promise<WarAuth | null> {
  auth = await cookieAuth();
  if (auth) return auth;
  const kept = Number((() => { try { return localStorage.getItem(DEV_KEY); } catch { return null; } })());
  if (kept > 0) auth = await devAuth(kept).catch(() => null);
  return auth;
}

/** Email and password: the server sets the session cookie. */
export async function signIn(email: string, password: string, slot: HTMLElement): Promise<void> {
  const turnstile = await humanCheck(slot, 'login');
  await call('POST', '/api/auth/login', { email, password, turnstile });
  try { localStorage.removeItem(DEV_KEY); } catch { /* none kept */ }
  auth = await cookieAuth();
  if (!auth) throw new ApiError('no_session', 'Signed in, but this browser kept no session (cookies blocked?)', 0);
}

/** A new account: the server mails a link that signs this browser in and opens the game. */
export async function register(email: string, password: string, slot: HTMLElement): Promise<void> {
  const turnstile = await humanCheck(slot, 'signup');
  await call('POST', '/api/auth/signup', { email, password, turnstile });
}

export async function requestReset(email: string, slot: HTMLElement): Promise<void> {
  const turnstile = await humanCheck(slot, 'reset');
  await call('POST', '/api/auth/reset/request', { email, turnstile });
}

/** Local only (DEV_AUTH servers): play as dev player `id`, kept for the war pages. */
export async function devSignIn(id: number): Promise<void> {
  // a cookie and a bearer token together are refused (two_transports): leave the cookie session first
  if (await cookieAuth()) await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  auth = await devAuth(id);
  try { localStorage.setItem(DEV_KEY, String(id)); } catch { /* this page only */ }
}

export async function signOut(): Promise<void> {
  if (auth && !auth.dev) await call('POST', '/api/auth/logout').catch(() => undefined);
  try { localStorage.removeItem(DEV_KEY); } catch { /* none kept */ }
  auth = null;
}

export const startView = () => call<StartView>('GET', '/api/war/start');
export const chooseAlliance = (alliance: number) => call<StartView>('POST', '/api/war/start/alliance', { alliance });
export const chooseHome = (region: string) => call<StartView>('POST', '/api/war/start/home', { region });
export const pickSquad = (classes: string[]) => call<StartView & { ids: string[] }>('POST', '/api/war/start/squad', { classes });
export const roster = () => call<{ persons: RosterMan[] }>('GET', '/api/war/roster');
