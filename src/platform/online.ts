/**
 * Online layer: sign-in, cloud save sync, entitlements, shop purchases and
 * fire-and-forget battle verification against the Worker API.
 *
 * Contract with the rest of the game: nothing here may block or break play.
 * Every method resolves (never rejects); failures just flip the sync status to
 * `offline` and are retried later with backoff.
 *
 * Sessions (ADR-0006 M6, ADR-0008 §3) follow the platform's Auth: Telegram
 * signs in silently with initData (a 24 h bearer token, renewed on a 401);
 * the web may hold a session cookie, found by GET /api/me. Only silent
 * sign-ins sync the save (the web's guest save upload is ACCT-07).
 */
import { ApiClient, isApiError, type PlayerInfo, type Product, type VerifyRequest } from './api';
import type { Auth } from './core/auth';
import type { InvoiceStatus } from './telegram';
import type { KV, SaveData } from '../game/save';
import { SYNC_META_KEY, decideOnLoad, parseSyncMeta, remoteSaveData, resolveConflict, seqOf, type SyncMeta } from './saveSync';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline';

export const SUPPORTER_BANNER = 'supporter_banner';
const ENT_KEY = 'px_ent';

export interface OnlineDeps {
  api: ApiClient;
  /** Storage holding the save; the sync bookkeeping lives next to it. */
  kv: () => KV;
  /** Device-local cache (entitlements survive offline launches). */
  cache: KV;
  /** The platform's sign-in facts: transport, methods and the silent proof (Telegram initData). */
  auth: Auth;
  /** Sign in with the DEV_AUTH test user (local `wrangler dev` only). */
  devAuth?: boolean;
  /** Which DEV_AUTH test user (`?devuser=2` in dev builds, to try two players side by side). */
  devUser?: { id: number; name: string };
  openInvoice?: (link: string) => Promise<InvoiceStatus>;
  /** The device's offset from UTC in minutes (east positive), reported after sign-in for the bot's quiet hours. */
  timeZoneOffset?: () => number | null;
  debounceMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Pick<Console, 'warn' | 'info'>;
}

/** Where the player stands for online play: signed in, signed out with no way to sign in here, or the server was not reached. */
export type SessionState = 'live' | 'signed_out' | 'offline';

export type BuyResult = 'granted' | 'pending' | 'cancelled' | 'failed' | 'owned' | 'offline' | 'unavailable';

export class Online {
  status: SyncStatus = 'local';
  playerName: string | null = null;
  playerId: number | null = null;
  entitlements = new Set<string>();
  /** Whether replacing the running campaign is safe right now (not mid-battle). */
  canAdopt: () => boolean = () => true;
  /** Replace the running campaign with a newer server copy. */
  onAdopt: (data: SaveData) => Promise<void> | void = () => {};

  private readonly d: OnlineDeps;
  private listeners = new Set<(s: SyncStatus) => void>();
  private authing: Promise<boolean> | null = null;
  private nextAuthAt = 0;
  private authFails = 0;
  /** The web's session cookie, as GET /api/me last answered ('unknown' until asked, or after a network failure). */
  private cookie: 'unknown' | 'none' | 'live' = 'unknown';
  private meta: SyncMeta | null = null;
  private pending: SaveData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  private pushFails = 0;
  private pullGen = 0;

  constructor(deps: OnlineDeps) {
    this.d = deps;
    deps.api.reauth = () => this.reauth();
  }

  /** A session is live: a bearer token, or a session cookie the server confirmed. */
  get signedIn(): boolean {
    return !!this.d.api.token || this.cookie === 'live';
  }

  /** This platform has a way to sign in (Telegram's initData, the web's methods once ACCT-05 lands, or dev auth). */
  canSignIn(): boolean {
    return this.d.auth.methods().length > 0 || !!this.d.devAuth;
  }

  /** Signs in silently (Telegram initData or dev auth): these sessions sync the save and buy with Stars. */
  private get silent(): boolean {
    return !!this.d.auth.silentProof() || !!this.d.devAuth;
  }

  get api(): ApiClient {
    return this.d.api;
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(s: SyncStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const cb of this.listeners) {
      try {
        cb(s);
      } catch {
        /* a destroyed scene's badge */
      }
    }
  }

  // ------------------------------------------------------------------ auth

