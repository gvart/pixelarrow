import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePlatform } from './fakes/platform';
import { fakeEnv } from './platform/env';

// telegram.ts touches `window` only when attaching; give node a minimal one.
const win = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
(globalThis as Record<string, unknown>).window = win;

const { NavStack, nav, registerScreen, navLayer, showInGameBack, TAB_ROOTS, BACK_RULES, tabOfScene, resolveBack, screenOpts, hubView } = await import('../src/platform/nav');
const { MODE_TABS } = await import('../src/ui/mosaic/tabLayout');
const tg = await import('../src/platform/telegram');
const { trackSafeArea } = await import('../src/platform/safeArea');
const { platform, setPlatformForTests } = await import('../src/platform/index');
const { createWebPlatform } = await import('../src/platform/web/index');

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
      toggles: 0,
      show() { this.visible = true; this.toggles++; },
      hide() { this.visible = false; this.toggles++; },
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

describe('Back on platform.back (ADR-0006 M3)', () => {
  const before = platform;
  afterEach(() => setPlatformForTests(before));

  it('drives platform.back and plays platform.haptics.select on Back', async () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    const army = new FakeScene();
    const toMap = vi.fn();
    registerScreen(army, { back: toMap, confirmClose: true });
    expect(fake.backCb).toBeTypeOf('function');
    expect(fake.closingConfirmation).toBe(true);
    fake.backCb!();
    expect(toMap).toHaveBeenCalledOnce();
    expect(fake.cues).toEqual(['select']);
    army.shutdown();
    await Promise.resolve();
    expect(fake.backCb).toBeNull();
    expect(fake.closingConfirmation).toBe(false);
  });

  it('draws the in-game back arrow exactly when the platform has no native Back', () => {
    const fake = new FakePlatform();
    setPlatformForTests(fake);
    expect(showInGameBack()).toBe(true);
    fake.back.native = true;
    expect(showInGameBack()).toBe(false);
  });

  it('on the web, browser Back (popstate) closes the top sheet, then the screen', async () => {
    const f = fakeEnv();
    setPlatformForTests(createWebPlatform(f.env));
    const army = new FakeScene();
    const toMap = vi.fn();
    registerScreen(army, { back: toMap });
    const sheet = new FakeContainer();
    const close = vi.fn(() => sheet.destroy());
    navLayer(sheet, close, army);
    f.win.fire('popstate');
    expect(close).toHaveBeenCalledOnce();
    expect(toMap).not.toHaveBeenCalled();
    expect(nav.layers()).toBe(0);
    f.win.fire('popstate');
    expect(toMap).toHaveBeenCalledOnce();
    army.shutdown();
    await Promise.resolve();
    expect(nav.depth()).toBe(0);
  });

  it('on the web, leaving mid-battle asks first (beforeunload), and stops asking after the battle', async () => {
    const f = fakeEnv();
    setPlatformForTests(createWebPlatform(f.env));
    const battle = new FakeScene();
    registerScreen(battle, { back: () => {}, confirmClose: true });
    expect(f.win.fire('beforeunload').defaultPrevented).toBe(true);
    battle.shutdown();
    await Promise.resolve();
    expect(f.win.fire('beforeunload').defaultPrevented).toBe(false);
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

  it('keeps exactly one BackButton handler through screens and dialogs', async () => {
    const menu = new FakeScene();
    registerScreen(menu, { back: null });
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.back.size).toBe(0);
    menu.shutdown();
    await Promise.resolve();

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
    await Promise.resolve();
    expect(nav.depth()).toBe(0);
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.back.size).toBe(0);
  });

  it('wires the Settings item and closing confirmation', async () => {
    const battle = new FakeScene();
    const settings = vi.fn();
    registerScreen(battle, { back: () => {}, confirmClose: true, settings });
    expect(wa.enableClosingConfirmation).toHaveBeenCalledOnce();
    expect(wa.SettingsButton.visible).toBe(true);
    expect(wa.settings.size).toBe(1);
    wa.pressSettings();
    expect(settings).toHaveBeenCalledOnce();
    battle.shutdown();
    await Promise.resolve();
    expect(wa.disableClosingConfirmation).toHaveBeenCalledOnce();
    expect(wa.SettingsButton.visible).toBe(false);
  });

  it('hides in-game back arrows when the native button exists', () => {
    expect(showInGameBack()).toBe(false);
  });

  it('re-lays out only when the insets really change, not on every Telegram event', () => {
    const g = globalThis as Record<string, unknown>;
    const vars = new Map<string, string>();
    g.document = { documentElement: { style: { setProperty: (k: string, v: string) => vars.set(k, v) } } };
    g.requestAnimationFrame = (f: () => void) => f();
    const relayout = vi.fn();
    const off = trackSafeArea(relayout);
    // Showing / hiding the BackButton, expanding, full screen: Telegram fires
    // viewportChanged and friends again and again with the same insets.
    for (let i = 0; i < 5; i++) {
      wa.emit('viewportChanged', { isStateStable: true });
      wa.emit('contentSafeAreaChanged');
      wa.emit('safeAreaChanged');
    }
    expect(relayout).toHaveBeenCalledTimes(1);
    expect(vars.get('--pa-content-top')).toBe('46px');
    wa.contentSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };
    wa.emit('contentSafeAreaChanged');
    wa.emit('viewportChanged');
    expect(relayout).toHaveBeenCalledTimes(2);
    expect(vars.get('--pa-content-top')).toBe('0px');
    off();
  });

  it('restarting or switching scenes flips the BackButton at most once', async () => {
    const before = new FakeScene();
    registerScreen(before, { back: null });
    before.shutdown();
    await Promise.resolve();
    wa.BackButton.toggles = 0;
    // Continue: menu (root) -> map in one Phaser step
    const menu = new FakeScene();
    registerScreen(menu, { back: null });
    expect(wa.BackButton.toggles).toBe(0);
    menu.shutdown();
    const map = new FakeScene();
    registerScreen(map, { back: () => {} });
    await Promise.resolve();
    expect(wa.BackButton.visible).toBe(true);
    expect(wa.BackButton.toggles).toBe(1);
    // the map restarts (same scene object shuts down and registers again)
    map.shutdown();
    registerScreen(map, { back: () => {} });
    await Promise.resolve();
    expect(nav.depth()).toBe(1);
    expect(wa.BackButton.visible).toBe(true);
    expect(wa.BackButton.toggles).toBe(1);
    expect(wa.back.size).toBe(1);
    map.shutdown();
    await Promise.resolve();
    expect(nav.depth()).toBe(0);
  });
});

