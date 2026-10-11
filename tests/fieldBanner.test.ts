/**
 * RD-02: field banners and auto-pauses (design/gdd/battle-readability.md R4).
 * A banner expires after 6 s or as soon as its condition turns false; auto-pauses
 * within 5 s of battle time merge into one pause and one banner listing the reasons.
 * Damage numbers show only on a charge impact and a kill.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SimEvent } from '../src/sim/types';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { AUTOPAUSE_MERGE_S, AutoPauseMerge, BANNER_TTL_S, BannerLife, damageNumberHits } = await import('../src/ui/battleHud');

describe('BannerLife (R4: 6 s or a false condition)', () => {
  it('expires after BANNER_TTL_S', () => {
    const b = new BannerLife(1000);
    expect(BANNER_TTL_S).toBe(6);
    expect(b.expired(1000 + 5999)).toBe(false);
    expect(b.expired(1000 + 6000)).toBe(true);
  });

  it('a shorter time to live is kept', () => {
    expect(new BannerLife(0, 2500).expired(2500)).toBe(true);
  });

  it('expires early once its condition is false', () => {
    let routed = true;
    const b = new BannerLife(0, undefined, () => routed);
    expect(b.expired(100)).toBe(false);
    routed = false;
    expect(b.expired(200)).toBe(true);
  });
});

describe('AutoPauseMerge (auto-pauses within 5 s merge)', () => {
  it('the first reason pauses; another within 5 s merges into the same banner', () => {
    const m = new AutoPauseMerge();
    expect(m.offer(10, { text: 'First contact!' })).toBe(true);
    expect(m.offer(10, { text: 'II flanked!' })).toBe(false);
    expect(m.offer(10 + AUTOPAUSE_MERGE_S, { text: 'Lysias has fallen' })).toBe(false);
    expect(m.text()).toBe('First contact!\nII flanked!\nLysias has fallen');
  });

  it('after the window a new reason pauses again with a fresh banner', () => {
    const m = new AutoPauseMerge();
    m.offer(10, { text: 'First contact!' });
    expect(m.offer(15.1, { text: 'II flanked!' })).toBe(true);
    expect(m.text()).toBe('II flanked!');
  });

  it('a repeated reason is listed once, and only the 3 newest show', () => {
    const m = new AutoPauseMerge();
    m.offer(0, { text: 'a' });
    m.offer(1, { text: 'a' });
    m.offer(1, { text: 'b' });
    m.offer(2, { text: 'c' });
    m.offer(3, { text: 'd' });
    expect(m.text()).toBe('b\nc\nd');
  });

  it('the merged banner lives while any reason is still true', () => {
    const m = new AutoPauseMerge();
    let a = true;
    let b = true;
    m.offer(0, { text: 'a', live: () => a });
    m.offer(1, { text: 'b', live: () => b });
    expect(m.live()).toBe(true);
    a = false;
    expect(m.live()).toBe(true);
    b = false;
    expect(m.live()).toBe(false);
    // a reason with no condition lives for the banner's 6 s
    m.offer(2, { text: 'c' });
    expect(m.live()).toBe(true);
  });
});

describe('damageNumberHits (R4: only on a charge impact and a kill)', () => {
  const hit = (unit: number, by: number, dmg: number): SimEvent => ({ type: 'hit', tick: 1, unit, by, dmg, dir: 'front', ranged: false });
  it('routine hits get no number', () => {
    expect(damageNumberHits([hit(1, 2, 5), hit(3, 4, 6)])).toEqual([]);
  });

  it('the hit of a charge impact and the killing blow get one', () => {
    const ev: SimEvent[] = [
      { type: 'impact', tick: 1, unit: 1, by: 2 },
      hit(1, 2, 12),
      hit(3, 4, 6),
      hit(5, 6, 9),
      { type: 'death', tick: 1, unit: 5, by: 6 },
    ];
    expect(damageNumberHits(ev)).toEqual([ev[1], ev[3]]);
  });

  it('an impact by another man does not number this hit', () => {
    expect(damageNumberHits([{ type: 'impact', tick: 1, unit: 1, by: 9 }, hit(1, 2, 12)])).toEqual([]);
  });
});