  /**
   * Signs in once (deduplicated, with backoff after failures): silently with
   * the platform's proof, else by asking whether a session cookie is live.
   */
  signIn(): Promise<boolean> {
    if (this.signedIn) return Promise.resolve(true);
    const silent = this.silent;
    const probe = !silent && this.d.auth.transport === 'cookie' && this.cookie !== 'none';
    if (!silent && !probe) {
      this.setStatus('local');
      return Promise.resolve(false);
    }
    if (this.authing) return this.authing;
    if (this.now() < this.nextAuthAt) return Promise.resolve(false);
    this.authing = (async () => {
      try {
        const proof = this.d.auth.silentProof();
        const player = probe
          ? (await this.d.api.me()).player
          : (proof ? await this.d.api.authTelegram(proof.initData) : await this.d.api.authDev(this.d.devUser?.id, this.d.devUser?.name)).player;
        if (probe) this.cookie = 'live';
        this.adoptPlayer(player);
        this.authFails = 0;
        void this.refreshEntitlements();
        void this.reportTimeZone();
        return true;
      } catch (e) {
        if (probe && isApiError(e) && e.status === 401) {
          this.cookie = 'none';
          this.adoptPlayer(null);
          return false;
        }
        this.authFails++;
        this.nextAuthAt = this.now() + Math.min(300_000, 15_000 * 2 ** Math.min(4, this.authFails - 1));
        // the badge is about the save, which only silent sessions sync
        if (!probe) this.setStatus('offline');
        return false;
      } finally {
        this.authing = null;
      }
    })();
    return this.authing;
  }

  /** Signs in if needed and says where the player stands (the online screens' gate). */
  async ensureSession(): Promise<SessionState> {
    if (await this.signIn()) return 'live';
    return this.canSignIn() ? 'offline' : 'signed_out';
  }

  /** The session cookie may have changed (log-in, email verified, log-out: ACCT-05): ask the server again. */
  recheckSession(): Promise<boolean> {
    this.cookie = 'unknown';
    this.nextAuthAt = 0;
    return this.signIn();
  }

  private adoptPlayer(p: PlayerInfo | null | undefined): void {
    this.playerName = p?.firstName ?? p?.username ?? p?.displayName ?? null;
    this.playerId = typeof p?.id === 'number' ? p.id : null;
  }

  /** Tells the server the device's time zone (bot notifications keep quiet at night). Fire and forget. */
  private async reportTimeZone(): Promise<void> {
    try {
      const tz = this.d.timeZoneOffset?.();
      if (typeof tz !== 'number' || !Number.isFinite(tz)) return;
      await this.d.api.saveNotifySettings({ tzOffset: Math.max(-840, Math.min(840, Math.round(tz))) });
    } catch {
      /* a nicety: never matters to play */
    }
  }

  /** A 401 on a signed-in call: a new bearer token from the silent proof (retried once), or the cookie is re-checked (never retried). */
  private async reauth(): Promise<string | null> {
    this.d.api.token = null;
    if (this.cookie === 'live') this.cookie = 'unknown';
    this.nextAuthAt = 0;
    return (await this.signIn()) ? this.d.api.token : null;
  }

  // ------------------------------------------------------------------ save sync

  private async loadMeta(): Promise<SyncMeta | null> {
    try {
      return parseSyncMeta(await this.d.kv().get(SYNC_META_KEY));
    } catch {
      return null;
    }
  }

  private async storeMeta(m: SyncMeta): Promise<void> {
    this.meta = m;
    try {
      await this.d.kv().set(SYNC_META_KEY, JSON.stringify(m));
    } catch {
      /* ignore */
    }
  }

  /**
   * Boot: compares the local save with the server's. Returns the server save
   * when it should replace the local one, else null (local stays; unsynced
   * local progress is queued for upload). `abandonPull()` makes a late answer
   * a no-op.
   */
  async pullOnLoad(local: SaveData | null): Promise<SaveData | null> {
    const gen = ++this.pullGen;
    if (!this.silent) {
      // the web: find a session cookie before the first screen; the save stays on this device
      await this.signIn();
      return null;
    }
    const stored = await this.loadMeta();
    if (!(await this.signIn())) return null;
    this.setStatus('syncing');
    try {
      const remote = await this.d.api.getSave();
      if (gen !== this.pullGen) return null;
      const dec = decideOnLoad(local, stored, remote);
      if (dec.action === 'adopt') {
        await this.storeMeta({ revision: dec.revision, seq: seqOf(dec.data) });
        this.setStatus('synced');
        return dec.data;
      }
      if (dec.action === 'hold') {
        this.hold();
        return null;
      }
      if (dec.action === 'push') {
        this.meta = { revision: dec.revision, seq: stored?.seq ?? -1 };
        if (local) this.queuePush(local, 0);
        return null;
      }
      await this.storeMeta({ revision: dec.revision, seq: seqOf(local) });
      this.setStatus('synced');
      return null;
    } catch {
      if (gen === this.pullGen) this.setStatus('offline');
      return null;
    }
  }

  /** The server holds a save from a newer build (V5-011): nothing is uploaded for the rest of the session. */
  private held = false;
  private hold(): void {
    this.held = true;
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.setStatus('offline');
  }

  /** Boot gave up waiting: ignore whatever the in-flight pull returns. */
  abandonPull(): void {
    this.pullGen++;
  }

