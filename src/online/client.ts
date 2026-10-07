/**
 * Client of the online mode: typed /api/online calls and the shard socket.
 * Uses the game's signed-in ApiClient (src/platform/cloud.ts). Nothing here
 * is needed by the offline campaign.
 */
import { online } from '../platform/cloud';
import { ApiError, isApiError } from '../platform/api';
import type { Hero } from '../data/units';
import type { Item, Slot } from '../data/items';
import type { FormationType } from '../sim/formation';
import type { BattleSetup, LoggedOrder } from '../sim/types';
import type { Archetype } from '../game/heroes';
import type { HexType } from './hex';
import type { Resources } from './rules';
import type { ClientMsg, PresencePlayer, ServerMsg } from './protocol';
import type { BattleSite } from '../world/battlefield';

export interface Axial {
  q: number;
  r: number;
}

export interface ArmyView extends Axial {
  marching: boolean;
  dest: Axial | null;
  arriveAt: number | null;
  path?: [number, number][] | null;
  at?: number[] | null;
}

export interface OwnedHeroView {
  hero: Hero;
  garrison: Axial | null;
  woundedUntil: number;
  busy: boolean;
}

export interface ProfileView {
  season: { id: number; startedAt: number; endsAt: number };
  shard: { id: number; radius: number };
  now: number;
  resources: Resources;
  energy: number;
  energyMax: number;
  home: Axial;
  army: ArmyView;
  formations: FormationType[];
  heroes: OwnedHeroView[];
  stash: Item[];
  clan: { id: number; name: string; tag: string; role: 'leader' | 'officer' | 'member' } | null;
  battles: number;
  wins: number;
  income: { pending: Resources; hexes: number };
}

export interface HexView extends Axial {
  type: HexType;
  tier: number;
  fort: boolean;
  capital: boolean;
  coast: boolean;
  site: string;
  occupant: string;
  owner: number | null;
  clan: number | null;
  home: boolean;
  garrison?: number;
  /** Neutral holders (src/online/defenders.ts id), for the map's miniatures. */
  def?: string;
  /** A beast's lair (src/online/lairs.ts): the beast and its level. */
  lair?: string;
  lairLevel?: number;
  /** A world boss stands here. */
  boss?: string;
}

export interface MapView {
  season: { id: number; endsAt: number };
  shard: { id: number; radius: number };
  now: number;
  you: { id: number; clan: number | null; home: Axial; army: ArmyView };
  hexes: HexView[];
  armies: { player: number; q: number; r: number; dest: Axial | null; arriveAt: number | null; path: [number, number][] | null; at?: number[] | null }[];
  players: Record<string, string>;
  clans: Record<string, { name: string; tag: string }>;
}

export interface HexDetail {
  hex: HexView;
  ownerName: string | null;
  clan: { id: number; name?: string; tag?: string } | null;
  yields: Resources;
  marchMinutes: number;
  mine: boolean;
  ours: boolean;
  locked: boolean;
  garrison: { hero: Hero; playerId: number; woundedUntil: number; busy: boolean }[] | null;
  formations: FormationType[] | null;
  defenders: { count: number; power: number; kind: string } | null;
  siege: { wins: number; needed: number; label: string } | null;
  income: Resources | null;
  canAttack: boolean;
  canGarrison: boolean;
  /** A beast lair: the beast, its level, whether it is home and when it returns if slain. */
  lair?: { enc: string; level: number; tier: number; home: boolean; returnsAt: number | null } | null;
  /** A world boss stands here (raid it: onlineApi.raidStart). */
  boss?: string | null;
}

/** A world boss of the shard with its shared HP and the damage tally (GET /boss). */
export interface BossView extends Axial {
  boss: string;
  level: number;
  hp: number;
  maxHp: number;
  parts: number[];
  partMax: number;
  status: 'active' | 'dead';
  killedAt: number | null;
  segment: number;
  top: { player: number; name: string; clan: string | null; damage: number; raids: number }[];
  clans: { clan: number; tag: string; name: string; damage: number }[];
  you: { damage: number; raids: number; loot: { share: number; items: Item[] } | null };
}

export interface RaidTicket {
  ticket: string;
  expiresAt: number;
  boss: string;
  hex: Axial;
  defenderKind: 'boss';
  setup: BattleSetup;
  attackers: Hero[];
  defenders: Hero[];
  resumed?: boolean;
}

