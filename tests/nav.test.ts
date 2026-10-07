import { beforeEach, describe, expect, it, vi } from 'vitest';

// telegram.ts touches `window` only when attaching; give node a minimal one.
const win = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
(globalThis as Record<string, unknown>).window = win;

const { NavStack, nav, registerScreen, navLayer, showInGameBack } = await import('../src/platform/nav');
const tg = await import('../src/platform/telegram');

/** A fake Telegram.WebApp that records what the game does with it. */
function fakeWebApp(version = '8.0', platform = 'ios') {
  const back = new Set<() => void>();
  const settings = new Set<() => void>();
  const events = new Map<string, Set<(a?: unknown) => void>>();
  const calls: string[] = [];
  const wa = {
    version,
    platform,
    colorScheme: 'dark' as const,
    themeParams: {},
    isFullscreen: false,
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
    isVersionAtLeast: (v: string) => parseFloat(version) >= parseFloat(v),
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    requestFullscreen: vi.fn(() => calls.push('requestFullscreen')),
    lockOrientation: vi.fn(() => calls.push('lockOrientation')),
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn(), selectionChanged: vi.fn() },
    BackButton: {
      visible: false,
      show() { this.visible = true; },
      hide() { this.visible = false; },
      onClick: (cb: () => void) => back.add(cb),
      offClick: (cb: () => void) => back.delete(cb),
    },
    SettingsButton: {
      visible: false,
      show() { this.visible = true; },
      hide() { this.visible = false; },
      onClick: (cb: () => void) => settings.add(cb),
      offClick: (cb: () => void) => settings.delete(cb),
    },
    onEvent: (ev: string, cb: (a?: unknown) => void) => {
      if (!events.has(ev)) events.set(ev, new Set());
      events.get(ev)!.add(cb);
    },
    emit(ev: string, arg?: unknown) {
      for (const cb of events.get(ev) ?? []) cb(arg);
    },
    pressBack: () => [...back].forEach((cb) => cb()),
    pressSettings: () => [...settings].forEach((cb) => cb()),
    back,
    settings,
    calls,
  };
  return wa;
}

class FakeScene {
  private handlers = new Map<string, (() => void)[]>();
  events = {
    once: (ev: string, fn: () => void) => {
      this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    },
  };
  shutdown(): void {
    const hs = this.handlers.get('shutdown') ?? [];
    this.handlers.delete('shutdown');
    hs.forEach((f) => f());
  }
}

class FakeContainer {
  private fns: (() => void)[] = [];
  once(_ev: 'destroy', fn: () => void): void {
    this.fns.push(fn);
  }
  destroy(): void {
    const f = this.fns;
    this.fns = [];
    f.forEach((x) => x());
  }
}

