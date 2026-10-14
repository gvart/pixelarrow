/**
 * Key labels and glyphs (design/ux/input-v6.md §6, ADR-0012 Decision 6): what a binding reads as on
 * the player's keyboard. Pure apart from the two platform answers it keeps once loaded:
 *
 * - printable keys take the layout's character (InputHints.keyLabels: "Й" for KeyQ on a Russian
 *   layout in Chromium), else the US label; named keys a short, localized name;
 * - the shortcut modifier is "Cmd" (⌘) or "Ctrl" by InputHints.commandKey(), never by game code reading
 *   the client platform (ARCH_REVIEW C-08);
 * - an action's key is its current primary binding in the router, so a rebound key shows at once.
 */
import type { InputHints } from '../../platform/core/input';
import { t } from '../../i18n';
import type { ActionId } from './actions';
import type { Binding, BindingMap } from './bindings';
import { keys } from './keys';

/** The platform's answers labels are made with. */
export interface Glyphs {
  /** KeyboardEvent.code → the layout's character; null: the US table. */
  layout: ReadonlyMap<string, string> | null;
  cmd: 'ctrl' | 'meta';
}

/** Keys the layout map labels (printable); their US labels. */
const PRINTABLE: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '\\',
};
const NAMED: Record<string, string> = {
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  CapsLock: 'Caps',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
};

/** The label of one key code: the layout's character for printable keys, else a short name. */
function codeLabel(code: string, layout: ReadonlyMap<string, string> | null): string {
  if (code === 'Space') return t('controls.key.space');
  if (code === 'Enter') return t('controls.key.enter');
  const printable = /^Key[A-Z]$/.test(code) || /^Digit\d$/.test(code) || code in PRINTABLE;
  const fromLayout = printable ? layout?.get(code) : undefined;
  if (fromLayout && fromLayout.trim()) return fromLayout.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return PRINTABLE[code] ?? NAMED[code] ?? code;
}

/**
 * A binding's label (§6.2): the layout's character (upper-cased) where the browser has a layout map,
 * else the US label. Chords read "Ctrl+Z", or "Cmd+Z" where the platform's shortcut modifier is ⌘
 * (spelled out: the bundled UI font has no ⌘ ⌥ ⇧ glyphs; Alt is "Option" there).
 */
export function keyLabel(b: Binding, layout: ReadonlyMap<string, string> | null, cmd: Glyphs['cmd'] = 'ctrl'): string {
  const mac = cmd === 'meta';
  return `${b.mod ? (mac ? 'Cmd+' : 'Ctrl+') : ''}${b.alt ? (mac ? 'Option+' : 'Alt+') : ''}${b.shift ? 'Shift+' : ''}${codeLabel(b.code, layout)}`;
}

/** The label of `id`'s primary binding (its secondary when the primary is empty); null when it has no key. */
export function primaryLabel(map: BindingMap, id: ActionId, g: Glyphs): string | null {
  const b = map[id][0] ?? map[id][1];
  return b ? keyLabel(b, g.layout, g.cmd) : null;
}

/** A tooltip or label with its key appended (§6.1: "Charge (W)" in every locale). */
export function withKey(text: string, key: string | null): string {
  return key ? `${text} (${key})` : text;
}

/** A keycap shows only with a keyboard and Show key hints on; at phone sizes not on a control narrower than 32 UI px (§6.1). */
export function capShown(o: { keyboard: boolean; hints: boolean; w: number; phone: boolean }): boolean {
  return o.keyboard && o.hints && (!o.phone || o.w >= 32);
}

// ------------------------------------------------------------------ the platform's answers, once

const now: Glyphs = { layout: null, cmd: 'ctrl' };

/** Read the layout map and the shortcut modifier from the platform (main.ts at start; again is harmless). */
export async function loadGlyphs(input: Pick<InputHints, 'keyLabels' | 'commandKey'>): Promise<void> {
  now.cmd = input.commandKey();
  now.layout = await input.keyLabels();
}

/** The labels as loaded now. */
export function glyphs(): Glyphs {
  return now;
}

/** A binding's label on this device. */
export function bindingLabel(b: Binding): string {
  return keyLabel(b, now.layout, now.cmd);
}

/** `id`'s key on this device, from the live bindings ("" when it has none). */
export function actionKey(id: ActionId): string {
  return primaryLabel(keys.bindings, id, now) ?? '';
}
