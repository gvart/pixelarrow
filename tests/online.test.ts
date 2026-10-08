import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from '../src/platform/api';
import { Online, SUPPORTER_BANNER, type OnlineDeps } from '../src/platform/online';
import { compareSaves, decideOnLoad, parseSyncMeta, resolveConflict, SYNC_META_KEY } from '../src/platform/saveSync';
import { Campaign } from '../src/game/campaign';
import type { KV, SaveData } from '../src/game/save';

function memoryKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async set(k, v) { store.set(k, v); },
    async remove(k) { store.delete(k); },
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function save(seq: number, extra: Partial<SaveData> = {}): SaveData {
  const d = Campaign.fresh(42).sync();
  return { ...JSON.parse(JSON.stringify(d)), seq, savedAt: 1000 + seq, ...extra };
}

/** In-memory stand-in for the Worker: auth, save with revisions, shop. */
function fakeServer(opts: { down?: number; save?: { revision: number; data: unknown } } = {}) {
  const st = { revision: opts.save?.revision ?? 0, data: opts.save?.data ?? null, puts: [] as { revision: number; data: SaveData }[], ents: [] as string[] };
  const calls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (opts.down) return json(opts.down, { error: { code: 'not_configured', message: 'database not configured' } });
    const authed = (init?.headers as Record<string, string>)?.authorization === 'Bearer tok';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (url === '/api/auth/telegram') return json(200, { token: 'tok', expiresAt: 0, player: { id: 1, firstName: 'Ana' } });
    if (url === '/api/shop/products') return json(200, { products: [{ id: SUPPORTER_BANNER, title: 'Supporter banner', description: 'Gold', stars: 5, kind: 'entitlement' }] });
    if (!authed) return json(401, { error: { code: 'unauthorized', message: 'no' } });
    if (url === '/api/save' && method === 'GET') return json(200, { revision: st.revision, version: 3, data: st.data, updatedAt: 1 });
    if (url === '/api/save' && method === 'PUT') {
      if (body.revision !== st.revision) return json(409, { error: { code: 'save_conflict', message: 'conflict', revision: st.revision } });
      st.revision++;
      st.data = body.data;
      st.puts.push(body);
      return json(200, { revision: st.revision, updatedAt: 2 });
    }
    if (url === '/api/entitlements') return json(200, { entitlements: st.ents.map((p) => ({ productId: p, grantedAt: 1 })), purchases: [] });
    if (url === '/api/shop/invoice') return json(200, { link: 'https://t.me/$inv', productId: body.productId, stars: 5 });
    return json(404, { error: { code: 'not_found', message: 'nope' } });
  };
  return { st, calls, fetch };
}

