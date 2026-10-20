/** M5h1 crafting data (docs/WAR.md "Crafting and professions"): trees, recipes, craft grade and crafted item rolls. */
import { describe, expect, it } from 'vitest';
import { BASE_ITEMS, ITEM_LIST, itemMods, QUALITY_MULT, SLOTS, type Item } from '../src/data/items';
import { itemCapCases, runItemCap } from '../src/dev/rarityBalance';
import { AFFIXES, itemPower, parseAffixes, WAR_IGNORED, WAR_POWER_IGNORED } from '../src/data/affixes';
import { CIV_TOOLS } from '../src/data/classes';
import { nodeRefusal, pointsAt, PROF_IDS, PROF_TREES, validPicks } from '../src/data/professions';
import { craftGrade, craftRoll, crudeChance, FRESH_KIT, masterworkChance, RARITY_ODDS, RECIPES, recipeFor, toolRecipe } from '../src/data/recipes';
import { CLAMP, freshHero, warStats, warStatsOf } from '../src/war/sim/classes';

describe('profession trees', () => {
  it('six trees of a root, 9 nodes and 2 capstones; 8 points by L9', () => {
    for (const p of PROF_IDS) {
      const t = PROF_TREES[p];
      expect(t.filter((n) => n.root)).toHaveLength(1);
      expect(t.filter((n) => n.capstone)).toHaveLength(2);
      expect(t.filter((n) => !n.root && !n.capstone)).toHaveLength(9);
      for (const n of t) for (const x of [...(n.needs ?? []), ...(n.needsAny?.[1] ?? [])]) expect(t.some((m) => m.id === x)).toBe(true);
    }
    expect(pointsAt(1)).toBe(0);
    expect(pointsAt(9)).toBe(8);
    expect(pointsAt(10)).toBe(8);
  });

  it('level, needs, points and one capstone gate the picks', () => {
    expect(nodeRefusal('smith', 1, [], 'armourer')).toBe('level');
    expect(nodeRefusal('smith', 2, [], 'armourer')).toBeNull();
    expect(nodeRefusal('smith', 2, ['bladesmith'], 'armourer')).toBe('points');
    expect(nodeRefusal('smith', 4, ['armourer'], 'journeyman')).toBe('needs');
    expect(nodeRefusal('smith', 4, ['armourer', 'bladesmith'], 'journeyman')).toBeNull();
    expect(nodeRefusal('smith', 10, [], 'cookhouse')).toBe('unknown');
    expect(nodeRefusal('smith', 10, [], 'baker')).toBe('tree');
    expect(nodeRefusal('smith', 10, ['reforger'], 'goldsmith')).toBe('capstone');
    // 8 points never take all 9 nodes
    const all = PROF_TREES.smith.filter((n) => !n.root && !n.capstone).sort((a, b) => a.level - b.level).map((n) => n.id);
    expect(validPicks('smith', 10, all)).toBe(false);
    expect(validPicks('smith', 10, all.filter((x) => x !== 'fieldForge'))).toBe(true);
  });
});

describe('recipes', () => {
  it('every base item has a recipe; only set pieces and named items lack one', () => {
    for (const d of ITEM_LIST) {
      const r = recipeFor(d);
      if (d.set || d.named) expect(r).toBeNull();
      else {
        expect(r, d.id).not.toBeNull();
        expect(RECIPES[`item:${d.id}`]).toBe(r);
        expect(r!.lv).toBe(FRESH_KIT.has(d.id) ? 1 : Math.min(3, d.tier)); // M5h6: the fresh kit crafts as tier 1
        for (const v of Object.values(r!.inputs)) expect(v).toBeGreaterThan(0);
      }
    }
    expect(BASE_ITEMS.length).toBeGreaterThan(100);
  });

  it('the smith template: material, iron charcoal, T3 silver, node and tier gates', () => {
    const dory = RECIPES['item:dory'];
    expect(dory.inputs).toEqual({ iron: 3, charcoal: 3, wood: 2 });
    expect(dory.node).toBe('smelter');
    expect(dory.needs).toBeUndefined();
    const falcata = RECIPES['item:falcata'];
    expect(falcata).toMatchObject({ node: 'bladesmith', needs: ['master'], lv: 3, secs: 240 });
    expect(falcata.inputs).toEqual({ iron: 8, charcoal: 8, wood: 2, leather: 1, silver: 1 });
    expect(RECIPES['item:mail'].node).toBe('heavyArmour');
    expect(RECIPES['item:cap'].node).toBe('armourer');
    expect(RECIPES['item:corinthian'].node).toBe('heavyArmour');
    expect(RECIPES['item:self_bow'].node).toBe('bowyer');
  });

  it('every tool has a recipe at its workshop level', () => {
    for (const id of Object.keys(CIV_TOOLS)) {
      const r = toolRecipe(id)!;
      expect(r.lv).toBe(CIV_TOOLS[id].tier);
      expect(RECIPES[`tool:${id}`]).toEqual(r);
    }
    expect(RECIPES['tool:dioptra'].inputs.silver).toBe(1);
  });
});

