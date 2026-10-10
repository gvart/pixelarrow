import { describe, expect, it } from 'vitest';
import { chunk, migrate, readSave, readSaveResult, serialize, writeSave, SAVE_VERSION, type KV, type SaveData } from '../src/game/save';
import { Campaign } from '../src/game/campaign';

/** In-memory KV (what Telegram CloudStorage / localStorage look like to the save code). */
function memKV(store = new Map<string, string>()): KV & { store: Map<string, string> } {
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
  };
}

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });

/**
 * Saves written by every shipped save version (V5-011). v2..v5 were produced by
 * running `Campaign.fresh(424242).sync()` on the commit that introduced that
 * version (the commit id is in the file name); v1 never shipped as its own
 * commit and is the v2 save minus what the v1->v2 migration adds.
 */
describe('every historical save version still loads', () => {
  it('finds the fixtures', () => expect(Object.keys(FIXTURES).length).toBeGreaterThanOrEqual(5));
  for (const [file, text] of Object.entries(FIXTURES)) {
    it(file, async () => {
      const raw = JSON.parse(text) as { v: number; heroes: unknown[]; gold: number };
      const out = migrate(JSON.parse(text))!;
      expect(out).not.toBeNull();
      expect(out.v).toBe(SAVE_VERSION);
      expect(out.heroes.length).toBe(raw.heroes.length);
      expect(out.gold).toBe(raw.gold);
      // and through storage, as the game reads it
      const kv = memKV();
      const parts = chunk(text);
      parts.forEach((p, i) => kv.store.set(`px_part_${i}`, p));
      kv.store.set('px_meta', JSON.stringify({ v: raw.v, n: parts.length }));
      const r = await readSaveResult(kv);
      expect(r.kind).toBe('ok');
      // a campaign can be built from it
      expect(() => new Campaign(out).world).not.toThrow();
    });
  }
});

describe('a save that cannot be loaded is reported, not mistaken for no save', () => {
  it('unparseable text is corrupt and the raw text is returned', async () => {
    const kv = memKV();
    kv.store.set('px_part_0', '{"v":5,"gold":');
    kv.store.set('px_meta', JSON.stringify({ v: 5, n: 1 }));
    const r = await readSaveResult(kv);
    expect(r).toEqual({ kind: 'bad', reason: 'corrupt', raw: '{"v":5,"gold":' });
    expect(await readSave(kv)).toBeNull();
  });

  it('a save from a newer version is reported as newer', async () => {
    const d = { ...Campaign.fresh(7).sync(), v: SAVE_VERSION + 1 };
    const kv = memKV();
    kv.store.set('px_part_0', serialize(d as SaveData));
    kv.store.set('px_meta', JSON.stringify({ v: d.v, n: 1 }));
    const r = await readSaveResult(kv);
    expect(r.kind === 'bad' && r.reason).toBe('newer');
  });

  it('an item this build does not know marks the save as newer (an older client)', async () => {
    const d = Campaign.fresh(7).sync();
    d.stash.push({ ...d.heroes[0].equip.weapon!, uid: 'x1', def: 'item_from_the_future' });
    const kv = memKV();
    await writeSave(kv, d);
    const r = await readSaveResult(kv);
    expect(r.kind === 'bad' && r.reason).toBe('newer');
  });

  it('no save at all is empty', async () => {
    expect(await readSaveResult(memKV())).toEqual({ kind: 'empty' });
  });
});

describe('writes are crash-safe and keep the last good save as a backup', () => {
  /** A KV that dies (throws) after `ok` more writes: the app killed mid-save. */
  function dyingKV(store: Map<string, string>, ok: number): KV {
    let left = ok;
    const kv = memKV(store);
    return {
      ...kv,
      set: async (k, v) => {
        if (left-- <= 0) throw new Error('killed');
        store.set(k, v);
      },
      remove: async (k) => {
        if (left-- <= 0) throw new Error('killed');
        store.delete(k);
      },
    };
  }

  /** A save big enough to take several chunks. */
  function bigSave(gold: number, chunks = 3): SaveData {
    const d = Campaign.fresh(11).sync();
    d.gold = gold;
    while (serialize(d).length < chunks * 3800) d.stash.push({ ...d.heroes[0].equip.weapon!, uid: `u${d.stash.length}` });
    return JSON.parse(serialize(d)) as SaveData;
  }

  it('a save killed after any number of writes leaves a loadable save (the old or the new one)', async () => {
    const before = bigSave(100);
    // a different length, so a mix of old and new parts is not valid JSON
    const after = bigSave(200, 4);
    const n = chunk(serialize(after)).length;
    for (let ok = 0; ok <= n + 2; ok++) {
      const store = new Map<string, string>();
      await writeSave(memKV(store), before);
      await writeSave(dyingKV(store, ok), after).catch(() => undefined);
      const r = await readSaveResult(memKV(store));
      expect(r.kind, `killed after ${ok} writes`).toBe('ok');
      expect([100, 200]).toContain(r.kind === 'ok' ? r.data.gold : -1);
    }
  });

  it('when the current save is damaged, the previous one is loaded from the backup slot', async () => {
    const store = new Map<string, string>();
    const kv = memKV(store);
    await writeSave(kv, bigSave(100));
    await writeSave(kv, bigSave(200));
    const meta = JSON.parse(store.get('px_meta')!) as { s: number };
    // damage one part of the current slot
    const key = [...store.keys()].find((k) => k.startsWith(meta.s ? 'px_part1_' : 'px_part_'))!;
    store.set(key, 'garbage');
    const r = await readSaveResult(kv);
    expect(r.kind).toBe('ok');
    expect(r.kind === 'ok' && r.data.gold).toBe(100);
    expect(r.kind === 'ok' && r.fromBackup).toBe(true);
  });

  it('a save in the old single-slot layout is read, and the first new save keeps it as the backup', async () => {
    const store = new Map<string, string>();
    const old = bigSave(100);
    const parts = chunk(serialize(old));
    parts.forEach((p, i) => store.set(`px_part_${i}`, p));
    store.set('px_meta', JSON.stringify({ v: old.v, n: parts.length }));
    const kv = memKV(store);
    expect((await readSave(kv))?.gold).toBe(100);
    await writeSave(kv, bigSave(200));
    expect((await readSave(kv))?.gold).toBe(200);
    // the old parts are untouched: they are the backup now
    parts.forEach((p, i) => expect(store.get(`px_part_${i}`)).toBe(p));
  });
});
