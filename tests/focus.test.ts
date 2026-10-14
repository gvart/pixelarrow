/**
 * V6-INP-04: the focus manager (ADR-0012 Decision 4, input-v6.md §4), pure: no DOM, no Phaser.
 */
import { describe, expect, it } from 'vitest';
import { FocusManager, outermostLayer, scopeStack, type Focusable, type FocusRole, type Nested } from '../src/ui/input/focus';
import { KeyRouter, activeContexts, type KeyInput } from '../src/ui/input/keys';

// nav.ts reaches the platform, which touches `window` only when attaching; give node a minimal one
(globalThis as Record<string, unknown>).window ??= { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
const { NavStack } = await import('../src/platform/nav');

interface Ctl extends Focusable {
  name: string;
  taps: number;
  x: number;
  y: number;
}

/** A control `name` at (x, y), w x h UI px, in `scope`. */
function ctl(scope: object, name: string, x: number, y: number, o: { w?: number; h?: number; group?: unknown; role?: FocusRole; off?: boolean; key?: string; hidden?: boolean } = {}): Ctl {
  const c: Ctl = {
    name,
    taps: 0,
    x,
    y,
    key: o.key,
    group: o.group,
    role: o.role,
    scope: () => scope,
    rect: () => (o.hidden ? null : { x: c.x, y: c.y, w: o.w ?? 20, h: o.h ?? 10 }),
    enabled: () => !o.off,
    onActivate: () => void c.taps++,
  };
  return c;
}

function setup(stack: object[] = [screen]) {
  const fm = new FocusManager();
  fm.setStack(stack);
  return fm;
}
const screen = { name: 'screen' };
const name = (fm: FocusManager) => (fm.focused as Ctl | null)?.name ?? null;

describe('FocusManager: reading order', () => {
  it('Tab goes by 8 UI px bands from the top, then left to right, and wraps', () => {
    const fm = setup();
    // b sits 5 px lower than a but in the same band: it comes after a (left to right)
    [ctl(screen, 'c', 10, 40), ctl(screen, 'b', 60, 5), ctl(screen, 'a', 10, 1), ctl(screen, 'd', 80, 41)].forEach((c) => fm.add(c));
    expect(fm.order().map((c) => (c as Ctl).name)).toEqual(['a', 'b', 'c', 'd']);
    fm.focusFirst();
    fm.next(); // the first Tab shows the ring on the first control
    const seen = [name(fm)];
    for (let i = 0; i < 4; i++) {
      fm.next();
      seen.push(name(fm));
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'a']);
    fm.prev();
    expect(name(fm)).toBe('d');
  });

  it('hidden controls are skipped; disabled ones stay focusable and activate (to say why)', () => {
    const fm = setup();
    const off = ctl(screen, 'off', 0, 0, { off: true });
    fm.add(off);
    fm.add(ctl(screen, 'gone', 0, 20, { hidden: true }));
    fm.add(ctl(screen, 'b', 0, 40));
    expect(fm.order().map((c) => (c as Ctl).name)).toEqual(['off', 'b']);
    fm.focusFirst();
    expect(fm.activate()).toBe(true);
    expect(off.taps).toBe(1);
  });

  it('a removed control is never focused again', () => {
    const fm = setup();
    const a = ctl(screen, 'a', 0, 0);
    const off = fm.add(a);
    fm.add(ctl(screen, 'b', 0, 20));
    fm.focusFirst();
    expect(name(fm)).toBe('a');
    off();
    expect(name(fm)).toBe('b');
  });
});

