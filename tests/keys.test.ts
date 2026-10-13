/**
 * V6-INP-02: the KeyRouter (ADR-0012 Decision 3), pure: no DOM, no Phaser.
 */
import { describe, expect, it } from 'vitest';
import { assign, defaultBindings } from '../src/ui/input/bindings';
import type { Context } from '../src/ui/input/actions';
import { KeyRouter, activeContexts, type KeyInput } from '../src/ui/input/keys';
import { installKeySource, toKeyInput } from '../src/ui/input/keySource';

/** A plain key event as keySource builds it from a DOM KeyboardEvent. */
function key(code: string, o: Partial<KeyInput> = {}): KeyInput {
  return { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, editable: false, composing: false, ...o };
}

/** A scene-like owner whose shutdown the test fires. */
function owner() {
  const fns: (() => void)[] = [];
  return { once: (_ev: 'shutdown', fn: () => void) => fns.push(fn), shutdown: () => fns.splice(0).forEach((f) => f()) };
}

const BATTLE = ['battle.fight', 'battle', 'camera', 'menu', 'global'] as const;

function battleRouter(): KeyRouter {
  const r = new KeyRouter();
  r.setContexts(BATTLE);
  return r;
}

describe('KeyRouter', () => {
  it('a bound key in an active context calls its handler and reports it handled', () => {
    const r = battleRouter();
    let n = 0;
    r.on('order.charge', () => n++);
    expect(r.down(key('KeyW'))).toBe(true);
    expect(n).toBe(1);
  });

  it('press ignores auto-repeat; repeat actions take it', () => {
    const r = battleRouter();
    let n = 0;
    r.on('order.charge', () => n++);
    r.down(key('KeyW'));
    expect(r.down(key('KeyW', { repeat: true }))).toBe(true);
    expect(n).toBe(1);
    const m = new KeyRouter();
    m.setContexts(['focus', 'menu', 'global']);
    let down = 0;
    m.on('focus.down', () => down++);
    m.down(key('ArrowDown'));
    m.down(key('ArrowDown', { repeat: true }));
    expect(down).toBe(2);
  });

  it('hold tracks down and up, and clears on blur', () => {
    const r = battleRouter();
    let n = 0;
    r.on('cam.pan.left', () => n++);
    expect(r.held('cam.pan.left')).toBe(false);
    r.down(key('ArrowLeft'));
    r.down(key('ArrowLeft', { repeat: true }));
    expect(n).toBe(1);
    expect(r.held('cam.pan.left')).toBe(true);
    r.up(key('ArrowLeft'));
    expect(r.held('cam.pan.left')).toBe(false);
    r.down(key('ArrowLeft'));
    r.clear();
    expect(r.held('cam.pan.left')).toBe(false);
  });

  it('a hold lets go when its context goes (a sheet opens over the field)', () => {
    const r = battleRouter();
    r.on('cam.pan.up', () => {});
    r.down(key('ArrowUp'));
    r.setContexts(['menu', 'global']);
    expect(r.held('cam.pan.up')).toBe(false);
  });

  it('editable and composing events are ignored', () => {
    const r = battleRouter();
    let n = 0;
    r.on('order.charge', () => n++);
    expect(r.down(key('KeyW', { editable: true }))).toBe(false);
    expect(r.down(key('KeyW', { composing: true }))).toBe(false);
    expect(n).toBe(0);
  });

  it('only handled keys report true: unbound, inactive or without a handler', () => {
    const r = battleRouter();
    r.on('order.charge', () => {});
    expect(r.down(key('KeyK'))).toBe(false);
    expect(r.down(key('KeyE'))).toBe(false);
    r.setContexts(['menu', 'global']);
    expect(r.down(key('KeyW'))).toBe(false);
  });

  it('a handler returning false passes the key to the one before it, and false from all is unhandled', () => {
    const r = battleRouter();
    const log: string[] = [];
    let atRoot = false;
    r.on('back', () => (log.push('nav'), !atRoot));
    let field = true;
    r.on('back', () => (field ? (log.push('menu'), undefined) : false));
    expect(r.down(key('Escape'))).toBe(true);
    field = false;
    expect(r.down(key('Escape'))).toBe(true);
    atRoot = true;
    expect(r.down(key('Escape'))).toBe(false);
    expect(log).toEqual(['menu', 'nav', 'nav']);
  });

  it('the most specific context wins: Enter fights in the deployment field', () => {
    const r = new KeyRouter();
    r.setContexts(['battle.deploy', 'battle', 'camera', 'menu', 'global']);
    let fight = 0;
    r.on('deploy.fight', () => fight++);
    r.down(key('Enter'));
    expect(fight).toBe(1);
  });

  it('handlers unregister on owner shutdown', () => {
    const r = battleRouter();
    const scene = owner();
    let n = 0;
    r.on('order.charge', () => n++, scene);
    scene.shutdown();
    expect(r.down(key('KeyW'))).toBe(false);
    expect(n).toBe(0);
  });

  it('capture suspends everything', () => {
    const r = new KeyRouter();
    r.setContexts(['capture', ...BATTLE]);
    let n = 0;
    r.on('back', () => n++);
    r.on('order.charge', () => n++);
    expect(r.down(key('Escape'))).toBe(false);
    expect(r.down(key('KeyW'))).toBe(false);
    expect(n).toBe(0);
  });

  it('follows rebinding: a moved key fires the action at its new place', () => {
    const r = battleRouter();
    let n = 0;
    r.on('order.charge', () => n++);
    r.setBindings(assign(defaultBindings(), 'order.charge', 0, { code: 'KeyK' }, 'replace'));
    expect(r.down(key('KeyW'))).toBe(false);
    r.down(key('KeyK'));
    expect(n).toBe(1);
  });

  it('Ctrl+Z and Cmd+Z both undo', () => {
    const r = battleRouter();
    let n = 0;
    r.on('order.undo', () => n++);
    r.down(key('KeyZ', { ctrlKey: true }));
    r.down(key('KeyZ', { metaKey: true }));
    expect(n).toBe(2);
  });
});