describe('NavStack', () => {
  function host() {
    return { back: null as (() => void) | null, settings: null as (() => void) | null, confirm: false, fb: 0 };
  }
  function make() {
    const h = host();
    const n = new NavStack({
      setBack: (cb) => (h.back = cb),
      setSettings: (cb) => (h.settings = cb),
      setClosingConfirmation: (on) => (h.confirm = on),
      feedback: () => h.fb++,
    });
    return { h, n };
  }

  it('root screen hides Back; a child screen shows it and goes back one level', () => {
    const { h, n } = make();
    const menu = {};
    n.register(menu, { back: null });
    expect(h.back).toBeNull();
    n.unregister(menu);
    const army = {};
    const goBack = vi.fn();
    n.register(army, { back: goBack });
    expect(h.back).not.toBeNull();
    h.back!();
    expect(goBack).toHaveBeenCalledOnce();
    expect(h.fb).toBe(1);
  });

  it('layers close before the screen goes back, top first', () => {
    const { h, n } = make();
    const goBack = vi.fn();
    n.register({}, { back: goBack });
    const order: string[] = [];
    n.pushLayer(() => void order.push('a'));
    const removeB = n.pushLayer(() => void order.push('b'));
    expect(n.layers()).toBe(2);
    h.back!();
    expect(order).toEqual(['b']);
    removeB(); // already gone: no-op
    h.back!();
    expect(order).toEqual(['b', 'a']);
    h.back!();
    expect(goBack).toHaveBeenCalledOnce();
  });

  it('a layer on a root screen shows Back until it closes', () => {
    const { h, n } = make();
    n.register({}, { back: null });
    const remove = n.pushLayer(() => {});
    expect(h.back).not.toBeNull();
    remove();
    expect(h.back).toBeNull();
  });

  it('a layer whose close returns false stays open', () => {
    const { h, n } = make();
    const goBack = vi.fn();
    n.register({}, { back: goBack });
    n.pushLayer(() => false);
    h.back!();
    h.back!();
    expect(n.layers()).toBe(1);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('a screen launched on top is popped back to the one below', () => {
    const { h, n } = make();
    const below = vi.fn();
    const a = {};
    const b = {};
    n.register(a, { back: below });
    n.register(b, { back: null });
    expect(h.back).toBeNull();
    n.unregister(b);
    h.back!();
    expect(below).toHaveBeenCalledOnce();
  });

  it('closing confirmation follows the top screen and unsaved progress', () => {
    const { h, n } = make();
    const battle = {};
    n.register(battle, { back: () => {}, confirmClose: true });
    expect(h.confirm).toBe(true);
    n.unregister(battle);
    n.register({}, { back: null });
    expect(h.confirm).toBe(false);
    n.setUnsaved(true);
    expect(h.confirm).toBe(true);
    n.setUnsaved(false);
    expect(h.confirm).toBe(false);
  });

  it('settings button opens the top screen settings', () => {
    const { h, n } = make();
    const s = vi.fn();
    n.register({}, { back: null, settings: s });
    h.settings!();
    expect(s).toHaveBeenCalledOnce();
    n.register({}, { back: null });
    expect(h.settings).toBeNull();
  });
});

describe('Telegram wiring', () => {
  let wa: ReturnType<typeof fakeWebApp>;
  beforeEach(() => {
    wa = fakeWebApp();
    tg.attachWebApp(wa as never);
  });

  it('goes full screen and locks portrait on a Bot API 8.0 phone', () => {
    expect(wa.calls).toEqual(expect.arrayContaining(['ready', 'expand', 'disableVerticalSwipes', 'requestFullscreen', 'lockOrientation']));
  });

  it('falls back to expand() on older clients and on desktop', () => {
    const old = fakeWebApp('7.10');
    tg.attachWebApp(old as never);
    expect(old.calls).toContain('expand');
    expect(old.requestFullscreen).not.toHaveBeenCalled();
    const desk = fakeWebApp('8.0', 'tdesktop');
    tg.attachWebApp(desk as never);
    expect(desk.requestFullscreen).not.toHaveBeenCalled();
    // refused full screen: expand again
    const failing = fakeWebApp();
    tg.attachWebApp(failing as never);
    failing.calls.length = 0;
    failing.emit('fullscreenFailed', { error: 'UNSUPPORTED' });
    expect(failing.calls).toContain('expand');
  });

  it('reports insets and re-reports them on change events', () => {
    const seen: number[] = [];
    const off = tg.onInsetsChanged((d, c) => seen.push(d.top + c.top));
    wa.safeAreaInset = { top: 47, bottom: 34, left: 0, right: 0 };
    wa.emit('safeAreaChanged');
    wa.contentSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
    wa.emit('fullscreenChanged');
    off();
    expect(seen).toEqual([47 + 46, 47]);
    expect(tg.deviceInsets()).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  it('keeps exactly one BackButton handler through screens and dialogs', () => {
    const menu = new FakeScene();
    registerScreen(menu, { back: null });
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.back.size).toBe(0);
    menu.shutdown();

    const army = new FakeScene();
    const toMap = vi.fn();
    registerScreen(army, { back: toMap });
    expect(wa.BackButton.visible).toBe(true);
    expect(wa.back.size).toBe(1);

    const modal = new FakeContainer();
    const close = vi.fn(() => modal.destroy());
    navLayer(modal, close, army);
    expect(wa.back.size).toBe(1);
    wa.pressBack();
    expect(close).toHaveBeenCalledOnce();
    expect(toMap).not.toHaveBeenCalled();
    expect(wa.HapticFeedback.selectionChanged).toHaveBeenCalledTimes(1);
    wa.pressBack();
    expect(toMap).toHaveBeenCalledOnce();
    army.shutdown();
    expect(nav.depth()).toBe(0);
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.back.size).toBe(0);
  });

  it('wires the Settings item and closing confirmation', () => {
    const battle = new FakeScene();
    const settings = vi.fn();
    registerScreen(battle, { back: () => {}, confirmClose: true, settings });
    expect(wa.enableClosingConfirmation).toHaveBeenCalledOnce();
    expect(wa.SettingsButton.visible).toBe(true);
    expect(wa.settings.size).toBe(1);
    wa.pressSettings();
    expect(settings).toHaveBeenCalledOnce();
    battle.shutdown();
    expect(wa.disableClosingConfirmation).toHaveBeenCalledOnce();
    expect(wa.SettingsButton.visible).toBe(false);
  });

  it('hides in-game back arrows when the native button exists', () => {
    expect(showInGameBack()).toBe(false);
  });
});
