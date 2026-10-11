/**
 * ST-02: the v5 campaign save format (SAVE_VERSION 6, ADR-0002), the baseline
 * since V5-074. Every field the v5 train needs is declared here with a
 * default; feature stories read and write them and add no further bump.
 */
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, DEFAULT_SETTINGS, carrySettings, chunk, deserialize, migrate, migrateResult, readSaveResult, serialize, writeSave,
  SAVE_VERSION, type KV, type SaveData, type Settings,
} from '../src/game/save';
import { Campaign } from '../src/game/campaign';
import { FLAGS_CAP, JOURNAL_CAP, World, type PartyState, type WorldSave } from '../src/world/world';
import { MAX_ARMY } from '../src/data/units';
import { PERKS } from '../src/data/perks';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Telegram CloudStorage: values up to 4096 chars, keys 1-128 chars of [A-Za-z0-9_-], at most 1024 keys. */
function cloudStorageKV(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => {
      if (v.length > 4096) throw new Error(`value too long for ${k}: ${v.length}`);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(k)) throw new Error(`bad key ${k}`);
      store.set(k, v);
      if (store.size > 1024) throw new Error('too many keys');
    },
    remove: async (k) => void store.delete(k),
  };
}

const V6_WORLD_DEFAULTS = {
  lairs: {},
  arc: { stage: 'lairs' },
  flags: {},
  eventCd: {},
  eventsToday: [0, 0],
  journal: [],
};

describe('SAVE_VERSION 6', () => {
  it('is the S4-FIX-SAVES version + 1 (GDD review N4)', () => expect(SAVE_VERSION).toBe(6));

  it('a new campaign is written at v6 with every new world field at its default', () => {
    const d = Campaign.fresh(11).sync();
    expect(d.v).toBe(6);
    expect(d.world).toMatchObject(V6_WORLD_DEFAULTS);
    expect(d.world.pendingEvent).toBeUndefined();
    expect(World.fresh(5)).toMatchObject(V6_WORLD_DEFAULTS);
  });
});

