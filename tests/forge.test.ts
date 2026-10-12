/**
 * The forge reroll at the town Smith (EC-01, design/gdd/forge-reroll.md): the
 * price table, which items and lines qualify, the draw, determinism from the
 * world RNG, refusals, and the gold-sink row the balance doc records.
 */
import { describe, expect, it } from 'vitest';
import { itemDef, itemValue, type Item } from '../src/data/items';
import { AFFIX_STEPS, affixPool, itemAffixes, itemPower, type AffixId } from '../src/data/affixes';
import { Rng } from '../src/sim/rng';
import { FORGE, forgeCost, groupDigits } from '../src/game/economy';
import { affixLineText, forgeCandidates, forgeDefaultLine, forgePool, forgeReroll, forgeable } from '../src/game/gear';
import { Campaign } from '../src/game/campaign';
import { WIN_GOLD } from '../src/game/campaign';

const item = (def: string, rarity: Item['rarity'], uid = 'u1', aff?: string): Item => ({ uid, def, rarity, cond: 80, ...(aff ? { aff } : {}) });

describe('forge price (GDD rule 6)', () => {
  it('follows the tier x rarity table', () => {
    const table: Record<number, number[]> = { 1: [20, 30, 40, 60], 2: [40, 60, 80, 120], 3: [80, 120, 160, 240] };
    const defs: Record<number, string> = { 1: 'xiphos', 2: 'kopis', 3: 'falcata' };
    for (const tier of [1, 2, 3]) {
      expect(itemDef(defs[tier]).tier).toBe(tier);
      (['uncommon', 'rare', 'epic', 'legendary'] as const).forEach((r, i) => expect(forgeCost(item(defs[tier], r)), `${tier} ${r}`).toBe(table[tier][i]));
    }
  });

  it('keeps its knobs in FORGE', () => {
    expect(FORGE.base).toEqual({ 1: 20, 2: 40, 3: 80 });
    expect(FORGE.rarity).toEqual({ common: 0, uncommon: 1, rare: 1.5, epic: 2, legendary: 3 });
  });
});

describe('which items the Smith takes (GDD rule 2)', () => {
  it('uncommon and finer, set pieces too; not common, not named legendaries', () => {
    expect(forgeable(item('xiphos', 'common'))).toBe(false);
    expect(forgeable(item('xiphos', 'uncommon'))).toBe(true);
    expect(forgeable(item('agoge_dory', 'rare'))).toBe(true);
    expect(forgeable(item('herakles_club', 'legendary'))).toBe(false);
  });

  it('lists stash and worn items, worn ones with their man, finest first', () => {
    const camp = Campaign.fresh(5);
    const h = camp.data.heroes[0];
    h.equip.weapon = item('falcata', 'epic', 'w1');
    camp.data.stash = [item('xiphos', 'common', 's1'), item('kopis', 'rare', 's2'), item('herakles_club', 'legendary', 's3'), item('dory', 'uncommon', 's4')];
    const list = forgeCandidates(camp.data.stash, camp.data.heroes);
    const uids = list.map((c) => c.item.uid);
    expect(uids).toContain('w1');
    expect(uids).toContain('s2');
    expect(uids).toContain('s4');
    expect(uids).not.toContain('s1');
    expect(uids).not.toContain('s3');
    expect(list.find((c) => c.item.uid === 'w1')!.hero).toBe(h);
    expect(list.find((c) => c.item.uid === 's2')!.hero).toBeUndefined();
    expect(uids.indexOf('w1')).toBeLessThan(uids.indexOf('s2'));
    expect(uids.indexOf('s2')).toBeLessThan(uids.indexOf('s4'));
  });
});

