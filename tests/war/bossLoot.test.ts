import { describe, expect, it } from 'vitest';
import { BOSS_TIERS, bossLoot, bossOfRegion, WAR_BOSSES } from '../../src/data/warBosses';
import { ITEMS } from '../../src/data/items';
import { setPieces } from '../../src/data/sets';
import { worldRegion } from '../../src/war/world/graph';

const ORPHANS = ['poseidon_trident', 'aegis_of_zeus', ...setPieces('achilles'), ...setPieces('alexander')];

describe('war boss drop tables (W-45)', () => {
  it('every boss guards a distinct neutral region; signatures are real items or sets', () => {
    expect(new Set(WAR_BOSSES.map((b) => b.region)).size).toBe(WAR_BOSSES.length);
    for (const b of WAR_BOSSES) {
      expect(worldRegion(b.region)?.role).toBe('neutral');
      expect(bossOfRegion(b.region)).toBe(b);
      for (const s of b.signature) expect(ITEMS[s] !== undefined || setPieces(s).length > 0).toBe(true);
    }
  });

  it('is deterministic per kill seed and drops the tier\'s piece count', () => {
    for (const b of WAR_BOSSES) {
      expect(bossLoot(b.id, 'k1')).toEqual(bossLoot(b.id, 'k1'));
      expect(bossLoot(b.id, 'k1')).toHaveLength(BOSS_TIERS[b.tier].picks);
      for (const d of bossLoot(b.id, 'k1')) expect(ITEMS[d.def]).toBeDefined();
    }
    expect(bossLoot('nobody', 'k1')).toEqual([]);
  });

  it('is the source of every orphaned legendary: each drops from its boss within 400 kills', () => {
    const seen = new Set<string>();
    for (const b of WAR_BOSSES) for (let i = 0; i < 400; i++) for (const d of bossLoot(b.id, `k${i}`)) if (d.rarity === 'legendary') seen.add(d.def);
    for (const id of ORPHANS) expect(seen, id).toContain(id);
  });

  it('tier 1 and 2 bosses never drop a set piece or a named legendary', () => {
    for (const b of WAR_BOSSES.filter((x) => x.tier < 3))
      for (let i = 0; i < 200; i++) for (const d of bossLoot(b.id, `k${i}`)) expect(ITEMS[d.def].set ?? ITEMS[d.def].named ?? false).toBeFalsy();
  });
});
