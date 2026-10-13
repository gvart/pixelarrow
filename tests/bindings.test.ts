/**
 * V6-INP-01 (ADR-0012 Decision 2): pure bindings. Resolving a key in the active
 * contexts, conflicts by OVERLAPS, swap and replace, refused keys, resets, and
 * per-device storage of the differences from the defaults (input-v6.md §5).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_IDS } from '../src/ui/input/actions';
import { assign, conflictsWith, defaultBindings, parse, refused, resetAction, resetAll, resolve, serialize, type Binding, type KeyEvent } from '../src/ui/input/bindings';
import { BINDINGS_KEY, loadBindings, saveBindings } from '../src/ui/input/bindingStore';
import { setPlatformForTests } from '../src/platform';
import { FakePlatform, memoryKV } from './fakes/platform';

const key = (code: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const FIELD = ['battle.fight', 'battle', 'camera', 'menu', 'global'] as const;
const DEPLOY = ['battle.deploy', 'battle', 'camera', 'menu', 'global'] as const;
const HUD_FOCUS = ['focus', 'battle.fight', 'battle', 'menu', 'global'] as const;
const K = (code: string): Binding => ({ code });

describe('resolve', () => {
  const map = defaultBindings();

  it('finds the action of a key in the active contexts', () => {
    expect(resolve(map, key('KeyW'), FIELD)).toBe('order.charge');
    expect(resolve(map, key('Numpad3'), FIELD)).toBe('group.3');
    expect(resolve(map, key('Escape'), FIELD)).toBe('back');
  });

  it('ignores actions whose context is not active', () => {
    expect(resolve(map, key('KeyW'), DEPLOY)).toBeNull();
    expect(resolve(map, key('KeyA'), FIELD)).toBeNull();
    expect(resolve(map, key('KeyW'), ['menu', 'global'])).toBeNull();
    expect(resolve(map, key('KeyW'), ['capture'])).toBeNull();
  });

  it('gives the same key to the most specific active context first', () => {
    expect(resolve(map, key('Space'), FIELD)).toBe('time.pause');
    expect(resolve(map, key('Space'), HUD_FOCUS)).toBe('activate');
    expect(resolve(map, key('Enter'), DEPLOY)).toBe('deploy.fight');
    expect(resolve(map, key('ArrowLeft'), FIELD)).toBe('cam.pan.left');
    expect(resolve(map, key('ArrowLeft'), HUD_FOCUS)).toBe('focus.left');
  });

  it('matches modifiers: Ctrl or ⌘ for mod, exact Alt, and an exact Shift binding first', () => {
    expect(resolve(map, key('KeyZ'), FIELD)).toBe('ability.1');
    expect(resolve(map, key('KeyZ', { ctrlKey: true }), FIELD)).toBe('order.undo');
    expect(resolve(map, key('KeyZ', { metaKey: true }), FIELD)).toBe('order.undo');
    expect(resolve(map, key('KeyW', { ctrlKey: true }), FIELD)).toBeNull();
    expect(resolve(map, key('KeyW', { altKey: true }), FIELD)).toBeNull();
    expect(resolve(map, key('Tab', { shiftKey: true }), FIELD)).toBe('focus.prev');
    expect(resolve(map, key('Tab'), FIELD)).toBe('focus.next');
  });

  it('lets Shift through for a binding without it: "?" is Shift+/, "+" is Shift+=', () => {
    expect(resolve(map, key('Slash', { shiftKey: true }), FIELD)).toBe('help.keys');
    expect(resolve(map, key('Equal', { shiftKey: true }), FIELD)).toBe('cam.zoom.in');
  });
});

describe('refused', () => {
  it('refuses Esc and Tab, browser shortcuts and modifiers alone', () => {
    expect(refused(K('Escape'))).toBe('reserved');
    expect(refused({ code: 'Tab', shift: true })).toBe('reserved');
    for (const code of ['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyH']) expect(refused({ code, mod: true }), code).toBe('browser');
    for (const code of ['F5', 'F11', 'F12']) expect(refused(K(code)), code).toBe('browser');
    expect(refused({ code: 'F4', alt: true })).toBe('browser');
    for (const code of ['ShiftLeft', 'ControlRight', 'AltLeft', 'MetaLeft', 'MetaRight', 'OSLeft']) expect(refused(K(code)), code).toBe('modifier');
  });

  it('accepts ordinary keys and chords', () => {
    expect(refused(K('KeyK'))).toBeNull();
    expect(refused(K('KeyW'))).toBeNull();
    expect(refused({ code: 'KeyZ', mod: true })).toBeNull();
    expect(refused(K('F4'))).toBeNull();
  });
});

describe('conflictsWith', () => {
  const map = defaultBindings();

  it('names the action that holds the key in an overlapping context', () => {
    expect(conflictsWith(map, 'order.charge', K('KeyQ'))).toBe('order.advance');
    expect(conflictsWith(map, 'deploy.shape', K('KeyW'))).toBe('order.charge'); // battle overlaps battle.fight
    expect(conflictsWith(map, 'order.charge', K('Slash'))).toBe('help.keys'); // global overlaps everything
  });

  it('ignores contexts that are never active together, and the action itself', () => {
    expect(conflictsWith(map, 'deploy.groups', K('KeyW'))).toBeNull(); // battle.deploy vs battle.fight
    expect(conflictsWith(map, 'order.charge', K('KeyW'))).toBeNull();
    expect(conflictsWith(map, 'order.charge', K('KeyK'))).toBeNull();
    expect(conflictsWith(map, 'order.charge', K('Enter'))).toBeNull(); // activate only while a control has focus (§5.4)
  });

  it('tells a chord from its plain key', () => {
    expect(conflictsWith(map, 'order.charge', { code: 'KeyZ', mod: true })).toBe('order.undo');
    expect(conflictsWith(map, 'order.charge', { code: 'KeyZ', alt: true })).toBeNull();
  });
});

describe('assign', () => {
  const map = defaultBindings();

  it('binds a free key without touching anything else', () => {
    const m = assign(map, 'order.charge', 1, K('KeyK'), 'swap');
    expect(m['order.charge']).toEqual([K('KeyW'), K('KeyK')]);
    expect(map['order.charge']).toEqual([K('KeyW'), null]); // pure
    for (const id of ACTION_IDS) if (id !== 'order.charge') expect(m[id]).toEqual(map[id]);
  });

  it('swap: the other action takes this one\'s old key in that slot', () => {
    const m = assign(map, 'order.charge', 0, K('KeyQ'), 'swap');
    expect(m['order.charge'][0]).toEqual(K('KeyQ'));
    expect(m['order.advance'][0]).toEqual(K('KeyW'));
  });

  it('replace: the other action loses the key and may be left with none', () => {
    const m = assign(map, 'order.charge', 0, K('KeyQ'), 'replace');
    expect(m['order.charge'][0]).toEqual(K('KeyQ'));
    expect(m['order.advance']).toEqual([null, null]);
  });

  it('swap with an empty slot leaves the other action without that key', () => {
    const m = assign(map, 'order.charge', 1, K('KeyQ'), 'swap');
    expect(m['order.charge']).toEqual([K('KeyW'), K('KeyQ')]);
    expect(m['order.advance']).toEqual([null, null]);
  });

  it('swap never makes a new conflict: a key the other action can\'t take is dropped instead', () => {
    // a clean swap first: zoom in takes G, Follow takes "="
    const m = assign(map, 'cam.zoom.in', 0, K('KeyG'), 'swap');
    expect(m['cam.zoom.in'][0]).toEqual(K('KeyG'));
    expect(m['cam.follow'][0]).toEqual(K('Equal'));
    // Groups (deploy) holds W, then takes S from Shape (battle): W would clash with Charge, so Shape gets nothing
    const m2 = assign(assign(map, 'deploy.groups', 0, K('KeyW'), 'swap'), 'deploy.groups', 0, K('KeyS'), 'swap');
    expect(m2['deploy.groups'][0]).toEqual(K('KeyS'));
    expect(m2['deploy.shape']).toEqual([null, null]); // W would clash with Charge in battle.fight
    expect(m2['order.charge'][0]).toEqual(K('KeyW'));
  });

  it('moving a key between an action\'s own slots swaps them', () => {
    const m = assign(map, 'order.undo', 0, { code: 'KeyZ', mod: true }, 'swap');
    expect(m['order.undo']).toEqual([{ code: 'KeyZ', mod: true }, K('KeyU')]);
  });

  it('null clears the slot', () => {
    expect(assign(map, 'order.undo', 1, null, 'swap')['order.undo']).toEqual([K('KeyU'), null]);
  });

  it('refuses refused keys, fixed actions, and keys held by a fixed action', () => {
    expect(assign(map, 'order.charge', 0, K('Escape'), 'swap')).toBe(map);
    expect(assign(map, 'order.charge', 0, { code: 'KeyW', mod: true }, 'swap')).toBe(map);
    expect(assign(map, 'back', 0, K('KeyK'), 'swap')).toBe(map);
    expect(assign(map, 'order.charge', 0, K('Slash'), 'replace')).toBe(map); // help.keys is fixed
  });

  it('may give one key to actions that are never active together', () => {
    const m = assign(map, 'deploy.groups', 0, K('KeyW'), 'replace');
    expect(m['deploy.groups'][0]).toEqual(K('KeyW'));
    expect(m['order.charge'][0]).toEqual(K('KeyW'));
  });
});

describe('resetAction and resetAll', () => {
  it('resetAction restores one action; a key it takes back leaves the action that held it', () => {
    let m = assign(defaultBindings(), 'order.advance', 0, K('KeyW'), 'replace'); // Charge loses W
    m = assign(m, 'order.hold', 1, K('KeyK'), 'swap');
    m = resetAction(m, 'order.charge');
    expect(m['order.charge']).toEqual([K('KeyW'), null]);
    expect(m['order.advance']).toEqual([null, null]);
    expect(m['order.hold']).toEqual([K('KeyE'), K('KeyK')]);
  });

  it('resetAll restores every default', () => {
    expect(resetAll()).toEqual(defaultBindings());
  });
});

describe('serialize and parse', () => {
  it('stores only the actions that differ from their defaults', () => {
    expect(JSON.parse(serialize(defaultBindings()))).toEqual({ v: 1, o: {} });
    const m = assign(assign(defaultBindings(), 'order.charge', 0, K('KeyQ'), 'swap'), 'order.undo', 1, null, 'swap');
    expect(JSON.parse(serialize(m))).toEqual({ v: 1, o: { 'order.advance': [K('KeyW'), null], 'order.charge': [K('KeyQ'), null], 'order.undo': [K('KeyU'), null] } });
  });

  it('round-trips', () => {
    let m = assign(defaultBindings(), 'order.charge', 0, K('KeyQ'), 'swap');
    m = assign(m, 'order.undo', 0, { code: 'KeyY', mod: true, shift: true }, 'replace');
    m = assign(m, 'battle.retreat', 0, K('KeyK'), 'swap');
    expect(parse(serialize(m))).toEqual(m);
  });

  it('gives the defaults for nothing, garbage or another version, without throwing', () => {
    for (const s of [null, '', 'not json', '42', 'null', '[]', '{"v":2,"o":{"order.charge":[{"code":"KeyK"},null]}}', '{"v":1}', '{"v":1,"o":[]}']) expect(parse(s), String(s)).toEqual(defaultBindings());
  });

  it('drops invalid, unknown, fixed and refused entries and keeps the rest', () => {
    const o = {
      'order.charge': [K('KeyK'), null],
      'order.hold': [{ code: 42 }, null],
      'order.shoot': 'R',
      'order.fifth': [{ code: 'KeyY', mod: 'yes' }, null],
      'order.then': [{ code: '' }, null],
      'ability.1': [{ code: 'Key<script>' }, null],
      'nope.action': [K('KeyJ'), null],
      back: [K('KeyJ'), null],
      'time.pause': [K('Escape'), null],
      'cam.follow': [{ code: 'KeyW', mod: true }, null],
      'order.undo': [K('KeyY')],
    };
    const m = parse(JSON.stringify({ v: 1, o }));
    const d = defaultBindings();
    expect(m['order.charge']).toEqual([K('KeyK'), null]);
    for (const id of ['order.hold', 'order.shoot', 'order.fifth', 'order.then', 'ability.1', 'back', 'time.pause', 'cam.follow', 'order.undo'] as const) expect(m[id], id).toEqual(d[id]);
  });

  it('drops a stored binding that conflicts now (a default changed), and that action falls back to its default', () => {
    // Shape was moved to K; then a later default gave K to Charge: simulated by storing Charge's K as an override that clashes
    const o = { 'deploy.shape': [K('KeyQ'), null] }; // Q is Advance's default, in an overlapping context
    const m = parse(JSON.stringify({ v: 1, o }));
    expect(m['deploy.shape']).toEqual(defaultBindings()['deploy.shape']);
    expect(m['order.advance']).toEqual(defaultBindings()['order.advance']);
  });

  it('keeps a stored swap: two overrides that only work together', () => {
    const m = assign(defaultBindings(), 'order.charge', 0, K('KeyQ'), 'swap');
    expect(parse(serialize(m))['order.advance']).toEqual([K('KeyW'), null]);
  });

  it('never leaves a conflict, whatever is stored', () => {
    const o = Object.fromEntries(ACTION_IDS.map((id) => [id, [K('KeyK'), K('KeyJ')]]));
    const m = parse(JSON.stringify({ v: 1, o }));
    for (const id of ACTION_IDS) for (const b of m[id]) if (b) expect(conflictsWith(m, id, b), `${id} ${b.code}`).toBeNull();
    expect(ACTION_IDS.some((id) => m[id][0]?.code === 'KeyK')).toBe(true);
  });
});

describe('bindingStore (platform.storage.device())', () => {
  let fake: FakePlatform;
  beforeEach(() => {
    fake = new FakePlatform();
    setPlatformForTests(fake);
  });

  it('saves the overrides on this device under input.bindings and loads them back', async () => {
    const m = assign(defaultBindings(), 'order.charge', 1, K('KeyK'), 'swap');
    await saveBindings(m);
    expect(fake.deviceKV.data.get(BINDINGS_KEY)).toBe(serialize(m));
    expect(fake.saveKV.data.size).toBe(0); // never in the campaign save
    expect(await loadBindings()).toEqual(m);
  });

  it('removes the key when nothing differs from the defaults', async () => {
    await saveBindings(assign(defaultBindings(), 'order.charge', 1, K('KeyK'), 'swap'));
    await saveBindings(resetAll());
    expect(fake.deviceKV.data.has(BINDINGS_KEY)).toBe(false);
  });

  it('loads the defaults when storage is empty or fails', async () => {
    expect(await loadBindings()).toEqual(defaultBindings());
    const broken = { ...memoryKV(), get: async () => Promise.reject(new Error('blocked')) };
    expect(await loadBindings(broken)).toEqual(defaultBindings());
  });

  it('every action is in the map', () => {
    expect(Object.keys(defaultBindings()).sort()).toEqual([...ACTION_IDS].sort());
    for (const id of ACTION_IDS) expect(defaultBindings()[id].filter(Boolean)).toEqual(ACTIONS[id].defaults);
  });
});
