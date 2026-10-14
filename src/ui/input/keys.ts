/**
 * The KeyRouter (ADR-0012 Decision 3): turns a key event into an action of the
 * active contexts and calls the handlers registered for it. Pure: no DOM and no
 * Phaser (src/ui/input/keySource.ts feeds it from the one window listener).
 *
 * - press actions fire once per key down (auto-repeat is ignored), repeat
 *   actions also on the OS auto-repeat, hold actions fire on the first down and
 *   stay held until the key comes up or the window loses focus;
 * - events from a text field or an IME composition are ignored entirely;
 * - a key is "handled" (the caller then calls preventDefault) only when one of
 *   its action's handlers took it; a handler returning false passes it on to
 *   the one registered before it (the battle's Esc opens its menu only in field
 *   mode, else the global Back runs);
 * - the `capture` context (a rebinding capture) suspends every action.
 */
import { ACTIONS, type ActionId, type Context } from './actions';
import { defaultBindings, resolve, type BindingMap, type KeyEvent } from './bindings';

/** A key event as the router sees it: the binding fields plus what keySource reads off the DOM event. */
export interface KeyInput extends KeyEvent {
  repeat: boolean;
  /** The target is an input, textarea, select or contenteditable. */
  editable: boolean;
  /** Part of an IME composition (isComposing, keyCode 229). */
  composing: boolean;
}

/** A handler; returning false means "not mine now", and the key goes to the handler registered before it. */
export type KeyHandler = () => unknown;

/** What owns a registration: a Phaser scene's `events` (removed on shutdown). */
export interface KeyOwner {
  once(ev: 'shutdown', fn: () => void): unknown;
}

export class KeyRouter {
  private map: BindingMap;
  private active: readonly Context[] = ['global'];
  private readonly handlers = new Map<ActionId, KeyHandler[]>();
  /** Handlers tried before every other one of their action (the focus manager's Esc leaves HUD focus before the battle's Esc opens its menu). */
  private readonly firsts = new Map<ActionId, KeyHandler[]>();
  /** Held hold-actions by the physical key holding them (a key comes up under the code it went down with). */
  private readonly holds = new Map<string, ActionId>();
  /** A rebinding capture (the Controls page): sees every key down first. */
  private catcher: ((ev: KeyInput) => boolean) | null = null;

  constructor(map: BindingMap = defaultBindings()) {
    this.map = map;
  }

  /** The bindings keys resolve with now (the Controls page edits from these). */
  get bindings(): BindingMap {
    return this.map;
  }

  /**
   * A rebinding capture (input-v6.md §5.3): `fn` sees every key down before any action (text fields
   * and IME input aside) and returns true when it took the key, false to let the router handle it
   * (Tab still moves focus). One at a time; the returned function ends it.
   */
  capture(fn: (ev: KeyInput) => boolean): () => void {
    this.catcher = fn;
    this.clear();
    return () => {
      if (this.catcher === fn) this.catcher = null;
    };
  }

  setBindings(map: BindingMap): void {
    this.map = map;
    this.clear();
  }

  /** The active contexts, most specific first (layer, then screen, then global). */
  setContexts(stack: readonly Context[]): void {
    this.active = stack;
    // a held key whose action is no longer live lets go (a sheet opened over a pan)
    for (const [code, id] of this.holds) if (!stack.includes(ACTIONS[id].context)) this.holds.delete(code);
  }

  /** Register `fn` for `action`; removed when `owner` shuts down, or by the returned function. `first`: tried before the others. */
  on(action: ActionId, fn: KeyHandler, owner?: KeyOwner, opts?: { first?: boolean }): () => void {
    const map = opts?.first ? this.firsts : this.handlers;
    const list = map.get(action) ?? [];
    list.push(fn);
    map.set(action, list);
    const off = (): void => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
    owner?.once('shutdown', off);
    return off;
  }

  /** A key went down. True: the router handled it (the caller calls preventDefault). */
  down(ev: KeyInput): boolean {
    if (ev.editable || ev.composing || this.active.includes('capture')) return false;
    if (this.catcher?.(ev)) return true;
    const id = resolve(this.map, ev, this.active);
    if (!id) return false;
    const list = [...(this.handlers.get(id) ?? []), ...(this.firsts.get(id) ?? [])];
    if (!list.length) return false;
    const kind = ACTIONS[id].kind;
    if (ev.repeat && kind !== 'repeat') return true;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]() === false) continue;
      if (kind === 'hold') this.holds.set(ev.code, id);
      return true;
    }
    return false;
  }

  /** A key came up: a hold action it held lets go. */
  up(ev: Pick<KeyInput, 'code'>): void {
    this.holds.delete(ev.code);
  }

  /** A hold action is down now. */
  held(action: ActionId): boolean {
    for (const id of this.holds.values()) if (id === action) return true;
    return false;
  }

  /** The window lost focus: nothing stays held. */
  clear(): void {
    this.holds.clear();
  }
}

/**
 * The active contexts, most specific first: `focus` while a control has keyboard focus (so the
 * arrows, Enter and Space act on it before the battle's pan, FIGHT and pause, V6-052), the top
 * screen's own (none while a layer is open over it: a sheet, menu or dialog suspends the screen's
 * keys, input-v6.md §3.1), then `menu` and `global`.
 */
export function activeContexts(screen: readonly Context[] | null, layers: number, focused = false): Context[] {
  return [...(focused ? (['focus'] as const) : []), ...(layers > 0 || !screen ? [] : screen), 'menu', 'global'];
}

/** The game's router (keySource.ts installs the window listener that feeds it). */
export const keys = new KeyRouter();

const screens = new WeakMap<object, () => readonly Context[]>();

/** A screen's own contexts while it is on top (the battle: its phase and the camera). `owner` is what it registered with the NavStack. */
export function screenKeys(owner: object, contexts: () => readonly Context[]): void {
  screens.set(owner, contexts);
}

/** The contexts `owner` declared, or null. */
export function screenContexts(owner: object | null): readonly Context[] | null {
  return owner ? (screens.get(owner)?.() ?? null) : null;
}
