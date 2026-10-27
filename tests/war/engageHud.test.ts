/**
 * W-62 HUD polish: the world event toast stays short (its rule is on the card), and the open alliance chat's log
 * shrinks on a short window so the panel stays under the quest tracker.
 */
import { describe, expect, it } from 'vitest';
import { eventNote } from '../../src/war/view/hud/worldEvents';
import { chatLogFit, LOG_H, LOG_MIN } from '../../src/war/view/hud/chatRegion';

describe('W-62 world event toast', () => {
  const now = 1_000_000, e = { id: 1, kind: 'soulStorm' as const, region: 'dodona', startAt: now - 1000, endAt: now + 25 * 60_000 };
  it('names the event, where and the time left, without the rule', () => {
    expect(eventNote(e, 'here', now)).toBe('Soul storm here · 25:00');
    expect(eventNote(e, 'Lake Stymphalia', now)).toBe('Soul storm in Lake Stymphalia · 25:00');
  });
});

describe('W-62 chat log fit', () => {
  it('keeps the full log when the panel clears the cards above', () => {
    expect(chatLogFit(400, 1, LOG_H, 200)).toBe(LOG_H);
  });
  it('gives up the overlap (in panel px) when the panel runs over them', () => {
    // the panel's top at 250 screen px, the tracker's bottom at 290, zoom 1.25: (290 + 6 - 250) / 1.25 = 36.8
    expect(chatLogFit(250, 1.25, LOG_H, 290)).toBe(Math.round(LOG_H - 36.8));
  });
  it('grows back once there is room, and never below the minimum', () => {
    expect(chatLogFit(400, 1, 100, 300)).toBe(LOG_H);
    expect(chatLogFit(100, 1, LOG_H, 600)).toBe(LOG_MIN);
  });
});
