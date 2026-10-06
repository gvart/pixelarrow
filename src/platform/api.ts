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
  kind: string;
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
}
