/**
 * TUT-01: first run is for new players only. A real v6 save (and every older
 * fixture) goes through the boot load and never opens the first-run screens;
 * an empty device gets the offer; an interrupted tutorial is offered again.
 * Storage and the cloud are in-memory fakes (as in stateLoad.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV } from '../src/game/save';

const stores = { primary: new Map<string, string>() };
function memKV(store: Map<string, string>): KV {
  return {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
  };
}

vi.mock('../src/platform/storage', () => ({
  gameKV: () => ({ primary: memKV(stores.primary), mirror: null, cloud: false }),
  localKV: () => memKV(new Map()),
  safeLocalStorage: () => null,
}));
vi.mock('../src/platform/cloud', () => ({
  online: {
    available: false,
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async () => null,
    abandonPull: () => undefined,
    queuePush: () => undefined,
  },
}));
vi.mock('../src/platform/telegram', () => ({ setHaptics: () => undefined }));

import { state } from '../src/state';
import { firstRunEntry } from '../src/scenes/bootRoute';
import { SAVE_VERSION } from '../src/game/save';

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });
const V6 = Object.entries(FIXTURES).find(([k]) => k.includes('/v6-'))![1];

function putRaw(text: string, v: number): void {
  stores.primary.set('px_part_0', text);
  stores.primary.set('px_meta', JSON.stringify({ v, n: 1 }));
}

beforeEach(() => {
  stores.primary = new Map();
  state.notice = null;
});

describe('first run is never forced on an existing player', () => {
  it('the v6 fixture is a current-version save with no tutorial record', () => {
    const raw = JSON.parse(V6) as { v: number; settings: { tutorial?: unknown } };
    expect(raw.v).toBe(SAVE_VERSION);
    expect(raw.settings.tutorial).toBeUndefined();
  });

  it('a v6 save loads straight past first run (no offer, no resume)', async () => {
    putRaw(V6, 6);
    await state.load();
    expect(state.hasSave).toBe(true);
    expect(firstRunEntry(state.campaign.data.settings)).toBeNull();
  });

  it('a player who finished or skipped the tutorial is not offered it again', () => {
    expect(firstRunEntry({ tutorial: { status: 'done', done: [], rewarded: true } })).toBeNull();
    expect(firstRunEntry({ tutorial: { status: 'skipped', done: ['intro'] } })).toBeNull();
  });
});

describe('a new player gets first run', () => {
  it('an empty device: the tutorial is offered', async () => {
    await state.load();
    expect(state.hasSave).toBe(false);
    expect(firstRunEntry(state.campaign.data.settings)).toBe('offer');
  });

  it('an interrupted tutorial is offered again', () => {
    expect(firstRunEntry({ tutorial: { status: 'active', done: ['intro', 'select'] } })).toBe('resume');
  });

  it('a deep link, the Kit or a test script wins over the offer', () => {
    expect(firstRunEntry({ tutorial: { status: 'offer', done: [] } }, true)).toBeNull();
  });
});