describe('the reforge (GDD rules 3-5)', () => {
  it('defaults to the weakest line, the last on a tie', () => {
    expect(forgeDefaultLine(item('falcata', 'legendary', 'u', 'dmg:2,atkSpeed:1,accuracy:2,blockPierce:1'))).toBe(3);
    expect(forgeDefaultLine(item('falcata', 'legendary', 'u', 'dmg:2,atkSpeed:1,accuracy:2,blockPierce:2'))).toBe(1);
  });

  it('the pool is the item pool minus its other lines; its own stat stays', () => {
    const it = item('falcata', 'legendary', 'u', 'dmg:2,atkSpeed:1,accuracy:2,blockPierce:1');
    const pool = forgePool(it, 1).map(([k]) => k);
    expect(pool).toContain('atkSpeed');
    for (const k of ['dmg', 'accuracy', 'blockPierce'] as AffixId[]) expect(pool).not.toContain(k);
    const full = affixPool(itemDef('falcata'));
    expect(pool.length).toBe(full.length - 3);
  });

  it('changes only the chosen line; others, power, rarity, condition and value stay; gold is paid', () => {
    for (let s = 1; s <= 200; s++) {
      const it = item('falcata', 'legendary', `u${s}`);
      const before = itemAffixes(it);
      const pow = itemPower(it);
      const value = itemValue(it);
      const line = s % before.length;
      const purse = { gold: 1000 };
      const r = forgeReroll(purse, it, line, new Rng(s));
      if (typeof r === 'string') throw new Error(r);
      const after = itemAffixes(it);
      expect(purse.gold).toBe(1000 - 240);
      expect(r.cost).toBe(240);
      expect(after.length).toBe(before.length);
      after.forEach((a, i) => {
        if (i !== line) expect(a).toEqual(before[i]);
      });
      expect(r.before).toEqual(before[line]);
      expect(r.after).toEqual(after[line]);
      expect(r.line).toBe(line);
      // never a stat the item has on another line, steps within the rarity's range
      const others = after.filter((_, i) => i !== line).map(([k]) => k);
      expect(others).not.toContain(after[line][0]);
      expect(after[line][1]).toBeGreaterThanOrEqual(AFFIX_STEPS[4][0]);
      expect(after[line][1]).toBeLessThanOrEqual(AFFIX_STEPS[4][1]);
      expect(affixPool(itemDef('falcata')).map(([k]) => k)).toContain(after[line][0]);
      expect(itemPower(it)).toEqual(pow);
      expect(it.rarity).toBe('legendary');
      expect(it.cond).toBe(80);
      expect(itemValue(it)).toBe(value);
    }
  });

  it('every stat of the pool can come up, and the same stat at a new size', () => {
    const seen = new Set<string>();
    let same = 0;
    for (let s = 1; s <= 600; s++) {
      const it = item('falcata', 'legendary', 'u', 'dmg:2,atkSpeed:1,accuracy:2,blockPierce:1');
      const r = forgeReroll({ gold: 999 }, it, 3, new Rng(s));
      if (typeof r === 'string') throw new Error(r);
      seen.add(r.after[0]);
      if (r.after[0] === 'blockPierce') same++;
    }
    expect([...seen].sort()).toEqual(forgePool(item('falcata', 'legendary', 'u', 'dmg:2,atkSpeed:1,accuracy:2,blockPierce:1'), 3).map(([k]) => k).sort());
    expect(same).toBeGreaterThan(0);
  });

  it('an item without stored stats keeps its rolled lines and stores them', () => {
    const it = item('kopis', 'epic', 'roll-me');
    const before = itemAffixes(it);
    expect(it.aff).toBeUndefined();
    const r = forgeReroll({ gold: 500 }, it, 0, new Rng(9));
    expect(typeof r).toBe('object');
    expect(it.aff).toBeTruthy();
    expect(itemAffixes(it).slice(1)).toEqual(before.slice(1));
  });
});

