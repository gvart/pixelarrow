import { afterEach, describe, expect, it } from 'vitest';
import { platform, setPlatformForTests } from '../../src/platform/index';
import { haptic, hapticNotify, hapticSelect, setHaptics } from '../../src/platform/haptics';
import { hasNativeBack, setBackButton, startParam } from '../../src/platform/telegram';
import { FakePlatform } from '../fakes/platform';
import { platformContract } from './contract';

platformContract('FakePlatform', async () => {
  const p = new FakePlatform();
  return { p, pressBack: () => p.pressBack(), changeInsets: () => p.setInsets({ top: 1, bottom: 0, left: 0, right: 0 }) };
});

describe('the platform facade', () => {
  const before = platform;
  afterEach(() => setPlatformForTests(before));

  it('starts as a Telegram adapter that was never launched: every call is a no-op', () => {
    expect(platform.id).toBe('telegram');
    expect(platform.back.native).toBe(false);
    expect(platform.auth.silentProof()).toBeNull();
    expect(() => haptic('heavy')).not.toThrow();
  });

  it('routes the haptic helpers to platform.haptics, behind the Settings toggle', () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    haptic();
    hapticNotify('success');
    hapticSelect();
    setHaptics(false);
    haptic('heavy');
    expect(fake.cues).toEqual(['impact:light', 'notify:success', 'select']);
  });

  it('keeps the old telegram.ts names working through the platform (the M1 shim)', async () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    fake.back.native = true;
    expect(hasNativeBack()).toBe(true);
    const cb = () => {};
    setBackButton(cb);
    expect(fake.backCb).toBe(cb);
    fake.launch = 'duel';
    expect(startParam()).toBe('duel');
  });
});
