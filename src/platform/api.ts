/**
 * Typed client for the Pixelarrow Worker API (server/README.md, "API").
 *
 * Same origin by default (`/api/...`); `VITE_API_BASE` overrides the base for
 * development. Every failure becomes an ApiError with the server's
 * `{ error: { code, message } }` shape; network failures and timeouts use the
 * pseudo-codes `network` / `timeout` with status 0. Nothing here ever throws
 * synchronously or blocks the game: callers treat any error as "offline".
 */

export interface PlayerInfo {
  id: number;
  telegramId?: number;
  username?: string | null;
  firstName?: string | null;
  [k: string]: unknown;
}

export interface AuthResponse {
  token: string;
  expiresAt: number;
  player: PlayerInfo;
}

export interface RemoteSave {
  revision: number;
  version: number | null;
  data: unknown;
  updatedAt: number | null;
}

export interface PutSaveResponse {
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
  slot: 'emblem' | 'banner' | 'cloak' | 'clan_flag' | 'army_skin' | 'table_theme';
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

export interface Entitlement {
  productId: string;
  grantedAt: number;
}

export interface EntitlementsResponse {
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

export interface ApiOptions {
  /** Prefix for every path, e.g. '' (same origin) or 'http://localhost:8787'. */
  base?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /**
   * Called on a 401 from an authenticated route: should obtain a fresh token
   * (or null). The request is retried once with it.
   */
  reauth?: () => Promise<string | null>;
}

interface RequestOpts {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

/** Default base: `VITE_API_BASE` at build time, else same origin. */
export function defaultApiBase(): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE;
    return v ? v.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

export class ApiClient {
  token: string | null = null;
  readonly base: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  reauth?: () => Promise<string | null>;
  /** Extra headers on every request (src/platform/monitoring.ts: app version, platform, analytics opt-out). */
  extraHeaders?: () => Record<string, string>;

  constructor(opts: ApiOptions = {}) {
    this.base = opts.base ?? defaultApiBase();
    const f = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.fetchFn = f ?? (() => Promise.reject(new TypeError('fetch unavailable')));
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.reauth = opts.reauth;
  }

  async request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    try {
      return await this.once<T>(method, path, opts);
    } catch (e) {
      if (opts.auth && isApiError(e) && e.status === 401 && this.reauth) {
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
    if (opts.auth) {
      if (!this.token) throw new ApiError(401, 'unauthorized', 'Not signed in');
      headers.authorization = `Bearer ${this.token}`;
    }
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
          credentials: 'omit',
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
}
