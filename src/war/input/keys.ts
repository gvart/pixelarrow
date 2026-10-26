/**
 * The war pages' key router: every war key handler asks it which action a key event means (`act`, `is`) or whether a
 * hold action is down now (`held`), so a key rebound on the controls page drives the same action everywhere.
 *
 *  - The page names its live contexts, most specific first (`setContexts`; a region: build first while build mode is
 *    on, then region, camera, global; the world map: world, global). The first context with a match wins (./bindings.ts
 *    resolve), and an exact modifier match wins over one that ignores Shift.
 *  - Keys typed into a text field, and every key while the controls page waits for one (`suspend`), mean nothing.
 *  - Hold actions read the physical keys down now (tracked on window, cleared on blur).
 */
import { ACTIONS, type ActionId, type Context } from './actions';
import { resolve, type Binding, type BindingMap, type KeyEvent } from './bindings';
import { loadBindings, saveBindings } from './bindingStore';

let map: BindingMap = loadBindings();
let contexts: () => readonly Context[] = () => ['global'];
let suspended = false;
const down = new Set<string>();
const listeners = new Set<() => void>();

if (typeof addEventListener === 'function') {
  addEventListener('keydown', (e) => down.add((e as KeyboardEvent).code), true);
  addEventListener('keyup', (e) => down.delete((e as KeyboardEvent).code), true);
  addEventListener('blur', () => down.clear());
}

const typing = (e: KeyEvent & { target?: EventTarget | null }) => {
  const t = e.target as HTMLElement | null | undefined;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true);
};

export const keys = {
  /** The bindings in force. */
  get map(): BindingMap {
    return map;
  },
  /** Use and store a new map (the controls page); listeners (key hints) refresh. */
  set(next: BindingMap): void {
    map = next;
    saveBindings(next);
    for (const f of listeners) f();
  },
  onChange(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** The page's live contexts, most specific first (read on every key). */
  setContexts(f: () => readonly Context[]): void {
    contexts = f;
  },
  /** While a capture waits for a key, no action runs. */
  suspend(on: boolean): void {
    suspended = on;
  },
  /** The action this key event means here and now, or null. */
  act(e: KeyEvent & { target?: EventTarget | null }): ActionId | null {
    if (suspended || typing(e)) return null;
    return resolve(map, e, contexts());
  },
  is(e: KeyEvent & { target?: EventTarget | null }, id: ActionId): boolean {
    return this.act(e) === id;
  },
  /** Is a key of hold action `id` down now (and its context live)? */
  held(id: ActionId): boolean {
    if (suspended || !contexts().includes(ACTIONS[id].context)) return false;
    return map[id].some((b) => !!b && down.has(b.code));
  },
  /** Forget keys down (tests; a page that hides). */
  release(): void {
    down.clear();
  },
  /** The label of `id`'s first key ("Ctrl+1"), or '' with none: for hints and tooltips. */
  label(id: ActionId): string {
    const b = map[id][0] ?? map[id][1];
    return b ? keyLabel(b) : '';
  },
};

const NAMED: Record<string, string> = {
  Escape: 'Esc', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Enter: 'Enter', Space: 'Space', Tab: 'Tab',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
};
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** A binding's label: "Ctrl+1", "Shift+W", "Alt+3" ("Cmd" and "Option" on a Mac). */
export function keyLabel(b: Binding): string {
  const c = b.code;
  const key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^Numpad\d$/.test(c) ? `Num ${c.slice(6)}` : NAMED[c] ?? c;
  return `${b.mod ? (mac ? 'Cmd+' : 'Ctrl+') : ''}${b.alt ? (mac ? 'Option+' : 'Alt+') : ''}${b.shift ? 'Shift+' : ''}${key}`;
}
