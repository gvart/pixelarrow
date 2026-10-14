import { describe, expect, it } from 'vitest';
import { defaultBindings, assign } from '../src/ui/input/bindings';
import { actionKey, capShown, keyLabel, loadGlyphs, primaryLabel, withKey } from '../src/ui/input/glyphs';
import { setLang } from '../src/i18n';

const RU = new Map([
  ['KeyQ', 'й'],
  ['KeyW', 'ц'],
  ['KeyZ', 'я'],
]);

describe('key labels follow the layout (input-v6.md §6.2)', () => {
  it("a letter is the layout's character, upper-cased, else the US label", () => {
    expect(keyLabel({ code: 'KeyQ' }, RU)).toBe('Й');
    expect(keyLabel({ code: 'KeyQ' }, null)).toBe('Q');
    expect(keyLabel({ code: 'Digit1' }, null)).toBe('1');
    expect(keyLabel({ code: 'BracketRight' }, null)).toBe(']');
  });

  it('named keys use short labels; Space is localized; chords join with +', () => {
    setLang('ru');
    expect(keyLabel({ code: 'Space' }, null)).toBe('Пробел');
    setLang('en');
    expect(keyLabel({ code: 'Space' }, null)).toBe('Space');
    expect(keyLabel({ code: 'Numpad1' }, null)).toBe('Num 1');
    expect(keyLabel({ code: 'ArrowUp' }, null)).toBe('↑');
    expect(keyLabel({ code: 'KeyZ', mod: true }, null)).toBe('Ctrl+Z');
    expect(keyLabel({ code: 'Tab', shift: true }, null)).toBe('Shift+Tab');
  });

  // the bundled UI font has no ⌘ ⇧ ⌥ glyphs, so the Apple modifier is spelled "Cmd" (V6 decision log)
  it('the shortcut modifier reads Cmd where the platform says ⌘ (Ctrl elsewhere), never from game code', () => {
    expect(keyLabel({ code: 'KeyZ', mod: true }, null, 'meta')).toBe('Cmd+Z');
    expect(keyLabel({ code: 'KeyZ', mod: true, alt: true }, null, 'meta')).toBe('Cmd+Option+Z');
    expect(keyLabel({ code: 'KeyZ', mod: true }, RU, 'ctrl')).toBe('Ctrl+Я');
  });
});

describe("an action's key is its current primary binding (rebinding shows at once)", () => {
  it('the primary, else the secondary, else nothing', () => {
    const map = defaultBindings();
    expect(primaryLabel(map, 'order.charge', { layout: null, cmd: 'ctrl' })).toBe('W');
    expect(primaryLabel(map, 'order.charge', { layout: RU, cmd: 'ctrl' })).toBe('Ц');
    const moved = assign(map, 'order.charge', 0, { code: 'KeyK' }, 'replace');
    expect(primaryLabel(moved, 'order.charge', { layout: null, cmd: 'ctrl' })).toBe('K');
    const cleared = assign(map, 'order.charge', 0, null, 'replace');
    expect(primaryLabel(cleared, 'order.charge', { layout: null, cmd: 'ctrl' })).toBeNull();
    // unbound by default (a confirm flow, §1.1)
    expect(primaryLabel(map, 'battle.retreat', { layout: null, cmd: 'ctrl' })).toBeNull();
  });

  it('actionKey reads the live router bindings and the labels loaded from the platform', async () => {
    expect(actionKey('order.charge')).toBe('W');
    await loadGlyphs({ keyLabels: async () => RU, commandKey: () => 'meta' });
    expect(actionKey('order.charge')).toBe('Ц');
    await loadGlyphs({ keyLabels: async () => null, commandKey: () => 'ctrl' });
    expect(actionKey('order.charge')).toBe('W');
  });

  it('a tooltip appends the key in every locale: "Charge (W)"; no key, no brackets', () => {
    expect(withKey('Charge', 'W')).toBe('Charge (W)');
    expect(withKey('Атака', 'Ц')).toBe('Атака (Ц)');
    expect(withKey('Retreat', null)).toBe('Retreat');
  });
});

describe('keycaps show only with a keyboard and the hints on (§6.1)', () => {
  it('never without a keyboard (touch), never with hints off', () => {
    expect(capShown({ keyboard: false, hints: true, w: 60, phone: false })).toBe(false);
    expect(capShown({ keyboard: true, hints: false, w: 60, phone: false })).toBe(false);
    expect(capShown({ keyboard: true, hints: true, w: 60, phone: false })).toBe(true);
  });

  it('at phone sizes a control narrower than 32 UI px shows none (its tooltip still names the key)', () => {
    expect(capShown({ keyboard: true, hints: true, w: 30, phone: true })).toBe(false);
    expect(capShown({ keyboard: true, hints: true, w: 32, phone: true })).toBe(true);
    expect(capShown({ keyboard: true, hints: true, w: 30, phone: false })).toBe(true);
  });
});
