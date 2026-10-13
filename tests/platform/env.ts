/** A fake browser env for the adapter tests: records listeners, history and opened windows. */
import type { PlatformEnv } from '../../src/platform/core/env';

type Cb = (e: Event) => void;

export class FakeTarget {
  readonly listeners = new Map<string, Set<Cb>>();
  addEventListener(type: string, cb: Cb): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: Cb): void {
    this.listeners.get(type)?.delete(cb);
  }
  /** Fires `type`; returns the event so a test can read preventDefault / returnValue. */
  fire(type: string, init: Record<string, unknown> = {}): Event & Record<string, unknown> {
    const e = { type, defaultPrevented: false, returnValue: undefined as unknown, ...init } as unknown as Event & Record<string, unknown>;
    e.preventDefault = () => void ((e as { defaultPrevented: boolean }).defaultPrevented = true);
    for (const cb of [...(this.listeners.get(type) ?? [])]) cb(e);
    return e;
  }
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

export function memoryStore(): Map<string, string> & { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const m = new Map<string, string>() as ReturnType<typeof memoryStore>;
  m.getItem = (k) => m.get(k) ?? null;
  m.setItem = (k, v) => void m.set(k, v);
  m.removeItem = (k) => void m.delete(k);
  return m;
}

export interface FakeEnvOptions {
  hash?: string;
  search?: string;
  /** matchMedia results by query. */
  media?: Record<string, boolean>;
  share?: (d: { url?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText(s: string): Promise<void> } | undefined;
  layout?: Record<string, string>;
  open?: (url: string, target?: string, features?: string) => unknown;
  /** Extra window globals (e.g. a fake Telegram SDK). */
  globals?: Record<string, unknown>;
}

export function fakeEnv(o: FakeEnvOptions = {}) {
  const win = new FakeTarget() as FakeTarget & Record<string, unknown>;
  const doc = new FakeTarget() as FakeTarget & Record<string, unknown>;
  const history: string[] = [];
  const opened: string[] = [];
  const mediaListeners: (() => void)[] = [];
  const timers: { cb: () => void; ms: number; id: number }[] = [];
  let nextId = 1;
  Object.assign(win, {
    location: { hash: o.hash ?? '', search: o.search ?? '' },
    innerWidth: 390,
    innerHeight: 844,
    open: o.open ?? ((url: string) => (opened.push(url), {})),
    matchMedia: (q: string) => ({ matches: !!o.media?.[q], addEventListener: (_: string, cb: () => void) => mediaListeners.push(cb) }),
    history: {
      pushState: () => history.push('push'),
      back: () => {
        history.push('back');
      },
    },
    ...o.globals,
  });
  Object.assign(doc, { visibilityState: 'visible', head: { appendChild: () => undefined } });
  const navigator: Record<string, unknown> = {};
  if (o.share) navigator.share = o.share;
  if ('clipboard' in o) navigator.clipboard = o.clipboard;
  if (o.layout) navigator.keyboard = { getLayoutMap: async () => new Map(Object.entries(o.layout!)) };
  const localStorage = memoryStore();
  const env = {
    window: win,
    document: doc,
    navigator,
    localStorage,
    setTimeout: (cb: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ cb, ms, id });
      return id;
    },
    clearTimeout: (id: unknown) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  return {
    env: env as unknown as PlatformEnv,
    win,
    doc,
    history,
    opened,
    localStorage,
    /** Runs every pending timer once. */
    runTimers: () => timers.splice(0).forEach((t) => t.cb()),
    pendingTimers: () => timers.length,
    mediaChanged: () => mediaListeners.forEach((cb) => cb()),
  };
}