// ------------------------------------------------------------------ HUB-01: tab roots and the Back contract (ia.md §2 §6, screen-flow.md §3)

/** A scene with a key, as Phaser has one (`sys.settings.key`). */
class KeyedScene extends FakeScene {
  sys: { settings: { key: string } };
  constructor(key: string) {
    super();
    this.sys = { settings: { key } };
  }
}

/** Register like BaseScene.screen does. */
function screenOf(scene: KeyedScene, opts: Parameters<typeof screenOpts>[1]): void {
  registerScreen(scene, screenOpts(scene.sys.settings.key, opts));
}

describe('tab roots (ia.md §1.2: tabs are modes, hubs are roots)', () => {
  it('the five tabs are the five hub scenes, one each', () => {
    expect(MODE_TABS.map((tab) => tab.id)).toEqual(['campaign', 'duels', 'war', 'codex', 'shop']);
    expect(Object.entries(TAB_ROOTS)).toEqual([['Menu', 'campaign'], ['Duel', 'duels'], ['Online', 'war'], ['Codex', 'codex'], ['Shop', 'shop']]);
    for (const key of Object.keys(TAB_ROOTS)) expect(BACK_RULES[key], key).toEqual({ kind: 'root' });
    expect(Object.values(BACK_RULES).filter((r) => r.kind === 'root')).toHaveLength(5);
    expect(tabOfScene('Army')).toBeNull();
    expect(tabOfScene('toString')).toBeNull();
  });

  it('a hub never keeps a Back of its own, whatever it registers (D12: War and Duels went to the Menu, Shop to its door)', () => {
    const goBack = () => {};
    for (const key of Object.keys(TAB_ROOTS)) expect(screenOpts(key, { back: goBack }).back, key).toBeNull();
    // the rest of the options stay
    const settings = () => {};
    expect(screenOpts('Shop', { back: goBack, settings }).settings).toBe(settings);
    // other screens keep theirs
    for (const key of ['World', 'Army', 'Market', 'OnlineClan', 'Battle']) expect(screenOpts(key, { back: goBack }).back, key).toBe(goBack);
  });
});

