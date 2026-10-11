/**
 * The Hero sheet's campaign source (HERO-01, screens-campaign.md C-8): the A/B perk
 * tiers it draws, a second pick in a tier refused, and the retrain (abilities.md R7, F3)
 * that pays gold or spends a free retrain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV } from '../src/game/save';

function memKV(): KV {
  const s = new Map<string, string>();
  return { get: async (k) => s.get(k) ?? null, set: async (k, v) => void s.set(k, v), remove: async (k) => void s.delete(k) };
}
vi.mock('../src/platform/storage', () => ({
  gameKV: () => ({ primary: memKV(), mirror: null, cloud: false }),
  localKV: () => memKV(),
  safeLocalStorage: () => null,
}));
vi.mock('../src/platform/cloud', () => ({
  online: { available: false, loadCachedEntitlements: async () => undefined, pullOnLoad: async () => null, abandonPull: () => undefined, queuePush: () => undefined },
}));
vi.mock('../src/platform/telegram', () => ({ setHaptics: () => undefined }));

import { state } from '../src/state';
import { Campaign } from '../src/game/campaign';
import { EV_KEY } from '../src/data/events';
import { PERK_LEVELS, heroPaths, retrainCost } from '../src/data/perks';
import { campaignHeroes, heroTiers } from '../src/scenes/heroSource';

function hero() {
  const h = state.campaign.data.heroes[0];
  h.level = 6;
  h.perks = [];
  return h;
}

beforeEach(() => {
  state.campaign = Campaign.fresh(20261011);
  state.campaign.data.gold = 100;
});

describe('heroTiers: the Perks tab rows', () => {
  it('lists both options of every tier with its level, and which one he took (path B too)', () => {
    const h = hero();
    const paths = heroPaths(h);
    expect(paths.length).toBe(5);
    h.perks = [paths[0][1]];
    const tiers = heroTiers(h);
    expect(tiers.map((t) => t.level)).toEqual(PERK_LEVELS);
    expect(tiers.every((t) => t.opts.length === 2)).toBe(true);
    // a hero who took B sees B taken (heroTree showed only path A: B read as locked)
    expect(tiers[0].taken).toBe(paths[0][1]);
    expect(tiers[1].taken).toBeNull();
  });

  it('a classless (old save) hero keeps one perk per tier of his legacy tree', () => {
    const h = hero();
    h.cls = undefined;
    h.perks = ['shield_drill'];
    const tiers = heroTiers(h);
    expect(tiers.length).toBe(5);
    expect(tiers.every((t) => t.opts.length === 1)).toBe(true);
    expect(tiers[0].taken).toBe('shield_drill');
  });
});

describe('perk picks through the sheet', () => {
  it('takes either option of an open tier; a second pick in a chosen tier is refused', () => {
    const h = hero();
    const [a, b] = heroPaths(h)[0];
    expect(campaignHeroes.takePerk(h.id, b)).toBe(true);
    expect(campaignHeroes.takePerk(h.id, a)).toBe(false);
    expect(h.perks).toEqual([b]);
  });
});

describe('retrain (R7, F3)', () => {
  it('a paid retrain charges RETRAIN_COST x tier and switches only that tier', () => {
    const h = hero();
    const p = heroPaths(h);
    h.perks = [p[0][0], p[1][1]];
    const r = campaignHeroes.retrain!;
    expect(r.cost(1)).toBe(retrainCost(2));
    expect(r.run(h.id, 1, true)).toBe(true);
    expect(h.perks).toEqual([p[0][0], p[1][0]]);
    expect(state.campaign.data.gold).toBe(100 - retrainCost(2));
  });

  it('is refused without the gold, and changes nothing', () => {
    const h = hero();
    const p = heroPaths(h);
    h.perks = [p[0][0], p[1][0], p[2][0]];
    state.campaign.data.gold = retrainCost(3) - 1;
    expect(campaignHeroes.retrain!.run(h.id, 2, true)).toBe(false);
    expect(h.perks).toEqual([p[0][0], p[1][0], p[2][0]]);
    expect(state.campaign.data.gold).toBe(retrainCost(3) - 1);
  });

  it('a free retrain is spent instead of gold', () => {
    const h = hero();
    const p = heroPaths(h);
    h.perks = [p[0][1]];
    state.campaign.world.setFlag(EV_KEY.retrain, 1);
    const r = campaignHeroes.retrain!;
    expect(r.free()).toBe(1);
    expect(r.run(h.id, 0, false)).toBe(true);
    expect(h.perks).toEqual([p[0][0]]);
    expect(r.free()).toBe(0);
    expect(state.campaign.data.gold).toBe(100);
  });

  it('a tier he has not chosen cannot be retrained', () => {
    const h = hero();
    expect(campaignHeroes.retrain!.run(h.id, 0, true)).toBe(false);
    expect(state.campaign.data.gold).toBe(100);
  });
});
