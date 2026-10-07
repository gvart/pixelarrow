import { describe, expect, it } from 'vitest';
import { MARKET, priceBounds } from '../src/economy/catalog';
import { normalizeItem, RARITIES } from '../../src/data/items';

describe('five rarity tiers on the server', () => {
  it('has price bounds for every tier, growing with rarity', () => {
    for (const cur of ['gold', 'drachmae'] as const) {
      let prev = 0;
      for (const r of RARITIES) {
        const [min, max] = priceBounds(cur, r);
        expect(MARKET.priceBounds[cur][r], `${cur} ${r}`).toBeDefined();
        expect(max).toBeGreaterThan(min);
        expect(max).toBeGreaterThanOrEqual(prev);
        prev = max;
      }
    }
  });

  it('maps the old tier names and falls back for unknown ones', () => {
    expect(priceBounds('gold', 'fine')).toEqual(priceBounds('gold', 'uncommon'));
    expect(priceBounds('gold', 'heroic')).toEqual(priceBounds('gold', 'epic'));
    expect(priceBounds('drachmae', 'bogus')).toEqual(MARKET.priceBounds.drachmae.default);
  });

  it('normalises stored items', () => {
    const it = normalizeItem({ uid: 'a', def: 'xiphos', rarity: 'fine', cond: 90 } as never) as { rarity: string };
    expect(it.rarity).toBe('uncommon');
  });
});