describe('Back contract with Telegram (HUB-01)', () => {
  let wa: ReturnType<typeof fakeWebApp>;
  beforeEach(async () => {
    wa = fakeWebApp();
    tg.attachWebApp(wa as never);
    await Promise.resolve();
  });

  it('a hub opened through a door (Shop from War army, War from a deep link) shows Close, and Back closes only what is open on it', async () => {
    for (const key of ['Shop', 'Online', 'Duel', 'Menu', 'Codex']) {
      const hub = new KeyedScene(key);
      const toDoor = vi.fn();
      screenOf(hub, { back: toDoor });
      expect(wa.BackButton.visible, key).toBe(false);
      expect(wa.back.size, key).toBe(0);
      // a sheet (the hex panel, an info sheet) on the hub: Back closes it, then the hub is a root again
      const sheet = new FakeContainer();
      const close = vi.fn(() => sheet.destroy());
      navLayer(sheet, close, hub);
      expect(wa.BackButton.visible, key).toBe(true);
      wa.pressBack();
      expect(close).toHaveBeenCalledOnce();
      expect(toDoor).not.toHaveBeenCalled();
      expect(wa.BackButton.visible, key).toBe(false);
      hub.shutdown();
      await Promise.resolve();
    }
    expect(nav.depth()).toBe(0);
  });

  it('a hub sub-view (Duels Team, Armoury, Board, Raids) has Back to its hub view; the hub view is a root again', async () => {
    const duel = new KeyedScene('Duel');
    screenOf(duel, { back: () => {} });
    expect(wa.BackButton.visible).toBe(false);
    const up = vi.fn();
    hubView(duel, up); // addSubShell({ back: up })
    expect(wa.BackButton.visible).toBe(true);
    wa.pressBack();
    expect(up).toHaveBeenCalledOnce();
    hubView(duel, null); // the TabBar of the hub view
    expect(wa.BackButton.visible).toBe(false);
    expect(wa.back.size).toBe(0);
    duel.shutdown();
    await Promise.resolve();
  });

  it('only a hub scene declares views: a sub-screen or the Kit gallery keeps the Back it registered', async () => {
    const kit = new KeyedScene('Kit');
    const toMenu = vi.fn();
    screenOf(kit, { back: toMenu });
    hubView(kit, null); // the gallery shows a TabBar
    hubView(kit, () => {}); // and a sub-screen shell
    wa.pressBack();
    expect(toMenu).toHaveBeenCalledOnce();
    kit.shutdown();
    await Promise.resolve();
  });
});