describe('FocusManager: initial focus and the default control', () => {
  it('a screen opens on its primary, else the first control in reading order', () => {
    const fm = setup();
    fm.add(ctl(screen, 'back', 0, 0));
    fm.add(ctl(screen, 'go', 0, 100, { role: 'primary' }));
    expect(name(fm)).toBe('go');
    const plain = setup();
    plain.add(ctl(screen, 'first', 0, 0));
    plain.add(ctl(screen, 'second', 0, 30));
    expect(name(plain)).toBe('first');
  });

  it('a destructive confirm opens on the safe choice, never the danger button', () => {
    const sheet = {};
    const fm = setup([screen, sheet]);
    fm.add(ctl(sheet, 'cancel', 10, 100));
    fm.add(ctl(sheet, 'scrap', 120, 100, { role: 'danger' }));
    expect(name(fm)).toBe('cancel');
    // even when the danger button comes first in reading order
    const fm2 = setup([screen, sheet]);
    fm2.add(ctl(sheet, 'scrap', 10, 100, { role: 'danger' }));
    fm2.add(ctl(sheet, 'ok', 120, 100, { role: 'primary' }));
    fm2.add(ctl(sheet, 'cancel', 120, 100, { role: 'safe' }));
    expect(name(fm2)).toBe('cancel');
  });

  it('a field scope (battle, maps) starts with nothing focused; Tab enters it at the first control', () => {
    const fm = new FocusManager();
    fm.setStack([screen], () => true);
    fm.add(ctl(screen, 'order', 0, 100));
    fm.add(ctl(screen, 'top', 0, 0));
    expect(fm.focused).toBeNull();
    fm.next();
    expect(name(fm)).toBe('top');
    expect(fm.visible).toBe(true);
    // Esc (leave) goes back to field mode; a screen that is not a field keeps its focus
    expect(fm.leaveField()).toBe(true);
    expect(fm.focused).toBeNull();
    expect(fm.leaveField()).toBe(false);
  });

  it('a field scope ignores clicks on its controls; a pointer press drops the focus', () => {
    const fm = new FocusManager();
    fm.setStack([screen], () => true);
    const a = ctl(screen, 'a', 0, 0);
    fm.add(a);
    fm.pointerFocus(a);
    expect(fm.focused).toBeNull();
    fm.next();
    fm.pointer();
    expect(fm.focused).toBeNull();
  });
});

describe('FocusManager: focus-visible', () => {
  it('the ring shows only after a keyboard focus action; a pointer hides it and keeps the position', () => {
    const fm = setup();
    const a = ctl(screen, 'a', 0, 0);
    const b = ctl(screen, 'b', 0, 20);
    const c = ctl(screen, 'c', 0, 40);
    [a, b, c].forEach((x) => fm.add(x));
    expect(fm.visible).toBe(false);
    // the first Tab shows the ring where focus already is (the default), without moving it
    fm.next();
    expect(fm.visible).toBe(true);
    expect(name(fm)).toBe('a');
    fm.pointer();
    expect(fm.visible).toBe(false);
    // a click focuses the control it hit (no ring); the next Tab continues from there
    fm.pointerFocus(b);
    expect(name(fm)).toBe('b');
    expect(fm.visible).toBe(false);
    fm.next();
    expect(name(fm)).toBe('b');
    fm.next();
    expect(name(fm)).toBe('c');
  });

  it('an arrow also only shows the ring at first', () => {
    const fm = setup();
    fm.add(ctl(screen, 'a', 0, 0));
    fm.add(ctl(screen, 'b', 40, 0));
    fm.move('right');
    expect(name(fm)).toBe('a');
    expect(fm.visible).toBe(true);
    fm.move('right');
    expect(name(fm)).toBe('b');
  });
});

