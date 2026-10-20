/**
 * Client of the online season: typed /api/online calls (profile, clans) and
 * the reconnecting socket the duels use. Uses the game's signed-in ApiClient
 * (src/platform/cloud.ts). Nothing here is needed by the offline campaign.
 */
import { online } from '../platform/cloud';
import { ApiError, isApiError } from '../platform/api';
import type { Hero } from '../data/units';
import type { Item, Slot } from '../data/items';
import type { FormationType } from '../sim/formation';
import type { Archetype } from '../game/heroes';
import type { Resources } from './rules';
import { SIM_VERSION_CLOSE, SIM_VERSION_REJECTED, type ClientMsg, type PresencePlayer, type ServerMsg } from './protocol';
import { SIM_VERSION } from '../sim/version';
import { t, type TKey } from '../i18n';
import { GAPS_EN } from '../i18n/gaps.en';

export interface OwnedHeroView {
  hero: Hero;
  woundedUntil: number;
  busy: boolean;
  /** Kept in camp, out of the field army (src/game/muster.ts). */
  reserve?: boolean;
}

export interface ProfileView {
  season: { id: number; startedAt: number; endsAt: number };
  now: number;
  resources: Resources;
  energy: number;
  energyMax: number;
  formations: FormationType[];
  heroes: OwnedHeroView[];
  stash: Item[];
  clan: { id: number; name: string; tag: string; role: 'leader' | 'officer' | 'member' } | null;
  battles: number;
  wins: number;
}

export interface ClanMember {
  id: number;
  name: string;
  role: 'leader' | 'officer' | 'member';
  joinedAt: number;
}

export interface ClanView {
  id: number;
  name: string;
  tag: string;
  members: ClanMember[];
}

export type Availability = { ok: true } | { ok: false; reason: 'outside' | 'offline' | 'unconfigured' | 'error'; message: string };

const req = <T>(method: string, path: string, body?: unknown, timeoutMs?: number) => online.api.request<T>(method, `/api/online${path}`, { auth: true, body, timeoutMs });

export const onlineApi = {
  status: () => req<{ season: { id: number; endsAt: number }; joined: boolean; now: number }>('GET', '/status'),
  join: () => req<ProfileView>('POST', '/profile', {}),
  profile: () => req<ProfileView>('GET', '/profile'),
  season: () => req<{ season: { id: number; endsAt: number }; rewards: { season: number; rank: number; score: number; title: string; clan: string | null }[] }>('GET', '/season'),
  recruit: (archetype: Archetype) => req<{ hero: Hero }>('POST', '/recruit', { archetype }),
  equip: (heroId: string, slot: Slot, itemUid: string | null) => req<{ hero: Hero; stash: Item[] }>('POST', '/equip', { heroId, slot, itemUid }),
  /** Salvages a bound stash item for a quarter of its worth in gold (never listed or sold). */
  salvage: (uid: string) => req<{ salvaged: boolean; gold: number; profile: ProfileView }>('POST', '/salvage', { uid }),
  army: (groups: Record<string, number>, formations?: FormationType[], reserve?: Record<string, boolean>) => req<{ ok: true }>('POST', '/army', reserve ? { groups, formations, reserve } : { groups, formations }),
  clanMine: () => req<{ clan: ClanView | null; role: ClanMember['role'] | null }>('GET', '/clans/mine'),
  clanCreate: (name: string, tag: string) => req<{ clan: ClanView; role: string }>('POST', '/clans', { name, tag }),
  clanInvite: () => req<{ code: string; link: string; expiresAt: number }>('POST', '/clans/invite', {}),
  clanPreview: (code: string) => req<{ clan: { id: number; name: string; tag: string; members: number } | null; current: number | null }>('GET', `/clans/invite/${encodeURIComponent(code)}`),
  clanJoin: (code: string) => req<{ clan: ClanView; role: string }>('POST', '/clans/join', { code }),
  clanKick: (playerId: number) => req<{ clan: ClanView }>('POST', '/clans/kick', { playerId }),
  clanPromote: (playerId: number, role: ClanMember['role']) => req<{ clan: ClanView }>('POST', '/clans/promote', { playerId, role }),
  clanLeave: () => req<{ clan: null }>('POST', '/clans/leave', {}),
};

