/**
 * Typed client for the Pixelarrow Worker API (server/README.md, "API").
 *
 * Same origin by default (`/api/...`); `VITE_API_BASE` overrides the base for
 * development. Every failure becomes an ApiError with the server's
 * `{ error: { code, message } }` shape; network failures and timeouts use the
 * pseudo-codes `network` / `timeout` with status 0. Nothing here ever throws
 * synchronously or blocks the game: callers treat any error as "offline".
 */
import type { CampsView } from '../online/camps';
import type { CampBuildingId } from '../online/rules';
import type { Auth } from './core/auth';
import { platform } from './index';

export interface PlayerInfo {
  id: number;
  /** The unique public name (every player has one, ACCT-02). */
  displayName?: string | null;
  /** Null for a player with no Telegram identity. */
  telegramId?: number | null;
  username?: string | null;
  firstName?: string | null;
  [k: string]: unknown;
}

interface AuthResponse {
  token: string;
  /** Epoch ms. */
  expiresAt: number;
  player: PlayerInfo;
}

/** GET /api/me: whoever the session (a bearer token or the web's cookie) belongs to. */
interface MeResponse {
  player: PlayerInfo;
  session: { expiresAt: number; transport: 'bearer' | 'cookie' };
}

interface RemoteSave {
  revision: number;
  version: number | null;
  data: unknown;
  updatedAt: number | null;
}

interface PutSaveResponse {
  revision: number;
  updatedAt: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  stars: number;
  /** 'drachmae' (a Drachmae pack: the only thing Stars buy) or 'entitlement' (legacy supporter banner). */
  kind: string;
  /** Drachmae credited by a pack. */
  drachmae?: number;
  legacy?: boolean;
}

// ---------------------------------------------------------------- bot notifications (server/README.md "Bot notifications")

export const NOTIFY_TYPES = ['attack', 'march', 'income', 'duel', 'clan', 'boss', 'season', 'market'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export interface NotifySettings {
  types: { type: NotifyType; on: boolean }[];
  /** Quiet hours 23:00-08:00 local (needs tzOffset). */
  quiet: boolean;
  tzOffset: number | null;
  /** The bot cannot reach the player (blocked or never started): nothing is sent until /start. */
  blocked: boolean;
}

// ---------------------------------------------------------------- economy (server/README.md "Economy")

export type Currency = 'gold' | 'drachmae';
export type ConsumableKey = 'healing_salve' | 'morale_wine' | 'war_horn' | 'sharpening_stone' | 'march_rations';

export interface CosmeticInfo {
  id: string;
  slot: 'emblem' | 'banner' | 'cloak' | 'clan_flag' | 'army_skin' | 'table_theme' | 'crest' | 'aura' | 'pose';
  name: string;
  /** Drachmae price; null = not for sale (legacy, a pass reward or a duel season reward). */
  drachmae: number | null;
  source?: 'legacy_stars' | 'season_pass' | 'duel_season';
}

export type PassReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'drachmae'; amount: number }
  | { kind: 'consumable'; id: ConsumableKey; qty: number }
  | { kind: 'cosmetic'; id: string };

export interface PassTierInfo {
  tier: number;
  xp: number;
  free: PassReward;
  premium: PassReward;
}

export interface EconomyCatalog {
  packs: { id: string; stars: number; drachmae: number }[];
  cosmetics: CosmeticInfo[];
  slots: CosmeticInfo['slot'][];
  /** src/data/consumables.ts ConsumableDef (prices, daily caps, effects). */
  consumables: { id: ConsumableKey; name: string; desc: string; use: 'battle' | 'heal' | 'march'; gold: number | null; drachmae: number | null; dailyCap: number }[];
  pass: { premiumDrachmae: number; xpPerTier: number; xp: Record<string, number>; tiers: PassTierInfo[] };
  market: { feeRate: number; listingHours: number; maxOpenListings: number; priceBounds: Record<Currency, Record<string, [number, number]>>; resources: string[] };
}

export interface WalletInfo {
  drachmae: number;
  /** False while the balance is zero or negative (after a refunded pack). */
  canSpend: boolean;
  ledger: { delta: number; kind: string; ref: string; at: number }[];
  /** Owned cosmetic ids (account-wide). */
  cosmetics: string[];
  /** slot -> cosmetic id shown. */
  loadout: Record<string, string>;
}