describe('keySource: the one window listener', () => {
  /** A fake window: listeners by type, and a dispatcher. */
  function fakeWindow() {
    const ls = new Map<string, ((e: never) => void)[]>();
    const add = (t: string, f: (e: never) => void): void => void ls.set(t, [...(ls.get(t) ?? []), f]);
    const document = { visibilityState: 'visible', addEventListener: (t: string, f: () => void) => add(`doc:${t}`, f) };
    return { document, addEventListener: add, fire: (t: string, e: unknown = {}) => (ls.get(t) ?? []).forEach((f) => f(e as never)) };
  }
  function kd(code: string, o: Record<string, unknown> = {}) {
    let prevented = false;
    return {
      ev: { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 0, target: { tagName: 'CANVAS' }, preventDefault: () => (prevented = true), ...o },
      prevented: () => prevented,
    };
  }

  it('reads a DOM event: text fields and IME composition are marked', () => {
    expect(toKeyInput(kd('KeyW').ev)).toMatchObject({ code: 'KeyW', editable: false, composing: false });
    expect(toKeyInput(kd('KeyW', { target: { tagName: 'INPUT' } }).ev).editable).toBe(true);
    expect(toKeyInput(kd('KeyW', { target: { tagName: 'TEXTAREA' } }).ev).editable).toBe(true);
    expect(toKeyInput(kd('KeyW', { target: { tagName: 'DIV', isContentEditable: true } }).ev).editable).toBe(true);
    expect(toKeyInput(kd('KeyW', { keyCode: 229 }).ev).composing).toBe(true);
    expect(toKeyInput(kd('KeyW', { isComposing: true }).ev).composing).toBe(true);
  });

  it('prevents the default only for handled keys; typing in the prompt never fires a hotkey', () => {
    const w = fakeWindow();
    const r = new KeyRouter();
    let n = 0;
    r.on('order.charge', () => n++);
    installKeySource(w, r, () => BATTLE);
    const hot = kd('KeyW');
    w.fire('keydown', hot.ev);
    expect(hot.prevented()).toBe(true);
    const typed = kd('KeyW', { target: { tagName: 'INPUT' } });
    w.fire('keydown', typed.ev);
    expect(typed.prevented()).toBe(false);
    const other = kd('KeyK');
    w.fire('keydown', other.ev);
    expect(other.prevented()).toBe(false);
    expect(n).toBe(1);
  });

  it('reads the contexts at each key, and a blur or a hidden page lets go of held keys', () => {
    const w = fakeWindow();
    const r = new KeyRouter();
    r.on('cam.pan.left', () => {});
    let ctx: readonly Context[] = BATTLE;
    installKeySource(w, r, () => ctx);
    w.fire('keydown', kd('ArrowLeft').ev);
    expect(r.held('cam.pan.left')).toBe(true);
    w.fire('blur');
    expect(r.held('cam.pan.left')).toBe(false);
    w.fire('keydown', kd('ArrowLeft').ev);
    w.document.visibilityState = 'hidden';
    w.fire('doc:visibilitychange');
    expect(r.held('cam.pan.left')).toBe(false);
    w.fire('keydown', kd('ArrowLeft').ev);
    w.fire('keyup', kd('ArrowLeft').ev);
    expect(r.held('cam.pan.left')).toBe(false);
    ctx = ['menu', 'global'];
    w.fire('keydown', kd('ArrowLeft').ev);
    expect(r.held('cam.pan.left')).toBe(false);
  });
});

describe('the active contexts', () => {
  it('a screen adds its own before menu and global; an open layer suspends them', () => {
    expect(activeContexts(['battle.fight', 'battle', 'camera'], 0)).toEqual(['battle.fight', 'battle', 'camera', 'menu', 'global']);
    expect(activeContexts(['battle.fight', 'battle', 'camera'], 1)).toEqual(['menu', 'global']);
    expect(activeContexts(null, 0)).toEqual(['menu', 'global']);
  });
});
