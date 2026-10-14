/**
 * ADR-0006 M5: the safe area, the app's active state and the client's language
 * come from `platform` (a FakePlatform here), not from the Telegram module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platform, setPlatformForTests } from '../src/platform';
import { FakePlatform } from './fakes/platform';

const before = platform;
let fake: FakePlatform;
beforeEach(() => {
  fake = new FakePlatform();
  setPlatformForTests(fake);
});
afterEach(() => {
  setPlatformForTests(before);
  vi.unstubAllGlobals();
});

/** Just enough of window and document for installAudio in node. */
function stubPage(visibility: 'visible' | 'hidden' = 'visible') {
  const target = () => ({ addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal('window', target());
  vi.stubGlobal('document', { ...target(), visibilityState: visibility });
  vi.stubGlobal('navigator', {});
}

describe('audio follows platform.onActive', () => {
  it('pauses when the app goes to the background and resumes when it comes back', async () => {
    stubPage();
    const { audio, installAudio } = await import('../src/audio');
    const hidden = vi.spyOn(audio, 'setHidden');
    const game = { scene: { isBooted: true, scenes: [] }, events: { once: () => undefined } };
    installAudio(game as never, () => undefined);
    fake.setActive(false);
    expect(hidden).toHaveBeenLastCalledWith(true);
    fake.setActive(true);
    expect(hidden).toHaveBeenLastCalledWith(false);
  });
});

describe('the safe area follows platform.safeArea', () => {
  it('writes the insets as CSS variables when they change, and only then', async () => {
    const vars = new Map<string, string>();
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => void vars.set(k, v) } } });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => (cb(), 0));
    const { trackSafeArea } = await import('../src/platform/safeArea');
    const relayout = vi.fn();
    const stop = trackSafeArea(relayout);
    fake.setInsets({ top: 59, bottom: 34, left: 0, right: 0 }, { top: 46, bottom: 0, left: 0, right: 0 });
    expect(vars.get('--pa-safe-top')).toBe('59px');
    expect(vars.get('--pa-safe-bottom')).toBe('34px');
    expect(vars.get('--pa-content-top')).toBe('46px');
    expect(relayout).toHaveBeenCalledTimes(1);
    // Telegram repeats the same insets on every viewportChanged: no re-layout
    fake.setInsets({ top: 59, bottom: 34, left: 0, right: 0 }, { top: 46, bottom: 0, left: 0, right: 0 });
    expect(relayout).toHaveBeenCalledTimes(1);
    stop();
    fake.setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(relayout).toHaveBeenCalledTimes(1);
  });
});

describe('the language hint comes from platform.client()', () => {
  it('a Russian client picks Russian on auto', async () => {
    vi.stubGlobal('navigator', { languages: ['en-US'] });
    vi.stubGlobal('location', { search: '' });
    fake.client = () => ({ platform: 'ios', language: 'ru' });
    const { refreshLang } = await import('../src/ui/lang');
    const { lang, setLang } = await import('../src/i18n');
    setLang('en');
    refreshLang();
    expect(lang()).toBe('ru');
    fake.client = () => ({ platform: 'web' });
    refreshLang();
    expect(lang()).toBe('en');
  });
});
