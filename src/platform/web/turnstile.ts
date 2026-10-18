/**
 * The web adapter's human check: Cloudflare Turnstile (ADR-0008 §6, accounts-v6.md §1.3).
 * The script loads only when a form mounts the widget (sign-up, log-in, reset, resend), once
 * per page; the widget runs managed and interaction-only, so most players never see it.
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */
import type { HumanCheck, HumanCheckFailure, HumanCheckState, HumanCheckWidget } from '../core/auth';
import type { PlatformEnv } from '../core/env';

export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Cloudflare's published always-pass testing site key (local and CI only; the server counts its tokens only with DEV_AUTH=1). */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
/** How long Submit waits for a token before it gives up (accounts-v6.md §1.3: at most 10 s). */
const TOKEN_WAIT_MS = 10_000;

/** The part of `window.turnstile` the widget uses. */
interface TurnstileApi {
  render(el: HTMLElement, o: Record<string, unknown>): string | undefined | null;
  reset(id: string): void;
  remove(id: string): void;
}

/**
 * The site key from the build env (VITE_TURNSTILE_SITE_KEY, a public value the deploy workflow fills
 * from a repo variable); a dev build without one uses the testing key. A malformed value is ignored.
 */
export function turnstileOptions(env: { VITE_TURNSTILE_SITE_KEY?: string; DEV?: boolean }): { turnstileSiteKey?: string } {
  const key = env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (key && /^[A-Za-z0-9_-]{10,64}$/.test(key)) return { turnstileSiteKey: key };
  return env.DEV ? { turnstileSiteKey: TURNSTILE_TEST_SITE_KEY } : {};
}

const fail = (why: HumanCheckFailure) => new Error(why);

export function createTurnstile(env: PlatformEnv, siteKey: string | null | undefined): HumanCheck {
  let loading: Promise<TurnstileApi | null> | null = null;
  const api = (): TurnstileApi | null => ((env.window as unknown as { turnstile?: TurnstileApi } | undefined)?.turnstile ?? null);

  /** The script, loaded once; a failed load is forgotten so the next form tries again (the Retry link). */
  const load = (): Promise<TurnstileApi | null> => {
    if (api()) return Promise.resolve(api());
    loading ??= new Promise<TurnstileApi | null>((resolve) => {
      const doc = env.document;
      const s = doc?.createElement?.('script');
      if (!doc?.head || !s) return resolve(null);
      s.async = true;
      s.onload = () => resolve(api());
      s.onerror = () => resolve(null);
      s.src = TURNSTILE_SRC;
      doc.head.appendChild(s);
    }).then((t) => {
      if (!t) loading = null;
      return t;
    });
    return loading;
  };

  return {
    mount(slot, o): HumanCheckWidget {
      let state: HumanCheckState = 'loading';
      let token: string | null = null;
      let id: string | null = null;
      let ts: TurnstileApi | null = null;
      let gone = false;
      const waiters = new Set<{ ok: (t: string) => void; no: (e: Error) => void }>();
      const set = (s: HumanCheckState): void => {
        state = s;
        o.onState?.(s);
      };
      const settle = (t: string | null, why?: HumanCheckFailure): void => {
        for (const w of [...waiters]) {
          waiters.delete(w);
          if (t) w.ok(take());
          else w.no(fail(why ?? 'failed'));
        }
      };
      /** The waiting token, handed out once; the widget is reset so a retry gets a fresh one. */
      const take = (): string => {
        const t = token!;
        token = null;
        if (ts && id) ts.reset(id);
        return t;
      };

      if (!siteKey) set('load_failed');
      else set('loading');
      if (siteKey)
        void load().then((t) => {
          if (gone) return;
          if (!t) return (set('load_failed'), settle(null, 'load_failed'));
          ts = t;
          id =
            t.render(slot, {
              sitekey: siteKey,
              action: o.action,
              theme: 'dark',
              size: 'flexible',
              appearance: 'interaction-only',
              language: o.lang,
              'refresh-expired': 'auto',
              callback: (tok: string) => {
                token = tok;
                set('ready');
                settle(tok);
              },
              'before-interactive-callback': () => set('interactive'),
              'error-callback': () => {
                token = null;
                set('failed');
                settle(null, 'failed');
                return true; // handled: no console error from the widget
              },
              'timeout-callback': () => {
                token = null;
                set('failed');
              },
              'expired-callback': () => {
                token = null;
              },
            }) ?? null;
        });

      return {
        token(timeoutMs = TOKEN_WAIT_MS) {
          if (state === 'load_failed') return Promise.reject(fail('load_failed'));
          if (token) return Promise.resolve(take());
          return new Promise<string>((ok, no) => {
            const w = {
              ok: (t: string) => (env.clearTimeout(timer), ok(t)),
              no: (e: Error) => (env.clearTimeout(timer), no(e)),
            };
            const timer = env.setTimeout(() => {
              waiters.delete(w);
              no(fail('timeout'));
            }, timeoutMs);
            waiters.add(w);
          });
        },
        reset() {
          token = null;
          if (ts && id) ts.reset(id);
          if (state !== 'load_failed') set('loading');
        },
        remove() {
          gone = true;
          settle(null, 'failed');
          if (ts && id) ts.remove(id);
          id = null;
        },
      };
    },
  };
}
