/**
 * EC-02, the item power cap (GDD_REVIEW N16, docs/ITEMS.md "Item power cap"):
 * the harness covers every item kind the cap names, a mirror is seeded, and
 * items players already own stay valid after the re-tune (their stats are
 * derived from the item data at use time, nothing is stored).
 */
import { describe, expect, it } from 'vitest';
import { ITEM_LIST, SLOTS, itemMods, normalizeItem, type Item } from '../src/data/items';
import { itemAffixes, itemPower } from '../src/data/affixes';
import { SETS } from '../src/data/sets';
import { ITEM_DELTA_CAP, itemCapCases, runItemCap } from '../src/dev/rarityBalance';

describe('item power cap harness', () => {
  it('covers a plain legendary in every slot, every named legendary and every set bonus', () => {
    const labels = itemCapCases().map((c) => c.label);
    for (const s of SLOTS) expect(labels).toContain(`legendary ${s}`);
    for (const d of ITEM_LIST.filter((x) => x.named)) expect(labels).toContain(d.id);
    for (const id of Object.keys(SETS)) expect(labels).toContain(`${id} set bonus`);
    expect(ITEM_DELTA_CAP).toBe(10);
  });

  it('a mirror is a seeded win, loss or draw', () => {
    const c = itemCapCases().find((x) => x.label === 'aegis_of_zeus')!;
    const r = runItemCap(7001, c, 10);
    expect([0, 0.5, 1]).toContain(r);
    expect(runItemCap(7001, c, 10)).toBe(r);
  });

  it('a set bonus case leaves the set data as it found it', () => {
    const before = JSON.stringify(SETS);
    for (const c of itemCapCases().filter((x) => x.bonusOnly)) runItemCap(7000, c, 5);
    expect(JSON.stringify(SETS)).toBe(before);
  });
});

describe('items players already own', () => {
  it('a stored named legendary keeps its rarity, power and fixed stats, with stats from the current data', () => {
    for (const d of ITEM_LIST.filter((x) => x.named)) {
      const stored: Item = normalizeItem({ uid: `old-${d.id}`, def: d.id, rarity: 'legendary', cond: 80 });
      expect(stored.rarity).toBe('legendary');
      expect(itemPower(stored)).toEqual({ id: d.power, grade: 1 });
      expect(Object.fromEntries(itemAffixes(stored))).toEqual(d.fixed);
      const m = itemMods(stored) as Record<string, number>;
      for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('a stored item with explicit rolls (a shop purchase) is untouched by the cap', () => {
    const it: Item = { uid: 'shop1', def: 'argyraspis', rarity: 'legendary', cond: 100, aff: 'block:2,hp:2', pow: 'aegis' };
    expect(itemAffixes(it)).toEqual([['block', 2], ['hp', 2]]);
    expect(itemPower(it)).toEqual({ id: 'aegis', grade: 1 });
  });
});
