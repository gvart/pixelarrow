/**
 * The first sync of a device with an account (V6-ACCT-07, accounts-v6.md §4.5 AU-08, §14 Q2):
 * with no sync metadata for this player, a guest save and the account's cloud save that both have
 * a won battle are never merged or silently overwritten: decideOnLoad asks. When only one side has
 * a won battle, that side is kept. Everything else is the v5 decision, unchanged.
 */
import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import type { SaveData } from '../src/game/save';
import { decideOnLoad, keepsLessProgress, parseSyncMeta, summarize } from '../src/platform/saveSync';

function save(seq: number, extra: Partial<SaveData> = {}): SaveData {
  const d = Campaign.fresh(42).sync();
  return { ...JSON.parse(JSON.stringify(d)), seq, savedAt: 1000 + seq, ...extra };
}

describe('decideOnLoad: the first sync with an account (no metadata for this player)', () => {
  it('asks when both copies have a won battle, preselecting the one with more progress', () => {
    const guest = save(40, { won: 6 });
    const cloud = save(12, { won: 22 });
    const d = decideOnLoad(guest, null, { revision: 9, data: cloud });
    expect(d.action).toBe('ask');
    if (d.action !== 'ask') return;
    expect(d.revision).toBe(9);
    expect(d.cloud.won).toBe(22);
    // more battles won wins the preselection, even with a lower save counter
    expect(d.prefer).toBe('cloud');
    expect(decideOnLoad(save(3, { won: 30 }), null, { revision: 9, data: cloud })).toMatchObject({ action: 'ask', prefer: 'local' });
  });

  it('keeps the side with a won battle when only one has one (never the empty-handed copy)', () => {
    // a guest who never won, logging in to an account with progress: the account's campaign
    expect(decideOnLoad(save(99, { won: 0 }), null, { revision: 4, data: save(5, { won: 3 }) }).action).toBe('adopt');
    // a guest with progress, and an account that never won: the guest's campaign goes up
    expect(decideOnLoad(save(2, { won: 4 }), null, { revision: 4, data: save(50, { won: 0 }) })).toEqual({ action: 'push', revision: 4 });
  });

  it('uploads with no question when the account has no campaign, and adopts when the device has none', () => {
    expect(decideOnLoad(save(7, { won: 6 }), null, { revision: 0, data: null })).toEqual({ action: 'push', revision: 0 });
    expect(decideOnLoad(null, null, { revision: 3, data: save(2, { won: 22 }) }).action).toBe('adopt');
  });

  it('never asks once this device has synced with the account', () => {
    const d = decideOnLoad(save(20, { won: 6 }), { revision: 2, seq: 10 }, { revision: 4, data: save(14, { won: 22 }) });
    expect(d.action).not.toBe('ask');
  });
});

describe('sync metadata belongs to one player', () => {
  it('keeps the player id when there is one', () => {
    expect(parseSyncMeta('{"revision":3,"seq":9,"pid":7}')).toEqual({ revision: 3, seq: 9, pid: 7 });
    expect(parseSyncMeta('{"revision":3,"seq":9}')).toEqual({ revision: 3, seq: 9 });
    expect(parseSyncMeta('{"revision":3,"seq":9,"pid":"7"}')).toEqual({ revision: 3, seq: 9 });
  });
});

describe('summarize: what AU-08 shows of each campaign', () => {
  it('reads day, men, gold and battles won from the save', () => {
    const s = save(1, { won: 6, gold: 344 });
    s.world.time = 11 * 24 + 5;
    expect(summarize(s)).toEqual({ day: 12, men: s.heroes.length, gold: 344, won: 6 });
  });
});

describe('AU-08 confirms only a choice that keeps less progress', () => {
  it('is destructive only when the kept campaign has fewer battles won', () => {
    const local = save(40, { won: 6 });
    const cloud = save(12, { won: 22 });
    expect(keepsLessProgress({ local, cloud }, 'local')).toBe(true);
    expect(keepsLessProgress({ local, cloud }, 'cloud')).toBe(false);
    expect(keepsLessProgress({ local: save(1, { won: 5 }), cloud: save(2, { won: 5 }) }, 'local')).toBe(false);
  });
});
