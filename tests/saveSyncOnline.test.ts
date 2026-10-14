/**
 * The web's cookie sessions sync the campaign save (V6-ACCT-07, accounts-v6.md UXA-03, §4.5, §6.3):
 * a guest's campaign goes up to a new account, a device that has none takes the account's, and when
 * both have progress nothing is written until the player picks one (AU-08). Log out keeps the
 * campaign on the device as a guest save with its sync metadata removed. Telegram is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';
import { Online, type OnlineDeps } from '../src/platform/online';
import { SYNC_META_KEY } from '../src/platform/saveSync';
import type { Auth } from '../src/platform/core/auth';
import { Campaign } from '../src/game/campaign';
import type { KV, SaveData } from '../src/game/save';
import { telegramAuth } from './fakes/platform';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const web: Auth = { transport: 'cookie', methods: () => ['password'], silentProof: () => null };

function memoryKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async set(k, v) { store.set(k, v); },
    async remove(k) { store.delete(k); },
  };
}

function save(seq: number, extra: Partial<SaveData> = {}): SaveData {
  const d = Campaign.fresh(42).sync();
  return { ...JSON.parse(JSON.stringify(d)), seq, savedAt: 1000 + seq, ...extra };
}

/** The Worker as a web browser sees it: a cookie session (or none), /api/me and the save. */
function worker(o: { pid?: number; cloud?: { revision: number; data: SaveData | null }; banned?: boolean } = {}) {
  const st = { live: true, pid: o.pid ?? 7, revision: o.cloud?.revision ?? 0, data: (o.cloud?.data ?? null) as SaveData | null, puts: [] as SaveData[], calls: [] as string[] };
  const fetch: FetchLike = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    st.calls.push(`${method} ${url}`);
    if (o.banned) return json(403, { error: { code: 'banned', message: 'banned' } });
    if (!st.live || init.credentials !== 'same-origin') return json(401, { error: { code: 'unauthorized', message: 'no session' } });
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    if (url === '/api/me') return json(200, { player: { id: st.pid, displayName: 'Swift Fox 12', telegramId: null }, session: { expiresAt: 1, transport: 'cookie' } });
    if (url === '/api/save' && method === 'GET') return json(200, { revision: st.revision, version: 3, data: st.data, updatedAt: 1 });
    if (url === '/api/save' && method === 'PUT') {
      if (body.revision !== st.revision) return json(409, { error: { code: 'save_conflict', message: 'conflict' } });
      st.revision++;
      st.data = body.data;
      st.puts.push(body.data);
      return json(200, { revision: st.revision, updatedAt: 2 });
    }
    if (url === '/api/auth/logout') {
      st.live = false;
      return json(200, { ok: true });
    }
    return json(404, { error: { code: 'not_found', message: 'nope' } });
  };
  return { st, fetch };
}

