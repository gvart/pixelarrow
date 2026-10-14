/** Key/value storage through the platform (ADR-0006 M4), plus the raw localStorage some device-only data still uses. */
import type { KV } from './core/storage';
import { platform } from './index';

/** The browser's localStorage, or null where it is missing or blocked (private mode, sandboxed frames, tests). */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Where the save lives: Telegram CloudStorage with a localStorage mirror, or localStorage. */
export function gameKV(): KV {
  return platform.storage.save();
}

/**
 * This device's store, read through the platform at each call (the platform is
 * chosen after modules load, so a KV built at import time would be the wrong one).
 */
export const deviceKV: KV = {
  get: (k) => platform.storage.device().get(k),
  set: (k, v) => platform.storage.device().set(k, v),
  remove: (k) => platform.storage.device().remove(k),
};
