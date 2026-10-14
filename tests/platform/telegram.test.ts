import { describe, expect, it, vi } from 'vitest';
import { createTelegramPlatform } from '../../src/platform/telegram/index';
import { platformContract } from './contract';
import { fakeEnv } from './env';

/** A fake Telegram.WebApp that records what the adapter does with it. */
export function fakeWebApp(version = '8.0', platform = 'ios', initData = 'user=1&hash=abc') {
  const events = new Map<string, Set<(a?: unknown) => void>>();
  const button = () => {
    const handlers = new Set<() => void>();
    return { handlers, visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, onClick: (cb: () => void) => void handlers.add(cb), offClick: (cb: () => void) => void handlers.delete(cb) };
  };
  const calls: string[] = [];
  const cloud = new Map<string, string>();
  const wa = {
    version,
    platform,
    colorScheme: 'dark' as const,
    themeParams: {},
    isFullscreen: false,
    initData,
    initDataUnsafe: { user: { first_name: 'Ann', language_code: 'ru' }, start_param: undefined as string | undefined },
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast: (v: string) => parseFloat(version) >= parseFloat(v),
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    requestFullscreen: vi.fn(() => calls.push('requestFullscreen')),
    lockOrientation: () => calls.push('lockOrientation'),
    enableClosingConfirmation: () => calls.push('confirm:on'),
    disableClosingConfirmation: () => calls.push('confirm:off'),
    BackButton: button(),
    SettingsButton: button(),
    HapticFeedback: { impactOccurred: (s: string) => calls.push(`impact:${s}`), notificationOccurred: (t: string) => calls.push(`notify:${t}`), selectionChanged: () => calls.push('select') },
    CloudStorage: {
      hang: false,
      getItem(k: string, cb: (e: string | null, v?: string) => void) {
        if (!this.hang) cb(null, cloud.get(k) ?? '');
      },
      setItem(k: string, v: string, cb?: (e: string | null) => void) {
        if (this.hang) return;
        cloud.set(k, v);
        cb?.(null);
      },
      removeItem(k: string, cb?: (e: string | null) => void) {
        if (this.hang) return;
        cloud.delete(k);
        cb?.(null);
      },
    },
    invoiceStatus: 'paid' as string,
    invoices: [] as string[],
    openInvoice(link: string, cb?: (s: string) => void) {
      this.invoices.push(link);
      cb?.(this.invoiceStatus);
    },
    links: [] as string[],
    openTelegramLink(url: string) {
      this.links.push(url);
    },
    openLink(url: string) {
      this.links.push(url);
    },
    onEvent: (ev: string, cb: (a?: unknown) => void) => {
      if (!events.has(ev)) events.set(ev, new Set());
      events.get(ev)!.add(cb);
    },
    offEvent: (ev: string, cb: (a?: unknown) => void) => events.get(ev)?.delete(cb),
    emit: (ev: string, a?: unknown) => events.get(ev)?.forEach((cb) => cb(a)),
    calls,
    cloud,
  };
  return wa;
}

/** The adapter in a page launched from Telegram, with the SDK already present. */
async function launched(wa = fakeWebApp(), extra: Parameters<typeof fakeEnv>[0] = {}) {
  const f = fakeEnv({ hash: '#tgWebAppData=x', ...extra, globals: { Telegram: { WebApp: wa } } });
  const p = createTelegramPlatform(f.env, { bot: 'pixelarrow_bot' });
  await p.init();
  return { p, f, wa };
}

platformContract('Telegram adapter', async () => {
  const { p, wa } = await launched();
  return { p, pressBack: () => [...wa.BackButton.handlers].forEach((h) => h()), changeInsets: () => wa.emit('safeAreaChanged') };
});

describe('Telegram adapter: start-up and version gates', () => {
  it('goes full screen and locks portrait on a Bot API 8.0 phone', async () => {
    const { wa } = await launched();
    expect(wa.calls).toEqual(expect.arrayContaining(['ready', 'expand', 'disableVerticalSwipes', 'requestFullscreen', 'lockOrientation']));
  });

  it('stays expanded, not full screen, on a 6.0 client and on desktop', async () => {
    const old = (await launched(fakeWebApp('6.0'))).wa;
    expect(old.calls).toContain('expand');
    expect(old.calls).not.toContain('requestFullscreen');
    expect(old.calls).not.toContain('disableVerticalSwipes');
    const desk = (await launched(fakeWebApp('8.0', 'tdesktop'))).wa;
    expect(desk.requestFullscreen).not.toHaveBeenCalled();
  });

  it('gates Back (6.1), Settings (7.0), closing confirmation (6.2) and CloudStorage (6.9) by version', async () => {
    const { p, wa } = await launched(fakeWebApp('6.0'));
    expect(p.back.native).toBe(false);
    p.back.setBack(() => {});
    p.back.setSettings(() => {});
    p.back.setClosingConfirmation(true);
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.SettingsButton.visible).toBe(false);
    expect(wa.calls).not.toContain('confirm:on');
    await p.storage.save().set('k', 'v');
    expect(wa.cloud.size).toBe(0);
    expect(p.storage.roams).toBe(false);
  });

  it('does not load the SDK outside a Telegram launch, and degrades when it fails to load', async () => {
    const plain = fakeEnv();
    const appended: unknown[] = [];
    Object.assign(plain.doc, { head: { appendChild: (el: unknown) => appended.push(el) }, createElement: () => ({}) });
    await createTelegramPlatform(plain.env).init();
    expect(appended).toEqual([]);

    const f = fakeEnv({ hash: '#tgWebAppData=x' });
    const script: { src?: string; onerror?: () => void } = {};
    Object.assign(f.doc, { head: { appendChild: () => script.onerror?.() }, createElement: () => script });
    const p = createTelegramPlatform(f.env);
    await p.init();
    expect(script.src).toBe('https://telegram.org/js/telegram-web-app.js');
    expect(p.auth.silentProof()).toBeNull();
    expect(p.back.native).toBe(false);
    expect(() => p.haptics.impact('light')).not.toThrow();
  });
});

