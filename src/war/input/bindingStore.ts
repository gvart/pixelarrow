/**
 * The war's key bindings on this device (ADR-0012 Decision 2, input-v6.md §5.5): localStorage key `war.bindings`,
 * never synced. Only the differences from the defaults are stored.
 */
import { parse, serialize, type BindingMap } from './bindings';

export const BINDINGS_KEY = 'war.bindings';

/** The player's bindings; the defaults when nothing is stored or storage fails. Never throws. */
export function loadBindings(): BindingMap {
  try {
    return parse(localStorage.getItem(BINDINGS_KEY));
  } catch {
    return parse(null);
  }
}

/** Stores the changes from the defaults; with none, removes the key. */
export function saveBindings(map: BindingMap): void {
  try {
    const json = serialize(map);
    if (json === serialize(parse(null))) localStorage.removeItem(BINDINGS_KEY);
    else localStorage.setItem(BINDINGS_KEY, json);
  } catch {
    /* storage blocked: this page only */
  }
}
