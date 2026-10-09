import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { lootPicks, lootPool, resolveBattle, takeLoot } from '../src/game/loot';
import {
  chunk, clearSave, deserialize, migrate, readSave, serialize, unchunk, writeSave, SAVE_VERSION, type KV,
} from '../src/game/save';
import { Rng } from '../src/sim/rng';
import { Battle } from '../src/sim/battle';
import type { BattleResult } from '../src/sim/types';
import { runToEnd, standardSetup } from './helpers';
import { generateEnemyArmy } from '../src/game/enemy';
import { NAMES, freeName } from '../src/data/names';

function memoryKV(limit = 4096): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k)! : null; },
    async set(k, v) { if (v.length > limit) throw new Error('value too long'); store.set(k, v); },
    async remove(k) { store.delete(k); },
  };
}

describe('loot', () => {
  it('only drops gear from enemies the player actually killed', () => {
    const { player, enemy } = standardSetup(5);
    const result: BattleResult = {
      winner: 0,
      ticks: 100,
      units: [
        ...player.map((h) => ({ heroId: h.id, side: 0 as const, state: 'ready' as const, kills: 0, killedBy: -1, ko: false, hp: 10, maxHp: 30, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } })),
        { heroId: enemy[0].id, side: 1, state: 'dead', kills: 0, killedBy: 0, ko: false, hp: 0, maxHp: 30, wear: { weapon: 1, shield: 10, helmet: 2, armor: 3 } },
        { heroId: enemy[1].id, side: 1, state: 'fled', kills: 0, killedBy: -1, ko: false, hp: 5, maxHp: 30, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } },
        { heroId: enemy[2].id, side: 1, state: 'dead', kills: 0, killedBy: 1, ko: false, hp: 0, maxHp: 30, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } },
      ],
    };
    const pool = lootPool(result, enemy);
    const expected = Object.values(enemy[0].equip).map((i) => i!.uid).sort();
    expect(pool.map((i) => i.uid).sort()).toEqual(expected);
    // Condition carries over, with battle wear applied.
    const shield = pool.find((i) => i.uid === enemy[0].equip.shield?.uid);
    if (shield) expect(shield.cond).toBeLessThan(enemy[0].equip.shield!.cond);
  });

  it('better victories grant more picks; defeats grant none', () => {
    expect(lootPicks(0, 10, 0)).toBe(5);
    expect(lootPicks(0, 10, 2)).toBe(4);
    expect(lootPicks(0, 10, 5)).toBe(3);
    expect(lootPicks(1, 10, 5)).toBe(0);
    expect(lootPicks(-1, 10, 5)).toBe(1);
  });

  it('resolves a real battle: dead heroes are removed and survivors gain XP', () => {
    const { setup, player, enemy } = standardSetup(8);
    const b = new Battle(setup);
    runToEnd(b);
    const res = b.result();
    const before = player.length;
    const deadIds = res.units.filter((u) => u.side === 0 && u.state === 'dead' && !u.ko).map((u) => u.heroId);
    const { outcome, survivors } = resolveBattle(res, player, enemy, new Rng(1));
    expect(survivors.length).toBe(before - deadIds.length);
    expect(survivors.some((h) => deadIds.includes(h.id))).toBe(false);
    expect(outcome.heroes.filter((h) => !h.died).every((h) => h.xp > 0)).toBe(true);
    const chosen = takeLoot(outcome, outcome.loot.map((i) => i.uid));
    expect(chosen.length).toBeLessThanOrEqual(outcome.picks);
  });
});

