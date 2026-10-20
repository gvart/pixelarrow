/**
 * M5h6 crafting balance (docs/impl/global-war-rebuild.md, scripts/war/balance.mjs): the verify lines, and the power cap
 * of the war bake for every item at every rarity and quality.
 */
import { describe, expect, it } from 'vitest';
import { classGearBlocker } from '../../src/data/gearRules';
import { ITEM_LIST, RARITIES, type Item } from '../../src/data/items';
import { BAL, capOf, ELITES, freshKits, legendaryRate, POWER_KEYS, SMITHS, TRAINED } from '../../src/dev/craftBalance';
import { warStatsOf } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';

describe('M5h6 verify lines', () => {
  it(`a fresh kit for N of every trained class in <= ${BAL.kitHours} h of a T1 forge`, () => {
    for (const r of freshKits().filter((x) => x.smith === SMITHS[0].label)) {
      expect(r.bill.missing, r.cls).toEqual([]);
      expect(r.hours, r.cls).toBeLessThanOrEqual(BAL.kitHours);
    }
  });

  it('a master smith makes about one legendary a play week', () => {
    const { leg } = legendaryRate();
    expect(leg).toBeGreaterThanOrEqual(BAL.legendariesPerWeek[0]);
    expect(leg).toBeLessThanOrEqual(BAL.legendariesPerWeek[1]);
  });
});

describe('war bake cap: every item, every rarity and quality', () => {
  const classes = [...new Set([...TRAINED, ...ELITES])];
  // the best random stats a slot may carry, at their top step
  const aff = 'dmg:3,hp:3,armor:3,block:3,accuracy:3,rangedDmg:3,range:3,ammo:3,armorPierce:3,atkSpeed:3,speed:3';
  it.each(classes)('%s stays inside capOf', (cls) => {
    const cap = capOf(cls);
    const p = makePerson('cap', cls, { level: 10 });
    p.hero.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
    let n = 0;
    for (const d of ITEM_LIST) {
      if (classGearBlocker(cls, d)) continue;
      for (const rarity of RARITIES)
        for (const q of [0, 1, 2] as const) {
          const it: Item = { uid: 'x', def: d.id, rarity, cond: 100, q, aff };
          const s = warStatsOf({ ...p, hero: { ...p.hero, equip: { ...p.hero.equip, [d.slot]: it } } });
          for (const k of POWER_KEYS) expect(s[k], `${cls} ${d.id} ${rarity} q${q} ${k}`).toBeLessThanOrEqual(cap[k] + 1e-9);
          n++;
        }
    }
    expect(n).toBeGreaterThan(0);
  });
});