function make(fetch: FetchLike, over: Partial<OnlineDeps> = {}) {
  const kv = memoryKV();
  const auth = over.auth ?? web;
  const online = new Online({
    api: new ApiClient({ base: '', fetch, timeoutMs: 200, transport: () => auth.transport }),
    kv: () => kv,
    cache: memoryKV(),
    auth,
    debounceMs: 0,
    sleep: async () => {},
    log: { warn: () => {}, info: () => {} },
    ...over,
  });
  return { online, kv };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('a guest signs up: the guest save goes up to the new account', () => {
  it('uploads the whole campaign with no question when the account has none', async () => {
    const w = worker();
    const { online, kv } = make(w.fetch);
    const guest = save(40, { won: 6, gold: 344 });
    expect(await online.pullOnLoad(guest)).toBeNull();
    await tick();
    await online.flush();
    expect(w.st.puts).toHaveLength(1);
    expect(w.st.data).toMatchObject({ won: 6, gold: 344, seq: 40 });
    expect(JSON.parse(kv.store.get(SYNC_META_KEY)!)).toEqual({ revision: 1, seq: 40, pid: 7 });
    expect(online.status).toBe('synced');
    // and later saves follow it up
    online.queuePush(save(41, { won: 7 }));
    await online.flush();
    expect(w.st.data).toMatchObject({ won: 7 });
  });

  it('a device with no campaign takes the account’s', async () => {
    const w = worker({ cloud: { revision: 3, data: save(12, { won: 22 }) } });
    const { online } = make(w.fetch);
    expect((await online.pullOnLoad(null))?.won).toBe(22);
    expect(w.st.puts).toHaveLength(0);
  });
});

describe('Two campaigns (AU-08): both sides have progress', () => {
  it('writes nothing until the player picks, then keeps the account’s campaign', async () => {
    const w = worker({ cloud: { revision: 5, data: save(12, { won: 22 }) } });
    const { online, kv } = make(w.fetch);
    const guest = save(40, { won: 6 });
    expect(await online.pullOnLoad(guest)).toBeNull();
    expect(online.choice).toMatchObject({ prefer: 'cloud', revision: 5 });
    expect(online.choice?.local.won).toBe(6);
    expect(online.choice?.cloud.won).toBe(22);
    // play goes on locally while the sheet is up: nothing is uploaded
    online.queuePush(save(41, { won: 6 }));
    await tick();
    await online.flush();
    expect(w.st.puts).toHaveLength(0);
    expect(kv.store.has(SYNC_META_KEY)).toBe(false);
    const kept = await online.resolveChoice('cloud', save(41, { won: 6 }));
    expect(kept?.won).toBe(22);
    expect(online.choice).toBeNull();
    expect(w.st.puts).toHaveLength(0);
    expect(JSON.parse(kv.store.get(SYNC_META_KEY)!)).toEqual({ revision: 5, seq: 12, pid: 7 });
  });

  it('keeping this browser’s campaign uploads the latest local copy over the account’s', async () => {
    const w = worker({ cloud: { revision: 5, data: save(12, { won: 22 }) } });
    const { online, kv } = make(w.fetch);
    await online.pullOnLoad(save(40, { won: 6 }));
    expect(await online.resolveChoice('local', save(41, { won: 6, gold: 99 }))).toBeNull();
    await online.flush();
    expect(w.st.puts).toHaveLength(1);
    expect(w.st.data).toMatchObject({ won: 6, gold: 99, seq: 41 });
    expect(JSON.parse(kv.store.get(SYNC_META_KEY)!)).toEqual({ revision: 6, seq: 41, pid: 7 });
  });

  it('metadata from another player on this device counts as none (a second person logs in)', async () => {
    const w = worker({ pid: 8, cloud: { revision: 5, data: save(12, { won: 22 }) } });
    const { online, kv } = make(w.fetch);
    await kv.set(SYNC_META_KEY, JSON.stringify({ revision: 5, seq: 12, pid: 7 }));
    expect(await online.pullOnLoad(save(40, { won: 6 }))).toBeNull();
    expect(online.choice).not.toBeNull();
    expect(w.st.puts).toHaveLength(0);
  });

  it('Telegram never asks: the copy with more progress wins, as before', async () => {
    let n = 0;
    const st = { revision: 5, data: save(12, { won: 22 }) as SaveData };
    const fetch: FetchLike = async (url, init = {}) => {
      if (url === '/api/auth/telegram') return json(200, { token: `tok${++n}`, expiresAt: 0, player: { id: 1, firstName: 'Ana' } });
      if (url === '/api/save' && (init.method ?? 'GET') === 'GET') return json(200, { revision: st.revision, version: 3, data: st.data, updatedAt: 1 });
      return json(404, { error: { code: 'not_found', message: 'nope' } });
    };
    const { online } = make(fetch, { auth: telegramAuth('query_id=1&hash=abc') });
    expect((await online.pullOnLoad(save(40, { won: 6 })))?.won).toBe(22);
    expect(online.choice).toBeNull();
  });
});

describe('guests and log out', () => {
  it('a guest (no session) never touches the cloud save', async () => {
    const w = worker();
    w.st.live = false;
    const { online } = make(w.fetch);
    expect(await online.pullOnLoad(save(3, { won: 2 }))).toBeNull();
    online.queuePush(save(4, { won: 2 }));
    await online.flush();
    expect(w.st.calls.filter((c) => c.includes('/api/save'))).toEqual([]);
    expect(online.status).toBe('local');
  });

  it('log out uploads what is pending first, then keeps the campaign as a guest save with no sync metadata', async () => {
    const w = worker();
    const { online, kv } = make(w.fetch, { debounceMs: 60_000 });
    await online.pullOnLoad(save(3, { won: 1 }));
    await online.flush();
    online.queuePush(save(4, { won: 2 })); // waiting for the quiet period
    await online.signOut(() => online.api.logout());
    expect(w.st.data).toMatchObject({ won: 2 });
    expect(kv.store.has(SYNC_META_KEY)).toBe(false);
    expect(online.signedIn).toBe(false);
    const puts = w.st.puts.length;
    online.queuePush(save(5, { won: 3 }));
    await online.flush();
    expect(w.st.puts).toHaveLength(puts);
  });

  it('a banned account is signed out and says so (Q4)', async () => {
    const w = worker({ banned: true });
    const { online } = make(w.fetch);
    expect(await online.ensureSession()).toBe('signed_out');
    expect(online.banned).toBe(true);
    expect(online.status).toBe('local');
  });
});
