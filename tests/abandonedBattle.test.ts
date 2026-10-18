/**
 * Killing the app mid-battle must not escape permadeath (V5-011, audit C1).
 * A campaign battle is recorded in the save when it starts; the next boot
 * fights it out with the orders given before it began (docs/GAMEPLAY.md
 * "Abandoned battles"). Storage and the cloud are in-memory fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KV, SaveData } from '../src/game/save';

let store = new Map<string, string>();
function memKV(s: Map<string, string>): KV {
  return {
    get: async (k) => s.get(k) ?? null,
    set: async (k, v) => void s.set(k, v),
    remove: async (k) => void s.delete(k),
  };
}
vi.mock('../src/platform/cloud', () => ({
  online: {
    available: false,
    loadCachedEntitlements: async () => undefined,
    pullOnLoad: async () => null,
    abandonPull: () => undefined,
    queuePush: () => undefined,
  },
}));
vi.mock('../src/platform/haptics', async (orig) => ({ ...(await orig<typeof import('../src/platform/haptics')>()), setHaptics: () => undefined }));

import { state, type PendingBattle } from '../src/state';
import { Campaign } from '../src/game/campaign';
import { generateEnemyArmy } from '../src/game/enemy';
import { campaignSetup, markBattle } from '../src/game/campaignBattle';
import { migrate, readSave, serialize, writeSave } from '../src/game/save';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { setPlatformForTests } from '../src/platform';
import { FakePlatform } from './fakes/platform';

const fake = new FakePlatform();
fake.saveStore = () => memKV(store);
setPlatformForTests(fake);

/** A campaign that has just pressed Fight against a much stronger skirmish army. */
async function startedBattle(seed: number): Promise<{ camp: Campaign; pending: PendingBattle }> {
  const camp = Campaign.fresh(seed);
  const heroes = camp.fitHeroes();
  // 50 wins in: the strongest ramp, so an idle army loses men
  const enemy = generateEnemyArmy(new Rng(seed ^ 0xa5a5a5a5), camp.data, heroes, 50);
  const pending: PendingBattle = { enemy, seed };
  const sim = new Battle(campaignSetup(pending, heroes));
  // a deployment order, as the player gives before Fight
  sim.issue(0, { kind: 'shieldwall', group: 0, on: true });
  markBattle(camp, pending, heroes, sim.orderLog);
  await writeSave(memKV(store), camp.sync());
  return { camp, pending };
}

beforeEach(() => {
  store = new Map();
  state.notice = null;
  state.last = null;
});

describe('a campaign battle in progress is saved', () => {
  it('the marker survives a save round trip', async () => {
    const { camp } = await startedBattle(31);
    const back = migrate(JSON.parse(serialize(camp.data)))!;
    expect(back.battle?.pending.seed).toBe(31);
    expect(back.battle?.heroIds).toEqual(camp.fitHeroes().map((h) => h.id));
  });

  it('a malformed marker is dropped, not the save', () => {
    const d = { ...Campaign.fresh(2).sync(), battle: { pending: 'nope' } } as unknown as SaveData;
    const back = migrate(JSON.parse(serialize(d)))!;
    expect(back).not.toBeNull();
    expect(back.battle).toBeUndefined();
  });
});

describe('the next boot fights out an abandoned battle', () => {
  it('applies the battle: the fallen are gone for good, it counts as fought, and the player is told', async () => {
    const { camp } = await startedBattle(31);
    const before = camp.data.heroes.map((h) => h.id);
    const fought = camp.data.fought;
    await state.load();
    const c = state.campaign.data;
    expect(c.battle).toBeUndefined();
    expect(c.fought).toBe(fought + 1);
    expect(state.last).not.toBeNull();
    expect(state.notice).toBe('battle.abandoned');
    const fallen = state.last!.fallen.map((h) => h.id);
    expect(fallen.length).toBeGreaterThan(0);
    for (const id of fallen) expect(c.heroes.some((h) => h.id === id)).toBe(false);
    expect(c.heroes.length).toBe(before.length - fallen.length);
    // and it is saved: a second kill-and-reopen does not fight it again
    const saved = (await readSave(memKV(store)))!;
    expect(saved.battle).toBeUndefined();
    expect(saved.fought).toBe(fought + 1);
  });

  it('the result is the battle played out with the deployment orders and nothing after', async () => {
    const { camp, pending } = await startedBattle(31);
    const heroes = camp.fitHeroes();
    const sim = new Battle(campaignSetup(pending, heroes));
    sim.issue(0, { kind: 'shieldwall', group: 0, on: true });
    sim.startBattle();
    for (let i = 0; i < 20 * 400 && sim.phase !== 'ended'; i++) sim.step();
    await state.load();
    expect(state.last!.outcome.victory).toBe(sim.result().winner === 0);
    expect(state.last!.ticks).toBe(sim.tick);
  });

  it('a save without a battle in progress loads untouched', async () => {
    const camp = Campaign.fresh(8);
    await writeSave(memKV(store), camp.sync());
    await state.load();
    expect(state.last).toBeNull();
    expect(state.notice).toBeNull();
    expect(state.campaign.data.fought).toBe(0);
  });
});
