import { describe, expect, it } from 'vitest';
import {
  canAfford, capLeft, claimableCount, clampPrice, econState, focusTier, listingAction, marketFee, passProgress, priceBounds, priceStep, rewardIcon, sellerGets,
  suggestPrice, tierState, timeLeft, withClaim,
} from '../src/game/economy';
import { ApiError, type SeasonPassInfo } from '../src/platform/api';
import { DemoEconSource, demoCatalog } from '../src/ui/econ/demo';

const pass = (over: Partial<SeasonPassInfo> = {}): SeasonPassInfo => ({
  season: { id: 1, endsAt: 0 },
  xp: 350,
  tier: 3,
  premium: false,
  premiumDrachmae: 500,
  xpPerTier: 100,
  claimed: [{ tier: 1, track: 'free' }],
  tiers: demoCatalog().pass.tiers,
  ...over,
});

describe('season pass claim states', () => {
  it('claimed, claimable, locked and premium-locked', () => {
    const p = pass();
    expect(tierState(p, 1, 'free')).toBe('claimed');
    expect(tierState(p, 2, 'free')).toBe('claimable');
    expect(tierState(p, 3, 'free')).toBe('claimable');
    expect(tierState(p, 4, 'free')).toBe('locked');
    expect(tierState(p, 2, 'premium')).toBe('premium');
    expect(tierState(p, 4, 'premium')).toBe('locked');
    const prem = pass({ premium: true });
    expect(tierState(prem, 2, 'premium')).toBe('claimable');
    expect(tierState(prem, 1, 'premium')).toBe('claimable');
  });

  it('counts claimable rewards and focuses the first one', () => {
    expect(claimableCount(pass())).toBe(2);
    expect(claimableCount(pass({ premium: true }))).toBe(5);
    expect(focusTier(pass())).toBe(2);
    expect(focusTier(pass({ claimed: [1, 2, 3].map((tier) => ({ tier, track: 'free' as const })) }))).toBe(4);
  });

  it('a claim applies locally once', () => {
    const p = withClaim(pass(), 2, 'free');
    expect(tierState(p, 2, 'free')).toBe('claimed');
    expect(withClaim(p, 2, 'free').claimed.length).toBe(p.claimed.length);
  });

  it('XP progress inside the tier', () => {
    expect(passProgress(pass())).toMatchObject({ tier: 3, into: 50, need: 100, frac: 0.5, maxed: false });
    expect(passProgress(pass({ tier: 30, xp: 3100 })).maxed).toBe(true);
  });

  it('reward icons', () => {
    expect(rewardIcon({ kind: 'gold', amount: 45 })).toEqual({ kind: 'resource', id: 'gold', qty: 45 });
    expect(rewardIcon({ kind: 'consumable', id: 'war_horn', qty: 1 }).kind).toBe('consumable');
  });
});

describe('market fee math', () => {
  it('10% rounded up is burned; the seller gets the rest', () => {
    expect(marketFee(100)).toBe(10);
    expect(marketFee(101)).toBe(11);
    expect(marketFee(2)).toBe(1);
    expect(sellerGets(100)).toBe(90);
    expect(sellerGets(2)).toBe(1);
    expect(sellerGets(55)).toBe(49);
    for (let p = 2; p < 500; p += 7) expect(marketFee(p) + sellerGets(p)).toBe(p);
  });

  it('price bounds per rarity and currency, clamping and steps', () => {
    const cat = demoCatalog();
    expect(priceBounds(cat, 'gold', 'rare')).toEqual([20, 20000]);
    expect(priceBounds(cat, 'drachmae', 'heroic')).toEqual([10, 5000]);
    expect(priceBounds(cat, 'gold', 'nonsense')).toEqual([2, 100000]);
    expect(priceBounds(null, 'drachmae', 'rare')).toEqual([2, 10000]);
    expect(clampPrice(1, [2, 10])).toBe(2);
    expect(clampPrice(11.6, [2, 10])).toBe(10);
    expect([5, 50, 150, 700, 5000].map(priceStep)).toEqual([1, 5, 10, 50, 100]);
    expect(suggestPrice(96, 'gold', [20, 20000])).toBe(96);
    expect(suggestPrice(96, 'drachmae', [5, 2000])).toBe(12);
  });

  it('listing actions, affordability and time left', () => {
    const now = 1_000_000;
    expect(listingAction({ status: 'open', mine: false, expiresAt: now + 1 }, now)).toBe('buy');
    expect(listingAction({ status: 'open', mine: true, expiresAt: now + 1 }, now)).toBe('cancel');
    expect(listingAction({ status: 'sold', mine: false, expiresAt: now + 1 }, now)).toBe('none');
    expect(listingAction({ status: 'open', mine: false, expiresAt: now }, now)).toBe('none');
    expect(canAfford({ currency: 'gold', price: 50 }, { gold: 50, drachmae: 0 })).toBe(true);
    expect(canAfford({ currency: 'drachmae', price: 5 }, { gold: 500, drachmae: 4 })).toBe(false);
    expect(canAfford({ currency: 'gold', price: 5 }, { gold: null, drachmae: 40 })).toBe(false);
    expect(timeLeft(now + 45 * 60_000, now).text).toBe('45m');
    expect(timeLeft(now + 135 * 60_000, now).text).toBe('2h 15m');
    expect(timeLeft(now + 50 * 3_600_000, now).text).toBe('2d 2h');
    expect(timeLeft(now - 1, now).ms).toBe(0);
  });
});

describe('shop and availability', () => {
  it('daily caps left', () => {
    expect(capLeft({ war_horn: { cap: 2, bought: 2 } }, 'war_horn')).toBe(0);
    expect(capLeft({ war_horn: { cap: 3, bought: 1 } }, 'war_horn')).toBe(2);
    expect(capLeft(null, 'war_horn', 2)).toBe(2);
    expect(capLeft(undefined, 'war_horn')).toBeNull();
  });

  it('API failures become outside / offline / closed / error states', () => {
    expect(econState(new ApiError(503, 'not_configured', 'x'))).toBe('closed');
    expect(econState(new ApiError(0, 'network', 'x'))).toBe('offline');
    expect(econState(new ApiError(502, 'x', 'x'))).toBe('offline');
    expect(econState(new ApiError(409, 'conflict', 'x'))).toBe('error');
    expect(econState(new ApiError(0, 'network', 'x'), false)).toBe('outside');
  });

  it('the demo economy buys, caps, claims and lists like the server', async () => {
    const d = new DemoEconSource({ stash: [{ uid: 's1', def: 'aspis', rarity: 'epic', cond: 90 }] });
    const before = (await d.wallet()).drachmae;
    await d.buy('morale_wine', { currency: 'drachmae' });
    expect((await d.wallet()).drachmae).toBe(before - 15);
    await d.buy('war_horn', { currency: 'gold' }).catch((e) => expect(e.code).toBe('daily_cap'));
    const r = await d.claimPass(5, 'free');
    expect(r.reward.kind).toBe('consumable');
    await expect(d.claimPass(5, 'premium')).rejects.toMatchObject({ code: 'locked' });
    const l = await d.marketList({ town: 7, kind: 'item', ref: 's1', currency: 'gold', price: 300 });
    expect(l.listing.fee).toBe(30);
    expect((await d.profile())!.stash.length).toBe(0);
    const page = await d.marketSearch({ sort: 'price_asc', limit: 3 });
    expect(page.listings.length).toBe(3);
    expect(page.listings[0].price).toBeLessThanOrEqual(page.listings[1].price);
    expect(page.next).toBe(3);
  });
});
