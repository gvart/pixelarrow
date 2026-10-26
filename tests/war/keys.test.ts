/**
 * The war's key bindings (src/war/input): the router resolves keys by the page's contexts, a rebound key drives the
 * action in a real handler (the region's selection, src/war/view/select.ts), and the map survives storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_IDS, ACTIONS, overlaps } from '../../src/war/input/actions';
import { assign, conflictsWith, defaultBindings, parse, serialize, type KeyEvent } from '../../src/war/input/bindings';
import { keys } from '../../src/war/input/keys';

const ev = (code: string, o: Partial<KeyEvent> = {}): KeyEvent & { preventDefault(): void; repeat: boolean; target: null } =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o, preventDefault: () => undefined, repeat: false, target: null });
const REGION = ['region', 'camera', 'global'] as const, BUILD = ['build', ...REGION] as const;

afterEach(() => {
  keys.set(defaultBindings());
  keys.suspend(false);
});

describe('war bindings', () => {
  it('the defaults hold no conflict among contexts that are live together', () => {
    for (const a of ACTION_IDS)
      for (const b of defaultBindings()[a]) if (b) expect(conflictsWith(defaultBindings(), a, b), `${a} ${b.code}`).toBeNull();
    expect(overlaps('build', 'region')).toBe(false);
    expect(ACTIONS.back.rebindable).toBe(false);
  });

  it('resolves by context: build mode keys win over the region\'s, the world map has its own', () => {
    keys.setContexts(() => REGION);
    expect(keys.act(ev('KeyF'))).toBe('order.active');
    expect(keys.act(ev('KeyR'))).toBe('panel.roster');
    expect(keys.act(ev('Digit3', { altKey: true }))).toBe('form.wedge');
    expect(keys.act(ev('Digit3', { ctrlKey: true }))).toBe('group.set.3');
    expect(keys.act(ev('Digit3'))).toBe('group.3');
    expect(keys.act(ev('KeyW', { shiftKey: true }))).toBe('go.world');
    expect(keys.act(ev('Escape'))).toBe('back');
    keys.setContexts(() => BUILD);
    expect(keys.act(ev('KeyF'))).toBe('build.flip');
    expect(keys.act(ev('KeyR'))).toBe('build.rotate');
    expect(keys.act(ev('KeyB'))).toBe('build.mode');
    keys.setContexts(() => ['world', 'global']);
    expect(keys.act(ev('KeyF'))).toBe('world.fit');
    expect(keys.act(ev('KeyB'))).toBeNull();
  });

  it('a rebound key drives the action; the old key no longer does; a taken key swaps', () => {
    keys.setContexts(() => REGION);
    keys.set(assign(keys.map, 'order.hold', 0, { code: 'KeyJ' }, 'swap'));
    expect(keys.act(ev('KeyJ'))).toBe('order.hold');
    expect(keys.act(ev('KeyH'))).toBeNull();
    expect(keys.label('order.hold')).toBe('J');
    // F belongs to the squad active: binding it to hold hands the active hold's old key (J)
    keys.set(assign(keys.map, 'order.hold', 0, { code: 'KeyF' }, 'swap'));
    expect(keys.act(ev('KeyF'))).toBe('order.hold');
    expect(keys.act(ev('KeyJ'))).toBe('order.active');
    // build mode's F (flip) is another context: untouched
    keys.setContexts(() => BUILD);
    expect(keys.act(ev('KeyF'))).toBe('build.flip');
  });

  it('nothing runs while a capture waits for a key, nor for keys typed into a field', () => {
    keys.setContexts(() => REGION);
    keys.suspend(true);
    expect(keys.act(ev('KeyH'))).toBeNull();
    keys.suspend(false);
    expect(keys.act({ ...ev('KeyH'), target: { tagName: 'INPUT' } as unknown as null })).toBeNull();
    expect(keys.act(ev('KeyH'))).toBe('order.hold');
  });

  it('the stored map keeps only the changes and reads back the same', () => {
    const m = assign(assign(defaultBindings(), 'form.line', 0, { code: 'KeyZ' }, 'swap'), 'cam.up', 1, null, 'swap');
    const json = serialize(m);
    expect(JSON.parse(json).o).toEqual({ 'form.line': [{ code: 'KeyZ' }, null], 'cam.up': [{ code: 'KeyW' }, null] });
    expect(parse(json)).toEqual(m);
    expect(parse('{"v":1,"o":{"back":[{"code":"KeyQ"},null]}}').back).toEqual(defaultBindings().back);
  });
});

describe('a rebound key in the region\'s selection handler', () => {
  it('Alt+3 rebound to J orders the wedge; Ctrl+2 rebound to Ctrl+K stores group 2', async () => {
    let handler: ((e: KeyboardEvent) => void) | null = null;
    vi.stubGlobal('window', { addEventListener: (_t: string, f: (e: KeyboardEvent) => void) => (handler = f) });
    const { Selection } = await import('../../src/war/view/select');
    const orders: unknown[] = [];
    const scene = {
      sim: { address: null as unknown, order: (o: unknown) => orders.push(o), cur: { units: [] } },
      build: { tool: null, active: false }, interact: { open: false }, siege: { armed: null }, selected: new Set<number>(), focus: () => undefined,
    };
    const sel = new Selection(scene as never);
    const men = [1, 2, 3].map((id) => ({ team: 0, x: id, y: 0, u: { id, squad: 7, state: 'idle', cls: 'hoplite' } }));
    sel.sync(men as never);
    sel.set([1, 2, 3]);
    keys.setContexts(() => REGION);
    keys.set(assign(keys.map, 'form.wedge', 0, { code: 'KeyJ' }, 'swap'));
    keys.set(assign(keys.map, 'group.set.2', 0, { code: 'KeyK', mod: true }, 'swap'));

    handler!(ev('KeyJ') as unknown as KeyboardEvent);
    expect(orders).toEqual([{ kind: 'formation', squad: 7, shape: 'wedge' }]);
    handler!(ev('Digit3', { altKey: true }) as unknown as KeyboardEvent);
    expect(orders).toHaveLength(1);

    handler!(ev('KeyK', { ctrlKey: true }) as unknown as KeyboardEvent);
    expect(sel.groups.get(2)).toEqual([1, 2, 3]);
    handler!(ev('Digit2', { ctrlKey: true }) as unknown as KeyboardEvent);
    expect(sel.groups.size).toBe(1);
    vi.unstubAllGlobals();
  });
});