describe('campaign', () => {
  it('equips items and enforces two-handed weapons', () => {
    const c = Campaign.fresh(9);
    const h = c.data.heroes[0];
    // companions carry a two-handed lance or a big shield (with a side sword)
    h.cls = 'companion';
    h.equip.shield = { uid: 'test-hoplon', def: 'hoplon', rarity: 'common', cond: 100 };
    c.data.stash.push({ uid: 'test-xyston', def: 'xyston', rarity: 'common', cond: 100 });
    expect(c.equip(h.id, 'test-xyston')).toBe(true);
    expect(h.equip.weapon!.uid).toBe('test-xyston');
    expect(h.equip.shield).toBeUndefined();
    expect(c.data.stash.some((i) => i.uid === 'test-hoplon')).toBe(true);
  });

  it('refuses gear the hero\'s class may not use', () => {
    const c = Campaign.fresh(9);
    const h = c.data.heroes.find((x) => x.cls === 'hoplite')!;
    c.data.stash.push({ uid: 'test-bow', def: 'bow', rarity: 'common', cond: 100 });
    expect(c.equip(h.id, 'test-bow')).toBe(false);
    expect(c.data.stash.some((i) => i.uid === 'test-bow')).toBe(true);
  });

  it('recruits cost gold and respect the army cap', () => {
    const c = Campaign.fresh(9);
    c.data.gold = 1000;
    const n = c.data.heroes.length;
    c.recruit();
    expect(c.data.heroes.length).toBe(n + 1);
    while (c.recruit()) { /* fill up */ }
    expect(c.data.heroes.length).toBe(20);
  });
});

describe('save', () => {
  it('round-trips through serialize/deserialize', () => {
    const c = Campaign.fresh(3);
    const text = serialize(c.sync());
    const back = deserialize(text)!;
    expect(back).toEqual(c.data);
    expect(back.v).toBe(SAVE_VERSION);
  });

  it('rejects garbage and unknown versions', () => {
    expect(deserialize('not json')).toBeNull();
    expect(migrate({ v: 999 })).toBeNull();
    expect(migrate({ v: 2, gold: 'x' })).toBeNull();
  });

  it('migrates a v1 save', () => {
    const c = Campaign.fresh(3);
    const v1 = JSON.parse(serialize(c.sync()));
    v1.v = 1;
    delete v1.settings;
    const migrated = migrate(v1)!;
    expect(migrated.v).toBe(SAVE_VERSION);
    expect(migrated.settings.haptics).toBe(true);
  });

  it('chunks long saves under the CloudStorage value limit', async () => {
    const c = Campaign.fresh(4);
    c.data.gold = 500;
    while (c.recruit()) { /* max army: big save */ }
    const text = serialize(c.sync());
    expect(text.length).toBeGreaterThan(4096);
    const parts = chunk(text);
    expect(parts.every((p) => p.length <= 4096)).toBe(true);
    expect(unchunk(parts)).toBe(text);
    const kv = memoryKV();
    await writeSave(kv, c.data);
    const back = await readSave(kv);
    expect(back).toEqual(c.data);
    // Shrinking a save removes stale parts.
    const small = Campaign.fresh(5);
    await writeSave(kv, small.sync());
    expect(await readSave(kv)).toEqual(small.data);
    expect([...kv.store.keys()].filter((k) => k.startsWith('px_part_')).length).toBe(chunk(serialize(small.data)).length);
    await clearSave(kv);
    expect(kv.store.size).toBe(0);
  });
});

describe('hero names', () => {
  it('are unique within a roster: starter army, recruits and bot armies', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const camp = Campaign.fresh(seed);
      camp.data.gold = 100000;
      while (camp.canRecruit()) camp.recruit();
      const names = camp.data.heroes.map((h) => h.name);
      expect(names.length).toBe(20);
      expect(new Set(names).size).toBe(names.length);
      const enemy = generateEnemyArmy(new Rng(seed), camp.data, camp.data.heroes, 3).heroes.map((h) => h.name);
      expect(new Set(enemy).size).toBe(enemy.length);
    }
  });

  it('falls back to numbered names when a culture runs out, and fixes old saves', () => {
    const taken = new Set(NAMES.celtic);
    expect(freeName('celtic', 0, taken)).toBe(`${NAMES.celtic[0]} II`);
    const camp = Campaign.fresh(5);
    camp.data.heroes[1].name = camp.data.heroes[0].name;
    const loaded = new Campaign(JSON.parse(JSON.stringify(camp.data)));
    const names = loaded.data.heroes.map((h) => h.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
