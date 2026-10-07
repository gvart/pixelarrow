import { describe, expect, it } from 'vitest';
import { capitals, hexDistance, hexInfo, hexesWithin, SHARD_RADIUS } from '../src/online/hex';
import { beastHex } from '../src/online/lairs';
import { CONSUMABLE_IDS, CONSUMABLES } from '../src/data/consumables';
import { ITEMS } from '../src/data/items';
import {
  BASE_GEAR,
  capKey,
  gearPrice,
  holderCut,
  MERCHANT,
  merchantAt,
  merchantDay,
  merchantStock,
  nextReset,
  offerPrice,
  POST_GOODS,
  regionOf,
  REGIONS,
  SPECIALTIES,
  tradingPostAt,
  tradingPosts,
} from '../src/online/merchants';
import { demoShard } from '../src/online/demoShard';

const DAY = '2026-10-07';

describe('trading posts', () => {
  it('a handful per shard (one per ~300 hexes), deterministic, spread apart, half harbours', () => {
    for (const seed of [1, 42, 4242, 987654]) {
      const a = tradingPosts(seed);
      expect(a).toEqual(tradingPosts(seed));
      const hexes = hexesWithin({ q: 0, r: 0 }, SHARD_RADIUS).length;
      expect(a.length).toBe(Math.round(hexes / MERCHANT.hexesPerPost));
      expect(a.filter((p) => p.kind === 'harbour').length).toBe(Math.ceil(a.length / 2));
      for (const p of a) for (const o of a) if (p !== o) expect(hexDistance(p, o)).toBeGreaterThanOrEqual(MERCHANT.postSpacing);
    }
    // another seed, another layout
    expect(tradingPosts(1)).not.toEqual(tradingPosts(2));
  });

  it('never on towns, forts, capitals, beasts or near the capitals (so never on a home); harbours on the coast', () => {
    const seed = 4242;
    const caps = capitals();
    for (const p of tradingPosts(seed)) {
      const i = hexInfo(seed, p.q, p.r);
      expect(i.passable).toBe(true);
      expect(i.type).not.toBe('town');
      expect(i.fort || i.capital).toBe(false);
      expect(beastHex(seed, i)).toBe(false);
      expect(Math.min(...caps.map((c) => hexDistance(c, p)))).toBeGreaterThanOrEqual(MERCHANT.postCapitalGap);
      if (p.kind === 'harbour') expect(i.coast).toBe(true);
      else expect(i.site.river && !i.coast).toBe(true);
      expect(tradingPostAt(seed, p)).toBe(p.kind);
      expect(merchantAt(seed, i)).toBe(p.kind);
    }
  });

  it('every town has a merchant; plain land does not', () => {
    const seed = 42;
    const posts = new Set(tradingPosts(seed).map((p) => `${p.q}_${p.r}`));
    let towns = 0;
    for (const h of hexesWithin({ q: 0, r: 0 }, SHARD_RADIUS)) {
      const i = hexInfo(seed, h.q, h.r);
      const m = merchantAt(seed, i);
      if (i.type === 'town') {
        towns++;
        expect(m).toBe('town');
      } else expect(m === null).toBe(!posts.has(i.id));
    }
    expect(towns).toBeGreaterThan(7);
  });

  it('regions follow the nearest capital', () => {
    const caps = capitals();
    caps.forEach((c, i) => expect(regionOf(c)).toBe(REGIONS[i]));
    expect(regionOf({ q: 1, r: 0 })).toBe('attica');
  });
});

