/**
 * Boot load policy (V5-011): a save that cannot be loaded is never silently
 * replaced by a new campaign. Storage and the cloud are in-memory fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV, SaveData } from '../src/game/save';

const stores = { primary: new Map<string, string>(), mirror: null as Map<string, string> | null };
function memKV(store: Map<string, string>): KV {
  return {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
  };
}
const pushed: SaveData[] = [];

vi.mock('../src/platform/storage', () => ({
  gameKV: () => ({ primary: memKV(stores.primary), mirror: stores.mirror ? memKV(stores.mirror) : null, cloud: !!stores.mirror }),
  localKV: () => memKV(new Map()),
  safeLocalStorage: () => null,
}));
vi.mock('../src/platform/cloud', () => ({
  online: {
    available: false,
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async () => null,
    abandonPull: () => undefined,
    queuePush: (d: SaveData) => void pushed.push(d),
  },
}));
vi.mock('../src/platform/telegram', () => ({ setHaptics: () => undefined }));

import { state } from '../src/state';
import { Campaign } from '../src/game/campaign';
import { readBackup, readSave, serialize, writeSave, SAVE_VERSION } from '../src/game/save';

function putRaw(store: Map<string, string>, text: string, v = SAVE_VERSION): void {
  store.set('px_part_0', text);
  store.set('px_meta', JSON.stringify({ v, n: 1 }));
}

beforeEach(() => {
  stores.primary = new Map();
  stores.mirror = null;
  pushed.length = 0;
  state.notice = null;
});

describe('loading a save that cannot be read', () => {
  it('a corrupt save is backed up raw before a new campaign is started, and the player is told', async () => {
    putRaw(stores.primary, '{"v":5,"gold":12,"heroes":[');
    await state.load();
    const kv = memKV(stores.primary);
    const backup = await readBackup(kv);
    expect(backup?.raw).toBe('{"v":5,"gold":12,"heroes":[');
    expect(backup?.reason).toBe('corrupt');
    expect(state.notice).toBe('save.corrupt');
    expect(state.hasSave).toBe(false);
    // the damaged parts themselves are still there too (the new campaign went to the other slot)
    expect(stores.primary.get('px_part_0')).toBe('{"v":5,"gold":12,"heroes":[');
    // a corrupt save does not offer the first-run tutorial: this player has played
    expect(state.campaign.data.settings.tutorial).toBeUndefined();
  });

  it('a save from a newer version is not touched at all: nothing is written, the game does not save', async () => {
    const newer = { ...Campaign.fresh(3).sync(), v: SAVE_VERSION + 1, gold: 777 };
    putRaw(stores.primary, serialize(newer as SaveData), newer.v);
    const before = new Map(stores.primary);
    await state.load();
    expect(state.notice).toBe('save.newer');
    expect(state.readOnly).toBe(true);
    await state.save();
    await state.reset();
    for (const [k, v] of before) expect(stores.primary.get(k)).toBe(v);
    expect(pushed).toHaveLength(0);
    // the only new keys are the raw backup
    expect([...stores.primary.keys()].filter((k) => !before.has(k)).every((k) => k.startsWith('px_corrupt'))).toBe(true);
  });

  it('a newer save in the cloud copy is not overwritten by an older local copy', async () => {
    const newer = { ...Campaign.fresh(3).sync(), v: SAVE_VERSION + 1 };
    putRaw(stores.primary, serialize(newer as SaveData), newer.v);
    stores.mirror = new Map();
    await writeSave(memKV(stores.mirror), Campaign.fresh(4).sync());
    const before = new Map(stores.primary);
    await state.load();
    expect(state.readOnly).toBe(true);
    await state.save();
    for (const [k, v] of before) expect(stores.primary.get(k)).toBe(v);
  });

  it('a damaged current slot loads the previous save from the backup slot', async () => {
    const kv = memKV(stores.primary);
    const a = Campaign.fresh(5).sync();
    a.gold = 321;
    await writeSave(kv, JSON.parse(serialize(a)) as SaveData);
    await writeSave(kv, { ...(JSON.parse(serialize(a)) as SaveData), gold: 999 });
    stores.primary.set('px_part1_0', 'garbage');
    await state.load();
    expect(state.hasSave).toBe(true);
    expect(state.campaign.data.gold).toBe(321);
    expect(state.notice).toBeNull();
  });

  it('a good save loads as before and is saved normally', async () => {
    const kv = memKV(stores.primary);
    await writeSave(kv, Campaign.fresh(6).sync());
    await state.load();
    expect(state.readOnly).toBe(false);
    state.campaign.data.gold = 4242;
    await state.save();
    expect((await readSave(kv))?.gold).toBe(4242);
  });
});
