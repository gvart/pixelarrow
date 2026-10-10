/**
 * ST-02c (V5-036): a v4/`main` bundle that resets a device's local save starts
 * a fresh campaign there. A v6 client on that device must not later push that
 * campaign over the real one in the cloud: when the two copies are different
 * campaigns and the cloud copy is at the same or a newer save version, the
 * cloud copy wins and the local one is kept as a backup. The same campaign on
 * several devices keeps the seq/revision rules.
 */
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from '../src/platform/api';
import { Online } from '../src/platform/online';
import { decideOnLoad, resolveConflict, SYNC_META_KEY } from '../src/platform/saveSync';
import { Campaign } from '../src/game/campaign';
import { campaignIdOf, migrate, type KV, type SaveData } from '../src/game/save';

/** A played v6 campaign (fresh from `seed`), as the cloud or a device holds it. */
function camp(seed: number, seq: number): SaveData {
  const d = JSON.parse(JSON.stringify(Campaign.fresh(seed).sync())) as SaveData;
  return { ...d, seq, savedAt: 1000 + seq };
}

/** What `main` (v4, SAVE_VERSION 5) writes after it reset the device: a fresh v5 campaign with no id. */
function mainReset(seed: number, seq: number): Record<string, unknown> {
  const d = camp(seed, seq) as unknown as Record<string, unknown>;
  delete d.campaignId;
  return { ...d, v: 5 };
}

/** The v6 client's view of that local save after load (migrated to v6). */
const loaded = (raw: unknown) => migrate(JSON.parse(JSON.stringify(raw)))!;

describe('every campaign has a stable id', () => {
  it('a new campaign carries one; the same campaign read on two devices has the same id', () => {
    expect(camp(1, 0).campaignId).toMatch(/^w[0-9a-z]+$/);
    expect(campaignIdOf(camp(1, 0))).toBe(campaignIdOf(camp(1, 30)));
    expect(campaignIdOf(camp(1, 0))).not.toBe(campaignIdOf(camp(2, 0)));
  });

  it('a legacy save without an id gets the id derived from its map, so two devices agree on it', () => {
    const legacy = loaded(mainReset(7, 5));
    expect(legacy.campaignId).toBeUndefined();
    expect(campaignIdOf(legacy)).toBe(campaignIdOf(camp(7, 0)));
  });
});

describe('boot: the cloud holds a different campaign (decideOnLoad)', () => {
  const real = camp(100, 50);
  const meta = { revision: 9, seq: 50 };

  it('cloud v6 >= local: the cloud copy is adopted even though the local one is further along', () => {
    const local = loaded(mainReset(200, 80)); // main reset the device, then played 80 saves
    expect(decideOnLoad(local, meta, { revision: 9, data: real })).toEqual({ action: 'adopt', data: real, revision: 9 });
  });

  it('also when the local copy has not passed the last synced seq (today it would be pushed on the next save)', () => {
    const local = loaded(mainReset(200, 3));
    expect(decideOnLoad(local, meta, { revision: 9, data: real }).action).toBe('adopt');
  });

  it('also when the stray campaign was already migrated and saved as v6 by an offline boot', () => {
    expect(decideOnLoad(camp(200, 81), meta, { revision: 9, data: real }).action).toBe('adopt');
  });

  it('a cloud copy at a lower version than the local one keeps the seq rules', () => {
    const old = mainReset(300, 10);
    expect(decideOnLoad(camp(200, 81), { revision: 9, seq: 10 }, { revision: 9, data: old }).action).toBe('push');
  });

  it('a new campaign the player started on this device (it names the one it replaced) keeps the seq rules', () => {
    const fresh = { ...camp(200, 51), prevCampaignId: campaignIdOf(real) };
    expect(decideOnLoad(fresh, meta, { revision: 9, data: real }).action).toBe('push');
  });
});

describe('boot: the same campaign keeps today\'s rules', () => {
  it('unsynced local progress is pushed; a newer cloud copy is adopted', () => {
    expect(decideOnLoad(camp(100, 55), { revision: 9, seq: 50 }, { revision: 9, data: camp(100, 50) }).action).toBe('push');
    expect(decideOnLoad(camp(100, 50), { revision: 9, seq: 50 }, { revision: 12, data: camp(100, 60) }).action).toBe('adopt');
    expect(decideOnLoad(camp(100, 70), { revision: 9, seq: 50 }, { revision: 12, data: camp(100, 60) }).action).toBe('push');
  });

  it('a legacy local copy (no id) of the cloud campaign is the same campaign', () => {
    const legacy = loaded(mainReset(100, 70));
    expect(decideOnLoad(legacy, { revision: 9, seq: 50 }, { revision: 12, data: camp(100, 60) }).action).toBe('push');
  });

  it('no cloud copy: the local one is pushed', () => {
    expect(decideOnLoad(loaded(mainReset(200, 3)), null, { revision: 0, data: null })).toEqual({ action: 'push', revision: 0 });
  });
});

describe('during play: a 409 against a different campaign never overwrites it', () => {
  it('holds instead of uploading', () => {
    expect(resolveConflict(camp(200, 99), camp(100, 50))).toBe('hold');
    expect(resolveConflict(camp(100, 99), camp(100, 50))).toBe('local');
  });
});

describe('the online layer with a server', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  function setup(cloud: SaveData) {
    const st = { revision: 9, data: cloud as unknown, puts: 0 };
    const fetch: FetchLike = async (url, init) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (url === '/api/auth/telegram') return json(200, { token: 'tok', expiresAt: 0, player: { id: 1 } });
      if (url === '/api/save' && method === 'GET') return json(200, { revision: st.revision, version: 6, data: st.data, updatedAt: 1 });
      if (url === '/api/save' && method === 'PUT') {
        if (body.revision !== st.revision) return json(409, { error: { code: 'save_conflict', message: 'conflict' } });
        st.revision++;
        st.puts++;
        st.data = body.data;
        return json(200, { revision: st.revision, updatedAt: 2 });
      }
      return json(404, { error: { code: 'not_found', message: 'nope' } });
    };
    const store = new Map<string, string>();
    const kv: KV = { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v), remove: async (k) => void store.delete(k) };
    const online = new Online({ api: new ApiClient({ base: '', fetch, timeoutMs: 200 }), kv: () => kv, cache: kv, initData: () => 'x', debounceMs: 0 });
    return { st, store, online };
  }

  it('boot returns the cloud campaign and uploads nothing', async () => {
    const real = camp(100, 50);
    const { st, store, online } = setup(real);
    store.set(SYNC_META_KEY, JSON.stringify({ revision: 9, seq: 50 }));
    const got = await online.pullOnLoad(loaded(mainReset(200, 80)));
    expect(got && campaignIdOf(got)).toBe(campaignIdOf(real));
    await online.flush();
    expect(st.puts).toBe(0);
    expect(st.data).toEqual(real);
  });

  it('a push after an offline boot gets a 409 and holds: the cloud campaign survives', async () => {
    const real = camp(100, 50);
    const { st, online } = setup(real);
    online.queuePush(camp(200, 81)); // no successful pull: base revision 0
    await online.flush();
    online.queuePush(camp(200, 82));
    await online.flush();
    expect(st.puts).toBe(0);
    expect(st.data).toEqual(real);
  });
});