describe('FocusManager: arrows', () => {
  /** A 3 x 3 grid of 20 x 10 cells, 30 px apart. */
  function grid(fm: FocusManager, group?: unknown) {
    const cells: Ctl[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(ctl(screen, `${r}${c}`, 100 + c * 30, 100 + r * 30, { group }));
    cells.forEach((x) => fm.add(x));
    return cells;
  }

  it('moves spatially in a grid; with nothing that way, focus stays', () => {
    const fm = setup();
    grid(fm);
    fm.focusFirst();
    // the first arrow only shows the ring
    fm.move('down');
    expect(name(fm)).toBe('00');
    fm.move('right');
    fm.move('down');
    expect(name(fm)).toBe('11');
    fm.move('down');
    fm.move('down');
    expect(name(fm)).toBe('21');
    fm.move('left');
    fm.move('left');
    expect(name(fm)).toBe('20');
    fm.move('up');
    expect(name(fm)).toBe('10');
  });

  it('prefers the control in line over a nearer one off to the side (45° cone, off-axis weighted)', () => {
    const fm = setup();
    const from = ctl(screen, 'from', 0, 100, { w: 20, h: 20 });
    fm.add(from);
    fm.add(ctl(screen, 'inline', 100, 100, { w: 20, h: 20 }));
    fm.add(ctl(screen, 'diag', 50, 60, { w: 20, h: 20 }));
    fm.add(ctl(screen, 'above', 20, 0, { w: 20, h: 20 }));
    fm.pointerFocus(from);
    fm.move('right');
    expect(name(fm)).toBe('from');
    fm.move('right');
    expect(name(fm)).toBe('inline');
  });

  it('down from a small corner button reaches the wide card straight below it, not one further down', () => {
    const fm = setup();
    const back = ctl(screen, 'back', 5, 5, { w: 25, h: 25 });
    fm.add(back);
    fm.add(ctl(screen, 'card1', 25, 40, { w: 200, h: 90 }));
    fm.add(ctl(screen, 'card2', 25, 140, { w: 200, h: 90 }));
    fm.pointerFocus(back);
    fm.move('down');
    fm.move('down');
    expect(name(fm)).toBe('card1');
  });

  it('in a row (a tab bar) arrows stay inside the group and Tab leaves it as one stop', () => {
    const fm = setup();
    const tabs = 'tabs';
    fm.add(ctl(screen, 'top', 0, 0));
    ['t1', 't2', 't3'].forEach((n, i) => fm.add(ctl(screen, n, i * 40, 200, { group: tabs })));
    fm.add(ctl(screen, 'beside', 140, 200));
    fm.focusFirst();
    fm.next();
    fm.next();
    expect(name(fm)).toBe('t1');
    fm.move('right');
    fm.move('right');
    expect(name(fm)).toBe('t3');
    // the group's end: arrows stay in the group even with another control beyond it
    fm.move('right');
    expect(name(fm)).toBe('t3');
    // Tab leaves the group; Shift+Tab comes back to its first member
    fm.next();
    expect(name(fm)).toBe('beside');
    fm.prev();
    expect(name(fm)).toBe('t1');
    fm.prev();
    expect(name(fm)).toBe('top');
    // up from the group leaves it (nothing of the group lies that way)
    fm.next();
    fm.move('up');
    expect(name(fm)).toBe('top');
  });

  it('a stepper or a segmented control takes Left/Right itself (onAdjust)', () => {
    const fm = setup();
    let v = 0;
    const s = ctl(screen, 'stepper', 0, 0);
    s.onAdjust = (d) => (d === 'left' ? (v--, true) : d === 'right' ? (v++, true) : false);
    fm.add(s);
    fm.add(ctl(screen, 'below', 0, 40));
    fm.add(ctl(screen, 'beside', 60, 0));
    fm.next();
    fm.move('right');
    fm.move('right');
    fm.move('left');
    expect(v).toBe(1);
    expect(name(fm)).toBe('stepper');
    fm.move('down');
    expect(name(fm)).toBe('below');
  });

  it('a "follow" group (segmented control) selects as focus moves, skipping locked segments', () => {
    const fm = setup();
    const seg = { follow: true };
    const a = ctl(screen, 'a', 0, 0, { group: seg });
    const locked = ctl(screen, 'locked', 40, 0, { group: seg, off: true });
    const c = ctl(screen, 'c', 80, 0, { group: seg });
    [a, locked, c].forEach((x) => fm.add(x));
    fm.next();
    fm.move('right');
    expect(name(fm)).toBe('c');
    expect(c.taps).toBe(1);
    expect(locked.taps).toBe(0);
  });
});

describe('FocusManager: scopes, trap and restore', () => {
  it('Tab and arrows never leave the top layer', () => {
    const sheet = {};
    const fm = setup();
    fm.add(ctl(screen, 'under', 0, 0));
    fm.setStack([screen, sheet]);
    fm.add(ctl(sheet, 's1', 0, 100));
    fm.add(ctl(sheet, 's2', 0, 130));
    const seen = new Set<string | null>();
    for (let i = 0; i < 6; i++) {
      fm.next();
      seen.add(name(fm));
      fm.move('up');
      seen.add(name(fm));
    }
    expect([...seen].sort()).toEqual(['s1', 's2']);
  });

  it('closing a layer returns focus to the control that opened it, or the default if it is gone', () => {
    const sheet = {};
    const fm = setup();
    fm.add(ctl(screen, 'a', 0, 0));
    const opener = ctl(screen, 'opener', 0, 30);
    const offOpener = fm.add(opener);
    fm.pointerFocus(opener);
    fm.setStack([screen, sheet]);
    fm.add(ctl(sheet, 'inside', 0, 100));
    expect(name(fm)).toBe('inside');
    fm.setStack([screen]);
    expect(name(fm)).toBe('opener');
    // again, but the opener is gone when the layer closes
    fm.setStack([screen, sheet]);
    offOpener();
    fm.setStack([screen]);
    expect(name(fm)).toBe('a');
  });

  it('a layer opened again starts from its default, not where it was left', () => {
    const sheet = {};
    const fm = setup([screen, sheet]);
    fm.add(ctl(sheet, 'first', 0, 0));
    const second = ctl(sheet, 'second', 0, 30);
    fm.add(second);
    fm.pointerFocus(second);
    fm.setStack([screen]);
    fm.setStack([screen, sheet]);
    expect(name(fm)).toBe('first');
  });

  it('a rebuilt screen finds the focused control again by its key (a hub tab switch)', () => {
    const fm = setup();
    fm.add(ctl(screen, 'a', 0, 0, { key: 'a' }));
    const tab = ctl(screen, 'tab', 0, 200, { key: 'tab.duels' });
    const off = fm.add(tab);
    fm.pointerFocus(tab);
    off();
    fm.add(ctl(screen, 'tab again', 0, 200, { key: 'tab.duels' }));
    expect(name(fm)).toBe('tab again');
  });

  it('a control in a lower scope cannot take focus by a click', () => {
    const sheet = {};
    const fm = setup([screen, sheet]);
    const under = ctl(screen, 'under', 0, 0);
    fm.add(under);
    fm.add(ctl(sheet, 'in', 0, 50));
    fm.pointerFocus(under);
    expect(name(fm)).toBe('in');
  });
});

describe('FocusManager: groups remember their current member', () => {
  it('Tab into a tab bar lands on the selected tab', () => {
    const fm = setup();
    const bar = {};
    fm.add(ctl(screen, 'top', 0, 0));
    const tabs = ['a', 'b', 'c'].map((n, i) => ctl(screen, n, i * 40, 200, { group: bar }));
    tabs[1].current = () => true;
    tabs.forEach((x) => fm.add(x));
    fm.next();
    fm.next();
    expect(name(fm)).toBe('b');
  });
});

describe('the focus context and Esc (V6-052)', () => {
  const key = (code: string): KeyInput => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, editable: false, composing: false });

  it('with a control focused, the arrows, Enter and Space act on it before the battle pans, fights or pauses', () => {
    const deploy = ['battle.deploy', 'battle', 'camera'] as const;
    const fight = ['battle.fight', 'battle', 'camera'] as const;
    const r = new KeyRouter();
    const got: string[] = [];
    for (const a of ['focus.up', 'cam.pan.up', 'activate', 'deploy.fight', 'time.pause'] as const) r.on(a, () => void got.push(a));
    const press = (code: string) => (r.down(key(code)), r.up(key(code)));
    r.setContexts(activeContexts(deploy, 0, false));
    press('ArrowUp');
    press('Enter');
    r.setContexts(activeContexts(fight, 0, false));
    press('Space');
    expect(got).toEqual(['cam.pan.up', 'deploy.fight', 'time.pause']);
    got.length = 0;
    r.setContexts(activeContexts(deploy, 0, true));
    press('ArrowUp');
    press('Enter');
    r.setContexts(activeContexts(fight, 0, true));
    press('Space');
    expect(got).toEqual(['focus.up', 'activate', 'activate']);
  });

  it('a `first` handler is tried before the others: Esc leaves HUD focus before the battle opens its menu', () => {
    const r = new KeyRouter();
    r.setContexts(['menu', 'global']);
    const got: string[] = [];
    let hudFocused = true;
    r.on('back', () => void got.push('nav.back'));
    r.on('back', () => (hudFocused = false, got.push('leave HUD')) && true, undefined, { first: true });
    r.on('back', () => void got.push('battle menu'));
    r.down(key('Escape'));
    expect(got).toEqual(['leave HUD']);
    expect(hudFocused).toBe(false);
  });
});

