/**
 * Browser pieces every browser-hosted adapter shares (the web adapter, and the
 * Telegram adapter, whose Mini App is a web page too).
 */
import type { PlatformEnv } from '../core/env';
import type { InputHints } from '../core/input';
import type { KV } from '../core/storage';

const PREFIX = 'pixelarrow:';

/** Where a web invite opens the game. */
export const PLAY_URL = 'https://play.pixelarrow.app/';

/** localStorage under the game's prefix; a missing or throwing store reads null and drops writes. */
export function localKV(env: PlatformEnv): KV {
  const ls = (): PlatformEnv['localStorage'] => {
    try {
      return env.localStorage;
    } catch {
      return null;
    }
  };
  return {
    async get(k) {
      try {
        return ls()?.getItem(PREFIX + k) ?? null;
      } catch {
        return null;
      }
    },
    async set(k, v) {
      try {
        ls()?.setItem(PREFIX + k, v);
      } catch {
        /* quota / private mode */
      }
    },
    async remove(k) {
      try {
        ls()?.removeItem(PREFIX + k);
      } catch {
        /* ignore */
      }
    },
  };
}

/** `?startapp=` (bot /start buttons, browsers) or `?tgWebAppStartParam=` of the page URL. */
export function queryLaunchParam(env: PlatformEnv): string | null {
  try {
    const q = new URLSearchParams(env.window?.location.search ?? '');
    return q.get('startapp') || q.get('tgWebAppStartParam') || null;
  } catch {
    return null;
  }
}

/** Copies text; false when there is no clipboard or it refuses. */
export async function copyText(env: PlatformEnv, text: string): Promise<boolean> {
  try {
    if (!env.navigator?.clipboard) return false;
    await env.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** window.open in a new tab; false when nothing opened. */
export function openTab(env: PlatformEnv, url: string, features?: string): boolean {
  try {
    return !!env.window?.open?.(url, '_blank', features);
  } catch {
    return false;
  }
}

const FINE = '(any-pointer: fine)';
const APPLE = /mac|iphone|ipad|ipod/i;

/** ⌘ on Apple devices, Ctrl elsewhere, from navigator.userAgentData or navigator.platform. */
export function browserCommandKey(env: PlatformEnv): 'ctrl' | 'meta' {
  const os = env.navigator?.userAgentData?.platform || env.navigator?.platform || '';
  return APPLE.test(os) ? 'meta' : 'ctrl';
}
const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Input hints from the browser: a fine pointer by media query, a keyboard when
 * `keyboardLikely()` says so or once a key is pressed outside a text field.
 * `listen()` wires the events (the adapter's init()).
 */
export function browserInputHints(env: PlatformEnv, keyboardLikely: () => boolean, commandKey: () => 'ctrl' | 'meta' = () => browserCommandKey(env)): InputHints & { listen(): void } {
  const subs = new Set<() => void>();
  let typed = false;
  const changed = (): void => subs.forEach((cb) => cb());
  const query = () => env.window?.matchMedia?.(FINE);
  return {
    keyboard: () => typed || keyboardLikely(),
    finePointer: () => !!query()?.matches,
    commandKey,
    onChange(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    async keyLabels() {
      try {
        const map = await env.navigator?.keyboard?.getLayoutMap();
        if (!map) return null;
        const out = new Map<string, string>();
        map.forEach((label, code) => out.set(code, label));
        return out;
      } catch {
        return null;
      }
    },
    listen() {
      const onKey = (e: Event): void => {
        const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
        if (typed || (t && (EDITABLE.has(t.tagName ?? '') || t.isContentEditable))) return;
        typed = true;
        env.window?.removeEventListener('keydown', onKey, true);
        changed();
      };
      env.window?.addEventListener('keydown', onKey, true);
      query()?.addEventListener?.('change', changed);
    },
  };
}