function makeOnline(fetch: FetchLike, over: Partial<OnlineDeps> = {}) {
  const kv = memoryKV();
  const cache = memoryKV();
  const online = new Online({
    api: new ApiClient({ base: '', fetch, timeoutMs: 200 }),
    kv: () => kv,
    cache,
    initData: () => 'query_id=1&hash=abc',
    debounceMs: 0,
    openInvoice: async () => 'cancelled',
    sleep: async () => {},
    log: { warn: () => {}, info: () => {} },
    ...over,
  });
  return { online, kv, cache };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('api client', () => {
  it('maps the server error shape to ApiError with extra fields', async () => {
    const api = new ApiClient({ fetch: async () => json(409, { error: { code: 'save_conflict', message: 'changed', revision: 7 } }) });
    api.token = 't';
    const e = await api.putSave(1, { v: 3 }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('save_conflict');
    expect(e.message).toBe('changed');
    expect(e.extra.revision).toBe(7);
    expect(e.offline).toBe(false);
  });

  it('treats 503, network failures, timeouts and non-JSON answers as offline', async () => {
    const e503 = await new ApiClient({ fetch: async () => json(503, { error: { code: 'not_configured', message: 'database not configured' } }) })
      .products()
      .catch((x) => x);
    expect([e503.code, e503.offline]).toEqual(['not_configured', true]);
    const enet = await new ApiClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).products().catch((x) => x);
    expect([enet.code, enet.status, enet.offline]).toEqual(['network', 0, true]);
    const eto = await new ApiClient({ fetch: () => new Promise<Response>(() => {}), timeoutMs: 20 }).products().catch((x) => x);
    expect([eto.code, eto.offline]).toEqual(['timeout', true]);
    const ehtml = await new ApiClient({ fetch: async () => new Response('<!doctype html>', { status: 200 }) }).products().catch((x) => x);
    expect([ehtml.code, ehtml.offline]).toEqual(['bad_response', true]);
    const eplain = await new ApiClient({ fetch: async () => new Response('Bad gateway', { status: 502 }) }).products().catch((x) => x);
    expect([eplain.code, eplain.offline]).toEqual(['http_502', true]);
  });

  it('sends the bearer token and re-authenticates once on 401', async () => {
    const seen: string[] = [];
    const api = new ApiClient({
      fetch: async (_u, init) => {
        const a = (init?.headers as Record<string, string>).authorization;
        seen.push(a);
        return a === 'Bearer fresh' ? json(200, { entitlements: [], purchases: [] }) : json(401, { error: { code: 'unauthorized', message: 'expired' } });
      },
      reauth: async () => 'fresh',
    });
    api.token = 'stale';
    await expect(api.entitlements()).resolves.toEqual({ entitlements: [], purchases: [] });
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(api.token).toBe('fresh');
  });

  it('refuses authenticated calls without a token, without hitting the network', async () => {
    const f = vi.fn();
    const e = await new ApiClient({ fetch: f }).getSave().catch((x) => x);
    expect(e.code).toBe('unauthorized');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('save sync decisions', () => {
  it('orders saves by seq, then savedAt, then battles fought', () => {
    expect(compareSaves(save(5), save(4))).toBeGreaterThan(0);
    expect(compareSaves(save(5, { savedAt: 1 }), save(5, { savedAt: 2 }))).toBeLessThan(0);
    expect(compareSaves(save(5, { savedAt: 1, fought: 3 }), save(5, { savedAt: 1, fought: 1 }))).toBeGreaterThan(0);
  });

  it('decides what to do at boot', () => {
    const local = save(10);
    // nothing on the server: upload
    expect(decideOnLoad(local, null, { revision: 0, data: null })).toEqual({ action: 'push', revision: 0 });
    expect(decideOnLoad(null, null, { revision: 0, data: null }).action).toBe('none');
    // nothing locally: take the server copy
    expect(decideOnLoad(null, null, { revision: 3, data: save(2) }).action).toBe('adopt');
    // server moved on, local untouched since the last sync: adopt
    expect(decideOnLoad(local, { revision: 2, seq: 10 }, { revision: 4, data: save(14) }).action).toBe('adopt');
    // ...even if the server copy has a lower counter (we had nothing new)
    expect(decideOnLoad(local, { revision: 2, seq: 10 }, { revision: 4, data: save(3) }).action).toBe('adopt');
    // both changed: the more-played copy wins
    expect(decideOnLoad(save(20), { revision: 2, seq: 10 }, { revision: 4, data: save(14) })).toEqual({ action: 'push', revision: 4 });
    expect(decideOnLoad(save(12), { revision: 2, seq: 10 }, { revision: 4, data: save(14) }).action).toBe('adopt');
    // server unchanged
    expect(decideOnLoad(local, { revision: 4, seq: 10 }, { revision: 4, data: save(10) }).action).toBe('none');
    expect(decideOnLoad(save(11), { revision: 4, seq: 10 }, { revision: 4, data: save(10) })).toEqual({ action: 'push', revision: 4 });
    // database reset: our copy is the reference
    expect(decideOnLoad(local, { revision: 9, seq: 10 }, { revision: 1, data: save(1) })).toEqual({ action: 'push', revision: 1 });
    // a corrupt server blob never replaces a good local save
    expect(decideOnLoad(local, null, { revision: 5, data: { v: 3, junk: true } })).toEqual({ action: 'push', revision: 5 });
  });

  it('resolves a 409 by keeping the more-played copy (ties stay local)', () => {
    expect(resolveConflict(save(5), save(6))).toBe('remote');
    expect(resolveConflict(save(6), save(5))).toBe('local');
    expect(resolveConflict(save(6), save(6))).toBe('local');
    expect(resolveConflict(save(6), null)).toBe('local');
  });

  it('parses stored sync metadata defensively', () => {
    expect(parseSyncMeta('{"revision":3,"seq":9}')).toEqual({ revision: 3, seq: 9 });
    expect(parseSyncMeta('nope')).toBeNull();
    expect(parseSyncMeta('{"revision":"3"}')).toBeNull();
    expect(parseSyncMeta(null)).toBeNull();
  });
});

describe('online layer', () => {
  it('is inert outside Telegram: no requests, local status', async () => {
    const f = vi.fn();
    const { online } = makeOnline(f, { initData: () => null });
    expect(await online.pullOnLoad(save(1))).toBeNull();
    online.queuePush(save(2));
    await online.flush();
    expect(await online.buy(SUPPORTER_BANNER)).toBe('unavailable');
    expect(online.status).toBe('local');
    expect(f).not.toHaveBeenCalled();
  });

  it('keeps playing offline when the API is down (503 not configured)', async () => {
    const srv = fakeServer({ down: 503 });
    const { online } = makeOnline(srv.fetch);
    expect(await online.pullOnLoad(save(1))).toBeNull();
    expect(online.status).toBe('offline');
    online.queuePush(save(2));
    await online.flush();
    expect(online.status).toBe('offline');
    expect(await online.buy(SUPPORTER_BANNER)).toBe('offline');
    expect(await online.products()).toBeNull();
    // auth backs off instead of hammering the server
    const before = srv.calls.length;
    await online.signIn();
    expect(srv.calls.length).toBe(before);
  });

  it('keeps playing when the network throws', async () => {
    const { online } = makeOnline(async () => { throw new TypeError('Failed to fetch'); });
    await expect(online.pullOnLoad(save(1))).resolves.toBeNull();
    expect(online.status).toBe('offline');
  });

  it('uploads the first save and remembers the revision', async () => {
    const srv = fakeServer();
    const { online, kv } = makeOnline(srv.fetch);
    expect(await online.pullOnLoad(save(3))).toBeNull();
    await tick();
    await online.flush();
    expect(srv.st.revision).toBe(1);
    expect(online.status).toBe('synced');
    expect(JSON.parse(kv.store.get(SYNC_META_KEY)!)).toEqual({ revision: 1, seq: 3 });
    online.queuePush(save(4));
    await online.flush();
    expect(srv.st.puts.map((p) => p.revision)).toEqual([0, 1]);
  });

  it('adopts a newer server copy at boot', async () => {
    const srv = fakeServer({ save: { revision: 7, data: save(30) } });
    const { online, kv } = makeOnline(srv.fetch);
    await kv.set(SYNC_META_KEY, JSON.stringify({ revision: 5, seq: 12 }));
    const got = await online.pullOnLoad(save(12));
    expect(got?.seq).toBe(30);
    expect(online.status).toBe('synced');
    expect(JSON.parse(kv.store.get(SYNC_META_KEY)!)).toEqual({ revision: 7, seq: 30 });
  });

  it('on 409 re-uploads when the local copy is newer', async () => {
    const srv = fakeServer({ save: { revision: 4, data: save(8) } });
    const { online } = makeOnline(srv.fetch);
    await online.signIn();
    online.queuePush(save(9)); // never pulled: base revision 0 -> conflict
    await online.flush();
    expect(srv.st.revision).toBe(5);
    expect((srv.st.data as SaveData).seq).toBe(9);
    expect(online.status).toBe('synced');
  });

  it('on 409 adopts the server copy when it is newer', async () => {
    const srv = fakeServer({ save: { revision: 4, data: save(50) } });
    const { online } = makeOnline(srv.fetch);
    const adopted: SaveData[] = [];
    online.onAdopt = (d) => void adopted.push(d);
    await online.signIn();
    online.queuePush(save(9));
    await online.flush();
    expect(adopted.map((d) => d.seq)).toEqual([50]);
    expect(srv.st.revision).toBe(4);
  });

  it('never replaces the campaign mid-battle: local wins the conflict', async () => {
    const srv = fakeServer({ save: { revision: 4, data: save(50) } });
    const { online } = makeOnline(srv.fetch);
    const onAdopt = vi.fn();
    online.onAdopt = onAdopt;
    online.canAdopt = () => false;
    await online.signIn();
    online.queuePush(save(9));
    await online.flush();
    expect(onAdopt).not.toHaveBeenCalled();
    expect((srv.st.data as SaveData).seq).toBe(9);
  });

  it('buys through Telegram and polls entitlements until granted', async () => {
    const srv = fakeServer();
    let polls = 0;
    const { online, cache } = makeOnline(srv.fetch, {
      openInvoice: async (link) => {
        expect(link).toBe('https://t.me/$inv');
        return 'paid';
      },
      sleep: async () => {
        if (++polls === 2) srv.st.ents.push(SUPPORTER_BANNER); // webhook lands later
      },
    });
    expect(await online.buy(SUPPORTER_BANNER)).toBe('granted');
    expect(online.has(SUPPORTER_BANNER)).toBe(true);
    expect(JSON.parse(cache.store.get('px_ent')!)).toEqual([SUPPORTER_BANNER]);
    // cached entitlements survive an offline relaunch
    const again = new Online({ api: new ApiClient({ fetch: srv.fetch }), kv: () => memoryKV(), cache, initData: () => null });
    await again.loadCachedEntitlements();
    expect(again.has(SUPPORTER_BANNER)).toBe(true);
  });

  it('reports a cancelled payment', async () => {
    const srv = fakeServer();
    const { online } = makeOnline(srv.fetch, { openInvoice: async () => 'cancelled' });
    expect(await online.buy(SUPPORTER_BANNER)).toBe('cancelled');
  });

  it('logs battle verification mismatches and swallows errors', async () => {
    const warn = vi.fn();
    const fetch: FetchLike = async (url) =>
      url === '/api/auth/telegram' ? json(200, { token: 'tok', expiresAt: 0, player: { id: 1 } }) : json(200, { match: false, mismatches: [{ field: 'winner' }] });
    const { online } = makeOnline(fetch, { log: { warn, info: () => {} } });
    await online.signIn();
    online.verifyBattle({ setup: {}, orders: [], claim: { winner: 0, ticks: 1 } });
    await tick();
    expect(warn).toHaveBeenCalledOnce();
    const down = makeOnline(async () => { throw new TypeError('offline'); });
    expect(() => down.online.verifyBattle({ setup: {}, orders: [], claim: { winner: 0, ticks: 1 } })).not.toThrow();
  });
});
