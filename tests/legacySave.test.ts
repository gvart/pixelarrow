/**
 * Live players hold saves written by the single-slot layout shipped on `main`
 * (bd61069): `pixelarrow:px_meta` = {v, n} and `pixelarrow:px_part_N` in
 * localStorage. Such a save must load through the real boot path with no data
 * loss, hand the cloud sync exactly that data, and survive as the backup slot
 * once the new two-slot code saves over it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chunk, readSave, serialize, type KV, type SaveData } from '../src/game/save';
import { Campaign } from '../src/game/campaign';
import { localKV } from '../src/platform/storage';
import { SYNC_META_KEY } from '../src/platform/saveSync';

const ls = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, String(v)),
  removeItem: (k: string) => void ls.delete(k),
});

const pulled: (SaveData | null)[] = [];
const pushed: SaveData[] = [];
vi.mock('../src/platform/cloud', () => ({
  online: {
    available: true,
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async (d: SaveData | null) => (pulled.push(d ? (JSON.parse(JSON.stringify(d)) as SaveData) : null), null),
    abandonPull: () => undefined,
    queuePush: (d: SaveData) => void pushed.push(d),
  },
}));

import { state } from '../src/state';

/** `writeSave` exactly as shipped on main (bd61069). */
async function mainWriteSave(kv: KV, s: SaveData): Promise<void> {
  const parts = chunk(serialize(s));
  const oldMeta = await kv.get('px_meta');
  for (let i = 0; i < parts.length; i++) await kv.set(`px_part_${i}`, parts[i]);
  await kv.set('px_meta', JSON.stringify({ v: s.v, n: parts.length }));
  if (oldMeta) {
    const old = JSON.parse(oldMeta) as { n: number };
    for (let i = parts.length; i < old.n; i++) await kv.remove(`px_part_${i}`);
  }
}

function playedSave(): SaveData {
  const d = Campaign.fresh(777).sync();
  d.gold = 1234;
  d.won = 9;
  d.fought = 12;
  d.seq = 41;
  // several parts, as a long campaign has
  while (serialize(d).length < 3 * 3800) d.stash.push({ ...d.heroes[0].equip.weapon!, uid: `s${d.stash.length}` });
  return JSON.parse(serialize(d)) as SaveData;
}

beforeEach(() => {
  ls.clear();
  pulled.length = 0;
  pushed.length = 0;
  state.notice = null;
});

describe('a save written by main loads on the two-slot layout', () => {
  it('loads with no data loss and the cloud sync sees the same data', async () => {
    const saved = playedSave();
    await mainWriteSave(localKV(), saved);
    // main's exact localStorage keys
    expect(ls.get('pixelarrow:px_meta')).toBe(JSON.stringify({ v: saved.v, n: chunk(serialize(saved)).length }));
    ls.set(`pixelarrow:${SYNC_META_KEY}`, JSON.stringify({ revision: 7, seq: 41 }));
    const before = new Map(ls);

    await state.load();

    expect(state.hasSave).toBe(true);
    expect(state.notice).toBeNull();
    expect(state.readOnly).toBe(false);
    expect(JSON.parse(serialize(state.campaign.data))).toEqual(JSON.parse(serialize(saved)));
    // cloud path: pullOnLoad receives the legacy save untouched, sync meta is not rewritten
    expect(pulled).toHaveLength(1);
    expect(pulled[0]).toEqual(JSON.parse(serialize(saved)));
    // loading alone writes nothing
    expect(new Map(ls)).toEqual(before);
  });

  it('the first save on the new code keeps the main-written save intact as the backup', async () => {
    const saved = playedSave();
    await mainWriteSave(localKV(), saved);
    const legacyParts = [...ls].filter(([k]) => k.startsWith('pixelarrow:px_part_'));
    await state.load();
    state.campaign.data.gold = 5000;
    await state.save();
    expect((await readSave(localKV()))?.gold).toBe(5000);
    for (const [k, v] of legacyParts) expect(ls.get(k)).toBe(v);
    expect(pushed.at(-1)?.gold).toBe(5000);
  });
});
