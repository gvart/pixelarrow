/**
 * The web adapter's human check (V6-ACCT-05, ADR-0008 §6, accounts-v6.md §1.3): Cloudflare Turnstile,
 * loaded only when a form mounts it, rendered managed + interaction-only, one token per submit.
 */
import { describe, expect, it } from 'vitest';
import type { HumanCheckState } from '../../src/platform/core/auth';
import { createTurnstile, TURNSTILE_SRC, TURNSTILE_TEST_SITE_KEY, turnstileOptions } from '../../src/platform/web/turnstile';
import { createWebPlatform } from '../../src/platform/web/index';
import { fakeEnv } from './env';

type Opts = Record<string, unknown> & { callback?: (t: string) => void };

/** A fake `window.turnstile`: records renders, lets a test fire the widget's callbacks. */
function fakeTurnstile() {
  const renders: { el: unknown; o: Opts; id: string }[] = [];
  const resets: string[] = [];
  const removed: string[] = [];
  return {
    renders,
    resets,
    removed,
    api: {
      render(el: unknown, o: Opts) {
        const id = `w${renders.length}`;
        renders.push({ el, o, id });
        return id;
      },
      reset: (id: string) => void resets.push(id),
      remove: (id: string) => void removed.push(id),
    },
    fire(name: string, arg?: unknown) {
      const cb = renders[renders.length - 1].o[name] as ((a?: unknown) => void) | undefined;
      cb?.(arg);
    },
  };
}

/** A fake env whose document records the scripts it is asked to load. */
function envWithScripts(globals: Record<string, unknown> = {}) {
  const f = fakeEnv({ globals });
  const scripts: { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  Object.assign(f.doc, {
    createElement: () => {
      const s = { src: '', async: false, onload: null, onerror: null };
      scripts.push(s);
      return s;
    },
  });
  return { ...f, scripts };
}

const slot = {} as HTMLElement;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('web human check (Turnstile)', () => {
  it('loads the script only when a form mounts it, once, then renders managed and interaction-only', async () => {
    const ts = fakeTurnstile();
    const f = envWithScripts();
    const check = createTurnstile(f.env, '1x00000000000000000000AA');
    expect(f.scripts).toEqual([]);
    const states: HumanCheckState[] = [];
    check.mount(slot, { action: 'login', lang: 'ru', onState: (s) => states.push(s) });
    check.mount(slot, { action: 'signup', lang: 'en' });
    expect(f.scripts).toHaveLength(1);
    expect(f.scripts[0].src).toBe(TURNSTILE_SRC);
    expect(TURNSTILE_SRC).toMatch(/^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/);
    (f.win as unknown as Record<string, unknown>).turnstile = ts.api;
    f.scripts[0].onload!();
    await flush();
    expect(ts.renders).toHaveLength(2);
    expect(ts.renders[0].el).toBe(slot);
    expect(ts.renders[0].o).toMatchObject({ sitekey: '1x00000000000000000000AA', action: 'login', appearance: 'interaction-only', size: 'flexible', theme: 'dark', language: 'ru', 'refresh-expired': 'auto' });
    expect(states).toEqual(['loading']);
  });

  it('hands each token out once, then asks the widget for a fresh one', async () => {
    const ts = fakeTurnstile();
    const check = createTurnstile(envWithScripts({ turnstile: ts.api }).env, 'key-0000000000');
    const states: HumanCheckState[] = [];
    const w = check.mount(slot, { action: 'login', lang: 'en', onState: (s) => states.push(s) });
    await flush();
    ts.fire('callback', 'tok-1');
    expect(states).toEqual(['loading', 'ready']);
    expect(await w.token()).toBe('tok-1');
    expect(ts.resets).toEqual(['w0']);
    // the next submit waits for the new token
    const next = w.token();
    ts.fire('callback', 'tok-2');
    expect(await next).toBe('tok-2');
  });

  it('reports a challenge, a failure and an expired token; token() rejects on failure and on timeout', async () => {
    const ts = fakeTurnstile();
    const f = envWithScripts({ turnstile: ts.api });
    const check = createTurnstile(f.env, 'key-0000000000');
    const states: HumanCheckState[] = [];
    const w = check.mount(slot, { action: 'signup', lang: 'en', onState: (s) => states.push(s) });
    await flush();
    ts.fire('before-interactive-callback');
    expect(states.at(-1)).toBe('interactive');
    const waiting = w.token();
    ts.fire('error-callback', '110200');
    await expect(waiting).rejects.toThrow('failed');
    expect(states.at(-1)).toBe('failed');
    ts.fire('callback', 'tok');
    ts.fire('expired-callback');
    const late = w.token(10_000);
    f.runTimers();
    await expect(late).rejects.toThrow('timeout');
    w.remove();
    expect(ts.removed).toEqual(['w0']);
  });

  it('a script that does not load, or a build without a site key, is load_failed; a later mount tries the script again', async () => {
    const f = envWithScripts();
    const check = createTurnstile(f.env, 'key-0000000000');
    const states: HumanCheckState[] = [];
    const w = check.mount(slot, { action: 'reset', lang: 'en', onState: (s) => states.push(s) });
    f.scripts[0].onerror!();
    await flush();
    expect(states).toEqual(['loading', 'load_failed']);
    await expect(w.token()).rejects.toThrow('load_failed');
    check.mount(slot, { action: 'reset', lang: 'en' });
    expect(f.scripts).toHaveLength(2);

    const none = createTurnstile(envWithScripts().env, null);
    const s2: HumanCheckState[] = [];
    await expect(none.mount(slot, { action: 'login', lang: 'en', onState: (s) => s2.push(s) }).token()).rejects.toThrow('load_failed');
    expect(s2).toEqual(['load_failed']);
  });

  it('the site key comes from the build (VITE_TURNSTILE_SITE_KEY); a dev build falls back to the published testing key', () => {
    expect(turnstileOptions({ VITE_TURNSTILE_SITE_KEY: ' 0x4AAAAAAAabcdefGHIJ ' })).toEqual({ turnstileSiteKey: '0x4AAAAAAAabcdefGHIJ' });
    expect(turnstileOptions({ DEV: true })).toEqual({ turnstileSiteKey: TURNSTILE_TEST_SITE_KEY });
    expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(turnstileOptions({})).toEqual({});
    expect(turnstileOptions({ VITE_TURNSTILE_SITE_KEY: '<script>' })).toEqual({});
  });

  it('the web adapter mounts with its site key', async () => {
    const ts = fakeTurnstile();
    const p = createWebPlatform(envWithScripts({ turnstile: ts.api }).env, { turnstileSiteKey: 'site-key-123456' });
    p.auth.humanCheck!.mount(slot, { action: 'resend', lang: 'en' });
    await flush();
    expect(ts.renders[0].o).toMatchObject({ sitekey: 'site-key-123456', action: 'resend' });
  });
});