export interface RaidResult {
  boss: string;
  dealt: number;
  bodyDealt: number;
  winner: number;
  ticks: number;
  hash: string;
  hex: Axial;
  gold: number;
  attacker: AttackResult['attacker'];
  killed: boolean;
  killedNow: boolean;
  bossView: BossView;
  replayed?: boolean;
}

export interface AttackTicket {
  ticket: string;
  expiresAt: number;
  hex: Axial & { type: HexType; tier: number };
  defenderKind: 'npc' | 'militia' | 'garrison' | 'beast';
  setup: BattleSetup;
  attackers: Hero[];
  defenders: Hero[];
  resumed?: boolean;
}

export interface AttackResult {
  won: boolean;
  captured: boolean;
  siege: { wins: number; needed: number } | null;
  winner: number;
  ticks: number;
  hash: string;
  hex: Axial;
  defenderKind: string;
  gold: number;
  plunder: Resources;
  loot: Item[];
  attacker: { dead: string[]; wounded: string[]; heroes: { name: string; died: boolean; xp: number; levelsGained: number; wounded?: boolean }[] };
  defender: { dead: number; total: number };
  /** A lair's beast was fought: which, and the trophy if it was slain. */
  beast?: { enc: string; level: number; trophy: string | null } | null;
  replayed?: boolean;
}

export interface ClanMember {
  id: number;
  name: string;
  role: 'leader' | 'officer' | 'member';
  joinedAt: number;
  hexes: number;
}

export interface ClanView {
  id: number;
  name: string;
  tag: string;
  shard: number;
  hexes: number;
  members: ClanMember[];
}

export type Availability = { ok: true } | { ok: false; reason: 'outside' | 'offline' | 'unconfigured' | 'error'; message: string };

const req = <T>(method: string, path: string, body?: unknown, timeoutMs?: number) => online.api.request<T>(method, `/api/online${path}`, { auth: true, body, timeoutMs });

export const onlineApi = {
  status: () => req<{ season: { id: number; endsAt: number }; joined: boolean; shard: number | null; now: number }>('GET', '/status'),
  join: () => req<ProfileView>('POST', '/profile', {}),
  profile: () => req<ProfileView>('GET', '/profile'),
  season: () => req<{ season: { id: number; endsAt: number }; rewards: { season: number; rank: number; score: number; title: string; clan: string | null }[] }>('GET', '/season'),
  map: () => req<MapView>('GET', '/map'),
  hex: (h: Axial) => req<HexDetail>('GET', `/hex/${h.q}/${h.r}`),
  march: (h: Axial) => req<{ path: [number, number][]; at: number[]; energy: number; arriveAt: number }>('POST', '/march', h),
  stopMarch: () => req<Axial>('POST', '/march/stop', {}),
  garrison: (h: Axial, heroIds: string[], formations?: FormationType[]) => req<{ garrison: { hero: Hero; playerId: number }[] }>('POST', `/hex/${h.q}/${h.r}/garrison`, { heroIds, formations }),
  collect: () => req<{ collected: Resources; hexes: number; resources: Resources }>('POST', '/collect', {}),
  recruit: (archetype: Archetype) => req<{ hero: Hero }>('POST', '/recruit', { archetype }),
  equip: (heroId: string, slot: Slot, itemUid: string | null) => req<{ hero: Hero; stash: Item[] }>('POST', '/equip', { heroId, slot, itemUid }),
  army: (groups: Record<string, number>, formations?: FormationType[]) => req<{ ok: true }>('POST', '/army', { groups, formations }),
  /** consumable: at most one battle consumable (src/data/consumables.ts), spent when the ticket is created. */
  attackStart: (h: Axial, consumable?: string) => req<AttackTicket>('POST', '/attack/start', consumable ? { q: h.q, r: h.r, consumable } : h),
  attackSubmit: (ticket: string, orders: LoggedOrder[], deployOrders: number, claim: { winner: number; ticks: number; hash: string }) =>
    req<AttackResult>('POST', '/attack/submit', { ticket, orders, deployOrders, claim }, 30_000),
  attackAbandon: (ticket: string) => req<{ ok: true }>('POST', '/attack/abandon', { ticket }),
  bosses: () => req<{ now: number; bosses: BossView[] }>('GET', '/boss'),
  raidStart: (boss: string, consumable?: string) => req<RaidTicket>('POST', '/boss/start', consumable ? { boss, consumable } : { boss }),
  raidSubmit: (ticket: string, orders: LoggedOrder[], deployOrders: number, claim: { winner: number; ticks: number; hash: string }) =>
    req<RaidResult>('POST', '/boss/submit', { ticket, orders, deployOrders, claim }, 30_000),
  raidAbandon: (ticket: string) => req<{ ok: true }>('POST', '/boss/abandon', { ticket }),
  clanMine: () => req<{ clan: ClanView | null; role: ClanMember['role'] | null }>('GET', '/clans/mine'),
  clanCreate: (name: string, tag: string) => req<{ clan: ClanView; role: string }>('POST', '/clans', { name, tag }),
  clanInvite: () => req<{ code: string; link: string; expiresAt: number }>('POST', '/clans/invite', {}),
  clanPreview: (code: string) => req<{ clan: { id: number; name: string; tag: string; members: number; hexes: number } | null; current: number | null }>('GET', `/clans/invite/${encodeURIComponent(code)}`),
  clanJoin: (code: string) => req<{ clan: ClanView; role: string }>('POST', '/clans/join', { code }),
  clanKick: (playerId: number) => req<{ clan: ClanView }>('POST', '/clans/kick', { playerId }),
  clanPromote: (playerId: number, role: ClanMember['role']) => req<{ clan: ClanView }>('POST', '/clans/promote', { playerId, role }),
  clanLeave: () => req<{ clan: null }>('POST', '/clans/leave', {}),
};