describe('Back targets (screen-flow.md §3)', () => {
  it('single-parent screens go to their parent', () => {
    expect(resolveBack('World')).toEqual({ scene: 'Menu', data: {} });
    expect(resolveBack('Settlement')).toEqual({ scene: 'World', data: {} });
    expect(resolveBack('Camp')).toEqual({ scene: 'World', data: {} });
    expect(resolveBack('OnlineClan')).toEqual({ scene: 'Online', data: {} });
    expect(resolveBack('Kit')).toEqual({ scene: 'Menu', data: {} });
    // a single-parent screen ignores where it was opened from
    expect(resolveBack('Settlement', { scene: 'Menu' })).toEqual({ scene: 'World', data: {} });
  });

  it('multi-door screens return to the origin, else their default (Market: the Shop hub, N4)', () => {
    expect(resolveBack('Market')).toEqual({ scene: 'Shop', data: {} });
    expect(resolveBack('Market', { scene: 'OnlineArmy', data: { tab: 'stash' } })).toEqual({ scene: 'OnlineArmy', data: { tab: 'stash' } });
    expect(resolveBack('Market', { scene: 'Market' })).toEqual({ scene: 'Shop', data: {} });
    expect(resolveBack('Army', { scene: 'Settlement', data: { id: 3 } })).toEqual({ scene: 'Settlement', data: { id: 3 } });
    expect(resolveBack('Army', null)).toEqual({ scene: 'World', data: {} });
    expect(resolveBack('Hero')).toEqual({ scene: 'Army', data: {} });
    expect(resolveBack('OnlineArmy', { scene: 'Camp', data: { mode: 'online' } })).toEqual({ scene: 'Camp', data: { mode: 'online' } });
    expect(resolveBack('Merchant')).toEqual({ scene: 'Online', data: {} });
  });

  it('hubs, Battle and Boot leave no screen on Back', () => {
    for (const key of [...Object.keys(TAB_ROOTS), 'Battle', 'Boot', 'Nowhere']) expect(resolveBack(key, { scene: 'World' }), key).toBeNull();
  });

  it('no dead ends: from every screen, Back reaches a tab root without a loop (screen-flow §5)', () => {
    for (const start of Object.keys(BACK_RULES)) {
      const seen = new Set<string>();
      let key = start;
      while (BACK_RULES[key].kind !== 'root') {
        const rule = BACK_RULES[key];
        if (rule.kind === 'battle' || rule.kind === 'none') break; // Battle: the ⋯ menu and Results; Boot moves on by itself
        expect(seen.has(key), `${start}: loop at ${key}`).toBe(false);
        seen.add(key);
        const to = resolveBack(key)!.scene;
        expect(BACK_RULES[to], `${start}: ${key} -> ${to}`).toBeDefined();
        key = to;
      }
    }
  });

  // The document is the contract: every screen of its register has a rule here, and the rule matches the
  // Back column of its §3 table.
  const flow = Object.values(import.meta.glob<string>('../design/ux/screen-flow.md', { eager: true, query: '?raw', import: 'default' }))[0];
  const section = (n: number) => flow.split(/^## /m).find((s: string) => s.startsWith(`${n}.`))!;
  const rows = (text: string) => text.split('\n').filter((l) => /^\| S\d\d/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  /** S-ID -> scene key (the register's code column). */
  const register = new Map(rows(section(1)).map((c) => [c[1], c[3].match(/`(\w+)`/)![1]]));
  /** What the Back column says for each kind of rule. */
  const says: Record<string, RegExp> = { root: /^root/, origin: /\(origin\)|Onward/, battle: /battle menu/, none: /^—/ };
  const parentName: Record<string, RegExp> = { Menu: /Campaign hub/, World: /World/, Online: /War hub/ };

  it('every screen of the register has a Back rule', () => {
    expect(register.size).toBe(24);
    for (const [id, key] of register) expect(BACK_RULES[key], `${id} ${key}`).toBeDefined();
  });

  it("each rule matches the screen's Back column", () => {
    const table = rows(section(3));
    expect(table.length).toBeGreaterThanOrEqual(24);
    for (const c of table) {
      const id = c[1].split(' ')[0];
      const key = register.get(id)!;
      const back = c[4];
      // the Duels sub-views (S13-S17) live in the Duel scene: their Back is the view's own (hubView), tested above
      if (key === 'Duel' && id !== 'S12') continue;
      // S05 is two rows: the field camp (parent World) and the War camp (back to the War hub it came from)
      if (c[1].startsWith('S05 War')) {
        expect(back).toMatch(/War hub/);
        continue;
      }
      const rule = BACK_RULES[key];
      const where = `${c[1]} (${key}): "${back}"`;
      if (rule.kind === 'parent') expect(back, where).toMatch(parentName[rule.to] ?? new RegExp(rule.to));
      else expect(back, where).toMatch(says[rule.kind]);
    }
  });
});
