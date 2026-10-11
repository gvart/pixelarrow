import { describe, expect, it } from 'vitest';
import { FEINT_ORB_AFTER, KIND_BUDGET, battleUnlocks, fifthKey, raiseState, visibleKinds, type ControlKind } from '../src/ui/input/attention';
import { FACING_DIRS, mirrorX, nextZoom, pipAt } from '../src/ui/input/singleTap';

describe('attention budget: progressive unlock (controls.md R10b)', () => {
  const camp = (fought: number, campPitched = false) => battleUnlocks({ kind: 'campaign', fought, campPitched, realtimeLocked: false });

  it('hides Feint and Orb in the campaign until the 3rd battle is behind the player', () => {
    for (let n = 0; n < FEINT_ORB_AFTER; n++) expect(camp(n)).toMatchObject({ feint: false, orb: false });
    expect(camp(FEINT_ORB_AFTER)).toMatchObject({ feint: true, orb: true });
    expect(camp(40)).toMatchObject({ feint: true, orb: true });
  });

  it('shows Works only once a camp has been pitched', () => {
    expect(camp(10, false).works).toBe(false);
    expect(camp(0, true).works).toBe(true);
  });

  it('shows everything in duels and war (online), whatever the campaign record', () => {
    expect(battleUnlocks({ kind: 'online', fought: 0, campPitched: false, realtimeLocked: true })).toMatchObject({ feint: true, orb: true, works: true });
  });

  it('keeps Feint and Orb out of the scripted tutorial (TUT-02: they stay gated)', () => {
    expect(battleUnlocks({ kind: 'tutorial', fought: 99, campPitched: true, realtimeLocked: false })).toMatchObject({ feint: false, orb: false, then: false });
  });

  it('live online (realtimeLocked) has no Then chip and no Advance-to-range chip', () => {
    const u = battleUnlocks({ kind: 'online', fought: 0, campPitched: false, realtimeLocked: true });
    expect(u.then).toBe(false);
    expect(u.toRange).toBe(false);
    expect(camp(0)).toMatchObject({ then: true, toRange: true });
  });
});

describe('attention budget: at most 4 kinds of interactive control at once', () => {
  const all: ControlKind[] = ['cards', 'orders', 'medallions', 'chips', 'pips'];

  it('never shows more than KIND_BUDGET kinds, for every combination', () => {
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const want = all.filter((_, i) => mask & (1 << i));
      const shown = visibleKinds(want);
      expect(shown.length).toBeLessThanOrEqual(KIND_BUDGET);
      // only wanted kinds, and all of them when they fit
      expect(shown.every((k) => want.includes(k))).toBe(true);
      if (want.length <= KIND_BUDGET) expect(shown.sort()).toEqual([...want].sort());
    }
  });

  it('the facing pips push out the timed chips first, never the order bar or the cards', () => {
    const shown = visibleKinds(all);
    expect(shown).toContain('pips');
    expect(shown).toContain('orders');
    expect(shown).toContain('cards');
    expect(shown).not.toContain('chips');
  });
});

describe('the 5th order key: Withdraw or Feint (formations-orders.md R3)', () => {
  it('is Withdraw for a group that may not feint, or before Feint unlocks', () => {
    expect(fifthKey({ unlocked: true, eligible: false, ready: false, cdLeftS: 0, arming: false }).key).toBe('fallback');
    expect(fifthKey({ unlocked: false, eligible: true, ready: true, cdLeftS: 0, arming: false }).key).toBe('fallback');
  });

  it('is Feint for an eligible group whose feint is ready', () => {
    expect(fifthKey({ unlocked: true, eligible: true, ready: true, cdLeftS: 0, arming: false })).toEqual({ key: 'feint', cdLeftS: 0 });
  });

  it('falls back to Withdraw while the feint cools down, with the seconds left (no group loses Withdraw)', () => {
    expect(fifthKey({ unlocked: true, eligible: true, ready: false, cdLeftS: 12.2, arming: false })).toEqual({ key: 'fallback', cdLeftS: 13 });
  });

  it('is Withdraw while Then… is arming (a feint cannot be queued on arrival)', () => {
    expect(fifthKey({ unlocked: true, eligible: true, ready: true, cdLeftS: 0, arming: true }).key).toBe('fallback');
  });
});

describe('Raise the standard: the control for the army bearer (abilities.md R5.3)', () => {
  const base = { battle: true, hadBearer: true, bearer: { state: 'ready', stun: 0 }, raised: false, broken: false } as const;

  it('is hidden in an army that never had a bearer, and in deployment', () => {
    expect(raiseState({ ...base, hadBearer: false, bearer: null }).show).toBe(false);
    expect(raiseState({ ...base, battle: false }).show).toBe(false);
  });

  it('is usable once per battle', () => {
    expect(raiseState(base)).toEqual({ show: true, why: null, note: null });
    expect(raiseState({ ...base, raised: true })).toMatchObject({ show: true, why: 'attn.std.why.raised' });
  });

  it('says why when the bearer cannot raise it', () => {
    expect(raiseState({ ...base, bearer: null }).why).toBe('attn.std.why.lost');
    expect(raiseState({ ...base, bearer: { state: 'routing', stun: 0 } }).why).toBe('attn.std.why.routing');
    expect(raiseState({ ...base, bearer: { state: 'ready', stun: 3 } }).why).toBe('attn.std.why.stunned');
  });

  it('under army break it still restores morale but turns no routers back (a note, not a block)', () => {
    expect(raiseState({ ...base, broken: true })).toEqual({ show: true, why: null, note: 'attn.std.note.broken' });
  });
});

describe('single-tap alternatives (A11Y-14) and left-hand mode (A11Y-16)', () => {
  it('the zoom key cycles 1x, 2x, 3x and back', () => {
    expect([1, 2, 3].map(nextZoom)).toEqual([2, 3, 1]);
    expect(nextZoom(2.4)).toBe(3);
  });

  it('offers eight unit facing directions', () => {
    expect(FACING_DIRS).toHaveLength(8);
    for (const d of FACING_DIRS) expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });

  it('a tap picks the nearest pip within reach, else none', () => {
    const pips = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];
    expect(pipAt(pips, { x: 44, y: 3 }, 22)).toBe(1);
    expect(pipAt(pips, { x: 25, y: 40 }, 22)).toBe(-1);
  });

  it('mirrors a right-edge control to the left edge', () => {
    expect(mirrorX(150, 40, 195, false)).toBe(150);
    expect(mirrorX(150, 40, 195, true)).toBe(5);
  });
});
