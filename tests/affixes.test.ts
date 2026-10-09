import { describe, expect, it } from 'vitest';
import { ITEM_LIST, RARITIES, itemMods, type Item } from '../src/data/items';
import { AFFIXES, affixPool, affixSlot, encodeAffixes, freezeRolls, itemAffixes, itemDisplayName, itemPower, parseAffixes, powerPool, powerText } from '../src/data/affixes';

const item = (def: string, rarity: Item['rarity'], uid = 'u1'): Item => ({ uid, def, rarity, cond: 100 });

describe('random stats', () => {
  it('count by rarity, never twice the same stat, only from the slot pool', () => {
    for (const d of ITEM_LIST) {
      if (d.fixed) continue;
      const pool = new Set(affixPool(d).map(([k]) => k));
      RARITIES.forEach((r, n) => {
        for (const uid of ['a', 'b', 'c']) {
          const a = itemAffixes(item(d.id, r, uid));
          expect(a.length, `${d.id} ${r}`).toBe(Math.min(n, pool.size));
          expect(new Set(a.map(([k]) => k)).size).toBe(a.length);
          for (const [k, steps] of a) {
            expect(pool.has(k), `${d.id} rolled ${k}`).toBe(true);
            expect(steps).toBeGreaterThanOrEqual(n >= 3 ? 2 : 1);
            expect(steps).toBeLessThanOrEqual(n >= 3 ? 3 : 2);
          }
        }
      });
    }
  });

  it('are a pure function of uid, base item and rarity', () => {
    expect(itemAffixes(item('xiphos', 'epic', 'x7'))).toEqual(itemAffixes(item('xiphos', 'epic', 'x7')));
    const spread = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((u) => encodeAffixes(itemAffixes(item('xiphos', 'epic', u)))));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('a bow never rolls melee damage; charge bonus only on spears and lances', () => {
    const bow = ITEM_LIST.find((d) => d.id === 'bow')!;
    expect(affixSlot(bow)).toBe('ranged');
    expect(affixPool(bow).map(([k]) => k)).not.toContain('dmg');
    expect(affixPool(ITEM_LIST.find((d) => d.id === 'xiphos')!).map(([k]) => k)).not.toContain('chargeBonus');
    expect(affixPool(ITEM_LIST.find((d) => d.id === 'dory')!).map(([k]) => k)).toContain('chargeBonus');
  });

  it('add to itemMods, and a stored aff string wins over the roll', () => {
    const it: Item = { ...item('owl_amulet', 'uncommon'), aff: 'hp:2' };
    expect(itemMods(it).hp).toBe(2 * AFFIXES.hp.step);
    expect(itemMods(it).morale).toBeCloseTo(10 * 1.05);
    expect(parseAffixes('hp:2,nope:3,dmg:0')).toEqual([['hp', 2]]);
  });

  it('a missing requirement takes 10% a point off positive stats only', () => {
    const it: Item = { ...item('sauroter_dory', 'legendary'), aff: 'dmg:2' };
    const full = itemMods(it, { str: 15, agi: 5, end: 5, wil: 5 });
    const short = itemMods(it, { str: 9, agi: 5, end: 5, wil: 5 });
    expect(short.dmg!).toBeCloseTo(full.dmg! * 0.7, 1);
    expect(short.reach).toBe(full.reach);
    expect(short.atkTime).toBe(full.atkTime);
  });

  it('freezeRolls copies an offer preview onto the bought item', () => {
    const preview = item('kopis', 'epic', 'offer_x');
    const bought = freezeRolls(item('kopis', 'epic', 'd1_i9'), 'offer_x');
    expect(itemAffixes(bought)).toEqual(itemAffixes(preview));
    expect(itemPower(bought)).toEqual(itemPower(preview));
  });
});

describe('powers', () => {
  it('only epic and legendary items have one, grade by rarity, from the slot pool', () => {
    for (const d of ITEM_LIST) {
      if (d.named || d.set) continue;
      expect(itemPower(item(d.id, 'rare'))).toBeNull();
      const e = itemPower(item(d.id, 'epic'));
      const l = itemPower(item(d.id, 'legendary'));
      const pool = powerPool(d);
      if (!pool.length) continue;
      expect(e!.grade).toBe(0);
      expect(l!.grade).toBe(1);
      expect(pool).toContain(e!.id);
    }
  });

  it('reads as a card line and a name', () => {
    const it = { ...item('kopis', 'epic'), pow: 'blood_price', aff: 'dmg:3' };
    expect(powerText(itemPower(it)!)).toBe('12% chance a hit does double damage; costs 5% of max HP');
    expect(itemDisplayName(it)).toBe('Keen Kopis of Blood Price');
  });
});