/** Can the online mode be used right now? Signs in if needed. */
export async function checkOnline(): Promise<Availability> {
  if (!online.available) return { ok: false, reason: 'outside', message: 'Online play runs inside Telegram.' };
  if (!(await online.signIn())) return { ok: false, reason: 'offline', message: 'Cannot reach the server.' };
  try {
    await onlineApi.status();
    return { ok: true };
  } catch (e) {
    return { ok: false, ...explain(e) };
  }
}

export function explain(e: unknown): { reason: 'offline' | 'unconfigured' | 'error'; message: string } {
  if (isApiError(e)) {
    if (e.status === 503) return { reason: 'unconfigured', message: 'The online realm is not open yet.' };
    if (e.offline) return { reason: 'offline', message: 'Cannot reach the server.' };
    return { reason: 'error', message: e.message };
  }
  return { reason: 'error', message: e instanceof Error ? e.message : 'Something went wrong' };
}

/** Short user-facing message of a failed call. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.status === 0 || e.status >= 500 ? 'The server is unreachable' : e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}

export type { PresencePlayer, BattleSite };

// ------------------------------------------------------------------ shard socket

type Listener = (m: ServerMsg) => void;

/**
 * The shard socket with reconnect (backoff) while the online mode is open.
 * One instance for the whole game; scenes subscribe and unsubscribe.
 */
export class ShardSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  players: PresencePlayer[] = [];
  me: PresencePlayer | null = null;
  connected = false;

  open(): void {
    this.wanted = true;
    if (this.ws) return;
    const token = online.api.token;
    if (!token) return;
    const base = online.api.base || location.origin;
    const url = base.replace(/^http/, 'ws') + '/ws/online';
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['pixelarrow.v1', token]);
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (m.type === 'welcome') {
        this.me = m.you;
        this.players = m.players;
      } else if (m.type === 'presence') this.players = m.players;
      else if (m.type === 'join') this.players = [...this.players.filter((p) => p.id !== m.player.id), m.player].sort((a, b) => a.id - b.id);
      else if (m.type === 'leave') this.players = this.players.filter((p) => p.id !== m.player.id);
      for (const l of [...this.listeners]) {
        try {
          l(m);
        } catch (err) {
          console.warn('[online] listener failed', err);
        }
      }
    };
    ws.onclose = () => {
      this.ws = null;
      this.connected = false;
      if (this.wanted) this.schedule();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private schedule(): void {
    if (this.timer || !this.wanted) return;
    const ms = Math.min(30_000, 1000 * 2 ** Math.min(5, this.retry++));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, ms);
  }

  close(): void {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close(1000);
    this.ws = null;
    this.connected = false;
  }

  send(m: ClientMsg): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const shardSocket = new ShardSocket();

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
