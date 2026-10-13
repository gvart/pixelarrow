/**
 * The platform facade (ADR-0006). main.ts calls selectPlatform() once, before
 * the game starts; from then on `platform` is fixed for the session. Game code
 * talks to the interfaces on `platform` and never reads `platform.id`.
 */
import type { PlatformEnv } from './core/env';
import type { Platform } from './core/platform';
import { createPlatform, detectPlatformId, readLaunchHints } from './detect';

export type * from './core/index';

/** The real browser globals, read when used (tests may define `window` after this module loads). */
function browserEnv(): PlatformEnv {
  const g = globalThis as unknown as Record<string, never>;
  return {
    get window() {
      return g.window;
    },
    get document() {
      return g.document;
    },
    get navigator() {
      return g.navigator;
    },
    get localStorage() {
      try {
        return g.localStorage ?? null;
      } catch {
        return null; // blocked (sandboxed frames, some private modes)
      }
    },
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  };
}

/**
 * The platform of this session. Until selectPlatform() runs (unit tests,
 * tools) it is a Telegram adapter that was never launched: every call is a
 * no-op, as telegram.ts was before initTelegram().
 */
export let platform: Platform = createPlatform('telegram', browserEnv());
let selected = false;

/** Detects the platform from the launch hints and builds its adapter. Once per session; later calls return it. */
export function selectPlatform(): Platform {
  if (selected) return platform;
  selected = true;
  const env = browserEnv();
  platform = createPlatform(detectPlatformId(readLaunchHints(env, { build: import.meta.env.VITE_PLATFORM, dev: !!import.meta.env.DEV })), env);
  return platform;
}

/** Tests install a FakePlatform (tests/fakes/platform.ts) or an adapter with a fake env. */
export function setPlatformForTests(p: Platform): void {
  platform = p;
}