describe('there are no migrations: v6 is the baseline (V5-074)', () => {
  it.each([5, 1, 0, undefined])('a save at version %s is corrupt (the corrupt-save backup path)', (v) => {
    const d = { ...clone(Campaign.fresh(3).sync()), v };
    expect(migrateResult(d)).toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('the version gate: a v6 save is refused by a client built for v5', () => {
  it('a v6 save stamps v 6 in the save and in the storage meta, past the v5 gate (`v > 5` => newer)', async () => {
    const kv = cloudStorageKV();
    await writeSave(kv, Campaign.fresh(3).sync());
    const meta = JSON.parse(kv.store.get('px_meta')!) as { v: number; n: number };
    expect(meta.v).toBe(6);
    const text = Array.from({ length: meta.n }, (_, i) => kv.store.get(`px_part_${i}`)).join('');
    expect((JSON.parse(text) as SaveData).v).toBe(6);
  });

  it('this build refuses the next version the same way (no load, reason newer)', () => {
    const d = { ...clone(Campaign.fresh(3).sync()), v: SAVE_VERSION + 1 };
    expect(migrateResult(d)).toEqual({ ok: false, reason: 'newer' });
  });
});

describe('v6 fields are validated and repaired on load', () => {
  function v6(): SaveData {
    return clone(Campaign.fresh(21).sync());
  }

  it('values written by the feature stories survive a round trip', () => {
    const d = v6();
    d.world.lairs = { 3: { fallen: true, lost: 2, lostAt: 120 } };
    d.world.arc = { stage: 'host', hostParty: 7, sackedUntil: 300 };
    d.world.flags = { deserters: 1, oracle_paid: 3 };
    d.world.eventCd = { deserters: 12 };
    d.world.eventsToday = [4, 2];
    d.world.pendingEvent = { id: 'deserters', seed: 99 };
    d.world.journal = ['deserters:a', 'oracle:b'];
    d.world.parties[0].escaped = 3;
    d.world.parties[0].captainDead = true;
    d.world.parties[1].kind = 'host';
    d.world.places[0].reborn = true;
    d.settings = { ...d.settings, reduceShake: true, reduceFlash: true, leftHand: true, battleSpeed: 2 };
    expect(deserialize(serialize(d))).toEqual(d);
  });

  it('missing v6 world fields in a v6 save are filled with their defaults', () => {
    const d = v6() as unknown as { world: Record<string, unknown> };
    for (const k of Object.keys(V6_WORLD_DEFAULTS)) delete d.world[k];
    const out = migrate(d)!;
    expect(out.world).toMatchObject(V6_WORLD_DEFAULTS);
  });

  it(`flags are capped at ${FLAGS_CAP} keys and the journal at the last ${JOURNAL_CAP} entries`, () => {
    const d = v6();
    for (let i = 0; i < FLAGS_CAP + 10; i++) d.world.flags[`f${i}`] = i;
    d.world.journal = Array.from({ length: JOURNAL_CAP + 5 }, (_, i) => `e${i}`);
    const out = migrate(d)!;
    expect(Object.keys(out.world.flags)).toHaveLength(FLAGS_CAP);
    expect(out.world.flags.f0).toBe(0);
    expect(out.world.journal).toHaveLength(JOURNAL_CAP);
    expect(out.world.journal[0]).toBe('e5');
    expect(out.world.journal.at(-1)).toBe(`e${JOURNAL_CAP + 4}`);
  });

  it('malformed v6 values are repaired rather than losing the save', () => {
    const d = v6() as unknown as { world: Record<string, unknown>; settings: Record<string, unknown> };
    d.world.lairs = { 1: { fallen: true, lost: 1, lostAt: 5 }, 2: 'x', 3: { fallen: 'yes' } };
    d.world.arc = { stage: 'nonsense' };
    d.world.flags = { ok: 1, bad: 'x', nan: null };
    d.world.eventCd = { ok: 3, bad: {} };
    d.world.eventsToday = [1];
    d.world.pendingEvent = { id: 5 };
    d.world.journal = ['a', 7, 'b'];
    const parties = d.world.parties as Record<string, unknown>[];
    parties[0].escaped = 'many';
    parties[0].captainDead = 1;
    (d.world.places as Record<string, unknown>[])[0].reborn = 'y';
    d.settings.reduceShake = 'on';
    d.settings.leftHand = 0;
    d.settings.battleSpeed = 99;
    const out = migrate(d)!;
    expect(out).not.toBeNull();
    expect(out.world.lairs).toEqual({ 1: { fallen: true, lost: 1, lostAt: 5 } });
    expect(out.world.arc).toEqual({ stage: 'lairs' });
    expect(out.world.flags).toEqual({ ok: 1 });
    expect(out.world.eventCd).toEqual({ ok: 3 });
    expect(out.world.eventsToday).toEqual([0, 0]);
    expect(out.world.pendingEvent).toBeUndefined();
    expect(out.world.journal).toEqual(['a', 'b']);
    expect(out.world.parties[0].escaped).toBeUndefined();
    expect(out.world.parties[0].captainDead).toBeUndefined();
    expect(out.world.places[0].reborn).toBeUndefined();
    expect(out.settings.reduceShake).toBeUndefined();
    expect(out.settings.leftHand).toBeUndefined();
    expect(out.settings.battleSpeed).toBeUndefined();
  });

  it('the arc keeps a valid host party and sack time, and drops malformed ones', () => {
    const d = v6() as unknown as { world: Record<string, unknown> };
    d.world.arc = { stage: 'won', hostParty: 'x', sackedUntil: 50 };
    expect(migrate(d)!.world.arc).toEqual({ stage: 'won', sackedUntil: 50 });
  });
});

describe('the new settings carry over to a new campaign (carrySettings)', () => {
  it('reduceShake, reduceFlash, leftHand and battleSpeed are kept', () => {
    const prev: Settings = { ...DEFAULT_SETTINGS, reduceShake: true, reduceFlash: true, leftHand: true, battleSpeed: 0.5 };
    expect(carrySettings(prev, { ...DEFAULT_SETTINGS })).toEqual(prev);
  });
});

describe('a max-size v6 save fits Telegram CloudStorage', () => {
  function maxSave(): SaveData {
    const c = Campaign.fresh(99);
    const d = c.data;
    const proto = d.heroes[0];
    while (d.heroes.length < MAX_ARMY) d.heroes.push({ ...clone(proto), id: `h${d.heroes.length}`, name: `Hero ${d.heroes.length}` });
    for (const h of d.heroes) h.perks = Object.keys(PERKS).slice(0, 10) as typeof h.perks;
    const w: WorldSave = c.sync().world;
    w.lairs = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 20, { fallen: true, lost: 9, lostAt: 99999.5 }]));
    w.arc = { stage: 'post', hostParty: 99999, sackedUntil: 99999.5 };
    // the deck has 24 events with ids like `deserters_hunt` (campaign-events.md R6); names padded to 24 chars
    for (let i = 0; i < FLAGS_CAP; i++) w.flags[`flag_${i}`.padEnd(24, 'x')] = 99999;
    for (let i = 0; i < 24; i++) w.eventCd[`event_${i}`.padEnd(24, 'x')] = 99999;
    w.eventsToday = [9999, 9];
    w.pendingEvent = { id: 'event_0'.padEnd(24, 'x'), seed: 4294967295 };
    w.journal = Array.from({ length: JOURNAL_CAP }, (_, i) => `event_${i}`.padEnd(24, 'x') + ':b');
    for (const p of w.parties as PartyState[]) Object.assign(p, { escaped: 99, captainDead: true });
    for (const s of w.places) s.reborn = true;
    // a long campaign's stash
    while (d.stash.length < 120) d.stash.push({ ...clone(proto.equip.weapon!), uid: `s${d.stash.length}` });
    return clone(d);
  }

  it(`every part stays within the ${CHUNK_SIZE}-char budget and the save round-trips`, async () => {
    const d = maxSave();
    const text = serialize(d);
    const parts = chunk(text);
    expect(parts.every((p) => p.length <= CHUNK_SIZE)).toBe(true);
    const kv = cloudStorageKV();
    // two slots, written twice so both hold a max-size save
    await writeSave(kv, d);
    await writeSave(kv, d);
    const r = await readSaveResult(kv);
    expect(r.kind === 'ok' && r.data).toEqual(migrate(clone(d)));
    expect([...kv.store.values()].every((v) => v.length <= CHUNK_SIZE + 100)).toBe(true);
  });

  it('the v6 fields at their caps cost at most two parts', () => {
    const d = maxSave();
    const bare = clone(d);
    Object.assign(bare.world, { lairs: {}, arc: { stage: 'lairs' }, flags: {}, eventCd: {}, eventsToday: [0, 0], journal: [] });
    delete bare.world.pendingEvent;
    for (const p of bare.world.parties) delete p.escaped, delete p.captainDead;
    for (const s of bare.world.places) delete s.reborn;
    const cost = serialize(d).length - serialize(bare).length;
    // measured at ST-02: about 4,850 chars of a 32,100-char, 9-part max-size save
    expect(cost).toBeLessThan(2 * CHUNK_SIZE);
  });
});
