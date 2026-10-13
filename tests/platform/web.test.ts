import { describe, expect, it, vi } from 'vitest';
import { createWebPlatform } from '../../src/platform/web/index';
import { platformContract } from './contract';
import { fakeEnv } from './env';

platformContract('web adapter', async () => {
  const f = fakeEnv();
  const p = createWebPlatform(f.env);
  await p.init();
  return { p, pressBack: () => void f.win.fire('popstate'), changeInsets: () => {} };
});

describe('web adapter: Back', () => {
  it('has no native Back, so the game draws its own arrow', () => {
    expect(createWebPlatform(fakeEnv().env).back.native).toBe(false);
  });

  it('browser Back (popstate) runs the back callback, and the guard entry is pushed again while a layer stays open', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    const cb = vi.fn();
    p.back.setBack(cb);
    expect(f.history).toEqual(['push']);
    p.back.setBack(cb); // unchanged: no second entry
    expect(f.history).toEqual(['push']);
    f.win.fire('popstate');
    expect(cb).toHaveBeenCalledOnce();
    // the layer below still has a Back: the guard entry comes back so the next Back stays in the game
    expect(f.history).toEqual(['push', 'push']);
  });

  it('clearing the callback keeps the guard entry (no racing history.back()); a Back with nothing open runs nothing', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    const cb = vi.fn();
    p.back.setBack(cb);
    p.back.setBack(null);
    p.back.setBack(cb); // the entry is still there: nothing pushed
    p.back.setBack(null);
    expect(f.history).toEqual(['push']);
    f.win.fire('popstate');
    expect(cb).not.toHaveBeenCalled();
    expect(f.history).toEqual(['push']);
    p.back.setBack(cb); // the next layer gets a fresh guard
    expect(f.history).toEqual(['push', 'push']);
  });

  it('a callback that clears itself leaves no guard entry behind', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    const cb = vi.fn(() => p.back.setBack(null));
    p.back.setBack(cb);
    f.win.fire('popstate');
    expect(cb).toHaveBeenCalledOnce();
    expect(f.history).toEqual(['push']);
  });

  it('asks before leaving (beforeunload) only while closing confirmation is on', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    expect(f.win.fire('beforeunload').defaultPrevented).toBe(false);
    p.back.setClosingConfirmation(true);
    p.back.setClosingConfirmation(true);
    expect(f.win.count('beforeunload')).toBe(1);
    expect(f.win.fire('beforeunload').defaultPrevented).toBe(true);
    p.back.setClosingConfirmation(false);
    expect(f.win.count('beforeunload')).toBe(0);
  });

  it('has no Settings item', () => {
    const f = fakeEnv();
    expect(() => createWebPlatform(f.env).back.setSettings(() => {})).not.toThrow();
  });
});

describe('web adapter: share', () => {
  it('uses navigator.share when present', async () => {
    const share = vi.fn(async () => {});
    const f = fakeEnv({ share, clipboard: { writeText: vi.fn(async () => {}) } });
    expect(await createWebPlatform(f.env).share.invite('https://x/', 'Join')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: 'https://x/', text: 'Join' });
  });

  it('copies the link when there is no share sheet, or the sheet is dismissed', async () => {
    const writeText = vi.fn(async (_: string) => {});
    expect(await createWebPlatform(fakeEnv({ clipboard: { writeText } }).env).share.invite('https://x/', 'Join')).toBe('copied');
    const dismissed = fakeEnv({ share: async () => Promise.reject(new Error('AbortError')), clipboard: { writeText } });
    expect(await createWebPlatform(dismissed.env).share.invite('https://y/', 'Join')).toBe('copied');
    expect(writeText).toHaveBeenLastCalledWith('https://y/');
  });

  it('fails when the clipboard rejects and there is no share sheet', async () => {
    const f = fakeEnv({ clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
    expect(await createWebPlatform(f.env).share.invite('https://x/', 'Join')).toBe('failed');
    expect(await createWebPlatform(fakeEnv().env).share.invite('https://x/', 'Join')).toBe('failed');
  });

  it('builds invite links to play.pixelarrow.app and opens outside pages in a new tab', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    expect(p.share.inviteUrl('clan_AB12')).toBe('https://play.pixelarrow.app/?startapp=clan_AB12');
    expect(p.share.openExternal('https://pixelarrow.app/terms')).toBe(true);
    expect(f.opened).toEqual(['https://pixelarrow.app/terms']);
    expect(createWebPlatform(fakeEnv({ open: () => null }).env).share.openExternal('https://a/')).toBe(false);
  });
});