describe('determinism and refusals (GDD rules 7, 9)', () => {
  it('the same RNG state gives the same reforge; the state advances', () => {
    const a = item('falcata', 'legendary', 'same');
    const b = item('falcata', 'legendary', 'same');
    const ra = new Rng(1234);
    const rb = new Rng(1234);
    forgeReroll({ gold: 999 }, a, 2, ra);
    forgeReroll({ gold: 999 }, b, 2, rb);
    expect(a.aff).toBe(b.aff);
    expect(ra.state).toBe(rb.state);
    expect(ra.state).not.toBe(new Rng(1234).state);
  });

  it('too little gold refuses and changes nothing, the RNG included', () => {
    const it = item('falcata', 'legendary', 'poor');
    const purse = { gold: 239 };
    const rng = new Rng(77);
    expect(forgeReroll(purse, it, 0, rng)).toBe('gold');
    expect(purse.gold).toBe(239);
    expect(it.aff).toBeUndefined();
    expect(rng.state).toBe(new Rng(77).state);
  });

  it('refuses a named legendary, a common item and a line that does not exist', () => {
    expect(forgeReroll({ gold: 9999 }, item('herakles_club', 'legendary'), 0, new Rng(1))).toBe('named');
    expect(forgeReroll({ gold: 9999 }, item('xiphos', 'common'), 0, new Rng(1))).toBe('noStats');
    expect(forgeReroll({ gold: 9999 }, item('xiphos', 'uncommon'), 5, new Rng(1))).toBe('noStats');
  });

  it('in the campaign: the world RNG draws, and the save carries the new line and the RNG state', () => {
    const run = () => {
      const camp = Campaign.fresh(42);
      camp.data.gold = 500;
      const it = item('falcata', 'legendary', 'camp1');
      camp.data.stash.push(it);
      const rng0 = camp.world.rng.state;
      const r = forgeReroll(camp.data, it, 0, camp.world.rng);
      const save = camp.sync();
      return { r, rng0, save, aff: it.aff };
    };
    const x = run();
    const y = run();
    expect(typeof x.r).toBe('object');
    expect(x.save.gold).toBe(260);
    expect(x.save.world!.rng).not.toBe(x.rng0);
    expect(x.save.stash.find((i) => i.uid === 'camp1')!.aff).toBe(x.aff);
    expect(y.aff).toBe(x.aff);
  });
});

describe('the gold sink (GDD "Formulas", docs/v5/balance/EC-01.md)', () => {
  /** Expected reforges to hit `want` at the top step on `line`, from the pool's weights (geometric). */
  const expectedTries = (it: Item, line: number, want: AffixId): number => {
    const pool = forgePool(it, line);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    const w = pool.find(([k]) => k === want)?.[1] ?? 0;
    const [lo, hi] = AFFIX_STEPS[4];
    return 1 / ((w / total) * (1 / (hi - lo + 1)));
  };

  it('perfecting one line of a tier-3 legendary costs several late wins; one reforge costs less than one', () => {
    const it = item('falcata', 'legendary', 'sink', 'atkSpeed:2,accuracy:2,blockPierce:2,moraleShock:1');
    const tries = expectedTries(it, 3, 'dmg');
    const gold = tries * forgeCost(it);
    // a tier-3 win pays 213 g of battle pay (docs/v5/balance/AR-03.md "Economy", with the win bonus)
    const battlePay = 213;
    expect(WIN_GOLD).toBe(60);
    // one reforge stays under one tier-3 win's gold: battle pay plus the low end of loot resale (BASELINE: 120 g)
    expect(forgeCost(it)).toBeLessThan(battlePay + 120);
    expect(gold / battlePay).toBeGreaterThan(4);
    // the GDD's worked value: the falcata's pool is 6 stats (damage and shield pierce count double, weight 8);
    // with 3 other lines out (weight 4), damage at 2 steps is 2/4 x 1/2: 4 tries, 960 g
    expect(affixPool(itemDef('falcata')).length).toBe(6);
    expect(Math.round(tries)).toBe(4);
    expect(Math.round(gold)).toBe(960);
  });
});

describe('a line as the sheet shows it', () => {
  it('signed, in the stat unit, percentages as %', () => {
    expect(affixLineText(item('falcata', 'rare'), 'dmg', 2)).toBe('+1');
    expect(affixLineText(item('falcata', 'rare'), 'atkSpeed', 2)).toBe('+6%');
    expect(affixLineText(item('falcata', 'rare'), 'blockPierce', 1)).toBe('+2%');
    expect(affixLineText(item('linothorax', 'rare'), 'hp', 1)).toBe('+3');
    expect(affixLineText(item('javelins', 'rare'), 'ammo', 2)).toBe('+2');
  });
});

describe('gold with thousands separators', () => {
  it('Russian groups by spaces, English by commas', () => {
    expect(groupDigits(999, 'ru')).toBe('999');
    expect(groupDigits(1680, 'ru')).toBe('1 680');
    expect(groupDigits(12450, 'ru')).toBe('12 450');
    expect(groupDigits(1234567, 'ru')).toBe('1 234 567');
    expect(groupDigits(12450, 'en')).toBe('12,450');
    expect(groupDigits(-1680, 'en')).toBe('-1,680');
  });
});
