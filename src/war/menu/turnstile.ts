/**
 * Cloudflare Turnstile for the menu's email forms (ADR-0008 §6; the server checks the token on sign-in, sign-up and
 * reset). The script loads on the first form that asks; the widget runs interaction-only, so most players never see
 * it. A dev build without VITE_TURNSTILE_SITE_KEY uses Cloudflare's always-pass testing key, which a DEV_AUTH server
 * accepts. Copied down from src/platform/web/turnstile.ts (the war does not import the campaign's platform layer).
 */
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TEST_KEY = '1x00000000000000000000AA';

interface Turnstile { render(el: HTMLElement, o: Record<string, unknown>): string | null | undefined; remove(id: string): void }
const api = () => (window as unknown as { turnstile?: Turnstile }).turnstile ?? null;

function siteKey(): string | null {
  const env = import.meta.env as { VITE_TURNSTILE_SITE_KEY?: string; DEV?: boolean };
  const k = env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (k && /^[A-Za-z0-9_-]{10,64}$/.test(k)) return k;
  return env.DEV ? TEST_KEY : null;
}

let loading: Promise<Turnstile | null> | null = null;
function load(): Promise<Turnstile | null> {
  if (api()) return Promise.resolve(api());
  loading ??= new Promise<Turnstile | null>((ok) => {
    const s = document.createElement('script');
    s.async = true;
    s.onload = () => ok(api());
    s.onerror = () => ok(null);
    s.src = SRC;
    document.head.appendChild(s);
  }).then((t) => (t ? t : ((loading = null), null)));
  return loading;
}

/** A fresh token for `action`, the widget drawn into `slot` if it must ask; rejects after 15 s or on failure. */
export async function humanCheck(slot: HTMLElement, action: 'login' | 'signup' | 'reset'): Promise<string> {
  const key = siteKey();
  if (!key) throw new Error('The human check is not set up on this server');
  const t = await load();
  if (!t) throw new Error('The human check could not load; check your connection and try again');
  return new Promise<string>((ok, no) => {
    slot.innerHTML = '';
    const box = document.createElement('div');
    slot.appendChild(box);
    let id: string | null = null;
    const done = (f: () => void) => { clearTimeout(timer); f(); if (id) setTimeout(() => t.remove(id!), 0); };
    const timer = setTimeout(() => done(() => no(new Error('The human check timed out; try again'))), 15_000);
    id = t.render(box, {
      sitekey: key, action, theme: 'dark', size: 'flexible', appearance: 'interaction-only',
      callback: (tok: string) => done(() => ok(tok)),
      'error-callback': () => { done(() => no(new Error('The human check failed; try again'))); return true; },
    }) ?? null;
  });
}
