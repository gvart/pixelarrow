import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, carrySettings, type Settings } from '../src/game/save';
import { LANGS, setLang, t } from '../src/i18n';

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

describe('the accessibility settings of save v6 carry over too (DLG-01 AC2)', () => {
  it('reduceShake, reduceFlash, leftHand and battleSpeed survive a New campaign', () => {
    const prev: Settings = { ...DEFAULT_SETTINGS, reduceMotion: false, reduceShake: true, reduceFlash: true, leftHand: true, battleSpeed: 0.5 };
    const next = carrySettings(prev, { ...DEFAULT_SETTINGS });
    expect(next).toEqual(prev);
    expect(next.reduceMotion).toBe(false);
  });

  it('a save that never touched them leaves them unset (reduce motion keeps following the OS)', () => {
    const next = carrySettings({ ...DEFAULT_SETTINGS }, { ...DEFAULT_SETTINGS });
    for (const k of ['reduceMotion', 'reduceShake', 'reduceFlash', 'leftHand', 'battleSpeed'] as const) expect(next[k]).toBeUndefined();
  });
});

vi.mock('phaser', () => {
  class C {}
  const go = { Container: C, Image: C, Sprite: C, Text: C, BitmapText: C, Graphics: C, Rectangle: C, Zone: C, TileSprite: C, RenderTexture: C };
  return { default: { GameObjects: go, Scene: C, Geom: { Rectangle: C }, Events: { EventEmitter: C } } };
});
const { ROWS, accountRow } = await import('../src/ui/settings');

describe('the Settings sheet keeps every element of the element map (M-15, ELEMENT_MAP E005, E019-E034)', () => {
  const has = (pred: (r: (typeof ROWS)[number]) => boolean) => ROWS.some(pred);

  it('audio, language and battle rows', () => {
    for (const key of ['sound', 'dmgNumbers', 'pauseContact', 'pauseFlank', 'pauseRout', 'pauseDeath', 'haptics', 'analytics'])
      expect(has((r) => r.kind === 'toggle' && r.key === key), key).toBe(true);
    for (const key of ['musicVol', 'sfxVol']) expect(has((r) => r.kind === 'volume' && r.key === key), key).toBe(true);
    expect(has((r) => r.kind === 'lang')).toBe(true);
  });

  it('accessibility: Reduce motion (follows the OS until set)', () => {
    expect(has((r) => r.kind === 'motion')).toBe(true);
  });

  it('account and help: cloud save state, tutorial, Notifications, About, New campaign', () => {
    expect(has((r) => r.kind === 'sync')).toBe(true);
    expect(has((r) => r.kind === 'tutorial')).toBe(true);
    expect(has((r) => r.kind === 'open' && r.what === 'notify')).toBe(true);
    expect(has((r) => r.kind === 'open' && r.what === 'about')).toBe(true);
    expect(has((r) => r.kind === 'newCampaign')).toBe(true);
  });

  it('Account is the first row of the Account section, and the rest stay where they were (accounts-v6.md §8.1)', () => {
    const at = ROWS.findIndex((r) => r.kind === 'section' && r.label === 'settings.sec.account');
    expect(ROWS[at + 1]).toEqual({ kind: 'account', label: 'account.row' });
    expect(ROWS.slice(at + 2).map((r) => r.kind)).toEqual(['sync', 'tutorial', 'open', 'open', 'toggle', 'newCampaign']);
  });

  it('the Account row by session: the name and Open; a guest Log in; a pending sign-up; offline', () => {
    expect(accountRow({ signedIn: true, name: 'Swift Fox 12', forms: true, pending: false })).toEqual({ sub: 'Swift Fox 12', action: 'open' });
    expect(accountRow({ signedIn: true, name: 'Ana', forms: false, pending: false })).toEqual({ sub: 'Ana', action: 'open' });
    expect(accountRow({ signedIn: false, name: null, forms: true, pending: false })).toEqual({ sub: t('account.row.guest'), action: 'login' });
    expect(accountRow({ signedIn: false, name: null, forms: true, pending: true })).toEqual({ sub: t('account.row.pending'), action: 'open' });
    // Telegram before its silent sign-in answered: no form to offer
    expect(accountRow({ signedIn: false, name: null, forms: false, pending: false })).toEqual({ sub: t('settings.sync.offline'), action: 'open' });
  });

  it('every label exists in English and Russian', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const r of ROWS) {
        if (r.kind === 'lang') continue;
        expect(t(r.label), `${lang} ${r.label}`).not.toBe(r.label);
        if (r.kind === 'newCampaign') expect(t(r.sub)).not.toBe(r.sub);
      }
      for (const st of ['local', 'syncing', 'synced', 'offline'] as const) expect(t(`settings.sync.${st}`)).not.toBe(`settings.sync.${st}`);
    }
    setLang('en');
  });
});
