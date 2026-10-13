/**
 * Key bindings (ADR-0012 Decision 2), all pure. A Binding names a physical key
 * (KeyboardEvent.code), so the same place on the keyboard works on every
 * layout; `mod` is Ctrl or ⌘, so one binding works on every OS.
 *
 * A BindingMap gives every action two slots (primary, secondary). It is the
 * defaults of src/ui/input/actions.ts overlaid with the player's changes, and
 * it never holds a conflict: no key is in two actions whose contexts overlap.
 * Every function returns a new map; the input is never changed.
 */
import { ACTIONS, ACTION_IDS, overlaps, type ActionId, type Context } from './actions';

export interface Binding {
  code: string;
  mod?: true;
  alt?: true;
  shift?: true;
}
export type Slot = 0 | 1;
export type Pair = readonly [Binding | null, Binding | null];
export type BindingMap = Readonly<Record<ActionId, Pair>>;

/** The parts of a keydown that bindings read (DOM names, so a KeyboardEvent fits). */
export interface KeyEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function sameBinding(a: Binding, b: Binding): boolean {
  return a.code === b.code && !!a.mod === !!b.mod && !!a.alt === !!b.alt && !!a.shift === !!b.shift;
}

const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight']);
/** Keys that go back and move focus (§5.4), with any modifiers. */
const RESERVED = new Set(['Escape', 'Tab']);
/** Browser keys a page can't or shouldn't catch, with any modifiers. */
const BROWSER_KEYS = new Set(['F5', 'F11', 'F12']);
/** Ctrl/⌘ + these close, open or reload tabs and windows. */
const BROWSER_MOD = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyH']);

/** Why a key can't be bound (input-v6.md §5.3), or null if it can. */
export function refused(b: Binding): 'reserved' | 'browser' | 'modifier' | null {
  if (MODIFIERS.has(b.code)) return 'modifier';
  if (RESERVED.has(b.code)) return 'reserved';
  if (BROWSER_KEYS.has(b.code)) return 'browser';
  if (b.mod && BROWSER_MOD.has(b.code)) return 'browser';
  if (b.alt && b.code === 'F4') return 'browser';
  return null;
}

function pairOf(defaults: readonly Binding[]): Pair {
  return [defaults[0] ?? null, defaults[1] ?? null];
}

const DEFAULTS: BindingMap = Object.freeze(Object.fromEntries(ACTION_IDS.map((id) => [id, pairOf(ACTIONS[id].defaults)])) as Record<ActionId, Pair>);

export function defaultBindings(): BindingMap {
  return DEFAULTS;
}

export function resetAll(): BindingMap {
  return DEFAULTS;
}

function matches(b: Binding, ev: KeyEvent, exactShift: boolean): boolean {
  if (b.code !== ev.code || !!b.mod !== (ev.ctrlKey || ev.metaKey) || !!b.alt !== ev.altKey) return false;
  return exactShift ? !!b.shift === ev.shiftKey : !b.shift && ev.shiftKey;
}

/**
 * The action a key triggers. `active` lists the active contexts, most specific
 * first (layer, then screen, then global); the first context with a match wins.
 * An exact match wins over one that ignores Shift, so "?" (Shift+/) still finds
 * the "/" binding while Shift+Tab finds focus.prev, not focus.next.
 */
export function resolve(map: BindingMap, ev: KeyEvent, active: readonly Context[]): ActionId | null {
  for (const exact of [true, false])
    for (const c of active)
      for (const id of ACTION_IDS) {
        if (ACTIONS[id].context !== c) continue;
        if (map[id].some((b) => b && matches(b, ev, exact))) return id;
      }
  return null;
}

/** Every other action holding `b` in a context that can be active with `action`'s. */
function conflicts(map: BindingMap, action: ActionId, b: Binding): ActionId[] {
  const ctx = ACTIONS[action].context;
  return ACTION_IDS.filter((id) => id !== action && overlaps(ctx, ACTIONS[id].context) && map[id].some((x) => x && sameBinding(x, b)));
}

/** The action that already holds `b` where `action` would also be live, or null. */
export function conflictsWith(map: BindingMap, action: ActionId, b: Binding): ActionId | null {
  return conflicts(map, action, b)[0] ?? null;
}

function withPair(map: BindingMap, id: ActionId, pair: Pair): BindingMap {
  return { ...map, [id]: pair };
}

function setSlot(pair: Pair, slot: Slot, b: Binding | null): Pair {
  return slot === 0 ? [b, pair[1]] : [pair[0], b];
}

function slotOf(pair: Pair, b: Binding): Slot | -1 {
  return pair[0] && sameBinding(pair[0], b) ? 0 : pair[1] && sameBinding(pair[1], b) ? 1 : -1;
}

/**
 * Bind `b` (or nothing) to a slot of `action` (§5.3). An action that already
 * holds the key gives it up: with 'swap' it takes `action`'s old key in that
 * slot (unless that would clash elsewhere, then it gets none), with 'replace'
 * it is left without. Refused keys, fixed actions and keys held by a fixed
 * action leave the map unchanged (the same object), so check conflictsWith and
 * `rebindable` first to tell the player why.
 */