describe('merchant stock', () => {
  const seed = 42;
  const town = hexesWithin({ q: 0, r: 0 }, SHARD_RADIUS).find((h) => hexInfo(seed, h.q, h.r).type === 'town' && !hexInfo(seed, h.q, h.r).capital)!;
  const post = tradingPosts(seed)[0];

  it('is a pure function of (seed, hex, day): the same all day, rotating day by day', () => {
    const a = merchantStock(seed, town, 'town', DAY);
    expect(merchantStock(seed, town, 'town', DAY)).toEqual(a);
    const week = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'].map((d) => merchantStock(seed, town, 'town', d).map((o) => o.id).join());
    expect(week.some((ids) => ids !== a.map((o) => o.id).join())).toBe(true);
    // ids are unique within a stock
    expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
  });

  it('towns: every consumable, basic gear, two regional uncommons and a rare', () => {
    const s = merchantStock(seed, town, 'town', DAY);
    const cons = s.filter((o) => o.kind === 'consumable');
    expect(cons.map((o) => o.ref)).toEqual(CONSUMABLE_IDS);
    for (const o of cons) expect(o).toMatchObject({ gold: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].gold, drachmae: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].drachmae, dailyCap: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].dailyCap });
    const base = s.filter((o) => o.kind === 'item' && o.slot === 'base');
    expect(base).toHaveLength(MERCHANT.baseGear);
    for (const o of base) expect(BASE_GEAR).toContain(o.ref);
    const region = s.filter((o) => o.slot === 'region');
    expect(region).toHaveLength(2);
    for (const o of region) {
      expect(SPECIALTIES[regionOf(town)]).toContain(o.ref);
      expect(o.rarity).toBe('uncommon');
    }
    const rare = s.filter((o) => o.slot === 'rare');
    expect(rare).toHaveLength(1);
    expect(rare[0].rarity).toBe('rare');
    expect(ITEMS[rare[0].ref].tier).toBeGreaterThanOrEqual(2);
    // gear: gold only (no power for Drachmae)
    for (const o of s.filter((x) => x.kind === 'item')) {
      expect(o.drachmae).toBeNull();
      expect(o.gold).toBe(gearPrice(o.ref, o.rarity));
      expect(o.dailyCap).toBe(MERCHANT.gearCap[o.slot]);
    }
  });

  it('trading posts carry rarer stock: all regional goods and their own at rare, an epic in the rotating slot', () => {
    const s = merchantStock(seed, post, post.kind, DAY);
    const region = s.filter((o) => o.slot === 'region');
    const want = new Set([...SPECIALTIES[regionOf(post)], ...POST_GOODS[post.kind]]);
    expect(new Set(region.map((o) => o.ref))).toEqual(want);
    for (const o of region) expect(o.rarity).toBe('rare');
    expect(s.find((o) => o.slot === 'rare')!.rarity).toBe('epic');
  });

  it('prices: the holder discount, the holder cut, cap keys', () => {
    const wine = { gold: 80, drachmae: 15 };
    expect(offerPrice(wine, 'gold', false)).toBe(80);
    expect(offerPrice(wine, 'gold', true)).toBe(72);
    expect(offerPrice(wine, 'drachmae', true)).toBe(14);
    expect(offerPrice({ gold: 300, drachmae: null }, 'drachmae', false)).toBeNull();
    expect(offerPrice({ gold: 1, drachmae: null }, 'gold', true)).toBe(1);
    expect(holderCut({ gold: 120 })).toBe(6);
    expect(holderCut({ gold: 10 })).toBe(0);
    expect(gearPrice('cretan_bow', 'rare')).toBe(75 * 5);
    expect(capKey({ kind: 'consumable', ref: 'war_horn', rarity: 'rare' })).toBe('war_horn');
    expect(capKey({ kind: 'item', ref: 'falx', rarity: 'uncommon' })).toBe('falx:uncommon');
  });

  it('the UTC day and the reset', () => {
    const t = Date.UTC(2026, 9, 7, 23, 59);
    expect(merchantDay(t)).toBe('2026-10-07');
    expect(nextReset(t)).toBe(Date.UTC(2026, 9, 8));
    expect(merchantDay(nextReset(t))).toBe('2026-10-08');
  });
});

describe('demo shard merchants', () => {
  it('a town and a trading post in sight, with staged stock', () => {
    const d = demoShard();
    expect(d.spots.market).not.toBeNull();
    expect(d.spots.post).not.toBeNull();
    expect(d.hex(d.spots.market!).merchant).toBe('town');
    expect(d.hex(d.spots.post!).merchant).toMatch(/harbour|crossroads/);
    const held = d.merchant(d.spots.market!, 'held')!;
    expect(held).toMatchObject({ reach: true, discount: true });
    expect(held.offers.every((o) => o.price.gold === offerPrice(o, 'gold', true))).toBe(true);
    expect(d.merchant(d.spots.post!, 'far')!.reach).toBe(false);
    expect(d.merchant(d.spots.neutralNext)).toBeNull();
  });
});
