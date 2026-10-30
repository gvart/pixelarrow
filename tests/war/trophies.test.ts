/**
 * W-73 legendary gear is a guardian trophy only: no smith rolls a legendary (crafting tops out at epic), random guardian
 * picks top out at epic, and a guardian kill drops at most one legendary, its trophy: named after the guardian, every
 * random stat at its top step (the war bake's cap), never worse than the best crafted piece.
 */
import { describe, expect, it } from 'vitest';
import { craftRoll, TIER_CAP } from '../../src/data/recipes';
import { BOSS_TIERS, bossLoot, WAR_BOSSES } from '../../src/data/warBosses';
import { AFFIX_STEPS, itemAffixes, itemDisplayName } from '../../src/data/affixes';
import { BASE_ITEMS, RARITIES } from '../../src/data/items';
import { bossPile } from '../../src/war/sim/bossLoot';

describe('legendary gear as a guardian trophy (W-73)', () => {
  it('no craft rolls a legendary, at any grade and tier', () => {
    expect(Math.max(...TIER_CAP)).toBe(RARITIES.indexOf('epic'));
    const t3 = BASE_ITEMS.find((d) => d.tier === 3 && d.slot === 'weapon')!;
    let epic = 0;
    for (let i = 0; i < 3000; i++) {
      const it = craftRoll(t3.id, 19, i, { masterwork: true });
      expect(it.rarity).not.toBe('legendary');
      if (it.rarity === 'epic') epic++;
    }
    expect(epic).toBeGreaterThan(300);
  });

  it('a kill drops at most one legendary, first and marked a trophy; tier 2-3 always, tier 1 about one kill in four', () => {
    for (const b of WAR_BOSSES) {
      let trophies = 0;
      for (let i = 0; i < 400; i++) {
        const drop = bossLoot(b.id, `k${i}`);
        expect(drop).toHaveLength(BOSS_TIERS[b.tier].picks);
        drop.forEach((d, j) => {
          expect(d.rarity === 'legendary', `${b.id} k${i} ${j}`).toBe(!!d.trophy);
          if (d.trophy) expect(j).toBe(0);
        });
        if (drop[0].trophy) trophies++;
      }
      if (b.tier === 1) expect(trophies / 400, b.id).toBeGreaterThan(0.15), expect(trophies / 400, b.id).toBeLessThan(0.35);
      else expect(trophies, b.id).toBe(400);
    }
  });

  it('the trophy item carries the guardian\'s name and its random stats at the top step', () => {
    const b = WAR_BOSSES.find((x) => x.tier === 2 && !x.signature.length)!; // no signature: a plain tier-3 piece named after him
    const pile = bossPile('r', 'run', { t: 1, kind: 'bossSlain', boss: b.id, killers: [], x: 1, y: 1 } as never);
    const tr = pile.items.find((x) => x.rarity === 'legendary')!;
    expect(tr.tr).toBe(b.name);
    expect(pile.items.filter((x) => x.rarity === 'legendary')).toHaveLength(1);
    const aff = itemAffixes(tr);
    expect(aff.length).toBeGreaterThan(0);
    for (const [, n] of aff) expect(n).toBe(AFFIX_STEPS[4][1]);
    expect(itemDisplayName(tr)).toContain(`of ${b.name}`);
  });
});
