import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, carrySettings, type Settings } from '../src/game/save';

describe('New campaign keeps the player\'s settings (iteration 2 bug: only the tutorial survived)', () => {
  it('every preference carries over, the analytics opt-out included', () => {
    const prev: Settings = { ...DEFAULT_SETTINGS, lang: 'ru', sound: false, musicVol: 2, sfxVol: 3, haptics: false, analytics: false, reduceMotion: true, pauseContact: false, seenHints: ['army'], onlineCoach: 4 };
    const next = carrySettings(prev, { ...DEFAULT_SETTINGS });
    expect(next).toEqual(prev);
    expect(next.analytics).toBe(false);
  });

  it('no previous campaign: the defaults', () => {
    expect(carrySettings(undefined, { ...DEFAULT_SETTINGS })).toEqual(DEFAULT_SETTINGS);
  });

  it('a setting added after the old save was written takes its default', () => {
    const old = { ...DEFAULT_SETTINGS } as Partial<Settings>;
    delete old.reduceMotion;
    delete old.dmgNumbers;
    const next = carrySettings(old, { ...DEFAULT_SETTINGS });
    expect(next.dmgNumbers).toBe(DEFAULT_SETTINGS.dmgNumbers);
  });
});
