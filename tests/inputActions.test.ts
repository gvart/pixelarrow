/**
 * V6-INP-01 (ADR-0012 Decision 1): the action map is the table in
 * design/ux/input-v6.md §1.1, every action is labelled in English and Russian,
 * and the defaults never conflict, need a chord, or use a refused key.
 */
import { describe, expect, it } from 'vitest';
import { ACTIONS, ACTION_IDS, CONTEXTS, OVERLAPS, overlaps, type ActionId, type Context } from '../src/ui/input/actions';
import { refused, sameBinding, type Binding } from '../src/ui/input/bindings';
import { table } from '../src/i18n';

/** input-v6.md §1.1, primary and secondary, by KeyboardEvent.code. */
const SPEC: Record<string, string[]> = {
  back: ['Escape'],
  'focus.next': ['Tab'],
  'focus.prev': ['Shift+Tab'],
  'focus.up': ['ArrowUp'],
  'focus.down': ['ArrowDown'],
  'focus.left': ['ArrowLeft'],
  'focus.right': ['ArrowRight'],
  activate: ['Enter', 'Space'],
  'scroll.pageUp': ['PageUp'],
  'scroll.pageDown': ['PageDown'],
  'scroll.home': ['Home'],
  'scroll.end': ['End'],
  'help.keys': ['Slash', 'F1'],
  'order.advance': ['KeyQ'],
  'order.charge': ['KeyW'],
  'order.hold': ['KeyE'],
  'order.shoot': ['KeyR'],
  'order.fifth': ['KeyT'],
  'order.then': ['KeyF'],
  'order.undo': ['KeyU', 'Mod+KeyZ'],
  'turn.left': ['Comma'],
  'turn.right': ['Period'],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`group.${n}`, [`Digit${n}`, `Numpad${n}`]])),
  'ability.1': ['KeyZ'],
  'ability.2': ['KeyX'],
  'ability.3': ['KeyC'],
  'ability.more': ['KeyV'],
  'time.pause': ['Space', 'KeyP'],
  'time.faster': ['BracketRight'],
  'time.slower': ['BracketLeft'],
  'cam.pan.up': ['ArrowUp'],
  'cam.pan.down': ['ArrowDown'],
  'cam.pan.left': ['ArrowLeft'],
  'cam.pan.right': ['ArrowRight'],
  'cam.zoom.in': ['Equal', 'NumpadAdd'],
  'cam.zoom.out': ['Minus', 'NumpadSubtract'],
  'cam.follow': ['KeyG'],
  'menu.battle': ['KeyM'],
  'deploy.fight': ['Enter'],
  'deploy.shape': ['KeyS'],
  'deploy.groups': ['KeyA'],
  'deploy.works': ['KeyB'],
  'deploy.inspect': ['KeyI'],
  // menu-only destructive flows: listed, rebindable, no default key (§1.1)
  'deploy.resetAll': [],
  'deploy.leave': [],
  'battle.retreat': [],
  'hero.dismiss': [],
};

function show(b: Binding): string {
  return [b.mod && 'Mod', b.alt && 'Alt', b.shift && 'Shift', b.code].filter(Boolean).join('+');
}

