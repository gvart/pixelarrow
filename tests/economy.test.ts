import { describe, expect, it } from 'vitest';
import {
  capLeft, claimableCount, econState, focusTier, passProgress, rewardIcon,
  tierState, walletOverdrawn, withClaim,
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

  it('the demo economy buys, caps and claims like the server', async () => {
    const d = new DemoEconSource({ stash: [{ uid: 's1', def: 'aspis', rarity: 'epic', cond: 90 }] });
    const before = (await d.wallet()).drachmae;
    await d.buy('morale_wine', { currency: 'drachmae' });
    expect((await d.wallet()).drachmae).toBe(before - 15);
    await d.buy('war_horn', { currency: 'gold' }).catch((e) => expect(e.code).toBe('daily_cap'));
    const r = await d.claimPass(5, 'free');
    expect(r.reward.kind).toBe('consumable');
    await expect(d.claimPass(5, 'premium')).rejects.toMatchObject({ code: 'locked' });
  });
});

describe('wallet warning', () => {
  it('warns only below zero (0 is a normal empty wallet)', () => {
    expect(walletOverdrawn({ drachmae: 0 })).toBe(false);
    expect(walletOverdrawn({ drachmae: 120 })).toBe(false);
    expect(walletOverdrawn({ drachmae: -60 })).toBe(true);
  });
});

describe('pass XP explainer (iteration 2)', () => {
  it('matches the server catalogue', async () => {
    const { PASS } = await import('../server/src/economy/catalog');
    const { PASS_XP } = await import('../src/game/economy');
    expect({ ...PASS.xp, perTier: PASS.xpPerTier }).toEqual({ ...PASS_XP });
  });
});
