/**
 * Key bindings on this device (ADR-0012 Decision 2, input-v6.md §5.5):
 * platform.storage.device(), key `input.bindings`, never the campaign save and
 * never synced. Only the differences from the defaults are stored.
 */
import { platform, type KV } from '../../platform';
import { parse, serialize, type BindingMap } from './bindings';

export const BINDINGS_KEY = 'input.bindings';

/** The player's bindings; the defaults when nothing is stored or storage fails. Never throws. */
export async function loadBindings(kv: KV = platform.storage.device()): Promise<BindingMap> {
  try {
    return parse(await kv.get(BINDINGS_KEY));
  } catch {
    return parse(null);
  }
}

/** Stores the changes from the defaults; with none, removes the key. */
export async function saveBindings(map: BindingMap, kv: KV = platform.storage.device()): Promise<void> {
  const json = serialize(map);
  if (json === serialize(parse(null))) await kv.remove(BINDINGS_KEY);
  else await kv.set(BINDINGS_KEY, json);
}