export function assign(map: BindingMap, action: ActionId, slot: Slot, b: Binding | null, mode: 'swap' | 'replace'): BindingMap {
  if (!ACTIONS[action].rebindable) return map;
  if (!b) return withPair(map, action, setSlot(map[action], slot, null));
  b = normalize(b);
  if (refused(b)) return map;
  const others = conflicts(map, action, b);
  if (others.some((id) => !ACTIONS[id].rebindable)) return map;
  const old = map[action][slot];
  const own = slotOf(map[action], b);
  let pair = setSlot(map[action], slot, b);
  if (own !== -1 && own !== slot) pair = setSlot(pair, own, mode === 'swap' ? old : null);
  let out = withPair(map, action, pair);
  let swapped = mode === 'replace' || own !== -1;
  for (const id of others) {
    const s = slotOf(out[id], b) as Slot;
    out = withPair(out, id, setSlot(out[id], s, null));
    if (!swapped && old && !slotOfAny(out[id], old) && conflicts(out, id, old).length === 0) {
      out = withPair(out, id, setSlot(out[id], s, old));
      swapped = true;
    }
  }
  return out;
}

function slotOfAny(pair: Pair, b: Binding): boolean {
  return slotOf(pair, b) !== -1;
}

/** Back to the defaults for one action; another action holding one of them loses it. */
export function resetAction(map: BindingMap, action: ActionId): BindingMap {
  let out = withPair(map, action, DEFAULTS[action]);
  for (const b of DEFAULTS[action]) {
    if (!b) continue;
    for (const id of conflicts(out, action, b)) out = withPair(out, id, setSlot(out[id], slotOf(out[id], b) as Slot, null));
  }
  return out;
}

const VERSION = 1;

function samePair(a: Pair, b: Pair): boolean {
  return [0, 1].every((i) => (a[i] && b[i] ? sameBinding(a[i]!, b[i]!) : a[i] === b[i]));
}

/** A binding with only the flags that are set (stable JSON, sameBinding-equal). */
function normalize(b: Binding): Binding {
  const out: Binding = { code: b.code };
  if (b.mod) out.mod = true;
  if (b.alt) out.alt = true;
  if (b.shift) out.shift = true;
  return out;
}

/** The storage JSON (ADR-0012 Decision 2): `{ v: 1, o: { [ActionId]: [Binding | null, Binding | null] } }`, changed actions only. */
export function serialize(map: BindingMap): string {
  const o: Record<string, Pair> = {};
  for (const id of ACTION_IDS) if (!samePair(map[id], DEFAULTS[id])) o[id] = map[id];
  return JSON.stringify({ v: VERSION, o });
}

const CODE = /^[A-Za-z0-9]{1,32}$/;
const FLAGS = ['mod', 'alt', 'shift'] as const;

function readBinding(x: unknown): Binding | null | undefined {
  if (x === null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) return undefined;
  const r = x as Record<string, unknown>;
  if (typeof r.code !== 'string' || !CODE.test(r.code)) return undefined;
  if (FLAGS.some((f) => r[f] !== undefined && r[f] !== true)) return undefined;
  const b = normalize(r as unknown as Binding);
  return refused(b) ? undefined : b;
}

function readPair(x: unknown): Pair | undefined {
  if (!Array.isArray(x) || x.length !== 2) return undefined;
  const a = readBinding(x[0]);
  const b = readBinding(x[1]);
  if (a === undefined || b === undefined || (a && b && sameBinding(a, b))) return undefined;
  return [a, b];
}

/**
 * The stored overrides over the defaults. Never throws: bad JSON, another
 * version, unknown or fixed actions, malformed or refused keys are dropped, and
 * so is any override that conflicts with the rest (a default changed since it
 * was saved): that action falls back to its default (§5.5).
 */
export function parse(json: string | null): BindingMap {
  let data: unknown;
  try {
    data = json ? JSON.parse(json) : null;
  } catch {
    return DEFAULTS;
  }
  if (!data || typeof data !== 'object') return DEFAULTS;
  const { v, o } = data as { v?: unknown; o?: unknown };
  if (v !== VERSION || !o || typeof o !== 'object' || Array.isArray(o)) return DEFAULTS;
  const stored = o as Record<string, unknown>;
  const overridden = new Set<ActionId>();
  let map: Record<ActionId, Pair> = { ...DEFAULTS };
  for (const id of ACTION_IDS) {
    if (!(id in stored) || !ACTIONS[id].rebindable) continue;
    const pair = readPair(stored[id]);
    if (!pair) continue;
    map[id] = pair;
    overridden.add(id);
  }
  // Drop overrides until nothing conflicts; the later action in table order yields.
  for (let clash = firstClash(map, overridden); clash; clash = firstClash(map, overridden)) {
    map = { ...map, [clash]: DEFAULTS[clash] };
    overridden.delete(clash);
  }
  return map;
}

/** The overridden action to drop for the first conflict in table order, or null if none. */
function firstClash(map: BindingMap, overridden: ReadonlySet<ActionId>): ActionId | null {
  for (let i = 0; i < ACTION_IDS.length; i++)
    for (let j = i + 1; j < ACTION_IDS.length; j++) {
      const a = ACTION_IDS[i];
      const b = ACTION_IDS[j];
      if (!overlaps(ACTIONS[a].context, ACTIONS[b].context)) continue;
      if (!map[a].some((x) => x && slotOfAny(map[b], x))) continue;
      if (overridden.has(b)) return b;
      if (overridden.has(a)) return a;
    }
  return null;
}