/** Can the online mode be used right now? Signs in if needed. */
export async function checkOnline(): Promise<Availability> {
  const s = await online.ensureSession();
  if (s === 'signed_out') return { ok: false, reason: 'outside', message: t('gap.net.outside') };
  if (s === 'offline') return { ok: false, reason: 'offline', message: t('gap.net.offline') };
  try {
    await onlineApi.status();
    return { ok: true };
  } catch (e) {
    return { ok: false, ...explain(e) };
  }
}

export function explain(e: unknown): { reason: 'offline' | 'unconfigured' | 'error'; message: string } {
  if (isApiError(e)) {
    if (e.status === 503) return { reason: 'unconfigured', message: t('gap.net.closed') };
    if (e.offline) return { reason: 'offline', message: t('gap.net.offline') };
    return { reason: 'error', message: apiErrorText(e.status, e.code, e.message) };
  }
  return { reason: 'error', message: apiErrorText(-1, '', e instanceof Error ? e.message : String(e)) };
}

/**
 * The player's words for a failed call (G12, DLG-02): by the server's error code when it has
 * a string, else by HTTP status. The server's own (English) text is never shown; it goes to
 * the console for debugging.
 */
export function apiErrorText(status: number, code: string, raw?: string): string {
  if (raw) console.debug('[api]', status, code, raw);
  const byCode = `gap.err.${code}`;
  if (code && byCode in GAPS_EN) return t(byCode as TKey);
  if (status === 0 || status >= 500) return t('gap.err.s5xx');
  const byStatus = `gap.err.s${status}`;
  return byStatus in GAPS_EN ? t(byStatus as TKey) : t('gap.err.generic');
}