  /** Called after every local save: uploads the latest data after a quiet period. */
  queuePush(data: SaveData, delayMs = this.d.debounceMs ?? 4000): void {
    if (!this.silent || this.held) return;
    this.pending = data;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  /** Uploads pending data now (e.g. when the app goes to the background). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pushing) return this.pushing.then(() => (this.pending ? this.flush() : undefined));
    if (!this.pending) return Promise.resolve();
    this.pushing = this.pushNow().finally(() => {
      this.pushing = null;
    });
    return this.pushing;
  }

  private retryLater(): void {
    this.pushFails++;
    if (this.timer || !this.pending) return;
    const ms = Math.min(300_000, 20_000 * 2 ** Math.min(4, this.pushFails - 1));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private async pushNow(): Promise<void> {
    const data = this.pending;
    if (!data) return;
    this.pending = null;
    if (!(await this.signIn())) {
      this.pending ??= data;
      this.retryLater();
      return;
    }
    this.setStatus('syncing');
    const seq = seqOf(data);
    const body = JSON.parse(JSON.stringify(data)) as SaveData;
    try {
      const r = await this.d.api.putSave(this.meta?.revision ?? 0, body);
      await this.storeMeta({ revision: r.revision, seq });
      this.pushFails = 0;
      this.setStatus(this.pending ? 'syncing' : 'synced');
    } catch (e) {
      if (isApiError(e) && e.status === 409 && e.code === 'save_conflict') {
        if (await this.resolve409(body, seq)) {
          this.pushFails = 0;
          if (!this.held) this.setStatus(this.pending ? 'syncing' : 'synced');
          return;
        }
      }
      this.pending ??= data;
      this.setStatus('offline');
      this.retryLater();
    }
  }

  /** Fetch the server copy, keep the more-played one, retry the upload once. */
  private async resolve409(local: SaveData, seq: number): Promise<boolean> {
    try {
      const remote = await this.d.api.getSave();
      const verdict = resolveConflict(local, remote.data);
      if (verdict === 'hold') {
        this.hold();
        return true;
      }
      const winner = this.canAdopt() ? verdict : 'local';
      if (winner === 'remote') {
        const rdata = remoteSaveData(remote.data)!;
        await this.storeMeta({ revision: remote.revision, seq: seqOf(rdata) });
        this.pending = null; // the local edits lost
        await this.onAdopt(rdata);
        return true;
      }
      const r = await this.d.api.putSave(remote.revision, local);
      await this.storeMeta({ revision: r.revision, seq });
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ shop & entitlements

  async loadCachedEntitlements(): Promise<void> {
    try {
      const t = await this.d.cache.get(ENT_KEY);
      const arr = t ? (JSON.parse(t) as unknown) : [];
      if (Array.isArray(arr)) for (const id of arr) if (typeof id === 'string') this.entitlements.add(id);
    } catch {
      /* ignore */
    }
  }

  has(productId: string): boolean {
    return this.entitlements.has(productId);
  }

  /** Re-reads entitlements from the server; false when that was not possible. */
  async refreshEntitlements(): Promise<boolean> {
    if (!this.signedIn) return false;
    try {
      const r = await this.d.api.entitlements();
      this.entitlements = new Set((r.entitlements ?? []).map((e) => e.productId));
      try {
        await this.d.cache.set(ENT_KEY, JSON.stringify([...this.entitlements]));
      } catch {
        /* ignore */
      }
      return true;
    } catch {
      return false;
    }
  }

  async products(): Promise<Product[] | null> {
    try {
      return await this.d.api.products();
    } catch {
      return null;
    }
  }

  /**
   * Buys a product with Telegram Stars: invoice -> Telegram payment sheet ->
   * on "paid" polls the entitlements briefly (the grant arrives via the bot
   * webhook).
   */
  async buy(productId: string, onStage?: (stage: 'invoice' | 'paying' | 'confirming') => void): Promise<BuyResult> {
    if (!this.silent || !this.d.openInvoice) return 'unavailable';
    if (!(await this.signIn())) return 'offline';
    let link: string;
    try {
      onStage?.('invoice');
      link = (await this.d.api.invoice(productId)).link;
    } catch (e) {
      if (isApiError(e) && e.code === 'already_owned') {
        await this.refreshEntitlements();
        this.entitlements.add(productId);
        return 'owned';
      }
      return isApiError(e) && e.offline ? 'offline' : 'failed';
    }
    onStage?.('paying');
    const status = await this.d.openInvoice(link);
    if (status === 'cancelled') return 'cancelled';
    if (status !== 'paid' && status !== 'pending') return 'failed';
    onStage?.('confirming');
    const sleep = this.d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let i = 0; i < 10; i++) {
      await sleep(i === 0 ? 800 : 1500);
      if ((await this.refreshEntitlements()) && this.has(productId)) return 'granted';
    }
    return 'pending';
  }

  // ------------------------------------------------------------------ battle verification

  /** Fire-and-forget replay check; mismatches are logged, never acted on (v1). */
  verifyBattle(req: VerifyRequest): void {
    if (!this.signedIn) return;
    const log = this.d.log ?? console;
    void this.d.api
      .verifyBattle(req)
      .then((r) => {
        if (!r.match) log.warn('[pixelarrow] battle verify mismatch', r.mismatches, r.server);
      })
      .catch(() => {
        /* offline / not configured: ignore */
      });
  }
}
