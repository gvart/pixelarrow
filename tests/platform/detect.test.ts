import { describe, expect, it } from 'vitest';
import { createPlatform, detectPlatformId, readLaunchHints, type LaunchHints } from '../../src/platform/detect';
import { fakeEnv } from './env';

const plain: LaunchHints = { hash: '', search: '', webviewProxy: false, sdkInitData: false, dev: false };

describe('detectPlatformId', () => {
  it('is Telegram when the hash or query carries Telegram launch data', () => {
    expect(detectPlatformId({ ...plain, hash: '#tgWebAppData=query_id%3D1&tgWebAppVersion=8.0' })).toBe('telegram');
    expect(detectPlatformId({ ...plain, search: '?tgWebAppStartParam=clan_AB12' })).toBe('telegram');
  });

  it('is Telegram inside a native client webview, or when the SDK already has initData', () => {
    expect(detectPlatformId({ ...plain, webviewProxy: true })).toBe('telegram');
    expect(detectPlatformId({ ...plain, sdkInitData: true })).toBe('telegram');
  });

  it('is the web on a plain visit to play.pixelarrow.app', () => {
    expect(detectPlatformId(plain)).toBe('web');
    expect(detectPlatformId({ ...plain, search: '?startapp=clan_AB12&lang=ru' })).toBe('web');
  });

  it('takes a build-time VITE_PLATFORM over the hints', () => {
    expect(detectPlatformId({ ...plain, hash: '#tgWebAppData=x', build: 'steam' })).toBe('steam');
    expect(detectPlatformId({ ...plain, build: 'mobile' })).toBe('mobile');
    expect(detectPlatformId({ ...plain, build: 'nonsense' })).toBe('web');
  });

  it('lets ?platform= override the hints in dev builds only', () => {
    expect(detectPlatformId({ ...plain, hash: '#tgWebAppData=x', search: '?platform=web', dev: true })).toBe('web');
    expect(detectPlatformId({ ...plain, search: '?platform=telegram', dev: true })).toBe('telegram');
    expect(detectPlatformId({ ...plain, hash: '#tgWebAppData=x', search: '?platform=web', dev: false })).toBe('telegram');
    expect(detectPlatformId({ ...plain, search: '?platform=steam', dev: true })).toBe('web');
  });
});

describe('readLaunchHints and createPlatform', () => {
  it('reads the hints from the page', () => {
    const f = fakeEnv({ hash: '#tgWebAppVersion=8.0', globals: { TelegramWebviewProxy: {} } });
    expect(readLaunchHints(f.env, { build: undefined, dev: true })).toEqual({ hash: '#tgWebAppVersion=8.0', search: '', webviewProxy: true, sdkInitData: false, build: undefined, dev: true });
  });

  it('builds the adapter for the id; platforms without an adapter yet get the web one', () => {
    const { env } = fakeEnv();
    expect(createPlatform('telegram', env).id).toBe('telegram');
    expect(createPlatform('web', env).id).toBe('web');
    expect(createPlatform('steam', env).id).toBe('web');
  });
});
