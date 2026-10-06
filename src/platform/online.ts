/**
 * Online layer: sign-in, cloud save sync, entitlements, shop purchases and
 * fire-and-forget battle verification against the Worker API.
 *
 * Contract with the rest of the game: nothing here may block or break play.
 * Every method resolves (never rejects); failures just flip the sync status to
 * `offline` and are retried later with backoff. Outside Telegram (no initData)
 * the layer is inert: status `local`, no network requests at all.
 */
import { ApiClient, isApiError, type Product, type VerifyRequest } from './api';
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
  initData: () => string | null;
  /** Sign in with the DEV_AUTH test user (local `wrangler dev` only). */
  devAuth?: boolean;
  openInvoice?: (link: string) => Promise<InvoiceStatus>;
  debounceMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: Pick<Console, 'warn' | 'info'>;
}

export type BuyResult = 'granted' | 'pending' | 'cancelled' | 'failed' | 'owned' | 'offline' | 'unavailable';

export class Online {
  status: SyncStatus = 'local';
  playerName: string | null = null;
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

  /** There is a way to sign in (inside Telegram, or dev auth). */
  get available(): boolean {
    return !!this.d.initData() || !!this.d.devAuth;
  }

  get signedIn(): boolean {
    return !!this.d.api.token;
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

  /** Signs in once (deduplicated, with backoff after failures). */
  signIn(): Promise<boolean> {
    if (this.d.api.token) return Promise.resolve(true);
    if (!this.available) {
      this.setStatus('local');
      return Promise.resolve(false);
    }
    if (this.authing) return this.authing;
    if (this.now() < this.nextAuthAt) return Promise.resolve(false);
    this.authing = (async () => {
      try {
        const init = this.d.initData();
        const r = init ? await this.d.api.authTelegram(init) : await this.d.api.authDev();
        this.playerName = r.player?.firstName ?? r.player?.username ?? null;
        this.authFails = 0;
        void this.refreshEntitlements();
        return true;
      } catch {
        this.authFails++;
        this.nextAuthAt = this.now() + Math.min(300_000, 15_000 * 2 ** Math.min(4, this.authFails - 1));
        this.setStatus('offline');
        return false;
      } finally {
        this.authing = null;
      }
    })();
    return this.authing;
  }

  private async reauth(): Promise<string | null> {
    this.d.api.token = null;
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
    if (!this.available) {
      this.setStatus('local');
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

  /** Boot gave up waiting: ignore whatever the in-flight pull returns. */
  abandonPull(): void {
    this.pullGen++;
  }

  /** Called after every local save: uploads the latest data after a quiet period. */
  queuePush(data: SaveData, delayMs = this.d.debounceMs ?? 4000): void {
    if (!this.available) return;
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
          this.setStatus(this.pending ? 'syncing' : 'synced');
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
      const winner = this.canAdopt() ? resolveConflict(local, remote.data) : 'local';
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
    if (!this.d.api.token) return false;
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
    if (!this.available || !this.d.openInvoice) return 'unavailable';
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
    if (!this.d.api.token) return;
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