export interface BuyResult {
  order: { requestId: string; item: string; qty: number; currency: Currency; price: number; season: number | null; at: number };
  /** True when this request id had already been processed (nothing charged again). */
  replayed: boolean;
  drachmae: number;
}

export interface SeasonPassInfo {
  season: { id: number; endsAt: number };
  xp: number;
  tier: number;
  premium: boolean;
  premiumDrachmae: number;
  xpPerTier: number;
  claimed: { tier: number; track: 'free' | 'premium' }[];
  tiers: PassTierInfo[];
}

export interface MarketListing {
  id: string;
  seller: { id: number; name: string | null };
  /** The town (region) it is listed in. */
  town: { loc: number; name: string };
  kind: 'item' | 'resource' | 'consumable';
  /** Item def id, resource key or consumable id. */
  ref: string;
  item: Record<string, unknown> | null;
  qty: number;
  rarity: string;
  currency: Currency;
  /** Total price; the seller receives price - fee (the fee is burned). */
  price: number;
  fee: number;
  status: 'open' | 'sold' | 'cancelled' | 'expired';
  mine: boolean;
  createdAt: number;
  expiresAt: number;
  closedAt: number | null;
}

export interface MarketQuery {
  kind?: MarketListing['kind'];
  ref?: string;
  rarity?: string;
  currency?: Currency;
  minPrice?: number;
  maxPrice?: number;
  /** Only listings in this town (loc). */
  town?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'ending';
  /** `next` from the previous page. */
  cursor?: number;
  limit?: number;
}

export interface MarketListRequest {
  /** The town (loc) to list in. */
  town: number;
  kind: MarketListing['kind'];
  /** Item uid (kind item), 'food' | 'wood' | 'bronze' (resource) or a consumable id. */
  ref: string;
  qty?: number;
  currency: Currency;
  price: number;
}

