import { describe, expect, it } from 'vitest';
import { readText } from './support/nodeIo.js';

// nav.ts reaches telegram.ts, which touches `window` only when attaching; give node a minimal one.
(globalThis as Record<string, unknown>).window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };

const { SLOT_ORDER, FOOT_GAP, armyBack, footerLayout, collapsed, groupNameBeside } = await import('../src/ui/army/layout');
const { SLOTS } = await import('../src/data/items');
const { ARMY_V5_EN } = await import('../src/i18n/army.v5.en');
const { ARMY_V5_RU } = await import('../src/i18n/army.v5.ru');

const exists = (p: string): boolean => {
  try {
    readText(p);
    return true;
  } catch {
    return false;
  }
};

describe('Army template (ARM-01)', () => {
  it('Back returns to the screen that opened the Army, with its data (ARM-1, BACK_RULES origin)', () => {
    expect(armyBack({ from: 'Menu' })).toEqual({ scene: 'Menu', data: {} });
    expect(armyBack({ from: 'World' })).toEqual({ scene: 'World', data: {} });
    expect(armyBack({ from: 'Settlement', id: 7 })).toEqual({ scene: 'Settlement', data: { id: 7 } });
    expect(armyBack({ from: 'Camp' })).toEqual({ scene: 'Camp', data: { mode: 'field' } });
    // opened with no origin (Battle Leave, Results): the rule's fallback
    expect(armyBack({})).toEqual({ scene: 'World', data: {} });
    // never back into itself
    expect(armyBack({ from: 'Army' })).toEqual({ scene: 'World', data: {} });
  });

  it('has no footer back: the strings for a "Map/Town/Camp" footer button are not used by the scene (N3)', () => {
    const src = readText('src/scenes/ArmyScene.ts');
    expect(src).not.toMatch(/'army\.(map|town|camp)'/);
    expect(src).not.toMatch(/id: 'army\.back'/);
  });

  it('keeps every action of the old screen (ELEMENT_MAP E139-E156)', () => {
    const src = readText('src/scenes/ArmyScene.ts') + readText('src/ui/army/parts.ts');
    for (const id of ['army.topbar', 'army.chip.men', 'army.chip.gold', 'army.chip.hurt', 'army.group.', 'army.tab', 'army.filter', 'army.sort', 'roster:', 'army.dismiss', 'army.sheet', 'stash.sell', 'stash.scrap', 'stash.repair', 'stash.equip', 'stash.unequip'])
      expect(src, id).toContain(id);
    expect(src).toContain('confirmDialog'); // dismiss, sell and scrap confirm
    expect(src).toContain('openItemCard'); // item card / compare
    expect(src).toContain('drag.targets'); // drag to a slot
    expect(src).toContain('MStashGrid');
  });

  it('uses one slot order for Army and Hero: Hero left column, then right column (ARM-8)', () => {
    expect(SLOT_ORDER).toEqual(['helmet', 'armor', 'trinket', 'weapon', 'shield']);
    expect([...SLOT_ORDER].sort()).toEqual([...SLOTS].sort());
  });

  it('keeps Dismiss 24 pt from the primary and never wider than its share at 320', () => {
    expect(FOOT_GAP).toBeGreaterThanOrEqual(12);
    for (const w of [146, 160, 172, 190]) {
      const f = footerLayout(w, 70, 50);
      expect(f.sheet.x - (f.dismiss.x + f.dismiss.w)).toBe(FOOT_GAP);
      expect(f.sheet.x + f.sheet.w).toBe(w - 4);
      expect(f.sheet.w).toBeGreaterThanOrEqual(50);
      expect(f.dismiss.w).toBeGreaterThanOrEqual(Math.round((w - 8 - FOOT_GAP) * 0.38) - 1);
    }
  });

  it('collapses the card to one line once its name line is scrolled away (P21)', () => {
    expect(collapsed(0, 40)).toBe(false);
    expect(collapsed(52, 40)).toBe(false);
    expect(collapsed(53, 40)).toBe(true);
  });

  it('puts the group name beside the buttons only when it fits', () => {
    expect(groupNameBeside(40, 30)).toBe(true);
    expect(groupNameBeside(26, 30)).toBe(false);
  });

  it('ships every bust it lists (promoted through scripts/art/promote.mjs)', async () => {
    const { SHIPPED_BUSTS, bustUrl } = await import('../src/ui/army/layout');
    for (const c of SHIPPED_BUSTS) expect(exists(`public/${bustUrl(c)}`), c).toBe(true);
  });

  it('has every v5 Army string in Russian', () => {
    expect(Object.keys(ARMY_V5_RU).sort()).toEqual(Object.keys(ARMY_V5_EN).sort());
    for (const v of Object.values(ARMY_V5_RU)) expect(v).toMatch(/[а-яё]/i);
  });
});
