/**
 * The save through the platform (ADR-0006 M4): gameKV() is platform.storage.save(),
 * a save round-trips through it, and a save written before M4 (by the old
 * telegramKV / localKV pair: CloudStorage keys as they are, localStorage keys
 * under `pixelarrow:`) still loads, on Telegram and on the web.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV, SaveData } from '../src/game/save';
import type { Platform } from '../src/platform/core/index';

vi.mock('../src/platform/cloud', () => ({
  online: {
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async () => null,
    abandonPull: () => undefined,
    queuePush: () => undefined,
  },
}));
vi.mock('../src/platform/haptics', async (orig) => ({ ...(await orig<typeof import('../src/platform/haptics')>()), setHaptics: () => undefined }));

import { state } from '../src/state';
import { Campaign } from '../src/game/campaign';
import { readSave, writeSave } from '../src/game/save';
import { gameKV } from '../src/platform/storage';
import { platform, setPlatformForTests } from '../src/platform';
import { createTelegramPlatform, type TgWebApp } from '../src/platform/telegram/index';
import { createWebPlatform } from '../src/platform/web/index';
import { FakePlatform } from './fakes/platform';
import { fakeEnv } from './platform/env';

const before = platform;
afterEach(() => setPlatformForTests(before));
beforeEach(() => {
  state.notice = null;
});

/** A plain map as a KV, with an optional key prefix (the old localKV wrote `pixelarrow:<key>`). */
function mapKV(m: Map<string, string>, prefix = ''): KV {
  return {
    get: async (k) => m.get(prefix + k) ?? null,
    set: async (k, v) => void m.set(prefix + k, v),
    remove: async (k) => void m.delete(prefix + k),
  };
}

function campaignWithGold(gold: number, seed = 7): SaveData {
  const d = Campaign.fresh(seed).sync();
  d.gold = gold;
  return d;
}

/** A Telegram 8.0 client with CloudStorage backed by `cloud` (hang: callbacks never come). */
function telegram(cloud: Map<string, string>) {
  const cs = {
    hang: false,
    getItem(k: string, cb: (e: string | null, v?: string) => void) {
      if (!this.hang) cb(null, cloud.get(k) ?? '');
    },
    setItem(k: string, v: string, cb?: (e: string | null) => void) {
      if (this.hang) return;
      cloud.set(k, v);
      cb?.(null);
    },
    removeItem(k: string, cb?: (e: string | null) => void) {
      if (this.hang) return;
      cloud.delete(k);
      cb?.(null);
    },
  };
  const wa = { version: '8.0', platform: 'ios', initData: '', initDataUnsafe: {}, isVersionAtLeast: (v: string) => 8 >= parseFloat(v), ready() {}, expand() {}, CloudStorage: cs } as unknown as TgWebApp;
  const f = fakeEnv({ hash: '#tgWebAppData=x' });
  const p = createTelegramPlatform(f.env);
  p.attach(wa);
  return { p, f, cs };
}

describe('the save through platform.storage', () => {
  it('gameKV() is the platform save store', () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    expect(gameKV()).toBe(fake.storage.save());
  });

  it('a campaign saved through FakePlatform storage loads back', async () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    await state.load();
    expect(state.hasSave).toBe(false);
    state.campaign.data.gold = 1234;
    await state.save();
    expect((await readSave(fake.saveKV))?.gold).toBe(1234);
    // nothing of the save lands in the device store
    expect([...fake.deviceKV.data.keys()]).toEqual([]);
    await state.load();
    expect(state.hasSave).toBe(true);
    expect(state.campaign.data.gold).toBe(1234);
  });
});

describe('a save written before M4 still loads', () => {
  it('on Telegram: CloudStorage keys as they were, mirror in localStorage', async () => {
    const cloud = new Map<string, string>();
    const { p, f } = telegram(cloud);
    await writeSave(mapKV(cloud), campaignWithGold(501));
    await writeSave(mapKV(f.localStorage, 'pixelarrow:'), campaignWithGold(501));
    setPlatformForTests(p);
    await state.load();
    expect(state.notice).toBeNull();
    expect(state.hasSave).toBe(true);
    expect(state.campaign.data.gold).toBe(501);
    // and the next save still lands in both places, under the same keys
    state.campaign.data.gold = 502;
    await state.save();
    expect((await readSave(mapKV(cloud)))?.gold).toBe(502);
    expect((await readSave(mapKV(f.localStorage, 'pixelarrow:')))?.gold).toBe(502);
  });

  it('on the web: localStorage keys under pixelarrow:', async () => {
    const f = fakeEnv();
    await writeSave(mapKV(f.localStorage, 'pixelarrow:'), campaignWithGold(77));
    setPlatformForTests(createWebPlatform(f.env) as Platform);
    await state.load();
    expect(state.hasSave).toBe(true);
    expect(state.campaign.data.gold).toBe(77);
  });

  it('on Telegram, a damaged cloud copy loads the mirror (as before M4)', async () => {
    const cloud = new Map<string, string>();
    const { p, f } = telegram(cloud);
    cloud.set('px_meta', '{not json');
    await writeSave(mapKV(f.localStorage, 'pixelarrow:'), campaignWithGold(640));
    setPlatformForTests(p);
    await state.load();
    expect(state.hasSave).toBe(true);
    expect(state.campaign.data.gold).toBe(640);
    expect(state.notice).toBeNull();
  });

  it('on Telegram, a CloudStorage that never answers costs one timeout, then the mirror is read', async () => {
    const cloud = new Map<string, string>();
    const { p, f, cs } = telegram(cloud);
    await writeSave(mapKV(cloud), campaignWithGold(900));
    await writeSave(mapKV(f.localStorage, 'pixelarrow:'), campaignWithGold(900));
    cs.hang = true;
    const kv = p.storage.save();
    const meta = kv.get('px_meta');
    f.runTimers(); // the one 5 s timeout
    expect(await meta).not.toBeNull();
    // the rest of the read no longer waits on the cloud
    expect((await readSave(kv))?.gold).toBe(900);
    expect(f.pendingTimers()).toBe(0);
  });
});
