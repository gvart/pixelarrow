import { describe, expect, it } from 'vitest';
import { ITEM_LIST, RARITIES, RARITY_MULT, itemMods, type Item } from '../src/data/items';
import { AFFIXES, AFFIX_STEPS, affixPool, affixSlot, encodeAffixes, freezeRolls, itemAffixes, itemDisplayName, itemPower, parseAffixes, powerPool, powerText } from '../src/data/affixes';

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
            expect(steps).toBeGreaterThanOrEqual(AFFIX_STEPS[n][0]);
            expect(steps).toBeLessThanOrEqual(AFFIX_STEPS[n][1]);
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
    expect(itemMods(it).morale).toBeCloseTo(10 * RARITY_MULT.uncommon);
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
    expect(powerText(itemPower(it)!)).toBe('8% chance a hit does double damage; costs 5% of max HP');
    expect(itemDisplayName(it)).toBe('Keen Kopis of Blood Price');
  });
});

describe('sets', () => {
  it('every set has its pieces, at the rarity normalizeItem enforces', async () => {
    const { SETS, setPieces } = await import('../src/data/sets');
    const { FIXED_RARITY, normalizeItem } = await import('../src/data/items');
    for (const s of Object.values(SETS)) {
      expect(FIXED_RARITY[s.id]).toBe(s.rarity);
      const pieces = setPieces(s.id);
      expect(pieces.length).toBe(Math.max(...s.bonuses.map((b) => b.pieces)));
      expect(normalizeItem({ uid: 'x', def: pieces[0], rarity: 'common' as const, cond: 100 }).rarity).toBe(s.rarity);
    }
    expect(normalizeItem({ uid: 'x', def: 'golden_fleece', rarity: 'rare' as const, cond: 100 }).rarity).toBe('legendary');
  });

  it('count only pieces whose requirements are met, and add their bonus lines', async () => {
    const { computeStats } = await import('../src/sim/stats');
    const { makeHero } = await import('../src/game/heroes');
    const { Rng } = await import('../src/sim/rng');
    const h = makeHero(new Rng(1), { nextId: 1 }, 'greek', 'hoplite' as never, 5, 1);
    h.equip = {
      weapon: { uid: 'a', def: 'pelian_ash', rarity: 'legendary', cond: 100 },
      shield: { uid: 'b', def: 'achilles_shield', rarity: 'legendary', cond: 100 },
      helmet: { uid: 'c', def: 'achilles_helm', rarity: 'legendary', cond: 100 },
      armor: { uid: 'd', def: 'hephaestean_cuirass', rarity: 'legendary', cond: 100 },
      trinket: { uid: 'e', def: 'thetis_anklet', rarity: 'legendary', cond: 100 },
    };
    h.attrs = { str: 15, agi: 5, end: 15, wil: 15 };
    expect(computeStats(h).setSpecials).toEqual(['heel_of_achilles']);
    h.attrs = { str: 5, agi: 5, end: 5, wil: 5 };
    expect(computeStats(h).setSpecials).toBeUndefined();
  });
});
