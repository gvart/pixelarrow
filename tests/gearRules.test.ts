import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/data/classes';
import { ITEM_LIST, itemDef } from '../src/data/items';
import { CLASS_GEAR, armorWeight, classGearBlocker, classesFor, gearPenalty, requirements, shieldType, shortfall, weaponFamily } from '../src/data/gearRules';

describe('class gear limits', () => {
  it('every class may use every item of its own starting kit', () => {
    for (const c of Object.values(CLASSES)) {
      for (const tiers of Object.values(c.kit)) {
        for (const ids of tiers ?? []) for (const id of ids) {
          if (!id) continue;
          expect(classGearBlocker(c.id, itemDef(id)), `${c.id} ${id}`).toBeNull();
        }
      }
    }
  });

  it('every weapon, shield and armour has a family, type or weight, and some class can use it', () => {
    for (const d of ITEM_LIST) {
      if (d.slot === 'weapon') expect(weaponFamily(d), d.id).not.toBeNull();
      if (d.slot === 'shield') expect(shieldType(d), d.id).not.toBeNull();
      if (d.slot === 'armor') expect(armorWeight(d), d.id).not.toBeNull();
      expect(classesFor(d).length, d.id).toBeGreaterThan(0);
    }
  });

  it('limits weapons, shields and armour but not helmets and trinkets', () => {
    expect(classGearBlocker('archer', itemDef('dory'))).toBe('weapon');
    expect(classGearBlocker('hoplite', itemDef('pelte'))).toBe('shield');
    expect(classGearBlocker('slinger', itemDef('cuirass'))).toBe('armor');
    expect(classGearBlocker('slinger', itemDef('corinthian'))).toBeNull();
    expect(classGearBlocker('companion', itemDef('hoplon'))).toBeNull();
    expect(classGearBlocker('wolf', itemDef('owl_amulet'))).toBe('none');
    expect(Object.keys(CLASS_GEAR)).toContain('sacred_band');
  });
});

describe('attribute requirements', () => {
  it('grow with tier and rarity', () => {
    expect(requirements('dory', 'common')).toEqual([]);
    expect(requirements('sauroter_dory', 'legendary')).toEqual([{ attr: 'str', n: 12 }]);
    expect(requirements('cuirass', 'common')).toEqual([{ attr: 'end', n: 9 }, { attr: 'str', n: 6 }]);
    expect(requirements('owl_amulet', 'legendary')).toEqual([]);
    expect(requirements('xiphos', 'epic')).toEqual([{ attr: 'agi', n: 7 }]);
  });

  it('turn missing points into a capped penalty', () => {
    const a = { str: 9, agi: 5, end: 5, wil: 5 };
    expect(shortfall(a, 'sauroter_dory', 'legendary')).toBe(3);
    expect(gearPenalty(3)).toBeCloseTo(0.3);
    expect(gearPenalty(12)).toBe(0.7);
    expect(shortfall(undefined, 'sauroter_dory', 'legendary')).toBe(0);
  });
});