describe('crafted item rolls', () => {
  it('odds rows sum to 100', () => {
    for (const row of RARITY_ODDS) expect(row.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('craft grade by the formula, within 1-19', () => {
    expect(craftGrade({ level: 1 })).toBe(1);
    expect(craftGrade({ level: 10, toolTier: 3, toolRarity: 'legendary', wpLevel: 3, masterwork: true, specialty: true })).toBe(19);
    expect(craftGrade({ level: 5, toolTier: 2, toolRarity: 'rare', wpLevel: 2 })).toBe(5 + 1 + 1 + 1);
  });

  it('T1 never rolls epic; same seed, same item', () => {
    for (let i = 0; i < 2000; i++) {
      const it = craftRoll('dory', 19, `o${i}`, { masterwork: true });
      expect(['common', 'uncommon', 'rare']).toContain(it.rarity);
    }
    expect(craftRoll('kopis', 12, 'order-7', { maker: 'Nikias' })).toEqual(craftRoll('kopis', 12, 'order-7', { maker: 'Nikias' }));
  });

  it('war pool: no ignored stats or powers; tools roll Deft, Bountiful, Sturdy, Wise', () => {
    let leg = 0, mw = 0, crude = 0;
    for (let i = 0; i < 3000; i++) {
      const it = craftRoll('falcata', 19, i, { masterwork: true });
      for (const [k] of parseAffixes(it.aff ?? '')) expect(WAR_IGNORED.has(k)).toBe(false);
      if (it.pow) expect(WAR_POWER_IGNORED.has(it.pow as never)).toBe(false);
      if (it.rarity === 'legendary') leg++;
      if (it.q === 2) (mw++, expect(parseAffixes(it.aff ?? '')[0]?.[1] ?? 2).toBe(2));
      if (it.q === 0) crude++;
    }
    expect(leg).toBeGreaterThan(0);
    expect(mw / 3000).toBeCloseTo(masterworkChance(19), 1);
    expect(crude).toBe(0);
    expect(crudeChance(1)).toBeCloseTo(0.27);
    for (let i = 0; i < 300; i++) {
      const t = craftRoll('iron_pick', 19, i);
      for (const [k] of parseAffixes(t.aff ?? '')) expect(['deft', 'bountiful', 'durable', 'xpBonus']).toContain(k);
    }
    expect(AFFIXES.breaching.slots).toEqual(['melee']);
  });

  it('quality scales base stats: crude x0.95, masterwork x1.02 (the cap fallback of x1.04)', () => {
    const base: Item = { uid: 'q', def: 'kopis', rarity: 'common', cond: 100 };
    const fine = itemMods(base).dmg!;
    expect(itemMods({ ...base, q: 0 }).dmg).toBeCloseTo(fine * 0.95, 1);
    expect(QUALITY_MULT[2]).toBe(1.02);
    expect(itemMods({ ...base, q: 2 }).dmg).toBeCloseTo(fine * 1.02, 1);
    expect(itemPower({ ...base, rarity: 'legendary', pow: 'rend' })).toEqual({ id: 'rend', grade: 1 });
  });

  it('a max soldier in masterwork legendaries stays inside the bake clamp', () => {
    const h = freshHero('hoplite');
    h.level = 10;
    h.attrs = { str: 15, agi: 15, end: 15, wil: 15 };
    for (const [slot, it] of Object.entries(h.equip)) if (it) h.equip[slot as 'weapon'] = { ...it, rarity: 'legendary', q: 2, aff: 'dmg:2,hp:2,armor:2,block:2' };
    const s = warStatsOf(h), b = warStats('hoplite');
    expect(s.maxHp).toBeLessThanOrEqual(Math.round(b.maxHp * CLAMP.hp));
    expect(s.dmg).toBeLessThanOrEqual(b.dmg * CLAMP.dmg + 1e-9);
    expect(s.armor).toBeLessThanOrEqual(b.armor + CLAMP.armor + 1e-9);
    expect(s.block).toBeLessThanOrEqual(b.block + CLAMP.block + 1e-9);
  });

  it('itemCapReport: a masterwork legendary adds no more than the drop legendary of its slot (within 1 SE)', () => {
    const cases = itemCapCases();
    const n = 30;
    let mw = 0, leg = 0;
    for (const slot of SLOTS) {
      const m = cases.find((c) => c.label === `masterwork ${slot}`)!, l = cases.find((c) => c.label === `legendary ${slot}`)!;
      for (let i = 0; i < n; i++) (mw += runItemCap(7000 + i, m, 5)), (leg += runItemCap(7000 + i, l, 5));
    }
    const total = n * SLOTS.length;
    expect((100 * (mw - leg)) / total).toBeLessThanOrEqual(50 / Math.sqrt(total));
  }, 60000);
});