describe('Telegram adapter: Back, Settings and closing confirmation', () => {
  it('shows the native Back with the handler, swaps it, and hides it on null', async () => {
    const { p, wa } = await launched();
    expect(p.back.native).toBe(true);
    const a = vi.fn();
    const b = vi.fn();
    p.back.setBack(a);
    expect(wa.BackButton.visible).toBe(true);
    p.back.setBack(b);
    expect([...wa.BackButton.handlers]).toEqual([b]);
    p.back.setBack(null);
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.BackButton.handlers.size).toBe(0);
  });

  it('wires the ⋯ Settings item and the closing confirmation (only on change)', async () => {
    const { p, wa } = await launched();
    const s = vi.fn();
    p.back.setSettings(s);
    expect(wa.SettingsButton.visible).toBe(true);
    [...wa.SettingsButton.handlers][0]();
    expect(s).toHaveBeenCalledOnce();
    p.back.setSettings(null);
    expect(wa.SettingsButton.visible).toBe(false);
    p.back.setClosingConfirmation(true);
    p.back.setClosingConfirmation(true);
    p.back.setClosingConfirmation(false);
    expect(wa.calls.filter((c) => c.startsWith('confirm'))).toEqual(['confirm:on', 'confirm:off']);
  });
});

describe('Telegram adapter: payments, share, auth', () => {
  it('maps openInvoice statuses to payment results', async () => {
    const { p, wa } = await launched();
    expect(p.payments.status()).toEqual({ available: true, provider: 'telegram_stars' });
    for (const s of ['paid', 'cancelled', 'failed', 'pending'] as const) {
      wa.invoiceStatus = s;
      expect(await p.payments.pay({ provider: 'telegram_stars', link: 'https://t.me/$inv' })).toBe(s);
    }
    wa.invoiceStatus = 'weird';
    expect(await p.payments.pay({ provider: 'telegram_stars', link: 'x' })).toBe('failed');
    const old = (await launched(fakeWebApp('6.0'))).p;
    expect(old.payments.status()).toEqual({ available: false, reason: 'offline' });
    expect(await old.payments.pay({ provider: 'telegram_stars', link: 'x' })).toBe('failed');
  });

  it('builds t.me invite links for the Mini App, or a play link without a bot name', async () => {
    const { p } = await launched();
    expect(p.share.inviteUrl('clan_AB12')).toBe('https://t.me/pixelarrow_bot/play?startapp=clan_AB12');
    const f = fakeEnv();
    expect(createTelegramPlatform(f.env).share.inviteUrl('clan_AB12')).toBe('https://play.pixelarrow.app/?startapp=clan_AB12');
  });

  it('shares through Telegram’s share sheet, and copies the link when the SDK is missing', async () => {
    const { p, wa } = await launched();
    expect(await p.share.invite('https://t.me/b/play?startapp=clan_X', 'Join us')).toBe('shared');
    expect(wa.links).toEqual([`https://t.me/share/url?url=${encodeURIComponent('https://t.me/b/play?startapp=clan_X')}&text=${encodeURIComponent('Join us')}`]);
    const writeText = vi.fn(async () => {});
    const bare = createTelegramPlatform(fakeEnv({ clipboard: { writeText } }).env);
    expect(await bare.share.invite('https://x/', 'Join')).toBe('copied');
    expect(p.share.openExternal('https://pixelarrow.app/terms')).toBe(true);
    expect(wa.links).toContain('https://pixelarrow.app/terms');
  });

  it('gives initData as the silent proof, and none without it', async () => {
    const { p } = await launched();
    expect(p.auth.silentProof()).toEqual({ kind: 'telegram', initData: 'user=1&hash=abc' });
    expect(p.auth.methods()).toEqual(['telegram']);
    expect(p.auth.transport).toBe('bearer');
    // no email forms in the Mini App, so no human check (N-AF-3)
    expect(p.auth.humanCheck).toBeUndefined();
    const empty = (await launched(fakeWebApp('8.0', 'ios', ''))).p;
    expect(empty.auth.silentProof()).toBeNull();
  });

  it('Reopen relaunches the Mini App on the account page for fresh initData (V6-LINK-05), and says false without a bot link', async () => {
    const { p, wa } = await launched();
    expect(p.auth.reopen?.()).toBe(true);
    expect(wa.links).toEqual(['https://t.me/pixelarrow_bot/play?startapp=account']);
    const f = fakeEnv({ hash: '#tgWebAppData=x', globals: { Telegram: { WebApp: fakeWebApp() } } });
    const bare = createTelegramPlatform(f.env);
    await bare.init();
    expect(bare.auth.reopen?.()).toBe(false);
  });
});

