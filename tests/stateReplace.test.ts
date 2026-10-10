/**
 * ST-02c (V5-036) at boot: when the cloud copy that comes back is another
 * campaign, the local campaign is kept as a backup (`px_replaced`) before the
 * cloud one is written, and the player is told. Storage and the cloud are
 * in-memory fakes; the cloud decision itself is tested in campaignIdentity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV, SaveData } from '../src/game/save';

const store = new Map<string, string>();
function memKV(s: Map<string, string>): KV {
  return { get: async (k) => s.get(k) ?? null, set: async (k, v) => void s.set(k, v), remove: async (k) => void s.delete(k) };
}
const cloud = { reply: null as SaveData | null };
const pushed: SaveData[] = [];
vi.mock('../src/platform/storage', () => ({
  gameKV: () => ({ primary: memKV(store), mirror: null, cloud: false }),
  localKV: () => memKV(new Map()),
  safeLocalStorage: () => null,
}));
vi.mock('../src/platform/cloud', () => ({
  online: {
    available: true,
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async () => (cloud.reply ? (JSON.parse(JSON.stringify(cloud.reply)) as SaveData) : null),
    abandonPull: () => undefined,
    queuePush: (d: SaveData) => void pushed.push(JSON.parse(JSON.stringify(d)) as SaveData),
  },
}));
vi.mock('../src/platform/telegram', () => ({ setHaptics: () => undefined }));

import { state } from '../src/state';
import { Campaign } from '../src/game/campaign';
import { campaignIdOf, readReplaced, readSave, writeSave } from '../src/game/save';

const kv = memKV(store);
function camp(seed: number, gold: number): SaveData {
  const d = JSON.parse(JSON.stringify(Campaign.fresh(seed).sync())) as SaveData;
  return { ...d, gold, seq: 10 };
}

beforeEach(() => {
  store.clear();
  pushed.length = 0;
  cloud.reply = null;
  state.notice = null;
});

describe('the cloud campaign replaces a different local one', () => {
  it('the local campaign is kept as a backup, the cloud one is loaded and saved locally, and the player is told', async () => {
    const stray = camp(200, 11);
    await writeSave(kv, stray);
    cloud.reply = camp(100, 5000);
    await state.load();
    expect(state.campaign.data.gold).toBe(5000);
    expect((await readSave(kv))?.gold).toBe(5000);
    const backup = await readReplaced(kv);
    expect(backup?.data.gold).toBe(11);
    expect(campaignIdOf(backup!.data)).toBe(campaignIdOf(stray));
    expect(state.notice).toBe('save.replaced');
    expect(pushed).toHaveLength(0);
  });

  it('a newer copy of the same campaign is adopted as before: no backup, no notice', async () => {
    await writeSave(kv, camp(100, 11));
    cloud.reply = camp(100, 5000);
    await state.load();
    expect(state.campaign.data.gold).toBe(5000);
    expect(await readReplaced(kv)).toBeNull();
    expect(state.notice).toBeNull();
  });

  it('no cloud copy: the local campaign loads untouched', async () => {
    await writeSave(kv, camp(200, 11));
    await state.load();
    expect(state.campaign.data.gold).toBe(11);
    expect(await readReplaced(kv)).toBeNull();
    expect(state.notice).toBeNull();
  });
});

describe('campaign ids on save', () => {
  it('a legacy save with no campaignId gets one on its first save', async () => {
    const legacy = camp(300, 11);
    delete legacy.campaignId;
    await writeSave(kv, legacy);
    await state.load();
    expect(state.campaign.data.campaignId).toBeUndefined();
    await state.save();
    const id = (await readSave(kv))?.campaignId;
    expect(id).toBe(campaignIdOf(camp(300, 0)));
    expect(pushed.at(-1)?.campaignId).toBe(id);
  });

  it('"New campaign" gets a new id and names the one it replaced', async () => {
    await writeSave(kv, camp(300, 11));
    await state.load();
    const old = campaignIdOf(state.campaign.data);
    await state.reset();
    const saved = (await readSave(kv))!;
    expect(saved.campaignId).toBeTruthy();
    expect(saved.campaignId).not.toBe(old);
    expect(saved.prevCampaignId).toBe(old);
  });
});
