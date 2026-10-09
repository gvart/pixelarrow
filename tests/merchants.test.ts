import { describe, expect, it } from 'vitest';
import { getMap } from '../src/online/world';
import { CONSUMABLE_IDS, CONSUMABLES } from '../src/data/consumables';
import { ITEMS } from '../src/data/items';
import { setPieces } from '../src/data/sets';
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
  REALM_SETS,
  regionOf,
  REGIONS,
  SPECIALTIES,
  tradingPostAt,
  tradingPosts,
} from '../src/online/merchants';
import { demoShard } from '../src/online/demoShard';

const DAY = '2026-10-07';

const W = getMap('test30');

describe('trading posts', () => {
  it("are the map's regions of kind 'post': harbours on the coast, crossroads inland", () => {
    const posts = tradingPosts(W);
    expect(posts.map((p) => p.loc)).toEqual(W.all().filter((r) => r.kind === 'post').map((r) => r.id));
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      expect(p.kind).toBe(W.info(p.loc).coast ? 'harbour' : 'crossroads');
      expect(tradingPostAt(W, p.loc)).toBe(p.kind);
      expect(merchantAt(W, p.loc)).toBe(p.kind);
    }
  });

  it('every town and capital has a merchant; plain land does not', () => {
    let towns = 0;
    for (const r of W.all()) {
      const m = merchantAt(W, r.id);
      if (r.kind === 'town' || r.kind === 'capital') {
        towns++;
        expect(m).toBe('town');
      } else expect(m === null).toBe(r.kind !== 'post');
    }
    expect(towns).toBeGreaterThanOrEqual(3);
    expect(merchantAt(W, 9999)).toBeNull();
  });

  it('realms follow the nearest capital (by routes)', () => {
    const caps = W.capitals();
    caps.forEach((c, i) => expect(regionOf(W, c)).toBe(REGIONS[i % REGIONS.length]));
    for (const c of caps) for (const n of W.neighbours(c)) if (!caps.some((o) => o !== c && W.hops(o, n) <= 1)) expect(regionOf(W, n)).toBe(regionOf(W, c));
  });
});

describe('merchant stock', () => {
  const seed = 42;
  const town = W.all().find((r) => r.kind === 'town')!.id;
  const post = tradingPosts(W)[0];

  it('is a pure function of (seed, region, day): the same all day, rotating day by day', () => {
    const a = merchantStock(W, seed, town, 'town', DAY);
    expect(merchantStock(W, seed, town, 'town', DAY)).toEqual(a);
    const week = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'].map((d) => merchantStock(W, seed, town, 'town', d).map((o) => o.id).join());
    expect(week.some((ids) => ids !== a.map((o) => o.id).join())).toBe(true);
    // ids are unique within a stock
    expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
  });

  it('towns: every consumable, basic gear, two regional uncommons and a rare', () => {
    const s = merchantStock(W, seed, town, 'town', DAY);
    const cons = s.filter((o) => o.kind === 'consumable');
    expect(cons.map((o) => o.ref)).toEqual(CONSUMABLE_IDS);
    for (const o of cons) expect(o).toMatchObject({ gold: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].gold, drachmae: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].drachmae, dailyCap: CONSUMABLES[o.ref as keyof typeof CONSUMABLES].dailyCap });
    const base = s.filter((o) => o.kind === 'item' && o.slot === 'base');
    expect(base).toHaveLength(MERCHANT.baseGear);
    for (const o of base) expect(BASE_GEAR).toContain(o.ref);
    const region = s.filter((o) => o.slot === 'region');
    expect(region).toHaveLength(2);
    for (const o of region) {
      expect(SPECIALTIES[regionOf(W, town)]).toContain(o.ref);
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
    const s = merchantStock(W, seed, post.loc, post.kind, DAY);
    const region = s.filter((o) => o.slot === 'region');
    const realm = regionOf(W, post.loc);
    const rareSet = REALM_SETS[realm].rare;
    const want = new Set([...SPECIALTIES[realm], ...POST_GOODS[post.kind], ...(rareSet ? setPieces(rareSet) : [])]);
    expect(new Set(region.map((o) => o.ref))).toEqual(want);
    for (const o of region) expect(o.rarity).toBe('rare');
    expect(s.find((o) => o.slot === 'rare')!.rarity).toBe('epic');
  });

  it("trading posts: the realm's rare set always, its epic set in the epic slot one day in three, never a named item", () => {
    let setDays = 0;
    const days = 300;
    for (let d = 0; d < days; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const s = merchantStock(W, seed, post.loc, post.kind, day);
      const epic = s.find((o) => o.slot === 'rare')!;
      expect(epic.rarity).toBe('epic');
      expect(ITEMS[epic.ref].named).toBeFalsy();
      if (ITEMS[epic.ref].set) {
        expect(ITEMS[epic.ref].set).toBe(REALM_SETS[regionOf(W, post.loc)].epic);
        setDays++;
      }
    }
    expect(setDays / days).toBeGreaterThan(0.25);
    expect(setDays / days).toBeLessThan(0.42);
    // towns sell no set pieces
    for (const o of merchantStock(W, seed, town, 'town', DAY)) if (o.kind === 'item') expect(ITEMS[o.ref].set).toBeFalsy();
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
    expect(d.region(d.spots.market!).merchant).toBe('town');
    expect(d.region(d.spots.post!).merchant).toMatch(/harbour|crossroads/);
    const held = d.merchant(d.spots.market!, 'held')!;
    expect(held).toMatchObject({ reach: true, discount: true });
    expect(held.offers.every((o) => o.price.gold === offerPrice(o, 'gold', true))).toBe(true);
    expect(d.merchant(d.spots.post!, 'far')!.reach).toBe(false);
    expect(d.merchant(d.spots.neutralNext)).toBeNull();
  });
});