describe('Telegram adapter: storage', () => {
  it('writes the save to CloudStorage and the localStorage mirror', async () => {
    const { p, wa, f } = await launched();
    expect(p.storage.roams).toBe(true);
    await p.storage.save().set('campaign', 'v1');
    expect(wa.cloud.get('campaign')).toBe('v1');
    expect(f.localStorage.get('pixelarrow:campaign')).toBe('v1');
    expect(await p.storage.save().get('campaign')).toBe('v1');
  });

  it('falls back to the mirror when CloudStorage times out', async () => {
    const { p, wa, f } = await launched();
    await p.storage.save().set('campaign', 'v1');
    wa.CloudStorage.hang = true;
    const read = p.storage.save().get('campaign');
    f.runTimers(); // the 5 s timeout
    expect(await read).toBe('v1');
  });

  it('a write lands in the mirror at once; the cloud follows in order, and reads meanwhile come from the mirror', async () => {
    const { p, wa, f } = await launched();
    await p.storage.save().set('campaign', 'v1');
    wa.CloudStorage.hang = true;
    // a slow cloud holds neither the write nor a read of it
    await p.storage.save().set('campaign', 'v2');
    expect(f.localStorage.get('pixelarrow:campaign')).toBe('v2');
    expect(await p.storage.save().get('campaign')).toBe('v2');
    expect(wa.cloud.get('campaign')).toBe('v1');
    wa.CloudStorage.hang = false;
    f.runTimers(); // the hung cloud write gives up; the next ones go through
    await p.storage.save().set('campaign', 'v3');
    await new Promise((r) => setTimeout(r, 0));
    expect(wa.cloud.get('campaign')).toBe('v3');
  });

  it('keeps device data in localStorage only', async () => {
    const { p, wa, f } = await launched();
    await p.storage.device().set('mapView', 'z2');
    expect(wa.cloud.has('mapView')).toBe(false);
    expect(f.localStorage.get('pixelarrow:mapView')).toBe('z2');
  });
});

describe('Telegram adapter: haptics, insets, lifecycle, input', () => {
  it('plays haptics only while enabled', async () => {
    const { p, wa } = await launched();
    p.haptics.impact('medium');
    p.haptics.notify('success');
    p.haptics.select();
    p.haptics.setEnabled(false);
    p.haptics.impact('heavy');
    expect(wa.calls.filter((c) => /impact|notify|select/.test(c))).toEqual(['impact:medium', 'notify:success', 'select']);
  });

  it('reports insets and re-reports them on change events', async () => {
    const wa = fakeWebApp();
    const f = fakeEnv({ hash: '#tgWebAppData=x', globals: { Telegram: { WebApp: wa } } });
    const p = createTelegramPlatform(f.env);
    const seen: number[] = [];
    const off = p.safeArea.onChange((d, c) => seen.push(d.top + c.top));
    await p.init();
    wa.safeAreaInset = { top: 47, bottom: 34, left: 0, right: 0 };
    wa.emit('safeAreaChanged');
    off();
    wa.emit('safeAreaChanged');
    expect(seen).toEqual([105, 93]);
    expect(p.safeArea.current().device.top).toBe(47);
  });

  it('reports the Mini App minimised and restored', async () => {
    const { p, wa } = await launched();
    const seen: boolean[] = [];
    p.onActive((a) => seen.push(a));
    wa.emit('deactivated');
    wa.emit('activated');
    expect(seen).toEqual([false, true]);
  });

  it('expects a keyboard on desktop clients, and gives the launch param and client info', async () => {
    const wa = fakeWebApp('8.0', 'tdesktop');
    wa.initDataUnsafe.start_param = 'clan_AB12';
    const { p } = await launched(wa);
    expect(p.input.keyboard()).toBe(true);
    expect(p.launchParam()).toBe('clan_AB12');
    expect(p.client()).toEqual({ platform: 'tdesktop', version: '8.0', language: 'ru' });
    expect(p.notifications.channels()).toEqual(['telegram_bot']);
    const phone = (await launched(fakeWebApp('8.0', 'ios'), { search: '?startapp=duel' })).p;
    expect(phone.input.keyboard()).toBe(false);
    expect(phone.launchParam()).toBe('duel');
    expect(await phone.input.keyLabels()).toBeNull();
  });
});