describe('web adapter: storage, input and lifecycle', () => {
  it('keeps the save in localStorage under the game prefix (no roaming)', async () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    await p.storage.save().set('campaign', '{"v":1}');
    expect(f.localStorage.get('pixelarrow:campaign')).toBe('{"v":1}');
    expect(await p.storage.device().get('campaign')).toBe('{"v":1}');
    await p.storage.save().remove('campaign');
    expect(await p.storage.save().get('campaign')).toBeNull();
    expect(p.storage.roams).toBe(false);
  });

  it('works without localStorage (private mode)', async () => {
    const f = fakeEnv();
    const p = createWebPlatform({ ...f.env, localStorage: null });
    await expect(p.storage.save().set('k', 'v')).resolves.toBeUndefined();
    expect(await p.storage.save().get('k')).toBeNull();
  });

  it('reads a fine pointer from matchMedia(any-pointer: fine) and a keyboard from the first keydown outside a text field', async () => {
    const f = fakeEnv({ media: { '(any-pointer: fine)': true } });
    const p = createWebPlatform(f.env);
    await p.init();
    expect(p.input.finePointer()).toBe(true);
    expect(createWebPlatform(fakeEnv().env).input.finePointer()).toBe(false);
    const changed = vi.fn();
    p.input.onChange(changed);
    expect(p.input.keyboard()).toBe(false);
    f.win.fire('keydown', { target: { tagName: 'INPUT' } });
    expect(p.input.keyboard()).toBe(false);
    f.win.fire('keydown', { target: { tagName: 'CANVAS' } });
    expect(p.input.keyboard()).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    f.mediaChanged();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('gives key labels from the layout map, or null without one', async () => {
    expect(await createWebPlatform(fakeEnv().env).input.keyLabels()).toBeNull();
    const labels = await createWebPlatform(fakeEnv({ layout: { KeyQ: 'a' } }).env).input.keyLabels();
    expect(labels?.get('KeyQ')).toBe('a');
  });

  it('reports the page hidden and shown (visibilitychange) as inactive and active', () => {
    const f = fakeEnv();
    const p = createWebPlatform(f.env);
    const seen: boolean[] = [];
    const off = p.onActive((a) => seen.push(a));
    f.doc.visibilityState = 'hidden';
    f.doc.fire('visibilitychange');
    f.doc.visibilityState = 'visible';
    f.doc.fire('visibilitychange');
    off();
    f.doc.fire('visibilitychange');
    expect(seen).toEqual([false, true]);
  });

  it('has no sign-in method, payments are coming soon, no notification channel, launch param from ?startapp=', async () => {
    const p = createWebPlatform(fakeEnv({ search: '?startapp=duel' }).env);
    expect(p.auth.methods()).toEqual([]);
    expect(p.auth.silentProof()).toBeNull();
    expect(p.auth.transport).toBe('cookie');
    expect(p.payments.status()).toEqual({ available: false, reason: 'coming_soon' });
    expect(await p.payments.pay({ provider: 'telegram_stars', link: 'x' })).toBe('failed');
    expect(p.notifications.channels()).toEqual([]);
    expect(p.launchParam()).toBe('duel');
    expect(createWebPlatform(fakeEnv().env).launchParam()).toBeNull();
    expect(p.client()).toEqual({ platform: 'web' });
  });
});