/** A fresh idempotency key for POST /api/economy/buy (reuse it when retrying the same purchase). */
export function newRequestId(): string {
  const a = new Uint8Array(12);
  try {
    crypto.getRandomValues(a);
  } catch {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface Entitlement {
  productId: string;
  grantedAt: number;
}

interface EntitlementsResponse {
  entitlements: Entitlement[];
  purchases: { productId: string; stars: number; currency: string; createdAt: number; refunded: boolean }[];
}

export interface VerifyClaim {
  winner: 0 | 1 | -1;
  ticks: number;
  retreated?: 0 | 1 | null;
  hash?: string;
}

export interface VerifyRequest {
  /** src/sim/version.ts SIM_VERSION (the server replays with these rules). */
  simVersion?: number;
  setup: unknown;
  orders: unknown[];
  deployOrders?: number;
  claim: VerifyClaim;
}

export interface VerifyResponse {
  match: boolean;
  mismatches: unknown[];
  server?: Record<string, unknown>;
  ticksSimulated?: number;
  elapsedMs?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The API cannot be used right now (no network, timeout, not configured, server down). */
  get offline(): boolean {
    return this.status === 0 || this.status === 404 || this.status === 405 || this.status >= 500;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface ApiOptions {
  /** Prefix for every path, e.g. '' (same origin) or 'http://localhost:8787'. */
  base?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /**
   * Called on a 401 from an authenticated route: should obtain a fresh token
   * (or null). The request is retried once with it.
   */
  reauth?: () => Promise<string | null>;
  /** How requests authenticate; read per request. Default: the selected platform's. */
  transport?: () => Auth['transport'];
}

interface RequestOpts {
  body?: unknown;
  auth?: boolean;
  /** false: a 401 is final (the session probe itself must not trigger a re-auth). */
  reauth?: boolean;
  timeoutMs?: number;
}

/** Default base: `VITE_API_BASE` at build time, else same origin. */
function defaultApiBase(): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE;
    return v ? v.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

/** One signed-in device (GET /api/auth/sessions; server/src/auth/sessions.ts SessionInfo). */
export interface SessionInfo {
  handle: string;
  transport: 'cookie' | 'bearer';
  method: string;
  /** "Chrome on macOS", "Telegram on iOS"; null when the browser did not say. */
  device: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

/** GET /api/account (server/src/account/summary.ts AccountSummary). */
export interface AccountSummary {
  displayName: string;
  identities: ({ kind: 'telegram'; telegramUsername: string | null } | { kind: 'password'; emailMasked: string })[];
  publicBoards: boolean;
  sessions: number;
  hasPurchases: boolean;
  name: NameStatus;
}

/** The rename rules' state for this player (server/src/account/summary.ts NameStatus). */
export interface NameStatus {
  freeChange: boolean;
  nextChangeAt: number | null;
  lockedUntil: number | null;
  moderatedAt: number | null;
}

// ---------------------------------------------------------------- web → Telegram linking (V6-LINK-03/06; server/src/account/link.ts, conflicts.ts)

/** POST /api/account/link/telegram: a one-time code; `deepLink` is null when the server doesn't know the bot. */
export interface LinkCode {
  code: string;
  expiresAt: number;
  deepLink: string | null;
}

/** GET /api/account/link/telegram/status (only the session that made the code sees it). */
export type LinkStatus =
  | { status: 'none' | 'expired' | 'linked' | 'cancelled' }
  | { status: 'pending'; expiresAt: number }
  | { status: 'awaiting_web'; expiresAt: number; telegram: { username: string | null; firstName: string | null } }
  | { status: 'conflict'; conflict: string };

/** GET /api/account/link/telegram/:code (Mini App): the web account that asks, and whether this account has progress. */
export interface LinkPeek {
  displayName: string;
  emailMasked: string | null;
  conflict: boolean;
}

/** One side of a link conflict (server/src/account/conflicts.ts SideSummary). */
export interface ConflictSide {
  displayName: string;
  signIn: ('telegram' | 'password')[];
  campaignDay: number | null;
  heroes: number;
  duelRating: number | null;
  war: { regions: number } | null;
  purchases: boolean;
  createdAt: number;
}

/** GET /api/account/conflict/:id (the web session it is bound to). */
export interface ConflictView {
  kind: 'telegram' | 'email';
  this: ConflictSide;
  other: ConflictSide;
  forced?: 'this' | 'other';
  reason?: 'purchases';
  choices: { web: 'this' | 'other' | null; telegram: 'this' | 'other' | null };
  expiresAt: number;
}

/** POST /api/account/conflict/telegram (Mini App): a conflict this Telegram user must decide. */
export interface TelegramConflict {
  id: string;
  kind: 'telegram' | 'email';
  telegram: ConflictSide;
  web: ConflictSide & { emailMasked: string | null };
  forced?: 'telegram' | 'web';
  reason?: 'purchases';
  choices: { telegram: 'telegram' | 'web' | null; web: 'telegram' | 'web' | null };
  expiresAt: number;
}

type ResolveResult = { status: 'waiting_telegram' } | { status: 'resolved'; kept: 'this' | 'other'; switched: boolean };

export class ApiClient {
  token: string | null = null;
  readonly base: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly transportOf: () => Auth['transport'];
  reauth?: () => Promise<string | null>;
  /** Extra headers on every request (src/platform/monitoring.ts: app version, platform, analytics opt-out). */
  extraHeaders?: () => Record<string, string>;

  constructor(opts: ApiOptions = {}) {
    this.base = opts.base ?? defaultApiBase();
    const f = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.fetchFn = f ?? (() => Promise.reject(new TypeError('fetch unavailable')));
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.reauth = opts.reauth;
    this.transportOf = opts.transport ?? (() => platform.auth.transport);
  }

  /** 'bearer': the token goes in a header and no cookies are sent (Telegram); 'cookie': the same-origin session cookie (web). */
  get transport(): Auth['transport'] {
    return this.transportOf();
  }

  async request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    try {
      return await this.once<T>(method, path, opts);
    } catch (e) {
      // only a lost session signs in again: a 401 asking for a proof (reauth_required, a wrong password, stale initData) is the caller's
      if (opts.auth && opts.reauth !== false && isApiError(e) && e.status === 401 && (e.code === 'unauthorized' || e.code === 'http_401') && this.reauth) {
        const t = await this.reauth().catch(() => null);
        if (t) {
          this.token = t;
          return this.once<T>(method, path, opts);
        }
      }
      throw e;
    }
  }

  private async once<T>(method: string, path: string, opts: RequestOpts): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    try {
      if (this.extraHeaders) Object.assign(headers, this.extraHeaders());
    } catch {
      /* headers are best effort */
    }
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const transport = this.transport;
    if (opts.auth && this.token) headers.authorization = `Bearer ${this.token}`;
    else if (opts.auth && transport === 'bearer') throw new ApiError(401, 'unauthorized', 'Not signed in');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const ms = opts.timeoutMs ?? this.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        ctl?.abort();
        reject(new ApiError(0, 'timeout', `Request timed out after ${ms} ms`));
      }, ms);
    });
    let res: Response;
    try {
      res = await Promise.race([
        this.fetchFn(this.base + path, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: ctl?.signal,
          // a bearer token never rides with cookies (the server refuses both on one request)
          credentials: transport === 'cookie' && !headers.authorization ? 'same-origin' : 'omit',
        }),
        timeout,
      ]);
    } catch (e) {
      if (isApiError(e)) throw e;
      if (timedOut) throw new ApiError(0, 'timeout', `Request timed out after ${ms} ms`);
      throw new ApiError(0, 'network', e instanceof Error ? e.message : 'Network error');
    } finally {
      clearTimeout(timer);
    }

    let json: unknown = undefined;
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
      if (err && typeof err === 'object' && typeof err.code === 'string') {
        const { code, message, ...extra } = err as Record<string, unknown>;
        throw new ApiError(res.status, code as string, typeof message === 'string' ? message : code as string, extra);
      }
      throw new ApiError(res.status, `http_${res.status}`, `HTTP ${res.status}`);
    }
    if (json === undefined || json === null || typeof json !== 'object') {
      // e.g. a static host answering /api/* with index.html
      throw new ApiError(res.status === 200 ? 404 : res.status, 'bad_response', 'Response is not JSON');
    }
    return json as T;
  }

  // ---------------------------------------------------------------- endpoints

  async authTelegram(initData: string): Promise<AuthResponse> {
    const r = await this.request<AuthResponse>('POST', '/api/auth/telegram', { body: { initData } });
    this.token = r.token;
    return r;
  }

  /** The session's player: on the web, whether a session cookie is live (401 when not). */
  me(): Promise<MeResponse> {
    return this.request<MeResponse>('GET', '/api/me', { auth: true, reauth: false });
  }

  // ---- the web's email forms (V6-ACCT-03/05, ADR-0008 §4): same-origin; the server sets or clears the session cookie

  /** Always `202 check_email` for a well-formed request, whether or not the address has an account (M-AF-3). */
  signup(email: string, password: string, turnstile: string): Promise<{ status: 'check_email' }> {
    return this.request('POST', '/api/auth/signup', { body: { email, password, turnstile } });
  }

  /** A new cookie session; `401 invalid_credentials` for an unknown email, a wrong password and a locked address alike. */
  login(email: string, password: string, turnstile: string): Promise<{ player: PlayerInfo; expiresAt: number }> {
    return this.request('POST', '/api/auth/login', { body: { email, password, turnstile } });
  }

  /** Always `202 check_email` (no account disclosure). */
  resetRequest(email: string, turnstile: string): Promise<{ status: 'check_email' }> {
    return this.request('POST', '/api/auth/reset/request', { body: { email, turnstile } });
  }

  /** A new link for a pending sign-up; always `202 check_email`. */
  resendVerify(email: string, turnstile: string): Promise<{ status: 'check_email' }> {
    return this.request('POST', '/api/auth/verify/resend', { body: { email, turnstile } });
  }

  /** Ends this session (the server clears the cookie). A 401 is final: there was nothing to end. */
  logout(): Promise<{ ok: true }> {
    return this.request('POST', '/api/auth/logout', { auth: true, reauth: false });
  }

  /** Ends every session of the player, this one included (ADR-0008 §3; accounts-v6.md §14 Q6). */
  logoutAll(): Promise<{ ok: true }> {
    return this.request('POST', '/api/auth/logout-all', { auth: true, reauth: false });
  }

  /** The player's signed-in devices (a handle each, never a token). */
  sessions(): Promise<{ sessions: SessionInfo[] }> {
    return this.request('GET', '/api/auth/sessions', { auth: true });
  }

  /** Ends one session by its 12-character handle (`404` when it is already gone). */
  revokeSession(handle: string): Promise<{ ok: true }> {
    return this.request('DELETE', `/api/auth/sessions/${encodeURIComponent(handle)}`, { auth: true });
  }

  /** The caller's account summary (ADR-0009; accounts-v6.md §8.2 AU-09). */
  account(): Promise<AccountSummary> {
    return this.request('GET', '/api/account', { auth: true });
  }

  /** Show me on the public boards of pixelarrow.app (ADR-0010; in-game boards always show the player). */
  setPublicBoards(enabled: boolean): Promise<{ publicBoards: boolean }> {
    return this.request('PUT', '/api/account/public-boards', { auth: true, body: { enabled } });
  }

  /**
   * A new display name (V6-LINK-07; ADR-0009 §6): `400 invalid_name {reason}`, `409 taken`,
   * `429 cooldown {nextChangeAt}`, `423 locked {lockedUntil}`.
   */
  rename(name: string): Promise<{ displayName: string; name: NameStatus }> {
    return this.request('PUT', '/api/account/name', { auth: true, body: { name } });
  }

  /** Sensitive. Deletes the account now and for good (ADR-0009 §7); `409 busy_try_later`. The body's word is always the English one. */
  deleteAccount(): Promise<{ status: 'done' | 'resumable' }> {
    return this.request('DELETE', '/api/account', { auth: true, body: { confirm: 'DELETE' } });
  }

  // ---- sign-in method management (V6-LINK-05; server/src/account/routes.ts, V6-049). Routes marked
  // sensitive answer `401 reauth_required` without a proof from the last 10 minutes.

  /** A fresh proof for this session (AU-10): the account's password, or Telegram initData at most 10 minutes old. */
  reauthWith(proof: { password: string } | { initData: string }): Promise<{ reauthUntil: number }> {
    return this.request('POST', '/api/account/reauth', { auth: true, body: proof });
  }

  /** Sensitive. Emails an add_email link (`202 check_email`); `409 already_has_email` when the account has one. */
  addEmail(email: string, password: string): Promise<{ status: 'check_email' }> {
    return this.request('POST', '/api/account/email', { auth: true, body: { email, password } });
  }

  /** Sensitive. Emails a change_email link to the new address (`202`); `400 same_email`, `400 no_password`. */
  changeEmail(email: string): Promise<{ status: 'check_email' }> {
    return this.request('POST', '/api/account/email/change', { auth: true, body: { email } });
  }

  /** Sensitive. Removes a sign-in method; `409 last_login_method` for the only one. `signedOut`: this session ended with it. */
  removeMethod(kind: 'telegram' | 'password'): Promise<{ ok: true; signedOut: boolean }> {
    return this.request('DELETE', `/api/account/identities/${kind}`, { auth: true });
  }

  /** Every other session ends; `401 invalid_credentials` for a wrong current password (it counts toward the lockout). */
  changePassword(current: string, next: string): Promise<{ ok: true }> {
    return this.request('POST', '/api/auth/password', { auth: true, body: { current, next } });
  }

  // ---- web → Telegram linking (V6-LINK-06). initData goes in the body, never the URL; ids are base64url.

  /** Sensitive (web). A new link code for this session; `409 already_linked`, `429 rate_limited`. */
  linkStart(): Promise<LinkCode> {
    return this.request('POST', '/api/account/link/telegram', { auth: true });
  }

  /** The web closed the sheet or said "Not me": this session's unspent code goes. */
  linkAbandon(): Promise<{ ok: true }> {
    return this.request('DELETE', '/api/account/link/telegram', { auth: true });
  }

  linkStatus(): Promise<LinkStatus> {
    return this.request('GET', '/api/account/link/telegram/status', { auth: true });
  }

  /** Sensitive (web). Links, or opens a conflict both sides must decide. */
  linkConfirm(): Promise<{ linked: true; removedEmpty?: true } | { conflict: string }> {
    return this.request('POST', '/api/account/link/telegram/confirm', { auth: true });
  }

  /** Mini App: who asks (`410 link_expired`, `409 already_linked`). */
  linkPeek(code: string): Promise<LinkPeek> {
    return this.request('GET', `/api/account/link/telegram/${encodeURIComponent(code)}`, { auth: true });
  }

  /** Mini App "Link": records this Telegram account on the code; links nothing until the web confirms. */
  linkComplete(initData: string): Promise<{ status: 'awaiting_web' }> {
    return this.request('POST', '/api/account/link/telegram/complete', { auth: true, body: { initData } });
  }

  /** Mini App "Not me", at any step: cancels the code and this Telegram user's conflicts. */
  linkNotMe(initData: string): Promise<{ cancelled: number }> {
    return this.request('POST', '/api/account/link/telegram/cancel', { auth: true, body: { initData } });
  }

  /** Sensitive (web). Both sides of a conflict, and each side's choice so far. */
  conflict(id: string): Promise<ConflictView> {
    return this.request('GET', `/api/account/conflict/${encodeURIComponent(id)}`, { auth: true });
  }

  /** Sensitive (web). The web side's choice with the loser's name typed: `202 waiting_telegram` until the Mini App agrees. */
  resolveConflict(id: string, keep: 'this' | 'other', confirm: string): Promise<ResolveResult> {
    return this.request('POST', `/api/account/conflict/${encodeURIComponent(id)}/resolve`, { auth: true, body: { keep, confirm } });
  }

  /** Mini App: the conflicts this Telegram user must decide. */
  telegramConflicts(initData: string): Promise<{ conflicts: TelegramConflict[] }> {
    return this.request('POST', '/api/account/conflict/telegram', { auth: true, body: { initData } });
  }

  /** Mini App: the Telegram owner's choice (initData of a launch newer than the "Link" tap); never resolves alone. */
  chooseFromTelegram(id: string, initData: string, keep: 'telegram' | 'web'): Promise<{ status: 'waiting_web' }> {
    return this.request('POST', `/api/account/conflict/${encodeURIComponent(id)}/telegram`, { auth: true, body: { initData, keep } });
  }

  /** Local development only: needs DEV_AUTH=1 on a local `wrangler dev`. */
  async authDev(id = 1, firstName = 'Dev'): Promise<AuthResponse> {
    const r = await this.request<AuthResponse>('POST', '/api/auth/telegram', { body: { dev: { id, first_name: firstName } } });
    this.token = r.token;
    return r;
  }

  getSave(): Promise<RemoteSave> {
    return this.request<RemoteSave>('GET', '/api/save', { auth: true });
  }

  putSave(revision: number, data: unknown): Promise<PutSaveResponse> {
    return this.request<PutSaveResponse>('PUT', '/api/save', { auth: true, body: { revision, data }, timeoutMs: 15000 });
  }

  async products(): Promise<Product[]> {
    const r = await this.request<{ products: Product[] }>('GET', '/api/shop/products');
    return Array.isArray(r.products) ? r.products : [];
  }

  invoice(productId: string): Promise<{ link: string; productId: string; stars: number }> {
    return this.request('POST', '/api/shop/invoice', { auth: true, body: { productId } });
  }

  entitlements(): Promise<EntitlementsResponse> {
    return this.request<EntitlementsResponse>('GET', '/api/entitlements', { auth: true });
  }

  verifyBattle(body: VerifyRequest): Promise<VerifyResponse> {
    return this.request<VerifyResponse>('POST', '/api/battle/verify', { auth: true, body, timeoutMs: 20000 });
  }

  // ---------------------------------------------------------------- bot notifications

  /** Per-type switches of the bot notifications (server/src/notify). */
  notifySettings(): Promise<NotifySettings> {
    return this.request<NotifySettings>('GET', '/api/notify/settings', { auth: true });
  }

  /** Changes some switches, quiet hours or the time zone offset (minutes east of UTC). */
  saveNotifySettings(change: { on?: Partial<Record<NotifyType, boolean>>; quiet?: boolean; tzOffset?: number | null }): Promise<NotifySettings> {
    return this.request<NotifySettings>('PUT', '/api/notify/settings', { auth: true, body: change });
  }

  // ---------------------------------------------------------------- economy

  /** Packs (Stars), cosmetics and pass (Drachmae), consumables (gold or Drachmae), market rules. Public. */
  economyCatalog(): Promise<EconomyCatalog> {
    return this.request<EconomyCatalog>('GET', '/api/economy/catalog');
  }

  wallet(): Promise<WalletInfo> {
    return this.request<WalletInfo>('GET', '/api/economy/wallet', { auth: true });
  }

  /**
   * Buys a cosmetic or 'season_pass' (Drachmae) or a consumable (gold or
   * Drachmae; needs a season profile; daily caps). Keep the requestId when
   * retrying after a network error: the server never charges twice for it.
   * Errors: insufficient_funds, already_owned, daily_cap, no_profile, request_reused.
   */
  buy(item: string, opts: { currency?: Currency; qty?: number; requestId?: string } = {}): Promise<BuyResult> {
    return this.request<BuyResult>('POST', '/api/economy/buy', { auth: true, body: { item, currency: opts.currency ?? 'drachmae', qty: opts.qty ?? 1, requestId: opts.requestId ?? newRequestId() } });
  }

  equipCosmetic(slot: CosmeticInfo['slot'], id: string | null): Promise<{ loadout: Record<string, string> }> {
    return this.request('POST', '/api/economy/cosmetics/equip', { auth: true, body: { slot, id } });
  }

  seasonPass(): Promise<SeasonPassInfo> {
    return this.request<SeasonPassInfo>('GET', '/api/economy/pass', { auth: true });
  }

  /** Idempotent: claiming a claimed reward answers `replayed: true`. Errors: locked, no_profile. */
  claimPass(tier: number, track: 'free' | 'premium'): Promise<{ tier: number; track: string; reward: PassReward; replayed: boolean; drachmae?: number }> {
    return this.request('POST', '/api/economy/pass/claim', { auth: true, body: { tier, track } });
  }

  // ---------------------------------------------------------------- online consumables & marketplace

  consumables(): Promise<{ inventory: Partial<Record<ConsumableKey, number>>; day: string; caps: Record<ConsumableKey, { cap: number; bought: number }> }> {
    return this.request('GET', '/api/online/consumables', { auth: true });
  }

  /** healing_salve or march_rations (battle consumables go with attack/start or a duel challenge). */
  useConsumable(id: ConsumableKey): Promise<{ used: ConsumableKey; inventory: Partial<Record<ConsumableKey, number>>; march: unknown }> {
    return this.request('POST', '/api/online/consumables/use', { auth: true, body: { id } });
  }

  marketSearch(q: MarketQuery = {}): Promise<{ listings: MarketListing[]; next: number | null }> {
    const qs = Object.entries(q)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return this.request('GET', `/api/online/market${qs ? `?${qs}` : ''}`, { auth: true });
  }

  marketMine(): Promise<{ listings: MarketListing[]; open: number; maxOpen: number }> {
    return this.request('GET', '/api/online/market/mine', { auth: true });
  }

  marketTowns(): Promise<{ towns: { loc: number; name: string }[] }> {
    return this.request('GET', '/api/online/market/towns', { auth: true });
  }

  /** Errors: town_unreachable, price_out_of_bounds, listing_cap, cannot_afford, none_left. */
  marketList(body: MarketListRequest): Promise<{ listing: MarketListing }> {
    return this.request('POST', '/api/online/market/list', { auth: true, body });
  }

  /** Errors: self_buy, insufficient_funds, sold, expired (410), gone. */
  marketBuy(listingId: string): Promise<{ listing: MarketListing; paid: number; fee: number; sellerGets: number }> {
    return this.request('POST', '/api/online/market/buy', { auth: true, body: { listingId } });
  }

  marketCancel(listingId: string): Promise<{ ok: true; returned: { kind: string; ref: string; qty: number } }> {
    return this.request('POST', '/api/online/market/cancel', { auth: true, body: { listingId } });
  }

  // ---------------------------------------------------------------- online camps (server/src/online/camps.ts)

  /** Your camps (buildings, timers, effects), the camp plots you could claim, limits and purse. */
  camps(): Promise<CampsView> {
    return this.request('GET', '/api/online/camps', { auth: true });
  }

  /** Makes a forward camp on a camp plot you hold (army there). Errors: camp_notPlot, camp_notYours, camp_isCamp, camp_limit, camp_notHere, camp_funds. */
  campClaim(loc: number): Promise<CampsView> {
    return this.request('POST', '/api/online/camps/claim', { auth: true, body: { loc } });
  }

  /**
   * Builds `kind` on an empty `slot` of a camp, or raises the existing one a
   * level (slot omitted). Errors: camp_notCamp, camp_badSlot, camp_slotTaken,
   * camp_built, camp_busy, camp_maxLevel, camp_funds.
   */
  campBuild(loc: number, kind: CampBuildingId, slot?: number | null): Promise<CampsView & { built: { loc: number; slot: number; kind: CampBuildingId; level: number; doneAt: number } }> {
    return this.request('POST', '/api/online/camps/build', { auth: true, body: slot === undefined || slot === null ? { loc, kind } : { loc, kind, slot } });
  }

  /** Rests the army at one of your camps (energy, wounds). Errors: camp_notCamp, camp_notHere, camp_resting. */
  campRest(loc: number): Promise<CampsView & { energy: number }> {
    return this.request('POST', '/api/online/camps/rest', { auth: true, body: { loc } });
  }
}