describe('ACTIONS (input-v6.md §1.1)', () => {
  it('matches the spec table, binding for binding', () => {
    const got = Object.fromEntries(ACTION_IDS.map((id) => [id, ACTIONS[id].defaults.map(show)]));
    expect(got).toEqual(SPEC);
  });

  it('is keyed by its own ids', () => {
    for (const id of ACTION_IDS) expect(ACTIONS[id].id).toBe(id);
    expect(Object.keys(ACTIONS).sort()).toEqual([...ACTION_IDS].sort());
  });

  it('every action has a label in English and Russian, a valid context and at most two defaults', () => {
    const en = table('en') as Record<string, unknown>;
    const ru = table('ru') as Record<string, unknown>;
    for (const id of ACTION_IDS) {
      const a = ACTIONS[id];
      expect(typeof en[a.label], `${id} en`).toBe('string');
      expect(typeof ru[a.label], `${id} ru`).toBe('string');
      expect(CONTEXTS).toContain(a.context);
      expect(a.defaults.length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps Esc, Tab, Enter/Space on focus and the menu keys fixed (§5.4)', () => {
    const fixed = ACTION_IDS.filter((id) => !ACTIONS[id].rebindable);
    expect(fixed.sort()).toEqual(['activate', 'back', 'focus.down', 'focus.left', 'focus.next', 'focus.prev', 'focus.right', 'focus.up', 'help.keys', 'scroll.end', 'scroll.home', 'scroll.pageDown', 'scroll.pageUp']);
  });

  it('only camera pans hold; nothing else does (§1, §9)', () => {
    expect(ACTION_IDS.filter((id) => ACTIONS[id].kind === 'hold')).toEqual(['cam.pan.up', 'cam.pan.down', 'cam.pan.left', 'cam.pan.right']);
    expect(ACTION_IDS.filter((id) => ACTIONS[id].kind === 'repeat').every((id) => id.startsWith('focus.') || id.startsWith('scroll.'))).toBe(true);
  });
});

describe('OVERLAPS', () => {
  it('is symmetric and reflexive (except capture, which suspends everything)', () => {
    for (const a of CONTEXTS) {
      if (a !== 'capture') expect(overlaps(a, a), a).toBe(true);
      for (const b of CONTEXTS) expect(overlaps(a, b), `${a}/${b}`).toBe(overlaps(b, a));
    }
    expect(OVERLAPS.capture).toEqual([]);
  });

  it('follows §5.3: global and menu with everything, battle with its phases, map with menu', () => {
    const live = CONTEXTS.filter((c) => c !== 'capture');
    for (const c of live) {
      expect(overlaps('global', c)).toBe(true);
      expect(overlaps('menu', c)).toBe(true);
    }
    expect(overlaps('battle', 'battle.deploy')).toBe(true);
    expect(overlaps('battle', 'battle.fight')).toBe(true);
    expect(overlaps('battle.deploy', 'battle.fight')).toBe(false);
    expect(overlaps('map', 'battle.deploy')).toBe(false); // S may be both Shape and a map key
    // §5.4: focus keys (Enter, Space, arrows) are live only while a control has focus
    expect(overlaps('focus', 'battle.fight')).toBe(false);
    expect(overlaps('focus', 'camera')).toBe(false);
    // the camera keys work on the battlefield and on maps
    for (const c of ['map', 'battle', 'battle.deploy', 'battle.fight'] as Context[]) expect(overlaps('camera', c)).toBe(true);
  });
});

describe('defaults', () => {
  const pairs: { id: ActionId; b: Binding }[] = ACTION_IDS.flatMap((id) => ACTIONS[id].defaults.map((b) => ({ id, b })));

  it('no two defaults conflict in overlapping contexts', () => {
    const clashes: string[] = [];
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++) {
        const p = pairs[i];
        const q = pairs[j];
        if (sameBinding(p.b, q.b) && overlaps(ACTIONS[p.id].context, ACTIONS[q.id].context)) clashes.push(`${p.id} / ${q.id}: ${show(p.b)}`);
      }
    expect(clashes).toEqual([]);
  });

  it('no default is modifier-only, and no rebindable default is refused', () => {
    for (const { id, b } of pairs) {
      expect(refused(b), `${id} ${show(b)}`).not.toBe('modifier');
      if (ACTIONS[id].rebindable) expect(refused(b), `${id} ${show(b)}`).toBeNull();
    }
  });

  it('every action with a default has a single-key one: no chord is ever needed (§9)', () => {
    for (const id of ACTION_IDS) {
      const d = ACTIONS[id].defaults;
      if (d.length === 0 || id === 'focus.prev') continue; // Shift+Tab is the fixed web convention
      expect(
        d.some((b) => !b.mod && !b.alt && !b.shift),
        id,
      ).toBe(true);
    }
  });
});
