import { describe, expect, it, vi } from 'vitest';
import { KeyRouter, type KeyInput } from '../src/ui/input/keys';

const key = (code: string, o: Partial<KeyInput> = {}): KeyInput => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, editable: false, composing: false, ...o });

describe('KeyRouter.capture: a rebinding capture sees keys before any action (input-v6.md §5.3)', () => {
  it('a key the capture takes runs no action and is handled; one it passes on reaches the action', () => {
    const r = new KeyRouter();
    r.setContexts(['battle.fight', 'battle', 'menu', 'global']);
    const charge = vi.fn();
    r.on('order.charge', charge);
    const seen: string[] = [];
    const end = r.capture((ev) => (seen.push(ev.code), ev.code !== 'Tab'));
    expect(r.down(key('KeyW'))).toBe(true);
    expect(charge).not.toHaveBeenCalled();
    const tab = vi.fn();
    r.on('focus.next', tab);
    r.down(key('Tab'));
    expect(tab).toHaveBeenCalledOnce();
    expect(seen).toEqual(['KeyW', 'Tab']);
    end();
    r.down(key('KeyW'));
    expect(charge).toHaveBeenCalledOnce();
  });

  it('typing in a text field never reaches the capture', () => {
    const r = new KeyRouter();
    const fn = vi.fn(() => true);
    r.capture(fn);
    expect(r.down(key('KeyW', { editable: true }))).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('bindings: the router exposes the map it resolves with', () => {
    const r = new KeyRouter();
    expect(r.bindings['order.charge'][0]).toEqual({ code: 'KeyW' });
  });
});

vi.mock('phaser', () => {
  class C {}
  const go = { Container: C, Image: C, Sprite: C, Text: C, BitmapText: C, Graphics: C, Rectangle: C, Zone: C, TileSprite: C, RenderTexture: C };
  return { default: { GameObjects: go, Scene: C, Geom: { Rectangle: C }, Events: { EventEmitter: C } } };
});
const { ACTIONS, ACTION_IDS } = await import('../src/ui/input/actions');
const { defaultBindings } = await import('../src/ui/input/bindings');
const { SECTIONS, captureKey, changed } = await import('../src/ui/settings/controls');

describe('the Keyboard shortcuts page lists every action once, grouped as in input-v6.md §1.1 (§5.2)', () => {
  it('each action is in exactly one section; the fixed ones only under Menus, read-only', () => {
    const all = SECTIONS.flatMap((s) => s.actions);
    expect([...all].sort()).toEqual([...ACTION_IDS].sort());
    const menus = SECTIONS.find((s) => s.label === 'controls.sec.menus')!;
    for (const id of all) expect(menus.actions.includes(id), id).toBe(!ACTIONS[id].rebindable);
  });
});

describe('capturing a key (input-v6.md §5.3)', () => {
  const map = defaultBindings();
  it('a free key is bound at once: Pause takes K in its first slot', () => {
    const r = captureKey(map, 'time.pause', 0, key('KeyK'));
    expect(r.kind).toBe('done');
    if (r.kind === 'done') expect(r.map['time.pause']).toEqual([{ code: 'KeyK' }, { code: 'KeyP' }]);
  });

  it('a modifier alone waits for a key; a chord is allowed', () => {
    expect(captureKey(map, 'order.charge', 1, key('ShiftLeft', { shiftKey: true })).kind).toBe('wait');
    const r = captureKey(map, 'order.charge', 1, key('KeyJ', { ctrlKey: true }));
    expect(r.kind === 'done' && r.map['order.charge'][1]).toEqual({ code: 'KeyJ', mod: true });
  });

  it('auto-repeat (the Enter that opened the capture, held) is ignored', () => {
    expect(captureKey(map, 'order.charge', 0, key('Enter', { repeat: true })).kind).toBe('wait');
  });

  it('Esc cancels and can never be bound', () => {
    expect(captureKey(map, 'order.charge', 0, key('Escape')).kind).toBe('cancel');
    expect(captureKey(map, 'order.charge', 0, key('Escape', { shiftKey: true })).kind).toBe('cancel');
  });

  it('Tab and browser shortcuts are refused and say why', () => {
    expect(captureKey(map, 'order.charge', 0, key('Tab'))).toEqual({ kind: 'refused', why: 'reserved', binding: { code: 'Tab' } });
    expect(captureKey(map, 'order.charge', 0, key('KeyW', { metaKey: true }))).toMatchObject({ kind: 'refused', why: 'browser' });
    expect(captureKey(map, 'order.charge', 0, key('F5'))).toMatchObject({ kind: 'refused', why: 'browser' });
  });

  it('a key a fixed action holds where both are live is refused as fixed (Enter is Activate in menus)', () => {
    expect(captureKey(map, 'hero.dismiss', 0, key('Enter'))).toMatchObject({ kind: 'refused', why: 'fixed', other: 'activate' });
  });

  it('a key another action holds is a conflict: Swap gives that action the old key, Replace leaves it without', () => {
    const r = captureKey(map, 'order.advance', 0, key('KeyW'));
    expect(r).toMatchObject({ kind: 'conflict', other: 'order.charge', leavesNone: true });
    if (r.kind !== 'conflict') return;
    expect(r.swap['order.advance'][0]).toEqual({ code: 'KeyW' });
    expect(r.swap['order.charge'][0]).toEqual({ code: 'KeyQ' });
    expect(r.replace['order.charge']).toEqual([null, null]);
  });

  it('the same key in the same slot changes nothing', () => {
    const r = captureKey(map, 'order.charge', 0, key('KeyW'));
    expect(r.kind === 'done' && r.map).toBe(map);
  });

  it('keys shared only by contexts that are never live together are no conflict (Enter: FIGHT and a battle order)', () => {
    expect(captureKey(map, 'order.charge', 1, key('Enter')).kind).toBe('done');
  });
});

describe('a row shows its reset only when it differs from the default (§5.2)', () => {
  it('changed', () => {
    const map = defaultBindings();
    expect(changed(map, 'time.pause')).toBe(false);
    const r = captureKey(map, 'time.pause', 0, key('KeyK'));
    expect(r.kind === 'done' && changed(r.map, 'time.pause')).toBe(true);
  });
});

const { settingsRows, watchRows } = await import('../src/ui/settings');

describe('the Controls section shows only with a keyboard, and appears live (input-v6.md §5.1)', () => {
  const hasControls = (rows: ReturnType<typeof settingsRows>) => rows.some((r) => r.kind === 'open' && r.what === 'controls');

  it('touch only: no Controls section; with a keyboard: Controls → Keyboard shortcuts, before Account', () => {
    expect(hasControls(settingsRows(false))).toBe(false);
    const rows = settingsRows(true);
    expect(hasControls(rows)).toBe(true);
    const at = rows.findIndex((r) => r.kind === 'section' && r.label === 'controls.sec');
    expect(rows[at + 1]).toEqual({ kind: 'open', what: 'controls', label: 'controls.title' });
    expect(rows[at + 2]).toEqual({ kind: 'section', label: 'settings.sec.account' });
  });

  it('a keyboard paired while Settings is open adds the section at once (a fake InputHints)', () => {
    let kb = false;
    const subs = new Set<() => void>();
    const hints = { keyboard: () => kb, onChange: (cb: () => void) => (subs.add(cb), () => void subs.delete(cb)) };
    const seen: boolean[] = [];
    const off = watchRows(hints, (rows) => seen.push(hasControls(rows)));
    subs.forEach((cb) => cb());
    expect(seen).toEqual([]);
    kb = true;
    subs.forEach((cb) => cb());
    expect(seen).toEqual([true]);
    off();
    expect(subs.size).toBe(0);
  });
});