describe('Kit overlays: Tab stays inside every overlay kind (ADR-0012 risk: scopes drift from the NavStack)', () => {
  /** A container or control: what scopeOf walks (Phaser's parentContainer). */
  const node = (parent: Nested | null, name = ''): Nested & { name: string } => ({ parentContainer: parent, name });

  /** One fixture: a screen with its controls, and the real NavStack the overlays register with (as navLayer does). */
  function world() {
    const nav = new NavStack({ setBack: () => {}, setSettings: () => {}, setClosingConfirmation: () => {}, feedback: () => {} });
    const fm = new FocusManager();
    const layers = new Set<object>();
    const scene = { name: 'scene' };
    const ui = node(null, 'ui');
    nav.register(scene, {});
    const sync = () => {
      nav.layerKeys().forEach((k) => layers.add(k));
      fm.setStack(scopeStack(nav.topOwner(), nav.layerKeys(), layers));
    };
    nav.subscribe(sync);
    sync();
    let y = 0;
    /** A control under `parent` (the kit's scopeOf: the outermost layer above it, else the scene). */
    const control = (parent: Nested, name: string, o: { role?: FocusRole } = {}) => {
      const n = node(parent, name);
      const c = ctl({}, name, 10, (y += 30), o);
      c.scope = () => outermostLayer(n, layers) ?? scene;
      fm.add(c);
      return c;
    };
    /** navLayer(container, close): the layer is removed when the overlay closes. */
    const layer = (container: object) => {
      let remove = () => {};
      remove = nav.pushLayer(() => remove(), scene, container);
      return remove;
    };
    return { nav, fm, ui, control, layer };
  }

  /** Tab and every arrow, many times: every control focused belongs to `inside`. */
  function walk(fm: FocusManager): string[] {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      for (const step of [() => fm.next(), () => fm.prev(), () => fm.move('down'), () => fm.move('up'), () => fm.move('left'), () => fm.move('right')]) {
        step();
        const n = name(fm);
        if (n) seen.add(n);
      }
    }
    return [...seen].sort();
  }

  const KINDS: { kind: string; build: (w: ReturnType<typeof world>) => { inside: string[]; close: () => void } }[] = [
    {
      kind: 'sheet (ParchmentSheet / openModal)',
      build: ({ ui, control, layer }) => {
        const c = node(ui, 'sheet');
        const box = node(c, 'box');
        control(box, 'sheet.close');
        control(c, 'sheet.ok', { role: 'primary' });
        return { inside: ['sheet.close', 'sheet.ok'], close: layer(c) };
      },
    },
    {
      kind: 'sheet with a Back guard (event card, assault, encounter)',
      build: ({ ui, control, layer }) => {
        const c = node(ui, 'sheet');
        const off = layer(c);
        const guard = node(c, 'guard');
        const offGuard = layer(guard);
        control(c, 'choice.a');
        control(c, 'choice.b');
        return { inside: ['choice.a', 'choice.b'], close: () => (offGuard(), off()) };
      },
    },
    {
      kind: 'destructive confirm over a sheet',
      build: ({ ui, control, layer }) => {
        const sheet = node(ui, 'sheet');
        const offSheet = layer(sheet);
        control(sheet, 'under.sheet');
        const c = node(ui, 'confirm');
        const off = layer(c);
        control(c, 'cancel');
        control(c, 'scrap', { role: 'danger' });
        return { inside: ['cancel', 'scrap'], close: () => (off(), offSheet()) };
      },
    },
    {
      kind: 'modal side panel (SidePanel)',
      build: ({ ui, control, layer }) => {
        const c = node(ui, 'panel');
        control(node(c, 'body'), 'panel.row');
        return { inside: ['panel.row'], close: layer(c) };
      },
    },
    {
      kind: 'bottom panel (the container is the layer)',
      build: ({ ui, control, layer }) => {
        const panel = node(ui, 'bottom');
        control(panel, 'bottom.a');
        control(panel, 'bottom.b');
        return { inside: ['bottom.a', 'bottom.b'], close: layer(panel) };
      },
    },
    {
      kind: 'scene modal (BaseScene.modalLayer, the army picker root)',
      build: ({ ui, control, layer }) => {
        const root = node(ui, 'modal');
        control(node(node(root, 'list'), 'row'), 'pick.1');
        return { inside: ['pick.1'], close: layer(root) };
      },
    },
  ];

  for (const { kind, build } of KINDS)
    it(`${kind}: Tab and arrows stay inside; Esc returns focus to the opener`, () => {
      const w = world();
      w.control(w.ui, 'screen.a');
      const opener = w.control(w.ui, 'screen.opener');
      w.control(w.ui, 'screen.b');
      w.fm.pointerFocus(opener);
      const { inside, close } = build(w);
      expect(walk(w.fm)).toEqual([...inside].sort());
      close();
      expect(name(w.fm)).toBe('screen.opener');
    });

  it('the DOM text prompt (a layer with no canvas controls): Tab finds nothing, so the browser keeps it', () => {
    const w = world();
    w.control(w.ui, 'screen.a');
    const close = w.layer({ once: () => {} });
    expect(w.fm.next()).toBe(false);
    expect(w.fm.focused).toBeNull();
    close();
    expect(name(w.fm)).toBe('screen.a');
  });
});