/** Short user-facing message of a failed call. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError && e.code === SIM_VERSION_REJECTED) return t('online.reloadForUpdate');
  if (e instanceof ApiError) return apiErrorText(e.status, e.code, e.message);
  return apiErrorText(-1, '', e instanceof Error ? e.message : String(e));
}

export type { PresencePlayer };

/** A socket path with the client's sim version (`?sim=`): the server refuses sockets of another version. */
export function simSocketPath(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}sim=${SIM_VERSION}`;
}

// ------------------------------------------------------------------ shard socket

type Listener<S> = (m: S) => void;

/** A socket's heartbeat (ShardSocket): half-open sockets never fire onclose, so silence is the only sign. */
interface Heartbeat {
  /** How often a `ping` text frame goes out (the server's auto-response answers `pong`). */
  everyMs: number;
  /** Nothing received for this long: the socket is dead (a phone put away, a network switch) and is replaced. */
  deadMs: number;
}

/**
 * A socket with reconnect (backoff): the duel queue and a ranked match
 * (src/duel/client.ts, src/duel/match.ts) each open one on their own path.
 */
export class ShardSocket<S extends { type: string } = ServerMsg, C = ClientMsg> {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener<S>>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  /** When the current socket last received anything (a frame, a pong) or opened. */
  private lastRx = 0;
  players: PresencePlayer[] = [];
  me: PresencePlayer | null = null;
  connected = false;

  /**
   * `path`: the socket's endpoint; `maxBackoffMs`: the longest wait between reconnects (a live match retries fast);
   * `heartbeat`: ping the server and replace a socket that went silent (a half-open socket never fires onclose).
   */
  constructor(
    readonly path: string,
    private readonly maxBackoffMs = 30_000,
    private readonly heartbeat: Heartbeat | null = null,
  ) {}

  /** Back in front (or back online): a socket silent for too long is replaced at once, else pinged. */
  private readonly wake = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.check();
  };

  /** Heartbeat: replace a dead socket, else ping it. */
  check(now = Date.now()): void {
    if (!this.heartbeat || !this.wanted) return;
    const ws = this.ws;
    if (!ws) {
      // waiting for a backoff timer that a backgrounded tab may have stretched: try now
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.open();
      }
      return;
    }
    if (now - this.lastRx > this.heartbeat.deadMs) return this.recycle();
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send('ping');
      } catch {
        // closing: onclose follows
      }
    }
  }

  /** Drops the current socket without waiting for its close (it may never come) and connects again. */
  private recycle(): void {
    const ws = this.ws;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(4000, 'stale');
      } catch {
        // already closed
      }
    }
    this.ws = null;
    this.connected = false;
    this.retry = 0;
    this.open();
  }

  private startBeat(): void {
    if (!this.heartbeat || this.beat) return;
    this.beat = setInterval(() => this.check(), this.heartbeat.everyMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.wake);
    if (typeof window !== 'undefined') window.addEventListener('online', this.wake);
  }

  private stopBeat(): void {
    if (!this.beat) return;
    clearInterval(this.beat);
    this.beat = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.wake);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.wake);
  }

  open(): void {
    this.wanted = true;
    this.startBeat();
    if (this.ws) return;
    // bearer (Telegram) needs the token; a cookie session (web) rides on the same-origin cookie
    const token = online.api.token;
    if (!token && online.api.transport !== 'cookie') return;
    const base = online.api.base || location.origin;
    const url = base.replace(/^http/, 'ws') + simSocketPath(this.path);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, token ? ['pixelarrow.v1', token] : ['pixelarrow.v1']);
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    this.lastRx = Date.now();
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.lastRx = Date.now();
    };
    ws.onmessage = (e) => {
      this.lastRx = Date.now();
      let msg: S;
      try {
        msg = JSON.parse(String(e.data)) as S;
      } catch {
        return;
      }
      const m = msg as unknown as ServerMsg;
      // the server's text is English and technical: the player reads the reload advice in their language
      if (m.type === 'error' && m.code === SIM_VERSION_REJECTED) m.message = t('online.reloadForUpdate');
      if (m.type === 'welcome') {
        this.me = m.you;
        this.players = m.players;
      } else if (m.type === 'presence') this.players = m.players;
      else if (m.type === 'join') this.players = [...this.players.filter((p) => p.id !== m.player.id), m.player].sort((a, b) => a.id - b.id);
      else if (m.type === 'leave') this.players = this.players.filter((p) => p.id !== m.player.id);
      for (const l of [...this.listeners]) {
        try {
          l(msg);
        } catch (err) {
          console.warn('[online] listener failed', err);
        }
      }
    };
    ws.onclose = (e) => {
      this.ws = null;
      this.connected = false;
      // refused for its sim version: only a reload helps, so stop knocking
      if (e.code === SIM_VERSION_CLOSE) {
        this.wanted = false;
        this.stopBeat();
        return;
      }
      if (this.wanted) this.schedule();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private schedule(): void {
    if (this.timer || !this.wanted) return;
    const ms = Math.min(this.maxBackoffMs, 1000 * 2 ** Math.min(5, this.retry++));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, ms);
  }

  close(): void {
    this.wanted = false;
    this.stopBeat();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close(1000);
    this.ws = null;
    this.connected = false;
  }

  send(m: C): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  on(l: Listener<S>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** A clan invite carried by the launch (start_param clan_<code>), kept until used. */
let pendingInvite: string | null = null;
export function setPendingInvite(code: string | null): void {
  pendingInvite = code;
}
export function takePendingInvite(): string | null {
  const c = pendingInvite;
  pendingInvite = null;
  return c;
}
export function peekPendingInvite(): string | null {
  return pendingInvite;
}
